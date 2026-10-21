/* global document, window */
import { createServer } from 'node:http';
import { test as base, expect } from '@playwright/test';
import { ContextStore } from '../../src/context/store.js';
import { AccessPolicy } from '../../src/context/access-policy.js';
import { getContextReceiptHtml } from '../../src/context/mcp-app.js';

// This is a synthetic MCP Apps host, NOT a Claude/ChatGPT host interoperability
// claim. It serves the production HTML bundle unchanged and uses real compiler
// results. The iframe deliberately has an opaque origin (no allow-same-origin).
// Protocol: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
const hostHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#f4f5f7}iframe#card{display:block;border:0;width:100%;height:1000px}</style>
</head><body><script>
window.cardMessages = [];
window.sendCard = message => document.querySelector('#card').contentWindow.postMessage(message, '*');
window.addEventListener('message', event => {
  const card = document.querySelector('#card');
  if (!card || event.source !== card.contentWindow) return;
  window.cardMessages.push({ data: event.data, origin: event.origin });
  if (event.data?.method === 'ui/notifications/size-changed') {
    const height = event.data.params?.height;
    if (Number.isFinite(height) && height > 0 && height < 100000) card.style.height = Math.ceil(height) + 'px';
  }
});
</script><iframe id="card" title="OpenSelf context receipt" sandbox="allow-scripts" src="/card"></iframe>
<iframe id="outsider" title="Untrusted sibling" src="/outsider" hidden></iframe></body></html>`;

const test = base.extend({
    cardHost: async ({ page }, use) => {
        const store = new ContextStore({ dbPath: ':memory:', encryptionKey: Buffer.alloc(32, 29) });
        store.remember({
            content: 'Atlas uses SQLite for its local-first context vault.',
            scope: 'project/atlas',
            source: { kind: 'note', title: 'Atlas architecture', locator: 'local://atlas/notes' },
        });
        store.remember({
            content: 'Atlas restricted research sentinel.',
            scope: 'project/atlas',
            sensitivity: 'restricted',
        });
        const policy = new AccessPolicy({
            clientId: 'synthetic-receipt-browser',
            scopes: ['project/atlas'],
            maxSensitivity: 'personal',
            capabilities: ['read'],
        });
        const compile = (overrides = {}) =>
            store.compileContext(
                {
                    query: 'Atlas',
                    scope: 'project/atlas',
                    retrieval: 'lexical',
                    explain: true,
                    ...overrides,
                },
                { policy },
            );
        const requests = [];
        const errors = [];
        const popups = [];
        page.on('request', (request) => requests.push(request.url()));
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('popup', (popup) => popups.push(popup.url()));
        const html = getContextReceiptHtml();
        const server = createServer((request, response) => {
            const body =
                request.url === '/card'
                    ? html
                    : request.url === '/outsider'
                      ? '<!doctype html><title>Untrusted sibling</title>'
                      : request.url === '/'
                        ? hostHtml
                        : '';
            response.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(body);
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const url = `http://127.0.0.1:${server.address().port}`;
        try {
            await page.goto(url);
            await expect
                .poll(() =>
                    page.evaluate(
                        () =>
                            window.cardMessages.filter(
                                ({ data }) => data.method === 'ui/initialize',
                            ).length,
                    ),
                )
                .toBe(1);
            const initialization = await page.evaluate(() =>
                window.cardMessages.find(({ data }) => data.method === 'ui/initialize'),
            );
            expect(initialization.origin).toBe('null');
            expect(initialization.data).toMatchObject({
                jsonrpc: '2.0',
                method: 'ui/initialize',
                params: {
                    protocolVersion: '2026-01-26',
                    appCapabilities: { availableDisplayModes: ['inline'] },
                },
            });
            expect(initialization.data.id).toBeDefined();
            expect(initialization.data.params.appInfo.name).toBeTruthy();
            expect(initialization.data.params.appInfo.version).toBeTruthy();
            const send = (message) => page.evaluate((message) => window.sendCard(message), message);
            const initialize = (overrides = {}) =>
                send({
                    jsonrpc: '2.0',
                    id: initialization.data.id,
                    result: {
                        protocolVersion: '2026-01-26',
                        hostCapabilities: {},
                        hostInfo: { name: 'synthetic-browser-test-host', version: '1.0.0' },
                        hostContext: { theme: 'light', displayMode: 'inline' },
                        ...overrides,
                    },
                });
            const deliver = (pkg) =>
                send({
                    jsonrpc: '2.0',
                    method: 'ui/notifications/tool-result',
                    params: {
                        content: [{ type: 'text', text: JSON.stringify(pkg) }],
                        structuredContent: pkg,
                    },
                });
            const ready = async () => {
                await initialize();
                await expect
                    .poll(() =>
                        page.evaluate(() =>
                            window.cardMessages.some(
                                ({ data }) => data.method === 'ui/notifications/initialized',
                            ),
                        ),
                    )
                    .toBe(true);
            };
            await use({
                frame: page.frameLocator('#card'),
                store,
                compile,
                send,
                initialize,
                deliver,
                ready,
                initialization,
                requests,
                errors,
                popups,
                url,
            });
            // A display-only card must not acquire server-side authority merely
            // because a host advertises it. Assert the entire outgoing protocol.
            const messages = await page.evaluate(() => window.cardMessages.map(({ data }) => data));
            const methods = new Set([
                'ui/initialize',
                'ui/notifications/initialized',
                'ui/notifications/size-changed',
            ]);
            for (const message of messages) {
                expect(message.jsonrpc).toBe('2.0');
                if (message.method) expect(methods.has(message.method)).toBe(true);
                else {
                    expect(['teardown-test', 'ping-before-render', 'ping-after-render']).toContain(
                        message.id,
                    );
                    expect(message.result).toEqual({});
                    expect(message.error).toBeUndefined();
                }
            }
            expect(errors).toEqual([]);
            expect(popups).toEqual([]);
            expect(page.url()).toBe(`${url}/`);
            expect(page.frames().filter((frame) => frame.url() === `${url}/card`)).toHaveLength(1);
            expect(requests.filter((request) => request === `${url}/card`)).toHaveLength(1);
            expect(requests.filter((request) => request === `${url}/`)).toHaveLength(1);
            expect(
                requests.filter(
                    (request) =>
                        ![
                            `${url}/`,
                            `${url}/card`,
                            `${url}/outsider`,
                            `${url}/favicon.ico`,
                        ].includes(request),
                ),
            ).toEqual([]);
            expect(await page.context().cookies()).toEqual([]);
            expect(
                await page.evaluate(() => ({
                    local: window.localStorage.length,
                    session: window.sessionStorage.length,
                })),
            ).toEqual({ local: 0, session: 0 });
        } finally {
            await page.goto('about:blank');
            server.closeAllConnections?.();
            await new Promise((resolve) => server.close(resolve));
            store.close();
        }
    },
});

