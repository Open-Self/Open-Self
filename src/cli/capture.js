import chalk from 'chalk';
import { resolve } from 'node:path';
import { ProjectFolderCapture } from '../context/project-capture.js';
import { ContextStore } from '../context/store.js';

export async function captureCommand(source, folderPath, options = {}) {
    if (source !== 'project') {
        throw new Error(`Unsupported capture source: ${source}. Currently available: project.`);
    }

    const dataDir = options.dataDir || process.env.DATA_DIR || './data';
    const store = new ContextStore({ dataDir });
    const capture = new ProjectFolderCapture(store, folderPath || '.', {
        projectName: options.name,
        scope: options.scope,
        sensitivity: options.sensitivity,
        extensions: splitCsv(options.extensions),
        ignore: splitCsv(options.ignore),
        maxFileBytes: options.maxFileBytes,
    });

    if (!options.watch) {
        try {
            printReport(capture.scan({ dryRun: options.dryRun }));
        } finally {
            store.close();
        }
        return;
    }

    if (options.dryRun) {
        store.close();
        throw new Error('--dry-run cannot be combined with --watch');
    }

    const intervalSeconds = Number(options.interval || 5);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
        store.close();
        throw new Error('--interval must be at least 1 second');
    }

    printReport(capture.scan());
    console.log(
        chalk.cyan(
            `Watching ${resolve(folderPath || '.')} every ${intervalSeconds}s. Press Ctrl+C to stop.`,
        ),
    );

    await new Promise((resolvePromise) => {
        const timer = setInterval(() => printReport(capture.scan()), intervalSeconds * 1_000);
        const stop = () => {
            clearInterval(timer);
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
            store.close();
            resolvePromise();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    });
}

function splitCsv(value) {
    if (!value) return undefined;
    return String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function printReport(report) {
    const changes = report.added + report.updated + report.removed;
    if (changes === 0 && !report.dryRun) return;
    console.log(JSON.stringify({ capturedAt: new Date().toISOString(), ...report }, null, 2));
}
