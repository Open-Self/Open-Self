import { createHash } from 'node:crypto';
import { z } from 'zod';
import { COMPILER_VERSION, contextRequestSchema } from './context-request.js';
import { contextDateSchema } from './schema.js';
import { AccessPolicy } from './access-policy.js';

const baselineSchema = z
    .object({
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        asOf: contextDateSchema,
        compilerVersion: z.string(),
    })
    .strict();
// This milestone deliberately disallows custom/vector encoders: provider labels
// are not proof of locality, and imported scenarios must not trigger network I/O.
const labRequestSchema = contextRequestSchema.extend({
    retrieval: z.literal('lexical').default('lexical'),
});
const comparisonSchema = z
    .object({
        a: labRequestSchema,
        b: labRequestSchema,
        baseline: baselineSchema.optional(),
    })
    .strict();

export class ContextLabError extends Error {
    constructor(message, code, status = 400) {
        super(message);
        this.name = 'ContextLabError';
        this.code = code;
        this.status = status;
    }
}

/**
 * Offline A/B compilation against one SQLite read snapshot. No copied ranking
 * pipeline, persistent snapshots, writes, model calls or network operations.
 * A baseline is a conservative hash of the ENTIRE database (including FTS,
 * vectors, graph, lifecycle and metadata), compiler and configured policy.
 * Unrelated vault changes may invalidate replay; accepting stale retrieval
 * state is never preferable to a false-positive invalidation.
 */
export function compareContextLab(store, input, options = {}) {
    const parsed = comparisonSchema.parse(input);
    const policy = options.policy || new AccessPolicy();
    policy.require('read');
    const diagnostics = options.diagnostics === true;
    return store.db
        .transaction(() => {
            // The first read establishes the SQLite snapshot before either compile.
            const revision = vaultRevision(store, policy, diagnostics);
            if (
                parsed.baseline &&
                (parsed.baseline.revision !== revision ||
                    parsed.baseline.compilerVersion !== COMPILER_VERSION)
            ) {
                throw new ContextLabError(
                    'Vault or compiler changed. Run a new comparison before replaying.',
                    'LAB_BASELINE_CHANGED',
                    409,
                );
            }
            const asOf = parsed.baseline?.asOf || new Date().toISOString();
            const baseline = { revision, asOf, compilerVersion: COMPILER_VERSION };
            const requestA = { ...parsed.a, asOf: parsed.a.asOf || asOf, explain: true };
            const requestB = { ...parsed.b, asOf: parsed.b.asOf || asOf, explain: true };
            const a = store.compileContext(requestA, { policy, diagnostics });
            const b = store.compileContext(requestB, { policy, diagnostics });
            return {
                version: 1,
                baseline,
                a,
                b,
                diff: comparePackages(a, b),
                scenario: {
                    version: 1,
                    kind: 'openself-context-lab',
                    baseline,
                    a: requestA,
                    b: requestB,
                    results: { a: packageMetadata(a), b: packageMetadata(b) },
                    warning:
                        'Contains request metadata (including query/task/scope), IDs and hashes; no memory text. Review before sharing.',
                },
            };
        })
        .deferred();
}

function vaultRevision(store, policy, diagnostics) {
    const hash = createHash('sha256');
    const add = (value) => hash.update(JSON.stringify(value)).update('\n');
    add({
        compiler: COMPILER_VERSION,
        policy,
        diagnostics,
        provider: {
            name: store.vectorProvider.name,
            model: store.vectorProvider.model,
            locality: store.vectorProvider.locality,
            synchronous: store.vectorSync,
        },
        encrypted: store.encryptionEnabled,
        schema: store.db.pragma('user_version', { simple: true }),
    });
    const schema = store.db
        .prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
        .all();
    add(schema);
    for (const table of schema.filter((entry) => entry.type === 'table')) {
        add(table.name);
        const identifier = `"${table.name.replaceAll('"', '""')}"`;
        // Stable row order even for tables without a public primary key. Hash
        // raw storage; never decode or return hidden memory/credential fields.
        const rows = store.db
            .prepare(`SELECT * FROM ${identifier}`)
            .all()
            .map((row) => JSON.stringify(row))
            .sort();
        for (const row of rows) add(row);
    }
    return hash.digest('hex');
}

function selected(pkg) {
    return pkg.memories.map(({ id, contentHash }) => ({ id, contentHash }));
}
function packageMetadata(pkg) {
    return { contextHash: pkg.contextHash, selected: selected(pkg) };
}
function comparePackages(a, b) {
    const left = new Map(selected(a).map((item) => [item.id, item]));
    const right = new Map(selected(b).map((item) => [item.id, item]));
    const added = [],
        removed = [],
        changed = [],
        unchanged = [];
    for (const [id, item] of left) {
        if (!right.has(id)) removed.push(item);
        else if (item.contentHash !== right.get(id).contentHash) {
            changed.push({
                id,
                beforeHash: item.contentHash,
                afterHash: right.get(id).contentHash,
            });
        } else unchanged.push(item);
    }
    for (const [id, item] of right) if (!left.has(id)) added.push(item);
    const decisionMap = (pkg) =>
        new Map(
            pkg.receipt.candidates.map(({ id, decision, reason, contentHash }) => [
                id,
                { decision, reason, contentHash },
            ]),
        );
    const decisionsA = decisionMap(a),
        decisionsB = decisionMap(b);
    const candidates = [...new Set([...decisionsA.keys(), ...decisionsB.keys()])]
        .sort()
        .map((id) => ({ id, a: decisionsA.get(id) || null, b: decisionsB.get(id) || null }));
    return {
        added,
        removed,
        changed,
        unchanged,
        candidates,
        budget: {
            a: a.receipt.budget,
            b: b.receipt.budget,
            delta: {
                usedChars: b.usedChars - a.usedChars,
                usedTokens: b.usedTokens - a.usedTokens,
                usedItems: b.items - a.items,
            },
        },
    };
}
