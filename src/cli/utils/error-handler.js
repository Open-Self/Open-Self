/**
 * Centralized CLI error handler.
 *
 * Maps thrown errors to friendly messages + structured exit codes so
 * callers (CI, automation) can branch on outcome instead of parsing stderr.
 *
 * Exit codes:
 *   0 success
 *   1 generic / runtime
 *   2 missing/invalid configuration (no API key, missing SOUL.md)
 *   3 dependency/network failure (Ollama down, API 5xx)
 */

import chalk from 'chalk';

export function handleError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;

    console.error('');
    console.error(chalk.red(`✖ ${msg}`));

    if (code === 'NO_SOUL' || /SOUL\.md not found/i.test(msg)) {
        console.error(chalk.dim('  Run: openself feed --whatsapp <chat-export.txt>'));
        process.exit(2);
    }
    if (code === 'MISSING_API_KEY' || /api key/i.test(msg) && /missing|not set|invalid/i.test(msg)) {
        console.error(chalk.dim('  Run: openself setup'));
        process.exit(2);
    }
    if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(msg)) {
        console.error(chalk.dim('  Connection refused. Is Ollama running? Try: ollama serve'));
        process.exit(3);
    }
    if (/ENOENT/.test(msg)) {
        console.error(chalk.dim('  File not found. Check the path and try again.'));
        process.exit(2);
    }
    if (/401|403|unauthor/i.test(msg)) {
        console.error(chalk.dim('  Authentication failed. Check API key in .env or run: openself setup'));
        process.exit(3);
    }

    if (process.env.OPENSELF_DEBUG && err?.stack) {
        console.error(chalk.dim(err.stack));
    } else {
        console.error(chalk.dim('  (set OPENSELF_DEBUG=1 for full stack)'));
    }
    process.exit(1);
}

/**
 * Wrap an async commander action so any throw lands in `handleError`
 * instead of becoming an unhandled rejection with a raw stack trace.
 */
export function wrapAction(fn) {
    return async (...args) => {
        try {
            await fn(...args);
        } catch (err) {
            handleError(err);
        }
    };
}
