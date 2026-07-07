import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.js'],
        // Run test files sequentially (not in parallel) — many tests touch ./data
        // and ./tests/fixtures via file IO and would race on disk under
        // parallelism. Per-file isolation is kept (isolate defaults to true).
        fileParallelism: false,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.js'],
            exclude: [
                // CLI entry points — interactive commands, not unit-testable
                'src/cli/index.js',
                'src/cli/arena.js',
                'src/cli/feed.js',
                'src/cli/ghost.js',
                'src/cli/profile.js',
                'src/cli/review.js',
                'src/cli/setup.js',
                'src/cli/share.js',
                'src/cli/start.js',
                'src/cli/test.js',
                // App entrypoint + static assets
                'src/index.js',
                'src/web/index.html',
                // Heavy gateway drivers — integration-tested separately
                'src/gateway/telegram.js',
                'src/gateway/discord.js',
                'src/gateway/router.js',
                // Arena orchestrator — LLM-driven debate loop, exercised via CLI
                'src/arena/arena.js',
                // Web server — HTTP integration needs supertest; boot smoke-tested separately
                'src/web/server.js',
                'src/**/*.test.js',
            ],
            thresholds: {
                lines: 80,
                functions: 85,
                branches: 72,
            },
        },
    },
});
