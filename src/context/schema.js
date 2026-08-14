import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const MEMORY_TYPES = [
    'fact',
    'preference',
    'decision',
    'commitment',
    'relationship',
    'event',
    'note',
];

export const SENSITIVITY_LEVELS = ['public', 'personal', 'private', 'restricted'];

const optionalDate = z.string().datetime({ offset: true }).optional().nullable();

export const memoryInputSchema = z.object({
    id: z.string().uuid().optional(),
    type: z.enum(MEMORY_TYPES).default('note'),
    content: z.string().trim().min(1).max(20_000),
    summary: z.string().trim().max(500).optional().default(''),
    source: z
        .object({
            kind: z.string().trim().min(1).max(50).default('manual'),
            locator: z.string().trim().max(2_000).optional().default(''),
            title: z.string().trim().max(300).optional().default(''),
        })
        .optional()
        .default({ kind: 'manual', locator: '', title: '' }),
    scope: z.string().trim().min(1).max(200).default('personal'),
    sensitivity: z.enum(SENSITIVITY_LEVELS).default('personal'),
    confidence: z.number().min(0).max(1).default(1),
    validFrom: optionalDate,
    validTo: optionalDate,
    occurredAt: optionalDate,
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
});

export function normalizeMemory(input, now = new Date()) {
    const parsed = memoryInputSchema.parse(input);
    const timestamp = now.toISOString();

    if (parsed.validFrom && parsed.validTo && parsed.validFrom > parsed.validTo) {
        throw new Error('validFrom must be before validTo');
    }

    return {
        ...parsed,
        id: parsed.id || randomUUID(),
        tags: [...new Set(parsed.tags.map((tag) => tag.toLowerCase()))],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}
