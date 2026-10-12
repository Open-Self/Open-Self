import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import { ContextImporter, detectImportFormat } from '../../../src/context/importer.js';
import {
    exportMemories,
    parseContextExport,
    validateContextExport,
} from '../../../src/context/exporter.js';
import { memoryContentHash } from '../../../src/context/schema.js';

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

    it('writes a spec-conformant contentHash on every record', () => {
        store.remember({ content: 'hash me' });
        const file = join(directory, 'hashes.jsonl');
        exportMemories(store, { file });
        const record = JSON.parse(readFileSync(file, 'utf8').trim().split('\n')[1]);
        expect(record.contentHash).toBe(memoryContentHash('hash me'));
        expect(record.contentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('re-import is idempotent even when ids differ (content dedupe)', () => {
        store.remember({ content: 'same fact, two vaults' });
        const file = join(directory, 'idem.jsonl');
        exportMemories(store, { file });

        const target = new ContextStore({ dbPath: ':memory:' });
        try {
            const importer = new ContextImporter(target);
            expect(importer.importFile(file).created).toBe(1);
            // Second import: dedupe key hit.
            expect(importer.importFile(file).created).toBe(0);
            // Same content under a brand-new id: contentHash dedupe.
            const lines = readFileSync(file, 'utf8').trim().split('\n');
            const record = JSON.parse(lines[1]);
            record.id = '00000000-0000-4000-8000-0000000000ff';
            writeFileSync(file, `${lines[0]}\n${JSON.stringify(record)}\n`);
            expect(importer.importFile(file).created).toBe(0);
            expect(target.list()).toHaveLength(1);
        } finally {
            target.close();
        }
    });
});

describe('validateContextExport', () => {
    let store;
    beforeEach(() => {
        store = new ContextStore({ dbPath: ':memory:' });
    });
    afterEach(() => store?.close());

    it('accepts a well-formed export', () => {
        store.remember({ content: 'valid' });
        const directory = mkdtempSync(join(tmpdir(), 'openself-validate-'));
        try {
            const file = join(directory, 'ok.jsonl');
            exportMemories(store, { file });
            const report = validateContextExport(readFileSync(file, 'utf8'));
            expect(report.ok).toBe(true);
            expect(report.records).toBe(1);
            expect(report.errors).toEqual([]);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('reports header and contentHash problems without throwing', () => {
        expect(validateContextExport('').ok).toBe(false);
        expect(validateContextExport('not json').ok).toBe(false);
        const bad = [
            JSON.stringify({ format: 'openself-context', version: 1 }),
            JSON.stringify({
                id: 'x',
                type: 'note',
                content: 'tampered',
                contentHash: 'f'.repeat(64),
                scope: 's',
                sensitivity: 'public',
                sourceTrust: 'external',
            }),
        ].join('\n');
        const report = validateContextExport(bad);
        expect(report.ok).toBe(false);
        expect(report.errors.join(' ')).toContain('contentHash mismatch');
    });
});
