import chalk from 'chalk';
import { constants } from 'node:fs';
import { accessSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { ContextStore, VAULT_SCHEMA_VERSION } from '../context/store.js';
import { AccessAudit } from '../context/access-audit.js';
import { VaultKeyManager } from '../context/vault-key-manager.js';
import { loadSigningIdentity } from '../context/signing.js';
import { packageVersion } from '../version.js';

const MIN_NODE = [22, 13, 0];

/**
 * Diagnostics for a local OpenSelf installation. Never prints secrets, key
 * material, tokens, or memory content — only metadata and fix hints.
 */
export function doctorCommand(options = {}) {
    const dataDir = resolve(options.dataDir || process.env.DATA_DIR || './data');
    const checks = [];
    const check = (name, fn) => {
        try {
            const detail = fn();
            checks.push({ name, status: 'pass', ...(detail ? { detail } : {}) });
        } catch (error) {
            checks.push({
                name,
                status: error.warn ? 'warn' : 'fail',
                detail: error.detail || error.message,
                fix: error.fix,
            });
        }
    };

    check('node-version', () => {
        const [major, minor, patch] = process.versions.node.split('.').map(Number);
        if (
            major < MIN_NODE[0] ||
            (major === MIN_NODE[0] &&
                (minor < MIN_NODE[1] || (minor === MIN_NODE[1] && patch < MIN_NODE[2])))
        ) {
            throw Object.assign(
                new Error(`Node ${process.versions.node} < ${MIN_NODE.join('.')}`),
                { fix: 'Upgrade Node.js to 22.13 or newer' },
            );
        }
        return `v${process.versions.node} · openself ${packageVersion}`;
    });

    check('data-dir', () => {
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true });
            return `created ${dataDir}`;
        }
        accessSync(dataDir, constants.R_OK | constants.W_OK);
        return dataDir;
    });

    check('vault-writable', () => {
        const probe = join(dataDir, `.openself-doctor-${process.pid}`);
        writeFileSync(probe, 'ok', { mode: 0o600 });
        rmSync(probe, { force: true });
        return 'write/delete probe succeeded';
    });

    check('sqlite', () => {
        const probe = new Database(':memory:');
        try {
            probe.exec("CREATE VIRTUAL TABLE t USING fts5(x); INSERT INTO t VALUES ('ok')");
            const row = probe.prepare("SELECT * FROM t WHERE t MATCH 'ok'").get();
            if (!row) throw new Error('FTS5 probe returned no rows');
            return `better-sqlite3 ${probe.prepare('select sqlite_version() v').get().v} · FTS5 available`;
        } finally {
            probe.close();
        }
    });

    let store;
    check('vault-schema', () => {
        store = new ContextStore({ dataDir });
        const version = store.db.pragma('user_version', { simple: true });
        if (version > VAULT_SCHEMA_VERSION) {
            throw Object.assign(new Error(`vault schema ${version} > ${VAULT_SCHEMA_VERSION}`), {
                fix: 'Upgrade openself to a release that supports this vault schema',
            });
        }
        const integrity = store.db.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok') throw new Error(`integrity_check: ${integrity}`);
        return `schema v${version} · integrity ok · ${store.stats().active} active memories`;
    });

    check('vault-encryption', () => {
        const status = new VaultKeyManager(dataDir).status();
        if (!status.configured) return 'not configured (plaintext vault)';
        if (!status.keyAvailable) {
            throw Object.assign(new Error('encrypted vault but OS key is unavailable'), {
                detail: status.error || 'key provider returned no key',
                fix: 'Sign into the same OS account, or supply OPENSELF_VAULT_KEY for headless use',
            });
        }
        return `encrypted · provider ${status.provider}`;
    });

    check('vault-identity', () => {
        const identity = loadSigningIdentity(dataDir, { create: false });
        if (!identity) return 'no signing identity yet (created on first signed operation)';
        // The fingerprint is a hash of the public key — safe to display.
        return `ed25519 · fingerprint ${identity.fingerprint.slice(0, 16)}…`;
    });

    check('audit-log', () => {
        const auditDb = join(dataDir, 'mcp-audit.db');
        if (!existsSync(auditDb)) return 'no MCP audit database yet';
        const audit = new AccessAudit({ dbPath: auditDb, readonly: true });
        try {
            const chain = audit.verify();
            if (!chain.ok) {
                throw Object.assign(new Error(`audit chain broken at event #${chain.brokenAt}`), {
                    fix: 'Inspect with openself audit verify --data-dir ' + dataDir,
                });
            }
            return (
                `${chain.checked + chain.legacy + chain.pending} events · chain verified ` +
                `(${chain.checked} chained` +
                (chain.legacy ? `, ${chain.legacy} legacy` : '') +
                (chain.pending ? `, ${chain.pending} pending` : '') +
                ')'
            );
        } finally {
            audit.close();
        }
    });

    if (store) store.close();

    const failed = checks.filter((item) => item.status === 'fail');
    const warned = checks.filter((item) => item.status === 'warn');
    const result = { dataDir, ok: failed.length === 0, checks };

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(chalk.bold('OpenSelf doctor'));
        for (const item of checks) {
            const icon =
                item.status === 'pass'
                    ? chalk.green('✓')
                    : item.status === 'warn'
                      ? chalk.yellow('!')
                      : chalk.red('✗');
            console.log(
                ` ${icon} ${item.name}${item.detail ? chalk.gray(` — ${item.detail}`) : ''}`,
            );
            if (item.fix) console.log(chalk.gray(`     fix: ${item.fix}`));
        }
        if (!failed.length && !warned.length) console.log(chalk.green('All checks passed.'));
    }
    if (failed.length) {
        const error = new Error(`${failed.length} doctor check(s) failed`);
        error.exitCode = 1;
        throw error;
    }
    return result;
}
