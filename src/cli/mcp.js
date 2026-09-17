import { AccessAudit } from '../context/access-audit.js';
import { join, dirname } from 'node:path';
import { ContextStore } from '../context/store.js';
import { AccessPolicy, loadMcpPolicy } from '../context/access-policy.js';

export async function mcpCommand(options = {}) {
    // Keep the relatively heavy MCP SDK off the startup path for every other CLI command.
    const dataDir = options.dataDir || process.env.DATA_DIR || './data';
    const policyFile = options.policy;
    const clientId = options.client;
    if (Boolean(policyFile) !== Boolean(clientId)) {
        throw new Error('--policy and --client must be supplied together');
    }
    const policy = policyFile ? loadMcpPolicy(policyFile, clientId) : undefined;
    // Validate owner policy before creating or migrating any vault files.
    new AccessPolicy(policy);

    if (options.http) {
        const { runContextMcpHttpServer } = await import('../context/mcp-http.js');
        const store = new ContextStore({ dataDir, embeddings: options.embeddings });
        const audit = new AccessAudit({
            dbPath:
                store.dbPath === ':memory:'
                    ? ':memory:'
                    : join(dirname(store.dbPath), 'mcp-audit.db'),
            retentionDays: toInt(options.auditRetentionDays, 30),
            maxEntries: toInt(options.auditMaxEntries, 10_000),
        });
        const instance = await runContextMcpHttpServer({
            store,
            policy,
            audit,
            host: options.host,
            port: options.port,
            token: options.token,
            allowRemote: Boolean(options.allowRemote),
        });
        console.error(`OpenSelf MCP (streamable HTTP) listening at ${instance.url}`);
        if (instance.generatedToken) {
            console.error(`Generated bearer token: ${instance.token}`);
            console.error('Pass it to the client as an Authorization: Bearer credential.');
        } else {
            console.error('Bearer authentication is enabled.');
        }
        const stop = () => {
            instance.close().then(() => {
                audit.close();
                store.close();
                process.exit(0);
            });
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        return;
    }

    const { runContextMcpServer } = await import('../context/mcp.js');
    await runContextMcpServer({
        ...options,
        policyFile,
        clientId,
        dataDir,
    });
}

function toInt(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}
