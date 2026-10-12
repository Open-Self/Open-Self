import chalk from 'chalk';
import { ContextImporter } from '../context/importer.js';
import { ContextStore } from '../context/store.js';
import { exportMemories } from '../context/exporter.js';

export async function memoryCommand(action, options = {}) {
    const store = new ContextStore({
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
        embeddings: options.embeddings,
    });
    try {
        switch (action) {
            case 'add':
                return await addMemory(store, options);
            case 'import':
                return importMemories(store, options);
            case 'search':
                return await searchMemory(store, options);
            case 'conflicts':
                return await findConflicts(store, options);
            case 'index':
                return await indexMemories(store, options);
            case 'list':
                return listMemories(store, options);
            case 'forget':
                return forgetMemory(store, options);
            case 'export':
                return exportMemoriesCli(store, options);
            case 'sweep':
                return sweepExpired(store, options);
            case 'stats':
                return printJson(store.stats());
            default:
                throw new Error(
                    `Unknown memory action: ${action}. Use add, import, index, search, conflicts, list, forget, export, sweep, or stats.`,
                );
        }
    } finally {
        store.close();
    }
}

async function indexMemories(store, options) {
    const result = await store.indexPending({
        limit: options.limit ? Number(options.limit) : 10_000,
    });
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return result;
    }
    console.log(
        result.indexed
            ? chalk.green(
                  `✓ Indexed ${result.indexed} memories with ${result.model}` +
                      (result.pending ? ` · ${result.pending} still pending` : ''),
              )
            : chalk.gray(`Vector index current — ${result.model}`),
    );
    return result;
}

function importMemories(store, options) {
    if (!options.file?.length) throw new Error('--file is required for memory import');
    const importer = new ContextImporter(store);
    const reports = options.file.map((file) =>
        importer.importFile(file, {
            format: options.format,
            scope: options.scope,
            type: options.type,
            sensitivity: options.sensitivity,
            confidence: options.confidence === undefined ? undefined : Number(options.confidence),
            tags: splitTags(options.tags),
            dryRun: options.dryRun,
        }),
    );
    printJson(reports);
}

async function addMemory(store, options) {
    if (!options.content) throw new Error('--content is required for memory add');
    const draft = {
        content: options.content,
        type: options.type,
        summary: options.summary,
        scope: options.scope,
        sensitivity: options.sensitivity,
        confidence: options.confidence === undefined ? undefined : Number(options.confidence),
        source: {
            kind: options.sourceKind || 'manual',
            locator: options.source || '',
            title: options.sourceTitle || '',
        },
        occurredAt: options.occurredAt,
        validFrom: options.validFrom,
        validTo: options.validTo,
        tags: splitTags(options.tags),
    };
    const potentialConflicts = await store.findPotentialConflictsAsync(draft);
    const memory = store.remember(draft);
    if (!store.vectorSync) await store.indexPending();
    console.log(chalk.green(`✓ Remembered ${memory.type} ${memory.id}`));
    if (potentialConflicts.length) {
        console.log(chalk.yellow(`⚠ ${potentialConflicts.length} potential conflict(s) found`));
    }
    printJson({ memory, potentialConflicts });
}

function sweepExpired(store, options) {
    const report = store.sweepExpired({
        limit: options.limit ? Number(options.limit) : undefined,
        dryRun: options.dryRun,
    });
    if (options.json) return printJson(report);
    if (options.dryRun) {
        console.log(chalk.yellow(`${report.expired} expired memor(ies) would be forgotten`));
        return report;
    }
    console.log(
        report.swept
            ? chalk.green(`✓ Swept ${report.swept} expired memor(ies)`)
            : chalk.gray('No expired memories'),
    );
    return report;
}

function exportMemoriesCli(store, options) {
    const report = exportMemories(store, {
        file: options.file?.[0] || options.output,
        scope: options.scope,
        maxSensitivity: options.maxSensitivity,
        includeRestricted:
            Boolean(options.includeRestricted) || options.maxSensitivity === 'restricted',
        dryRun: options.dryRun,
        redact: options.redact,
        sign: options.sign !== false,
    });
    if (report.dryRun) {
        const { memories: _memories, ...summary } = report;
        printJson(summary);
        return;
    }
    console.log(
        chalk.green(
            `✓ Exported ${report.count} memories (${report.bytes} bytes) to ${report.file}`,
        ),
    );
    if (report.signed) {
        console.log(chalk.gray(`  signed by vault ${report.signer.slice(0, 16)}…`));
    }
    if (report.secrets.findings) {
        console.log(
            chalk.yellow(
                report.secrets.redacted
                    ? `⚠ Redacted ${report.secrets.findings} secret-shaped string(s) ` +
                          `(${report.secrets.kinds.join(', ')})`
                    : `⚠ ${report.secrets.findings} secret-shaped string(s) detected ` +
                          `(${report.secrets.kinds.join(', ')}) — re-run with --redact to strip`,
            ),
        );
    }
    console.log(
        chalk.yellow(
            'This is a plaintext interoperability export — not an encrypted backup. Protect the file accordingly.',
        ),
    );
    printJson({ ...report, memories: undefined });
}

async function searchMemory(store, options) {
    if (!options.query) throw new Error('--query is required for memory search');
    if (!store.vectorSync) await store.indexPending();
    printJson(
        await store.searchAsync(options.query, {
            scope: options.scope,
            type: options.type,
            limit: Number(options.limit || 10),
            maxSensitivity: options.maxSensitivity,
            minSourceTrust: options.minSourceTrust,
            retrieval: options.retrieval,
        }),
    );
}

async function findConflicts(store, options) {
    if (!options.content) throw new Error('--content is required for memory conflicts');
    if (!options.type) throw new Error('--type is required for memory conflicts');
    if (!store.vectorSync) await store.indexPending();
    printJson(
        await store.findPotentialConflictsAsync(
            {
                content: options.content,
                type: options.type,
                scope: options.scope,
                validFrom: options.validFrom,
                validTo: options.validTo,
            },
            {
                threshold: options.threshold === undefined ? undefined : Number(options.threshold),
                limit: Number(options.limit || 10),
            },
        ),
    );
}

function listMemories(store, options) {
    printJson(
        store.list({
            scope: options.scope,
            type: options.type,
            limit: Number(options.limit || 20),
            minSourceTrust: options.minSourceTrust,
            includeForgotten: options.includeForgotten,
        }),
    );
}

function forgetMemory(store, options) {
    if (!options.id) throw new Error('--id is required for memory forget');
    const forgotten = store.forget(options.id);
    console.log(
        forgotten ? chalk.green(`✓ Forgot ${options.id}`) : chalk.yellow('Memory not found'),
    );
}

function splitTags(tags) {
    if (!tags) return [];
    return String(tags)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
