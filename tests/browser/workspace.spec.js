/* global document, window */
import { test as base, expect } from '@playwright/test';
import { ContextStore } from '../../src/context/store.js';
import { createContextServer } from '../../src/context/server.js';

// Real local server and an isolated, synthetic, in-memory vault. No live agent.
const test = base.extend({
    rehearsal: async ({ page }, use) => {
        const store = new ContextStore({ dbPath: ':memory:', encryptionKey: Buffer.alloc(32, 8) });
        const context = createContextServer({
            store,
            token: 'synthetic-workspace-browser',
            appMode: true,
            codexBridge: { getStatus: () => ({ status: 'disabled' }), close() {} },
        });
        const server = await new Promise((resolve) => {
            const listener = context.app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        try {
            store.remember({
                content: 'Atlas synthetic project uses SQLite.',
                scope: 'project/atlas',
            });
            store.remember({
                content: 'Atlas restricted sentinel',
                sensitivity: 'restricted',
                scope: 'project/atlas',
            });
            await page.goto(
                `http://127.0.0.1:${server.address().port}/auth?token=synthetic-workspace-browser`,
            );
            await page.locator('[data-view="view-rehearsal"]').click();
            await expect(page.locator('#view-rehearsal')).toBeVisible();
            await page.locator('#workspace-task').fill('Atlas');
            await page.locator('#workspace-scope').fill('project/atlas');
            await use({ store });
        } finally {
            await page.goto('about:blank');
            server.closeAllConnections?.();
            await new Promise((resolve) => server.close(resolve));
            context.close();
            store.close();
        }
    },
});
const previewEndpoint = '**/api/context/workspace/preview';
const startEndpoint = '**/api/context/workspace/start';
async function preview(page) {
    const waiting = page.waitForResponse(previewEndpoint);
    await page.locator('#workspace-preview').click();
    const response = await waiting;
    expect(response.status()).toBe(200);
    await expect(page.locator('#workspace-package')).toBeVisible();
    return response.json();
}
async function start(page) {
    await preview(page);
    await page.locator('#workspace-start').click();
    const waiting = page.waitForResponse(startEndpoint);
    await page.locator('#workspace-consent-confirm').click();
    const response = await waiting;
    expect(response.status()).toBe(200);
    return (await response.json()).run;
}
async function settleRendering(page) {
    await page.evaluate(
        () =>
            new Promise((resolve) =>
                window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
            ),
    );
}

test('preview displays exact compiler context and receipt, with no restricted material or writes', async ({
    page,
    rehearsal,
}) => {
    const before = rehearsal.store.list();
    const result = await preview(page);
    await expect(page.locator('#workspace-context')).toHaveText(result.context.context);
    await expect(page.locator('#workspace-context')).toContainText(
        'Atlas synthetic project uses SQLite.',
    );
    await expect(page.locator('#workspace-context')).not.toContainText('restricted sentinel');
    await expect(page.locator('#workspace-receipt')).toContainText(result.contextHash);
    expect(rehearsal.store.list()).toEqual(before);
});

test('Not now and Escape close consent without starting a simulation', async ({
    page,
    rehearsal,
}) => {
    void rehearsal;
    let starts = 0;
    page.on('request', (request) => {
        if (request.url().endsWith('/workspace/start')) starts++;
    });
    await preview(page);
    await page.locator('#workspace-start').click();
    await expect(page.locator('#workspace-consent')).toContainText('simulation');
    await page.locator('#workspace-consent-back').click();
    await expect(page.locator('#workspace-consent')).toBeHidden();
    await page.locator('#workspace-start').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#workspace-consent')).toBeHidden();
    expect(starts).toBe(0);
    await expect(page.locator('#workspace-run')).toBeHidden();
});

test('confirmed simulation streams mock events and approval never writes a real proposal or memory', async ({
    page,
    rehearsal,
}) => {
    const before = rehearsal.store.list();
    const proposals = rehearsal.store.listProposals({ status: null });
    const outputs = [];
    page.on('response', async (response) => {
        if (/\/workspace\/runs\/[^/]+$/.test(response.url())) {
            const data = await response.json().catch(() => null);
            if (data?.run) outputs.push(data.run);
        }
    });
    await start(page);
    await expect(page.locator('#workspace-run-state')).toContainText('Simulation completed');
    await expect(page.locator('#workspace-output')).toContainText('no model ran');
    await expect(page.locator('#workspace-proposal-state')).toContainText('pending');
    expect(outputs.some((run) => run.state === 'running')).toBe(true);
    expect(outputs.some((run) => run.output.length > 0)).toBe(true);
    await page.locator('#workspace-proposal-approve').click();
    await expect(page.locator('#workspace-proposal-state')).toContainText(
        'approved. Not saved to vault.',
    );
    expect(rehearsal.store.list()).toEqual(before);
    expect(rehearsal.store.listProposals({ status: null })).toEqual(proposals);
});

test('cancellation is terminal even when a previously fetched running poll arrives late', async ({
    page,
    rehearsal,
}) => {
    void rehearsal;
    let release, ready;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const intercepted = new Promise((resolve) => {
        ready = resolve;
    });
    let held = false;
    await page.route(/\/api\/context\/workspace\/runs\/[^/]+$/, async (route) => {
        const response = await route.fetch();
        if (!held) {
            held = true;
            ready();
            await gate;
        }
        await route.fulfill({ response });
    });
    await start(page);
    await intercepted;
    await page.locator('#workspace-cancel').click();
    await expect(page.locator('#workspace-run-state')).toContainText('Simulation cancelled');
    const latePoll = page.waitForResponse(/\/api\/context\/workspace\/runs\/[^/]+$/);
    release();
    await (await latePoll).finished();
    await settleRendering(page);
    await expect(page.locator('#workspace-run-state')).toContainText('Simulation cancelled');
    await expect(page.locator('#workspace-cancel')).toBeHidden();
});

for (const action of ['edit', 'navigate']) {
    for (const phase of ['preview', 'start']) {
        test(`late ${phase} response cannot restore private UI after ${action}`, async ({
            page,
            rehearsal,
        }) => {
            void rehearsal;
            const endpoint = phase === 'preview' ? previewEndpoint : startEndpoint;
            let release, ready;
            const gate = new Promise((resolve) => {
                release = resolve;
            });
            const intercepted = new Promise((resolve) => {
                ready = resolve;
            });
            await page.route(endpoint, async (route) => {
                const response = await route.fetch();
                ready();
                await gate;
                await route.fulfill({ response });
            });
            if (phase === 'preview') await page.locator('#workspace-preview').click();
            else {
                await preview(page);
                await page.locator('#workspace-start').click();
                await page.locator('#workspace-consent-confirm').click();
            }
            await intercepted;
            if (action === 'edit') await page.locator('#workspace-task').fill('New task');
            else await page.locator('[data-view="view-home"]').click();
            const waiting = page.waitForResponse(endpoint);
            release();
            await (await waiting).finished();
            await settleRendering(page);
            if (action === 'navigate') await page.locator('[data-view="view-rehearsal"]').click();
            await expect(page.locator('#workspace-package')).toBeHidden();
            await expect(page.locator('#workspace-run')).toBeHidden();
            await expect(page.locator('#workspace-context')).toHaveText('');
            await expect(page.locator('#workspace-preview')).toBeEnabled();
        });
    }
}

test('mobile preview, consent, and completed simulation do not overflow horizontally', async ({
    page,
    rehearsal,
}, testInfo) => {
    void rehearsal;
    await page.setViewportSize({ width: 390, height: 844 });
    await preview(page);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.locator('#workspace-start').click();
    expect(
        await page
            .locator('#workspace-consent')
            .evaluate((node) => node.getBoundingClientRect().right <= window.innerWidth),
    ).toBe(true);
    await page.locator('#workspace-consent-confirm').click();
    await expect(page.locator('#workspace-run-state')).toContainText('Simulation completed');
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('workspace-mobile.png'), fullPage: true });
});
