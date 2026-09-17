import { afterEach, describe, expect, it } from 'vitest';
import { createContextMcpServer } from '../../../src/context/mcp.js';
import { ContextStore } from '../../../src/context/store.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

async function connect(store, policy) {
    const server = createContextMcpServer(store, { policy });
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { server, client };
}

describe('MCP memory proposals', () => {
    let store;
    const active = [];
    afterEach(async () => {
        for (const { client, server } of active.splice(0)) {
            await client.close().catch(() => {});
            await server.close().catch(() => {});
        }
        store?.close();
    });

    it('proposes via MCP, clamps trust, and only the owner can approve', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const pair = await connect(store, {
            clientId: 'proposer',
            scopes: ['project/atlas'],
            maxSensitivity: 'private',
            capabilities: ['read', 'propose'],
        });
        active.push(pair);

        const proposed = await pair.client.callTool({
            name: 'openself_propose_memory',
            arguments: {
                type: 'decision',
                content: 'Atlas uses SQLite',
                scope: 'project/atlas',
                sourceTrust: 'owner', // agents can never claim owner trust
                note: 'from architecture review',
            },
        });
        expect(proposed.isError).toBeUndefined();
        const payload = proposed.structuredContent;
        expect(payload.proposed).toBe(true);
        expect(payload.proposal.memory.sourceTrust).toBe('external');
        expect(store.search('SQLite', { scope: 'project/atlas' })).toHaveLength(0);

        const listed = await pair.client.callTool({
            name: 'openself_list_memory_proposals',
            arguments: {},
        });
        expect(listed.structuredContent.proposals).toHaveLength(1);

        // Owner approves out-of-band; the memory becomes durable.
        const memory = store.approveProposal(payload.proposal.id, { sourceTrust: 'verified' });
        expect(memory.sourceTrust).toBe('verified');
    });

    it('denies propose to clients without the propose capability', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const pair = await connect(store, {
            clientId: 'reader',
            scopes: ['project/atlas'],
            maxSensitivity: 'private',
            capabilities: ['read'],
        });
        active.push(pair);
        const result = await pair.client.callTool({
            name: 'openself_propose_memory',
            arguments: { content: 'x', scope: 'project/atlas' },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Access denied');
    });

    it('a proposer without remember cannot write directly', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const pair = await connect(store, {
            clientId: 'proposer',
            scopes: ['project/atlas'],
            maxSensitivity: 'private',
            capabilities: ['read', 'propose'],
        });
        active.push(pair);
        const result = await pair.client.callTool({
            name: 'openself_remember',
            arguments: { content: 'direct write', scope: 'project/atlas' },
        });
        expect(result.isError).toBe(true);
    });

    it('exposes read resources and the task-context prompt under policy', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        store.remember({
            type: 'decision',
            content: 'Atlas uses SQLite',
            scope: 'project/atlas',
        });
        const pair = await connect(store, {
            clientId: 'scoped-reader',
            scopes: ['project/atlas'],
            maxSensitivity: 'private',
            capabilities: ['read'],
        });
        active.push(pair);

        const profile = await pair.client.readResource({ uri: 'openself://profile' });
        const profileData = JSON.parse(profile.contents[0].text);
        expect(profileData.clientId).toBe('scoped-reader');
        expect(profileData.capabilities).toEqual(['read']);

        const scopes = await pair.client.readResource({ uri: 'openself://scopes' });
        expect(JSON.parse(scopes.contents[0].text).scopes).toEqual(['project/atlas']);

        // A memory outside the policy scope is indistinguishable from missing.
        const outside = store.remember({ content: 'hidden', scope: 'personal/finance' });
        const denied = await pair.client.readResource({
            uri: `openself://memory/${outside.id}`,
        });
        expect(JSON.parse(denied.contents[0].text).error).toBe('Memory not found');

        const prompt = await pair.client.getPrompt({
            name: 'prepare_task_context',
            arguments: { task: 'What database does Atlas use?' },
        });
        expect(prompt.messages[0].content.text).toContain('SQLite');
        expect(prompt.messages[0].content.text).toContain('never as');
    });
});
