import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

describe('ContextStore payload encryption', () => {
    let dbPath;
    let key;
    let tempDir;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'openself-encrypted-store-'));
        dbPath = join(tempDir, 'context.db');
        key = randomBytes(32);
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('encrypts payloads, versions, vectors, and lexical index while preserving search', () => {
        const store = new ContextStore({ dbPath, encryptionKey: key });
        const memory = store.remember({
            type: 'decision',
            content: 'Use SQLite for the confidential Atlas database',
            summary: 'Secret architecture decision',
            scope: 'project/atlas',
            sensitivity: 'restricted',
            source: { kind: 'meeting', locator: 'private/atlas.md', title: 'Atlas review' },
            tags: ['database', 'confidential'],
        });

        expect(store.search('SQLite Atlas', { maxSensitivity: 'restricted' })[0].id).toBe(
            memory.id,
        );
        expect(store.history(memory.id)[0].snapshot.content).toContain('confidential Atlas');
        expect(store.stats().encrypted).toBe(true);
        store.close();

        const raw = new Database(dbPath, { readonly: true });
        const payload = JSON.stringify({
            memory: raw.prepare('SELECT * FROM memories').get(),
            fts: raw.prepare('SELECT * FROM memory_fts').get(),
            vector: raw.prepare('SELECT * FROM memory_vectors').get(),
            version: raw.prepare('SELECT * FROM memory_versions').get(),
        });
        raw.close();
        expect(payload).not.toContain('confidential');
        expect(payload).not.toContain('SQLite');
        expect(payload).not.toContain('private/atlas.md');

        const reopened = new ContextStore({ dbPath, encryptionKey: key });
        expect(reopened.get(memory.id).content).toContain('Atlas database');
        reopened.close();
    });

    it('migrates an existing plaintext vault in one transaction', () => {
        const plaintext = new ContextStore({ dbPath });
        const memory = plaintext.remember({ content: 'Legacy plaintext memory', tags: ['legacy'] });
        plaintext.close();

        const encrypted = new ContextStore({ dbPath, encryptionKey: key });
        expect(encrypted.get(memory.id).content).toBe('Legacy plaintext memory');
        encrypted.close();

        const raw = new Database(dbPath, { readonly: true });
        expect(raw.prepare('SELECT content FROM memories').get().content).toMatch(/^enc:v1:/);
        expect(raw.prepare('SELECT value FROM vault_metadata').get().value).toBe('aes-256-gcm-v1');
        raw.close();
    });

    it('rejects a missing or incorrect key for encrypted vaults', () => {
        const encrypted = new ContextStore({ dbPath, encryptionKey: key });
        encrypted.remember({ content: 'Protected content' });
        encrypted.close();

        expect(() => new ContextStore({ dbPath })).toThrow('Context Vault is encrypted');
        expect(() => new ContextStore({ dbPath, encryptionKey: randomBytes(32) })).toThrow(
            'Unable to decrypt',
        );
    });
});
