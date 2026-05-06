/**
 * DeepSeekProvider — mocked OpenAI-compatible SDK roundtrip
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
    const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'mocked deepseek reply', role: 'assistant' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    });
    const OpenAI = vi.fn().mockImplementation(() => ({
        chat: { completions: { create } },
        embeddings: { create: vi.fn() },
    }));
    return { default: OpenAI };
});

import { DeepSeekProvider } from '../../../../src/brain/providers/deepseek.js';
import OpenAI from 'openai';

describe('DeepSeekProvider', () => {
    beforeEach(() => vi.clearAllMocks());

    it('name property is "deepseek"', () => {
        const p = new DeepSeekProvider({ apiKey: 'test' });
        expect(p.name).toBe('deepseek');
    });

    it('constructs OpenAI client with deepseek baseURL', () => {
        new DeepSeekProvider({ apiKey: 'test' });
        const call = OpenAI.mock.calls[0][0];
        expect(call.baseURL).toBe('https://api.deepseek.com/v1');
    });

    it('accepts custom baseURL', () => {
        new DeepSeekProvider({ apiKey: 'test', baseURL: 'https://custom.url/v1' });
        const call = OpenAI.mock.calls[0][0];
        expect(call.baseURL).toBe('https://custom.url/v1');
    });

    it('chat() calls chat.completions.create', async () => {
        const p = new DeepSeekProvider({ apiKey: 'test' });
        await p.chat('system prompt', 'user message');
        const instance = OpenAI.mock.results[0].value;
        expect(instance.chat.completions.create).toHaveBeenCalledOnce();
    });

    it('chat() returns text from first choice', async () => {
        const p = new DeepSeekProvider({ apiKey: 'test' });
        const result = await p.chat('sys', 'msg');
        expect(result).toBe('mocked deepseek reply');
    });

    it('uses deepseek-chat as default model', () => {
        const p = new DeepSeekProvider({ apiKey: 'test' });
        expect(p.model).toBe('deepseek-chat');
    });

    it('sends system + user messages in correct order', async () => {
        const p = new DeepSeekProvider({ apiKey: 'test' });
        await p.chat('sys here', 'user here');
        const instance = OpenAI.mock.results[0].value;
        const call = instance.chat.completions.create.mock.calls[0][0];
        expect(call.messages[0].role).toBe('system');
        expect(call.messages[1].role).toBe('user');
    });
});
