import { AccessPolicy } from './access-policy.js';
import { receiptPayloadHash } from './signing.js';
import {
    COMPILER_VERSION,
    normalizeContextRequest,
    PURPOSE_TYPE_AFFINITY,
} from './context-request.js';
import {
    contextBlockHash,
    memoryContentHash,
    SENSITIVITY_LEVELS,
    SOURCE_TRUST_LEVELS,
} from './schema.js';
import { clamp, renderMemory, trustRank } from './store.js';

/**
 * The Context Compiler — turns a Context Request into an exact, bounded,
 * explainable Context Package.
 *
 * Pipeline: request → policy envelope → candidate discovery → policy
 * partition → temporal resolution → conflict detection → ranking →
 * redundancy control → budget packing → render → receipt.
 *
 * Two invariants hold everywhere: a request can only narrow the configured
 * requester envelope, and memory content is data — never policy.
 */
export class ContextCompiler {
    constructor(store, options = {}) {
        this.store = store;
        this.policy = options.policy || null;
    }

    compile(input, options = {}) {
        return this._compile(input, options, (query, params) => this.store.search(query, params));
    }

    compileAsync(input, options = {}) {
        return this._compileAsync(input, options);
    }

    _compile(input, options, searchFn) {
        const request = normalizeContextRequest(input);
        const envelope = this._resolveEnvelope(request, options);
        const diagnostics = options.diagnostics === true;
        const discovered = this._discover(request, envelope, searchFn);
        const deniedProbe = diagnostics
            ? this._probeDenied(request, envelope, searchFn)
            : [];
        return this._package(request, envelope, discovered, options, {
            diagnostics,
            deniedProbe,
        });
    }

    async _compileAsync(input, options) {
        const request = normalizeContextRequest(input);
        const envelope = this._resolveEnvelope(request, options);
        const diagnostics = options.diagnostics === true;
        const discovered = await this._discoverAsync(request, envelope);
        const deniedProbe = diagnostics
            ? await this._probeDeniedAsync(request, envelope)
            : [];
        return this._package(request, envelope, discovered, options, {
            diagnostics,
            deniedProbe,
        });
    }

    /**
     * The effective read envelope: the configured policy clamped further by
     * the request. Requests can only narrow — never widen — the envelope.
     * `options.envelope` is an escape hatch for the legacy buildContext path
     * where the caller supplied raw filters rather than a client policy.
     */
    _resolveEnvelope(request, options) {
        if (options.envelope) {
            // Raw envelopes narrow the same way policies do: request filters
            // clamp down the supplied envelope, never widen it.
            const ceilingSensitivity = options.envelope.maxSensitivity || 'restricted';
            const maxSensitivity =
                SENSITIVITY_LEVELS[
                    Math.min(
                        SENSITIVITY_LEVELS.indexOf(request.maxSensitivity || ceilingSensitivity),
                        SENSITIVITY_LEVELS.indexOf(ceilingSensitivity),
                    )
                ];
            const floor = trustRank(options.envelope.minSourceTrust || 'untrusted');
            const requestedTrust = request.minSourceTrust ? trustRank(request.minSourceTrust) : -1;
            const minSourceTrust = SOURCE_TRUST_LEVELS[Math.max(floor, requestedTrust)];
            const clampUnit = (unit) => {
                const ceiling = options.envelope.budget?.[unit];
                const requested = request.budget?.[unit];
                if (ceiling === undefined) return requested;
                return requested === undefined ? ceiling : Math.min(requested, ceiling);
            };
            return {
                requester: {
                    clientId: options.envelope.clientId || 'local',
                    agent: request.agent,
                },
                allowedScopes: options.envelope.allowedScopes,
                deniedScopes: options.envelope.deniedScopes,
                maxSensitivity,
                minSourceTrust,
                budget: {
                    maxChars: clampUnit('maxChars'),
                    maxTokens: clampUnit('maxTokens'),
                    maxItems: clampUnit('maxItems'),
                },
                droppedScopes: [],
            };
        }
        const policy = options.policy || this.policy || new AccessPolicy();
        policy.require('read');
        const read = policy.readOptions({
            scope: request.scope,
            maxSensitivity: request.maxSensitivity || undefined,
            minSourceTrust: request.minSourceTrust || undefined,
        });
        // Requested scope roots narrow the policy roots; roots outside the
        // policy are dropped (filtered context) and reported on the receipt.
        let allowedScopes = read.allowedScopes;
        let droppedScopes = [];
        if (request.scopes) {
            const allowed = request.scopes.filter((root) => policy.contains(root));
            droppedScopes = request.scopes.filter((root) => !policy.contains(root));
            allowedScopes = allowed;
        }
        const budget = policy.clampBudget(request.budget);
        return {
            requester: { clientId: policy.clientId, label: policy.label, agent: request.agent },
            allowedScopes,
            deniedScopes: read.deniedScopes,
            maxSensitivity: read.maxSensitivity,
            minSourceTrust: read.minSourceTrust,
            budget,
            droppedScopes,
        };
    }

