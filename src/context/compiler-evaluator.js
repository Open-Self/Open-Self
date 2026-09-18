import { AccessPolicy } from './access-policy.js';
import { contextBlockHash } from './schema.js';
import { ContextStore } from './store.js';
import { verifyPayload } from './signing.js';

/**
 * Compiler evaluation — measures the Context Compiler against the promises a
 * Personal Context OS makes: current truth, temporal correctness, policy
 * compliance, staleness handling, redundancy control, cross-scope isolation,
 * and receipt integrity.
 *
 * Dataset shape (evals/context-compiler.json):
 *   memories:  [{ key, memory, supersedes?: key }]
 *   entities:  [{ kind, canonical, aliases, links: [{ memory: key, role }] }]
 *   policies:  { clientId: McpPolicy }   — requester envelopes (v1/v2 fields)
 *   cases:     [{ name, kind, request, policy?, expect }]
 *   thresholds:{ metricName: number }
 *
 * A case compiles one ContextRequest and is scored by its `expect` block:
 *   include:  keys that MUST appear in the package
 *   exclude:  keys that MUST NOT appear (content and selection)
 *   denied:   keys the receipt must mark 'denied'
 *   skipped:  keys the receipt must mark 'skipped'
 *   noLeak:   substrings that must never appear in the rendered context
 *   receiptIntegrity: verify hash/signature/requester fields
 */
