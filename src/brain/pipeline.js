/**
 * Clone Pipeline — Full message processing flow
 * RAG lookup → Brain prompt → LLM → Safety check → Mimicry → Reply
 */

import { CloneBrain, loadSoul } from './clone.js';
import { createProvider, autoDetectProvider } from './router.js';
import { ChatMemory } from '../rag/memory.js';
import { createEmbedding } from '../rag/embeddings.js';
import { ConversationMemory } from '../memory/conversation.js';
import { SafetyGuard } from '../safety/guard.js';
import { ReviewQueue } from '../safety/review-queue.js';
import { HumanMimicry } from '../mimicry/humanlike.js';
import { StyleProcessor } from '../mimicry/style.js';
import { cleanAIReveal } from '../safety/ai-detection.js';
import { loadConfig } from '../config/loader.js';

export class ClonePipeline {
    constructor(options = {}) {
        this.config = options.config || loadConfig();
        this.dataDir = options.dataDir || this.config.data?.dir || './data';

        // Core components
        const soulContent = loadSoul(this.dataDir);
        this.brain = new CloneBrain(soulContent, this.config);
        this.provider = options.provider || createProvider(
            this.config.llm?.provider || autoDetectProvider()
        );

        // Memory
        const embedding = createEmbedding();
        this.chatMemory = new ChatMemory(embedding, this.dataDir);
        this.conversationMemory = new ConversationMemory(this.dataDir);

        // Safety
        this.guard = new SafetyGuard(this.brain.soul);
        this.reviewQueue = new ReviewQueue(this.dataDir);

        // Mimicry
        this.mimicry = new HumanMimicry(this.brain.soul);
        this.style = new StyleProcessor(this.brain.soul);
    }

    /**
     * Process an incoming message through the full pipeline
     * Returns { replies, delay, action, issues }
     */
    async processMessage(message, contact = {}) {
        const contactName = contact.name || 'Unknown';

        // 1. Should we ignore this message?
        if (this.mimicry.shouldIgnore(message)) {
            return { action: 'ignore', replies: [], delay: 0 };
        }

        // 2. Get RAG context (relevant past conversations)
        let ragContext = '';
        try {
            const memories = await this.chatMemory.findRelevant(
                message.text || message, contactName, 5
            );
            ragContext = this.chatMemory.formatContext(memories);
        } catch {
            // RAG optional, continue without
        }

        // 3. Get recent conversation context
        const recentHistory = this.conversationMemory.getRecentContext(contactName, 8);

        // 4. Generate reply via Brain + LLM
        const rawReply = await this.brain.generateReply(
            message.text || message,
            contact,
            this.provider,
            { recentHistory, ragContext }
        );

        // 5. Clean AI reveals
        let cleanReply = cleanAIReveal(rawReply);

        // 6. Safety check
        const safetyResult = this.guard.checkReply(cleanReply, message, contact);

        if (!safetyResult.safe) {
            if (safetyResult.action === 'deflect') {
                // Use deflection message
                cleanReply = safetyResult.deflectMessage;
            } else if (safetyResult.action === 'block') {
                // Completely blocked — don't send
                return { action: 'blocked', replies: [], delay: 0, issues: safetyResult.issues };
            } else if (safetyResult.action === 'queue_for_review') {
                // Queue for human review
                this.reviewQueue.add({
                    contact: contactName,
                    message: message.text || message,
                    reply: cleanReply,
                    issues: safetyResult.issues,
                });
                return { action: 'queued', replies: [], delay: 0, issues: safetyResult.issues };
            }
        }

        // 7. Style post-processing
        cleanReply = this.style.process(cleanReply);

        // 8. Mimicry: split messages + add typos
        const replies = this.mimicry.processReply(cleanReply);

        // 9. Calculate human-like delay
        const delay = this.mimicry.getReplyDelay(message.text || message, contact);
        const typingDuration = this.mimicry.getTypingDuration(replies.join(' '));

        // 10. Store in conversation memory
        this.conversationMemory.addExchange(
            contactName,
            message.text || message,
            replies.join(' ')
        );

        return {
            action: 'reply',
            replies,
            delay,
            typingDuration,
            issues: safetyResult.issues || [],
        };
    }

    /**
     * Index conversations for RAG (run after feeding)
     */
    async indexMemory(conversations) {
        return this.chatMemory.indexHistory(conversations);
    }
}
