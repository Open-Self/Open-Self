import { afterEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

describe('context graph and lifecycle', () => {
    let store;
    afterEach(() => store?.close());

    it('supersedes a memory while preserving history', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const old = store.remember({
            type: 'preference',
            content: 'preferred editor is VS Code',
            validFrom: '2025-01-01T00:00:00Z',
        });
        const { memory: next, superseded } = store.supersede(
            { type: 'preference', content: 'preferred editor is Zed' },
            old.id,
        );
        expect(superseded.id).toBe(old.id);
        expect(superseded.supersededBy).toBe(next.id);
        expect(superseded.supersededAt).toBeTruthy();
        // Still retrievable — superseded is not forgotten.
        expect(store.get(old.id)).toBeTruthy();
        const edge = store.edges(next.id).find((item) => item.predicate === 'supersedes');
        expect(edge.object).toBe(old.id);
        // History records the supersession.
        expect(store.history(old.id).some((v) => v.changeKind === 'superseded')).toBe(true);
    });

    it('rejects supersession of missing or self memories', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const memory = store.remember({ content: 'note' });
        expect(() => store.supersede({ content: 'x' }, memory.id)).not.toThrow();
        expect(() => store.supersede(memory.id, memory.id)).toThrow('itself');
        expect(() => store.supersede({ content: 'x' }, crypto.randomUUID())).toThrow('not found');
    });

    it('unsupersede restores currency and removes the edge', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const old = store.remember({ content: 'old preference' });
        const { memory: next } = store.supersede({ content: 'new preference' }, old.id);
        expect(store.unsupersede(old.id)).toBe(true);
        const restored = store.get(old.id);
        expect(restored.supersededAt).toBeNull();
        expect(store.edges(next.id, { predicate: 'supersedes' })).toHaveLength(0);
        expect(store.unsupersede(old.id)).toBe(false);
    });

    it('stores and queries arbitrary typed edges', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const a = store.remember({ content: 'decision A', scope: 'project/x' });
        const b = store.remember({ content: 'module B', scope: 'project/x' });
        store.addEdge(a.id, 'affects', b.id, { confidence: 0.9 });
        expect(store.edges(a.id, { direction: 'out' })[0]).toMatchObject({
            predicate: 'affects',
            object: b.id,
            confidence: 0.9,
        });
        expect(store.edges(b.id, { direction: 'in' })).toHaveLength(1);
        expect(store.removeEdge(a.id, 'affects', b.id)).toBe(true);
        expect(store.edges(a.id)).toHaveLength(0);
    });

    it('resolves entities through canonical names and aliases', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const entity = store.ensureEntity({
            kind: 'organization',
            canonical: 'OpenAI',
            aliases: ['Open AI', 'openai.com'],
        });
        expect(store.findEntity('OpenAI').id).toBe(entity.id);
        expect(store.findEntity('open ai').id).toBe(entity.id);
        // ensureEntity on an existing alias returns the same entity.
        expect(store.ensureEntity({ canonical: 'OPENAI' }).id).toBe(entity.id);
    });

    it('merges entities reversibly and repoints aliases + links', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const primary = store.ensureEntity({ kind: 'person', canonical: 'Tang Vu' });
        const dup = store.ensureEntity({ kind: 'person', canonical: 'Vu' });
        const memory = store.remember({ content: 'Vu owns the roadmap' });
        store.linkEntity(memory.id, dup.id, 'about');
        const merged = store.mergeEntities(primary.id, [dup.id]);
        expect(merged.aliases).toContain('Vu');
        expect(store.findEntity('vu').id).toBe(primary.id);
        expect(store.memoriesForEntity(primary.id)[0].memory.id).toBe(memory.id);
    });

    it('refuses to steal an alias owned by another entity', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const a = store.ensureEntity({ canonical: 'Mercury' });
        store.ensureEntity({ canonical: 'Mercury Bank' });
        expect(() => store.addEntityAlias(a.id, 'Mercury Bank')).toThrow('another entity');
    });

    it('links entities to memories with roles', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const project = store.ensureEntity({ kind: 'project', canonical: 'Keryx' });
        const memory = store.remember({ content: 'Keryx settlement retry' });
        store.linkEntity(memory.id, project.id, 'works_on');
        expect(store.entitiesForMemory(memory.id)[0]).toMatchObject({
            canonical: 'Keryx',
            role: 'works_on',
        });
        expect(store.unlinkEntity(memory.id, project.id, 'works_on')).toBe(true);
    });

    it('produces an inspectable lifecycle timeline', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const memory = store.remember({
            type: 'preference',
            content: 'timeline preference',
            scope: 'preference/coding',
        });
        store.supersede(
            { type: 'preference', content: 'new pref', scope: 'preference/coding' },
            memory.id,
        );
        const entries = store.timeline({ scope: 'preference/coding' });
        const kinds = entries.map((entry) => entry.kind);
        expect(kinds).toContain('created');
        expect(kinds).toContain('superseded');
        expect(entries[0].memoryId).toBeTruthy();
        expect(entries[0].at).toBeTruthy();
    });

    it('migrates a schema-3 vault to v4 preserving data', async () => {
        const { mkdtempSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const Database = (await import('better-sqlite3')).default;
        const dir = mkdtempSync(join(tmpdir(), 'openself-migrate-'));
        try {
            const dbPath = join(dir, 'context.db');
            const legacy = new Database(dbPath);
            legacy.exec(`
                CREATE TABLE memories (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    summary TEXT,
                    source_kind TEXT,
                    source_locator TEXT,
                    source_title TEXT,
                    scope TEXT NOT NULL DEFAULT 'general',
                    sensitivity TEXT NOT NULL DEFAULT 'personal',
                    confidence REAL NOT NULL DEFAULT 0.8,
                    source_trust TEXT NOT NULL DEFAULT 'trusted',
                    valid_from TEXT,
                    valid_to TEXT,
                    occurred_at TEXT,
                    tags TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    forgotten_at TEXT
                );
                CREATE TABLE memory_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    memory_id TEXT NOT NULL REFERENCES memories(id),
                    version INTEGER NOT NULL,
                    change_kind TEXT NOT NULL,
                    snapshot TEXT NOT NULL,
                    changed_at TEXT NOT NULL,
                    UNIQUE(memory_id, version)
                );
                INSERT INTO memories (id, type, content, created_at, updated_at)
                VALUES ('legacy-1', 'note', 'legacy memory', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
            `);
            legacy.pragma('user_version = 3');
            legacy.close();
            const migrated = new ContextStore({ dataDir: dir });
            const restored = migrated.get('legacy-1');
            expect(restored.content).toBe('legacy memory');
            expect(restored.supersededAt).toBeNull();
            expect(migrated.db.pragma('user_version', { simple: true })).toBe(4);
            migrated.close();
        } finally {
            rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
    });
});
