/**
 * WhatsApp reconnect regression.
 * Each call to _connect() must remove all prior listeners before rebinding,
 * otherwise listeners accumulate across reconnects and messages fan out N times.
 * Verifies that after N reconnect cycles, messages.upsert listener count = 1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock heavy dependencies before importing gateway
vi.mock('@whiskeysockets/baileys', () => {
    const { EventEmitter } = require('events');

    // Shared ev emitter per socket instance
    function makeSock() {
        const ev = new EventEmitter();
        ev.removeAllListeners = vi.fn(ev.removeAllListeners.bind(ev));
        return {
            ev,
            end: vi.fn(),
            sendMessage: vi.fn().mockResolvedValue({}),
        };
    }

    return {
        default: vi.fn(() => makeSock()),
        useMultiFileAuthState: vi.fn().mockResolvedValue({
            state: {},
            saveCreds: vi.fn(),
        }),
        DisconnectReason: { loggedOut: 401 },
    };
});

// Constructor mocks use regular functions (not arrows) so `new X()` works under
// Vitest 4, which invokes the mock implementation with real construct semantics.
vi.mock('../../../src/brain/pipeline.js', () => ({
    ClonePipeline: vi.fn(function () {
        return {
            processMessage: vi.fn(async () => ({ action: 'reply', replies: ['ok'], delay: 0 })),
        };
    }),
}));

vi.mock('../../../src/ghost/ghost.js', () => ({
    GhostMode: vi.fn(function () {
        return {
            startHeartbeat: vi.fn(),
            stopHeartbeat: vi.fn(),
        };
    }),
}));

vi.mock('qrcode-terminal', () => ({ default: { generate: vi.fn() } }));

// Mock fs to avoid real directory ops
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
    };
});

import { WhatsAppGateway } from '../../../src/gateway/whatsapp.js';

describe('WhatsAppGateway reconnect — listener count regression', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('_connect() removes all prior listeners before rebinding (phase-02 fix)', async () => {
        const gateway = new WhatsAppGateway({ sessionDir: '/fake/session' });

        // First connection
        await gateway._connect();
        const firstSock = gateway.sock;
        const listenerCountAfterFirst = firstSock.ev.listenerCount('messages.upsert');
        expect(listenerCountAfterFirst).toBe(1);

        // Second connection (simulated reconnect)
        await gateway._connect();
        // After reconnect, removeAllListeners should have been called on old socket
        expect(firstSock.ev.removeAllListeners).toHaveBeenCalled();

        // New socket has exactly 1 messages.upsert listener
        const secondSock = gateway.sock;
        expect(secondSock.ev.listenerCount('messages.upsert')).toBe(1);
    });

    it('multiple reconnects do not accumulate listeners', async () => {
        const gateway = new WhatsAppGateway({ sessionDir: '/fake/session' });

        // Simulate 3 reconnect cycles
        await gateway._connect();
        await gateway._connect();
        await gateway._connect();

        // Final socket should have exactly 1 listener for messages.upsert
        const finalSock = gateway.sock;
        expect(finalSock.ev.listenerCount('messages.upsert')).toBe(1);
    });

    it('sock is not null after _connect()', async () => {
        const gateway = new WhatsAppGateway({ sessionDir: '/fake/session' });
        await gateway._connect();
        expect(gateway.sock).not.toBeNull();
    });
});
