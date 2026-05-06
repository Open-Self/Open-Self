/**
 * Mock factory for @whiskeysockets/baileys. Provides a controllable
 * socket whose event bus tests can drive via `sock.ev.emit(...)`.
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';

export function createBaileysMock() {
    const ev = new EventEmitter();
    const sock = {
        ev,
        user: { id: 'self@s.whatsapp.net' },
        sendMessage: vi.fn().mockResolvedValue({ key: { id: 'fake' } }),
        sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
        presenceSubscribe: vi.fn().mockResolvedValue(undefined),
        readMessages: vi.fn().mockResolvedValue(undefined),
        end: vi.fn(),
    };

    const makeWASocket = vi.fn().mockReturnValue(sock);
    const useMultiFileAuthState = vi.fn().mockResolvedValue({
        state: { creds: {}, keys: {} },
        saveCreds: vi.fn().mockResolvedValue(undefined),
    });

    return {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason: { loggedOut: 401, connectionClosed: 428, restartRequired: 515 },
        __sock: sock,
    };
}
