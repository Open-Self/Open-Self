import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import { backupVault, restoreVault } from '../../../src/context/backup.js';
import { openBackup, sealBackup } from '../../../src/context/backup-format.js';
import { VaultKeyManager } from '../../../src/context/vault-key-manager.js';

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, fsyncSync: vi.fn(actual.fsyncSync) };
});

describe('portable vault recovery', () => {
    let directory;
    let source;
    let backend;
    const passphrase = 'test-only backup recovery phrase';

    beforeEach(() => {
        directory = fs.mkdtempSync(join(tmpdir(), 'openself-backup-test-'));
        const keys = new Map();
        backend = {
            provider: 'test-keychain',
            store: (id, key) => keys.set(id, Buffer.from(key)),
            load: (id) => keys.get(id),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        source?.close();
        source = null;
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it.each([false, true])(
        'recovers a live WAL vault with encrypted source=%s',
        async (encrypted) => {
            source = new ContextStore({
                dataDir: join(directory, 'source'),
                ...(encrypted ? { encryptionKey: randomBytes(32) } : {}),
            });
            const memory = source.remember({
                content: 'Private original database decision',
                scope: 'project/atlas',
            });
            source.update(memory.id, { content: 'Private revised SQLite database decision' });
            const forgotten = source.remember({ content: 'forgotten secret' });
            source.forget(forgotten.id);
            source.db
                .prepare('INSERT INTO import_items VALUES (?, ?, ?)')
                .run('fingerprint', memory.id, new Date().toISOString());
            const file = join(directory, 'vault.osbackup');
            const pendingBackup = backupVault(source, file, { passphrase });
            source.remember({ content: 'Written while the snapshot is being encrypted' });
            await pendingBackup;
            expect(fs.readFileSync(file).includes(Buffer.from('Private'))).toBe(false);

            const target = join(directory, 'restored');
            await restoreVault(file, target, { passphrase, keyBackend: backend });
            const key = new VaultKeyManager(target, { backend }).loadKey();
            const restored = new ContextStore({ dataDir: target, encryptionKey: key });
            try {
                expect(restored.stats().encrypted).toBe(true);
                expect(restored.search('SQLite')[0].id).toBe(memory.id);
                expect(
                    restored.history(memory.id).map((entry) => entry.snapshot.content),
                ).toContain('Private original database decision');
                expect(restored.get(forgotten.id)).toBeNull();
                expect(restored.history(forgotten.id).length).toBe(2);
                expect(restored.db.prepare('SELECT * FROM import_items').get().dedupe_key).toBe(
                    'fingerprint',
                );
                expect(
                    restored.db.prepare('SELECT COUNT(*) AS count FROM memories').get().count,
                ).toBe(2);
            } finally {
                restored.close();
            }
            expect(
                fs.readFileSync(join(target, 'context.db')).includes(Buffer.from('Private')),
            ).toBe(false);
            expect(fs.readFileSync(join(target, 'vault.json'), 'utf8')).not.toContain(
                key.toString('hex'),
            );
        },
        30000,
    );

    it('rejects incorrect passphrases, truncation, tampering and unknown formats before creating a target', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        const file = join(directory, 'backup');
        await backupVault(source, file, { passphrase });
        const original = fs.readFileSync(file);
        const target = join(directory, 'restored');
        await expect(
            restoreVault(file, target, { passphrase: 'wrong recovery phrase' }),
        ).rejects.toThrow('authentication');
        const tampered = Buffer.from(original);
        tampered[tampered.length - 1] ^= 1;
        const tamperedSalt = Buffer.from(original);
        tamperedSalt[Buffer.byteLength('OpenSelfBackup\0') + 1] ^= 1;
        for (const bytes of [original.subarray(0, 20), tampered, tamperedSalt]) {
            fs.writeFileSync(file, bytes);
            await expect(restoreVault(file, target, { passphrase })).rejects.toThrow();
        }
        original[Buffer.byteLength('OpenSelfBackup\0')] = 2;
        fs.writeFileSync(file, original);
        await expect(restoreVault(file, target, { passphrase })).rejects.toThrow('format version');
        expect(fs.existsSync(target)).toBe(false);
    });

    it('refuses existing output files and destination directories without modifying them', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        const file = join(directory, 'backup');
        fs.writeFileSync(file, 'sentinel');
        await expect(backupVault(source, file, { passphrase })).rejects.toThrow('overwrite');
        await expect(restoreVault(file, directory, { passphrase })).rejects.toThrow('overwrite');
        expect(fs.readFileSync(file, 'utf8')).toBe('sentinel');
    });

    it('cleans up an interrupted backup write and never publishes partial bytes', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        const file = join(directory, 'backup');
        vi.mocked(fs.fsyncSync).mockImplementationOnce(() => {
            throw new Error('simulated disk failure');
        });
        await expect(backupVault(source, file, { passphrase })).rejects.toThrow('disk failure');
        expect(fs.readdirSync(directory)).toEqual([]);
    });

    it('leaves no destination after key protection fails during restore', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        const file = join(directory, 'backup');
        await backupVault(source, file, { passphrase });
        backend.store = () => {
            throw new Error('keychain unavailable');
        };
        await expect(
            restoreVault(file, join(directory, 'target'), { passphrase, keyBackend: backend }),
        ).rejects.toThrow('keychain unavailable');
        expect(fs.readdirSync(directory)).toEqual(['backup']);
    });

    it('rejects authenticated backups with unsupported schema or inconsistent key metadata', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        const file = join(directory, 'backup');
        await backupVault(source, file, { passphrase });
        const decoded = await openBackup(fs.readFileSync(file), passphrase);
        for (const metadata of [
            { ...decoded.metadata, schemaVersion: 99 },
            { ...decoded.metadata, payloadKey: randomBytes(32).toString('hex') },
        ]) {
            fs.writeFileSync(file, await sealBackup(decoded.database, metadata, passphrase));
            await expect(
                restoreVault(file, join(directory, 'target'), { passphrase, keyBackend: backend }),
            ).rejects.toThrow();
        }
        const db = new Database(decoded.database);
        db.pragma('user_version = 99');
        fs.writeFileSync(file, await sealBackup(db.serialize(), decoded.metadata, passphrase));
        db.close();
        await expect(
            restoreVault(file, join(directory, 'target'), { passphrase, keyBackend: backend }),
        ).rejects.toThrow('schema version');
        expect(fs.existsSync(join(directory, 'target'))).toBe(false);
    });

    it('rejects short passphrases and snapshots inside an unfinished transaction', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        await expect(
            backupVault(source, join(directory, 'backup'), { passphrase: 'short' }),
        ).rejects.toThrow('12 to 1024');
        source.db.exec('BEGIN');
        await expect(
            backupVault(source, join(directory, 'backup'), { passphrase }),
        ).rejects.toThrow('transaction');
        source.db.exec('ROLLBACK');
    });

    it('rejects an authenticated invalid SQLite image and missing tables without publishing', async () => {
        source = new ContextStore({ dbPath: ':memory:' });
        const file = join(directory, 'backup');
        const metadata = {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            payloadKey: null,
        };
        source.db.exec('DROP TABLE memory_versions');
        for (const bytes of [Buffer.from('not a SQLite database'), source.db.serialize()]) {
            fs.writeFileSync(file, await sealBackup(bytes, metadata, passphrase));
            await expect(
                restoreVault(file, join(directory, 'target'), { passphrase, keyBackend: backend }),
            ).rejects.toThrow();
            expect(fs.existsSync(join(directory, 'target'))).toBe(false);
        }
    });

    it('refuses future vault schemas before running migrations', () => {
        source = new ContextStore({ dbPath: ':memory:' });
        source.db.pragma('user_version = 99');
        expect(() => new ContextStore({ dbPath: source.db.serialize() })).toThrow(
            'newer OpenSelf schema',
        );
        expect(source.db.pragma('user_version', { simple: true })).toBe(99);
    });
});