async function settle(page) {
    // postMessage events run asynchronously; two animation frames provide a
    // deterministic opportunity for ignored-message handlers and painting.
    await page.evaluate(
        () =>
            new Promise((resolve) =>
                window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
            ),
    );
}

test('production card performs the MCP Apps handshake and shows actual compiler context and receipt', async ({
    cardHost,
}) => {
    const { frame, ready, deliver, compile, store } = cardHost;
    const before = store.list();
    const pkg = compile();
    expect(pkg.items).toBe(1);
    expect(JSON.stringify(pkg)).not.toContain('restricted research sentinel');
    await ready();
    await deliver(pkg);
    await expect(frame.locator('#status')).toHaveText('Context package received.');
    await expect(
        frame.getByRole('heading', { name: 'Context receipt', exact: true }),
    ).toBeVisible();
    await expect(frame.locator('.metrics')).toContainText(String(pkg.items));
    await expect(frame.locator('#receipt')).toContainText('project/atlas');
    await expect(frame.locator('#receipt')).toContainText('trust: owner');
    await expect(frame.locator('#receipt')).toContainText('sensitivity: personal');
    await frame.getByText('Compiled context text', { exact: true }).click();
    await expect(frame.locator('pre')).toHaveText(pkg.context);
    await frame.getByText('Selection and skip reasons', { exact: true }).click();
    await expect(frame.locator('#receipt')).toContainText('within-budget');
    await frame.getByText('Hashes and signature presence', { exact: true }).click();
    await expect(frame.locator('#receipt')).toContainText(pkg.contextHash);
    await expect(frame.locator('#receipt')).toContainText(pkg.receipt.receiptHash);
    await expect(frame.locator('#receipt')).toContainText(
        'Signatures are not verified by this card.',
    );
    expect(store.list()).toEqual(before);
});

