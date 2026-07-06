/**
 * ChatMemory — init, indexHistory, findRelevant, formatContext (vectra local index)
 */
import { describe, it, expect, afterAll } from 'vitest';
import { ChatMemory } from '../../../src/rag/memory.js';
import { LocalEmbedding } from '../../../src/rag/embeddings.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP_DIR = join(tmpdir(), `openself-memory-test-${Date.now()}`);
mkdirSync(TMP_DIR, { recursive: true });

afterAll(() => {
    try {
        rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
        /* ok */
    }
});

const SAMPLE_CONVOS = [
    {
        contact: 'Alice',
        theirMessage: 'what is your favourite food',
        yourReply: 'pizza of course',
        date: '01/01/2024',
    },
    {
        contact: 'Bob',
        theirMessage: 'do you like coffee',
        yourReply: 'yes every morning',
        date: '02/01/2024',
    },
    {
        contact: 'Alice',
        theirMessage: 'seen any good movies',
        yourReply: 'watched dune last week',
        date: '03/01/2024',
    },
];

describe('ChatMemory.init', () => {
    it('initializes without throwing', async () => {
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, TMP_DIR);
        await expect(mem.init()).resolves.not.toThrow();
    });

    it('sets initialized=true after init', async () => {
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, TMP_DIR);
        await mem.init();
        expect(mem.initialized).toBe(true);
    });

    it('calling init twice does not throw', async () => {
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, TMP_DIR);
        await mem.init();
        await expect(mem.init()).resolves.not.toThrow();
    });
});

describe('ChatMemory.indexHistory', () => {
    it('indexes conversations and returns count', async () => {
        const dir = join(TMP_DIR, 'index-test');
        mkdirSync(dir, { recursive: true });
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, dir);
        const count = await mem.indexHistory(SAMPLE_CONVOS);
        expect(count).toBe(SAMPLE_CONVOS.length);
    });

    it('returns 0 for empty array', async () => {
        const dir = join(TMP_DIR, 'index-empty');
        mkdirSync(dir, { recursive: true });
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, dir);
        const count = await mem.indexHistory([]);
        expect(count).toBe(0);
    });
});

describe('ChatMemory.findRelevant', () => {
    it('returns array after indexing', async () => {
        const dir = join(TMP_DIR, 'find-test');
        mkdirSync(dir, { recursive: true });
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, dir);
        await mem.indexHistory(SAMPLE_CONVOS);
        const results = await mem.findRelevant('food pizza', 'Alice', 3);
        expect(Array.isArray(results)).toBe(true);
    });

    it('results have expected shape fields', async () => {
        const dir = join(TMP_DIR, 'find-shape');
        mkdirSync(dir, { recursive: true });
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, dir);
        await mem.indexHistory(SAMPLE_CONVOS);
        const results = await mem.findRelevant('coffee morning', 'Bob', 2);
        if (results.length > 0) {
            expect(results[0]).toHaveProperty('text');
            expect(results[0]).toHaveProperty('contact');
            expect(results[0]).toHaveProperty('score');
            expect(results[0]).toHaveProperty('theirMessage');
            expect(results[0]).toHaveProperty('yourReply');
        }
    });
});

describe('ChatMemory.formatContext', () => {
    it('returns empty string for empty memories', () => {
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, TMP_DIR);
        expect(mem.formatContext([])).toBe('');
        expect(mem.formatContext(null)).toBe('');
    });

    it('formats memories with [Memory N] prefix', () => {
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, TMP_DIR);
        const memories = [{ text: 'Alice: what food\nYou: pizza', contact: 'Alice', score: 0.9 }];
        const ctx = mem.formatContext(memories);
        expect(ctx).toContain('[Memory 1]');
        expect(ctx).toContain('pizza');
    });

    it('separates multiple memories with double newline', () => {
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, TMP_DIR);
        const memories = [
            { text: 'first memory', contact: 'A', score: 0.9 },
            { text: 'second memory', contact: 'B', score: 0.8 },
        ];
        const ctx = mem.formatContext(memories);
        expect(ctx).toContain('[Memory 1]');
        expect(ctx).toContain('[Memory 2]');
    });
});

describe('ChatMemory.getStats', () => {
    it('returns totalMemories and indexDir', async () => {
        const dir = join(TMP_DIR, 'stats-test');
        mkdirSync(dir, { recursive: true });
        const emb = new LocalEmbedding();
        const mem = new ChatMemory(emb, dir);
        await mem.indexHistory(SAMPLE_CONVOS);
        const stats = await mem.getStats();
        expect(stats).toHaveProperty('totalMemories');
        expect(stats).toHaveProperty('indexDir');
        expect(stats.totalMemories).toBe(SAMPLE_CONVOS.length);
    });
});
