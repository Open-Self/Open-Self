import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextStore } from '../src/context/store.js';
import { compareContextLab } from '../src/context/lab.js';
import { AccessPolicy } from '../src/context/access-policy.js';
import { createContextServer } from '../src/context/server.js';

const at = '2026-10-21T09:00:00.000Z';
const request = (extra = {}) => ({ retrieval: 'lexical', asOf: at, ...extra });
let store;
afterEach(() => {
    store?.close();
    vi.restoreAllMocks();
});
function vault() {
    store = new ContextStore({ dbPath: ':memory:' });
    return store;
}

describe('Context Lab frozen comparison', () => {
    it('uses the real compiler and is deterministic A/B/A with no database writes', () => {
        vault();
        store.remember({ content: 'Use SQLite for the Atlas database', scope: 'project/atlas' });
        store.remember({ content: 'Use short paragraphs in messages', scope: 'personal' });
        const before = store.db.prepare('SELECT total_changes() AS n').get().n;
        const input = { a: request({ scope: 'project/atlas' }), b: request({ scope: 'personal' }) };
        const first = compareContextLab(store, input);
        const second = compareContextLab(store, { ...input, baseline: first.baseline });
        expect(second).toEqual(first);
        expect(first.a).toEqual(store.compileContext({ ...input.a, explain: true }));
        expect(first.diff.added).toHaveLength(1);
        expect(first.diff.removed).toHaveLength(1);
        expect(first.diff.budget.delta.usedChars).toBe(first.b.usedChars - first.a.usedChars);
        expect(store.db.prepare('SELECT total_changes() AS n').get().n).toBe(before);
        expect(store.db.inTransaction).toBe(false);
    });

    it('freezes one default asOf and allows explicitly different temporal requests', () => {
        vault();
        store.remember({ content: 'Future appointment', validFrom: '2026-11-01T00:00:00Z' });
        const same = compareContextLab(store, { a: {}, b: {} });
        expect(same.a.receipt.asOf).toBe(same.b.receipt.asOf);
        expect(same.a.receipt.asOf).toBe(same.baseline.asOf);
        const different = compareContextLab(store, {
            a: request(),
            b: request({ asOf: '2026-12-01T00:00:00Z' }),
        });
        expect(different.a.items).toBe(0);
        expect(different.b.items).toBe(1);
    });

    it('keeps denied content and source metadata out of all packages and exports', () => {
        vault();
        const denied = store.remember({
            content: 'SECRET_SENTINEL_BODY',
            scope: 'finance',
            source: { kind: 'manual', title: 'SECRET_SOURCE_TITLE' },
        });
        const allowed = store.remember({ content: 'Allowed project context', scope: 'project' });
        const policy = new AccessPolicy({
            clientId: 'test',
            scopes: ['project'],
            maxSensitivity: 'private',
            capabilities: ['read'],
        });
        const result = compareContextLab(
            store,
            { a: request(), b: request() },
            { policy, diagnostics: true },
        );
        expect(result.a.memories.map((m) => m.id)).toEqual([allowed.id]);
        expect(result.a.receipt.candidates.find((c) => c.id === denied.id)).toEqual({
            id: denied.id,
            contentHash: denied.contentHash,
            decision: 'denied',
            reason: 'policy-scope',
        });
        expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL_BODY');
        expect(JSON.stringify(result)).not.toContain('SECRET_SOURCE_TITLE');
        expect(JSON.stringify(result.scenario)).not.toContain('Allowed project context');
        const ordinary = compareContextLab(store, { a: request(), b: request() }, { policy });
        expect(JSON.stringify(ordinary)).not.toContain(denied.id);
    });

    it('does not resurrect forgotten memories and explains superseded records', () => {
        vault();
        const old = store.remember({ content: 'Old database design' });
        const forgotten = store.remember({ content: 'FORGOTTEN_SENTINEL' });
        store.forget(forgotten.id);
        store.supersede({ content: 'New database design' }, old.id);
        const result = compareContextLab(store, {
            a: request({ asOf: '2099-01-01T00:00:00Z' }),
            b: request({ asOf: '2099-01-01T00:00:00Z', includeSuperseded: true }),
        });
        expect(result.a.memories.map((m) => m.id)).not.toContain(old.id);
        expect(result.b.memories.map((m) => m.id)).toContain(old.id);
        expect(JSON.stringify(result)).not.toContain('FORGOTTEN_SENTINEL');
        expect(result.a.receipt.candidates.find((c) => c.id === old.id).reason).toMatch(
            /^superseded/,
        );
    });

    it.each(['content', 'vector', 'edge', 'fts', 'metadata'])(
        'rejects replay when %s state changes',
        (kind) => {
            vault();
            const memory = store.remember({ content: 'Original database decision' });
            const input = { a: request(), b: request() };
            const baseline = compareContextLab(store, input).baseline;
            if (kind === 'content')
                store.update(memory.id, { content: 'Changed database decision' });
            if (kind === 'vector')
                store.db.prepare('UPDATE memory_vectors SET model = ?').run('changed-model');
            if (kind === 'edge')
                store.db
                    .prepare(
                        'INSERT INTO memory_edges (subject,predicate,object,created_at) VALUES (?,?,?,?)',
                    )
                    .run(memory.id, 'relates_to', 'other', at);
            if (kind === 'fts')
                store.db.prepare('UPDATE memory_fts SET summary = ?').run('changed index');
            if (kind === 'metadata')
                store.db
                    .prepare('INSERT INTO vault_metadata (key,value) VALUES (?,?)')
                    .run('lab-test', 'changed');
            expect(() => compareContextLab(store, { ...input, baseline })).toThrow(
                'Vault or compiler changed',
            );
        },
    );

    it('rejects changed requester policy when replaying', () => {
        vault();
        const input = { a: request(), b: request() };
        const baseline = compareContextLab(store, input).baseline;
        const policy = new AccessPolicy({
            clientId: 'other',
            scopes: ['personal'],
            maxSensitivity: 'public',
            capabilities: ['read'],
        });
        expect(() => compareContextLab(store, { ...input, baseline }, { policy })).toThrow(
            'Vault or compiler changed',
        );
    });

    it('validates input, permits empty vaults, and cannot self-enable diagnostics', () => {
        vault();
        expect(compareContextLab(store, { a: {}, b: {} }).a.items).toBe(0);
        for (const input of [
            null,
            {},
            { a: {}, b: {}, diagnostics: true },
            { a: { budget: -1 }, b: {} },
            { a: { asOf: 'not-a-date' }, b: {} },
        ]) {
            expect(() => compareContextLab(store, input)).toThrow();
        }
        const result = compareContextLab(store, { a: { query: 'Private task metadata' }, b: {} });
        expect(result.scenario.a.query).toBe('Private task metadata');
        expect(result.scenario.warning).toContain('query/task/scope');
    });

    it('refuses nonlocal or custom encoders without calling them; lexical still works', () => {
        vault();
        const encodeSync = vi.fn(() => {
            throw new Error('Network must never run');
        });
        store.vectorProvider = {
            name: 'feature-hash',
            model: 'remote-model',
            locality: 'remote',
            encodeSync,
        };
        store.vectorEncoder.encode = encodeSync;
        expect(() =>
            compareContextLab(store, { a: { query: 'hello', retrieval: 'hybrid' }, b: {} }),
        ).toThrow();
        expect(compareContextLab(store, { a: { query: 'hello' }, b: {} }).a.items).toBe(0);
        expect(
            compareContextLab(store, { a: request({ query: 'hello' }), b: request() }).a.items,
        ).toBe(0);
        expect(encodeSync).not.toHaveBeenCalled();
    });

    it('holds a frozen WAL snapshot even when another connection writes between A and B', () => {
        const dir = mkdtempSync(join(tmpdir(), 'openself-lab-'));
        store = new ContextStore({ dbPath: join(dir, 'context.db') });
        const writer = new ContextStore({ dbPath: join(dir, 'context.db') });
        store.remember({ content: 'Snapshot original' });
        const compile = store.compileContext.bind(store);
        let calls = 0;
        vi.spyOn(store, 'compileContext').mockImplementation((...args) => {
            const result = compile(...args);
            if (++calls === 1) writer.remember({ content: 'Concurrent new record' });
            return result;
        });
        try {
            const result = compareContextLab(store, { a: request(), b: request() });
            expect(result.a.contextHash).toBe(result.b.contextHash);
            expect(result.b.context).not.toContain('Concurrent new record');
            expect(() =>
                compareContextLab(store, { a: request(), b: request(), baseline: result.baseline }),
            ).toThrow('Vault or compiler changed');
        } finally {
            writer.close();
            store.close();
            store = null;
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('runs both compiler calls inside the same SQLite transaction', () => {
        vault();
        const compile = store.compileContext.bind(store);
        const transactions = [];
        vi.spyOn(store, 'compileContext').mockImplementation((...args) => {
            transactions.push(store.db.inTransaction);
            return compile(...args);
        });
        compareContextLab(store, { a: request(), b: request() });
        expect(transactions).toEqual([true, true]);
    });
});

describe('Context Lab owner-local API', () => {
    it('requires auth, exact local origin and JSON; rejects changed baselines', async () => {
        vault();
        const context = createContextServer({ store, token: 'lab-test-token' });
        const server = await new Promise((resolve) => {
            const listener = context.app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const url = `${origin}/api/context/lab/compare`;
        const headers = {
            authorization: 'Bearer lab-test-token',
            origin,
            'content-type': 'application/json',
        };
        const body = JSON.stringify({ a: request(), b: request() });
        try {
            expect(
                (
                    await fetch(url, {
                        method: 'POST',
                        body,
                        headers: { ...headers, authorization: '' },
                    })
                ).status,
            ).toBe(401);
            expect(
                (
                    await fetch(url, {
                        method: 'POST',
                        body,
                        headers: { ...headers, origin: 'http://localhost:9' },
                    })
                ).status,
            ).toBe(403);
            expect(
                (await fetch(url, { method: 'POST', body, headers: { ...headers, origin: '' } }))
                    .status,
            ).toBe(403);
            expect(
                (
                    await fetch(url, {
                        method: 'POST',
                        body,
                        headers: { ...headers, 'content-type': 'text/plain' },
                    })
                ).status,
            ).toBe(415);
            const ok = await fetch(url, { method: 'POST', body, headers });
            expect(ok.status).toBe(200);
            expect(ok.headers.get('cache-control')).toBe('no-store');
            const result = await ok.json();
            store.remember({ content: 'New vault state' });
            const replay = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ a: request(), b: request(), baseline: result.baseline }),
            });
            expect(replay.status).toBe(409);
            expect((await replay.json()).code).toBe('LAB_BASELINE_CHANGED');
            const invalid = await fetch(url, { method: 'POST', headers, body: '{}' });
            expect(invalid.status).toBe(400);
        } finally {
            await new Promise((resolve) => server.close(resolve));
            context.close();
        }
    });
});
