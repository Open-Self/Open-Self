/**
 * Chat Memory — RAG over conversation history
 * Indexes conversations so the clone can reference past chats naturally
 */

import { LocalIndex } from 'vectra';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

export class ChatMemory {
    constructor(embedding, dataDir = './data') {
        this.embedding = embedding;
        this.dataDir = dataDir;
        this.indexDir = join(dataDir, 'memory-index');
        this.index = null;
        this.initialized = false;
    }

    /**
     * Initialize the vector index
     */
    async init() {
        if (this.initialized) return;

        if (!existsSync(this.indexDir)) {
            mkdirSync(this.indexDir, { recursive: true });
        }

        this.index = new LocalIndex(this.indexDir);

        if (!await this.index.isIndexCreated()) {
            await this.index.createIndex();
        }

        this.initialized = true;
    }

    /**
     * Index all parsed conversations into vector store
     */
    async indexHistory(conversations, options = {}) {
        await this.init();

        const batchSize = options.batchSize || 20;
        let indexed = 0;

        // Build vocabulary for local embeddings
        if (this.embedding.buildVocabulary) {
            const allTexts = conversations.map(c =>
                `${c.contact || 'Someone'}: ${c.theirMessage}\nYou: ${c.yourReply}`
            );
            this.embedding.buildVocabulary(allTexts);
        }

        for (let i = 0; i < conversations.length; i += batchSize) {
            const batch = conversations.slice(i, i + batchSize);

            for (const conv of batch) {
                const text = `${conv.contact || 'Someone'}: ${conv.theirMessage}\nYou: ${conv.yourReply}`;

                try {
                    const vector = await this.embedding.embed(text);
                    await this.index.insertItem({
                        vector,
                        metadata: {
                            contact: conv.contact || 'Unknown',
                            date: conv.date || '',
                            theirMessage: conv.theirMessage,
                            yourReply: conv.yourReply,
                            text,
                        },
                    });
                    indexed++;
                } catch (err) {
                    // Skip failed embeddings silently
                }
            }
        }

        return indexed;
    }

    /**
     * Find relevant past conversations for an incoming message
     */
    async findRelevant(message, contact = '', topK = 5) {
        await this.init();

        const vector = await this.embedding.embed(message);
        const results = await this.index.queryItems(vector, topK * 2); // Fetch extra for filtering

        // Score and rank results
        const scored = results.map(r => {
            let score = r.score;

            // Boost conversations with the same contact (+20%)
            if (contact && r.item.metadata.contact === contact) {
                score += 0.2;
            }

            return { ...r, adjustedScore: score };
        });

        // Sort by adjusted score and take top K
        scored.sort((a, b) => b.adjustedScore - a.adjustedScore);

        return scored.slice(0, topK).map(r => ({
            text: r.item.metadata.text,
            contact: r.item.metadata.contact,
            score: r.adjustedScore,
            theirMessage: r.item.metadata.theirMessage,
            yourReply: r.item.metadata.yourReply,
        }));
    }

    /**
     * Format retrieved memories as context for the LLM prompt
     */
    formatContext(memories) {
        if (!memories || memories.length === 0) return '';

        return memories
            .map((m, i) => `[Memory ${i + 1}] ${m.text}`)
            .join('\n\n');
    }

    /**
     * Get index stats
     */
    async getStats() {
        await this.init();
        const items = await this.index.listItems();
        return {
            totalMemories: items.length,
            indexDir: this.indexDir,
        };
    }
}
