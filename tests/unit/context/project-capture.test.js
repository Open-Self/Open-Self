import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectFolderCapture } from '../../../src/context/project-capture.js';
import { ContextStore } from '../../../src/context/store.js';

describe('ProjectFolderCapture', () => {
    let capture;
    let projectDir;
    let statePath;
    let store;
    let tempDir;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'openself-project-capture-'));
        projectDir = join(tempDir, 'useful-app');
        statePath = join(tempDir, 'state', 'project.json');
        mkdirSync(projectDir);
        store = new ContextStore({ dbPath: ':memory:' });
        capture = new ProjectFolderCapture(store, projectDir, { statePath });
    });

    afterEach(() => {
        store.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('captures supported files with project provenance and ignores unchanged scans', () => {
        writeFileSync(join(projectDir, 'README.md'), '# Direction\n\nBuild the useful thing.');

        const first = capture.scan();
        const second = capture.scan();
        const [memory] = store.list({ scope: 'project/useful-app' });

        expect(first).toMatchObject({ discovered: 1, added: 1, updated: 0 });
        expect(second).toMatchObject({ discovered: 1, unchanged: 1 });
        expect(memory).toMatchObject({
            content: 'Build the useful thing.',
            summary: 'Direction',
            scope: 'project/useful-app',
            sensitivity: 'private',
            source: { kind: 'project-file', locator: 'README.md', title: 'README.md' },
        });
        expect(memory.tags).toEqual(expect.arrayContaining(['project', 'md', 'direction']));
    });

    it('versions changed files instead of accumulating stale active memories', () => {
        const file = join(projectDir, 'decision.md');
        writeFileSync(file, '# Database\n\nUse SQLite.');
        capture.scan();
        const original = store.list()[0];

        writeFileSync(file, '# Database\n\nUse PostgreSQL for the hosted edition.');
        const report = capture.scan();
        const active = store.list();

        expect(report.updated).toBe(1);
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(original.id);
        expect(active[0].content).toContain('PostgreSQL');
        expect(store.history(original.id).map((version) => version.changeKind)).toEqual([
            'updated',
            'created',
        ]);
    });

    it('soft-forgets memories when their source file is deleted', () => {
        const file = join(projectDir, 'temporary.txt');
        writeFileSync(file, 'This context will become obsolete.');
        capture.scan();
        const id = store.list()[0].id;

        unlinkSync(file);
        const report = capture.scan();

        expect(report.removed).toBe(1);
        expect(store.list()).toEqual([]);
        expect(store.get(id, { includeForgotten: true }).status).toBe('forgotten');
    });

    it('skips dependency folders, secret filenames, binaries, and oversized files', () => {
        mkdirSync(join(projectDir, 'node_modules'));
        writeFileSync(join(projectDir, 'node_modules', 'package.js'), 'do not capture');
        writeFileSync(join(projectDir, '.env'), 'API_KEY=secret');
        writeFileSync(join(projectDir, 'credentials.json'), '{"token":"secret"}');
        writeFileSync(join(projectDir, 'image.txt'), Buffer.from([0, 1, 2, 3]));
        writeFileSync(join(projectDir, 'large.md'), 'x'.repeat(100));
        writeFileSync(join(projectDir, 'safe.js'), 'export const safe = true;');
        capture = new ProjectFolderCapture(store, projectDir, { statePath, maxFileBytes: 50 });

        const report = capture.scan();
        const memories = store.list();

        expect(report).toMatchObject({ discovered: 2, added: 1, skipped: 1 });
        expect(memories).toHaveLength(1);
        expect(memories[0].source.locator).toBe('safe.js');
    });

    it('dry-runs without changing the vault or connector state', () => {
        writeFileSync(join(projectDir, 'plan.md'), '# Plan\n\nShip safely.');

        const report = capture.scan({ dryRun: true });

        expect(report).toMatchObject({ added: 1, dryRun: true });
        expect(store.stats().total).toBe(0);
        expect(existsSync(statePath)).toBe(false);
    });

    it('keeps default in-memory connector state inside the project .openself directory', () => {
        writeFileSync(join(projectDir, 'notes.txt'), 'Local connector state.');
        capture = new ProjectFolderCapture(store, projectDir);

        capture.scan();

        expect(existsSync(join(projectDir, '.openself', 'connectors'))).toBe(true);
        expect(existsSync(join(projectDir, 'connectors'))).toBe(false);
    });

    it('supports explicit extensions and additional ignored directories', () => {
        mkdirSync(join(projectDir, 'generated'));
        writeFileSync(join(projectDir, 'generated', 'schema.graphql'), 'type Ignored { id: ID }');
        writeFileSync(join(projectDir, 'schema.graphql'), 'type User { id: ID! }');
        writeFileSync(join(projectDir, 'README.md'), 'Not selected.');
        capture = new ProjectFolderCapture(store, projectDir, {
            statePath,
            extensions: ['graphql'],
            ignore: ['generated'],
        });

        const report = capture.scan();

        expect(report.discovered).toBe(1);
        expect(store.list()[0].source.locator).toBe('schema.graphql');
    });

    it('reprocesses unchanged content when capture permissions change', () => {
        writeFileSync(join(projectDir, 'policy.md'), 'Keep this local.');
        capture.scan();
        const original = store.list()[0];
        capture = new ProjectFolderCapture(store, projectDir, {
            statePath,
            scope: 'project/useful-app/security',
            sensitivity: 'restricted',
        });

        const report = capture.scan();
        const [memory] = store.list({ scope: 'project/useful-app/security' });

        expect(report.updated).toBe(1);
        expect(memory).toMatchObject({ id: original.id, sensitivity: 'restricted' });
        expect(store.history(original.id)).toHaveLength(2);
    });

    it('rejects paths that are not project folders', () => {
        expect(() => new ProjectFolderCapture(store, join(tempDir, 'missing'))).toThrow(
            'Project folder not found',
        );
    });
});
