import { dirname, join } from 'node:path';
import { AccessPolicy, loadMcpPolicy } from './access-policy.js';
import { AccessAudit } from './access-audit.js';
import { packageVersion } from '../version.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ContextStore } from './store.js';
import { MEMORY_TYPES, SENSITIVITY_LEVELS } from './schema.js';

export function createContextMcpServer(store, options = {}) {
    const policy = new AccessPolicy(options.policy);
    const audit =
        options.audit ||
        new AccessAudit({
            dbPath:
                store.dbPath === ':memory:'
                    ? ':memory:'
                    : join(dirname(store.dbPath), 'mcp-audit.db'),
            retentionDays: options.auditRetentionDays,
            maxEntries: options.auditMaxEntries,
        });
    const server = new McpServer({
        name: 'openself-context',
        version: options.version || packageVersion,
    });

    const close = server.close.bind(server);
    server.close = async () => {
        try {
            await close();
        } finally {
            if (!options.audit) audit.close();
        }
    };
    function register(name, configuration, handler) {
        server.registerTool(name, configuration, async (input) => {
            let event;
            try {
                event = audit.begin(policy.clientId, name);
                const capability =
                    name === 'openself_remember'
                        ? 'remember'
                        : name === 'openself_forget'
                          ? 'forget'
                          : 'read';
                policy.require(capability);
                const execute = () => {
                    const result = handler(input);
                    audit.finish(event, 'allowed');
                    return result;
                };
                // Memory mutations roll back if terminal audit recording fails.
                return capability === 'read'
                    ? execute()
                    : store.db.transaction(execute).immediate();
            } catch (error) {
                const denied = error.code === 'ACCESS_DENIED';
                if (event !== undefined) {
                    try {
                        audit.finish(event, denied ? 'denied' : 'error');
                    } catch {
                        /* The durable attempt remains available. */
                    }
                }
                return {
                    ...textResult({
                        error: denied ? 'Access denied by MCP policy' : 'MCP operation failed',
                    }),
                    isError: true,
                };
            }
        });
    }

    register(
        'openself_remember',
        {
            description:
                'Store a durable personal memory with provenance, scope, sensitivity, and time metadata.',
            inputSchema: {
                content: z.string().min(1).max(20_000),
                type: z.enum(MEMORY_TYPES).default('note'),
                summary: z.string().max(500).optional(),
                scope: z.string().max(200).default('personal'),
                sensitivity: z.enum(SENSITIVITY_LEVELS).default('personal'),
                confidence: z.number().min(0).max(1).default(1),
                sourceKind: z.string().max(50).default('agent'),
                sourceLocator: z.string().max(2_000).optional(),
                sourceTitle: z.string().max(300).optional(),
                occurredAt: z.string().datetime({ offset: true }).optional(),
                validFrom: z.string().datetime({ offset: true }).optional(),
                validTo: z.string().datetime({ offset: true }).optional(),
                tags: z.array(z.string().max(80)).max(50).default([]),
            },
        },
        (input) => {
            const draft = {
                content: input.content,
                type: input.type,
                summary: input.summary,
                scope: input.scope,
                sensitivity: input.sensitivity,
                confidence: input.confidence,
                source: {
                    kind: input.sourceKind,
                    locator: input.sourceLocator,
                    title: input.sourceTitle,
                },
                occurredAt: input.occurredAt,
                validFrom: input.validFrom,
                validTo: input.validTo,
                tags: input.tags,
            };
            policy.requireMemory(draft);
            const potentialConflicts = policy.capabilities.includes('read')
                ? store.findPotentialConflicts(draft, policy.readOptions({ scope: draft.scope }))
                : [];
            const memory = store.remember(draft);
            return textResult({ stored: true, memory, potentialConflicts });
        },
    );

    register(
        'openself_search_memory',
        {
            description:
                'Search active personal memories. Results include provenance and relevance.',
            inputSchema: {
                query: z.string().min(1).max(2_000),
                scope: z.string().max(200).optional(),
                type: z.enum(MEMORY_TYPES).optional(),
                maxSensitivity: z.enum(SENSITIVITY_LEVELS).default('private'),
                asOf: z.string().datetime({ offset: true }).optional(),
                retrieval: z.enum(['hybrid', 'lexical', 'vector']).default('hybrid'),
                limit: z.number().int().min(1).max(50).default(10),
            },
        },
        (input) => textResult({ memories: store.search(input.query, policy.readOptions(input)) }),
    );

    register(
        'openself_find_conflicts',
        {
            description:
                'Find potentially conflicting active facts, preferences, or decisions before storing a new memory.',
            inputSchema: {
                content: z.string().min(1).max(20_000),
                type: z.enum(['fact', 'preference', 'decision']),
                scope: z.string().max(200).default('personal'),
                validFrom: z.string().datetime({ offset: true }).optional(),
                validTo: z.string().datetime({ offset: true }).optional(),
                threshold: z.number().min(0).max(1).default(0.28),
                limit: z.number().int().min(1).max(50).default(10),
            },
        },
        (input) =>
            textResult({
                potentialConflicts: store.findPotentialConflicts(input, policy.readOptions(input)),
            }),
    );

    register(
        'openself_get_context',
        {
            description:
                'Build a compact, source-attributed context block for a task without exposing restricted memories by default.',
            inputSchema: {
                query: z.string().min(1).max(2_000),
                scope: z.string().max(200).optional(),
                maxSensitivity: z.enum(SENSITIVITY_LEVELS).default('private'),
                maxChars: z.number().int().min(500).max(50_000).default(8_000),
                retrieval: z.enum(['hybrid', 'lexical', 'vector']).default('hybrid'),
                limit: z.number().int().min(1).max(50).default(12),
            },
        },
        (input) => textResult(store.buildContext(input.query, policy.readOptions(input))),
    );

    register(
        'openself_forget',
        {
            description:
                'Forget a memory by ID. This is a recoverable soft-delete and removes it from search/context.',
            inputSchema: { id: z.string().uuid() },
        },
        ({ id }) =>
            store.db
                .transaction(() => {
                    const memory = store.db
                        .prepare(
                            "SELECT scope, sensitivity FROM memories WHERE id = ? AND status = 'active'",
                        )
                        .get(id);
                    policy.requireMemory(memory);
                    return textResult({ forgotten: store.forget(id), id });
                })
                .immediate(),
    );

    return server;
}

export async function runContextMcpServer(options = {}) {
    if (Boolean(options.policyFile) !== Boolean(options.clientId))
        throw new Error('--policy and --client must be supplied together');
    const policy = options.policyFile
        ? loadMcpPolicy(options.policyFile, options.clientId)
        : options.policy;
    // Validate owner policy before creating or migrating any vault files.
    new AccessPolicy(policy);
    const store = options.store || new ContextStore({ dataDir: options.dataDir });
    let server;
    try {
        server = createContextMcpServer(store, { ...options, policy });
        await server.connect(new StdioServerTransport());
        return { server, store };
    } catch (error) {
        await server?.close();
        if (!options.store) store.close();
        throw error;
    }
}

function textResult(value) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}
