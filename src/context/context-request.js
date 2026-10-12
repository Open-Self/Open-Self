import { z } from 'zod';
import {
    contextDateSchema,
    MEMORY_TYPES,
    SENSITIVITY_LEVELS,
    SOURCE_TRUST_LEVELS,
} from './schema.js';

/** Version of the compilation pipeline — recorded on every receipt. */
export const COMPILER_VERSION = '1.2.0';

export const CONTEXT_FORMATS = ['block', 'json', 'markdown'];
export const RETRIEVAL_MODES = ['hybrid', 'lexical', 'vector'];

/**
 * Purpose hints steer ranking only — they never widen permissions. Unknown
 * purposes are accepted and treated as `general` so callers can evolve freely.
 */
export const PURPOSE_TYPE_AFFINITY = {
    general: {},
    coding: { decision: 1.15, fact: 1.1, preference: 1.1, note: 1.0 },
    debugging: { decision: 1.15, fact: 1.15, event: 1.05 },
    writing: { preference: 1.15, relationship: 1.1, fact: 1.0 },
    communication: { relationship: 1.2, preference: 1.15, commitment: 1.1 },
    planning: { commitment: 1.2, event: 1.15, decision: 1.05 },
    research: { fact: 1.15, note: 1.05, event: 1.0 },
    review: { decision: 1.1, fact: 1.1, commitment: 1.05 },
};

const scopeRoot = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !value.split('/').some((part) => !part || part === '.' || part === '..'));

const budgetSchema = z
    .object({
        maxChars: z.number().int().min(100).max(200_000).optional(),
        // Estimated tokens (chars/4) — a planning unit, not an authoritative
        // tokenizer contract for any downstream model.
        maxTokens: z.number().int().min(25).max(200_000).optional(),
        maxItems: z.number().int().min(1).max(500).optional(),
    })
    .strict();

/**
 * A Context Request — the single typed contract every interface normalizes
 * into before compilation. Requests express intent; authorization always
 * comes from the configured requester policy, never from request fields.
 */
export const contextRequestSchema = z
    .object({
        query: z.string().trim().max(2_000).optional(),
        task: z.string().trim().max(2_000).optional(),
        // Requester label for receipts. NOT an authorization input.
        agent: z.string().trim().min(1).max(64).optional(),
        purpose: z.string().trim().min(1).max(50).optional(),
        scope: scopeRoot.optional(),
        scopes: z.array(scopeRoot).max(50).optional(),
        type: z.enum(MEMORY_TYPES).optional(),
        entity: z.string().trim().min(1).max(200).optional(),
        maxSensitivity: z.enum(SENSITIVITY_LEVELS).optional(),
        minSourceTrust: z.enum(SOURCE_TRUST_LEVELS).optional(),
        asOf: contextDateSchema.optional(),
        budget: z.union([budgetSchema, z.number().int().min(100).max(200_000)]).optional(),
        // Compatibility aliases for the legacy buildContext option shape.
        maxChars: z.number().int().min(100).max(200_000).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        retrieval: z.enum(RETRIEVAL_MODES).default('hybrid'),
        format: z.enum(CONTEXT_FORMATS).default('block'),
        explain: z.boolean().default(false),
        includeSuperseded: z.boolean().default(false),
        includeStale: z.boolean().default(false),
    })
    .strict();

export function normalizeContextRequest(input = {}) {
    const parsed = contextRequestSchema.parse(input);
    const query = (parsed.query || parsed.task || '').trim();
    const rawBudget =
        typeof parsed.budget === 'number' ? { maxChars: parsed.budget } : parsed.budget;
    return {
        query,
        task: parsed.task || null,
        agent: parsed.agent || null,
        purpose: parsed.purpose || 'general',
        scope: parsed.scope || null,
        scopes: parsed.scopes ? [...new Set(parsed.scopes)] : null,
        type: parsed.type || null,
        entity: parsed.entity || null,
        maxSensitivity: parsed.maxSensitivity || null,
        minSourceTrust: parsed.minSourceTrust || null,
        asOf: parsed.asOf || new Date().toISOString(),
        budget: {
            maxChars: rawBudget?.maxChars ?? parsed.maxChars ?? undefined,
            maxTokens: rawBudget?.maxTokens ?? undefined,
            maxItems: rawBudget?.maxItems ?? parsed.limit ?? undefined,
        },
        retrieval: parsed.retrieval,
        format: parsed.format,
        explain: parsed.explain,
        includeSuperseded: parsed.includeSuperseded,
        includeStale: parsed.includeStale,
    };
}
