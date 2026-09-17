import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import {
    featureHashProvider,
    OllamaEmbeddingProvider,
    OpenAiCompatibleProvider,
    resolveVectorProvider,
} from '../../../src/context/embeddings.js';

const stores = [];
function openStore(options = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'openself-embed-'));
    const store = new ContextStore({ dataDir: dir, ...options });
    stores.push({ store, dir });
    return store;
}

afterEach(() => {
    while (stores.length) {
        const { store, dir } = stores.pop();
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('resolveVectorProvider', () => {
    it('defaults to the offline feature-hash provider', () => {
        const provider = resolveVectorProvider(undefined, {});
        expect(provider.name).toBe('feature-hash');
        expect(typeof provider.encodeSync).toBe('function');
    });

    it('honors OPENSELF_EMBEDDINGS selection', () => {
        const provider = resolveVectorProvider(undefined, {
            OPENSELF_EMBEDDINGS: 'ollama',
        });
        expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
    });

    it('rejects unknown providers with a helpful error', () => {
        expect(() => resolveVectorProvider('bogus', {})).toThrow('Unknown embeddings provider');
    });

    it('accepts a custom provider object with encode + model', () => {
        const custom = { model: 'custom-v1', encodeSync: (t) => [t.length] };
        expect(resolveVectorProvider(custom, {})).toBe(custom);
        expect(() => resolveVectorProvider({ encodeSync: () => [] }, {})).toThrow('model');
    });
});

describe('OllamaEmbeddingProvider', () => {
    it('posts batched input to /api/embed and returns vectors', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                embeddings: [
                    [0.1, 0.2],
                    [0.3, 0.4],
                ],
            }),
        });
        const provider = new OllamaEmbeddingProvider({ baseUrl: 'http://x:1', fetch });
        const vectors = await provider.batchEncode(['a', 'b']);
        expect(fetch).toHaveBeenCalledWith(
            'http://x:1/api/embed',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(vectors).toEqual([
            [0.1, 0.2],
            [0.3, 0.4],
        ]);
    });

    it('explains how to fix an unreachable server', async () => {
        const provider = new OllamaEmbeddingProvider({
            baseUrl: 'http://127.0.0.1:1',
            fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        });
        await expect(provider.encode('x')).rejects.toThrow('ollama serve');
    });

    it('rejects malformed payloads', async () => {
        const provider = new OllamaEmbeddingProvider({
            fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
        });
        await expect(provider.encode('x')).rejects.toThrow('unexpected');
    });
});

describe('OpenAiCompatibleProvider', () => {
    it('requires a base URL and model', () => {
        expect(() => new OpenAiCompatibleProvider({})).toThrow('BASE_URL');
        expect(() => new OpenAiCompatibleProvider({ baseUrl: 'http://x' })).toThrow('MODEL');
    });

    it('posts to /embeddings with a bearer key and unwraps data', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ embedding: [1, 2] }] }),
        });
        const provider = new OpenAiCompatibleProvider({
            baseUrl: 'https://api.example/v1',
            model: 'm',
            apiKey: 'k',
            fetch,
        });
        const [vector] = await provider.batchEncode(['hello']);
        const [, init] = fetch.mock.calls[0];
        expect(fetch.mock.calls[0][0]).toBe('https://api.example/v1/embeddings');
        expect(init.headers.authorization).toBe('Bearer k');
        expect(vector).toEqual([1, 2]);
    });
});

describe('async provider integration', () => {
    function fakeAsyncProvider() {
        return {
            name: 'fake-async',
            model: 'fake-async-v1',
            encode: async (text) => featureHashProvider().encodeSync(text),
            batchEncode: async (texts) =>
                texts.map((text) => featureHashProvider().encodeSync(text)),
        };
    }

    it('stores memories without blocking, then indexes via indexPending()', async () => {
        const store = openStore({ embeddings: fakeAsyncProvider() });
        store.remember({ content: 'async provider indexes lazily' });
        // Synchronous write path must NOT call the async provider.
        expect(store.stats().pendingVectors).toBe(1);
        const result = await store.indexPending();
        expect(result.indexed).toBe(1);
        expect(store.stats().pendingVectors).toBe(0);
        expect(store.stats().vectorProvider).toBe('fake-async');
    });

    it('sync search never calls an async provider; searchAsync does', async () => {
        const provider = fakeAsyncProvider();
        const spy = vi.spyOn(provider, 'encode');
        const store = openStore({ embeddings: provider });
        store.remember({ content: 'semantic retrieval via async encoder' });
        await store.indexPending();
        spy.mockClear();
        expect(store.search('semantic', { retrieval: 'vector' })).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
        const hits = await store.searchAsync('semantic', { retrieval: 'vector' });
        expect(spy).toHaveBeenCalled();
        expect(hits.map((m) => m.content)).toContain('semantic retrieval via async encoder');
    });

    it('buildContextAsync and findPotentialConflictsAsync work with async providers', async () => {
        const store = openStore({ embeddings: fakeAsyncProvider() });
        store.remember({ content: 'Deploys run through GitHub Actions', type: 'fact' });
        await store.indexPending();
        const context = await store.buildContextAsync('deploys', { explain: true });
        expect(context.receipt.contextHash).toMatch(/^[0-9a-f]{64}$/);
        const conflicts = await store.findPotentialConflictsAsync({
            content: 'Deploys run through GitHub Actions',
            type: 'fact',
        });
        expect(Array.isArray(conflicts)).toBe(true);
    });

    it('sync mutation APIs stay usable and do not throw with async providers', () => {
        const store = openStore({ embeddings: fakeAsyncProvider() });
        const memory = store.remember({ content: 'plain write' });
        expect(memory.id).toBeTruthy();
        expect(store.get(memory.id).content).toBe('plain write');
        expect(() => store.forget(memory.id)).not.toThrow();
    });
});
