/**
 * AnthropicProvider — mocked SDK roundtrip
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock must be at top level (hoisted)
vi.mock('@anthropic-ai/sdk', () => {
    const create = vi.fn(async () => ({
        content: [{ type: 'text', text: 'mocked anthropic reply' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
    }));
    // Regular function (not arrow) so it is constructable via `new` under Vitest 4.
    const Anthropic = vi.fn(function () {
        return { messages: { create } };
    });
    Anthropic.__create = create;
    return { default: Anthropic };
});

import { AnthropicProvider } from '../../../../src/brain/providers/anthropic.js';
import Anthropic from '@anthropic-ai/sdk';

describe('AnthropicProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('name property is "anthropic"', () => {
        const p = new AnthropicProvider({ apiKey: 'test' });
        expect(p.name).toBe('anthropic');
    });

    it('chat() calls messages.create with system and user message', async () => {
        const p = new AnthropicProvider({ apiKey: 'test' });
        await p.chat('system prompt here', 'user message here');

        const instance = Anthropic.mock.results[0].value;
        expect(instance.messages.create).toHaveBeenCalledOnce();
        const call = instance.messages.create.mock.calls[0][0];
        expect(call.system).toBe('system prompt here');
        expect(call.messages[0].role).toBe('user');
        expect(call.messages[0].content).toBe('user message here');
    });

    it('chat() returns the text content from response', async () => {
        const p = new AnthropicProvider({ apiKey: 'test' });
        const result = await p.chat('sys', 'msg');
        expect(result).toBe('mocked anthropic reply');
    });

    it('uses config.model when provided', () => {
        const p = new AnthropicProvider({ apiKey: 'test', model: 'claude-3-haiku' });
        expect(p.model).toBe('claude-3-haiku');
    });

    it('uses config.maxTokens when provided', () => {
        const p = new AnthropicProvider({ apiKey: 'test', maxTokens: 200 });
        expect(p.maxTokens).toBe(200);
    });

    it('passes maxTokens to create call', async () => {
        const p = new AnthropicProvider({ apiKey: 'test', maxTokens: 300 });
        await p.chat('sys', 'msg');
        const instance = Anthropic.mock.results[0].value;
        const call = instance.messages.create.mock.calls[0][0];
        expect(call.max_tokens).toBe(300);
    });
});
