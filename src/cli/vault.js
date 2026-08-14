import chalk from 'chalk';
import { ContextStore } from '../context/store.js';
import { VaultKeyManager } from '../context/vault-key-manager.js';

export function vaultCommand(action, options = {}) {
    const dataDir = options.dataDir || process.env.DATA_DIR || './data';
    const manager = new VaultKeyManager(dataDir);
    if (action === 'status') {
        console.log(JSON.stringify(manager.status(), null, 2));
        return;
    }
    if (action !== 'init') {
        throw new Error(`Unknown vault action: ${action}. Use init or status.`);
    }

    const { config } = manager.initialize();
    const store = new ContextStore({ dataDir });
    try {
        console.log(chalk.green('Vault payload encryption enabled.'));
        console.log(JSON.stringify({ ...config, dbPath: store.dbPath }, null, 2));
    } finally {
        store.close();
    }
}
