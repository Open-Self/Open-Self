import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ContextStore } from './store.js';
import { MEMORY_TYPES, SENSITIVITY_LEVELS } from './schema.js';

export function createContextMcpServer(store, options = {}) {
    const server = new McpServer({
        name: 'openself-context',
        version: options.version || '0.8.0',
    });

    server.registerTool(
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
        async (input) => {
            const memory = store.remember({
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
            });
            return textResult({ stored: true, memory });
        },
    );

    server.registerTool(
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
                limit: z.number().int().min(1).max(50).default(10),
            },
        },
        async (input) => textResult({ memories: store.search(input.query, input) }),
    );

    server.registerTool(
        'openself_get_context',
        {
            description:
                'Build a compact, source-attributed context block for a task without exposing restricted memories by default.',
            inputSchema: {
                query: z.string().min(1).max(2_000),
                scope: z.string().max(200).optional(),
                maxSensitivity: z.enum(SENSITIVITY_LEVELS).default('private'),
                maxChars: z.number().int().min(500).max(50_000).default(8_000),
                limit: z.number().int().min(1).max(50).default(12),
            },
        },
        async (input) => textResult(store.buildContext(input.query, input)),
    );

    server.registerTool(
        'openself_forget',
        {
            description:
                'Forget a memory by ID. This is a recoverable soft-delete and removes it from search/context.',
            inputSchema: { id: z.string().uuid() },
        },
        async ({ id }) => textResult({ forgotten: store.forget(id), id }),
    );

    return server;
}

export async function runContextMcpServer(options = {}) {
    const store = options.store || new ContextStore({ dataDir: options.dataDir });
    const server = createContextMcpServer(store, options);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return { server, store };
}

function textResult(value) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}
