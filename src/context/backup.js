import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'node:crypto';
import {
    closeSync,
    existsSync,
    fsyncSync,
    linkSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ContextStore, VAULT_SCHEMA_VERSION } from './store.js';
import { VaultKeyManager } from './vault-key-manager.js';
import { normalizeKey } from './vault-crypto.js';
import { MAX_BACKUP_BYTES, openBackup, sealBackup } from './backup-format.js';

function assertAbsent(path) {
    try {
        lstatSync(path);
    } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }
    throw new Error(`Refusing to overwrite existing path: ${path}`);
}

function writeDurably(path, bytes) {
    const fd = openSync(path, 'wx', 0o600);
    try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
    } finally {
        closeSync(fd);
    }
}

/** Encrypt a consistent SQLite snapshot, including payload key, versions and import ledger. */
export async function backupVault(store, outputPath, options = {}) {
    const output = resolve(outputPath);
    assertAbsent(output);
    if (store.db.inTransaction) throw new Error('Finish the current transaction before backup');
    const size =
        store.db.pragma('page_count', { simple: true }) *
        store.db.pragma('page_size', { simple: true });
    if (size >= MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 256 MiB format limit');
    // serialize includes committed WAL pages without checkpointing or a plaintext temporary file.
    const database = store.db.serialize();
    // SQLite deserialize cannot open WAL-mode images. Change only the snapshot header,
    // as prescribed by https://sqlite.org/c3ref/deserialize.html; the live DB stays in WAL.
    database[18] = 1;
    database[19] = 1;
    const metadata = {
        schemaVersion: VAULT_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        payloadKey: store.encryptionEnabled ? store.codec.key.toString('hex') : null,
    };
    let archive;
    try {
        archive = await sealBackup(database, metadata, options.passphrase);
    } finally {
        database.fill(0);
    }
    mkdirSync(dirname(output), { recursive: true });
    const temporary = `${output}.${randomUUID()}.tmp`;
    try {
        writeDurably(temporary, archive);
        // Exclusive publication: a concurrently created output is never replaced.
        linkSync(temporary, output);
    } finally {
        rmSync(temporary, { force: true });
    }
    return { path: output, bytes: archive.length, createdAt: metadata.createdAt };
}

function validateSnapshot(database, metadata) {
    if (
        !Number.isInteger(metadata?.schemaVersion) ||
        metadata.schemaVersion < 1 ||
        metadata.schemaVersion > VAULT_SCHEMA_VERSION ||
        typeof metadata.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(metadata.createdAt)) ||
        !(metadata.payloadKey === null || /^[a-f0-9]{64}$/.test(metadata.payloadKey))
    ) {
        throw new Error('Unsupported or invalid backup manifest/schema version');
    }
    const db = new Database(database, { readonly: true });
    try {
        if (db.pragma('user_version', { simple: true }) !== metadata.schemaVersion) {
            throw new Error('Unsupported backup database schema version');
        }
        if (
            db.pragma('integrity_check', { simple: true }) !== 'ok' ||
            db.pragma('foreign_key_check').length
        ) {
            throw new Error('Backup database integrity validation failed');
        }
        for (const table of [
            'memories',
            'memory_versions',
            'memory_vectors',
            'import_items',
            'memory_fts',
            'vault_metadata',
            ...(metadata.schemaVersion >= 2 ? ['capture_checkpoints'] : []),
        ]) {
            if (
                !db
                    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
                    .get(table)
            ) {
                throw new Error(`Backup database is missing ${table}`);
            }
        }
        const encrypted = db
            .prepare("SELECT value FROM vault_metadata WHERE key = 'payload_encryption'")
            .get()?.value;
        if (
            (encrypted === 'aes-256-gcm-v1') !== Boolean(metadata.payloadKey) ||
            (encrypted && encrypted !== 'aes-256-gcm-v1')
        ) {
            throw new Error('Backup encryption metadata does not match the database');
        }
    } finally {
        db.close();
    }
}

/** Restore only into a new directory; rebind payload protection to the destination OS account. */
export async function restoreVault(backupPath, destination, options = {}) {
    const target = resolve(destination);
    assertAbsent(target);
    if (statSync(backupPath).size > MAX_BACKUP_BYTES)
        throw new Error('Backup exceeds the 256 MiB format limit');
    const { database, metadata } = await openBackup(readFileSync(backupPath), options.passphrase);
    let staging;
    let store;
    let key;
    try {
        validateSnapshot(database, metadata);
        key = metadata.payloadKey ? normalizeKey(metadata.payloadKey) : randomBytes(32);
        // Migrate plaintext sources to encrypted payloads in memory before writing anything to disk.
        store = new ContextStore({ dbPath: database, encryptionKey: key });
        for (const { id } of store.db.prepare('SELECT id FROM memories').all()) {
            store.get(id, { includeForgotten: true });
            store.history(id);
        }
        for (const { vector } of store.db.prepare('SELECT vector FROM memory_vectors').all()) {
            const values = JSON.parse(store.codec.decode(vector, 'vector'));
            if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value))) {
                throw new Error('Backup contains an invalid retrieval vector');
            }
        }
        for (const { snapshot } of store.db
            .prepare('SELECT snapshot FROM capture_checkpoints')
            .all()) {
            JSON.parse(store.codec.decode(snapshot, 'capture-state'));
        }
        // Rebuild in memory so obsolete plaintext cells/free pages from a plaintext
        // source cannot survive inside the restored encrypted database image.
        store.db.exec('VACUUM');
        const snapshot = store.db.serialize();
        store.close();
        store = null;
        mkdirSync(dirname(target), { recursive: true });
        staging = mkdtempSync(join(dirname(target), '.openself-restore-'));
        writeDurably(join(staging, 'context.db'), snapshot);
        const manager = new VaultKeyManager(staging, { backend: options.keyBackend });
        manager.initialize({ key });
        // Verify key-provider roundtrip before making the vault available.
        if (!manager.loadKey().equals(key))
            throw new Error('Restored key provider verification failed');
        assertAbsent(target);
        renameSync(staging, target);
        staging = null;
        return { dataDir: target, createdAt: metadata.createdAt, encrypted: true };
    } finally {
        store?.close();
        key?.fill(0);
        database.fill(0);
        if (staging && existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    }
}
