import { describe, expect, it } from 'vitest';
import { normalizeMemory } from '../../../src/context/schema.js';

describe('context memory schema', () => {
    it('normalizes defaults and deduplicates tags', () => {
        const memory = normalizeMemory(
            {
                content: 'Use SQLite for local persistence',
                type: 'decision',
                tags: ['Database', 'database', 'Local'],
            },
            new Date('2026-08-13T12:00:00.000Z'),
        );

        expect(memory.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(memory.scope).toBe('personal');
        expect(memory.sensitivity).toBe('personal');
        expect(memory.tags).toEqual(['database', 'local']);
        expect(memory.createdAt).toBe('2026-08-13T12:00:00.000Z');
    });

    it('rejects invalid temporal ranges', () => {
        expect(() =>
            normalizeMemory({
                content: 'Temporary preference',
                validFrom: '2026-08-14T00:00:00.000Z',
                validTo: '2026-08-13T00:00:00.000Z',
            }),
        ).toThrow('validFrom must be before validTo');
    });

    it('rejects unknown memory types and empty content', () => {
        expect(() => normalizeMemory({ content: '', type: 'thought' })).toThrow();
    });
});