test('parent lifecycle ping receives an empty response before and after rendering', async ({
    page,
    cardHost,
}) => {
    const { ready, send, deliver, compile, frame } = cardHost;
    await ready();
    const ping = async (id) => {
        await send({ jsonrpc: '2.0', id, method: 'ping', params: {} });
        await expect
            .poll(() =>
                page.evaluate(
                    (id) =>
                        window.cardMessages
                            .filter(({ data }) => data.id === id)
                            .map(({ data }) => data),
                    id,
                ),
            )
            .toEqual([{ jsonrpc: '2.0', id, result: {} }]);
    };
    await ping('ping-before-render');
    await expect(frame.locator('#receipt')).toBeEmpty();
    await deliver(compile());
    await expect(frame.locator('#status')).toHaveText('Context package received.');
    await ping('ping-after-render');
    const outsider = page.frames().find((frame) => frame.url().endsWith('/outsider'));
    await outsider.evaluate(() => {
        window.parent.document
            .querySelector('#card')
            .contentWindow.postMessage(
                { jsonrpc: '2.0', id: 'spoofed-ping', method: 'ping', params: {} },
                '*',
            );
    });
    await settle(page);
    expect(
        await page.evaluate(() =>
            window.cardMessages.some(({ data }) => data.id === 'spoofed-ping'),
        ),
    ).toBe(false);
    await expect(frame.locator('#status')).toHaveText('Context package received.');
});

test('empty compiler result and explain false are explicit rather than fabricated', async ({
    cardHost,
}) => {
    const { frame, store, compile, ready, deliver } = cardHost;
    for (const memory of store.list()) store.forget(memory.id);
    const pkg = compile({ explain: false });
    expect(pkg.items).toBe(0);
    expect(pkg.receipt).toBeUndefined();
    await ready();
    await deliver(pkg);
    await expect(frame.locator('#status')).toHaveText('No context records were selected.');
    await frame.getByText('Compiled context text', { exact: true }).click();
    await expect(frame.locator('pre')).toHaveText(pkg.context || '(Empty context)');
    await frame.getByText('Selection and skip reasons', { exact: true }).click();
    await expect(frame.locator('#receipt')).toContainText(
        'Explanation not supplied (for example, explain: false).',
    );
    await frame.getByText('Hashes and signature presence', { exact: true }).click();
    await expect(frame.locator('#receipt')).toContainText('Receipt hash: not supplied');
});

test('sibling frame cannot spoof initialization or tool result; early genuine result waits for handshake', async ({
    page,
    cardHost,
}) => {
    const { frame, compile, deliver, ready, initialization } = cardHost;
    const outsider = page.frames().find((frame) => frame.url().endsWith('/outsider'));
    expect(outsider).toBeTruthy();
    const evil = { context: 'SPOOFED-CONTEXT', memories: [], items: 0 };
    await outsider.evaluate(
        ({ initId, evil }) => {
            const target = window.parent.document.querySelector('#card').contentWindow;
            target.postMessage(
                {
                    jsonrpc: '2.0',
                    id: initId,
                    result: {
                        protocolVersion: '2026-01-26',
                        hostCapabilities: {},
                        hostInfo: { name: 'forged', version: '1' },
                    },
                },
                '*',
            );
            target.postMessage(
                {
                    jsonrpc: '2.0',
                    method: 'ui/notifications/tool-result',
                    params: { structuredContent: evil },
                },
                '*',
            );
        },
        { initId: initialization.data.id, evil },
    );
    await settle(page);
    await expect(frame.locator('#status')).toHaveText('Connecting to the MCP host…');
    await expect(frame.locator('#receipt')).toBeEmpty();
    const pkg = compile();
    await deliver(pkg);
    await settle(page);
    await expect(frame.locator('#receipt')).toBeEmpty();
    await ready();
    await expect(frame.locator('#status')).toHaveText('Context package received.');
    await frame.getByText('Compiled context text', { exact: true }).click();
    await expect(frame.locator('pre')).toHaveText(pkg.context);
    await expect(frame.locator('body')).not.toContainText('SPOOFED-CONTEXT');
});

