import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { userInfo } from 'node:os';

const CONFIG_VERSION = 1;

export class VaultKeyManager {
    constructor(dataDir, options = {}) {
        this.dataDir = resolve(dataDir || './data');
        this.configPath = join(this.dataDir, 'vault.json');
        this.backend = options.backend;
    }

    initialize() {
        if (existsSync(this.configPath)) {
            throw new Error(`Vault encryption is already configured at ${this.configPath}`);
        }
        const backend = this.backend || defaultBackend(this.dataDir);
        const keyId = randomUUID();
        const key = randomBytes(32);
        mkdirSync(this.dataDir, { recursive: true });
        backend.store(keyId, key);
        const config = {
            version: CONFIG_VERSION,
            encrypted: true,
            provider: backend.provider,
            keyId,
            createdAt: new Date().toISOString(),
        };
        writePrivateJson(this.configPath, config);
        return { config, key };
    }

    loadKey() {
        const config = this._readConfig();
        const backend = this.backend || backendForProvider(config.provider, this.dataDir);
        const key = backend.load(config.keyId);
        if (!Buffer.isBuffer(key) || key.length !== 32) {
            throw new Error(`OS key provider ${config.provider} returned an invalid vault key`);
        }
        return key;
    }

    status() {
        if (!existsSync(this.configPath)) {
            return { configured: false, configPath: this.configPath };
        }
        const config = this._readConfig();
        try {
            this.loadKey();
            return { configured: true, keyAvailable: true, configPath: this.configPath, ...config };
        } catch (error) {
            return {
                configured: true,
                keyAvailable: false,
                configPath: this.configPath,
                ...config,
                error: error.message,
            };
        }
    }

    _readConfig() {
        if (!existsSync(this.configPath)) throw new Error('Vault encryption is not configured');
        const config = JSON.parse(readFileSync(this.configPath, 'utf8'));
        if (
            config.version !== CONFIG_VERSION ||
            !config.encrypted ||
            !config.provider ||
            !config.keyId
        ) {
            throw new Error(`Invalid vault encryption configuration: ${this.configPath}`);
        }
        return config;
    }
}

export function loadConfiguredVaultKey(dataDir) {
    const manager = new VaultKeyManager(dataDir);
    return existsSync(manager.configPath) ? manager.loadKey() : null;
}

function defaultBackend(dataDir) {
    if (process.platform === 'win32') return new WindowsDpapiBackend(dataDir);
    if (process.platform === 'darwin') return new MacKeychainBackend();
    return new LinuxSecretServiceBackend();
}

function backendForProvider(provider, dataDir) {
    if (provider === 'windows-dpapi') return new WindowsDpapiBackend(dataDir);
    if (provider === 'macos-keychain') return new MacKeychainBackend();
    if (provider === 'linux-secret-service') return new LinuxSecretServiceBackend();
    throw new Error(`Unsupported vault key provider: ${provider}`);
}

class WindowsDpapiBackend {
    constructor(dataDir) {
        this.provider = 'windows-dpapi';
        this.path = join(dataDir, 'vault-key.dpapi');
    }

    store(_keyId, key) {
        const protectedValue = runPowerShell(DPAPI_PROTECT_SCRIPT, key.toString('base64'));
        writeFileSync(this.path, `${protectedValue}\n`, { mode: 0o600 });
    }

    load() {
        if (!existsSync(this.path)) throw new Error(`DPAPI key blob not found: ${this.path}`);
        return Buffer.from(
            runPowerShell(DPAPI_UNPROTECT_SCRIPT, readFileSync(this.path, 'utf8').trim()),
            'base64',
        );
    }
}

class MacKeychainBackend {
    constructor() {
        this.provider = 'macos-keychain';
        this.account = userInfo().username;
    }

    store(keyId, key) {
        runCommand('security', [
            'add-generic-password',
            '-U',
            '-a',
            this.account,
            '-s',
            serviceName(keyId),
            '-w',
            key.toString('base64'),
        ]);
    }

    load(keyId) {
        const value = runCommand('security', [
            'find-generic-password',
            '-a',
            this.account,
            '-s',
            serviceName(keyId),
            '-w',
        ]);
        return Buffer.from(value, 'base64');
    }
}

class LinuxSecretServiceBackend {
    constructor() {
        this.provider = 'linux-secret-service';
    }

    store(keyId, key) {
        runCommand(
            'secret-tool',
            ['store', '--label', 'OpenSelf Context Vault', 'service', 'openself', 'vault', keyId],
            key.toString('base64'),
        );
    }

    load(keyId) {
        return Buffer.from(
            runCommand('secret-tool', ['lookup', 'service', 'openself', 'vault', keyId]),
            'base64',
        );
    }
}

function runPowerShell(script, input) {
    return runCommand(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        input,
    );
}

function runCommand(command, args, input) {
    const result = spawnSync(command, args, {
        input,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
    });
    if (result.error) throw new Error(`${command} is unavailable: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`);
    }
    return String(result.stdout || '').trim();
}

function writePrivateJson(path, value) {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, path);
}

function serviceName(keyId) {
    return `openself-vault-${keyId}`;
}

const DPAPI_PROTECT_SCRIPT = `
Add-Type -AssemblyName System.Security
$value = [Console]::In.ReadToEnd().Trim()
$bytes = [Convert]::FromBase64String($value)
$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($protected))
`;

const DPAPI_UNPROTECT_SCRIPT = `
Add-Type -AssemblyName System.Security
$value = [Console]::In.ReadToEnd().Trim()
$bytes = [Convert]::FromBase64String($value)
$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($plain))
`;
