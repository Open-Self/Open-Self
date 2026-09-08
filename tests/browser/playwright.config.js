import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: '**/*.spec.js',
    outputDir: '../../test-results',
    forbidOnly: Boolean(process.env.CI),
    workers: 1,
    retries: 0,
    reporter: 'list',
    use: { browserName: 'chromium', headless: true },
    projects: ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York'].map((timezoneId) => ({
        name: timezoneId.replaceAll('/', '-'),
        use: { timezoneId },
    })),
});
