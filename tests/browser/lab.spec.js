/* global document, window */
import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import { ContextStore } from '../../src/context/store.js';
import { createContextServer } from '../../src/context/server.js';

const endpoint = '**/api/context/lab/compare';
const test = base.extend({
    lab: async ({ page }, use) => {
        const store = new ContextStore({ dbPath: ':memory:', encryptionKey: Buffer.alloc(32, 7) });
        const context = createContextServer({
            store,
            token: 'synthetic-lab-browser',
            appMode: true,
            codexBridge: {
                getStatus: () => ({ status: 'disabled' }),
                close() {},
            },
        });
        const server = await new Promise((resolve) => {
            const listener = context.app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        try {
            await page.goto(
                `http://127.0.0.1:${server.address().port}/auth?token=synthetic-lab-browser`,
            );
            await page.locator('[data-view="view-lab"]').click();
            await expect(page.locator('#view-lab')).toBeVisible();
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

async function compare(page) {
    const response = page.waitForResponse(endpoint);
    await page.locator('#lab-run').click();
    const result = await response;
    expect(result.status()).toBe(200);
    await expect(page.locator('#lab-results')).toBeVisible();
    return result.json();
}

async function exportScenario(page) {
    await page.locator('#lab-export').click();
    const consent = page.locator('#lab-export-consent');
    await expect(consent).toBeVisible();
    await expect(consent).toContainText(/query.*scope.*IDs.*hashes/s);
    await expect(consent).toContainText(/metadata can still be private/i);
    const download = page.waitForEvent('download');
    await page.locator('#lab-export-confirm').click();
    const file = await download;
    return readFile(await file.path(), 'utf8');
}

function seed(store) {
    return [
        store.remember({
            content: `Atlas release preparation: ${'Review synthetic launch notes. '.repeat(26)}`,
            scope: 'project/atlas',
        }),
        store.remember({
            content: 'Personal synthetic weekend plan: visit the garden.',
            scope: 'personal',
        }),
    ];
}

test('real scoped and budget comparisons display deterministic compiler output without mutating the vault', async ({
    page,
    lab,
}) => {
    const [atlas, personal] = seed(lab.store);
    const before = lab.store.list();
    await page.locator('#lab-a-scope').fill('project/atlas');
    await page.locator('#lab-b-scope').fill('personal');
    const scoped = await compare(page);
    await expect(page.locator('#lab-a-context')).toContainText(atlas.content);
    await expect(page.locator('#lab-b-context')).toContainText(personal.content);
    await expect(page.locator('#lab-a-context')).not.toContainText(personal.content);
    expect(scoped.diff.added.map((entry) => entry.id)).toContain(personal.id);
    expect(scoped.diff.removed.map((entry) => entry.id)).toContain(atlas.id);
    await page.locator('#lab-b-scope').fill('project/atlas');
    await page.locator('#lab-b-chars').fill('500');
    const budget = await compare(page);
    expect(budget.a.items).toBeGreaterThan(budget.b.items);
    expect(budget.b.usedChars).toBeLessThanOrEqual(500);
    expect(budget.diff.removed.map((entry) => entry.id)).toContain(atlas.id);
    expect(lab.store.list()).toEqual(before);
});

test('empty vault and unmatched scope produce honest empty results', async ({ page, lab }) => {
    const empty = await compare(page);
    expect(empty.a.items).toBe(0);
    expect(empty.b.items).toBe(0);
    await expect(page.locator('#lab-a-context')).toHaveText('(no matching context)');
    await expect(page.locator('#lab-diff-list')).toContainText('No matching candidates');
    seed(lab.store);
    await page.locator('#lab-a-scope').fill('missing/scope');
    await page.locator('#lab-b-scope').fill('missing/scope');
    const missing = await compare(page);
    expect(missing.a.items).toBe(0);
    expect(missing.b.items).toBe(0);
    await expect(page.locator('#lab-a-context')).not.toContainText('Atlas release');
});

test('export warns about private metadata and replay rejects a changed vault baseline', async ({
    page,
    lab,
}) => {
    const memories = seed(lab.store);
    await page.locator('#lab-a-scope').fill('project/atlas');
    const original = await compare(page);
    const text = await exportScenario(page);
    const scenario = JSON.parse(text);
    expect(scenario.kind).toBe('openself-context-lab');
    expect(scenario.baseline).toEqual(original.baseline);
    for (const memory of memories) expect(text).not.toContain(memory.content);
    expect(scenario.results.a.contextHash).toBe(original.a.contextHash);
    const replayFile = {
        name: 'synthetic-scenario.json',
        mimeType: 'application/json',
        buffer: Buffer.from(text),
    };
    // Replay uses the saved request, not the current simplified form.
    await page.locator('#lab-a-scope').fill('personal');
    const replayResponse = page.waitForResponse(endpoint);
    await page.locator('#lab-import').setInputFiles(replayFile);
    const replay = await replayResponse;
    expect(replay.status()).toBe(200);
    expect((await replay.json()).a.contextHash).toBe(original.a.contextHash);
    await expect(page.locator('#lab-status')).toContainText('Replay passed');
    await expect(page.locator('#lab-a-scope')).toHaveValue('personal');
    await expect(page.locator('#lab-a-context')).toContainText(memories[0].content);
    lab.store.remember({ content: 'Synthetic change invalidates the old baseline.' });
    await page.locator('#lab-import').setInputFiles([]);
    const staleResponse = page.waitForResponse(endpoint);
    await page.locator('#lab-import').setInputFiles(replayFile);
    const stale = await staleResponse;
    expect(stale.status()).toBe(409);
    await expect(page.locator('#lab-status')).toContainText(/changed/i);
    await expect(page.locator('#lab-results')).toBeHidden();
});

test('Back, Forward and reload restore the lab without persisting private form data', async ({
    page,
    lab,
}) => {
    seed(lab.store);
    await page.locator('#lab-query').fill('private synthetic search');
    await page.goBack();
    await expect(page.locator('#view-home')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#view-lab')).toBeVisible();
    await page.reload();
    await expect(page.locator('#view-lab')).toBeVisible();
    await expect(page.locator('#lab-query')).toHaveValue('');
    await expect(page.locator('#lab-results')).toBeHidden();
});

test('mobile lab and comparison results have no horizontal overflow', async ({
    page,
    lab,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    seed(lab.store);
    await compare(page);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    // Reset scroll before full-page capture so sticky navigation stays at the page top.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('context-lab-mobile.png'), fullPage: true });
});

for (const action of ['cancel', 'navigate', 'edit']) {
    test(`late comparison response cannot replace the ${action} state`, async ({ page, lab }) => {
        seed(lab.store);
        // Keep the response alive despite AbortController to exercise the generation
        // guard as well as ordinary transport cancellation. The payload is produced
        // by the real local compiler, not a fabricated successful comparison.
        await page.evaluate(() => {
            const originalFetch = window.fetch;
            window.fetch = (url, options) =>
                originalFetch(
                    url,
                    String(url).includes('/lab/compare')
                        ? { ...options, signal: undefined }
                        : options,
                );
        });
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        let ready;
        const intercepted = new Promise((resolve) => {
            ready = resolve;
        });
        await page.route(endpoint, async (route) => {
            const response = await route.fetch();
            ready();
            await gate;
            await route.fulfill({ response });
        });
        await page.locator('#lab-run').click();
        await intercepted;
        await expect(page.locator('#lab-cancel')).toBeVisible();
        if (action === 'cancel') await page.locator('#lab-cancel').click();
        if (action === 'navigate') await page.locator('[data-view="view-home"]').click();
        if (action === 'edit') await page.locator('#lab-query').fill('Changed while pending');
        const response = page.waitForResponse(endpoint);
        release();
        await (await response).finished();
        // Rendering callbacks run before the next animation frame.
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
                ),
        );
        if (action === 'navigate') await page.locator('[data-view="view-lab"]').click();
        await expect(page.locator('#lab-results')).toBeHidden();
        await expect(page.locator('#lab-status')).toContainText(
            action === 'edit' ? /Parameters changed/ : /cancelled/i,
        );
        await expect(page.locator('#lab-run')).toBeEnabled();
    });
}
