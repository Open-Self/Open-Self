import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
    contextDateSchema,
    memoryContentHash,
    normalizeMemory,
    SOURCE_TRUST_LEVELS,
} from './schema.js';
import { cosineSimilarity } from './vectors.js';
import { resolveVectorProvider } from './embeddings.js';
import { PlaintextCodec, VaultCodec } from './vault-crypto.js';
import { loadConfiguredVaultKey } from './vault-key-manager.js';
import { loadSigningIdentity } from './signing.js';
import { ContextCompiler } from './compiler.js';
import {
    addAlias,
    addEdge,
    edgesFor,
    ensureEntity,
    entitiesForMemory,
    findEntity,
    linkMemoryEntity,
    listEntities,
    memoriesForEntity,
    mergeEntities,
    removeEdge,
    supersedeMemory,
    supersededIds,
    timeline,
    unlinkMemoryEntity,
    unsupersedeMemory,
} from './graph.js';

export const VAULT_SCHEMA_VERSION = 4;

const SELECT_COLUMNS = `
    memories.id, memories.type, memories.content, memories.summary,
    memories.source_kind, memories.source_locator, memories.source_title,
    memories.scope, memories.sensitivity, memories.confidence, memories.source_trust,
    memories.valid_from, memories.valid_to, memories.occurred_at,
    memories.tags, memories.status, memories.created_at, memories.updated_at,
    memories.forgotten_at, memories.superseded_at, memories.superseded_by
`;

const PROPOSAL_SELECT_COLUMNS = `
    id, payload, status, proposed_by, note, proposed_at, reviewed_at, review_note, memory_id
`;

export class ContextStore {
    constructor(options = {}) {
        const dataDir = options.dataDir || './data';
        this.vectorProvider = resolveStoreVectorProvider(options);
        this.vectorSync = typeof this.vectorProvider.encodeSync === 'function';
        // Back-compat shim: legacy vectorEncoder injections stay synchronous.
        this.vectorEncoder = {
            model: this.vectorProvider.model,
            encode: (text) => {
                if (!this.vectorSync) {
                    throw new Error(
                        'The configured embeddings provider is async — use searchAsync() or indexPending()',
                    );
                }
                return this.vectorProvider.encodeSync(text);
            },
        };
        this.dbPath = Buffer.isBuffer(options.dbPath)
            ? ':memory:'
            : options.dbPath || join(dataDir, 'context.db');
        const vaultDirectory =
            options.dataDir || (this.dbPath === ':memory:' ? null : dirname(this.dbPath));
        this.dataDir = vaultDirectory;
        const encryptionKey =
            options.encryptionKey ||
            process.env.OPENSELF_VAULT_KEY ||
            (vaultDirectory ? loadConfiguredVaultKey(vaultDirectory) : null);
        this.codec = encryptionKey ? new VaultCodec(encryptionKey) : new PlaintextCodec();
        this.encryptionEnabled = this.codec.enabled;
        if (this.dbPath !== ':memory:' && !existsSync(dirname(this.dbPath))) {
            mkdirSync(dirname(this.dbPath), { recursive: true });
        }

        // Remote embedding providers never receive `restricted` content:
        // indexing is capped one level below it. Local providers (or an
        // explicit owner override) keep full-sensitivity recall.
        this.indexMaxSensitivity =
            options.embeddingIndexMaxSensitivity ||
            (this.vectorProvider.locality === 'local' ? 'restricted' : 'private');
        this.db = new Database(Buffer.isBuffer(options.dbPath) ? options.dbPath : this.dbPath);
        try {
            if (this.db.pragma('user_version', { simple: true }) > VAULT_SCHEMA_VERSION) {
                throw new Error('This vault requires a newer OpenSelf schema version');
            }
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('busy_timeout = 5000');
            this.db.transaction(() => this._migrate())();
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
                source_trust TEXT NOT NULL DEFAULT 'owner',
                valid_from TEXT,
                valid_to TEXT,
                occurred_at TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'forgotten')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                forgotten_at TEXT,
                superseded_at TEXT,
                superseded_by TEXT
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

            CREATE TABLE IF NOT EXISTS capture_checkpoints (
                checkpoint_key TEXT PRIMARY KEY,
                snapshot TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memory_proposals (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'approved', 'rejected')),
                proposed_by TEXT NOT NULL DEFAULT 'unknown',
                note TEXT NOT NULL DEFAULT '',
                proposed_at TEXT NOT NULL,
                reviewed_at TEXT,
                review_note TEXT NOT NULL DEFAULT '',
                memory_id TEXT REFERENCES memories(id)
            );

            CREATE INDEX IF NOT EXISTS idx_memory_proposals_status
                ON memory_proposals(status, proposed_at);

