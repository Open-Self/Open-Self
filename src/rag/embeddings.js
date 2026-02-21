/**
 * Embedding Providers
 * Generate vector embeddings for RAG memory search
 */

import OpenAI from 'openai';

/**
 * OpenAI Embedding Provider
 * Uses text-embedding-3-small (cheapest, fast)
 */
export class OpenAIEmbedding {
    constructor(config = {}) {
        this.client = new OpenAI({
            apiKey: config.apiKey || process.env.OPENAI_API_KEY,
        });
        this.model = config.model || 'text-embedding-3-small';
        this.dimensions = 256; // Compact for local storage
    }

    async embed(text) {
        const response = await this.client.embeddings.create({
            model: this.model,
            input: text,
            dimensions: this.dimensions,
        });
        return response.data[0].embedding;
    }

    async embedBatch(texts) {
        const response = await this.client.embeddings.create({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
        });
        return response.data.map(d => d.embedding);
    }

    get name() { return 'openai'; }
}

/**
 * Local TF-IDF Embedding (Zero-cost fallback)
 * No API key needed — works fully offline
 */
export class LocalEmbedding {
    constructor() {
        this.dimensions = 128;
        this.vocabulary = new Map();
        this.idf = new Map();
        this.docCount = 0;
    }

    /**
     * Build vocabulary from all texts for better embeddings
     */
    buildVocabulary(texts) {
        this.docCount = texts.length;
        const docFreq = new Map();

        for (const text of texts) {
            const words = this._tokenize(text);
            const uniqueWords = new Set(words);

            for (const word of uniqueWords) {
                docFreq.set(word, (docFreq.get(word) || 0) + 1);
            }

            for (const word of words) {
                if (!this.vocabulary.has(word)) {
                    this.vocabulary.set(word, this.vocabulary.size);
                }
            }
        }

        // Calculate IDF
        for (const [word, freq] of docFreq) {
            this.idf.set(word, Math.log(this.docCount / (1 + freq)));
        }
    }

    async embed(text) {
        const words = this._tokenize(text);
        const vector = new Array(this.dimensions).fill(0);

        // TF-IDF weighted hash-based embedding
        const tf = new Map();
        for (const word of words) {
            tf.set(word, (tf.get(word) || 0) + 1);
        }

        for (const [word, count] of tf) {
            const tfidf = (count / words.length) * (this.idf.get(word) || 1);
            // Hash word into vector dimensions
            const hash = this._hashWord(word);
            for (let i = 0; i < 3; i++) {
                const idx = (hash + i * 37) % this.dimensions;
                vector[idx] += tfidf * (i % 2 === 0 ? 1 : -1);
            }
        }

        // Normalize
        const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
        return vector.map(v => v / norm);
    }

    async embedBatch(texts) {
        return Promise.all(texts.map(t => this.embed(t)));
    }

    _tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
    }

    _hashWord(word) {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
            hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }

    get name() { return 'local'; }
}

/**
 * Auto-detect embedding provider
 */
export function createEmbedding(config = {}) {
    if (config.provider === 'local' || !process.env.OPENAI_API_KEY) {
        return new LocalEmbedding();
    }
    return new OpenAIEmbedding(config);
}