    /**
     * Candidate discovery runs INSIDE the policy clamps: the requester
     * envelope (allowed/denied scope roots, sensitivity ceiling, trust floor)
     * is pushed into the retrieval query itself, so policy-denied records
     * never consume the bounded candidate window and can never starve allowed
     * results out of the top-k. Temporal filters stay deferred — the pipeline
     * classifies validity itself so stale/superseded candidates are
     * explainable.
     */
    _discoveryOptions(request, envelope) {
        const maxItems = envelope.budget.maxItems ?? 12;
        return {
            scope: request.scope || undefined,
            type: request.type || undefined,
            retrieval: request.retrieval,
            anyTime: true,
            allowedScopes: envelope.allowedScopes ?? undefined,
            deniedScopes: envelope.deniedScopes ?? undefined,
            maxSensitivity: envelope.maxSensitivity,
            minSourceTrust: envelope.minSourceTrust ?? undefined,
            limit: clamp(Math.max(maxItems * 8, 50), 50, 100),
        };
    }

    _discover(request, envelope, searchFn) {
        const params = this._discoveryOptions(request, envelope);
        if (!request.query) {
            return this.store.list(params);
        }
        return searchFn(request.query, params);
    }

    async _discoverAsync(request, envelope) {
        const params = this._discoveryOptions(request, envelope);
        if (!request.query) {
            return this.store.list(params);
        }
        return this.store.searchAsync(request.query, params);
    }

    /**
     * Owner-diagnostics probe: re-run discovery WITHOUT the policy clamps so
     * an owner-authorized receipt can enumerate what the firewall denied
     * (id + contentHash + reason only — never content). This second pass runs
     * only when `options.diagnostics` is set by the embedding host (CLI,
     * dashboard, evaluator) — it is never reachable from request fields, so a
     * client cannot self-enable it.
     */
    _deniedProbeOptions(request, envelope) {
        const maxItems = envelope.budget.maxItems ?? 12;
        return {
            scope: request.scope || undefined,
            type: request.type || undefined,
            retrieval: request.retrieval,
            anyTime: true,
            maxSensitivity: 'restricted',
            limit: clamp(Math.max(maxItems * 8, 50), 50, 100),
        };
    }

    _probeDenied(request, envelope, searchFn) {
        const params = this._deniedProbeOptions(request, envelope);
        const rows = !request.query ? this.store.list(params) : searchFn(request.query, params);
        return rows
            .map((memory) => ({ memory, reason: this._policyVerdict(memory, envelope) }))
            .filter((item) => item.reason);
    }

    async _probeDeniedAsync(request, envelope) {
        const params = this._deniedProbeOptions(request, envelope);
        const rows = !request.query
            ? this.store.list(params)
            : await this.store.searchAsync(request.query, params);
        return rows
            .map((memory) => ({ memory, reason: this._policyVerdict(memory, envelope) }))
            .filter((item) => item.reason);
    }

    /** Deny reason for a candidate under the envelope, or null when allowed. */
    _policyVerdict(memory, envelope) {
        const scopeAllowed =
            envelope.allowedScopes === undefined ||
            envelope.allowedScopes === null ||
            envelope.allowedScopes.some(
                (root) => memory.scope === root || memory.scope.startsWith(`${root}/`),
            );
        const scopeDenied = (envelope.deniedScopes || []).some(
            (root) => memory.scope === root || memory.scope.startsWith(`${root}/`),
        );
        if (scopeDenied || !scopeAllowed) return 'policy-scope';
        if (
            SENSITIVITY_LEVELS.indexOf(memory.sensitivity) >
            SENSITIVITY_LEVELS.indexOf(envelope.maxSensitivity)
        )
            return 'policy-sensitivity';
        if (trustRank(memory.sourceTrust) < trustRank(envelope.minSourceTrust)) {
            return 'policy-trust';
        }
        return null;
    }

