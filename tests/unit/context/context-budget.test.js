import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

describe.each([false, true])('context character budget (encrypted: %s)', (encrypted) => {
    let store;
    beforeEach(() => {
        store = new ContextStore({
            dbPath: ':memory:',
            ...(encrypted ? { encryptionKey: Buffer.alloc(32, 7) } : {}),
        });
    });
    afterEach(() => store.close());

    function remember(content, day, source = {}) {
        return store.remember({
            content,
            occurredAt: `2026-01-${day}T00:00:00.000Z`,
            source,
        });
    }

    it('skips oversized first and middle candidates while retaining complete smaller records', () => {
        remember('Large first record '.repeat(100), '04');
        const first = remember('A short decision', '03', { title: 'Architecture review' });
        remember('Large middle record '.repeat(100), '02');
        const second = remember('Another short decision', '01', { locator: 'notes.md' });

        const result = store.buildContext('!!!', { maxChars: 500 });
        expect(result.memories.map(({ id }) => id)).toEqual([first.id, second.id]);
        expect(result.context).toContain(first.content);
        expect(result.context).toContain('Source: Architecture review');
        expect(result.context).toContain(second.content);
        expect(result.context).toContain('Source: notes.md');
        expect(result.usedChars).toBe(result.context.length);
        expect(result.usedChars).toBeLessThanOrEqual(500);
    });

    it('counts separators at the exact inclusion boundary', () => {
        const first = remember('a'.repeat(240), '02');
        const second = remember('b'.repeat(240), '01');
        const full = store.buildContext('!!!', { maxChars: 2000 });
        const exact = store.buildContext('!!!', { maxChars: full.context.length });
        expect(exact.memories.map(({ id }) => id)).toEqual([first.id, second.id]);
        expect(exact.usedChars).toBe(full.context.length);

        const oneShort = store.buildContext('!!!', { maxChars: full.context.length - 1 });
        expect(oneShort.memories.map(({ id }) => id)).toEqual([first.id]);
        expect(oneShort.usedChars).toBe(oneShort.context.length);
    });

    it('returns an empty block when complete content and attribution cannot fit', () => {
        remember('Brief content '.repeat(18), '01', { title: 'Long source title '.repeat(15) });
        expect(store.buildContext('Brief', { maxChars: 500 })).toEqual({
            query: 'Brief',
            context: '',
            memories: [],
            usedChars: 0,
        });
    });

    it('counts Unicode using JavaScript string length without splitting text', () => {
        const memory = remember('Việt Nam 🌏 '.repeat(20), '01');
        const result = store.buildContext('Việt Nam', { maxChars: 500 });
        expect(result.memories.map(({ id }) => id)).toEqual([memory.id]);
        expect(result.context).toContain(memory.content);
        expect(result.usedChars).toBe(result.context.length);
        expect(result.usedChars).toBeLessThanOrEqual(500);
    });
});
