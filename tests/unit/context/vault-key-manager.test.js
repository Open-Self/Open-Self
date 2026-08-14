import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VaultKeyManager } from '../../../src/context/vault-key-manager.js';

describe('VaultKeyManager', () => {
    let backend;
    let keys;
    let tempDir;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'openself-key-manager-'));
        keys = new Map();
        backend = {
            provider: 'test-keychain',
            store(id, key) {
                keys.set(id, Buffer.from(key));
            },
            load(id) {
                if (!keys.has(id)) throw new Error('missing key');
                return Buffer.from(keys.get(id));
            },
        };
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('stores key material in the backend and only metadata on disk', () => {
        const manager = new VaultKeyManager(tempDir, { backend });
        const initialized = manager.initialize();

        expect(manager.loadKey()).toEqual(initialized.key);
        expect(manager.status()).toMatchObject({
            configured: true,
            keyAvailable: true,
            provider: 'test-keychain',
        });
        expect(JSON.stringify(initialized.config)).not.toContain(
            initialized.key.toString('base64'),
        );
        expect(() => manager.initialize()).toThrow('already configured');
    });

    it('reports unavailable backend keys without exposing key material', () => {
        const manager = new VaultKeyManager(tempDir, { backend });
        const { config } = manager.initialize();
        keys.delete(config.keyId);

        expect(manager.status()).toMatchObject({
            configured: true,
            keyAvailable: false,
            error: 'missing key',
        });
    });

    it('reports an unconfigured vault', () => {
        expect(new VaultKeyManager(tempDir, { backend }).status()).toMatchObject({
            configured: false,
        });
    });
});
