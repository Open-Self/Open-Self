/**
 * Embedding providers — LocalEmbedding TF-IDF deterministic, shape checks
 */
import { describe, it, expect } from 'vitest';
import { LocalEmbedding, createEmbedding } from '../../../src/rag/embeddings.js';

describe('LocalEmbedding', () => {
    it('embed returns array of correct dimension (128)', async () => {
        const emb = new LocalEmbedding();
        const vector = await emb.embed('hello world test');
        expect(Array.isArray(vector)).toBe(true);
        expect(vector.length).toBe(128);
    });

    it('all vector values are finite numbers', async () => {
        const emb = new LocalEmbedding();
        const vector = await emb.embed('some text here');
        expect(vector.every((v) => Number.isFinite(v))).toBe(true);
    });

    it('normalized vector has unit length (approx 1.0)', async () => {
        const emb = new LocalEmbedding();
        const vector = await emb.embed('hello world');
        const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
        // Allow small floating-point tolerance
        expect(norm).toBeCloseTo(1.0, 5);
    });

    it('embed is deterministic for same input', async () => {
        const emb = new LocalEmbedding();
        const v1 = await emb.embed('same text');
        const v2 = await emb.embed('same text');
        expect(v1).toEqual(v2);
    });

    it('different texts produce different vectors', async () => {
        const emb = new LocalEmbedding();
        const v1 = await emb.embed('hello world');
        const v2 = await emb.embed('completely different content');
        expect(v1).not.toEqual(v2);
    });

    it('embedBatch returns array of vectors', async () => {
        const emb = new LocalEmbedding();
        const texts = ['first text', 'second text', 'third text'];
        const vectors = await emb.embedBatch(texts);
        expect(vectors.length).toBe(3);
        expect(vectors.every((v) => v.length === 128)).toBe(true);
    });

    it('buildVocabulary improves IDF weighting without throwing', () => {
        const emb = new LocalEmbedding();
        const texts = ['hello world', 'world peace', 'hello there'];
        expect(() => emb.buildVocabulary(texts)).not.toThrow();
        expect(emb.idf.size).toBeGreaterThan(0);
    });

    it('name property is "local"', () => {
        const emb = new LocalEmbedding();
        expect(emb.name).toBe('local');
    });

    it('handles empty string without throwing', async () => {
        const emb = new LocalEmbedding();
        const vector = await emb.embed('');
        expect(vector.length).toBe(128);
    });
});

describe('createEmbedding', () => {
    it('returns LocalEmbedding when provider=local', () => {
        const emb = createEmbedding({ provider: 'local' });
        expect(emb.name).toBe('local');
    });

    it('returns LocalEmbedding when no OPENAI_API_KEY in env', () => {
        const saved = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        const emb = createEmbedding({});
        expect(emb.name).toBe('local');
        if (saved) process.env.OPENAI_API_KEY = saved;
    });
});
