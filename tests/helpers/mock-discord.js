/**
 * Mock factory for discord.js Client + intents enum.
 * Returns a controllable EventEmitter-backed client; tests can call
 * `client.emit('messageCreate', { ... })` to simulate inbound messages.
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';

export function createDiscordMock() {
    const emitter = new EventEmitter();
    const client = {
        on: emitter.on.bind(emitter),
        once: emitter.once.bind(emitter),
        emit: emitter.emit.bind(emitter),
        login: vi.fn().mockResolvedValue('fake-token'),
        destroy: vi.fn().mockResolvedValue(undefined),
        user: { username: 'test-bot', id: 'bot-id' },
    };
    return {
        Client: vi.fn().mockImplementation(() => client),
        GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 3, DirectMessages: 4 },
        Partials: { Channel: 1, Message: 2 },
        __client: client,
    };
}
