import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../../src/cli/init.js';
import { doctorCommand } from '../../../src/cli/doctor.js';
import { contextCommand } from '../../../src/cli/context.js';
import { inboxCommand } from '../../../src/cli/inbox.js';
import { demoCommand } from '../../../src/cli/demo.js';
import { connectCommand } from '../../../src/cli/connect.js';
import { skillCommand, validateSkillDir } from '../../../src/cli/skill.js';
import { ContextStore } from '../../../src/context/store.js';

function captureConsole(fn) {
    const logs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(args.join(' '));
    });
    const wrap = (result) => ({ result, logs, output: logs.join('\n') });
    let result;
    try {
        result = fn();
    } catch (error) {
        spy.mockRestore();
        throw error;
    }
    if (result && typeof result.then === 'function') {
        return result.then(
            (value) => {
                spy.mockRestore();
                return wrap(value);
            },
            (error) => {
                spy.mockRestore();
                throw error;
            },
        );
    }
    spy.mockRestore();
    return wrap(result);
}

describe('new agent-era CLI commands', () => {
    let directory;
    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'openself-cli-'));
    });
    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    describe('init', () => {
        it('creates a vault idempotently and reports next steps', { timeout: 30_000 }, () => {
            const first = captureConsole(() =>
                initCommand({ dataDir: directory, json: true }),
            ).result;
            expect(first.created).toBe(true);
            expect(first.schemaReady).toBe(true);
            const second = captureConsole(() =>
                initCommand({ dataDir: directory, json: true }),
            ).result;
            expect(second.created).toBe(false);
        });
    });

    describe('doctor', () => {
        it('passes on a healthy vault and never prints secrets', { timeout: 30_000 }, () => {
            initCommand({ dataDir: directory, json: true });
            const { result, output } = captureConsole(() =>
                doctorCommand({ dataDir: directory, json: true }),
            );
            expect(result.ok).toBe(true);
            expect(result.checks.every((check) => check.status === 'pass')).toBe(true);
            expect(output).not.toContain('OPENSELF_VAULT_KEY');
        });
    });

    describe('context', () => {
        it(
            'returns context with a receipt when --explain is set',
            { timeout: 30_000 },
            async () => {
                const store = new ContextStore({ dataDir: directory });
                store.remember({
                    type: 'decision',
                    content: 'Atlas uses SQLite',
                    scope: 'project/atlas',
                });
                store.close();
                const { result } = await captureConsole(() =>
                    contextCommand('what database', {
                        dataDir: directory,
                        scope: 'project/atlas',
                        explain: true,
                        json: true,
                    }),
                );
                expect(result.context).toContain('SQLite');
                expect(result.receipt.totals.selected).toBe(1);
                expect(result.receipt.candidates[0].decision).toBe('selected');
            },
        );
    });

    describe('inbox', () => {
        it('lists, approves, and rejects proposals', { timeout: 30_000 }, () => {
            const store = new ContextStore({ dataDir: directory });
            const proposal = store.proposeMemory(
                { content: 'Atlas uses SQLite', type: 'decision', scope: 'project/atlas' },
                { proposedBy: 'agent-a' },
            );
            const rejected = store.proposeMemory({ content: 'junk' }, { proposedBy: 'agent-b' });
            store.close();

            const listed = captureConsole(() =>
                inboxCommand('list', { dataDir: directory, json: true }),
            ).result;
            expect(listed).toHaveLength(2);

            const approved = captureConsole(() =>
                inboxCommand('approve', {
                    dataDir: directory,
                    id: proposal.id,
                    sourceTrust: 'verified',
                    json: true,
                }),
            ).result;
            expect(approved.sourceTrust).toBe('verified');

            captureConsole(() =>
                inboxCommand('reject', { dataDir: directory, id: rejected.id, json: true }),
            );
            const verify = new ContextStore({ dataDir: directory });
            expect(verify.getProposal(proposal.id).status).toBe('approved');
            expect(verify.getProposal(rejected.id).status).toBe('rejected');
            verify.close();
        });
    });

    describe('connect', () => {
        it('prints a generic stdio configuration', () => {
            const { result } = captureConsole(() => connectCommand('generic', { json: true }));
            expect(result.config.mcpServers.openself.command).toBe('npx');
            expect(result.config.mcpServers.openself.args).toContain('mcp');
        });

        it('merges JSON config in a project file without touching other entries', () => {
            const projectDir = join(directory, 'repo');
            mkdirSync(join(projectDir, '.cursor'), { recursive: true });
            const configPath = join(projectDir, '.cursor', 'mcp.json');
            writeFileSync(
                configPath,
                JSON.stringify({ mcpServers: { other: { command: 'other' } } }, null, 2),
            );
            const cwd = process.cwd();
            try {
                process.chdir(projectDir);
                const { result } = captureConsole(() =>
                    connectCommand('cursor', { project: true, client: 'agent' }),
                );
                expect(result.action).toBe('updated');
                const written = JSON.parse(readFileSync(configPath, 'utf8'));
                expect(written.mcpServers.other.command).toBe('other');
                expect(written.mcpServers.openself.command).toBe('npx');
                // A backup was created alongside the original file.
                const backup = result.backup;
                expect(backup && existsSync(backup)).toBe(true);
            } finally {
                process.chdir(cwd);
            }
        });

        it('supports --dry-run and --remove idempotently', () => {
            const projectDir = join(directory, 'repo2');
            mkdirSync(projectDir, { recursive: true });
            const cwd = process.cwd();
            try {
                process.chdir(projectDir);
                const dry = captureConsole(() =>
                    connectCommand('claude', { project: true, dryRun: true }),
                ).result;
                expect(dry.action).toBe('dry-run:created');
                expect(existsSync(join(projectDir, '.mcp.json'))).toBe(false);

                captureConsole(() => connectCommand('claude', { project: true }));
                const removed = captureConsole(() =>
                    connectCommand('claude', { project: true, remove: true }),
                ).result;
                expect(removed.action).toBe('removed');
                const again = captureConsole(() =>
                    connectCommand('claude', { project: true, remove: true }),
                ).result;
                expect(again.action).toBe('not-installed');
            } finally {
                process.chdir(cwd);
            }
        });

        it('emits a Codex TOML block without clobbering existing config', () => {
            const fakeHome = join(directory, 'home');
            const configPath = join(fakeHome, '.codex', 'config.toml');
            mkdirSync(join(fakeHome, '.codex'), { recursive: true });
            writeFileSync(configPath, '# existing\ntheme = "dark"\n');
            const env = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
            process.env.HOME = fakeHome;
            process.env.USERPROFILE = fakeHome;
            try {
                const { result } = captureConsole(() =>
                    connectCommand('codex', { client: 'agent' }),
                );
                expect(result.action).toBe('updated');
                const written = readFileSync(configPath, 'utf8');
                expect(written).toContain('theme = "dark"');
                expect(written).toContain('[mcp_servers.openself]');
                expect(written).toContain('command = "npx"');

                // Second run is idempotent — still exactly one openself table.
                captureConsole(() => connectCommand('codex', { client: 'agent' }));
                const again = readFileSync(configPath, 'utf8');
                expect(again.match(/\[mcp_servers\.openself\]/g)).toHaveLength(1);
            } finally {
                if (env.HOME === undefined) delete process.env.HOME;
                else process.env.HOME = env.HOME;
                if (env.USERPROFILE === undefined) delete process.env.USERPROFILE;
                else process.env.USERPROFILE = env.USERPROFILE;
            }
        });
    });

    describe('skill', () => {
        it('validates the bundled Agent Skill', () => {
            const { result } = captureConsole(() => skillCommand('validate', { json: true }));
            expect(result.valid).toBe(true);
            expect(result.problems).toHaveLength(0);
        });

        it('installs and uninstalls into a target directory', () => {
            const target = join(directory, 'skills');
            const { result: installed } = captureConsole(() =>
                skillCommand('install', { target, json: true }),
            );
            expect(installed.installed).toBe(true);
            expect(existsSync(join(installed.destination, 'SKILL.md'))).toBe(true);
            const { result: removed } = captureConsole(() =>
                skillCommand('uninstall', { target, json: true }),
            );
            expect(removed.removed).toBe(true);
        });

        it('flags invalid skill directories', () => {
            const bad = join(directory, 'bad-skill');
            mkdirSync(bad, { recursive: true });
            writeFileSync(join(bad, 'SKILL.md'), 'no frontmatter');
            expect(validateSkillDir(bad).length).toBeGreaterThan(0);
        });
    });

    describe('demo', () => {
        it('runs the two-agent flow without network credentials', { timeout: 60_000 }, async () => {
            const { result } = await captureConsoleAsync(() => demoCommand({ json: true }));
            const steps = Object.fromEntries(result.transcript.map((item) => [item.step, item]));
            expect(steps.remember.memory.scope).toBe('project/atlas');
            expect(steps['denied-write'].isError).toBe(true);
            expect(steps.proposal.proposal.status).toBe('pending');
            expect(steps.proposal.approved.content).toContain('db/migrate');
            expect(steps['restricted-search'].leaked).toBe(false);
            expect(steps.audit.events.length).toBeGreaterThan(0);
            // Temporary vault was cleaned up.
            expect(existsSync(result.dataDir)).toBe(false);
        });
    });
});

async function captureConsoleAsync(fn) {
    const logs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(args.join(' '));
    });
    try {
        const result = await fn();
        return { result, logs, output: logs.join('\n') };
    } finally {
        spy.mockRestore();
    }
}
