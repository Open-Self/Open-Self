import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeMemory } from './schema.js';

const SELECT_COLUMNS = `
    memories.id, memories.type, memories.content, memories.summary,
    memories.source_kind, memories.source_locator, memories.source_title,
    memories.scope, memories.sensitivity, memories.confidence,
    memories.valid_from, memories.valid_to, memories.occurred_at,
    memories.tags, memories.status, memories.created_at, memories.updated_at,
    memories.forgotten_at
`;

export class ContextStore {
    constructor(options = {}) {
        const dataDir = options.dataDir || './data';
        this.dbPath = options.dbPath || join(dataDir, 'context.db');
        if (this.dbPath !== ':memory:' && !existsSync(dirname(this.dbPath))) {
            mkdirSync(dirname(this.dbPath), { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');
        this._migrate();
        this._prepare();
    }

    _migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                source_kind TEXT NOT NULL DEFAULT 'manual',
                source_locator TEXT NOT NULL DEFAULT '',
                source_title TEXT NOT NULL DEFAULT '',
                scope TEXT NOT NULL DEFAULT 'personal',
                sensitivity TEXT NOT NULL DEFAULT 'personal',
                confidence REAL NOT NULL DEFAULT 1 CHECK(confidence >= 0 AND confidence <= 1),
                valid_from TEXT,
                valid_to TEXT,
                occurred_at TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'forgotten')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                forgotten_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_memories_scope_status
                ON memories(scope, status);
            CREATE INDEX IF NOT EXISTS idx_memories_type_status
                ON memories(type, status);
            CREATE INDEX IF NOT EXISTS idx_memories_occurred_at
                ON memories(occurred_at);

            CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                id UNINDEXED,
                content,
                summary,
                tags,
                tokenize = 'unicode61 remove_diacritics 2'
            );
        `);
    }

    _prepare() {
        this.statements = {
            insert: this.db.prepare(`
                INSERT INTO memories (
                    id, type, content, summary, source_kind, source_locator, source_title,
                    scope, sensitivity, confidence, valid_from, valid_to, occurred_at,
                    tags, status, created_at, updated_at
                ) VALUES (
                    @id, @type, @content, @summary, @sourceKind, @sourceLocator, @sourceTitle,
                    @scope, @sensitivity, @confidence, @validFrom, @validTo, @occurredAt,
                    @tags, @status, @createdAt, @updatedAt
                )
            `),
            insertFts: this.db.prepare(
                'INSERT INTO memory_fts (id, content, summary, tags) VALUES (?, ?, ?, ?)',
            ),
            get: this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM memories WHERE id = ?`),
            forget: this.db.prepare(`
                UPDATE memories
                SET status = 'forgotten', forgotten_at = @now, updated_at = @now
                WHERE id = @id AND status = 'active'
            `),
            deleteFts: this.db.prepare('DELETE FROM memory_fts WHERE id = ?'),
            stats: this.db.prepare(`
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN status = 'forgotten' THEN 1 ELSE 0 END) AS forgotten
                FROM memories
            `),
        };

        this._insertTransaction = this.db.transaction((memory) => {
            this.statements.insert.run(toRow(memory));
            this.statements.insertFts.run(
                memory.id,
                memory.content,
                memory.summary,
                memory.tags.join(' '),
            );
        });

        this._forgetTransaction = this.db.transaction((id, now) => {
            const result = this.statements.forget.run({ id, now });
            if (result.changes > 0) this.statements.deleteFts.run(id);
            return result.changes > 0;
        });
    }

    remember(input) {
        const memory = normalizeMemory(input);
        this._insertTransaction(memory);
        return memory;
    }

    get(id, options = {}) {
        const row = this.statements.get.get(id);
        if (!row || (!options.includeForgotten && row.status !== 'active')) return null;
        return fromRow(row);
    }

    search(query, options = {}) {
        const limit = clamp(options.limit ?? 10, 1, 100);
        const scope = options.scope || null;
        const type = options.type || null;
        const sensitivity = options.maxSensitivity || 'restricted';
        const sensitivityRank = ['public', 'personal', 'private', 'restricted'].indexOf(
            sensitivity,
        );
        const asOf = options.asOf || new Date().toISOString();
        const ftsQuery = toFtsQuery(query);

        if (!ftsQuery) return this.list({ ...options, limit });

        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS}, bm25(memory_fts, 0, 1.0, 0.5, 0.2) AS rank
                 FROM memory_fts
                 JOIN memories ON memories.id = memory_fts.id
                 WHERE memory_fts MATCH @query
                   AND memories.status = 'active'
                   AND (@scope IS NULL OR memories.scope = @scope OR memories.scope LIKE @scopePrefix)
                   AND (@type IS NULL OR memories.type = @type)
                   AND CASE memories.sensitivity
                       WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                       WHEN 'private' THEN 2 ELSE 3 END <= @sensitivityRank
                   AND (memories.valid_from IS NULL OR memories.valid_from <= @asOf)
                   AND (memories.valid_to IS NULL OR memories.valid_to >= @asOf)
                 ORDER BY rank ASC, confidence DESC, COALESCE(occurred_at, created_at) DESC
                 LIMIT @limit`,
            )
            .all({
                query: ftsQuery,
                scope,
                scopePrefix: scope ? `${scope}/%` : null,
                type,
                sensitivityRank,
                asOf,
                limit,
            });

        return rows.map((row) => ({
            ...fromRow(row),
            relevance: Number((1 / (1 + Math.abs(row.rank))).toFixed(4)),
        }));
    }

    list(options = {}) {
        const clauses = [options.includeForgotten ? '1 = 1' : "status = 'active'"];
        const params = { limit: clamp(options.limit ?? 20, 1, 100), offset: options.offset || 0 };
        if (options.scope) {
            clauses.push('(scope = @scope OR scope LIKE @scopePrefix)');
            params.scope = options.scope;
            params.scopePrefix = `${options.scope}/%`;
        }
        if (options.type) {
            clauses.push('type = @type');
            params.type = options.type;
        }

        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS} FROM memories
                 WHERE ${clauses.join(' AND ')}
                 ORDER BY COALESCE(occurred_at, created_at) DESC
                 LIMIT @limit OFFSET @offset`,
            )
            .all(params);
        return rows.map(fromRow);
    }

    buildContext(query, options = {}) {
        const memories = this.search(query, { ...options, limit: options.limit || 12 });
        const maxChars = clamp(options.maxChars ?? 8_000, 500, 50_000);
        const selected = [];
        let usedChars = 0;

        for (const memory of memories) {
            const rendered = renderMemory(memory);
            if (selected.length > 0 && usedChars + rendered.length > maxChars) break;
            selected.push({ ...memory, rendered });
            usedChars += rendered.length;
        }

        return {
            query,
            context: selected.map((memory) => memory.rendered).join('\n\n'),
            memories: selected.map(({ rendered: _rendered, ...memory }) => memory),
            usedChars,
        };
    }

    forget(id) {
        return this._forgetTransaction(id, new Date().toISOString());
    }

    stats() {
        const row = this.statements.stats.get();
        const byType = this.db
            .prepare(
                "SELECT type, COUNT(*) AS count FROM memories WHERE status = 'active' GROUP BY type",
            )
            .all();
        return {
            total: Number(row.total || 0),
            active: Number(row.active || 0),
            forgotten: Number(row.forgotten || 0),
            byType: Object.fromEntries(byType.map((item) => [item.type, item.count])),
            dbPath: this.dbPath,
        };
    }

    close() {
        this.db.close();
    }
}

