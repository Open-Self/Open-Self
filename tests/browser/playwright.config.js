import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: '**/*.spec.js',
    outputDir: '../../test-results',
    forbidOnly: Boolean(process.env.CI),
    workers: 1,
    retries: 0,
    timeout: 60_000,
    reporter: 'list',
    use: {
        browserName: 'chromium',
        headless: true,
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
            : {},
    },
    projects: ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York'].map((timezoneId) => ({
        name: timezoneId.replaceAll('/', '-'),
        use: { timezoneId },
    })),
});
