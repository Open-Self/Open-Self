/* global document, window */
import { test as base, expect } from '@playwright/test';
import { ContextStore } from '../../src/context/store.js';
import { createContextServer } from '../../src/context/server.js';

const test = base.extend({
    app: async ({ page }, use) => {
        const store = new ContextStore({ dbPath: ':memory:', encryptionKey: Buffer.alloc(32, 7) });
        let status = { status: 'disconnected' };
        const calls = [];
        const bridge = {
            getStatus: () => status,
            refresh: async () => status,
            login: async () => {
                calls.push('login');
                status = {
                    status: 'pending',
                    authUrl: 'https://auth.openai.com/authorize?state=synthetic',
                };
                return status;
            },
            cancel: async () => {
                calls.push('cancel');
                status = { status: 'disconnected' };
                return status;
            },
            logout: async () => {
                calls.push('logout');
                status = { status: 'disconnected' };
                return status;
            },
            close() {},
        };
        const context = createContextServer({
            store,
            codexBridge: bridge,
            token: 'synthetic-app-browser',
            appMode: true,
        });
        const server = await new Promise((resolve) => {
            const listener = context.app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        try {
            await page.goto(
                `http://127.0.0.1:${server.address().port}/auth?token=synthetic-app-browser`,
            );
            await expect(page.locator('#view-home')).toBeVisible();
            await expect(page.locator('#codex-status')).toHaveText('Not connected');
            await use({
                store,
                calls,
                setStatus: (value) => {
                    status = value;
                },
            });
        } finally {
            await page.goto('about:blank');
            server.closeAllConnections?.();
            await new Promise((resolve) => server.close(resolve));
            context.close();
            store.close();
        }
    },
});

test('home guides memory creation and hash navigation survives Back, Forward and reload', async ({
    page,
    app,
}) => {
    await page.getByRole('button', { name: 'Add a memory', exact: true }).click();
    await page.locator('#content').fill('Synthetic app onboarding memory');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#message')).toHaveText('Memory saved.');
    expect(app.store.list()).toHaveLength(1);
    await page.goBack();
    await expect(page.locator('#view-home')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#view-memories')).toBeVisible();
    await page.reload();
    await expect(page.locator('#view-memories')).toBeVisible();
});

test('dismissed consent does nothing; repeated sign-in and cancel stay honest', async ({
    page,
    app,
}) => {
    await page.getByRole('button', { name: 'Connect ChatGPT', exact: true }).click();
    await page.keyboard.press('Escape');
    expect(app.calls).toEqual([]);
    await page.getByRole('button', { name: 'Connect ChatGPT', exact: true }).click();
    await page.getByRole('button', { name: 'Not now' }).click();
    expect(app.calls).toEqual([]);
    await page.getByRole('button', { name: 'Connect ChatGPT', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to sign-in', exact: true }).click();
    await expect(page.locator('#codex-status')).toHaveText('Waiting for sign-in');
    await expect(page.locator('#codex-auth-link')).toHaveAttribute(
        'href',
        /https:\/\/auth.openai.com\//,
    );
    expect(app.calls).toEqual(['login']);
    await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
    await expect(page.locator('#codex-status')).toHaveText('Not connected');
    await expect(page.locator('#codex-pending')).toBeHidden();
    await expect(page.locator('#codex-auth-link')).not.toHaveAttribute('href');
    expect(app.calls).toEqual(['login', 'cancel']);
});

test('mobile home has no horizontal overflow and disabled integration remains optional', async ({
    page,
    app,
}, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    app.setStatus({ status: 'disabled' });
    await page.reload();
    await expect(page.locator('#codex-status')).toHaveText('Optional connection is off');
    await expect(page.locator('#codex-controls')).toBeHidden();
    expect(app.calls).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('app-home-mobile.png'), fullPage: true });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});

test('direct links restore lazy views after reload', async ({ page, app: _app }) => {
    await page.getByRole('button', { name: 'Review agent proposals' }).click();
    await page.reload();
    await expect(page.locator('#inbox-list')).toContainText(/No .*proposals/i);
    await page.getByRole('button', { name: 'Audit', exact: true }).click();
    await page.reload();
    await expect(page.locator('#audit-list')).toContainText(/No .*events/i);
});

test('a failed connection action clears stale Connected and pending links', async ({
    page,
    app,
}) => {
    app.setStatus({ status: 'connected', authenticated: true });
    await page.reload();
    await expect(page.locator('#codex-status')).toHaveText('Connected to Codex');
    await page.route('**/api/context/codex/refresh', (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Synthetic failure' }),
        }),
    );
    await page.getByRole('button', { name: 'Check Codex', exact: true }).click();
    await expect(page.locator('#codex-status')).toHaveText('Connection needs attention');
    await expect(page.locator('#codex-pending')).toBeHidden();
});
