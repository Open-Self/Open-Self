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
                // Arena, ghost, conversation memory — phase-05+ coverage
                'src/arena/arena.js',
                'src/ghost/ghost.js',
                'src/memory/conversation.js',
                // Soul generator — phase-05+ coverage
                'src/personality/soul-generator.js',
                // Review queue — requires FS, low priority
                'src/safety/review-queue.js',
                // Config loader — requires YAML file on disk
                'src/config/loader.js',
                // Web server — requires supertest (not installed); security logic tested inline
                'src/web/server.js',
                'src/**/*.test.js',
            ],
            thresholds: {
                lines: 60,
                functions: 70,
                branches: 70,
            },
        },
    },
});