    /** Temporal classification at `asOf` — current/expired/not-yet-valid/superseded. */
    _temporalStatus(memory, asOfMs, superseded) {
        if (superseded.has(memory.id)) return 'superseded';
        if (memory.validFrom && Date.parse(memory.validFrom) > asOfMs) return 'not-yet-valid';
        if (memory.validTo && Date.parse(memory.validTo) < asOfMs) return 'expired';
        return 'current';
    }

    /** Deterministic conflict + redundancy signals inside the eligible set. */
    _relationships(eligible) {
        const byId = new Map(eligible.map((memory) => [memory.id, memory]));
        const conflicts = [];
        const seen = new Set();
        const push = (kind, left, right, note) => {
            const key = `${kind}:${[left.id, right.id].sort().join(':')}`;
            if (seen.has(key)) return;
            seen.add(key);
            conflicts.push({ class: kind, ids: [left.id, right.id], note });
        };
        for (const memory of eligible) {
            for (const edge of this.store.edges(memory.id, { direction: 'both' })) {
                const other =
                    edge.subject === memory.id ? byId.get(edge.object) : byId.get(edge.subject);
                if (!other || other.id === memory.id) continue;
                if (edge.predicate === 'contradicts') {
                    push('declared-contradiction', memory, other, 'contradicts edge');
                }
                if (edge.predicate === 'supersedes') {
                    push('supersession', memory, other, 'explicit supersession');
                }
            }
        }
        // Same-slot heuristic: same type + leaf scope, overlapping validity,
        // divergent content — surfaced as uncertainty, never auto-resolved.
        const groups = new Map();
        for (const memory of eligible) {
            if (!['fact', 'preference', 'decision'].includes(memory.type)) continue;
            const key = `${memory.type}|${memory.scope}`;
            const list = groups.get(key) || [];
            list.push(memory);
            groups.set(key, list);
        }
        for (const group of groups.values()) {
            for (let index = 0; index < group.length; index += 1) {
                for (let peer = index + 1; peer < group.length; peer += 1) {
                    const left = group[index];
                    const right = group[peer];
                    if (left.contentHash === right.contentHash) continue;
                    const overlap = tokenOverlap(left.content, right.content);
                    if (overlap >= 0.5) {
                        push(
                            'overlapping-claim',
                            left,
                            right,
                            `same ${left.type} slot, ${Math.round(overlap * 100)}% token overlap`,
                        );
                    }
                }
            }
        }
        return conflicts;
    }

    _rankScore(memory, request, entityIds) {
        const relevance = memory.relevance ?? 0.5;
        const trustWeight = [0.7, 0.85, 0.95, 1, 1][trustRank(memory.sourceTrust)] || 1;
        const affinity = PURPOSE_TYPE_AFFINITY[request.purpose]?.[memory.type] ?? 1;
        const entityBoost = entityIds?.has(memory.id) ? 1.25 : 1;
        return relevance * trustWeight * affinity * entityBoost * (memory.confidence || 1);
    }

