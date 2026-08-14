import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeMemory } from './schema.js';
import { cosineSimilarity, LocalVectorEncoder } from './vectors.js';
import { PlaintextCodec, VaultCodec } from './vault-crypto.js';
import { loadConfiguredVaultKey } from './vault-key-manager.js';

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
        const vaultDirectory =
            options.dataDir || (this.dbPath === ':memory:' ? null : dirname(this.dbPath));
        const encryptionKey =
            options.encryptionKey ||
            process.env.OPENSELF_VAULT_KEY ||
            (vaultDirectory ? loadConfiguredVaultKey(vaultDirectory) : null);
        this.codec = encryptionKey ? new VaultCodec(encryptionKey) : new PlaintextCodec();
        this.encryptionEnabled = this.codec.enabled;
        if (this.dbPath !== ':memory:' && !existsSync(dirname(this.dbPath))) {
            mkdirSync(dirname(this.dbPath), { recursive: true });
        }

        this.db = new Database(this.dbPath);
        try {
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('busy_timeout = 5000');
            this._migrate();
            this._assertEncryptionMode();
            this._prepare();
            this._migrateEncryption();
            this._backfillVectors();
            this._backfillVersions();
        } catch (error) {
            this.db.close();
            throw error;
        }
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

            CREATE TABLE IF NOT EXISTS memory_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                memory_id TEXT NOT NULL REFERENCES memories(id),
                version INTEGER NOT NULL,
                change_kind TEXT NOT NULL,
                snapshot TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                UNIQUE(memory_id, version)
            );

            CREATE INDEX IF NOT EXISTS idx_memory_versions_memory_id
                ON memory_versions(memory_id, version DESC);

            CREATE TABLE IF NOT EXISTS vault_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);
    }

    _assertEncryptionMode() {
        const marker = this.db
            .prepare("SELECT value FROM vault_metadata WHERE key = 'payload_encryption'")
            .get()?.value;
        if (marker === 'aes-256-gcm-v1' && !this.codec.enabled) {
            throw new Error(
                'This Context Vault is encrypted, but its OS-bound key is not configured or available',
            );
        }
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
            update: this.db.prepare(`
                UPDATE memories SET
                    type = @type, content = @content, summary = @summary,
                    source_kind = @sourceKind, source_locator = @sourceLocator,
                    source_title = @sourceTitle, scope = @scope,
                    sensitivity = @sensitivity, confidence = @confidence,
                    valid_from = @validFrom, valid_to = @validTo,
                    occurred_at = @occurredAt, tags = @tags,
                    updated_at = @updatedAt
                WHERE id = @id AND status = 'active'
            `),
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
            nextVersion: this.db.prepare(
                'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM memory_versions WHERE memory_id = ?',
            ),
            insertVersion: this.db.prepare(`
                INSERT INTO memory_versions (memory_id, version, change_kind, snapshot, changed_at)
                VALUES (?, ?, ?, ?, ?)
            `),
            history: this.db.prepare(`
                SELECT version, change_kind, snapshot, changed_at
                FROM memory_versions WHERE memory_id = ? ORDER BY version DESC
            `),
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
            this.statements.insert.run(toRow(memory, this.codec));
            this._writeFts(memory);
            this._writeVector(memory);
            this._recordVersion(memory, 'created');
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

        this._updateTransaction = this.db.transaction((memory, changeKind) => {
            const result = this.statements.update.run(toRow(memory, this.codec));
            if (result.changes === 0) return null;
            this.statements.deleteFts.run(memory.id);
            this._writeFts(memory);
            this._writeVector(memory);
            this._recordVersion(memory, changeKind);
            return memory;
        });

        this._forgetTransaction = this.db.transaction((id, now, changeKind = 'forgotten') => {
            const result = this.statements.forget.run({ id, now });
            if (result.changes > 0) {
                this.statements.deleteFts.run(id);
                const memory = this.get(id, { includeForgotten: true });
                this._recordVersion(memory, changeKind);
            }
            return result.changes > 0;
        });

        this._mergeTransaction = this.db.transaction((primaryId, duplicateIds, changes) => {
            const primary = this.get(primaryId);
            if (!primary) throw new Error(`Primary memory not found: ${primaryId}`);
            const duplicates = duplicateIds.map((id) => {
                if (id === primaryId) throw new Error('A memory cannot be merged into itself');
                const memory = this.get(id);
                if (!memory) throw new Error(`Duplicate memory not found: ${id}`);
                return memory;
            });
            const tags = [
                ...new Set([
                    ...primary.tags,
                    ...duplicates.flatMap((item) => item.tags),
                    ...(changes.tags || []),
                ]),
            ];
            const memory = this._updateMemory(primary, { ...changes, tags }, 'merged');
            const now = new Date().toISOString();
            for (const duplicate of duplicates) {
                this._forgetTransaction(duplicate.id, now, `merged_into:${primaryId}`);
            }
            return { memory, mergedIds: duplicates.map((item) => item.id) };
        });
    }

    _migrateEncryption() {
        if (!this.codec.enabled) return;
        const marker = this.db
            .prepare("SELECT value FROM vault_metadata WHERE key = 'payload_encryption'")
            .get()?.value;
        if (marker === 'aes-256-gcm-v1') {
            const sample = this.db.prepare('SELECT content FROM memories LIMIT 1').get();
            if (sample) this.codec.decode(sample.content, 'content');
            return;
        }

        const plaintextCodec = new PlaintextCodec();
        const memories = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM memories`).all();
        const vectors = this.db.prepare('SELECT memory_id, vector FROM memory_vectors').all();
        const versions = this.db.prepare('SELECT id, snapshot FROM memory_versions').all();
        const migrateMemory = this.db.prepare(`
            UPDATE memories SET
                type = @type, content = @content, summary = @summary,
                source_kind = @sourceKind, source_locator = @sourceLocator,
                source_title = @sourceTitle, scope = @scope,
                sensitivity = @sensitivity, confidence = @confidence,
                valid_from = @validFrom, valid_to = @validTo,
                occurred_at = @occurredAt, tags = @tags,
                updated_at = @updatedAt
            WHERE id = @id
        `);
        const updateVector = this.db.prepare(
            'UPDATE memory_vectors SET vector = ? WHERE memory_id = ?',
        );
        const updateVersion = this.db.prepare(
            'UPDATE memory_versions SET snapshot = ? WHERE id = ?',
        );
        const setMarker = this.db.prepare(
            "INSERT OR REPLACE INTO vault_metadata (key, value) VALUES ('payload_encryption', 'aes-256-gcm-v1')",
        );

        this.db.transaction(() => {
            this.db.prepare('DELETE FROM memory_fts').run();
            for (const row of memories) {
                const sourceCodec = this.codec.isEncrypted(row.content)
                    ? this.codec
                    : plaintextCodec;
                const memory = fromRow(row, sourceCodec);
                migrateMemory.run(toRow(memory, this.codec));
                if (memory.status === 'active') this._writeFts(memory);
            }
            for (const row of vectors) {
                if (!this.codec.isEncrypted(row.vector)) {
                    updateVector.run(this.codec.encode(row.vector, 'vector'), row.memory_id);
                }
            }
            for (const row of versions) {
                if (!this.codec.isEncrypted(row.snapshot)) {
                    updateVersion.run(this.codec.encode(row.snapshot, 'version'), row.id);
                }
            }
            setMarker.run();
        })();
    }

    _writeFts(memory) {
        this.statements.insertFts.run(
            memory.id,
            this.codec.indexText(memory.content),
            this.codec.indexText(memory.summary),
            this.codec.indexText(memory.tags.join(' ')),
        );
    }

    _writeVector(memory) {
        const text = `${memory.content}\n${memory.summary}\n${memory.tags.join(' ')}`;
        const vector = this.vectorEncoder.encode(text);
        this.statements.insertVector.run(
            memory.id,
            this.codec.encode(JSON.stringify(vector), 'vector'),
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
            for (const row of items) this._writeVector(fromRow(row, this.codec));
        })(rows);
    }

    _backfillVersions() {
        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS}
                 FROM memories
                 LEFT JOIN memory_versions ON memory_versions.memory_id = memories.id
                 WHERE memory_versions.memory_id IS NULL`,
            )
            .all();
        if (!rows.length) return;
        this.db.transaction((items) => {
            for (const row of items) this._recordVersion(fromRow(row, this.codec), 'baseline');
        })(rows);
    }

    _recordVersion(memory, changeKind) {
        const { version } = this.statements.nextVersion.get(memory.id);
        this.statements.insertVersion.run(
            memory.id,
            version,
            changeKind,
            this.codec.encode(JSON.stringify(memory), 'version'),
            memory.updatedAt,
        );
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

    update(id, changes) {
        const existing = this.get(id);
        if (!existing) return null;
        return this._updateMemory(existing, changes, 'updated');
    }

    _updateMemory(existing, changes = {}, changeKind = 'updated') {
        const normalized = normalizeMemory({
            ...existing,
            ...changes,
            id: existing.id,
            source: { ...existing.source, ...(changes.source || {}) },
        });
        const memory = {
            ...normalized,
            status: 'active',
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
        };
        return this._updateTransaction(memory, changeKind);
    }

    history(id) {
        return this.statements.history.all(id).map((row) => ({
            version: row.version,
            changeKind: row.change_kind,
            changedAt: row.changed_at,
            snapshot: JSON.parse(this.codec.decode(row.snapshot, 'version')),
        }));
    }

    merge(primaryId, duplicateIds, changes = {}) {
        const ids = [...new Set(duplicateIds || [])];
        if (!ids.length) throw new Error('At least one duplicate memory ID is required');
        return this._mergeTransaction(primaryId, ids, changes);
    }

    get(id, options = {}) {
        const row = this.statements.get.get(id);
        if (!row || (!options.includeForgotten && row.status !== 'active')) return null;
        return fromRow(row, this.codec);
    }

    search(query, options = {}) {
        const limit = clamp(options.limit ?? 10, 1, 100);
        const ftsQuery = this.codec.indexQuery(query);
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
            ...fromRow(row, this.codec),
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
                const storedVector = parseStoredVector(this.codec.decode(row.vector, 'vector'));
                if (!storedVector) return null;
                return {
                    ...fromRow(row, this.codec),
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
        const excludeIds = new Set(options.excludeIds || []);
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
                    !excludeIds.has(candidate.id) &&
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
        return rows.map((row) => fromRow(row, this.codec));
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
            encrypted: this.encryptionEnabled,
            byType: Object.fromEntries(byType.map((item) => [item.type, item.count])),
            dbPath: this.dbPath,
        };
    }

    close() {
        this.db.close();
    }
}

