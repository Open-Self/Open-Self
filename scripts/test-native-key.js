import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { VaultKeyManager } from '../src/context/vault-key-manager.js';
import { ContextStore } from '../src/context/store.js';

const providers = {
    win32: 'windows-dpapi',
    darwin: 'macos-keychain',
    linux: 'linux-secret-service',
};
assert.ok(providers[process.platform], 'Unsupported native key test platform');
delete process.env.OPENSELF_VAULT_KEY;
const directory = mkdtempSync(join(tmpdir(), 'openself-native-key-'));
let config;
let removed = false;
let store;

function removeTestKey() {
    if (process.platform === 'win32') {
        rmSync(join(directory, 'vault-key.dpapi'), { force: true });
        return;
    }
    if (!config) return;
    const command = process.platform === 'darwin' ? 'security' : 'secret-tool';
    const args =
        process.platform === 'darwin'
            ? [
                  'delete-generic-password',
                  '-a',
                  userInfo().username,
                  '-s',
                  `openself-vault-${config.keyId}`,
              ]
            : ['clear', 'service', 'openself', 'vault', config.keyId];
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000,
    });
    assert.equal(result.status, 0, 'Could not remove the test-owned native key');
}

try {
    const manager = new VaultKeyManager(directory);
    const initialized = manager.initialize();
    config = initialized.config;
    assert.equal(config.provider, providers[process.platform]);
    assert.ok(manager.loadKey().equals(initialized.key), 'Native key roundtrip mismatch');
    initialized.key.fill(0);
    assert.equal(manager.status().keyAvailable, true);
    store = new ContextStore({ dataDir: directory });
    assert.equal(store.encryptionEnabled, true);
    const memory = store.remember({ content: 'Synthetic native key recovery fixture' });
    store.close();
    store = null;

    const program = `
        import { ContextStore } from ${JSON.stringify(new URL('../src/context/store.js', import.meta.url).href)};
        const store = new ContextStore({ dataDir: process.argv[1] });
        try {
            if (!store.encryptionEnabled || store.get(process.argv[2])?.content !== 'Synthetic native key recovery fixture') process.exitCode = 1;
        } finally { store.close(); }
    `;
    const child = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', program, directory, memory.id],
        {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 60000,
        },
    );
    assert.equal(child.status, 0, 'Fresh process could not reopen the OS-protected vault');
    const unavailableProgram = `
        import { VaultKeyManager } from ${JSON.stringify(new URL('../src/context/vault-key-manager.js', import.meta.url).href)};
        const manager = new VaultKeyManager(process.argv[1]);
        if (manager.status().keyAvailable !== false) process.exit(1);
        try { manager.loadKey(); process.exitCode = 1; } catch { /* Required failure. */ }
    `;
    const unavailable = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', unavailableProgram, directory],
        {
            env: { ...process.env, PATH: directory, Path: directory },
            encoding: 'utf8',
            windowsHide: true,
            timeout: 60000,
        },
    );
    assert.equal(unavailable.status, 0, 'Unavailable provider command must fail explicitly');
    assert.equal(
        manager.status().keyAvailable,
        true,
        'Unavailable-provider probe must preserve the key',
    );
    removeTestKey();
    removed = true;
    assert.equal(manager.status().keyAvailable, false);
    assert.throws(() => new ContextStore({ dataDir: directory }));
    assert.ok(
        existsSync(join(directory, 'context.db')),
        'Unavailable key must not remove the vault',
    );
    console.log(
        `PASS: ${config.provider} native roundtrip, process reopen and missing-key refusal`,
    );
} finally {
    store?.close();
    try {
        if (!removed) removeTestKey();
    } finally {
        rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
    }
}
