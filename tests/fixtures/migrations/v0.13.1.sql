-- Frozen schema from v0.13.1:src/context/store.js
-- Source SHA-256: 1a615b7df8340026f7474672496b41152ffee10c1ece73414879a7ea9c64dfda
-- Synthetic records and checkpoint only. Do not regenerate from current code.

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

            CREATE TABLE IF NOT EXISTS capture_checkpoints (
                checkpoint_key TEXT PRIMARY KEY,
                snapshot TEXT NOT NULL
            );

PRAGMA user_version = 2;
INSERT INTO memories (id,type,content,summary,source_kind,source_locator,source_title,scope,sensitivity,confidence,tags,status,created_at,updated_at) VALUES ('00000000-0000-4000-8000-000000000001','decision','Legacy SQLite decision','Fixture','document','fixture.md','Synthetic fixture','project/fixture','personal',1,'["fixture"]','active','2026-08-01T00:00:00.000Z','2026-08-02T00:00:00.000Z');
INSERT INTO memories (id,type,content,status,created_at,updated_at,forgotten_at) VALUES ('00000000-0000-4000-8000-000000000002','note','Forgotten fixture','forgotten','2026-08-01T00:00:00.000Z','2026-08-02T00:00:00.000Z','2026-08-02T00:00:00.000Z');
INSERT INTO memory_versions (memory_id,version,change_kind,snapshot,changed_at) VALUES ('00000000-0000-4000-8000-000000000001',1,'created','{"id":"00000000-0000-4000-8000-000000000001","type":"decision","content":"Original fixture decision","summary":"Fixture","source":{"kind":"document","locator":"fixture.md","title":"Synthetic fixture"},"scope":"project/fixture","sensitivity":"personal","confidence":1,"tags":["fixture"],"status":"active","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-02T00:00:00.000Z","validFrom":null,"validTo":null,"occurredAt":null}','2026-08-01T00:00:00.000Z'),('00000000-0000-4000-8000-000000000001',2,'updated','{"id":"00000000-0000-4000-8000-000000000001","type":"decision","content":"Legacy SQLite decision","summary":"Fixture","source":{"kind":"document","locator":"fixture.md","title":"Synthetic fixture"},"scope":"project/fixture","sensitivity":"personal","confidence":1,"tags":["fixture"],"status":"active","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-02T00:00:00.000Z","validFrom":null,"validTo":null,"occurredAt":null}','2026-08-02T00:00:00.000Z');
INSERT INTO import_items VALUES ('fixture-dedupe-key','00000000-0000-4000-8000-000000000001','2026-08-01T00:00:00.000Z');
INSERT INTO memory_fts(id,content,summary,tags) VALUES ('00000000-0000-4000-8000-000000000001','Legacy SQLite decision','Fixture','fixture');

INSERT INTO capture_checkpoints VALUES ('fixture-checkpoint', '{"version":1,"root":"/synthetic/project","scope":"project/fixture","configHash":"fixture-config","scannedAt":"2026-08-02T00:00:00.000Z","files":{"fixture.md":{"hash":"a7d9fce8c48841d87e9b0d3814bb9392348cb9d5167c5044ef0bc4bf072bf128","memoryIds":["00000000-0000-4000-8000-000000000001"]}}}');