            CREATE TABLE IF NOT EXISTS memory_edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL,
                predicate TEXT NOT NULL,
                object TEXT NOT NULL,
                source_kind TEXT NOT NULL DEFAULT 'owner',
                confidence REAL NOT NULL DEFAULT 1 CHECK(confidence >= 0 AND confidence <= 1),
                created_at TEXT NOT NULL,
                UNIQUE(subject, predicate, object)
            );

            CREATE INDEX IF NOT EXISTS idx_memory_edges_subject
                ON memory_edges(subject, predicate);
            CREATE INDEX IF NOT EXISTS idx_memory_edges_object
                ON memory_edges(object, predicate);

            CREATE TABLE IF NOT EXISTS entities (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'thing',
                canonical TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'personal',
                merged_into TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS entity_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id TEXT NOT NULL REFERENCES entities(id),
                alias TEXT NOT NULL COLLATE NOCASE,
                created_at TEXT NOT NULL,
                UNIQUE(alias)
            );

            CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity
                ON entity_aliases(entity_id);

            CREATE TABLE IF NOT EXISTS memory_entities (
                memory_id TEXT NOT NULL REFERENCES memories(id),
                entity_id TEXT NOT NULL REFERENCES entities(id),
                role TEXT NOT NULL DEFAULT 'mentions',
                PRIMARY KEY (memory_id, entity_id, role)
            );

            CREATE INDEX IF NOT EXISTS idx_memory_entities_entity
                ON memory_entities(entity_id);
        `);
        // v2 -> v3: source trust column + proposal inbox. Existing owner vaults
        // were written without untrusted-agent separation, so their rows keep
        // the owner default. Imported/agent-written trust is assigned at write
        // time from here on.
        const memoryColumns = this.db
            .prepare("SELECT name FROM pragma_table_info('memories')")
            .all()
            .map((column) => column.name);
        if (!memoryColumns.includes('source_trust')) {
            this.db.exec(
                "ALTER TABLE memories ADD COLUMN source_trust TEXT NOT NULL DEFAULT 'owner'",
            );
        }
        // v3 -> v4: supersession columns. Supersession is a lifecycle dimension
        // separate from `status` — a superseded memory stays retrievable for
        // historical queries, unlike a forgotten one.
        if (!memoryColumns.includes('superseded_at')) {
            this.db.exec('ALTER TABLE memories ADD COLUMN superseded_at TEXT');
        }
        if (!memoryColumns.includes('superseded_by')) {
            this.db.exec('ALTER TABLE memories ADD COLUMN superseded_by TEXT');
        }
        if (this.db.pragma('user_version', { simple: true }) !== VAULT_SCHEMA_VERSION) {
            this.db.pragma(`user_version = ${VAULT_SCHEMA_VERSION}`);
        }
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
        // Use the same millisecond clock as input validation, including historical
        // offset/fraction spellings. Stored strings and history remain untouched.
        this.db.function('context_timestamp', { deterministic: true }, (value) => {
            const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
            return Number.isFinite(timestamp) ? timestamp : null;
        });
        this.statements = {
            insert: this.db.prepare(`
                INSERT INTO memories (
                    id, type, content, summary, source_kind, source_locator, source_title,
                    scope, sensitivity, confidence, source_trust, valid_from, valid_to,
                    occurred_at, tags, status, created_at, updated_at
                ) VALUES (
                    @id, @type, @content, @summary, @sourceKind, @sourceLocator, @sourceTitle,
                    @scope, @sensitivity, @confidence, @sourceTrust, @validFrom, @validTo,
                    @occurredAt, @tags, @status, @createdAt, @updatedAt
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
                    source_trust = @sourceTrust,
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
            proposalStats: this.db.prepare(`
                SELECT status, COUNT(*) AS count FROM memory_proposals GROUP BY status
            `),
            insertProposal: this.db.prepare(`
                INSERT INTO memory_proposals (
                    id, payload, status, proposed_by, note, proposed_at
                ) VALUES (?, ?, 'pending', ?, ?, ?)
            `),
            getProposal: this.db.prepare(
                `SELECT ${PROPOSAL_SELECT_COLUMNS} FROM memory_proposals WHERE id = ?`,
            ),
            listProposals: this.db.prepare(`
                SELECT ${PROPOSAL_SELECT_COLUMNS} FROM memory_proposals
                WHERE (@status IS NULL OR status = @status)
                  AND (@proposedBy IS NULL OR proposed_by = @proposedBy)
                ORDER BY proposed_at DESC
                LIMIT @limit OFFSET @offset
            `),
            resolveProposal: this.db.prepare(`
                UPDATE memory_proposals
                SET status = @status, reviewed_at = @reviewedAt,
                    review_note = @reviewNote, memory_id = @memoryId
                WHERE id = @id AND status = 'pending'
            `),
        };

        this._writeMemory = (memory) => {
            this.statements.insert.run(toRow(memory, this.codec));
            this._writeFts(memory);
            this._writeVector(memory);
            this._recordVersion(memory, 'created');
            this._contentHashes = null;
        };

        this._insertTransaction = this.db.transaction((memory) => this._writeMemory(memory));

        this._insertOnceTransaction = this.db.transaction((memory, dedupeKey, dedupeByContent) => {
            const existing = this.statements.getImport.get(dedupeKey);
            if (existing) {
                return {
                    memory: this.get(existing.memory_id, { includeForgotten: true }),
                    created: false,
                    duplicateReason: 'dedupe-key',
                };
            }
            if (dedupeByContent) {
                const contentMatch = this._contentHashIndex().get(
                    memoryContentHash(memory.content),
                );
                if (contentMatch) {
                    this.statements.insertImport.run(dedupeKey, contentMatch, memory.createdAt);
                    return {
                        memory: this.get(contentMatch, { includeForgotten: true }),
                        created: false,
                        duplicateReason: 'content',
                    };
                }
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
            this._contentHashes = null;
            return memory;
        });

        this._forgetTransaction = this.db.transaction((id, now, changeKind = 'forgotten') => {
            const result = this.statements.forget.run({ id, now });
            if (result.changes > 0) {
                this.statements.deleteFts.run(id);
                const memory = this.get(id, { includeForgotten: true });
                this._recordVersion(memory, changeKind);
                this._contentHashes = null;
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

        this._approveProposalTransaction = this.db.transaction(
            (proposal, memory, reviewNote, reviewedAt) => {
                this._writeMemory(memory);
                this.statements.resolveProposal.run({
                    id: proposal.id,
                    status: 'approved',
                    reviewedAt,
                    reviewNote,
                    memoryId: memory.id,
                });
                return memory;
            },
        );
    }

    _migrateEncryption() {
        if (!this.codec.enabled) return;
        const marker = this.db
            .prepare("SELECT value FROM vault_metadata WHERE key = 'payload_encryption'")
            .get()?.value;
        if (marker === 'aes-256-gcm-v1') {
            const sample = this.db.prepare('SELECT content FROM memories LIMIT 1').get();
            if (sample) this.codec.decode(sample.content, 'content');
            const checkpoint = this.db
                .prepare('SELECT snapshot FROM capture_checkpoints LIMIT 1')
                .get();
            if (checkpoint) this.codec.decode(checkpoint.snapshot, 'capture-state');
            return;
        }

        const plaintextCodec = new PlaintextCodec();
        const memories = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM memories`).all();
        const vectors = this.db.prepare('SELECT memory_id, vector FROM memory_vectors').all();
        const versions = this.db.prepare('SELECT id, snapshot FROM memory_versions').all();
        const checkpoints = this.db
            .prepare('SELECT checkpoint_key, snapshot FROM capture_checkpoints')
            .all();
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
            for (const row of checkpoints) {
                this.db
                    .prepare('UPDATE capture_checkpoints SET snapshot = ? WHERE checkpoint_key = ?')
                    .run(this.codec.encode(row.snapshot, 'capture-state'), row.checkpoint_key);
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

    _indexable(memory) {
        return (
            memory.status === 'active' &&
            sensitivityRank(memory.sensitivity) <= sensitivityRank(this.indexMaxSensitivity)
        );
    }

    _writeVector(memory) {
        // Async providers index lazily via indexPending() — synchronous
        // mutation paths never block on a network embedding call.
        if (!this.vectorSync || !this._indexable(memory)) return;
        const vector = this.vectorEncoder.encode(vectorText(memory));
        this._insertVector(memory.id, vector, memory.updatedAt);
    }

    _insertVector(memoryId, vector, updatedAt) {
        this.statements.insertVector.run(
            memoryId,
            this.codec.encode(JSON.stringify(vector), 'vector'),
            this.vectorProvider.model,
            updatedAt || new Date().toISOString(),
        );
    }

    _pendingVectorRows(limit) {
        return this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS}
                 FROM memories
                 LEFT JOIN memory_vectors ON memory_vectors.memory_id = memories.id
                 WHERE (memory_vectors.memory_id IS NULL OR memory_vectors.model != @model)
                   AND memories.status = 'active'
                   AND CASE memories.sensitivity
                       WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                       WHEN 'private' THEN 2 ELSE 3 END <= @indexCap
                 ORDER BY memories.created_at ASC
                 LIMIT @limit`,
            )
            .all({
                model: this.vectorProvider.model,
                indexCap: sensitivityRank(this.indexMaxSensitivity),
                limit,
            });
    }

    _pendingVectorCount() {
        return Number(
            this.db
                .prepare(
                    `SELECT COUNT(*) AS count
                     FROM memories
                     LEFT JOIN memory_vectors ON memory_vectors.memory_id = memories.id
                     WHERE (memory_vectors.memory_id IS NULL OR memory_vectors.model != ?)
                       AND memories.status = 'active'
                       AND CASE memories.sensitivity
                           WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                           WHEN 'private' THEN 2 ELSE 3 END <= ?`,
                )
                .get(this.vectorProvider.model, sensitivityRank(this.indexMaxSensitivity)).count ||
                0,
        );
    }

    _backfillVectors() {
        if (!this.vectorSync) return;
        const rows = this._pendingVectorRows(100_000);
        if (!rows.length) return;
        this.db.transaction((items) => {
            for (const row of items) this._writeVector(fromRow(row, this.codec));
        })(rows);
    }

    /**
     * Drain pending embeddings through the configured provider. Synchronous
     * providers index eagerly so this is a no-op for them; async providers
     * (ollama, openai-compatible) batch-encode here. Called automatically after
     * MCP mutations and by `openself index`.
     */
    async indexPending(options = {}) {
        const limit = clamp(options.limit ?? 500, 1, 10_000);
        const rows = this._pendingVectorRows(limit);
        if (!rows.length) {
            return { model: this.vectorProvider.model, indexed: 0, pending: 0 };
        }
        const memories = rows.map((row) => fromRow(row, this.codec));
        const texts = memories.map(vectorText);
        const vectors = this.vectorProvider.batchEncode
            ? await this.vectorProvider.batchEncode(texts)
            : await Promise.all(texts.map((text) => this.vectorProvider.encode(text)));
        this.db.transaction(() => {
            memories.forEach((memory, index) =>
                this._insertVector(memory.id, vectors[index], memory.updatedAt),
            );
        })();
        return {
            model: this.vectorProvider.model,
            indexed: memories.length,
            pending: this._pendingVectorCount(),
        };
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

    proposeMemory(input, options = {}) {
        const memory = normalizeMemory(input);
        const proposal = {
            id: memory.id,
            memory,
            status: 'pending',
            proposedBy: options.proposedBy || 'owner',
            note: typeof options.note === 'string' ? options.note.slice(0, 2_000) : '',
            proposedAt: memory.createdAt,
        };
        this.statements.insertProposal.run(
            proposal.id,
            this.codec.encode(JSON.stringify(memory), 'proposal'),
            proposal.proposedBy,
            proposal.note,
            proposal.proposedAt,
        );
        return proposal;
    }

    getProposal(id) {
        const row = this.statements.getProposal.get(id);
        return row ? proposalFromRow(row, this.codec) : null;
    }

    listProposals(options = {}) {
        const rows = this.statements.listProposals.all({
            status: options.status === undefined ? 'pending' : options.status,
            proposedBy: options.proposedBy || null,
            limit: clamp(options.limit ?? 50, 1, 500),
            offset: Math.max(0, Math.trunc(options.offset || 0)),
        });
        return rows.map((row) => proposalFromRow(row, this.codec));
    }

    approveProposal(id, overrides = {}, options = {}) {
        const proposal = this.getProposal(id);
        if (!proposal) return null;
        if (proposal.status !== 'pending') {
            throw new Error(`Proposal ${id} is already ${proposal.status}`);
        }
        const memory = normalizeMemory({
            ...proposal.memory,
            ...overrides,
            id: proposal.id,
            source: { ...proposal.memory.source, ...(overrides.source || {}) },
        });
        return this._approveProposalTransaction(
            proposal,
            memory,
            typeof options.reviewNote === 'string' ? options.reviewNote.slice(0, 2_000) : '',
            new Date().toISOString(),
        );
    }

    rejectProposal(id, options = {}) {
        const result = this.statements.resolveProposal.run({
            id,
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewNote:
                typeof options.reviewNote === 'string' ? options.reviewNote.slice(0, 2_000) : '',
            memoryId: null,
        });
        return result.changes > 0;
    }

    rememberOnce(input, dedupeKey, options = {}) {
        if (!dedupeKey || typeof dedupeKey !== 'string') {
            throw new Error('A non-empty dedupe key is required');
        }
        const memory = normalizeMemory(input);
        return this._insertOnceTransaction(memory, dedupeKey, Boolean(options.dedupeByContent));
    }

    /**
     * content-hash → active memory id, rebuilt lazily after writes. Used to
     * dedupe portable imports whose original ids do not exist in this vault.
     */
    _contentHashIndex() {
        if (!this._contentHashes) {
            this._contentHashes = new Map();
            const rows = this.db
                .prepare("SELECT id, content FROM memories WHERE status = 'active'")
                .all();
            for (const row of rows) {
                this._contentHashes.set(
                    memoryContentHash(this.codec.decode(row.content, 'content')),
                    row.id,
                );
            }
        }
        return this._contentHashes;
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

    /**
     * Lifecycle + context-graph delegates (implemented in graph.js — they run
     * inside this store's transactions and share its codec).
     */
    supersede(input, supersededId, options) {
        return supersedeMemory(this, input, supersededId, options);
    }
    unsupersede(id) {
        return unsupersedeMemory(this, id);
    }
    addEdge(subject, predicate, object, options) {
        return addEdge(this, subject, predicate, object, options);
    }
    removeEdge(subject, predicate, object) {
        return removeEdge(this, subject, predicate, object);
    }
    edges(id, options) {
        return edgesFor(this, id, options);
    }
    supersededIds(asOf) {
        return supersededIds(this, asOf);
    }
    ensureEntity(input) {
        return ensureEntity(this, input);
    }
    findEntity(nameOrId) {
        return findEntity(this, nameOrId);
    }
    listEntities(options) {
        return listEntities(this, options);
    }
    addEntityAlias(entityId, alias) {
        return addAlias(this, entityId, alias);
    }
    mergeEntities(primaryId, duplicateIds) {
        return mergeEntities(this, primaryId, duplicateIds);
    }
    linkEntity(memoryId, entityId, role) {
        return linkMemoryEntity(this, memoryId, entityId, role);
    }
    unlinkEntity(memoryId, entityId, role) {
        return unlinkMemoryEntity(this, memoryId, entityId, role);
    }
    entitiesForMemory(memoryId) {
        return entitiesForMemory(this, memoryId);
    }
    memoriesForEntity(entityId, options) {
        return memoriesForEntity(this, entityId, options);
    }
    timeline(options) {
        return timeline(this, options);
    }

    get(id, options = {}) {
        const row = this.statements.get.get(id);
        if (!row || (!options.includeForgotten && row.status !== 'active')) return null;
        return fromRow(row, this.codec);
    }

    search(query, options = {}) {
        options = {
            ...options,
            asOf: contextDateSchema.parse(
                options.asOf === undefined ? new Date().toISOString() : options.asOf,
            ),
        };
        const limit = clamp(options.limit ?? 10, 1, 100);
        const ftsQuery = this.codec.indexQuery(query);
        if (!ftsQuery)
            return this.list(noFtsListOptions(options, limit));

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
            retrieval === 'lexical' || !this.vectorSync
                ? []
                : this._searchVectorWith(this.vectorEncoder.encode(query), {
                      ...options,
                      limit: candidateLimit,
                  });

        return fuseRankings(lexical, vector, limit);
    }

    /**
     * Async-capable search — awaits the vector provider for the query
     * embedding. Synchronous providers take the same path as search().
     */
    async searchAsync(query, options = {}) {
        if (this.vectorSync) return this.search(query, options);
        options = {
            ...options,
            asOf: contextDateSchema.parse(
                options.asOf === undefined ? new Date().toISOString() : options.asOf,
            ),
        };
        const limit = clamp(options.limit ?? 10, 1, 100);
        const ftsQuery = this.codec.indexQuery(query);
        if (!ftsQuery) {
            return this.list(noFtsListOptions(options, limit));
        }
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
                : this._searchVectorWith(await this.vectorProvider.encode(query), {
                      ...options,
                      limit: candidateLimit,
                  });
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
                   AND (@scope IS NULL OR memories.scope = @scope OR substr(memories.scope, 1, length(@scope) + 1) = @scope || '/')
                   AND (@allowedScopes IS NULL OR EXISTS (SELECT 1 FROM json_each(@allowedScopes) AS permitted WHERE memories.scope = permitted.value OR substr(memories.scope, 1, length(permitted.value) + 1) = permitted.value || '/'))
                   AND ${DENIED_SCOPES_SQL}
                   AND (@type IS NULL OR memories.type = @type)
                   AND CASE memories.sensitivity
                       WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                       WHEN 'private' THEN 2 ELSE 3 END <= @sensitivityRank
                   AND ${TRUST_RANK_SQL} >= @minTrustRank
                   AND (@anyTime = 1 OR (memories.valid_from IS NULL OR context_timestamp(memories.valid_from) <= context_timestamp(@asOf)))
                   AND (@anyTime = 1 OR (memories.valid_to IS NULL OR context_timestamp(memories.valid_to) >= context_timestamp(@asOf)))
                 ORDER BY rank ASC, confidence DESC, context_timestamp(COALESCE(occurred_at, created_at)) DESC
                 LIMIT @limit`,
            )
            .all({ ...params, query: ftsQuery });

        return rows.map((row) => ({
            ...fromRow(row, this.codec),
            lexicalScore: 1 / (1 + Math.abs(row.rank)),
        }));
    }

    _searchVectorWith(queryVector, options) {
        const params = searchParams({
            ...options,
            limit: clamp(options.vectorCandidateLimit || 5_000, 100, 20_000),
        });
        const minimum = options.minVectorScore ?? 0.08;
        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS}, memory_vectors.vector
                 FROM memories
                 JOIN memory_vectors ON memory_vectors.memory_id = memories.id
                 WHERE memories.status = 'active'
                   AND (@scope IS NULL OR memories.scope = @scope OR substr(memories.scope, 1, length(@scope) + 1) = @scope || '/')
                   AND (@allowedScopes IS NULL OR EXISTS (SELECT 1 FROM json_each(@allowedScopes) AS permitted WHERE memories.scope = permitted.value OR substr(memories.scope, 1, length(permitted.value) + 1) = permitted.value || '/'))
                   AND ${DENIED_SCOPES_SQL}
                   AND (@type IS NULL OR memories.type = @type)
                   AND CASE memories.sensitivity
                       WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                       WHEN 'private' THEN 2 ELSE 3 END <= @sensitivityRank
                   AND ${TRUST_RANK_SQL} >= @minTrustRank
                   AND (@anyTime = 1 OR (memories.valid_from IS NULL OR context_timestamp(memories.valid_from) <= context_timestamp(@asOf)))
                   AND (@anyTime = 1 OR (memories.valid_to IS NULL OR context_timestamp(memories.valid_to) >= context_timestamp(@asOf)))
                 ORDER BY context_timestamp(COALESCE(memories.occurred_at, memories.created_at)) DESC
                 LIMIT @limit`,
            )
            .all(params);

        return this._scoreVectorRows(rows, queryVector, minimum, options.limit);
    }

    _scoreVectorRows(rows, queryVector, minimum, limit, excludedContent, maxCandidates = Infinity) {
        const candidates = [];
        let examined = 0;
        for (const row of rows) {
            const storedVector = parseStoredVector(this.codec.decode(row.vector, 'vector'));
            if (!storedVector) continue;
            const memory = fromRow(row, this.codec);
            if (memory.content === excludedContent) continue;
            const vectorScore = cosineSimilarity(queryVector, storedVector);
            if (vectorScore >= minimum) candidates.push({ ...memory, vectorScore });
            if (++examined >= maxCandidates) break;
        }
        return candidates
            .sort((left, right) => {
                if (right.vectorScore !== left.vectorScore) {
                    return right.vectorScore - left.vectorScore;
                }
                if (right.confidence !== left.confidence) {
                    return right.confidence - left.confidence;
                }
                return trustRank(right.sourceTrust) - trustRank(left.sourceTrust);
            })
            .slice(0, limit);
    }

    findPotentialConflicts(input, options = {}) {
        const memory = normalizeMemory(input);
        if (!['fact', 'preference', 'decision'].includes(memory.type)) return [];

        const threshold = options.threshold ?? 0.28;
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
            throw new Error('conflict threshold must be between 0 and 1');
        }
        if (!this.codec.indexQuery(memory.content)) return [];
        const limit = clamp(options.limit || 10, 1, 100);
        const rows = this._conflictRows(memory, options);
        if (!this.vectorSync) {
            return this._rankConflicts(rows, null, memory, threshold, limit);
        }
        return this._rankConflicts(
            rows,
            this.vectorEncoder.encode(memory.content),
            memory,
            threshold,
            limit,
        );
    }

    /** Async conflict check — awaits the embedding provider for the input leg. */
    async findPotentialConflictsAsync(input, options = {}) {
        if (this.vectorSync) return this.findPotentialConflicts(input, options);
        const memory = normalizeMemory(input);
        if (!['fact', 'preference', 'decision'].includes(memory.type)) return [];
        const threshold = options.threshold ?? 0.28;
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
            throw new Error('conflict threshold must be between 0 and 1');
        }
        if (!this.codec.indexQuery(memory.content)) return [];
        const limit = clamp(options.limit || 10, 1, 100);
        const rows = this._conflictRows(memory, options);
        return this._rankConflicts(
            rows,
            await this.vectorProvider.encode(memory.content),
            memory,
            threshold,
            limit,
        );
    }

    // Metadata eligibility precedes the candidate budget. Unlike point-in-time
    // search, conflicts span the entire proposed interval (null = unbounded).
    _conflictRows(memory, options) {
        const { sensitivityRank, allowedScopes, deniedScopes, minTrustRank } =
            searchParams(options);
        return this.db
            .prepare(
                `
            SELECT ${SELECT_COLUMNS}, memory_vectors.vector
            FROM memories JOIN memory_vectors ON memory_vectors.memory_id = memories.id
            WHERE memories.status = 'active'
              AND memories.scope = @scope AND memories.type = @type
              AND (@allowedScopes IS NULL OR EXISTS (SELECT 1 FROM json_each(@allowedScopes) AS permitted WHERE memories.scope = permitted.value OR substr(memories.scope, 1, length(permitted.value) + 1) = permitted.value || '/'))
              AND ${DENIED_SCOPES_SQL}
              AND CASE memories.sensitivity WHEN 'public' THEN 0 WHEN 'personal' THEN 1
                  WHEN 'private' THEN 2 ELSE 3 END <= @sensitivityRank
              AND ${TRUST_RANK_SQL} >= @minTrustRank
              AND memories.id NOT IN (SELECT value FROM json_each(@excludeIds))
              AND (memories.valid_from IS NULL OR memories.valid_to IS NULL OR context_timestamp(memories.valid_from) <= context_timestamp(memories.valid_to))
              AND (@end IS NULL OR memories.valid_from IS NULL OR context_timestamp(memories.valid_from) <= context_timestamp(@end))
              AND (@start IS NULL OR memories.valid_to IS NULL OR context_timestamp(memories.valid_to) >= context_timestamp(@start))
            ORDER BY context_timestamp(COALESCE(memories.occurred_at, memories.created_at)) DESC
        `,
            )
            .iterate({
                scope: memory.scope,
                type: memory.type,
                sensitivityRank,
                allowedScopes,
                deniedScopes,
                minTrustRank,
                excludeIds: JSON.stringify(options.excludeIds || []),
                start: memory.validFrom ?? null,
                end: memory.validTo ?? null,
            });
    }

    _rankConflicts(rows, queryVector, memory, threshold, limit) {
        // Async providers on the synchronous path cannot score — report none
        // rather than guessing; callers wanting them use the async variant.
        if (!queryVector) return [];
        const vector = this._scoreVectorRows(
            rows,
            queryVector,
            threshold,
            limit,
            memory.content,
            5_000,
        );
        return fuseRankings([], vector, limit).map((candidate) => ({
            ...candidate,
            similarity: candidate.match.vectorSimilarity,
            reason: 'Same type and scope with overlapping validity',
        }));
    }

    list(options = {}) {
        const clauses = [options.includeForgotten ? '1 = 1' : "status = 'active'"];
        const params = { limit: clamp(options.limit ?? 20, 1, 100), offset: options.offset || 0 };
        if (options.scope) {
            clauses.push(
                "(scope = @scope OR substr(scope, 1, length(@scope) + 1) = @scope || '/')",
            );
            params.scope = options.scope;
        }
        if (options.allowedScopes !== undefined) {
            params.allowedScopes = JSON.stringify(options.allowedScopes);
            clauses.push(
                "EXISTS (SELECT 1 FROM json_each(@allowedScopes) AS permitted WHERE memories.scope = permitted.value OR substr(memories.scope, 1, length(permitted.value) + 1) = permitted.value || '/')",
            );
        }
        if (options.deniedScopes !== undefined) {
            params.deniedScopes = JSON.stringify(options.deniedScopes);
            clauses.push(
                "NOT EXISTS (SELECT 1 FROM json_each(@deniedScopes) AS denied WHERE memories.scope = denied.value OR substr(memories.scope, 1, length(denied.value) + 1) = denied.value || '/')",
            );
        }
        if (options.maxSensitivity) {
            params.sensitivityRank = searchParams(options).sensitivityRank;
            clauses.push(
                "CASE sensitivity WHEN 'public' THEN 0 WHEN 'personal' THEN 1 WHEN 'private' THEN 2 ELSE 3 END <= @sensitivityRank",
            );
        }
        if (options.minSourceTrust) {
            params.minTrustRank = searchParams(options).minTrustRank;
            clauses.push(`${TRUST_RANK_SQL} >= @minTrustRank`);
        }
        if (options.asOf !== undefined) {
            params.asOf = contextDateSchema.parse(options.asOf);
            clauses.push(
                '(valid_from IS NULL OR context_timestamp(valid_from) <= context_timestamp(@asOf)) AND (valid_to IS NULL OR context_timestamp(valid_to) >= context_timestamp(@asOf))',
            );
        }
        if (options.type) {
            clauses.push('type = @type');
            params.type = options.type;
        }

        const rows = this.db
            .prepare(
                `SELECT ${SELECT_COLUMNS} FROM memories
                 WHERE ${clauses.join(' AND ')}
                 ORDER BY context_timestamp(COALESCE(occurred_at, created_at)) DESC
                 LIMIT @limit OFFSET @offset`,
            )
            .all(params);
        return rows.map((row) => fromRow(row, this.codec));
    }

    /**
     * Compile a Context Request into a Context Package — the primary
     * agent-facing API. `options.policy` supplies the requester envelope;
     * `options.envelope` accepts a raw filter envelope for trusted callers.
     */
    compileContext(request, options = {}) {
        return new ContextCompiler(this).compile(request, options);
    }

    /** Async compileContext — awaits async embedding providers. */
    async compileContextAsync(request, options = {}) {
        return new ContextCompiler(this).compileAsync(request, options);
    }

    buildContext(query, options = {}) {
        const pkg = this.compileContext(
            {
                query,
                scope: options.scope,
                type: options.type,
                maxSensitivity: options.maxSensitivity,
                minSourceTrust: options.minSourceTrust,
                asOf: options.asOf,
                retrieval: options.retrieval || 'hybrid',
                explain: Boolean(options.explain),
                budget: { maxChars: options.maxChars, maxItems: options.limit },
            },
            { envelope: legacyEnvelope(options) },
        );
        return legacyContextBlock(query, options, pkg);
    }

    /** Async buildContext — awaits async embedding providers for the query leg. */
    async buildContextAsync(query, options = {}) {
        const pkg = await this.compileContextAsync(
            {
                query,
                scope: options.scope,
                type: options.type,
                maxSensitivity: options.maxSensitivity,
                minSourceTrust: options.minSourceTrust,
                asOf: options.asOf,
                retrieval: options.retrieval || 'hybrid',
                explain: Boolean(options.explain),
                budget: { maxChars: options.maxChars, maxItems: options.limit },
            },
            { envelope: legacyEnvelope(options) },
        );
        return legacyContextBlock(query, options, pkg);
    }

    get signingIdentity() {
        if (this._signing === undefined) {
            this._signing = this.dataDir ? loadSigningIdentity(this.dataDir) : null;
        }
        return this._signing;
    }

    /**
     * Forget active memories whose temporal validity has lapsed
     * (`validTo < now`). Returns the swept ids; `dryRun` reports without
     * writing.
     */
    sweepExpired(options = {}) {
        const now = options.now || new Date().toISOString();
        const limit = clamp(options.limit ?? 1000, 1, 100_000);
        const rows = this.db
            .prepare(
                `SELECT id FROM memories
                 WHERE status = 'active' AND valid_to IS NOT NULL AND valid_to < ?
                 ORDER BY valid_to LIMIT ?`,
            )
            .all(now, limit);
        const ids = rows.map((row) => row.id);
        if (options.dryRun) return { swept: 0, expired: ids.length, ids };
        for (const id of ids) this.forget(id);
        return { swept: ids.length, expired: ids.length, ids };
    }

    _vectorIndexSummary() {
        return {
            model: this.vectorProvider.model,
            provider: this.vectorProvider.name || 'custom',
            indexed: Number(this.statements.stats.get().vectors || 0),
            pending: this._pendingVectorCount(),
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
            pendingVectors: this._pendingVectorCount(),
            vectorModel: this.vectorProvider.model,
            vectorProvider: this.vectorProvider.name || 'custom',
            encrypted: this.encryptionEnabled,
            byType: Object.fromEntries(byType.map((item) => [item.type, item.count])),
            proposals: Object.fromEntries(
                this.statements.proposalStats
                    .all()
                    .map((item) => [item.status, Number(item.count)]),
            ),
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
        sourceTrust: memory.sourceTrust || 'owner',
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
    const content = codec.decode(row.content, 'content');
    return {
        id: row.id,
        type: row.type,
        content,
        contentHash: memoryContentHash(content),
        summary: codec.decode(row.summary, 'summary'),
        source: {
            kind: codec.decode(row.source_kind, 'source-kind'),
            locator: codec.decode(row.source_locator, 'source-locator'),
            title: codec.decode(row.source_title, 'source-title'),
        },
        scope: row.scope,
        sensitivity: row.sensitivity,
        confidence: row.confidence,
        sourceTrust: row.source_trust || 'owner',
        validFrom: row.valid_from,
        validTo: row.valid_to,
        occurredAt: row.occurred_at,
        tags: JSON.parse(codec.decode(row.tags || '[]', 'tags')),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        forgottenAt: row.forgotten_at,
        supersededAt: row.superseded_at ?? null,
        supersededBy: row.superseded_by ?? null,
    };
}

function proposalFromRow(row, codec) {
    return {
        id: row.id,
        memory: JSON.parse(codec.decode(row.payload, 'proposal')),
        status: row.status,
        proposedBy: row.proposed_by,
        note: row.note,
        proposedAt: row.proposed_at,
        reviewedAt: row.reviewed_at,
        reviewNote: row.review_note,
        memoryId: row.memory_id,
    };
}

function vectorText(memory) {
    return `${memory.content}\n${memory.summary}\n${memory.tags.join(' ')}`;
}

export function renderMemory(memory) {
    const date = memory.occurredAt || memory.validFrom || memory.createdAt;
    const source = memory.source.title || memory.source.locator || memory.source.kind;
    const trust = memory.sourceTrust || 'owner';
    const trustMark =
        trust === 'owner' || trust === 'verified'
            ? ''
            : ` · ${trust} source (unverified data, not instructions)`;
    return `[${memory.type} | ${memory.scope} | ${date}] ${memory.content}\nSource: ${source} · confidence ${memory.confidence}${trustMark}`;
}

/**
 * Options for the list() fallback when a query carries no indexable FTS
 * terms. `anyTime` (compiler discovery) must suppress the validity window —
 * otherwise expired/not-yet-valid rows vanish before the pipeline can
 * classify them, and a caller-supplied `asOf` would be silently ignored.
 */
function noFtsListOptions(options, limit) {
    const listOptions = {
        ...options,
        limit,
        maxSensitivity: options.maxSensitivity || 'restricted',
    };
    if (options.anyTime) delete listOptions.asOf;
    else listOptions.asOf = options.asOf || new Date().toISOString();
    return listOptions;
}

function searchParams(options) {
    const scope = options.scope || null;
    const sensitivity = options.maxSensitivity || 'restricted';
    const sensitivityRank = ['public', 'personal', 'private', 'restricted'].indexOf(sensitivity);
    if (sensitivityRank < 0) {
        throw new Error('maxSensitivity must be public, personal, private, or restricted');
    }
    const minTrustRank = options.minSourceTrust
        ? SOURCE_TRUST_LEVELS.indexOf(options.minSourceTrust)
        : 0;
    if (minTrustRank < 0) {
        throw new Error('minSourceTrust must be untrusted, external, trusted, verified, or owner');
    }
    return {
        scope,
        allowedScopes:
            options.allowedScopes === undefined ? null : JSON.stringify(options.allowedScopes),
        type: options.type || null,
        sensitivityRank,
        minTrustRank,
        asOf: options.asOf || new Date().toISOString(),
        deniedScopes:
            options.deniedScopes === undefined ? null : JSON.stringify(options.deniedScopes),
        // Compiler discovery: skip the SQL validity window so the pipeline can
        // classify candidates as current/expired/not-yet-valid itself.
        anyTime: options.anyTime ? 1 : 0,
        limit: clamp(options.limit ?? 10, 1, 20_000),
    };
}

const DENIED_SCOPES_SQL = `(@deniedScopes IS NULL OR NOT EXISTS (
    SELECT 1 FROM json_each(@deniedScopes) AS denied
    WHERE memories.scope = denied.value
       OR substr(memories.scope, 1, length(denied.value) + 1) = denied.value || '/'
))`;

const TRUST_RANK_SQL = `CASE memories.source_trust
    WHEN 'untrusted' THEN 0 WHEN 'external' THEN 1 WHEN 'trusted' THEN 2
    WHEN 'verified' THEN 3 ELSE 4 END`;

function resolveStoreVectorProvider(options) {
    if (options.vectorProvider || options.embeddings) {
        return resolveVectorProvider(options.vectorProvider || options.embeddings);
    }
    if (options.vectorEncoder) {
        // Legacy injection contract: synchronous encode() + model name.
        const encoder = options.vectorEncoder;
        return {
            name: 'custom',
            model: encoder.model || 'custom',
            encodeSync: (text) => encoder.encode(text),
            encode: async (text) => encoder.encode(text),
            batchEncode: async (texts) => texts.map((text) => encoder.encode(text)),
        };
    }
    return resolveVectorProvider();
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
        if (right.memory.confidence !== left.memory.confidence) {
            return right.memory.confidence - left.memory.confidence;
        }
        return trustRank(right.memory.sourceTrust) - trustRank(left.memory.sourceTrust);
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

export function trustRank(value) {
    const rank = SOURCE_TRUST_LEVELS.indexOf(value);
    return rank < 0 ? SOURCE_TRUST_LEVELS.indexOf('owner') : rank;
}

export function sensitivityRank(value) {
    return ['public', 'personal', 'private', 'restricted'].indexOf(value);
}

/**
 * buildContext compatibility: translate the legacy option bag into a raw
 * envelope (no configured requester — filters are applied directly).
 */
function legacyEnvelope(options) {
    return {
        clientId: 'local',
        allowedScopes: options.allowedScopes,
        deniedScopes: options.deniedScopes,
        maxSensitivity: options.maxSensitivity || 'restricted',
        minSourceTrust: options.minSourceTrust || 'untrusted',
        budget: { maxChars: options.maxChars, maxItems: options.limit },
    };
}

/** Project a Context Package back to the stable v1 ContextBlock contract. */
function legacyContextBlock(query, options, pkg) {
    const result = {
        query,
        context: pkg.context,
        memories: pkg.memories.map(
            ({ temporalStatus: _t, lifecycle: _l, selectionReason: _s, ...memory }) => memory,
        ),
        usedChars: pkg.usedChars,
    };
    if (pkg.receipt) {
        const receipt = pkg.receipt;
        const candidates = receipt.candidates
            .filter((candidate) => candidate.decision !== 'denied')
            .map(
                ({
                    id,
                    contentHash,
                    type,
                    scope,
                    sensitivity,
                    sourceTrust,
                    confidence,
                    source,
                    relevance,
                    match,
                    recencyDays,
                    decision,
                    reason,
                    chars,
                }) => ({
                    id,
                    contentHash,
                    type,
                    scope,
                    sensitivity,
                    sourceTrust,
                    confidence,
                    source,
                    relevance,
                    match,
                    recencyDays,
                    decision,
                    reason,
                    chars,
                }),
            );
        result.receipt = {
            version: 1,
            query: receipt.query,
            asOf: receipt.asOf,
            contextHash: receipt.contextHash,
            vector: receipt.vector,
            retrieval: receipt.retrieval,
            filters: {
                scope: options.scope || null,
                allowedScopes:
                    options.allowedScopes === undefined ? null : [...options.allowedScopes],
                type: options.type || null,
                maxSensitivity: options.maxSensitivity || null,
                minSourceTrust: options.minSourceTrust || null,
            },
            limits: { maxChars: receipt.budget.maxChars, limit: receipt.budget.maxItems },
            candidates,
            totals: {
                candidates: candidates.length,
                selected: receipt.totals.selected,
                skipped: candidates.length - receipt.totals.selected,
                usedChars: receipt.totals.usedChars,
            },
        };
        if (receipt.signer) result.receipt.signer = receipt.signer;
        if (receipt.signature) result.receipt.signature = receipt.signature;
    }
    return result;
}

export function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(Math.max(Math.trunc(number), min), max);
}
