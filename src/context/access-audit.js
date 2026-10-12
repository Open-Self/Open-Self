import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const AUDIT_CHAIN_GENESIS = 'openself-audit-chain-v1';

/**
 * Append-only MCP access audit with a tamper-evident hash chain.
 *
 * Each completed event stores `entry_hash = sha256(prev_hash \n occurred_at \n
 * client \n tool \n outcome)` where `prev_hash` is the previous completed
 * event's hash. Editing or deleting a historical row breaks verification of
 * every later row. Rows still marked 'attempted' (an interrupted operation)
 * carry no hash and are reported as `pending` rather than chain breaks.
 *
 * Retention pruning records the hash of the newest deleted event in
 * `audit_meta.pruned_hash`, so the surviving suffix stays verifiable — the
 * first retained row anchors against `pruned_hash` instead of genesis.
 */
export class AccessAudit {
    constructor(options = {}) {
        this.readonly = Boolean(options.readonly);
        this.retentionDays = bounded(options.retentionDays ?? 30, 1, 3650);
        this.maxEntries = bounded(options.maxEntries ?? 10000, 1, 1000000);
        const path = options.dbPath || ':memory:';
        if (path !== ':memory:' && !this.readonly) {
            mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        }
        this.db = new Database(path, this.readonly ? { readonly: true } : undefined);
        try {
            if (path !== ':memory:' && !this.readonly) chmodSync(path, 0o600);
            if (!this.readonly) {
                this.db.pragma('journal_mode = WAL');
                this.db.pragma('secure_delete = ON');
            }
            this._migrate();
        } catch (error) {
            this.db.close();
            throw error;
        }
    }

    _migrate() {
        if (this.readonly) return;
        this.db.exec(`CREATE TABLE IF NOT EXISTS access_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            client TEXT NOT NULL,
            tool TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK(outcome IN ('attempted','allowed','denied','error')),
            prev_hash TEXT,
            entry_hash TEXT
        )`);
        this.db.exec(`CREATE TABLE IF NOT EXISTS audit_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`);
        const columns = this.db
            .prepare("SELECT name FROM pragma_table_info('access_events')")
            .all()
            .map((column) => column.name);
        if (!columns.includes('prev_hash')) {
            this.db.exec('ALTER TABLE access_events ADD COLUMN prev_hash TEXT');
        }
        if (!columns.includes('entry_hash')) {
            this.db.exec('ALTER TABLE access_events ADD COLUMN entry_hash TEXT');
        }
    }

    _requireWritable() {
        if (this.readonly) throw new Error('Audit log opened read-only');
    }

