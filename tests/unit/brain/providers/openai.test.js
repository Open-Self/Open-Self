/**
 * OpenAIProvider — mocked SDK roundtrip
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
    // Base implementations via vi.fn(impl) so they survive vi.clearAllMocks()
    // between tests (Vitest 4 no longer preserves mockImplementation-set impls
    // on factory mocks across clears; base impls are never touched by mockClear).
    const create = vi.fn(async () => ({
        choices: [{ message: { content: 'mocked openai reply', role: 'assistant' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
    // Regular function (not arrow) so it is constructable via `new` under Vitest 4.
    const OpenAI = vi.fn(function () {
        return {
            chat: { completions: { create } },
            embeddings: { create: vi.fn() },
        };
    });
    OpenAI.__create = create;
    return { default: OpenAI };
});

import { OpenAIProvider } from '../../../../src/brain/providers/openai.js';
import OpenAI from 'openai';

describe('OpenAIProvider', () => {
    beforeEach(() => vi.clearAllMocks());

    it('name property is "openai"', () => {
        const p = new OpenAIProvider({ apiKey: 'test' });
        expect(p.name).toBe('openai');
    });

    it('chat() calls chat.completions.create', async () => {
        const p = new OpenAIProvider({ apiKey: 'test' });
        await p.chat('system prompt', 'user message');
        const instance = OpenAI.mock.results[0].value;
        expect(instance.chat.completions.create).toHaveBeenCalledOnce();
    });

    it('chat() sends system + user messages in correct order', async () => {
        const p = new OpenAIProvider({ apiKey: 'test' });
        await p.chat('sys here', 'user here');
        const instance = OpenAI.mock.results[0].value;
        const call = instance.chat.completions.create.mock.calls[0][0];
        expect(call.messages[0]).toEqual({ role: 'system', content: 'sys here' });
        expect(call.messages[1]).toEqual({ role: 'user', content: 'user here' });
    });

    it('chat() returns text from first choice', async () => {
        const p = new OpenAIProvider({ apiKey: 'test' });
        const result = await p.chat('sys', 'msg');
        expect(result).toBe('mocked openai reply');
    });

    it('uses config.model when provided', () => {
        const p = new OpenAIProvider({ apiKey: 'test', model: 'gpt-4o' });
        expect(p.model).toBe('gpt-4o');
    });

    it('passes maxTokens to create call', async () => {
        const p = new OpenAIProvider({ apiKey: 'test', maxTokens: 250 });
        await p.chat('sys', 'msg');
        const instance = OpenAI.mock.results[0].value;
        const call = instance.chat.completions.create.mock.calls[0][0];
        expect(call.max_tokens).toBe(250);
    });
});