    _package(request, envelope, discovered, options, runtime = {}) {
        const diagnostics = runtime.diagnostics === true;
        const asOfMs = Date.parse(request.asOf);
        const superseded = this.store.supersededIds(request.asOf);
        const entityIds = request.entity
            ? new Set(
                  this.store
                      .memoriesForEntity(this.store.findEntity(request.entity)?.id || '', {
                          limit: 500,
                      })
                      .map((item) => item.memory.id),
              )
            : null;

        // Policy partition → temporal classification. Discovery already ran
        // inside the envelope, so `denied` is normally empty here — the
        // partition stays as defense-in-depth, and the owner-diagnostics probe
        // (when enabled) contributes the unfiltered denied list.
        const allowed = [];
        const denied = [...(runtime.deniedProbe || [])];
        for (const memory of discovered) {
            const verdict = this._policyVerdict(memory, envelope);
            if (verdict) denied.push({ memory, reason: verdict });
            else allowed.push(memory);
        }
        const eligible = [];
        const temporalSkipped = [];
        for (const memory of allowed) {
            const status = this._temporalStatus(memory, asOfMs, superseded);
            const annotated = { ...memory, temporalStatus: status };
            if (status === 'current') eligible.push(annotated);
            else if (status === 'superseded' && request.includeSuperseded) {
                eligible.push(annotated);
            } else if (status === 'expired' && request.includeStale) {
                eligible.push(annotated);
            } else {
                temporalSkipped.push({
                    memory: annotated,
                    addedChars: renderMemory(annotated).length,
                    reason:
                        status === 'superseded'
                            ? `superseded-by:${(memory.supersededBy || '').slice(0, 8)}`
                            : status,
                });
            }
        }

        const conflicts = this._relationships(eligible);
        const conflictIds = new Set(conflicts.flatMap((conflict) => conflict.ids));

        // Rank, then redundancy control: identical content (by hash or by
        // normalized text) never consumes budget twice. Disagreements are
        // never deduplicated — contentHash differs, so they survive.
        const ranked = [...eligible].sort((left, right) => {
            const scoreDelta =
                this._rankScore(right, request, entityIds) -
                this._rankScore(left, request, entityIds);
            if (scoreDelta) return scoreDelta;
            if (right.confidence !== left.confidence) return right.confidence - left.confidence;
            const trustDelta = trustRank(right.sourceTrust) - trustRank(left.sourceTrust);
            if (trustDelta) return trustDelta;
            // Stable sort preserves fused retrieval order on full ties.
            return 0;
        });
        const seenHash = new Set();
        const seenText = new Set();
        const unique = [];
        const duplicates = [];
        for (const memory of ranked) {
            const textKey = memory.content
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
            if (seenHash.has(memory.contentHash) || seenText.has(textKey)) {
                duplicates.push({
                    memory,
                    addedChars: renderMemory(memory).length,
                    reason: 'duplicate-content',
                });
                continue;
            }
            seenHash.add(memory.contentHash);
            seenText.add(textKey);
            unique.push(memory);
        }

        // Budget packing — greedy under every configured unit, then verified
        // against the real rendered output.
        const maxItems = clamp(envelope.budget.maxItems ?? 12, 1, 500);
        const maxChars = clamp(envelope.budget.maxChars ?? 8_000, 500, 200_000);
        const maxTokens = envelope.budget.maxTokens
            ? clamp(envelope.budget.maxTokens, 25, 200_000)
            : null;
        const selected = [];
        const budgetSkipped = [];
        let estimatedChars = 0;
        let estimatedTokens = 0;
        for (const memory of unique) {
            const rendered = renderMemory(memory);
            const addedChars = rendered.length + (selected.length > 0 ? 2 : 0);
            const addedTokens = Math.ceil(addedChars / 4);
            if (
                selected.length >= maxItems ||
                estimatedChars + addedChars > maxChars ||
                (maxTokens !== null && estimatedTokens + addedTokens > maxTokens)
            ) {
                budgetSkipped.push({ memory, addedChars });
                continue;
            }
            selected.push({ memory, rendered, addedChars, addedTokens });
            estimatedChars += addedChars;
            estimatedTokens += addedTokens;
        }

        // Format wrappers (JSON envelope, markdown headings) and lifecycle
        // markers add bytes the per-item estimate cannot see — so budgets are
        // enforced again on the real emitted block: trim the lowest-ranked
        // items until the actual output fits.
        let context = renderContext(request.format, selected, conflicts);
        while (
            selected.length > 0 &&
            (context.length > maxChars ||
                (maxTokens !== null && Math.ceil(context.length / 4) > maxTokens))
        ) {
            const dropped = selected.pop();
            budgetSkipped.push({ memory: dropped.memory, addedChars: dropped.addedChars });
            context = renderContext(request.format, selected, conflicts);
        }
        // usedChars/usedTokens measure the emitted block exactly (tokens are a
        // chars/4 estimate — a conservative planning unit, not a tokenizer).
        const usedChars = context.length;
        const usedTokens = Math.ceil(context.length / 4);
        const contextHash = contextBlockHash(context);
        const pkg = {
            query: request.query,
            task: request.task,
            context,
            format: request.format,
            contextHash,
            memories: selected.map(({ memory }) => ({
                ...memory,
                lifecycle: memory.temporalStatus === 'current' ? 'active' : memory.temporalStatus,
                selectionReason: selectionReason(memory, conflictIds),
            })),
            conflicts,
            usedChars,
            usedTokens,
            items: selected.length,
        };
        if (request.explain || options.receipt === true) {
            pkg.receipt = this._receipt({
                request,
                envelope,
                denied,
                temporalSkipped,
                duplicates,
                budgetSkipped,
                selected,
                conflicts,
                usedChars,
                usedTokens,
                maxItems,
                maxChars,
                maxTokens,
                contextHash,
                diagnostics,
            });
            // receiptHash covers every emitted receipt field — requester,
            // filters, asOf, compiler version, budgets and per-candidate
            // decisions — so receiptSignature binds the whole explanation.
            // `signature` keeps covering contextHash alone for verifiers
            // written against the v2 receipt before receiptHash existed.
            pkg.receipt.receiptHash = receiptPayloadHash(pkg.receipt);
            const identity = this.store.signingIdentity;
            if (identity) {
                pkg.receipt.signer = identity.fingerprint;
                pkg.receipt.signature = identity.sign(contextHash);
                pkg.receipt.receiptSignature = identity.sign(pkg.receipt.receiptHash);
            }
        }
        return pkg;
    }