test('HTML in context, source title and locator stays inert; broad host capabilities confer no authority', async ({
    page,
    cardHost,
}) => {
    const { frame, store, compile, initialize, deliver, send } = cardHost;
    const attack =
        '<img src="https://example.invalid/exfil" onerror="window.__xss=1"><script>window.__xss=2</script>';
    store.remember({
        content: `Atlas inert context ${attack}`,
        scope: 'project/atlas',
        source: { kind: 'note', title: attack, locator: 'javascript:window.__xss=3' },
    });
    await initialize({
        hostCapabilities: { serverTools: {}, serverResources: {}, openLinks: {}, logging: {} },
    });
    const pkg = compile();
    expect(pkg.context).toContain(attack);
    await deliver(pkg);
    await expect(frame.locator('#status')).toHaveText('Context package received.');
    await frame.getByText('Compiled context text', { exact: true }).click();
    await expect(frame.locator('pre')).toHaveText(pkg.context);
    await expect(
        frame.locator('#receipt img, #receipt script, #receipt a, #receipt iframe, #receipt form'),
    ).toHaveCount(0);
    for (const method of [
        'tools/call',
        'resources/read',
        'ui/message',
        'ui/open-link',
        'ui/update-model-context',
    ]) {
        await send({
            jsonrpc: '2.0',
            id: 'forbidden-request',
            method,
            params: { name: 'openself_remember' },
        });
    }
    await settle(page);
    const child = page.frames().find((frame) => frame.url().endsWith('/card'));
    expect(await child.evaluate(() => window.__xss)).toBeUndefined();
    expect(
        await child.evaluate(() => {
            try {
                window.localStorage.setItem('should-not-store', 'value');
                return false;
            } catch (error) {
                return error.name === 'SecurityError';
            }
        }),
    ).toBe(true);
});

test('malformed, oversized and wrong-version messages cannot render or poison a valid later result', async ({
    page,
    cardHost,
}) => {
    const { frame, initialize, send, ready, deliver, compile } = cardHost;
    await initialize({ protocolVersion: '1900-01-01' });
    await settle(page);
    await expect(frame.locator('#status')).toHaveText('Connecting to the MCP host…');
    await ready();
    for (const message of [
        null,
        [],
        'not JSON-RPC',
        {
            jsonrpc: '1.0',
            method: 'ui/notifications/tool-result',
            params: { structuredContent: compile() },
        },
        {
            jsonrpc: '2.0',
            id: 'not-a-notification',
            method: 'ui/notifications/tool-result',
            params: { structuredContent: compile() },
        },
        {
            jsonrpc: '2.0',
            method: 'ui/notifications/tool-result',
            params: { structuredContent: { context: 'x'.repeat(1048577), memories: [], items: 0 } },
        },
        {
            jsonrpc: '2.0',
            method: 'ui/notifications/tool-result',
            params: {
                structuredContent: {
                    context: '',
                    memories: Array.from({ length: 501 }, () => ({})),
                    items: 501,
                },
            },
        },
    ])
        await send(message);
    await settle(page);
    await expect(frame.locator('#receipt')).toBeEmpty();
    await deliver(compile());
    await expect(frame.locator('#status')).toHaveText('Context package received.');
});

