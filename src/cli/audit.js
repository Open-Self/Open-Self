import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AccessAudit } from '../context/access-audit.js';

/**
 * Owner-side MCP access audit: list events, verify the tamper-evident hash
 * chain, export events as JSONL for archival, or prune/clear history.
 */
export function auditCommand(action, options = {}) {
    if (!['list', 'verify', 'export', 'prune', 'clear'].includes(action))
        throw new Error('Use audit list, verify, export, prune or clear');
    const dataDir = resolve(options.dataDir || process.env.DATA_DIR || './data');
    const dbPath = join(dataDir, 'mcp-audit.db');
    if (!existsSync(dbPath)) {
        if (action === 'list') {
            console.log('[]');
            return [];
        }
        if (action === 'verify') {
            console.log(chalk.gray('No MCP audit database yet — run openself mcp first.'));
            return { ok: true, checked: 0, legacy: 0, pending: 0 };
        }
        const empty = { deleted: 0 };
        console.log(JSON.stringify(empty, null, 2));
        return empty;
    }
    const audit = new AccessAudit({
        dbPath,
        retentionDays: options.retentionDays,
        maxEntries: options.maxEntries,
    });
    try {
        switch (action) {
            case 'list':
                return listEvents(audit, options);
            case 'verify':
                return verifyChain(audit, options);
            case 'export':
                return exportEvents(audit, options);
            default: {
                const result = { deleted: audit[action]() };
                console.log(JSON.stringify(result, null, 2));
                return result;
            }
        }
    } finally {
        audit.close();
    }
}

function listEvents(audit, options) {
    const events = audit.list(options);
    const chain = audit.verify();
    const result = { events, chain };
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return result;
    }
    printChainStatus(chain);
    if (!events.length) {
        console.log(chalk.gray('No MCP access events yet.'));
        return result;
    }
    for (const event of events) {
        const color =
            event.outcome === 'allowed'
                ? chalk.green
                : event.outcome === 'denied'
                  ? chalk.yellow
                  : chalk.red;
        console.log(
            `  ${chalk.gray(`#${event.id}`)} ${event.occurredAt} ${event.client} ` +
                `${event.tool} ${color(event.outcome)}` +
                (event.entryHash ? chalk.gray(` · ${event.entryHash.slice(0, 12)}`) : ''),
        );
    }
    return result;
}

function verifyChain(audit, options) {
    const chain = audit.verify();
    if (options.json) console.log(JSON.stringify(chain, null, 2));
    else printChainStatus(chain);
    if (!chain.ok) {
        const error = new Error(`Audit chain verification failed at event #${chain.brokenAt}`);
        error.exitCode = 1;
        throw error;
    }
    return chain;
}

function exportEvents(audit, options) {
    const jsonl = audit.toJSONL({ limit: Number(options.limit || 1000) });
    const result = { events: jsonl.trim().split('\n').filter(Boolean).length, file: null };
    if (options.file) {
        result.file = resolve(String(options.file));
        writeFileSync(result.file, jsonl, { encoding: 'utf8', mode: 0o600 });
    }
    if (options.json) {
        console.log(JSON.stringify({ ...result, jsonl }, null, 2));
    } else if (result.file) {
        console.log(chalk.green(`✓ Exported ${result.events} events to ${result.file}`));
    } else {
        process.stdout.write(jsonl || '# empty\n');
    }
    return result;
}

function printChainStatus(chain) {
    if (chain.ok) {
        console.log(
            chalk.green(
                `✓ audit chain verified — ${chain.checked} chained` +
                    (chain.legacy ? ` · ${chain.legacy} legacy` : '') +
                    (chain.pending ? ` · ${chain.pending} pending` : ''),
            ),
        );
    } else {
        console.log(chalk.red(`✗ audit chain broken at event #${chain.brokenAt}`));
    }
}
