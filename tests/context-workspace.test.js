import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextStore } from '../src/context/store.js';
import { WorkspaceRehearsal } from '../src/context/workspace.js';
import { createContextServer } from '../src/context/server.js';

let store, workspace;
afterEach(() => {
    workspace?.close();
    store?.close();
    vi.restoreAllMocks();
});
function setup(options = {}) {
    store = new ContextStore({ dbPath: ':memory:' });
    workspace = new WorkspaceRehearsal(store, options);
}
const confirmation = (preview) => ({
    previewId: preview.previewId,
    contextHash: preview.contextHash,
    consent: true,
});

describe('Workspace rehearsal frozen consent', () => {
    it('previews real compiler output with private policy, scoped lexical retrieval and no denied metadata', () => {
        setup();
        const chosen = store.remember({
            content: 'Atlas database uses SQLite',
            scope: 'project/atlas',
        });
        const denied = store.remember({
            content: 'Atlas restricted sentinel',
            scope: 'project/atlas',
            sensitivity: 'restricted',
            source: { kind: 'manual', title: 'RESTRICTED_TITLE' },
        });
        store.remember({ content: 'Atlas elsewhere sentinel', scope: 'other' });
        const compile = vi.spyOn(store, 'compileContext');
        const encode = vi.spyOn(store.vectorProvider, 'encodeSync');
        const preview = workspace.preview({
            task: 'Atlas',
            scope: 'project/atlas',
            maxChars: 8000,
        });
        expect(preview.context.memories.map((m) => m.id)).toEqual([chosen.id]);
        expect(preview.contextHash).toBe(preview.context.contextHash);
        expect(preview.context.receipt).toBeDefined();
        expect(
            compile.mock.calls.every(
                ([request, options]) =>
                    request.retrieval === 'lexical' && options.diagnostics === false,
            ),
        ).toBe(true);
        expect(JSON.stringify(preview)).not.toContain(denied.id);
        expect(JSON.stringify(preview)).not.toMatch(
            /restricted sentinel|RESTRICTED_TITLE|elsewhere sentinel/,
        );
        expect(encode).not.toHaveBeenCalled();
        expect(preview).toMatchObject({
            state: 'preview',
            mode: 'simulation',
            transport: 'mock',
            liveAvailable: false,
        });
    });

    it('requires exact hash, consent and a fresh baseline, including unrelated vault edits', () => {
        setup();
        const preview = workspace.preview({ task: 'Atlas' });
        expect(() => workspace.start({ ...confirmation(preview), consent: false })).toThrow();
        expect(() =>
            workspace.start({ ...confirmation(preview), contextHash: 'a'.repeat(64) }),
        ).toThrow('does not match');
        expect(() => workspace.start({ ...confirmation(preview), transport: 'codex' })).toThrow();
        store.remember({ content: 'Unrelated vault update' });
        expect(() => workspace.start(confirmation(preview))).toThrow('Vault changed');
    });

    it('rejects invalid inputs and compiler errors without creating a runnable preview', () => {
        setup();
        for (const input of [
            {},
            { task: '' },
            { task: 'x', maxChars: 999999 },
            { task: 'x', scope: '../secrets' },
            { task: 'x', diagnostics: true },
            { task: 'x', mode: 'live' },
        ]) {
            expect(() => workspace.preview(input)).toThrow();
        }
        vi.spyOn(store, 'compileContext').mockImplementation(() => {
            throw new Error('compiler unavailable');
        });
        expect(() => workspace.preview({ task: 'x' })).toThrow('compiler unavailable');
        expect(() =>
            workspace.start({
                previewId: '11111111-1111-4111-8111-111111111111',
                contextHash: 'a'.repeat(64),
                consent: true,
            }),
        ).toThrow('not found');
    });

    it('streams only honest deterministic simulation, handles duplicate starts and never writes mock proposals', () => {
        const callbacks = [];
        setup({
            schedule: (fn) => {
                callbacks.push(fn);
                return callbacks.length;
            },
            unschedule: () => {},
        });
        store.remember({ content: 'Atlas context' });
        const writesBefore = store.db.prepare('SELECT total_changes() AS n').get().n;
        const proposalsBefore = store.listProposals({ status: null });
        const preview = workspace.preview({ task: 'Atlas' });
        const run = workspace.start(confirmation(preview));
        expect(workspace.start(confirmation(preview)).id).toBe(run.id);
        expect(callbacks).toHaveLength(1);
        expect(() => workspace.decideProposal(run.id, { decision: 'approve' })).toThrow('Complete');
        while (callbacks.length) callbacks.shift()();
        const completed = workspace.get(run.id);
        expect(completed.state).toBe('completed');
        expect(completed.output).toBe(
            `Simulation only: mock transport received ${preview.context.context.length} context characters; no model ran. No task was performed and nothing was saved to the vault.`,
        );
        expect(completed.events).toHaveLength(3);
        expect(completed.proposal.state).toBe('pending');
        expect(workspace.decideProposal(run.id, { decision: 'approve' }).proposal).toMatchObject({
            state: 'approved',
            storedInVault: false,
        });
        expect(workspace.decideProposal(run.id, { decision: 'approve' }).proposal.state).toBe(
            'approved',
        );
        expect(() => workspace.decideProposal(run.id, { decision: 'reject' })).toThrow(
            'already reviewed',
        );
        expect(store.listProposals({ status: null })).toEqual(proposalsBefore);
        expect(store.db.prepare('SELECT total_changes() AS n').get().n).toBe(writesBefore);
    });

    it('cancellation and close prevent stale callbacks resurrecting runs', () => {
        const callbacks = [];
        setup({
            schedule: (fn) => {
                callbacks.push(fn);
                return 1;
            },
            unschedule: () => {},
        });
        const run = workspace.start(confirmation(workspace.preview({ task: 'test' })));
        callbacks[0]();
        const cancelled = workspace.cancel(run.id);
        callbacks.forEach((fn) => fn());
        expect(workspace.get(run.id)).toEqual(cancelled);
        expect(cancelled.state).toBe('cancelled');
        expect(cancelled.proposal).toBeUndefined();
        expect(workspace.cancel(run.id)).toEqual(cancelled);
        workspace.close();
        callbacks.forEach((fn) => fn());
        expect(() => workspace.get(run.id)).toThrow('closed');
    });

    it('bounds storage and expires previews/runs even if stale callbacks fire', () => {
        let time = 0;
        const callbacks = [];
        setup({
            now: () => time,
            ttlMs: 1000,
            capacity: 1,
            schedule: (fn) => {
                callbacks.push(fn);
                return 1;
            },
            unschedule: () => {},
        });
        const preview = workspace.preview({ task: 'test' });
        expect(() => workspace.preview({ task: 'more' })).toThrow('Too many');
        const run = workspace.start(confirmation(preview));
        time = 1001;
        callbacks[0]();
        expect(() => workspace.get(run.id)).toThrow('not found');
        expect(() => workspace.start(confirmation(preview))).toThrow('not found');
        expect(workspace.preview({ task: 'new' }).state).toBe('preview');
    });

    it('rejects placeholders only in memory and isolates returned snapshots', () => {
        const callbacks = [];
        setup({
            schedule: (fn) => {
                callbacks.push(fn);
                return 1;
            },
            unschedule: () => {},
        });
        const preview = workspace.preview({ task: 'test' });
        const originalHash = preview.contextHash;
        preview.context.context = 'Tampered caller context';
        const run = workspace.start(confirmation(preview));
        run.state = 'completed';
        expect(workspace.get(run.id).state).toBe('running');
        while (callbacks.length) callbacks.shift()();
        const result = workspace.decideProposal(run.id, { decision: 'reject' });
        expect(result.proposal.state).toBe('rejected');
        expect(result.contextHash).toBe(originalHash);
        result.proposal.state = 'approved';
        expect(workspace.get(run.id).proposal.state).toBe('rejected');
        expect(workspace.cancel(run.id).state).toBe('completed');
        expect(store.listProposals({ status: null })).toEqual([]);
    });

    it('fails closed on scheduling error', () => {
        setup({
            schedule: () => {
                throw new Error('failed');
            },
        });
        const run = workspace.start(confirmation(workspace.preview({ task: 'test' })));
        expect(run.state).toBe('error');
        expect(run.output).toContain('No model ran');
        expect(run.proposal).toBeUndefined();
    });
});

