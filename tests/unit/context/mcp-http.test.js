import { afterEach, describe, expect, it } from 'vitest';
import { createMcpHttpApp, runContextMcpHttpServer } from '../../../src/context/mcp-http.js';
import { ContextStore } from '../../../src/context/store.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

describe('MCP streamable HTTP transport', () => {
    let store;
    let instance;
    let client;

    afterEach(async () => {
        await client?.close().catch(() => {});
        await instance?.close();
        store?.close();
        client = instance = store = null;
    });

    it('refuses non-loopback binds without --allow-remote and remote without a token', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        await expect(runContextMcpHttpServer({ store, host: '0.0.0.0', port: 0 })).rejects.toThrow(
            'Refusing to bind',
        );
        await expect(
            runContextMcpHttpServer({ store, host: '0.0.0.0', port: 0, allowRemote: true }),
        ).rejects.toThrow('requires an explicit --token');
    });

    it('requires bearer authentication and rejects foreign Host headers', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        instance = await runContextMcpHttpServer({ store, port: 0 });
        expect(instance.generatedToken).toBe(true);
        const url = `http://127.0.0.1:${instance.port}/mcp`;

        const unauthorized = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
        });
        expect(unauthorized.status).toBe(401);

        // fetch() cannot spoof Host — use a raw HTTP request for the
        // DNS-rebinding defense check.
        const { request } = await import('node:http');
        const rebinding = await new Promise((resolve, reject) => {
            const req = request(
                {
                    host: '127.0.0.1',
                    port: instance.port,
                    path: '/mcp',
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        host: 'evil.example.com',
                        authorization: `Bearer ${instance.token}`,
                    },
                },
                (res) => {
                    res.resume();
                    resolve(res.statusCode);
                },
            );
            req.on('error', reject);
            req.end('{}');
        });
        expect(rebinding).toBe(403);
    });

    it('serves a full MCP session over authenticated stateless HTTP', async () => {
        store = new ContextStore({ dbPath: ':memory:' });
        store.remember({
            type: 'decision',
            content: 'Atlas uses SQLite for offline portability',
            scope: 'project/atlas',
        });
        instance = await runContextMcpHttpServer({ store, port: 0, token: 'test-token' });

        client = new Client({ name: 'http-test', version: '1.0.0' });
        await client.connect(
            new StreamableHTTPClientTransport(new URL(instance.url), {
                requestInit: {
                    headers: { authorization: `Bearer ${instance.token}` },
                },
            }),
        );
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toContain('openself_get_context');
        const result = await client.callTool({
            name: 'openself_get_context',
            arguments: { query: 'what database does Atlas use', scope: 'project/atlas' },
        });
        expect(result.structuredContent.context).toContain('SQLite');
    });

    it('createMcpHttpApp generates a token when none is supplied', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const { app, token, generatedToken } = createMcpHttpApp({ store });
        expect(app).toBeTruthy();
        expect(generatedToken).toBe(true);
        expect(token.length).toBeGreaterThan(20);
    });
});
