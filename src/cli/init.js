import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ContextStore } from '../context/store.js';
import { VaultKeyManager } from '../context/vault-key-manager.js';
import { packageVersion } from '../version.js';

/**
 * Idempotent onboarding: create the data directory, open (or create) the
 * vault so the schema is applied, and print the next useful commands.
 */
export function initCommand(options = {}) {
    const dataDir = resolve(options.dataDir || process.env.DATA_DIR || './data');
    const existed = existsSync(join(dataDir, 'context.db'));
    const store = new ContextStore({ dataDir });
    let stats;
    try {
        stats = store.stats();
    } finally {
        store.close();
    }

    const keyManager = new VaultKeyManager(dataDir);
    if (options.encrypt && !existsSync(keyManager.configPath)) {
        keyManager.initialize();
    }
    const keyStatus = keyManager.status();
    const result = {
        version: packageVersion,
        dataDir,
        created: !existed,
        schemaReady: true,
        encrypted: stats.encrypted,
        encryptionConfigured: Boolean(keyStatus.configured),
        memories: stats.active,
        nextSteps: [
            'openself memory add --type decision --scope project/example --content "Use SQLite"',
            'openself context "what did we decide?" --scope project/example --explain',
            'openself connect <claude|codex|cursor|vscode|generic>',
            'openself demo',
        ],
    };

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return result;
    }

    console.log(
        chalk.bold.green(
            `OpenSelf ${result.created ? 'initialized' : 'ready'} — v${result.version}`,
        ),
    );
    console.log(`Vault: ${result.dataDir}`);
    console.log(`Memories: ${result.memories} · encryption: ${result.encrypted ? 'on' : 'off'}`);
    console.log('');
    console.log(chalk.bold('Next steps:'));
    for (const step of result.nextSteps) console.log(`  ${chalk.gray('$')} ${step}`);
    return result;
}
