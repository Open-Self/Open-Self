/* global document, location */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the actual controller, with only its minimal DOM surface mocked.
class Element {
    value = '';
    textContent = '';
    disabled = false;
    open = false;
    listeners = new Map();
    classes = new Set(['hidden']);
    classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
        toggle: (name, force) => (force ? this.classes.add(name) : this.classes.delete(name)),
        contains: (name) => this.classes.has(name),
    };
    addEventListener(type, callback) {
        this.listeners.set(type, callback);
    }
    emit(type) {
        return this.listeners.get(type)?.({ preventDefault: vi.fn() });
    }
    showModal() {
        this.open = true;
    }
    close() {
        this.open = false;
    }
}
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};
const response = (data, ok = true) => ({ ok, json: async () => data });
const preview = () => ({
    previewId: 'preview-1',
    contextHash: 'hash-1',
    expiresAt: Date.parse('2026-10-21T00:00:00Z'),
    context: { context: '<script>synthetic context</script>', items: 1, usedChars: 34 },
});
const run = (state = 'running', proposal) => ({
    id: 'run-1',
    state,
    output: 'Simulation only: no model ran.',
    ...(proposal ? { proposal } : {}),
});
const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};
let elements, windowTarget;
const el = (id) => document.getElementById(`workspace-${id}`);
const build = async () => {
    await el('form').emit('submit');
};
const start = async () => {
    await build();
    el('start').emit('click');
    await el('consent-confirm').emit('click');
    await flush();
};
beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    elements = new Map();
    windowTarget = new Element();
    vi.stubGlobal('document', {
        getElementById: (id) => {
            if (!elements.has(id)) elements.set(id, new Element());
            return elements.get(id);
        },
    });
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('location', { hash: '#rehearsal' });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => response(url.endsWith('/preview') ? preview() : { run: run() })),
    );
    await import('../src/context/dashboard/workspace.js');
    el('task').value = '  Atlas  ';
    el('chars').value = '8000';
});
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Workspace rehearsal browser controller', () => {
    it('previews trimmed local inputs and renders exact context as text with receipt', async () => {
        el('scope').value = ' project/atlas ';
        await build();
        expect(fetch.mock.calls[0][0]).toBe('/api/context/workspace/preview');
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
            task: 'Atlas',
            maxChars: 8000,
            scope: 'project/atlas',
        });
        expect(el('context').textContent).toBe(preview().context.context);
        expect(el('receipt').textContent).toContain('hash hash-1');
        expect(el('receipt').textContent).toContain('1 selected');
        expect(el('package').classList.contains('hidden')).toBe(false);
        expect(el('status').textContent).toContain('Preview ready');
        expect(el('preview').disabled).toBe(false);
    });
    it('renders empty context honestly and ignores start without a preview', async () => {
        el('start').emit('click');
        await el('consent-confirm').emit('click');
        expect(fetch).not.toHaveBeenCalled();
        expect(el('consent').open).toBe(false);
        fetch.mockResolvedValue(
            response({ ...preview(), context: { context: '', items: 0, usedChars: 0 } }),
        );
        await build();
        expect(el('context').textContent).toBe('(no matching context)');
    });
    it('requires explicit confirmation and Not now never starts a run', async () => {
        await build();
        el('start').emit('click');
        expect(el('consent').open).toBe(true);
        el('consent-back').emit('click');
        expect(el('consent').open).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
        el('start').emit('click');
        await el('consent-confirm').emit('click');
        expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
            previewId: 'preview-1',
            contextHash: 'hash-1',
            consent: true,
        });
        expect(el('status').textContent).toContain('No Codex or model connection');
        expect(el('start').classList.contains('hidden')).toBe(true);
    });
    it('polls progressive simulation and displays mock-only proposal approval without vault routes', async () => {
        await start();
        const proposal = { content: '<img src=x> mock only', state: 'pending' };
        fetch.mockResolvedValueOnce(response({ run: run('completed', proposal) }));
        await vi.advanceTimersByTimeAsync(250);
        expect(el('run-state').textContent).toContain('Simulation completed');
        expect(el('proposal-text').textContent).toBe(proposal.content);
        expect(el('proposal-state').textContent).toContain('Not saved to vault');
        fetch.mockResolvedValueOnce(
            response({ run: run('completed', { ...proposal, state: 'approved' }) }),
        );
        await el('proposal-approve').emit('click');
        expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({ decision: 'approve' });
        expect(el('proposal-state').textContent).toContain('approved. Not saved');
        expect(el('proposal-approve').classList.contains('hidden')).toBe(true);
        expect(fetch.mock.calls.every(([url]) => url.startsWith('/api/context/workspace'))).toBe(
            true,
        );
    });
    it('supports mock rejection and empty-output fallback', async () => {
        fetch.mockImplementation(async (url) =>
            response(
                url.endsWith('/preview')
                    ? preview()
                    : {
                          run: {
                              ...run('completed', {
                                  content: 'mock',
                                  state: url.endsWith('/proposal') ? 'rejected' : 'pending',
                              }),
                              output: '',
                          },
                      },
            ),
        );
        await start();
        expect(el('output').textContent).toContain('waiting for mock events');
        await el('proposal-reject').emit('click');
        expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({ decision: 'reject' });
        expect(el('proposal-state').textContent).toContain('rejected');
    });
    it.each([
        ['server', 'Denied'],
        ['fallback', 'Workspace rehearsal failed.'],
        ['network', 'offline'],
    ])('recovers from %s preview failure', async (kind, message) => {
        if (kind === 'network') fetch.mockRejectedValue(new Error(message));
        else fetch.mockResolvedValue(response(kind === 'server' ? { error: message } : {}, false));
        await build();
        expect(el('status').textContent).toBe(message);
        expect(el('preview').disabled).toBe(false);
    });
    it('does not retry an uncertain start without a fresh preview', async () => {
        await build();
        fetch.mockRejectedValueOnce(new Error('response lost'));
        await el('consent-confirm').emit('click');
        const calls = fetch.mock.calls.length;
        el('start').emit('click');
        await el('consent-confirm').emit('click');
        expect(fetch).toHaveBeenCalledTimes(calls);
        expect(el('consent').open).toBe(false);
        expect(el('start').classList.contains('hidden')).toBe(true);
        await build();
        expect(el('start').classList.contains('hidden')).toBe(false);
    });
    it('guards duplicate preview and stale rejected preview after input edits', async () => {
        const pending = deferred();
        fetch.mockReturnValueOnce(pending.promise);
        const building = build();
        await build();
        expect(fetch).toHaveBeenCalledTimes(1);
        el('form').emit('input');
        await build();
        pending.reject(new Error('old failure'));
        await building;
        expect(el('status').textContent).toContain('Preview ready');
    });
    it.each(['input', 'navigate'])('discards late preview on %s', async (action) => {
        const pending = deferred();
        fetch.mockReturnValueOnce(pending.promise);
        const building = build();
        if (action === 'input') el('form').emit('input');
        else {
            location.hash = '#home';
            windowTarget.emit('hashchange');
        }
        pending.resolve(response(preview()));
        await building;
        expect(el('package').classList.contains('hidden')).toBe(true);
        expect(el('context').textContent).toBe('');
    });
    it('preserves rehearsal on same-view hash but resets and cancels when leaving', async () => {
        await start();
        windowTarget.emit('hashchange');
        expect(el('run').classList.contains('hidden')).toBe(false);
        location.hash = '#home';
        windowTarget.emit('hashchange');
        await flush();
        expect(fetch.mock.lastCall[0]).toBe('/api/context/workspace/runs/run-1/cancel');
        expect(el('output').textContent).toBe('');
        expect(el('run').classList.contains('hidden')).toBe(true);
    });
    it('cancels a stale start arriving after parameters changed', async () => {
        await build();
        const pending = deferred();
        fetch.mockReturnValueOnce(pending.promise);
        const starting = el('consent-confirm').emit('click');
        el('form').emit('input');
        pending.resolve(response({ run: run() }));
        await starting;
        expect(fetch.mock.lastCall[0]).toBe('/api/context/workspace/runs/run-1/cancel');
        expect(el('status').textContent).toContain('parameters changed');
        expect(el('run').classList.contains('hidden')).toBe(true);
    });
    it('does not let an in-flight running poll overwrite a completed cancellation', async () => {
        await build();
        const pending = deferred();
        fetch.mockResolvedValueOnce(response({ run: run() })).mockReturnValueOnce(pending.promise);
        await el('consent-confirm').emit('click');
        fetch.mockResolvedValueOnce(response({ run: run('cancelled') }));
        await el('cancel').emit('click');
        pending.resolve(response({ run: run() }));
        await flush();
        expect(el('run-state').textContent).toContain('Simulation cancelled');
        expect(el('cancel').classList.contains('hidden')).toBe(true);
    });
    it.each(['start', 'cancel', 'proposal-approve', 'proposal-reject'])(
        'surfaces %s errors and restores controls',
        async (action) => {
            if (action === 'start') await build();
            else await start();
            fetch.mockRejectedValueOnce(new Error('operation failed'));
            await el(action === 'start' ? 'consent-confirm' : action).emit('click');
            expect(el('status').textContent).toBe('operation failed');
            expect(el('preview').disabled).toBe(false);
        },
    );
    it('surfaces poll errors and ignores stale poll failures', async () => {
        await start();
        fetch.mockRejectedValueOnce(new Error('poll failed'));
        await vi.advanceTimersByTimeAsync(250);
        expect(el('status').textContent).toBe('poll failed');
        el('form').emit('input');
        await flush();
        const pending = deferred();
        fetch
            .mockResolvedValueOnce(response(preview()))
            .mockResolvedValueOnce(response({ run: run() }))
            .mockReturnValueOnce(pending.promise);
        await start();
        el('form').emit('input');
        pending.reject(new Error('stale poll failure'));
        await flush();
        expect(el('status').textContent).toContain('parameters changed');
    });
});
