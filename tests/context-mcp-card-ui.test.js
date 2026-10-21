/* global window, document */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextStore } from '../src/context/store.js';

class Element {
    children = [];
    dataset = {};
    textContent = '';
    scrollHeight = 600;
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    replaceChildren(...children) {
        this.children = children;
    }
    get text() {
        return this.textContent + this.children.map((child) => child.text).join('\n');
    }
}
let elements, listeners, sent, observer;
const status = () => elements.status.textContent;
const rendered = () => elements.receipt.text;
const notify = (method, params, extra = {}) =>
    send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }), ...extra });
const send = (data, source = window.parent) => listeners.get('message')?.({ data, source });
const init = (result = {}) =>
    send({
        jsonrpc: '2.0',
        id: 'openself-receipt-init',
        result: {
            protocolVersion: '2026-01-26',
            hostCapabilities: {},
            hostInfo: { name: 'Test host', version: '1' },
            ...result,
        },
    });
const record = (extra = {}) => ({
    id: 'm1',
    scope: 'work/demo',
    sourceTrust: 'owner',
    sensitivity: 'private',
    temporalStatus: 'current',
    ...extra,
});
const pkg = (extra = {}) => ({
    context: 'hello',
    items: 1,
    memories: [record()],
    contextHash: 'hash',
    ...extra,
});
const result = (data = pkg()) =>
    notify('ui/notifications/tool-result', { structuredContent: data });
beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    elements = { status: new Element(), receipt: new Element() };
    listeners = new Map();
    sent = [];
    vi.stubGlobal('document', {
        getElementById: (id) => elements[id],
        createElement: () => new Element(),
        documentElement: new Element(),
        body: new Element(),
    });
    vi.stubGlobal('window', {
        innerWidth: 800,
        parent: {
            postMessage: vi.fn((message, origin) => {
                if (message.method === 'ui/initialize') expect(listeners.has('message')).toBe(true);
                expect(origin).toBe('*');
                sent.push(message);
            }),
        },
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: (type) => listeners.delete(type),
    });
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(callback) {
                this.callback = callback;
                observer = this;
            }
            observe = vi.fn();
            disconnect = vi.fn();
        },
    );
    await import('../src/context/mcp-app/card.js');
});
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Read-only MCP context receipt card', () => {
    it('registers first, sends official initialize, and waits for valid response', () => {
        expect(sent).toEqual([
            {
                jsonrpc: '2.0',
                id: 'openself-receipt-init',
                method: 'ui/initialize',
                params: {
                    appInfo: { name: 'OpenSelf context receipt', version: '1.0.0' },
                    appCapabilities: { availableDisplayModes: ['inline'] },
                    protocolVersion: '2026-01-26',
                },
            },
        ]);
        init();
        expect(sent[1]).toEqual({ jsonrpc: '2.0', method: 'ui/notifications/initialized' });
        expect(status()).toContain('Waiting');
        expect(observer.observe).toHaveBeenCalledWith(document.body);
    });
    it('ignores spoofed sources, malformed JSON-RPC, mismatched ids and versions', () => {
        send({ jsonrpc: '2.0', id: 'openself-receipt-init', result: {} }, {});
        for (const data of [
            null,
            [],
            'bad',
            { jsonrpc: '1.0' },
            { jsonrpc: '2.0', id: 123, result: {} },
            { jsonrpc: '2.0', id: 'openself-receipt-init', result: {}, error: {} },
        ])
            send(data);
        for (const change of [
            { protocolVersion: 'old' },
            { hostCapabilities: [] },
            { hostInfo: {} },
            { hostContext: [] },
            { hostInfo: { name: 'a'.repeat(257), version: '1' } },
        ])
            init(change);
        expect(sent).toHaveLength(1);
        vi.advanceTimersByTime(10000);
        expect(status()).toContain('did not initialize');
        init();
        expect(sent).toHaveLength(1);
    });
    it('buffers just the first early result, rendering only after initialization', () => {
        result(pkg({ context: 'first' }));
        result(pkg({ context: 'second' }));
        expect(rendered()).toBe('');
        init();
        expect(rendered()).toContain('first');
        expect(rendered()).not.toContain('second');
        result(pkg({ context: 'late' }));
        expect(rendered()).not.toContain('late');
    });
    it('renders exact metrics, safe metadata and filtered explanations without denied data', () => {
        init();
        result(
            pkg({
                usedChars: 999,
                usedTokens: 999,
                receipt: {
                    budget: { maxChars: 1000, maxTokens: 100 },
                    contextHash: 'other',
                    receiptHash: 'receipt-hash',
                    signature: 'sig',
                    receiptSignature: 'receipt-sig',
                    filters: { deniedScopes: ['secret-deny'] },
                    totals: { denied: 99999 },
                    candidates: [
                        { ...record(), decision: 'selected', reason: 'within-budget' },
                        {
                            ...record({ scope: 'work/later' }),
                            decision: 'skipped',
                            reason: 'over-budget',
                        },
                        { decision: 'denied', scope: 'secret-deny', reason: 'never-render' },
                    ],
                },
            }),
        );
        for (const text of [
            '1',
            '5 / 400',
            '2',
            'not tokenizer output or billing',
            'work/demo',
            'trust: owner',
            'sensitivity: private',
            'temporal: current',
            'within-budget',
            'over-budget',
            'Policy-filtered',
            'Context hash: hash',
            'receipt-hash',
            'signature: present',
            'not verified',
        ])
            expect(rendered()).toContain(text);
        for (const text of ['secret-deny', 'never-render', '99999', '999', 'receipt-sig'])
            expect(rendered()).not.toContain(text);
    });
    it('uses text nodes for hostile strings and does not create links or markup', () => {
        const hostile = '<img src=x onerror=alert(1)><script>evil()</script> https://bad.test';
        const tags = [];
        document.createElement = (tag) => {
            tags.push(tag);
            const node = new Element();
            Object.defineProperty(node, 'innerHTML', {
                set() {
                    throw Error('Unsafe HTML');
                },
            });
            return node;
        };
        init();
        result(
            pkg({
                context: hostile,
                memories: [record({ scope: hostile })],
                receipt: { candidates: [{ ...record(), decision: 'selected', reason: hostile }] },
            }),
        );
        expect(rendered()).toContain(hostile);
        expect(tags).not.toContain('a');
        expect(tags).not.toContain('script');
        expect(tags).not.toContain('img');
        expect(
            sent.every((message) =>
                ['ui/initialize', 'ui/notifications/initialized'].includes(message.method),
            ),
        ).toBe(true);
    });
    it('explains a valid empty package and absent explanations without fabricating limits', () => {
        init();
        result({ context: '', items: 0, memories: [] });
        expect(status()).toContain('No context records');
        for (const text of [
            '0 / not supplied',
            'No selected records',
            '(Empty context)',
            'explain: false',
            'Context hash: not supplied',
            'signature: not supplied',
        ])
            expect(rendered()).toContain(text);
    });
    it('handles omitted metadata, receipt explanation and invalid optional budget honestly', () => {
        init();
        result(
            pkg({
                memories: [{}],
                contextHash: '',
                receipt: {
                    contextHash: 'receipt-context',
                    budget: { maxChars: -1, maxTokens: 'bad' },
                },
            }),
        );
        for (const text of [
            'Scope not supplied',
            'trust: not supplied',
            'sensitivity: not supplied',
            'temporal: not supplied',
            'No selected or skipped explanations',
            'Context hash: receipt-context',
            '5 / not supplied',
        ])
            expect(rendered()).toContain(text);
    });
    it('renders reasons without scope or reason and maxChars-only budgets', () => {
        init();
        result(
            pkg({ receipt: { budget: { maxChars: 200 }, candidates: [{ decision: 'skipped' }] } }),
        );
        expect(rendered()).toContain('5 / 200');
        expect(rendered()).toContain('scope not supplied · reason not supplied');
    });
    it.each([
        null,
        {},
        pkg({ context: 12 }),
        pkg({ memories: {} }),
        pkg({ memories: [record({ scope: 4 })] }),
        pkg({ items: 2 }),
        pkg({ contextHash: 2 }),
        pkg({ receipt: [] }),
        pkg({ receipt: { candidates: {} } }),
        pkg({ receipt: { candidates: [null] } }),
        pkg({ receipt: { candidates: [{ decision: 'other' }] } }),
        pkg({ receipt: { candidates: [{ decision: 'selected', reason: 2 }] } }),
        pkg({ receipt: { budget: [] } }),
        pkg({ receipt: { signature: 4 } }),
    ])('rejects invalid package %# with no partial rendering', (data) => {
        init();
        result(data);
        expect(status()).toContain('invalid or oversized');
        expect(rendered()).toBe('');
    });
    it('renders a real near-max-budget compiler result including duplicated MCP text', () => {
        const store = new ContextStore({ dbPath: ':memory:' });
        try {
            for (let index = 0; index < 10; index++)
                store.remember({
                    content: String.fromCharCode(65 + index).repeat(19000),
                    scope: `personal/record${index}`,
                });
            const data = JSON.parse(
                JSON.stringify(
                    store.compileContext({ maxChars: 200000, limit: 500, explain: true }),
                ),
            );
            const params = {
                content: [{ type: 'text', text: JSON.stringify(data) }],
                structuredContent: data,
            };
            expect(data.context.length).toBeGreaterThan(190000);
            expect(data.context.length).toBeLessThanOrEqual(200000);
            expect(params.content[0].text.length).toBeGreaterThan(200000);
            expect(Buffer.byteLength(JSON.stringify(params))).toBeLessThan(1048576);
            init();
            notify('ui/notifications/tool-result', params);
            expect(status()).toBe('Context package received.');
            expect(rendered()).toContain(data.context);
        } finally {
            store.close();
        }
    });
    it('rejects context over its field limit even within the envelope size limit', () => {
        init();
        result(pkg({ context: 'x'.repeat(200001) }));
        expect(status()).toContain('invalid or oversized');
        expect(rendered()).toBe('');
    });
    it('rejects oversized aggregate strings and object keys before serialization', () => {
        init();
        const serialize = vi.spyOn(JSON, 'stringify');
        result({ huge: Array(10).fill('x'.repeat(150000)) });
        result({ sparse: new Array(100000000) });
        result({ nestedSparse: Array.from({ length: 500 }, () => new Array(500)) });
        result({ ['k'.repeat(1048577)]: true });
        expect(serialize).not.toHaveBeenCalled();
        serialize.mockRestore();
        expect(status()).toContain('Waiting');
        result();
        expect(rendered()).toContain('hello');
    });
    it('bounds messages, arrays, strings, depth, bytes, cycles and node counts', () => {
        init();
        let deep = {};
        for (let i = 0; i < 22; i++) deep = { child: deep };
        const cycle = {};
        cycle.self = cycle;
        const many = Array.from({ length: 500 }, () => Array(100).fill(null));
        for (const data of [
            pkg({ context: 'x'.repeat(1048577) }),
            pkg({ memories: Array(501).fill({}) }),
            { deep },
            { cycle },
            { many },
            { huge: Array(8).fill('😀'.repeat(50000)) },
            { nonfinite: Infinity },
            { bad: undefined },
            { bad: 1n },
            { bad: () => {} },
        ])
            result(data);
        expect(rendered()).toBe('');
        expect(status()).toContain('Waiting');
        result();
        expect(rendered()).toContain('hello');
    });
    it('rejects malformed notification shape and request impersonation', () => {
        init();
        for (const extra of [{ id: 1 }, { result: {} }, { error: {} }])
            notify('ui/notifications/tool-result', { structuredContent: pkg() }, extra);
        notify('ui/notifications/tool-result', []);
        notify('ui/notifications/tool-result', { isError: 'yes', structuredContent: pkg() });
        notify('ui/notifications/tool-result');
        notify(123, {});
        notify('tools/call', {});
        expect(rendered()).toBe('');
        result();
        expect(rendered()).toContain('hello');
    });
    it('handles host initialization errors without displaying arbitrary host error text', () => {
        send({
            jsonrpc: '2.0',
            id: 'openself-receipt-init',
            error: { code: -32000, message: 'secret host error' },
        });
        expect(status()).toContain('could not initialize');
        expect(status()).not.toContain('secret');
    });
    it('handles tool errors, clearing buffered results and preventing late replacements', () => {
        init();
        notify('ui/notifications/tool-result', {
            isError: true,
            content: [{ type: 'text', text: 'secret error' }],
        });
        expect(status()).toContain('tool returned an error');
        result();
        expect(rendered()).toBe('');
    });
    it('times out missing results and ignores later data', () => {
        init();
        vi.advanceTimersByTime(60000);
        expect(status()).toContain('No context result');
        result();
        expect(rendered()).toBe('');
    });
    it('handles cancellation before initialization and clears the buffered result', () => {
        result(pkg({ context: 'buffered' }));
        notify('ui/notifications/tool-cancelled', { reason: 'User cancelled' });
        expect(status()).toContain('cancelled');
        init();
        expect(rendered()).toBe('');
    });
    it('handles ready cancellation, ignores malformed reasons, and does not echo reasons', () => {
        init();
        notify('ui/notifications/tool-cancelled', { reason: 42 });
        expect(status()).toContain('Waiting');
        notify('ui/notifications/tool-cancelled', { reason: 'private reason' });
        expect(status()).toContain('cancelled');
        expect(status()).not.toContain('private');
    });
    it('ignores cancellation after the final result', () => {
        init();
        result();
        notify('ui/notifications/tool-cancelled');
        expect(rendered()).toContain('hello');
    });
    it('accepts only light/dark themes and never injects host styles', () => {
        init({ hostContext: { theme: 'dark', styles: { css: { fonts: 'malicious' } } } });
        expect(document.documentElement.dataset.theme).toBe('dark');
        notify('ui/notifications/host-context-changed', { theme: 'javascript:evil' });
        expect(document.documentElement.dataset.theme).toBe('dark');
        notify('ui/notifications/host-context-changed', { theme: 'light' });
        expect(document.documentElement.dataset.theme).toBe('light');
    });
    it('throttles, deduplicates, clamps and caps size notifications', () => {
        init();
        observer.callback();
        vi.advanceTimersByTime(100);
        observer.callback();
        vi.advanceTimersByTime(100);
        expect(sent.filter((m) => m.method.endsWith('size-changed'))).toHaveLength(1);
        window.innerWidth = 90000;
        document.body.scrollHeight = 90000;
        observer.callback();
        vi.advanceTimersByTime(100);
        expect(sent.at(-1).params).toEqual({ width: 4096, height: 10000 });
        window.innerWidth = 0;
        document.body.scrollHeight = 0;
        observer.callback();
        vi.advanceTimersByTime(100);
        expect(sent.at(-1).params).toEqual({ width: 1, height: 1 });
        for (let i = 1; i < 130; i++) {
            window.innerWidth = i;
            observer.callback();
            vi.advanceTimersByTime(100);
        }
        expect(sent.filter((m) => m.method.endsWith('size-changed'))).toHaveLength(100);
    });
    it('replies only to validated parent pings after initialization, including after rendering', () => {
        notify('ping', {}, { id: 'early' });
        expect(sent).toHaveLength(1);
        init();
        send({ jsonrpc: '2.0', method: 'ping', id: 'spoof' }, {});
        notify('ping', {}, { id: null });
        notify('ping', {});
        notify('ping', { invalid: true }, { id: 3 });
        expect(sent).toHaveLength(2);
        notify('ping', {}, { id: 'waiting' });
        expect(sent.at(-1)).toEqual({ jsonrpc: '2.0', id: 'waiting', result: {} });
        result();
        notify('ping', undefined, { id: 42 });
        expect(sent.at(-1)).toEqual({ jsonrpc: '2.0', id: 42, result: {} });
        expect(rendered()).toContain('hello');
    });
    it('acknowledges teardown once, clears data, listeners, timers and resize observation', () => {
        init();
        result();
        notify('ui/resource-teardown', { reason: 'closing' }, { id: 77 });
        expect(status()).toBe('Context card closed.');
        expect(rendered()).toBe('');
        expect(sent.at(-1)).toEqual({ jsonrpc: '2.0', id: 77, result: {} });
        expect(observer.disconnect).toHaveBeenCalledOnce();
        expect(listeners.size).toBe(0);
        vi.advanceTimersByTime(100000);
        expect(sent.at(-1).id).toBe(77);
    });
    it('accepts early teardown and pagehide without sending new work', () => {
        notify('ui/resource-teardown', undefined, { id: 'close' });
        expect(sent.at(-1).result).toEqual({});
        expect(listeners.size).toBe(0);
    });
    it('cleans up on pagehide and does not reply to malformed teardown requests', () => {
        init();
        notify('ui/resource-teardown', { reason: false }, { id: 3 });
        notify('ui/resource-teardown', {}, { id: null });
        expect(listeners.has('message')).toBe(true);
        listeners.get('pagehide')();
        expect(observer.disconnect).toHaveBeenCalled();
        expect(listeners.size).toBe(0);
        expect(
            sent.every((m) =>
                [
                    'ui/initialize',
                    'ui/notifications/initialized',
                    'ui/notifications/size-changed',
                ].includes(m.method),
            ),
        ).toBe(true);
    });
    it('works when ResizeObserver is unavailable', () => {
        vi.stubGlobal('ResizeObserver', undefined);
        init();
        result();
        vi.advanceTimersByTime(100);
        expect(sent.at(-1).method).toBe('ui/notifications/size-changed');
    });
});
