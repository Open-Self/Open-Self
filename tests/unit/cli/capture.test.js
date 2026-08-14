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

    it('rejects unknown sources before opening a vault', async () => {
        await expect(captureCommand('calendar', projectDir, { dataDir })).rejects.toThrow(
            'Currently available: project',
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
