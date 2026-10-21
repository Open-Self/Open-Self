import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the DOM surface used by the controller is mocked. Import the real module
// so these event-driven tests contribute source coverage, unlike a copied script.
class Element {
    value = '';
    textContent = '';
    disabled = false;
    files = [];
    children = [];
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
        return this.listeners.get(type)?.({ target: this, preventDefault: vi.fn() });
    }
    replaceChildren(...children) {
        this.children = children;
    }
    append(child) {
        this.children.push(child);
    }
    showModal() {
        this.open = true;
    }
    close() {
        this.open = false;
    }
    click = vi.fn();
}

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};
const result = (candidates = []) => {
    const pkg = {
        context: 'Safe context',
        contextHash: 'hash-a',
        items: 1,
        usedChars: 12,
        usedTokens: 3,
        query: 'Atlas',
        receipt: { filters: { scope: null }, budget: { maxChars: 200 }, asOf: '2026-10-21' },
    };
    return {
        baseline: { revision: 'revision-1', asOf: '2026-10-21', compilerVersion: '1' },
        a: structuredClone(pkg),
        b: { ...structuredClone(pkg), contextHash: 'hash-b' },
        diff: { added: ['one'], removed: [], changed: [], unchanged: [], candidates },
        scenario: { kind: 'openself-context-lab', version: 1 },
    };
};
const scenario = () => ({
    kind: 'openself-context-lab',
    version: 1,
    baseline: { revision: 'revision-1' },
    a: { query: 'advanced', budget: { maxTokens: 10 } },
    b: { query: 'advanced', scope: 'personal' },
    results: { a: { contextHash: 'hash-a' }, b: { contextHash: 'hash-b' } },
});
let elements;
let created;
let windowTarget;
const el = (id) => elements.get(`lab-${id}`);
const run = async () => {
    el('form').emit('submit');
    await flush();
};
const importScenario = async (value) => {
    el('import').files = [{ size: 100, text: async () => JSON.stringify(value) }];
    await el('import').emit('change');
};

