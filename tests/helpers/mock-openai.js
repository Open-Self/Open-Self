/**
 * Mock factory for `openai` SDK (v4 chat.completions shape).
 */

import { vi } from 'vitest';

export function createOpenAIMock(replyText = 'mocked openai reply') {
    const create = vi.fn().mockResolvedValue({
        choices: [{ message: { content: replyText, role: 'assistant' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const OpenAI = vi.fn().mockImplementation(() => ({
        chat: { completions: { create } },
    }));
    return { default: OpenAI, OpenAI, __create: create };
}
