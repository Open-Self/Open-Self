import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import { ContextImporter, detectImportFormat } from '../../../src/context/importer.js';
import { exportMemories, parseContextExport } from '../../../src/context/exporter.js';

describe('portable context export', () => {
    let directory;
    let store;
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'openself-export-'));
        store = new ContextStore({ dbPath: ':memory:' });
    });
    afterEach(() => {
        store?.close();
        rmSync(directory, { recursive: true, force: true });
    });

    it('exports a versioned JSONL document and re-imports it into another vault', () => {
        store.remember({
            type: 'decision',
            content: 'Atlas uses SQLite',
            scope: 'project/atlas',
            tags: ['architecture'],
            source: { kind: 'meeting', title: 'architecture review' },
        });
        store.remember({ content: 'personal note', scope: 'personal' });

        const file = join(directory, 'atlas.jsonl');
        const report = exportMemories(store, { file, scope: 'project/atlas' });
        expect(report.format).toBe('openself-context');
        expect(report.count).toBe(1);

        const lines = readFileSync(file, 'utf8').trim().split('\n');
        const header = JSON.parse(lines[0]);
        expect(header.format).toBe('openself-context');
        expect(header.version).toBe(1);
        expect(JSON.parse(lines[1]).content).toContain('SQLite');

        const target = new ContextStore({ dbPath: ':memory:' });
        try {
            const importer = new ContextImporter(target);
            const result = importer.importFile(file);
            expect(result.created).toBe(1);
            const imported = target.search('SQLite', { scope: 'project/atlas' });
            expect(imported).toHaveLength(1);
            // Imported trust is capped — a file cannot claim owner authorship.
            expect(imported[0].sourceTrust).toBe('external');
            expect(imported[0].tags).toContain('imported');
        } finally {
            target.close();
        }
    });

    it('excludes restricted memories unless includeRestricted is explicit', () => {
        store.remember({ content: 'public fact', sensitivity: 'public' });
        store.remember({ content: 'bank detail', sensitivity: 'restricted' });

        const file = join(directory, 'partial.jsonl');
        const report = exportMemories(store, { file });
        expect(report.count).toBe(1);

        const full = join(directory, 'full.jsonl');
        const fullReport = exportMemories(store, { file: full, includeRestricted: true });
        expect(fullReport.count).toBe(2);
    });

    it('supports --dry-run without writing a file', () => {
        store.remember({ content: 'x' });
        const report = exportMemories(store, { dryRun: true });
        expect(report.dryRun).toBe(true);
        expect(report.count).toBe(1);
        expect(report.memories).toHaveLength(1);
        expect(report.file).toBeUndefined();
    });

    it('rejects malformed export files', () => {
        expect(() => parseContextExport('not json')).toThrow('header');
        expect(() => parseContextExport('{"format":"other","version":1}\n{}')).toThrow(
            'Unsupported export format',
        );
        expect(() => parseContextExport('{"format":"openself-context","version":99}\n{}')).toThrow(
            'Unsupported export version',
        );
    });

    it('detects the openself format from .jsonl files', () => {
        const file = join(directory, 'ctx.jsonl');
        writeFileSync(file, '{"format":"openself-context","version":1}\n');
        expect(detectImportFormat(file)).toBe('openself');
    });
});
