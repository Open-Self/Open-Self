import chalk from 'chalk';
import { ContextStore } from '../context/store.js';

export function memoryCommand(action, options = {}) {
    const store = new ContextStore({
        dataDir: options.dataDir || process.env.DATA_DIR || './data',
    });
    try {
        switch (action) {
            case 'add':
                return addMemory(store, options);
            case 'search':
                return searchMemory(store, options);
            case 'list':
                return listMemories(store, options);
            case 'forget':
                return forgetMemory(store, options);
            case 'stats':
                return printJson(store.stats());
            default:
                throw new Error(
                    `Unknown memory action: ${action}. Use add, search, list, forget, or stats.`,
                );
        }
    } finally {
        store.close();
    }
}

function addMemory(store, options) {
    if (!options.content) throw new Error('--content is required for memory add');
    const memory = store.remember({
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
    });
    console.log(chalk.green(`✓ Remembered ${memory.type} ${memory.id}`));
    printJson(memory);
}

function searchMemory(store, options) {
    if (!options.query) throw new Error('--query is required for memory search');
    printJson(
        store.search(options.query, {
            scope: options.scope,
            type: options.type,
            limit: Number(options.limit || 10),
            maxSensitivity: options.maxSensitivity,
        }),
    );
}

function listMemories(store, options) {
    printJson(
        store.list({
            scope: options.scope,
            type: options.type,
            limit: Number(options.limit || 20),
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