    _receipt(parts) {
        const {
            request,
            envelope,
            denied,
            temporalSkipped,
            duplicates,
            budgetSkipped,
            selected,
            conflicts,
            usedChars,
            usedTokens,
            maxItems,
            maxChars,
            maxTokens,
            contextHash,
            diagnostics,
        } = parts;
        const asOfMs = Date.parse(request.asOf);
        const entry = (memory, decision, reason, chars) => {
            const eventTime = Date.parse(
                memory.occurredAt || memory.validFrom || memory.createdAt || request.asOf,
            );
            return {
                id: memory.id,
                contentHash: memory.contentHash || memoryContentHash(memory.content),
                type: memory.type,
                scope: memory.scope,
                sensitivity: memory.sensitivity,
                sourceTrust: memory.sourceTrust || 'owner',
                confidence: memory.confidence,
                source: {
                    kind: memory.source?.kind || 'unknown',
                    locator: memory.source?.locator || '',
                    title: memory.source?.title || '',
                },
                relevance: memory.relevance ?? null,
                match: memory.match || null,
                recencyDays: Number.isFinite(eventTime)
                    ? Number(((asOfMs - eventTime) / 86_400_000).toFixed(2))
                    : null,
                temporalStatus: memory.temporalStatus || 'current',
                decision,
                reason,
                chars: chars ?? null,
            };
        };
        const candidates = [
            ...selected.map((item) =>
                entry(item.memory, 'selected', 'within-budget', item.addedChars),
            ),
            ...budgetSkipped.map((item) =>
                entry(item.memory, 'skipped', 'over-budget', item.addedChars),
            ),
            ...duplicates.map((item) =>
                entry(item.memory, 'skipped', item.reason, item.addedChars),
            ),
            ...temporalSkipped.map((item) =>
                entry(item.memory, 'skipped', item.reason, item.addedChars),
            ),
            // Policy-denied candidates exist only on owner-diagnostics
            // receipts, reported as id + hash + reason — scope, sensitivity,
            // type and source stay hidden even there. Client-facing receipts
            // omit denied candidates entirely: an agent must not be able to
            // enumerate vault records it was never allowed to see.
            ...(diagnostics
                ? denied.map((item) => ({
                      id: item.memory.id,
                      contentHash:
                          item.memory.contentHash || memoryContentHash(item.memory.content),
                      decision: 'denied',
                      reason: item.reason,
                  }))
                : []),
        ];
        return {
            version: 2,
            compiler: { name: 'openself-context-compiler', version: COMPILER_VERSION },
            query: request.query,
            task: request.task,
            purpose: request.purpose,
            asOf: request.asOf,
            contextHash,
            requester: envelope.requester,
            vector: this.store._vectorIndexSummary(),
            retrieval: request.retrieval,
            format: request.format,
            filters: {
                scope: request.scope,
                allowedScopes: envelope.allowedScopes ?? null,
                // Deny-root names describe vault areas the requester cannot
                // see — they only surface on owner-diagnostics receipts.
                deniedScopes: diagnostics ? (envelope.deniedScopes ?? null) : null,
                droppedScopes: envelope.droppedScopes,
                type: request.type,
                maxSensitivity: envelope.maxSensitivity,
                minSourceTrust: envelope.minSourceTrust,
                includeSuperseded: request.includeSuperseded,
                includeStale: request.includeStale,
            },
            budget: {
                maxChars,
                maxTokens,
                maxItems,
                usedChars,
                usedTokens,
                usedItems: selected.length,
            },
            limits: { maxChars, limit: maxItems },
            candidates,
            conflicts,
            totals: {
                candidates: candidates.length,
                selected: selected.length,
                skipped: candidates.filter((item) => item.decision === 'skipped').length,
                denied: diagnostics ? denied.length : undefined,
                conflicts: conflicts.length,
                usedChars,
            },
        };
    }
}

