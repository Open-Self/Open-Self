import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureCommand } from '../../../src/cli/capture.js';
import { ContextStore } from '../../../src/context/store.js';

describe('captureCommand', () => {
    let dataDir;
    let projectDir;
    let tempDir;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'openself-capture-cli-'));
        dataDir = join(tempDir, 'vault');
        projectDir = join(tempDir, 'project');
        mkdirSync(projectDir);
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('runs a one-shot project capture with CLI options', async () => {
        writeFileSync(join(projectDir, 'direction.md'), '# Direction\n\nBuild local-first memory.');

        await captureCommand('project', projectDir, {
            dataDir,
            scope: 'project/atlas',
            sensitivity: 'personal',
            extensions: 'md',
        });

        const store = new ContextStore({ dataDir });
        expect(store.list({ scope: 'project/atlas' })).toEqual([
            expect.objectContaining({
                content: 'Build local-first memory.',
                sensitivity: 'personal',
            }),
        ]);
        store.close();
        expect(console.log).toHaveBeenCalledOnce();
    });

    it('runs a one-shot calendar export capture', async () => {
        const calendar = join(tempDir, 'calendar.ics');
        writeFileSync(
            calendar,
            [
                'BEGIN:VCALENDAR',
                'BEGIN:VEVENT',
                'UID:cli-calendar-1',
                'DTSTART:20260820T090000Z',
                'SUMMARY:CLI calendar capture',
                'END:VEVENT',
                'END:VCALENDAR',
            ].join('\r\n'),
        );

        await captureCommand('calendar', calendar, { dataDir, scope: 'calendar/work' });

        const store = new ContextStore({ dataDir });
        expect(store.list({ scope: 'calendar/work' })[0]).toMatchObject({
            summary: 'CLI calendar capture',
            source: { kind: 'calendar' },
        });
        store.close();
    });

    it('rejects unknown sources before opening a vault', async () => {
        await expect(captureCommand('cloud', projectDir, { dataDir })).rejects.toThrow(
            'Available: project, calendar, email, browser',
        );
    });

    it('requires an export path for structured sources', async () => {
        await expect(captureCommand('email', undefined, { dataDir })).rejects.toThrow(
            'local export path is required',
        );
    });

    it('rejects dry-run watch mode', async () => {
        await expect(
            captureCommand('project', projectDir, { dataDir, watch: true, dryRun: true }),
        ).rejects.toThrow('--dry-run cannot be combined with --watch');
    });

    it('validates the polling interval before starting a watcher', async () => {
        await expect(
            captureCommand('project', projectDir, { dataDir, watch: true, interval: '0' }),
        ).rejects.toThrow('--interval must be at least 1 second');
    });
});
