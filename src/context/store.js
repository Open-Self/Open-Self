import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeMemory } from './schema.js';
import { cosineSimilarity, LocalVectorEncoder } from './vectors.js';

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
        this.vectorEncoder = options.vectorEncoder || new LocalVectorEncoder();
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
        this._backfillVectors();
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

            CREATE TABLE IF NOT EXISTS import_items (
                dedupe_key TEXT PRIMARY KEY,
                memory_id TEXT NOT NULL REFERENCES memories(id),
                imported_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_import_items_memory_id
                ON import_items(memory_id);

            CREATE TABLE IF NOT EXISTS memory_vectors (
                memory_id TEXT PRIMARY KEY REFERENCES memories(id),
                vector TEXT NOT NULL,
                model TEXT NOT NULL,
                updated_at TEXT NOT NULL
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
            insertVector: this.db.prepare(`
                INSERT OR REPLACE INTO memory_vectors (memory_id, vector, model, updated_at)
                VALUES (?, ?, ?, ?)
            `),
            get: this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM memories WHERE id = ?`),
            forget: this.db.prepare(`
                UPDATE memories
                SET status = 'forgotten', forgotten_at = @now, updated_at = @now
                WHERE id = @id AND status = 'active'
            `),
            deleteFts: this.db.prepare('DELETE FROM memory_fts WHERE id = ?'),
            getImport: this.db.prepare('SELECT memory_id FROM import_items WHERE dedupe_key = ?'),
            insertImport: this.db.prepare(
                'INSERT INTO import_items (dedupe_key, memory_id, imported_at) VALUES (?, ?, ?)',
            ),
            stats: this.db.prepare(`
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN status = 'forgotten' THEN 1 ELSE 0 END) AS forgotten,
                    (SELECT COUNT(*) FROM memory_vectors) AS vectors
                FROM memories
            `),
        };

        this._writeMemory = (memory) => {
            this.statements.insert.run(toRow(memory));
            this.statements.insertFts.run(
                memory.id,
                memory.content,
                memory.summary,
                memory.tags.join(' '),
            );
            this._writeVector(memory);
        };

        this._insertTransaction = this.db.transaction((memory) => this._writeMemory(memory));

        this._insertOnceTransaction = this.db.transaction((memory, dedupeKey) => {
            const existing = this.statements.getImport.get(dedupeKey);
            if (existing) {
                return {
                    memory: this.get(existing.memory_id, { includeForgotten: true }),
                    created: false,
                };
            }

            this._writeMemory(memory);
            this.statements.insertImport.run(dedupeKey, memory.id, memory.createdAt);
            return { memory, created: true };
        });

        this._forgetTransaction = this.db.transaction((id, now) => {
            const result = this.statements.forget.run({ id, now });
            if (result.changes > 0) this.statements.deleteFts.run(id);
            return result.changes > 0;
        });
    }

    _writeVector(memory) {
        const text = `${memory.content}\n${memory.summary}\n${memory.tags.join(' ')}`;
        const vector = this.vectorEncoder.encode(text);
        this.statements.insertVector.run(
            memory.id,
            JSON.stringify(vector),
            this.vectorEncoder.model,
            memory.updatedAt,
        );
    }

    _backfillVectors() {
        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS}
                 FROM memories
                 LEFT JOIN memory_vectors ON memory_vectors.memory_id = memories.id
                 WHERE memory_vectors.memory_id IS NULL OR memory_vectors.model != ?`,
            )
            .all(this.vectorEncoder.model);
        if (!rows.length) return;
        this.db.transaction((items) => {
            for (const row of items) this._writeVector(fromRow(row));
        })(rows);
    }

    remember(input) {
        const memory = normalizeMemory(input);
        this._insertTransaction(memory);
        return memory;
    }

    rememberOnce(input, dedupeKey) {
        if (!dedupeKey || typeof dedupeKey !== 'string') {
            throw new Error('A non-empty dedupe key is required');
        }
        const memory = normalizeMemory(input);
        return this._insertOnceTransaction(memory, dedupeKey);
    }

    get(id, options = {}) {
        const row = this.statements.get.get(id);
        if (!row || (!options.includeForgotten && row.status !== 'active')) return null;
        return fromRow(row);
    }

    search(query, options = {}) {
        const limit = clamp(options.limit ?? 10, 1, 100);
        const ftsQuery = toFtsQuery(query);
        if (!ftsQuery) return this.list({ ...options, limit });

        const retrieval = options.retrieval || 'hybrid';
        if (!['hybrid', 'lexical', 'vector'].includes(retrieval)) {
            throw new Error('retrieval must be hybrid, lexical, or vector');
        }

        const candidateLimit = clamp(Math.max(limit * 5, 20), 20, 500);
        const lexical =
            retrieval === 'vector'
                ? []
                : this._searchLexical(ftsQuery, { ...options, limit: candidateLimit });
        const vector =
            retrieval === 'lexical'
                ? []
                : this._searchVector(query, { ...options, limit: candidateLimit });

        return fuseRankings(lexical, vector, limit);
    }

    _searchLexical(ftsQuery, options) {
        const params = searchParams(options);

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
            .all({ ...params, query: ftsQuery });

        return rows.map((row) => ({
            ...fromRow(row),
            lexicalScore: 1 / (1 + Math.abs(row.rank)),
        }));
    }

    _searchVector(query, options) {
        const params = searchParams({
            ...options,
            limit: clamp(options.vectorCandidateLimit || 5_000, 100, 20_000),
        });
        const queryVector = this.vectorEncoder.encode(query);
        const minimum = options.minVectorScore ?? 0.08;
        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS}, memory_vectors.vector
                 FROM memories
                 JOIN memory_vectors ON memory_vectors.memory_id = memories.id
                 WHERE memories.status = 'active'
                   AND (@scope IS NULL OR memories.scope = @scope OR memories.scope LIKE @scopePrefix)
                   AND (@type IS NULL OR memories.type = @type)
                   AND CASE memories.sensitivity
                       WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                       WHEN 'private' THEN 2 ELSE 3 END <= @sensitivityRank
                   AND (memories.valid_from IS NULL OR memories.valid_from <= @asOf)
                   AND (memories.valid_to IS NULL OR memories.valid_to >= @asOf)
                 ORDER BY COALESCE(memories.occurred_at, memories.created_at) DESC
                 LIMIT @limit`,
            )
            .all(params);

        return rows
            .map((row) => {
                const storedVector = parseStoredVector(row.vector);
                if (!storedVector) return null;
                return {
                    ...fromRow(row),
                    vectorScore: cosineSimilarity(queryVector, storedVector),
                };
            })
            .filter(Boolean)
            .filter((memory) => memory.vectorScore >= minimum)
            .sort((left, right) => {
                if (right.vectorScore !== left.vectorScore) {
                    return right.vectorScore - left.vectorScore;
                }
                return right.confidence - left.confidence;
            })
            .slice(0, options.limit);
    }

    findPotentialConflicts(input, options = {}) {
        const memory = normalizeMemory(input);
        if (!['fact', 'preference', 'decision'].includes(memory.type)) return [];

        const threshold = options.threshold ?? 0.28;
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
            throw new Error('conflict threshold must be between 0 and 1');
        }
        return this.search(memory.content, {
            scope: memory.scope,
            type: memory.type,
            maxSensitivity: 'restricted',
            retrieval: 'vector',
            minVectorScore: threshold,
            asOf: memory.validFrom || memory.occurredAt || new Date().toISOString(),
            limit: options.limit || 10,
        })
            .filter(
                (candidate) =>
                    candidate.scope === memory.scope &&
                    candidate.content !== memory.content &&
                    validityOverlaps(memory, candidate),
            )
            .map((candidate) => ({
                ...candidate,
                similarity: candidate.match.vectorSimilarity,
                reason: 'Same type and scope with overlapping validity',
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
            vectors: Number(row.vectors || 0),
            vectorModel: this.vectorEncoder.model,
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

function searchParams(options) {
    const scope = options.scope || null;
    const sensitivity = options.maxSensitivity || 'restricted';
    const sensitivityRank = ['public', 'personal', 'private', 'restricted'].indexOf(sensitivity);
    if (sensitivityRank < 0) {
        throw new Error('maxSensitivity must be public, personal, private, or restricted');
    }
    return {
        scope,
        scopePrefix: scope ? `${scope}/%` : null,
        type: options.type || null,
        sensitivityRank,
        asOf: options.asOf || new Date().toISOString(),
        limit: clamp(options.limit ?? 10, 1, 20_000),
    };
}

function parseStoredVector(value) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function fuseRankings(lexical, vector, limit) {
    const fused = new Map();
    const add = (memory, rank, kind) => {
        const current = fused.get(memory.id) || {
            memory,
            score: 0,
            lexicalRank: null,
            vectorRank: null,
            vectorSimilarity: null,
        };
        current.score += 1 / (60 + rank);
        if (kind === 'lexical') current.lexicalRank = rank;
        if (kind === 'vector') {
            current.vectorRank = rank;
            current.vectorSimilarity = Number(memory.vectorScore.toFixed(4));
        }
        fused.set(memory.id, current);
    };

    lexical.forEach((memory, index) => add(memory, index + 1, 'lexical'));
    vector.forEach((memory, index) => add(memory, index + 1, 'vector'));
    const ranked = [...fused.values()].sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.memory.confidence - left.memory.confidence;
    });
    const maxScore = ranked[0]?.score || 1;

    return ranked.slice(0, limit).map((item) => {
        const { lexicalScore: _lexicalScore, vectorScore: _vectorScore, ...memory } = item.memory;
        return {
            ...memory,
            relevance: Number((item.score / maxScore).toFixed(4)),
            match: {
                lexicalRank: item.lexicalRank,
                vectorRank: item.vectorRank,
                vectorSimilarity: item.vectorSimilarity,
            },
        };
    });
}

function validityOverlaps(left, right) {
    const leftStart = left.validFrom || '0000-01-01T00:00:00.000Z';
    const leftEnd = left.validTo || '9999-12-31T23:59:59.999Z';
    const rightStart = right.validFrom || '0000-01-01T00:00:00.000Z';
    const rightEnd = right.validTo || '9999-12-31T23:59:59.999Z';
    return leftStart <= rightEnd && rightStart <= leftEnd;
}

function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(Math.max(Math.trunc(number), min), max);
}
