import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import { ProjectFolderCapture } from '../../../src/context/project-capture.js';
import { RecordCapture } from '../../../src/context/record-capture.js';

describe.each(['project', 'record'])('%s checkpoint recovery', (kind) => {
    let directory;
    let store;
    let source;
    let statePath;
    const key = Buffer.alloc(32, 9);
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'openself-capture-recovery-'));
        source = join(directory, 'source');
        mkdirSync(source);
        statePath = join(directory, 'legacy.json');
        store = new ContextStore({ dataDir: join(directory, 'vault'), encryptionKey: key });
        writeFileSync(join(source, 'record.txt'), 'Original capture content');
    });
    afterEach(() => {
        vi.restoreAllMocks();
        store.close();
        rmSync(directory, { recursive: true, force: true });
    });
    function capture(options = {}) {
        return kind === 'project'
            ? new ProjectFolderCapture(store, source, { statePath, ...options })
            : new RecordCapture(
                  store,
                  source,
                  (path) => [
                      {
                          key: 'one',
                          memory: { content: readFileSync(join(path, 'record.txt'), 'utf8') },
                      },
                  ],
                  { statePath, ...options },
              );
    }

    it('rolls back memories, history and checkpoint on checkpoint write failure', () => {
        const scan = capture();
        scan.scan();
        const original = store.list()[0];
        writeFileSync(join(source, 'record.txt'), 'Updated capture content');
        const fail = vi.spyOn(scan.checkpoint, 'save').mockImplementation(() => {
            throw new Error('disk full');
        });
        expect(() => scan.scan()).toThrow('disk full');
        expect(store.get(original.id).content).toBe(original.content);
        expect(store.history(original.id)).toHaveLength(1);
        fail.mockRestore();
        expect(scan.scan()).toMatchObject({ updated: 1 });
        expect(scan.scan()).toMatchObject({ unchanged: 1 });
        expect(store.stats().total).toBe(1);
        expect(store.history(original.id)).toHaveLength(2);
    });

    it('recovers after a process exits between memory updates and checkpoint commit', () => {
        capture().scan();
        const original = store.list()[0];
        store.close();
        writeFileSync(join(source, 'record.txt'), 'Updated after crash');
        const program = `
            import { readFileSync } from 'node:fs';
            import { join } from 'node:path';
            import { ContextStore } from ${JSON.stringify(new URL('../../../src/context/store.js', import.meta.url).href)};
            import { ProjectFolderCapture } from ${JSON.stringify(new URL('../../../src/context/project-capture.js', import.meta.url).href)};
            import { RecordCapture } from ${JSON.stringify(new URL('../../../src/context/record-capture.js', import.meta.url).href)};
            const [directory, source, statePath, kind] = process.argv.slice(1);
            const store = new ContextStore({ dataDir: join(directory, 'vault'), encryptionKey: Buffer.alloc(32, 9) });
            const scan = kind === 'project' ? new ProjectFolderCapture(store, source, { statePath }) :
                new RecordCapture(store, source, path => [{ key: 'one', memory: { content: readFileSync(join(path, 'record.txt'), 'utf8') } }], { statePath });
            scan._writeState = () => process.exit(17);
            scan.scan();
        `;
        const child = spawnSync(
            process.execPath,
            ['--input-type=module', '-e', program, directory, source, statePath, kind],
            {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 15000,
            },
        );
        store = new ContextStore({ dataDir: join(directory, 'vault'), encryptionKey: key });
        expect(child.error).toBeUndefined();
        expect(child.status, child.stderr).toBe(17);
        expect(store.get(original.id).content).toBe(original.content);
        expect(store.history(original.id)).toHaveLength(1);
        expect(capture().scan()).toMatchObject({ updated: 1 });
        expect(capture().scan()).toMatchObject({ unchanged: 1 });
        expect(store.history(original.id)).toHaveLength(2);
        const row = store.db.prepare('SELECT snapshot FROM capture_checkpoints').get();
        expect(row.snapshot).not.toContain(source);
        expect(store.codec.isEncrypted(row.snapshot)).toBe(true);
    }, 20000);

    it('imports a legacy JSON checkpoint once and subsequently ignores the stale file', () => {
        const scan = capture();
        scan.scan();
        const legacy = scan.checkpoint.load();
        store.db.exec('DELETE FROM capture_checkpoints');
        writeFileSync(statePath, JSON.stringify(legacy));
        expect(capture().scan({ dryRun: true })).toMatchObject({ unchanged: 1 });
        expect(
            store.db.prepare('SELECT COUNT(*) AS count FROM capture_checkpoints').get().count,
        ).toBe(0);
        expect(capture().scan()).toMatchObject({ unchanged: 1 });
        writeFileSync(statePath, 'broken legacy JSON');
        expect(capture().scan()).toMatchObject({ unchanged: 1 });
        expect(store.stats().total).toBe(1);
    });

    it('fails closed on unreadable legacy state before mutating memories', () => {
        writeFileSync(statePath, '{bad json');
        expect(() => capture().scan()).toThrow();
        expect(store.stats().total).toBe(0);
    });
});