beforeEach(async () => {
    vi.resetModules();
    elements = new Map();
    created = [];
    windowTarget = new Element();
    vi.stubGlobal('document', {
        getElementById: (id) => {
            if (!elements.has(id)) elements.set(id, new Element());
            return elements.get(id);
        },
        createElement: (tag) => {
            const node = new Element();
            node.tag = tag;
            created.push(node);
            return node;
        },
    });
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('location', { hash: '#lab' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => result() }));
    await import('../src/context/dashboard/lab.js');
    for (const id of ['query', 'a-chars', 'b-chars', 'a-scope', 'b-scope', 'a-asof', 'b-asof']) {
        globalThis.document.getElementById(`lab-${id}`);
    }
    el('a-chars').value = '200';
    el('b-chars').value = '300';
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Context Lab browser controller', () => {
    it('posts trimmed A/B inputs and renders safe text, statistics, and decision differences', async () => {
        el('query').value = '  Atlas  ';
        el('a-scope').value = ' project/atlas ';
        el('b-asof').value = ' 2026-10-20 ';
        const response = result([
            {
                id: '<script>unsafe</script>',
                a: null,
                b: { decision: 'selected', reason: 'match', contentHash: 'abc' },
            },
            { id: 'removed', a: { decision: 'excluded', reason: 'budget' }, b: null },
        ]);
        response.b.context = '';
        response.b.query = '';
        response.b.receipt.filters.scope = 'personal';
        fetch.mockResolvedValue({ ok: true, json: async () => response });
        await run();
        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe('/api/context/lab/compare');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({
            a: {
                query: 'Atlas',
                retrieval: 'lexical',
                budget: { maxChars: 200 },
                scope: 'project/atlas',
            },
            b: {
                query: 'Atlas',
                retrieval: 'lexical',
                budget: { maxChars: 300 },
                asOf: '2026-10-20',
            },
        });
        expect(el('baseline').textContent).toContain('revision-1');
        expect(el('a-context').textContent).toBe('Safe context');
        expect(el('b-context').textContent).toBe('(no matching context)');
        expect(el('a-stats').textContent).toContain('12/200 characters');
        expect(el('a-stats').textContent).toContain('scope all allowed · query Atlas');
        expect(el('b-stats').textContent).toContain('scope personal · query (all)');
        expect(el('diff-summary').textContent).toContain('1 added');
        expect(el('diff-list').children[0].textContent).toContain(
            '<script>unsafe</script> · A not a candidate',
        );
        expect(el('diff-list').children[1].textContent).toContain('hash not available');
        expect(el('status').textContent).toContain('Comparison complete');
        expect(el('run').disabled).toBe(false);
        expect(el('results').classList.contains('hidden')).toBe(false);
    });

    it('renders the explicit empty-candidate state', async () => {
        await run();
        expect(el('diff-list').children[0].textContent).toBe(
            'No matching candidates in either experiment.',
        );
    });

    it.each([
        ['Server refused', 'Server refused'],
        [undefined, 'Comparison failed.'],
    ])('surfaces server errors (%s)', async (error, message) => {
        fetch.mockResolvedValue({ ok: false, json: async () => ({ error }) });
        await run();
        expect(el('status').textContent).toBe(message);
        expect(el('results').classList.contains('hidden')).toBe(true);
        expect(el('import').disabled).toBe(false);
    });

    it('surfaces network aborts without leaving the form busy', async () => {
        fetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        await run();
        expect(el('status').textContent).toBe('Comparison cancelled.');
        expect(el('run').disabled).toBe(false);
    });

    it('ignores double submits and late success after explicit cancellation', async () => {
        const pending = deferred();
        fetch.mockReturnValue(pending.promise);
        el('form').emit('submit');
        el('form').emit('submit');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(el('run').disabled).toBe(true);
        expect(el('cancel').classList.contains('hidden')).toBe(false);
        const signal = fetch.mock.calls[0][1].signal;
        el('cancel').emit('click');
        expect(signal.aborted).toBe(true);
        pending.resolve({ ok: true, json: async () => result() });
        await flush();
        expect(el('status').textContent).toContain('Comparison cancelled');
        expect(el('results').classList.contains('hidden')).toBe(true);
    });

    it('ignores a stale rejection without changing a newer successful result', async () => {
        const pending = deferred();
        fetch.mockReturnValueOnce(pending.promise);
        el('form').emit('submit');
        el('form').emit('input');
        expect(el('status').textContent).toContain('Parameters changed');
        await run();
        pending.reject(new Error('old request failed'));
        await flush();
        expect(el('status').textContent).toContain('Comparison complete');
        expect(el('results').classList.contains('hidden')).toBe(false);
    });

    it('preserves results within the lab and clears them when navigating away or editing', async () => {
        await run();
        windowTarget.emit('hashchange');
        expect(el('results').classList.contains('hidden')).toBe(false);
        globalThis.location.hash = '#memories';
        windowTarget.emit('hashchange');
        expect(el('a-context').textContent).toBe('');
        expect(el('diff-list').children).toEqual([]);
        await run();
        el('form').emit('input');
        expect(el('status').textContent).toContain('Parameters changed');
        expect(el('results').classList.contains('hidden')).toBe(true);
    });

    it('requires an available result and explicit export dialog confirmation before download', async () => {
        vi.useFakeTimers();
        const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
        const revokeURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        el('export').emit('click');
        el('export-confirm').emit('click');
        expect(createURL).not.toHaveBeenCalled();
        await run();
        el('export').emit('click');
        expect(el('export-consent').open).toBe(true);
        el('export-back').emit('click');
        expect(el('export-consent').open).toBe(false);
        expect(createURL).not.toHaveBeenCalled();
        el('export').emit('click');
        el('export-confirm').emit('click');
        const blob = createURL.mock.calls[0][0];
        expect(blob.type).toBe('application/json');
        expect(JSON.parse(await blob.text())).toEqual(result().scenario);
        const link = created.find((node) => node.tag === 'a');
        expect(link.href).toBe('blob:test');
        expect(link.download).toBe('openself-context-scenario.json');
        expect(link.click).toHaveBeenCalledOnce();
        expect(el('export-consent').open).toBe(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(revokeURL).toHaveBeenCalledWith('blob:test');
    });

    it('ignores empty file selection and rejects oversized or invalid JSON imports', async () => {
        await el('import').emit('change');
        expect(fetch).not.toHaveBeenCalled();
        el('import').files = [{ size: 65537, text: vi.fn() }];
        await el('import').emit('change');
        expect(el('status').textContent).toContain('64 KB');
        expect(el('import').files[0].text).not.toHaveBeenCalled();
        el('import').files = [{ size: 10, text: async () => 'not json' }];
        await el('import').emit('change');
        expect(el('status').textContent).not.toBe('Reading local scenario…');
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['kind', 'version', 'baseline', 'a', 'b', 'results'])(
        'rejects unsupported imports missing %s',
        async (field) => {
            const input = scenario();
            delete input[field];
            await importScenario(input);
            expect(el('status').textContent).toBe('Not a supported OpenSelf Context Lab scenario.');
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it('replays full imported options without overwriting simplified form parameters', async () => {
        const input = scenario();
        el('query').value = 'keep my draft';
        await importScenario(input);
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
            a: input.a,
            b: input.b,
            baseline: input.baseline,
        });
        expect(el('status').textContent).toContain('Replay passed');
        expect(el('query').value).toBe('keep my draft');
        expect(el('import').value).toBe('');
    });

    it.each(['a', 'b'])('rejects mismatching replay hash on side %s', async (side) => {
        const input = scenario();
        input.results[side].contextHash = 'different';
        await importScenario(input);
        expect(el('status').textContent).toContain('Replay mismatch');
        expect(el('results').classList.contains('hidden')).toBe(true);
    });

    it.each(['resolve', 'reject'])('discards a stale file read that later %ss', async (settle) => {
        const pending = deferred();
        el('import').files = [{ size: 100, text: () => pending.promise }];
        const importing = el('import').emit('change');
        el('form').emit('input');
        if (settle === 'resolve') pending.resolve(JSON.stringify(scenario()));
        else pending.reject(new Error('file read failed'));
        await importing;
        expect(el('status').textContent).toContain('Parameters changed');
        expect(fetch).not.toHaveBeenCalled();
    });
});
