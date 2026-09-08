import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class AccessAudit {
    constructor(options = {}) {
        this.retentionDays = bounded(options.retentionDays ?? 30, 1, 3650);
        this.maxEntries = bounded(options.maxEntries ?? 10000, 1, 1000000);
        const path = options.dbPath || ':memory:';
        if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        this.db = new Database(path);
        try {
            if (path !== ':memory:') chmodSync(path, 0o600);
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('secure_delete = ON');
            this.db.exec(`CREATE TABLE IF NOT EXISTS access_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            client TEXT NOT NULL,
            tool TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK(outcome IN ('attempted','allowed','denied','error'))
        )`);
        } catch (error) {
            this.db.close();
            throw error;
        }
    }

    begin(client, tool) {
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
        this.db.prepare('UPDATE access_events SET outcome = ? WHERE id = ?').run(outcome, id);
    }

    list(options = {}) {
        this.prune();
        return this.db
            .prepare(
                'SELECT id, occurred_at AS occurredAt, client, tool, outcome FROM access_events WHERE (? IS NULL OR client = ?) ORDER BY id DESC LIMIT ?',
            )
            .all(
                options.client || null,
                options.client || null,
                bounded(options.limit ?? 50, 1, 1000),
            );
    }

    prune() {
        const before = new Date(Date.now() - this.retentionDays * 86400000).toISOString();
        return this.db
            .prepare(
                'DELETE FROM access_events WHERE occurred_at < ? OR id NOT IN (SELECT id FROM access_events ORDER BY id DESC LIMIT ?)',
            )
            .run(before, this.maxEntries).changes;
    }

    clear() {
        return this.db.prepare('DELETE FROM access_events').run().changes;
    }
    close() {
        this.db.close();
    }
}

function bounded(value, min, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max)
        throw new Error(`Audit setting must be an integer from ${min} to ${max}`);
    return number;
}