function toRow(memory) {
    return {
        id: memory.id,
        type: memory.type,
        content: memory.content,
        summary: memory.summary,
        sourceKind: memory.source.kind,
        sourceLocator: memory.source.locator,
        sourceTitle: memory.source.title,
        scope: memory.scope,
        sensitivity: memory.sensitivity,
        confidence: memory.confidence,
        validFrom: memory.validFrom ?? null,
        validTo: memory.validTo ?? null,
        occurredAt: memory.occurredAt ?? null,
        tags: JSON.stringify(memory.tags),
        status: memory.status,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
    };
}

function fromRow(row) {
    return {
        id: row.id,
        type: row.type,
        content: row.content,
        summary: row.summary,
        source: {
            kind: row.source_kind,
            locator: row.source_locator,
            title: row.source_title,
        },
        scope: row.scope,
        sensitivity: row.sensitivity,
        confidence: row.confidence,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        occurredAt: row.occurred_at,
        tags: JSON.parse(row.tags || '[]'),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        forgottenAt: row.forgotten_at,
    };
}

function toFtsQuery(value) {
    const tokens = String(value || '')
        .normalize('NFKC')
        .match(/[\p{L}\p{N}_-]+/gu)
        ?.slice(0, 20);
    return tokens?.length
        ? tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(' OR ')
        : '';
}

function renderMemory(memory) {
    const date = memory.occurredAt || memory.validFrom || memory.createdAt;
    const source = memory.source.title || memory.source.locator || memory.source.kind;
    return `[${memory.type} | ${memory.scope} | ${date}] ${memory.content}\nSource: ${source} · confidence ${memory.confidence}`;
}

function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(Math.max(Math.trunc(number), min), max);
}
