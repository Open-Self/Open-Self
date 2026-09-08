import { test as base, expect } from '@playwright/test';
import { ContextStore } from '../../src/context/store.js';
import { createContextServer } from '../../src/context/server.js';

const test = base.extend({
    vault: async ({ page }, use) => {
        const store = new ContextStore({ dbPath: ':memory:', encryptionKey: Buffer.alloc(32, 7) });
        const { app } = createContextServer({ store, token: 'synthetic-browser-test-token' });
        const server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        try {
            await page.goto(`${baseUrl}/auth?token=synthetic-browser-test-token`);
            await expect(page.locator('#memory-list')).toContainText('No memories found.');
            await use({ store, baseUrl });
        } finally {
            await page.goto('about:blank');
            await new Promise((resolve) => server.close(resolve));
            store.close();
        }
    },
});

const dates = {
    occurredAt: '2026-11-01T01:30:45.123456-05:00',
    validFrom: '2026-11-01T01:15:30.456-05:00',
    validTo: '2026-12-01T23:59:59.999+07:00',
};

async function openMemory(page, vault) {
    const memory = vault.store.remember({ content: 'Synthetic browser date fixture', ...dates });
    await page.reload();
    await page.getByText(memory.content, { exact: true }).click();
    await expect(page.locator('#content')).toHaveValue(memory.content);
    return memory;
}

async function save(page) {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#message')).toHaveText('Memory saved.');
}

test('editing content preserves exact timestamps, including the later DST occurrence', async ({
    page,
    vault,
}) => {
    const memory = await openMemory(page, vault);
    await page.locator('#content').fill('Edited content with original timestamps');
    await save(page);
    expect(vault.store.get(memory.id)).toMatchObject(dates);
    await page.reload();
    await page.getByText('Edited content with original timestamps', { exact: true }).click();
    await save(page);
    expect(vault.store.get(memory.id)).toMatchObject(dates);
});

test('clearing date fields removes stored dates and survives reload', async ({ page, vault }) => {
    const memory = await openMemory(page, vault);
    await page.getByText('Provenance & time', { exact: true }).click();
    for (const id of ['occurred-at', 'valid-from', 'valid-to'])
        await page.locator(`#${id}`).fill('');
    await save(page);
    expect(vault.store.get(memory.id)).toMatchObject({
        occurredAt: null,
        validFrom: null,
        validTo: null,
    });
    await page.reload();
    await page.getByText(memory.content, { exact: true }).click();
    for (const id of ['occurred-at', 'valid-from', 'valid-to'])
        await expect(page.locator(`#${id}`)).toHaveValue('');
});

test('edited local dates retain milliseconds and convert the selected timezone', async ({
    page,
    vault,
}, testInfo) => {
    const memory = await openMemory(page, vault);
    await page.getByText('Provenance & time', { exact: true }).click();
    await page.locator('#occurred-at').fill('2026-09-09T12:34:56.123');
    await save(page);
    const expected = {
        UTC: '2026-09-09T12:34:56.123Z',
        'Asia-Ho_Chi_Minh': '2026-09-09T05:34:56.123Z',
        'America-New_York': '2026-09-09T16:34:56.123Z',
    };
    expect(vault.store.get(memory.id).occurredAt).toBe(expected[testInfo.project.name]);
    expect(vault.store.get(memory.id).validFrom).toBe(dates.validFrom);
    expect(vault.store.get(memory.id).validTo).toBe(dates.validTo);
});

test('new memories can leave all optional dates empty', async ({ page, vault }) => {
    await page.getByRole('button', { name: 'New memory', exact: true }).click();
    await page.locator('#content').fill('Synthetic undated browser memory');
    await save(page);
    const [memory] = vault.store.list();
    expect(memory.content).toBe('Synthetic undated browser memory');
    expect(memory.occurredAt).toBeNull();
    expect(memory.validFrom).toBeNull();
    expect(memory.validTo).toBeNull();
});
