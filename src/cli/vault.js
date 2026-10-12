import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import inquirer from 'inquirer';
import { ContextStore } from '../context/store.js';
import { VaultKeyManager } from '../context/vault-key-manager.js';
import { backupVault, restoreVault } from '../context/backup.js';

export async function vaultCommand(action, options = {}) {
    const dataDir = options.dataDir || process.env.DATA_DIR || './data';
    if (action === 'backup' || action === 'restore') {
        if (!options.file) throw new Error('--file is required for vault backup/restore');
        if (action === 'restore' && !options.dataDir) {
            throw new Error('Restore requires an explicit new --data-dir');
        }
        const passphrase = await backupPassphrase(action, options);
        if (action === 'restore') {
            console.log(
                JSON.stringify(await restoreVault(options.file, dataDir, { passphrase }), null, 2),
            );
            return;
        }
        if (!existsSync(join(dataDir, 'context.db')))
            throw new Error('No Context Vault exists in this data directory');
        const store = new ContextStore({ dataDir });
        try {
            console.log(
                JSON.stringify(await backupVault(store, options.file, { passphrase }), null, 2),
            );
        } finally {
            store.close();
        }
        return;
    }
    const manager = new VaultKeyManager(dataDir);
    if (action === 'status') {
        console.log(JSON.stringify(manager.status(), null, 2));
        return;
    }
    if (action !== 'init') {
        throw new Error(`Unknown vault action: ${action}. Use init, status, backup or restore.`);
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

async function backupPassphrase(action, options) {
    if (options.passphraseFile)
        return readFileSync(options.passphraseFile, 'utf8').replace(/\r?\n$/, '');
    if (process.env.OPENSELF_BACKUP_PASSPHRASE) return process.env.OPENSELF_BACKUP_PASSPHRASE;
    if (!process.stdin.isTTY)
        throw new Error(
            'Set OPENSELF_BACKUP_PASSPHRASE or use --passphrase-file for non-interactive backups',
        );
    const { passphrase } = await inquirer.prompt([
        {
            type: 'password',
            name: 'passphrase',
            message: 'Backup passphrase (12+ characters):',
            mask: '*',
        },
    ]);
    if (action === 'backup') {
        const { confirmation } = await inquirer.prompt([
            {
                type: 'password',
                name: 'confirmation',
                message: 'Confirm backup passphrase:',
                mask: '*',
            },
        ]);
        if (confirmation !== passphrase) throw new Error('Backup passphrases do not match');
    }
    return passphrase;
}