test('invalid context shape fails closed and never falls back to text content', async ({
    page,
    cardHost,
}) => {
    const { frame, ready, send, deliver, compile } = cardHost;
    await ready();
    await send({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: {
            content: [{ type: 'text', text: 'DO NOT RENDER THIS FALLBACK' }],
            structuredContent: { context: '<b>not valid</b>', memories: [], items: 1 },
        },
    });
    await expect(frame.locator('#status')).toContainText('invalid or oversized');
    await expect(frame.locator('#receipt')).toBeEmpty();
    await deliver(compile());
    await settle(page);
    await expect(frame.locator('#receipt')).toBeEmpty();
    await expect(frame.locator('body')).not.toContainText('DO NOT RENDER THIS FALLBACK');
});

test('tool errors do not expose error details or stale context', async ({ cardHost }) => {
    const { frame, ready, send, compile } = cardHost;
    await ready();
    await send({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: {
            isError: true,
            structuredContent: compile(),
            content: [{ type: 'text', text: 'PRIVATE ERROR SENTINEL' }],
        },
    });
    await expect(frame.locator('#status')).toHaveText(
        'The context tool returned an error. No receipt is available.',
    );
    await expect(frame.locator('#receipt')).toBeEmpty();
    await expect(frame.locator('body')).not.toContainText('PRIVATE ERROR SENTINEL');
});

test('cancellation discards a buffered result and late success cannot resurrect it', async ({
    page,
    cardHost,
}) => {
    const { frame, deliver, compile, send, initialize } = cardHost;
    await deliver(compile());
    await send({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-cancelled',
        params: { reason: 'User cancelled' },
    });
    await expect(frame.locator('#status')).toHaveText(
        'Context compilation was cancelled. No receipt is available.',
    );
    await initialize();
    await deliver(compile());
    await settle(page);
    await expect(frame.locator('#receipt')).toBeEmpty();
    await expect(frame.locator('#status')).toContainText('cancelled');
});

test('teardown acknowledges once, clears rendered context and detaches the transport', async ({
    page,
    cardHost,
}) => {
    const { frame, ready, deliver, compile, send } = cardHost;
    await ready();
    await deliver(compile());
    await expect(frame.locator('#status')).toHaveText('Context package received.');
    const teardown = {
        jsonrpc: '2.0',
        id: 'teardown-test',
        method: 'ui/resource-teardown',
        params: { reason: 'Host closing' },
    };
    await send(teardown);
    await expect(frame.locator('#status')).toHaveText('Context card closed.');
    await expect
        .poll(() =>
            page.evaluate(
                () => window.cardMessages.filter(({ data }) => data.id === 'teardown-test').length,
            ),
        )
        .toBe(1);
    await deliver(compile());
    await send(teardown);
    await settle(page);
    await expect(frame.locator('#receipt')).toBeEmpty();
    expect(
        await page.evaluate(
            () => window.cardMessages.filter(({ data }) => data.id === 'teardown-test').length,
        ),
    ).toBe(1);
});

test('mobile opaque iframe has no horizontal overflow and captures the real rendered card', async ({
    page,
    cardHost,
}, testInfo) => {
    const { frame, ready, deliver, compile, send } = cardHost;
    await page.setViewportSize({ width: 390, height: 844 });
    await ready();
    await deliver(compile());
    await expect(frame.locator('#status')).toHaveText('Context package received.');
    await send({
        jsonrpc: '2.0',
        method: 'ui/notifications/host-context-changed',
        params: { theme: 'dark' },
    });
    await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark');
    await frame.getByText('Compiled context text', { exact: true }).click();
    await frame.getByText('Selection and skip reasons', { exact: true }).click();
    await frame.getByText('Hashes and signature presence', { exact: true }).click();
    const child = page.frames().find((frame) => frame.url().endsWith('/card'));
    expect(
        await child.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const contentHeight = await child.evaluate(() => Math.ceil(document.body.scrollHeight));
    await expect
        .poll(async () => (await page.locator('#card').boundingBox()).height)
        .toBeGreaterThanOrEqual(contentHeight);
    await child.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await testInfo.attach('synthetic-host-mobile-receipt', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    });
});
