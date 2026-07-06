/**
 * Mock factory for grammy Bot. Tests can drive inbound messages via
 * `bot.__trigger(text, ctxOverrides)` which invokes the registered
 * `on('message:text')` handler.
 */

import { vi } from 'vitest';

export function createGrammyMock() {
    const handlers = new Map();
    const bot = {
        on: vi.fn((event, handler) => {
            handlers.set(event, handler);
            return bot;
        }),
        command: vi.fn((cmd, handler) => {
            handlers.set(`cmd:${cmd}`, handler);
            return bot;
        }),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        api: {
            sendMessage: vi.fn().mockResolvedValue({ ok: true }),
            sendChatAction: vi.fn().mockResolvedValue(true),
        },
        __trigger(event, ctx) {
            const h = handlers.get(event);
            if (!h) throw new Error(`No handler for ${event}`);
            return h(ctx);
        },
    };
    return { Bot: vi.fn().mockImplementation(() => bot), __bot: bot };
}
