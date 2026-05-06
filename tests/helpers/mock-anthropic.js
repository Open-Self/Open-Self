/**
 * Mock factory for @anthropic-ai/sdk. Use inside a test file:
 *
 *   import { vi } from 'vitest';
 *   import { createAnthropicMock } from '../helpers/mock-anthropic.js';
 *   vi.mock('@anthropic-ai/sdk', () => createAnthropicMock('mocked reply'));
 *
 * `vi.mock` is hoisted, so the factory must be statically importable
 * (no closures over runtime values).
 */

import { vi } from 'vitest';

export function createAnthropicMock(replyText = 'mocked anthropic reply') {
    const create = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: replyText }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
    });
    const Anthropic = vi.fn().mockImplementation(() => ({
        messages: { create },
    }));
    return { default: Anthropic, Anthropic, __create: create };
}