function renderContext(format, selected, conflicts) {
    const conflictIds = new Set(conflicts.flatMap((conflict) => conflict.ids));
    if (format === 'json') {
        return JSON.stringify(
            {
                memories: selected.map(({ memory }) => ({
                    id: memory.id,
                    contentHash: memory.contentHash,
                    type: memory.type,
                    content: memory.content,
                    summary: memory.summary,
                    scope: memory.scope,
                    sensitivity: memory.sensitivity,
                    sourceTrust: memory.sourceTrust,
                    source: memory.source,
                    validFrom: memory.validFrom,
                    validTo: memory.validTo,
                    occurredAt: memory.occurredAt,
                    tags: memory.tags,
                    temporalStatus: memory.temporalStatus,
                })),
            },
            null,
            2,
        );
    }
    if (format === 'markdown') {
        const byScope = new Map();
        for (const item of selected) {
            const root = item.memory.scope.split('/')[0];
            const list = byScope.get(root) || [];
            list.push(item);
            byScope.set(root, list);
        }
        const sections = [];
        for (const [root, items] of byScope) {
            const lines = items.map(({ memory }) => {
                const date = memory.occurredAt || memory.validFrom || memory.createdAt;
                const flags = [
                    memory.temporalStatus !== 'current' ? memory.temporalStatus : null,
                    conflictIds.has(memory.id) ? 'conflict' : null,
                ]
                    .filter(Boolean)
                    .join(', ');
                return `- **${memory.type}** (${date})${flags ? ` _${flags}_` : ''} — ${memory.content}`;
            });
            sections.push(`## ${root}\n${lines.join('\n')}`);
        }
        return sections.join('\n\n');
    }
    // Default 'block' format — the proven v1 rendering plus lifecycle/conflict
    // markers so downstream agents see uncertainty, not silent gaps.
    return selected
        .map(({ memory, rendered }) => {
            const markers = [
                memory.temporalStatus !== 'current' ? memory.temporalStatus : null,
                conflictIds.has(memory.id) ? 'conflict' : null,
            ].filter(Boolean);
            return markers.length ? `${rendered}\nMarked: ${markers.join(', ')}` : rendered;
        })
        .join('\n\n');
}

function selectionReason(memory, conflictIds) {
    const parts = [];
    if (memory.temporalStatus && memory.temporalStatus !== 'current') {
        parts.push(memory.temporalStatus);
    }
    if (conflictIds.has(memory.id)) parts.push('in-conflict');
    parts.push('ranked');
    return parts.join(',');
}

function tokenOverlap(left, right) {
    const tokens = (text) =>
        new Set(
            String(text)
                .toLowerCase()
                .replace(/[^a-z0-9\s]+/g, ' ')
                .split(/\s+/)
                .filter((token) => token.length > 2),
        );
    const a = tokens(left);
    const b = tokens(right);
    if (!a.size || !b.size) return 0;
    let shared = 0;
    for (const token of a) if (b.has(token)) shared += 1;
    return shared / Math.min(a.size, b.size);
}