export function evaluateCompilerVault(dataset, options = {}) {
    const store = options.store || new ContextStore({ dbPath: ':memory:' });
    const keys = new Map();
    try {
        for (const entry of dataset.memories || []) {
            const memory = store.remember({ ...entry.memory, id: undefined });
            keys.set(entry.key, memory);
        }
        for (const entry of dataset.memories || []) {
            if (!entry.supersedes) continue;
            const replacement = keys.get(entry.key);
            const target = keys.get(entry.supersedes);
            if (replacement && target) {
                store.supersede(replacement.id, target.id, { at: entry.supersedeAt });
            }
        }
        for (const entity of dataset.entities || []) {
            const record = store.ensureEntity(entity);
            for (const link of entity.links || []) {
                const memory = keys.get(link.memory);
                if (memory) store.linkEntity(memory.id, record.id, link.role || 'mentions');
            }
        }

        const policies = new Map();
        for (const [clientId, policy] of Object.entries(dataset.policies || {})) {
            policies.set(clientId, new AccessPolicy({ clientId, ...policy }));
        }

        const cases = [];
        for (const testCase of dataset.cases || []) {
            cases.push(runCase(store, keys, policies, testCase));
        }

        const metrics = {};
        const groups = new Map();
        for (const result of cases) {
            const list = groups.get(result.kind) || [];
            list.push(result.score);
            groups.set(result.kind, list);
        }
        for (const [kind, scores] of groups) {
            metrics[kind] = Number(
                (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(4),
            );
        }
        const thresholds = { ...defaultThresholds(), ...(dataset.thresholds || {}) };
        const failures = Object.entries(metrics)
            .filter(([metric, score]) => score < (thresholds[metric] ?? 1))
            .map(([metric, actual]) => ({
                metric,
                actual,
                threshold: thresholds[metric] ?? 1,
            }));
        return {
            dataset: dataset.name || 'openself-compiler',
            passed: failures.length === 0,
            metrics,
            thresholds,
            failures,
            cases,
        };
    } finally {
        if (!options.store) store.close();
    }
}

function defaultThresholds() {
    return {
        'current-truth': 1,
        temporal: 1,
        policy: 1,
        staleness: 1,
        redundancy: 1,
        'cross-scope': 1,
        receipt: 1,
    };
}

function runCase(store, keys, policies, testCase) {
    const expect = testCase.expect || {};
    const policy = testCase.policy ? policies.get(testCase.policy) : undefined;
    if (testCase.policy && !policy) {
        return {
            name: testCase.name,
            kind: testCase.kind || 'policy',
            score: 0,
            failures: [`unknown policy client: ${testCase.policy}`],
        };
    }
    const options = policy
        ? { policy, receipt: true }
        : { envelope: { clientId: 'eval' }, receipt: true };
    let pkg;
    const failures = [];
    try {
        pkg = store.compileContext({ explain: true, ...testCase.request }, options);
    } catch (error) {
        // A policy denial is a pass only when the case expects refusal.
        if (expect.refused) {
            return { name: testCase.name, kind: testCase.kind || 'policy', score: 1, failures: [] };
        }
        return {
            name: testCase.name,
            kind: testCase.kind || 'policy',
            score: 0,
            failures: [`compile threw: ${error.message}`],
        };
    }

    const selectedIds = new Set(pkg.memories.map((memory) => memory.id));
    const selectedKeys = new Set(
        [...keys.entries()].filter(([, memory]) => selectedIds.has(memory.id)).map(([key]) => key),
    );
    const byKey = (key) => keys.get(key);
    const decisions = new Map();
    for (const candidate of pkg.receipt?.candidates || []) {
        for (const [key, memory] of keys) {
            if (memory.id === candidate.id) decisions.set(key, candidate);
        }
    }

    for (const key of expect.include || []) {
        if (!selectedKeys.has(key)) failures.push(`expected ${key} in the package`);
    }
    for (const key of expect.exclude || []) {
        if (selectedKeys.has(key)) failures.push(`excluded ${key} was selected`);
        const memory = byKey(key);
        if (memory && pkg.context.includes(memory.content)) {
            failures.push(`excluded ${key} content leaked into context`);
        }
    }
    for (const key of expect.denied || []) {
        const candidate = decisions.get(key);
        if (candidate?.decision !== 'denied') {
            failures.push(`expected ${key} marked denied on the receipt`);
        }
    }
    for (const key of expect.skipped || []) {
        const candidate = decisions.get(key);
        if (candidate?.decision !== 'skipped') {
            failures.push(`expected ${key} marked skipped on the receipt`);
        }
    }
    for (const group of expect.dedupeGroups || []) {
        const selected = group.filter((key) => selectedKeys.has(key));
        const skippedDup = group.filter(
            (key) => decisions.get(key)?.reason === 'duplicate-content',
        );
        if (selected.length !== 1 || skippedDup.length !== group.length - 1) {
            failures.push(
                `dedupe group ${group.join('/')} should keep exactly one and skip the rest as duplicate-content`,
            );
        }
    }
    for (const text of expect.noLeak || []) {
        if (pkg.context.includes(text))
            failures.push(`forbidden text leaked: "${text.slice(0, 40)}"`);
    }
    if (expect.refused) failures.push('expected a policy refusal but compile succeeded');

    if (expect.receiptIntegrity) {
        const receipt = pkg.receipt;
        if (!receipt) failures.push('receipt missing');
        else {
            if (receipt.contextHash !== contextBlockHash(pkg.context)) {
                failures.push('contextHash does not cite the rendered package');
            }
            if (receipt.signature) {
                const identity = store.signingIdentity;
                if (
                    !identity ||
                    !verifyPayload(identity.publicKey, receipt.contextHash, receipt.signature)
                ) {
                    failures.push('receipt signature failed verification');
                }
            }
            const deniedLeaks = (receipt.candidates || []).filter(
                (candidate) =>
                    candidate.decision === 'denied' &&
                    (candidate.type !== undefined || candidate.scope !== undefined),
            );
            if (deniedLeaks.length) {
                failures.push('denied candidates expose scope/type metadata');
            }
        }
    }

    const checks =
        (expect.include?.length || 0) +
        (expect.exclude?.length || 0) +
        (expect.denied?.length || 0) +
        (expect.skipped?.length || 0) +
        (expect.dedupeGroups?.length || 0) +
        (expect.noLeak?.length || 0) +
        (expect.refused ? 1 : 0) +
        (expect.receiptIntegrity ? 1 : 0);
    return {
        name: testCase.name,
        kind: testCase.kind || 'policy',
        score: checks ? Math.max(0, 1 - failures.length / checks) : failures.length ? 0 : 1,
        selected: [...selectedKeys],
        failures,
    };
}
