import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
    ContextImporter,
    chunkDocument,
    detectImportFormat,
} from '../../../src/context/importer.js';
import { ContextStore } from '../../../src/context/store.js';
import { fixturePath } from '../../helpers/fixture-loader.js';

describe('ContextImporter', () => {
    let store;
    let importer;
    let tempDir;

    beforeEach(() => {
        store = new ContextStore({ dbPath: ':memory:' });
        importer = new ContextImporter(store);
        tempDir = mkdtempSync(join(tmpdir(), 'openself-import-'));
    });

    afterEach(() => {
        store.close();
    });

    it('chunks Markdown by headings and preserves provenance', () => {
        const file = join(tempDir, 'strategy.md');
        writeFileSync(
            file,
            '# Product direction\n\nBuild a private context vault.\n\n## Pricing\n\nKeep the local core free.',
        );

        const report = importer.importFile(file, { scope: 'project/openself' });
        const memories = store.list({ scope: 'project/openself' });

        expect(report).toMatchObject({ format: 'markdown', discovered: 2, created: 2 });
        expect(memories).toHaveLength(2);
        expect(memories.map((memory) => memory.summary)).toEqual(['Pricing', 'Product direction']);
        expect(memories[0].source).toMatchObject({ kind: 'markdown', title: 'strategy.md' });
    });

    it('does not duplicate a source when imported twice', () => {
        const file = join(tempDir, 'notes.txt');
        writeFileSync(file, 'Remember the customer interview findings.');

        const first = importer.importFile(file);
        const second = importer.importFile(file);

        expect(first.created).toBe(1);
        expect(second).toMatchObject({ created: 0, duplicates: 1 });
        expect(store.stats().total).toBe(1);
    });

    it('dry-runs without writing memories', () => {
        const file = join(tempDir, 'brief.md');
        writeFileSync(file, '# Brief\n\nA useful product brief.');

        const report = importer.importFile(file, { dryRun: true });
        expect(report).toMatchObject({ discovered: 1, created: 0, dryRun: true });
        expect(store.stats().total).toBe(0);
    });

    it('auto-detects and imports WhatsApp as private timestamped events', () => {
        const file = fixturePath('whatsapp-tiny.txt');
        expect(detectImportFormat(file)).toBe('whatsapp');

        const report = importer.importFile(file, { scope: 'relationship/bob' });
        const memories = store.list({ scope: 'relationship/bob', limit: 100 });

        expect(report.created).toBeGreaterThan(0);
        expect(memories[0]).toMatchObject({
            type: 'event',
            sensitivity: 'private',
            scope: 'relationship/bob',
        });
        expect(memories[0].occurredAt).toMatch(/^20\d{2}-/);
        expect(memories[0].tags).toContain('whatsapp');
    });

    it('imports Telegram JSON with its original timestamp', () => {
        const file = join(tempDir, 'telegram.json');
        writeFileSync(
            file,
            JSON.stringify({
                messages: [
                    {
                        type: 'message',
                        from: 'Minh',
                        date: '2026-08-13T09:15:00.000Z',
                        text: 'Ship the context importer',
                    },
                ],
            }),
        );

        const report = importer.importFile(file);
        const [memory] = store.list();

        expect(report).toMatchObject({ format: 'telegram', created: 1 });
        expect(memory.occurredAt).toBe('2026-08-13T09:15:00.000Z');
        expect(memory.content).toBe('Minh: Ship the context importer');
    });

    it('rejects unsupported explicit formats', () => {
        const file = join(tempDir, 'data.csv');
        writeFileSync(file, 'a,b');
        expect(() => importer.importFile(file, { format: 'csv' })).toThrow(
            'Unsupported import format',
        );
    });
});

describe('chunkDocument', () => {
    it('splits oversized blocks without losing content', () => {
        const chunks = chunkDocument('word '.repeat(100), 80);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.content.length <= 80)).toBe(true);
    });

    it('recognizes headings without requiring blank lines', () => {
        expect(chunkDocument('# Direction\nBuild the vault.')).toEqual([
            { heading: 'Direction', content: 'Build the vault.' },
        ]);
    });

    it('returns no chunks for blank input', () => {
        expect(chunkDocument('   ')).toEqual([]);
    });
});
