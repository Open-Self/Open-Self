import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createContextMcpServer } from '../../../src/context/mcp.js';
import { ContextStore } from '../../../src/context/store.js';
import { AccessAudit } from '../../../src/context/access-audit.js';

describe('MCP owner policy enforcement', () => {
    let store;
    let audit;
    let server;
    let client;
    const policy = {
        clientId: 'atlas-agent',
        scopes: ['project/atlas', 'project/a_%'],
        maxSensitivity: 'personal',
        capabilities: ['read', 'remember', 'forget'],
    };
    beforeEach(() => {
        store = new ContextStore({ dbPath: ':memory:' });
        audit = new AccessAudit();
    });
    afterEach(async () => {
        await client?.close();
        await server?.close();
        store.close();
        audit.close();
        vi.restoreAllMocks();
    });
    async function connect(override = policy) {
        server = createContextMcpServer(store, { policy: override, audit });
        client = new Client({ name: 'untrusted-self-selected-name', version: '1' });
        const [left, right] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(left), server.connect(right)]);
    }
    async function call(name, args) {
        return client.callTool({ name: `openself_${name}`, arguments: args });
    }
    const payload = (result) => JSON.parse(result.content[0].text);

    it.each(['lexical', 'vector', 'hybrid'])(
        'filters scope and sensitivity before %s retrieval limits',
        async (retrieval) => {
            const allowed = [];
            for (const [scope, sensitivity] of [
                ['project/atlas/sub', 'personal'],
                ['project/a_%/sub', 'public'],
                ['project/atlas', 'restricted'],
                ['project/atlasx', 'public'],
                ['project/Atlas', 'public'],
                ['project/abc/sub', 'public'],
                ['personal', 'public'],
            ]) {
                const memory = store.remember({
                    content: 'database architecture decision',
                    scope,
                    sensitivity,
                });
                if (allowed.length < 2) allowed.push(memory.id);
            }
            await connect();
            const result = payload(
                await call('search_memory', {
                    query: 'database architecture',
                    retrieval,
                    maxSensitivity: 'restricted',
                    limit: 50,
                }),
            );
            expect(result.memories.map((memory) => memory.id).sort()).toEqual(allowed.sort());
            expect(audit.list()[0]).toMatchObject({ client: 'atlas-agent', outcome: 'allowed' });
        },
    );

    it('preserves all filters for punctuation-only search/context', async () => {
        const visible = store.remember({
            content: 'visible',
            scope: 'project/atlas',
            sensitivity: 'public',
        });
        for (const fields of [
            { sensitivity: 'restricted' },
            { scope: 'personal' },
            { validTo: '2000-01-01T00:00:00.000Z' },
            { validFrom: '2999-01-01T00:00:00.000Z' },
        ])
            store.remember({ content: 'hidden', scope: 'project/atlas', ...fields });
        await connect();
        for (const name of ['search_memory', 'get_context']) {
            const result = payload(
                await call(name, { query: '!!!', maxSensitivity: 'restricted' }),
            );
            expect(result.memories.map((memory) => memory.id)).toEqual([visible.id]);
            expect(JSON.stringify(result)).not.toContain('hidden');
        }
    });

    it('rejects broader, sibling and case-changed scopes', async () => {
        await connect();
        for (const scope of ['project', 'project/atlasx', 'project/Atlas', '%', 'personal']) {
            const result = await call('search_memory', { query: 'anything', scope });
            expect(result.isError).toBe(true);
            expect(payload(result).error).toBe('Access denied by MCP policy');
        }
        expect(audit.list().every((entry) => entry.outcome === 'denied')).toBe(true);
    });

    it('does not leak restricted conflicts from either conflict tool or remember', async () => {
        store.remember({
            content: 'My preferred code editor is Vim',
            scope: 'project/atlas',
            sensitivity: 'restricted',
            type: 'preference',
        });
        await connect();
        const args = {
            content: 'My preferred code editor is Zed',
            scope: 'project/atlas',
            type: 'preference',
        };
        for (const name of ['find_conflicts', 'remember']) {
            const result = payload(await call(name, args));
            expect(result.potentialConflicts).toEqual([]);
            expect(JSON.stringify(result)).not.toContain('Vim');
        }
    });

    it('finds full-window conflicts through both tools while preserving owner policy', async () => {
        const existing = {
            type: 'decision',
            content: 'Use PostgreSQL for database storage',
            scope: 'project/atlas',
            validFrom: '2026-03-01T00:00:00Z',
            validTo: '2026-06-01T00:00:00Z',
            sensitivity: 'public',
        };
        const allowed = store.remember(existing);
        store.remember({ ...existing, sensitivity: 'restricted' });
        store.remember({ ...existing, scope: 'project/atlas/child' });
        await connect();
        const args = {
            ...existing,
            content: 'Use SQLite for database storage',
            validFrom: '2026-01-01T00:00:00Z',
            validTo: '2026-12-01T00:00:00Z',
        };
        for (const name of ['find_conflicts', 'remember']) {
            const result = payload(await call(name, args));
            expect(result.potentialConflicts.map(({ id }) => id)).toEqual([allowed.id]);
        }
    });

    it('enforces write capabilities, write ceilings and forget ownership without existence leaks', async () => {
        const hidden = store.remember({ content: 'foreign secret', scope: 'personal' });
        const restricted = store.remember({
            content: 'restricted secret',
            scope: 'project/atlas',
            sensitivity: 'restricted',
        });
        await connect();
        for (const args of [
            { content: 'blocked', scope: 'personal' },
            { content: 'blocked', scope: 'project/atlas', sensitivity: 'restricted' },
        ])
            expect((await call('remember', args)).isError).toBe(true);
        const errors = [];
        for (const id of [hidden.id, restricted.id, randomUUID()])
            errors.push(payload(await call('forget', { id })));
        expect(errors[0]).toEqual(errors[1]);
        expect(errors[0]).toEqual(errors[2]);
        expect(store.get(hidden.id)).not.toBeNull();
        const own = payload(
            await call('remember', { content: 'allowed', scope: 'project/atlas' }),
        ).memory;
        expect(payload(await call('forget', { id: own.id })).forgotten).toBe(true);
    });

    it('supports read-only clients and client-requested lower sensitivity', async () => {
        store.remember({
            content: 'public database',
            scope: 'project/atlas',
            sensitivity: 'public',
        });
        store.remember({ content: 'personal database', scope: 'project/atlas' });
        await connect({ ...policy, capabilities: ['read'] });
        expect(
            (await call('remember', { content: 'blocked', scope: 'project/atlas' })).isError,
        ).toBe(true);
        expect((await call('forget', { id: randomUUID() })).isError).toBe(true);
        const result = payload(
            await call('search_memory', { query: 'database', maxSensitivity: 'public' }),
        );
        expect(result.memories.map((memory) => memory.sensitivity)).toEqual(['public']);
    });

    it('supports write-only clients without conflict reads', async () => {
        store.remember({
            type: 'preference',
            content: 'My preferred editor is Vim',
            scope: 'project/atlas',
        });
        await connect({ ...policy, capabilities: ['remember'] });
        const result = payload(
            await call('remember', {
                type: 'preference',
                content: 'My preferred editor is Zed',
                scope: 'project/atlas',
            }),
        );
        expect(result.stored).toBe(true);
        expect(result.potentialConflicts).toEqual([]);
        expect((await call('search_memory', { query: 'editor' })).isError).toBe(true);
    });

    it('records minimal metadata and blocks writes when audit is unavailable', async () => {
        await connect();
        await call('search_memory', { query: 'never-store-this-query' });
        expect(JSON.stringify(audit.list())).not.toContain('never-store-this-query');
        expect(Object.keys(audit.list()[0]).sort()).toEqual([
            'client',
            'id',
            'occurredAt',
            'outcome',
            'tool',
        ]);
        vi.spyOn(audit, 'begin').mockImplementation(() => {
            throw new Error('audit unavailable');
        });
        expect(
            (await call('remember', { content: 'must not persist', scope: 'project/atlas' }))
                .isError,
        ).toBe(true);
        expect(store.stats().total).toBe(0);
    });

    it('rolls back a memory write if terminal audit recording fails', async () => {
        await connect();
        vi.spyOn(audit, 'finish').mockImplementation(() => {
            throw new Error('audit failure with private detail');
        });
        const result = await call('remember', {
            content: 'must roll back',
            scope: 'project/atlas',
        });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).not.toContain('private detail');
        expect(store.stats().total).toBe(0);
        expect(audit.list()[0].outcome).toBe('attempted');
    });

    it('requires owner policy to grant restricted access even without an explicit policy file', async () => {
        store.remember({ content: 'restricted database', sensitivity: 'restricted' });
        server = createContextMcpServer(store, { audit });
        client = new Client({ name: 'owner', version: '1' });
        const [left, right] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(left), server.connect(right)]);
        const result = payload(
            await call('search_memory', { query: 'database', maxSensitivity: 'restricted' }),
        );
        expect(result.memories).toEqual([]);
        expect(audit.list()[0].client).toBe('trusted-local');
    });

    it('allows explicit owner grants of restricted access', async () => {
        const memory = store.remember({
            content: 'restricted database',
            scope: 'project/atlas',
            sensitivity: 'restricted',
        });
        await connect({ ...policy, maxSensitivity: 'restricted' });
        const result = payload(
            await call('search_memory', { query: 'database', maxSensitivity: 'restricted' }),
        );
        expect(result.memories.map((entry) => entry.id)).toEqual([memory.id]);
    });
});
