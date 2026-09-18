import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ContextStore } from '../../../src/context/store.js';
import { createContextMcpServer } from '../../../src/context/mcp.js';

/**
 * Contract coverage for openself_compile_context over a real MCP session —
 * requester identity, v2 policy enforcement, and receipt v2 shape end-to-end.
 */
describe('openself_compile_context MCP contract', () => {
    let store;
    let server;
    let client;
    afterEach(async () => {
        await client?.close();
        await server?.close();
        store?.close();
    });

    async function connect(policy) {
        store = new ContextStore({ dbPath: ':memory:' });
        server = createContextMcpServer(store, { policy });
        client = new Client({ name: 'contract-test', version: '1.0.0' });
        const [left, right] = InMemoryTransport.createLinkedPair();
        await Promise.all([client.connect(left), server.connect(right)]);
    }

    it('returns a bounded package with a v2 receipt naming the requester', async () => {
        await connect({
            clientId: 'contract-reader',
            scopes: ['project/atlas'],
            maxSensitivity: 'private',
            capabilities: ['read'],
        });
        await client
            .callTool({
                name: 'openself_remember',
                arguments: {},
            })
            .catch(() => {});
        store.remember({
            type: 'decision',
            content: 'Atlas uses PostgreSQL for the database',
            scope: 'project/atlas',
            sensitivity: 'public',
        });
        const result = await client.callTool({
            name: 'openself_compile_context',
            arguments: {
                query: 'atlas database',
                task: 'verify contract',
                agent: 'contract-agent',
                scope: 'project/atlas',
                explain: true,
            },
        });
        expect(result.isError).toBeUndefined();
        const pkg = JSON.parse(result.content[0].text);
        expect(pkg.context).toContain('PostgreSQL');
        expect(pkg.receipt.version).toBe(2);
        expect(pkg.receipt.requester.clientId).toBe('contract-reader');
        expect(pkg.receipt.requester.agent).toBe('contract-agent');
        expect(pkg.receipt.task).toBe('verify contract');
        expect(pkg.contextHash).toHaveLength(64);
        expect(pkg.memories[0].lifecycle).toBe('active');
    });

    it('enforces denied scopes and never serializes denied content', async () => {
        await connect({
            clientId: 'scoped-reader',
            scopes: ['project/atlas'],
            deny: ['project/atlas/secrets'],
            maxSensitivity: 'restricted',
            capabilities: ['read'],
        });
        store.remember({
            content: 'atlas runbook public note',
            scope: 'project/atlas',
            sensitivity: 'public',
        });
        store.remember({
            content: 'atlas secrets runbook private keys',
            scope: 'project/atlas/secrets',
            sensitivity: 'restricted',
        });
        const result = await client.callTool({
            name: 'openself_compile_context',
            arguments: { query: 'atlas runbook', explain: true },
        });
        const pkg = JSON.parse(result.content[0].text);
        expect(pkg.context).not.toContain('private keys');
        const denied = pkg.receipt.candidates.filter((c) => c.decision === 'denied');
        expect(denied.length).toBe(1);
        expect(Object.keys(denied[0]).sort()).toEqual(
            ['contentHash', 'decision', 'id', 'reason'].sort(),
        );
        // The wire payload never carries the denied content either.
        expect(result.content[0].text).not.toContain('private keys');
    });

    it('honors policy budget ceilings over client-supplied budgets', async () => {
        await connect({
            clientId: 'budget-reader',
            scopes: ['project/atlas'],
            maxSensitivity: 'personal',
            capabilities: ['read'],
            budget: { maxItems: 2 },
        });
        for (let index = 0; index < 5; index += 1) {
            store.remember({
                content: `atlas budget note ${index}`,
                scope: 'project/atlas',
            });
        }
        const result = await client.callTool({
            name: 'openself_compile_context',
            arguments: { query: 'atlas budget', maxItems: 50, explain: true },
        });
        const pkg = JSON.parse(result.content[0].text);
        expect(pkg.items).toBeLessThanOrEqual(2);
        expect(pkg.receipt.budget.maxItems).toBe(2);
    });

    it('fails closed on malformed compile requests', async () => {
        await connect({
            clientId: 'strict-reader',
            scopes: ['project/atlas'],
            maxSensitivity: 'personal',
            capabilities: ['read'],
        });
        const result = await client.callTool({
            name: 'openself_compile_context',
            arguments: { query: 'x', retrieval: 'telepathy' },
        });
        expect(result.isError).toBe(true);
    });
});
