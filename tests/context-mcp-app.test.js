import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createContextMcpServer } from '../src/context/mcp.js';
import { ContextStore } from '../src/context/store.js';
import { CONTEXT_RECEIPT_URI, MCP_APP_MIME_TYPE } from '../src/context/mcp-app.js';

const uiCapabilities = {
    extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [MCP_APP_MIME_TYPE] } },
};
const readOnlyPolicy = {
    clientId: 'receipt-test',
    scopes: ['personal'],
    maxSensitivity: 'personal',
    capabilities: ['read'],
};
const connections = [];
async function connect({ capabilities = uiCapabilities, policy = readOnlyPolicy, store } = {}) {
    store ||= new ContextStore({ dbPath: ':memory:' });
    const server = createContextMcpServer(store, { policy });
    const client = new Client({ name: 'any-client-name', version: '1' }, { capabilities });
    connections.push({ client, server, store });
    const [left, right] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(right), client.connect(left)]);
    return { client, server, store };
}
afterEach(async () => {
    const stores = new Set();
    for (const { client, server, store } of connections.splice(0)) {
        await client.close();
        await server.close();
        stores.add(store);
    }
    for (const store of stores) store.close();
    vi.restoreAllMocks();
});

describe('read-only MCP context receipt negotiation', () => {
    it('advertises only the compile card, and model-only tools, after exact UI negotiation', async () => {
        const { client } = await connect();
        const { tools } = await client.listTools();
        for (const tool of tools) {
            expect(tool._meta.ui.visibility).toEqual(['model']);
            expect(tool._meta.ui.resourceUri).toBe(
                tool.name === 'openself_compile_context' ? CONTEXT_RECEIPT_URI : undefined,
            );
        }
        expect(client.getServerCapabilities().tools.listChanged).toBe(true);
        expect(client.getServerCapabilities().resources.listChanged).toBe(true);
        const { resources } = await client.listResources();
        expect(resources.find((resource) => resource.uri === CONTEXT_RECEIPT_URI)).toMatchObject({
            mimeType: MCP_APP_MIME_TYPE,
        });
    });

    it.each([
        ['no extension', {}],
        [
            'wrong MIME',
            { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html'] } } },
        ],
        ['missing MIME', { extensions: { 'io.modelcontextprotocol/ui': {} } }],
        [
            'experimental fallback',
            { experimental: { 'io.modelcontextprotocol/ui': { mimeTypes: [MCP_APP_MIME_TYPE] } } },
        ],
    ])('keeps %s clients on unchanged text tools', async (_name, capabilities) => {
        const { client } = await connect({ capabilities });
        expect((await client.listTools()).tools.every((tool) => tool._meta === undefined)).toBe(
            true,
        );
        expect(
            (await client.listResources()).resources.some((r) => r.uri === CONTEXT_RECEIPT_URI),
        ).toBe(false);
        await expect(client.readResource({ uri: CONTEXT_RECEIPT_URI })).rejects.toThrow();
    });

    it.each([
        ['default trusted-local', undefined],
        ['remember', { ...readOnlyPolicy, capabilities: ['read', 'remember'] }],
        ['forget', { ...readOnlyPolicy, capabilities: ['read', 'forget'] }],
        ['propose', { ...readOnlyPolicy, capabilities: ['read', 'propose'] }],
        ['empty', { ...readOnlyPolicy, capabilities: [] }],
        ['write-only', { ...readOnlyPolicy, capabilities: ['remember'] }],
    ])('does not expose an app on %s backend policy', async (_name, policy) => {
        // Explicit undefined must reach the server, not connect's default policy.
        const store = new ContextStore({ dbPath: ':memory:' });
        const server = createContextMcpServer(store, { policy });
        const client = new Client(
            { name: 'claude', version: '1' },
            { capabilities: uiCapabilities },
        );
        connections.push({ client, server, store });
        const [left, right] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(right), client.connect(left)]);
        expect((await client.listTools()).tools.every((tool) => tool._meta === undefined)).toBe(
            true,
        );
        expect(
            (await client.listResources()).resources.some((r) => r.uri === CONTEXT_RECEIPT_URI),
        ).toBe(false);
        await expect(client.readResource({ uri: CONTEXT_RECEIPT_URI })).rejects.toThrow();
    });

    it('preserves exact text and structured output with or without UI support', async () => {
        const supported = await connect();
        supported.store.remember({
            content: 'Context receipt preserves source provenance',
            scope: 'personal',
        });
        const unsupported = await connect({ capabilities: {}, store: supported.store });
        const args = { query: 'context receipt', asOf: '2026-10-21T10:00:00Z' };
        const call = (client) =>
            client.callTool({ name: 'openself_compile_context', arguments: args });
        expect(await call(supported.client)).toEqual(await call(unsupported.client));
    });

    it('returns the same self-contained resource for different stores, without their secrets', async () => {
        const first = await connect();
        const second = await connect();
        first.store.remember({ content: 'PRIVATE_STORE_SENTINEL_123', scope: 'personal' });
        second.store.remember({ content: 'OTHER_STORE_SENTINEL_456', scope: 'personal' });
        const resource = await first.client.readResource({ uri: CONTEXT_RECEIPT_URI });
        expect(resource).toEqual(await second.client.readResource({ uri: CONTEXT_RECEIPT_URI }));
        expect(resource.contents).toHaveLength(1);
        const [content] = resource.contents;
        expect(content.mimeType).toBe(MCP_APP_MIME_TYPE);
        expect(content._meta.ui).toEqual({
            csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        });
        expect(content.text).toContain('Content-Security-Policy');
        expect(content.text).toContain("connect-src 'none'");
        expect(content.text).toContain('sha256-');
        expect(content.text).not.toMatch(
            /PRIVATE_STORE_SENTINEL|OTHER_STORE_SENTINEL|\{\{STYLE\}\}|\{\{SCRIPT\}\}|\/api\/|document\.cookie|localStorage|sessionStorage/,
        );
    });

    it('denies all mutations even with forged app or model origin metadata', async () => {
        const { client, store } = await connect();
        const memory = store.remember({ content: 'Existing retained memory', scope: 'personal' });
        for (const origin of ['app', 'model']) {
            for (const [name, args] of [
                ['openself_remember', { content: 'MALICIOUS_WRITE' }],
                ['openself_forget', { id: memory.id }],
                ['openself_propose_memory', { content: 'MALICIOUS_PROPOSAL' }],
            ]) {
                const result = await client.callTool({
                    name,
                    arguments: args,
                    _meta: {
                        'io.modelcontextprotocol/ui': { origin },
                        ui: { origin },
                        clientId: 'trusted-local',
                    },
                });
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain('Access denied by MCP policy');
            }
        }
        expect(store.db.prepare('SELECT content, status FROM memories').all()).toEqual([
            { content: memory.content, status: 'active' },
        ]);
        expect(store.listProposals()).toEqual([]);
    });
});
