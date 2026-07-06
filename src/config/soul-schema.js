/**
 * Zod schema for parsed SOUL.md structure.
 * Catches malformed user-edited soul files BEFORE they reach the LLM
 * (where shape pollution could become a prompt-injection vector).
 *
 * All semantic fields are optional — the schema enforces shape (string
 * keys, no functions/arrays-where-strings-expected), not content. The
 * raw markdown is always carried as `rawContent`.
 */

import { z } from 'zod';

export const SoulSchema = z
    .object({
        rawContent: z.string(),
        name: z.string().max(200).optional(),
        language: z.string().max(200).optional(),
        avgMessageLength: z.union([z.string(), z.number()]).optional(),
        emojiFrequency: z.union([z.string(), z.number()]).optional(),
        catchphrases: z.string().max(2000).optional(),
        abbreviations: z.string().max(2000).optional(),
        avoidTopics: z.string().max(2000).optional(),
        unsureFallback: z.string().max(500).optional(),
        neverShare: z.string().max(2000).optional(),
    })
    .passthrough();

export function validateSoul(parsed) {
    const result = SoulSchema.safeParse(parsed);
    if (!result.success) {
        const err = new Error(
            `Invalid SOUL.md: ${result.error.issues.map((i) => i.message).join('; ')}`,
        );
        err.code = 'INVALID_SOUL';
        throw err;
    }
    return result.data;
}
