import { LocalVectorEncoder } from './vectors.js';

/**
 * Pluggable vector providers for semantic retrieval.
 *
 * A provider exposes:
 *   model      — string recorded on each stored vector (model changes trigger re-index)
 *   encode(text)        — Promise<number[]>; every provider supports this
 *   encodeSync?(text)   — number[] | undefined; synchronous providers only
 *   batchEncode?(texts) — Promise<number[][]>; batched indexing path
 *
 * `feature-hash` (default) is fully local and deterministic — it needs no
 * network, model download, or key. `ollama` embeds through a local Ollama
 * server (local-first, no SaaS). `openai-compatible` talks to any
 * /v1/embeddings-compatible endpoint and is the only provider that can leave
 * the machine — it is strictly opt-in via explicit configuration.
 *
 * Selection order: explicit option > OPENSELF_EMBEDDINGS > 'feature-hash'.
 */
export function resolveVectorProvider(spec, env = process.env) {
    if (spec && typeof spec === 'object') {
        if (typeof spec.encode !== 'function' && typeof spec.encodeSync !== 'function') {
            throw new Error('A custom vector provider needs encode() or encodeSync()');
        }
        if (!spec.model) throw new Error('A custom vector provider needs a model name');
        return spec;
    }
    const name = String(spec || env.OPENSELF_EMBEDDINGS || 'feature-hash').toLowerCase();
    switch (name) {
        case 'feature-hash':
        case 'hash':
        case 'local':
            return featureHashProvider();
        case 'ollama':
            return new OllamaEmbeddingProvider({
                baseUrl: env.OPENSELF_OLLAMA_URL || 'http://127.0.0.1:11434',
                model: env.OPENSELF_EMBEDDINGS_MODEL || 'nomic-embed-text',
            });
        case 'openai-compatible':
        case 'openai':
            return new OpenAiCompatibleProvider({
                baseUrl: env.OPENSELF_EMBEDDINGS_BASE_URL || 'https://api.openai.com/v1',
                model: env.OPENSELF_EMBEDDINGS_MODEL || 'text-embedding-3-small',
                apiKey: env.OPENSELF_EMBEDDINGS_API_KEY || env.OPENAI_API_KEY,
            });
        default:
            throw new Error(
                `Unknown embeddings provider "${name}". Use feature-hash, ollama, or openai-compatible.`,
            );
    }
}

export function featureHashProvider(options = {}) {
    const encoder = new LocalVectorEncoder(options);
    return {
        name: 'feature-hash',
        model: encoder.model,
        encodeSync: (text) => encoder.encode(text),
        encode: async (text) => encoder.encode(text),
        batchEncode: async (texts) => texts.map((text) => encoder.encode(text)),
    };
}

export class OllamaEmbeddingProvider {
    constructor(options = {}) {
        this.name = 'ollama';
        this.baseUrl = String(options.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
        this.model = options.model || 'nomic-embed-text';
        this.timeoutMs = options.timeoutMs || 30_000;
        this.fetch = options.fetch || globalThis.fetch;
    }

    async encode(text) {
        return (await this.batchEncode([text]))[0];
    }

    async batchEncode(texts) {
        if (!texts.length) return [];
        const response = await this.fetch(`${this.baseUrl}/api/embed`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: this.model, input: texts }),
            signal: AbortSignal.timeout(this.timeoutMs),
        }).catch((error) => {
            throw new Error(
                `Ollama embeddings unreachable at ${this.baseUrl} — run "ollama serve" and ` +
                    `"ollama pull ${this.model}", or unset OPENSELF_EMBEDDINGS (${error.message})`,
            );
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(
                `Ollama /api/embed failed (${response.status}) — ` +
                    `is "${this.model}" pulled? ${detail.slice(0, 200)}`,
            );
        }
        const body = await response.json();
        const embeddings = body?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
            throw new Error('Ollama returned an unexpected embeddings payload');
        }
        return embeddings;
    }
}

export class OpenAiCompatibleProvider {
    constructor(options = {}) {
        this.name = 'openai-compatible';
        this.baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
        this.model = options.model;
        this.apiKey = options.apiKey;
        this.timeoutMs = options.timeoutMs || 30_000;
        this.fetch = options.fetch || globalThis.fetch;
        if (!this.baseUrl) {
            throw new Error('openai-compatible embeddings need OPENSELF_EMBEDDINGS_BASE_URL');
        }
        if (!this.model) {
            throw new Error('openai-compatible embeddings need OPENSELF_EMBEDDINGS_MODEL');
        }
    }

    async encode(text) {
        return (await this.batchEncode([text]))[0];
    }

    async batchEncode(texts) {
        if (!texts.length) return [];
        const headers = { 'content-type': 'application/json' };
        if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
        const response = await this.fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: this.model, input: texts }),
            signal: AbortSignal.timeout(this.timeoutMs),
        }).catch((error) => {
            throw new Error(`Embeddings endpoint ${this.baseUrl} unreachable (${error.message})`);
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(
                `Embeddings endpoint failed (${response.status}): ${detail.slice(0, 200)}`,
            );
        }
        const body = await response.json();
        const data = body?.data;
        if (!Array.isArray(data) || data.length !== texts.length) {
            throw new Error('Embeddings endpoint returned an unexpected payload');
        }
        return data.map((item) => item.embedding);
    }
}
