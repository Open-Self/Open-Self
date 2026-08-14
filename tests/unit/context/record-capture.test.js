import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordCapture } from '../../../src/context/record-capture.js';
import { ContextStore } from '../../../src/context/store.js';

describe('RecordCapture', () => {
    let records;
    let sourcePath;
    let statePath;
    let store;
    let tempDir;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'openself-record-capture-'));
        sourcePath = join(tempDir, 'source.json');
        statePath = join(tempDir, 'state.json');
        writeFileSync(sourcePath, '{}');
        store = new ContextStore({ dbPath: ':memory:' });
        records = [draft('one', 'First record')];
    });

    afterEach(() => {
        store.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    function createCapture(options = {}) {
        return new RecordCapture(
            store,
            sourcePath,
            (_path, parserOptions) =>
                records.map((record) => ({
                    ...record,
                    memory: {
                        ...record.memory,
                        scope: parserOptions.scope,
                        sensitivity: parserOptions.sensitivity,
                    },
                })),
            {
                connector: 'test-source',
                statePath,
                ...options,
            },
        );
    }

    it('adds, skips, updates, and removes records incrementally', () => {
        const capture = createCapture();
        expect(capture.scan()).toMatchObject({ added: 1 });
        const original = store.list()[0];
        expect(capture.scan()).toMatchObject({ unchanged: 1 });

        records = [draft('one', 'Updated record'), draft('two', 'Second record')];
        expect(capture.scan()).toMatchObject({ updated: 1, added: 1 });
        expect(store.list()).toHaveLength(2);
        expect(store.get(original.id).content).toBe('Updated record');

        records = [draft('two', 'Second record')];
        expect(capture.scan()).toMatchObject({ removed: 1, unchanged: 1 });
        expect(store.get(original.id, { includeForgotten: true }).status).toBe('forgotten');
    });

    it('dry-runs without writing memories or state', () => {
        const report = createCapture().scan({ dryRun: true });
        expect(report).toMatchObject({ added: 1, dryRun: true });
        expect(store.stats().total).toBe(0);
    });

    it('reuses a memory ID when policy changes', () => {
        createCapture({ sensitivity: 'personal' }).scan();
        const id = store.list()[0].id;
        createCapture({ sensitivity: 'restricted' }).scan();
        expect(store.list()[0]).toMatchObject({ id, sensitivity: 'restricted' });
    });

    it('coalesces duplicate parser keys', () => {
        records = [draft('one', 'First record'), draft('one', 'Duplicate record')];
        expect(createCapture().scan().discovered).toBe(1);
        expect(store.list()).toHaveLength(1);
    });
});

function draft(key, content) {
    return {
        key,
        memory: {
            type: 'note',
            content,
            source: { kind: 'test-source' },
            scope: 'test/source',
            sensitivity: 'private',
            tags: ['test-source'],
        },
    };
}
