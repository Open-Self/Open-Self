import { describe, expect, it } from 'vitest';
import { cosineSimilarity, LocalVectorEncoder } from '../../../src/context/vectors.js';

describe('LocalVectorEncoder', () => {
    const encoder = new LocalVectorEncoder();

    it('is deterministic and produces normalized vectors', () => {
        const first = encoder.encode('Use SQLite for local storage');
        const second = encoder.encode('Use SQLite for local storage');
        const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

        expect(first).toEqual(second);
        expect(first).toHaveLength(256);
        expect(norm).toBeCloseTo(1, 8);
    });

    it('maps related database aliases closer than unrelated text', () => {
        const query = encoder.encode('Which db did we choose?');
        const related = encoder.encode('PostgreSQL is the storage backend');
        const unrelated = encoder.encode('Book a summer holiday by the ocean');

        expect(cosineSimilarity(query, related)).toBeGreaterThan(
            cosineSimilarity(query, unrelated),
        );
    });

    it('returns zero for empty or incompatible vectors', () => {
        expect(cosineSimilarity([], [])).toBe(0);
        expect(cosineSimilarity([1], [1, 2])).toBe(0);
        expect(encoder.encode('')).toEqual(new Array(256).fill(0));
    });
});