describe('Workspace owner-only API', () => {
    it('enforces auth, exact same-origin JSON and hardcoded mock mode on every mutation', async () => {
        setup();
        const codex = { getStatus: vi.fn(), login: vi.fn(), close: vi.fn() };
        const context = createContextServer({ store, token: 'workspace-test', codexBridge: codex });
        const server = await new Promise((resolve) => {
            const listener = context.app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const headers = {
            authorization: 'Bearer workspace-test',
            origin,
            'content-type': 'application/json',
        };
        const post = (path, body, override = {}) =>
            fetch(`${origin}/api/context/workspace${path}`, {
                method: 'POST',
                headers: { ...headers, ...override },
                body: JSON.stringify(body),
            });
        try {
            for (const path of ['/preview', '/start', '/runs/fake/cancel', '/runs/fake/proposal']) {
                expect((await post(path, {}, { authorization: '' })).status).toBe(401);
                expect((await post(path, {}, { origin: 'http://localhost:9' })).status).toBe(403);
                expect((await post(path, {}, { origin: '' })).status).toBe(403);
                expect((await post(path, {}, { 'content-type': 'text/plain' })).status).toBe(415);
            }
            expect((await post('/preview', { task: 'test', transport: 'real' })).status).toBe(400);
            const response = await post('/preview', { task: 'test' });
            expect(response.headers.get('cache-control')).toBe('no-store');
            const preview = await response.json();
            expect(
                (await post('/start', { ...confirmation(preview), consent: false })).status,
            ).toBe(400);
            const { run } = await (await post('/start', confirmation(preview))).json();
            expect(run.mode).toBe('simulation');
            expect((await fetch(`${origin}/api/context/workspace/runs/${run.id}`)).status).toBe(
                401,
            );
            const result = await (await post(`/runs/${run.id}/cancel`, {})).json();
            expect(result.run.state).toBe('cancelled');
            expect(codex.login).not.toHaveBeenCalled();
            expect(codex.getStatus).not.toHaveBeenCalled();
        } finally {
            context.close();
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