function toRow(memory, codec) {
    return {
        id: memory.id,
        type: memory.type,
        content: codec.encode(memory.content, 'content'),
        summary: codec.encode(memory.summary, 'summary'),
        sourceKind: codec.encode(memory.source.kind, 'source-kind'),
        sourceLocator: codec.encode(memory.source.locator, 'source-locator'),
        sourceTitle: codec.encode(memory.source.title, 'source-title'),
        scope: memory.scope,
        sensitivity: memory.sensitivity,
        confidence: memory.confidence,
        validFrom: memory.validFrom ?? null,
        validTo: memory.validTo ?? null,
        occurredAt: memory.occurredAt ?? null,
        tags: codec.encode(JSON.stringify(memory.tags), 'tags'),
        status: memory.status,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
    };
}

function fromRow(row, codec) {
    return {
        id: row.id,
        type: row.type,
        content: codec.decode(row.content, 'content'),
        summary: codec.decode(row.summary, 'summary'),
        source: {
            kind: codec.decode(row.source_kind, 'source-kind'),
            locator: codec.decode(row.source_locator, 'source-locator'),
            title: codec.decode(row.source_title, 'source-title'),
        },
        scope: row.scope,
        sensitivity: row.sensitivity,
        confidence: row.confidence,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        occurredAt: row.occurred_at,
        tags: JSON.parse(codec.decode(row.tags || '[]', 'tags')),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        forgottenAt: row.forgotten_at,
    };
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