    _meta(key) {
        if (this._hasMeta === undefined) {
            this._hasMeta = Boolean(
                this.db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_meta'",
                    )
                    .get(),
            );
        }
        if (!this._hasMeta) return undefined;
        return this.db.prepare('SELECT value FROM audit_meta WHERE key = ?').get(key)?.value;
    }

    _setMeta(key, value) {
        this.db
            .prepare('INSERT OR REPLACE INTO audit_meta (key, value) VALUES (?, ?)')
            .run(key, value);
    }

    begin(client, tool) {
        this._requireWritable();
        return this.db.transaction(() => {
            const result = this.db
                .prepare(
                    'INSERT INTO access_events (occurred_at, client, tool, outcome) VALUES (?, ?, ?, ?)',
                )
                .run(new Date().toISOString(), client, tool, 'attempted');
            this.prune();
            return Number(result.lastInsertRowid);
        })();
    }

    finish(id, outcome) {
        this._requireWritable();
        this.db.transaction(() => {
            const event = this.db
                .prepare('SELECT occurred_at, client, tool FROM access_events WHERE id = ?')
                .get(id);
            if (!event) return;
            const previous = this.db
                .prepare(
                    'SELECT entry_hash FROM access_events WHERE id < ? AND entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1',
                )
                .get(id);
            const prevHash =
                previous?.entry_hash || this._meta('pruned_hash') || AUDIT_CHAIN_GENESIS;
            const entryHash = auditEntryHash(prevHash, event, outcome);
            this.db
                .prepare(
                    'UPDATE access_events SET outcome = ?, prev_hash = ?, entry_hash = ? WHERE id = ?',
                )
                .run(outcome, prevHash, entryHash, id);
        })();
    }

    _chainColumns() {
        if (this._hasChain === undefined) {
            const columns = this.db
                .prepare("SELECT name FROM pragma_table_info('access_events')")
                .all()
                .map((column) => column.name);
            this._hasChain = columns.includes('entry_hash');
        }
        return this._hasChain;
    }

    list(options = {}) {
        if (!this.readonly) this.prune();
        const chain = this._chainColumns()
            ? ', prev_hash AS prevHash, entry_hash AS entryHash'
            : '';
        return this.db
            .prepare(
                `SELECT id, occurred_at AS occurredAt, client, tool, outcome${chain}
                 FROM access_events WHERE (? IS NULL OR client = ?)
                 ORDER BY id DESC LIMIT ?`,
            )
            .all(
                options.client || null,
                options.client || null,
                bounded(options.limit ?? 50, 1, 1000),
            );
    }

    /**
     * Verify the hash chain. Returns counts plus the first row where the chain
     * breaks (`brokenAt`) when tampering or unexpected deletion is detected.
     */
    verify() {
        const chain = this._chainColumns()
            ? ', prev_hash AS prevHash, entry_hash AS entryHash'
            : ', NULL AS prevHash, NULL AS entryHash';
        const rows = this.db
            .prepare(
                `SELECT id, occurred_at AS occurredAt, client, tool, outcome${chain}
                 FROM access_events ORDER BY id ASC`,
            )
            .all();
        let expected = this._meta('pruned_hash') || AUDIT_CHAIN_GENESIS;
        let chaining = false;
        const result = {
            ok: true,
            checked: 0,
            legacy: 0,
            pending: 0,
            brokenAt: null,
            tip: null,
            genesis: AUDIT_CHAIN_GENESIS,
        };
        for (const row of rows) {
            if (!row.entryHash) {
                // Interrupted attempts never join the chain, wherever they sit.
                if (row.outcome === 'attempted') {
                    result.pending += 1;
                    continue;
                }
                if (chaining) {
                    // A completed event without a hash mid-chain means someone
                    // stripped hashes — that is a break, not legacy data.
                    result.ok = false;
                    result.brokenAt = row.id;
                    break;
                }
                result.legacy += 1;
                continue;
            }
            chaining = true;
            const hash = auditEntryHash(row.prevHash, row, row.outcome);
            if (row.prevHash !== expected || hash !== row.entryHash) {
                result.ok = false;
                result.brokenAt = row.id;
                break;
            }
            result.checked += 1;
            result.tip = row.entryHash;
            expected = row.entryHash;
        }
        return result;
    }

    /** JSONL export for external archival or transparency-log anchoring. */
    toJSONL(options = {}) {
        const events = this.list({ ...options, limit: options.limit ?? 1000 }).reverse();
        const lines = events.map((event) => JSON.stringify(event));
        return lines.length ? `${lines.join('\n')}\n` : '';
    }

    prune() {
        if (this.readonly) return 0;
        return this.db.transaction(() => {
            const doomed = this.db
                .prepare(
                    `SELECT id FROM access_events
                     WHERE occurred_at < ? OR id NOT IN (
                         SELECT id FROM access_events ORDER BY id DESC LIMIT ?
                     )`,
                )
                .all(
                    new Date(Date.now() - this.retentionDays * 86400000).toISOString(),
                    this.maxEntries,
                );
            if (!doomed.length) return 0;
            const keep = this.db
                .prepare(
                    `SELECT prev_hash AS prevHash FROM access_events
                     WHERE entry_hash IS NOT NULL ORDER BY id ASC LIMIT 1`,
                )
                .get();
            this.db
                .prepare(`DELETE FROM access_events WHERE id IN (SELECT value FROM json_each(?))`)
                .run(JSON.stringify(doomed.map((row) => row.id)));
            // Anchor the surviving chain head against the deleted prefix.
            const head = this.db
                .prepare(
                    `SELECT prev_hash AS prevHash FROM access_events
                     WHERE entry_hash IS NOT NULL ORDER BY id ASC LIMIT 1`,
                )
                .get();
            if (head?.prevHash && head.prevHash !== AUDIT_CHAIN_GENESIS) {
                this._setMeta('pruned_hash', head.prevHash);
            } else if (keep?.prevHash === AUDIT_CHAIN_GENESIS) {
                this._setMeta('pruned_hash', AUDIT_CHAIN_GENESIS);
            }
            return doomed.length;
        })();
    }

    clear() {
        this._requireWritable();
        const changes = this.db.prepare('DELETE FROM access_events').run().changes;
        this._setMeta('pruned_hash', AUDIT_CHAIN_GENESIS);
        return changes;
    }

    close() {
        this.db.close();
    }
}

export function auditEntryHash(prevHash, event, outcome) {
    return createHash('sha256')
        .update(
            [
                prevHash || AUDIT_CHAIN_GENESIS,
                event.occurred_at || event.occurredAt,
                event.client,
                event.tool,
                outcome,
            ].join('\n'),
        )
        .digest('hex');
}

function bounded(value, min, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max)
        throw new Error(`Audit setting must be an integer from ${min} to ${max}`);
    return number;
}
