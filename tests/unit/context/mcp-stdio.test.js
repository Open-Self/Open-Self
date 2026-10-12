import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CLI = new URL('../../../src/cli/index.js', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1',
);

/**
 * Real stdio transport coverage: spawn `openself mcp` as a child process and
 * drive it with the SDK client — initialize, listTools, callTool, and policy
 * denial — over actual pipes, not the in-memory transport.
 */
describe('MCP stdio transport (real child process)', () => {
    const dirs = [];
    let client;
    let transport;

    afterEach(async () => {
        await client?.close().catch(() => {});
        await transport?.close().catch(() => {});
        client = transport = null;
        while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
    });

    async function connect(policy) {
        const dataDir = mkdtempSync(join(tmpdir(), 'openself-stdio-'));
        dirs.push(dataDir);
        const args = [CLI, 'mcp', '--data-dir', dataDir];
        if (policy) {
            const policyFile = join(dataDir, 'policy.json');
            // clientPolicy is strict — clientId lives in the map key, not the body.
            const { clientId: _clientId, ...body } = policy;
            writeFileSync(
                policyFile,
                JSON.stringify({ version: 2, clients: { 'stdio-reader': body } }),
            );
            args.push('--policy', policyFile, '--client', 'stdio-reader');
        }
        transport = new StdioClientTransport({
            command: process.execPath,
            args,
            stderr: 'pipe',
            // The SDK whitelists a minimal env by default; the spawned CLI
            // needs the real environment on Windows (cross-spawn/system vars).
            env: { ...process.env },
        });
        client = new Client({ name: 'stdio-test', version: '1.0.0' });
        await client.connect(transport);
        return client;
    }

    it('serves initialize/listTools/callTool over real stdio', { timeout: 30_000 }, async () => {
        const connected = await connect();
        const tools = await connected.listTools();
        expect(tools.tools.map((tool) => tool.name)).toContain('openself_compile_context');

        const written = await connected.callTool({
            name: 'openself_remember',
            arguments: {
                type: 'decision',
                content: 'stdio child process stores this decision',
                scope: 'project/stdio',
            },
        });
        expect(written.isError).toBeUndefined();

        const found = await connected.callTool({
            name: 'openself_search_memory',
            arguments: { query: 'child process decision', scope: 'project/stdio' },
        });
        const payload = JSON.parse(found.content[0].text);
        expect(payload.memories[0].content).toContain('stdio child process');
    });

    it(
        'enforces the owner policy file over stdio — scoped reads deny crossover',
        { timeout: 30_000 },
        async () => {
            const connected = await connect({
                clientId: 'stdio-reader',
                scopes: ['project/alpha'],
                maxSensitivity: 'private',
                capabilities: ['read'],
            });
            // Capability denial: read-only client cannot remember.
            const write = await connected.callTool({
                name: 'openself_remember',
                arguments: { content: 'unauthorized', scope: 'project/alpha' },
            });
            expect(write.isError).toBe(true);

            // Scope denial: a query outside the allowed roots fails closed.
            const cross = await connected.callTool({
                name: 'openself_search_memory',
                arguments: { query: 'anything', scope: 'project/beta' },
            });
            expect(cross.isError).toBe(true);
        },
    );
});
