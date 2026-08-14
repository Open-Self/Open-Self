import { afterEach, describe, expect, it } from 'vitest';
import { createContextMcpServer } from '../../../src/context/mcp.js';
import { ContextStore } from '../../../src/context/store.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Context MCP server', () => {
    let store;
    let server;
    let client;

    afterEach(async () => {
        await client?.close();
        await server?.close();
        store?.close();
    });

    it('exposes working remember and search tools', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        server = createContextMcpServer(store);
        client = new Client({ name: 'openself-test', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toEqual([
            'openself_remember',
            'openself_search_memory',
            'openself_get_context',
            'openself_forget',
        ]);

        await client.callTool({
            name: 'openself_remember',
            arguments: {
                type: 'decision',
                content: 'Use MCP as the agent interoperability layer',
                scope: 'project/openself',
            },
        });
        const result = await client.callTool({
            name: 'openself_search_memory',
            arguments: { query: 'MCP interoperability', scope: 'project/openself' },
        });

        const payload = JSON.parse(result.content[0].text);
        expect(payload.memories[0].content).toContain('interoperability');
    });
});
