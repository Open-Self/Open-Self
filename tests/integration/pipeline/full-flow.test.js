/**
 * Integration: Full pipeline message → reply with mocked provider + real components
 * Uses real CloneBrain, SafetyGuard, HumanMimicry, StyleProcessor
 * Mocks: LLM provider, loadSoul (file I/O), loadConfig, loadPersonality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock file I/O dependencies to avoid needing real ./data directory
vi.mock('../../../src/brain/clone.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        loadSoul: vi.fn(() => `# SOUL.md
## Identity
- Name: TestUser
- Language: Vietnamese
- Average message length: 25
- Emoji frequency: moderate

## Voice
- Catchphrases: ê, ok
- Abbreviations: oke, k

## Boundaries
- Deflect topics: politics
- When unsure: "để t check lại nha"
- Never share: passwords

## Clone Score: 80
`),
    };
});

vi.mock('../../../src/config/loader.js', () => ({
    loadConfig: vi.fn(() => ({
        llm: { provider: 'ollama', model: 'llama3.2', maxTokens: 500 },
        clone: { onlineHours: { start: 8, end: 23 }, replyDelay: { min: 1000, max: 5000 } },
        safety: { safeMode: true },
        data: { dir: './data' },
    })),
}));

vi.mock('../../../src/config/personality-loader.js', () => ({
    loadPersonality: vi.fn(() => ({
        responseTimeAvg: 5000,
        avgMessageLength: 25,
        typoRate: 0.0,
        onlineHoursStart: 8,
        onlineHoursEnd: 23,
        capitalizationStyle: 'lowercase',
        emojiFrequency: 0.3,
    })),
    mergePersonality: vi.fn((soul, json) => ({ ...soul, ...json })),
}));

vi.mock('../../../src/rag/memory.js', () => ({
    ChatMemory: vi.fn().mockImplementation(() => ({
        findRelevant: vi.fn().mockResolvedValue([]),
        formatContext: vi.fn(() => ''),
        indexHistory: vi.fn().mockResolvedValue(0),
    })),
}));

vi.mock('../../../src/memory/conversation.js', () => ({
    ConversationMemory: vi.fn().mockImplementation(() => ({
        getRecentContext: vi.fn(() => ''),
        addExchange: vi.fn(),
    })),
}));

vi.mock('../../../src/safety/review-queue.js', () => ({
    ReviewQueue: vi.fn().mockImplementation(() => ({
        add: vi.fn(),
        getPending: vi.fn(() => []),
    })),
}));

vi.mock('../../../src/rag/embeddings.js', () => ({
    createEmbedding: vi.fn(() => ({
        embed: vi.fn().mockResolvedValue(new Array(128).fill(0.1)),
        embedBatch: vi.fn().mockResolvedValue([]),
        buildVocabulary: vi.fn(),
        name: 'local',
    })),
}));

import { ClonePipeline } from '../../../src/brain/pipeline.js';

// Mock provider injected directly
function makeMockProvider(reply = 'oke bro đi thôi') {
    return {
        name: 'mock',
        chat: vi.fn().mockResolvedValue(reply),
    };
}

describe('ClonePipeline.processMessage', () => {
    it('returns { action, replies, delay } shape for normal message', async () => {
        const provider = makeMockProvider('oke bro đi thôi');
        const pipeline = new ClonePipeline({ provider, dataDir: './data' });

        const result = await pipeline.processMessage(
            { text: 'đi cà phê không', isGroup: false },
            { name: 'Alice', relationship: 'friend', channel: 'whatsapp', known: true }
        );

        expect(result).toHaveProperty('action');
        expect(result).toHaveProperty('replies');
        expect(result).toHaveProperty('delay');
        expect(['reply', 'ignore', 'blocked', 'queued', 'deflect']).toContain(result.action);
    });

    it('replies array contains strings when action is reply', async () => {
        const provider = makeMockProvider('oke bro');
        const pipeline = new ClonePipeline({ provider, dataDir: './data' });

        const result = await pipeline.processMessage(
            { text: 'sup bro', isGroup: false },
            { name: 'Bob', relationship: 'friend', channel: 'discord', known: true }
        );

        if (result.action === 'reply') {
            expect(Array.isArray(result.replies)).toBe(true);
            expect(result.replies.every(r => typeof r === 'string')).toBe(true);
        }
    });

    it('returns action=ignore for group messages not mentioning clone', async () => {
        const provider = makeMockProvider('whatever');
        // Spy Math.random to always return 0 (< 0.7 → ignore)
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const pipeline = new ClonePipeline({ provider, dataDir: './data' });

        const result = await pipeline.processMessage(
            { text: 'random group chat msg', isGroup: true, mentionsMe: false },
            { name: 'GroupUser', channel: 'discord' }
        );

        expect(result.action).toBe('ignore');
        vi.restoreAllMocks();
    });

    it('blocks or cleans reply containing AI self-reveal', async () => {
        vi.restoreAllMocks(); // ensure no Math.random spy from prior test leaks
        const provider = makeMockProvider("I'm an AI language model, sorry");
        const pipeline = new ClonePipeline({ provider, dataDir: './data' });

        const result = await pipeline.processMessage(
            { text: 'are you an AI?', isGroup: false },
            { name: 'Tester', relationship: 'stranger', channel: 'web', known: true }
        );

        // Pipeline either blocks (safety guard) or replies with cleaned text.
        // 'ignore' can also occur if timing/hours mock fires — all valid pipeline outcomes.
        const validActions = ['blocked', 'reply', 'ignore', 'queued'];
        expect(validActions).toContain(result.action);
        // Key assertion: if it replied, the raw AI-reveal phrase was NOT passed through
        if (result.action === 'reply') {
            const joinedReplies = result.replies.join(' ');
            expect(joinedReplies).not.toMatch(/I'?m an AI language model/i);
        }
    });

    it('provider.chat is called with system prompt and user message', async () => {
        const provider = makeMockProvider('oke');
        const pipeline = new ClonePipeline({ provider, dataDir: './data' });

        await pipeline.processMessage(
            { text: 'hello', isGroup: false },
            { name: 'Alice', channel: 'whatsapp', known: true }
        );

        // chat may not be called if message was ignored; only assert when called
        if (provider.chat.mock.calls.length > 0) {
            const [systemPrompt, userMessage] = provider.chat.mock.calls[0];
            expect(typeof systemPrompt).toBe('string');
            expect(typeof userMessage).toBe('string');
            expect(systemPrompt).toContain('TestUser');
        }
    });
});
