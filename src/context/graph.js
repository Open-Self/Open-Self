import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Context graph lite — relational edges, entity identity and the supersession
 * lifecycle on top of the ContextStore's SQLite vault. Functions take the
 * store as their first argument so every write stays inside store-managed
 * transactions and shares its codec/clock conventions.
 */

export const EDGE_PREDICATES = [
    'supersedes',
    'contradicts',
    'relates_to',
    'sourced_from',
    'derived_from',
    'affects',
    'works_on',
    'uses',
    'knows',
    'part_of',
];

export const ENTITY_KINDS = ['person', 'project', 'organization', 'technology', 'place', 'thing'];

const idRef = z.string().trim().min(1).max(200);
const predicate = z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'predicate must be snake_case');
const alias = z.string().trim().min(1).max(200);

const entityInput = z.object({
    kind: z.enum(ENTITY_KINDS).default('thing'),
    canonical: z.string().trim().min(1).max(200),
    scope: z.string().trim().min(1).max(200).default('personal'),
    aliases: z.array(alias).max(50).default([]),
});

function edgeFromRow(row) {
    return {
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        sourceKind: row.source_kind,
        confidence: row.confidence,
        createdAt: row.created_at,
    };
}

/**
 * Record `memory` (input or existing id) as the replacement for `supersededId`.
 * The superseded record is preserved with `supersededAt`/`supersededBy` —
 * historical queries still see it; current-truth compilation excludes it.
 */
export function supersedeMemory(store, input, supersededId, options = {}) {
    const target = store.get(supersededId);
    if (!target) throw new Error(`Superseded memory not found: ${supersededId}`);

    return store.db.transaction(() => {
        const replacement = typeof input === 'string' ? store.get(input) : store.remember(input);
        if (!replacement) throw new Error(`Replacement memory not found: ${input}`);
        if (replacement.id === target.id) {
            throw new Error('A memory cannot supersede itself');
        }
        // `options.at` declares when the replacement became truth — owners and
        // importers can backdate supersession; default is the write instant.
        const now = options.at || new Date().toISOString();
        store.db
            .prepare(
                `UPDATE memories SET superseded_at = @now, superseded_by = @by,
                 updated_at = @now WHERE id = @id`,
            )
            .run({ now, by: replacement.id, id: target.id });
        addEdge(store, replacement.id, 'supersedes', target.id, {
            sourceKind: options.sourceKind || 'owner',
            confidence: options.confidence ?? 1,
        });
        store._recordVersion(
            { ...target, supersededAt: now, supersededBy: replacement.id },
            'superseded',
        );
        return {
            memory: store.get(replacement.id),
            superseded: store.get(target.id, { includeForgotten: true }),
        };
    })();
}

/** Reverse a supersession — clears the marker and its edge, keeps history. */
export function unsupersedeMemory(store, id) {
    const memory = store.get(id, { includeForgotten: true });
    if (!memory?.supersededAt) return false;
    return store.db.transaction(() => {
        const now = new Date().toISOString();
        store.db
            .prepare(
                'UPDATE memories SET superseded_at = NULL, superseded_by = NULL, updated_at = ? WHERE id = ?',
            )
            .run(now, id);
        if (memory.supersededBy) {
            removeEdge(store, memory.supersededBy, 'supersedes', id);
        }
        store._recordVersion({ ...memory, supersededAt: null, supersededBy: null }, 'unsuperseded');
        return true;
    })();
}

export function addEdge(store, subject, edgePredicate, object, options = {}) {
    const edge = {
        subject: idRef.parse(subject),
        predicate: predicate.parse(edgePredicate),
        object: idRef.parse(object),
        sourceKind: z
            .string()
            .trim()
            .min(1)
            .max(50)
            .parse(options.sourceKind || 'owner'),
        confidence: z
            .number()
            .min(0)
            .max(1)
            .parse(options.confidence ?? 1),
        createdAt: new Date().toISOString(),
    };
    store.db
        .prepare(
            `INSERT INTO memory_edges (subject, predicate, object, source_kind, confidence, created_at)
             VALUES (@subject, @predicate, @object, @sourceKind, @confidence, @createdAt)
             ON CONFLICT(subject, predicate, object)
             DO UPDATE SET confidence = excluded.confidence`,
        )
        .run(edge);
    return edgeFromRow(
        store.db
            .prepare(
                'SELECT * FROM memory_edges WHERE subject = ? AND predicate = ? AND object = ?',
            )
            .get(edge.subject, edge.predicate, edge.object),
    );
}

export function removeEdge(store, subject, edgePredicate, object) {
    return (
        store.db
            .prepare('DELETE FROM memory_edges WHERE subject = ? AND predicate = ? AND object = ?')
            .run(subject, edgePredicate, object).changes > 0
    );
}

/** Edges touching a memory/entity id. `direction`: 'out' | 'in' | 'both'. */
export function edgesFor(store, id, options = {}) {
    const direction = options.direction || 'both';
    const clauses = [];
    if (direction !== 'in') clauses.push('subject = @id');
    if (direction !== 'out') clauses.push('object = @id');
    const rows = store.db
        .prepare(
            `SELECT * FROM memory_edges WHERE (${clauses.join(' OR ')})
             AND (@predicate IS NULL OR predicate = @predicate)
             ORDER BY created_at DESC LIMIT @limit`,
        )
        .all({
            id,
            predicate: options.predicate || null,
            limit: Math.min(Math.max(options.limit ?? 100, 1), 1000),
        });
    return rows.map(edgeFromRow);
}

/** Ids of memories superseded at-or-before `asOf` (ISO string). */
export function supersededIds(store, asOf) {
    return new Set(
        store.db
            .prepare(
                `SELECT id FROM memories WHERE superseded_at IS NOT NULL
                 AND context_timestamp(superseded_at) <= context_timestamp(?)`,
            )
            .all(asOf)
            .map((row) => row.id),
    );
}

// ---------- Entities ----------

function entityFromRow(store, row) {
    if (!row) return null;
    const aliases = store.db
        .prepare('SELECT alias FROM entity_aliases WHERE entity_id = ? ORDER BY alias')
        .all(row.id)
        .map((item) => item.alias);
    return {
        id: row.id,
        kind: row.kind,
        canonical: row.canonical,
        scope: row.scope,
        mergedInto: row.merged_into,
        createdAt: row.created_at,
        aliases,
    };
}

/**
 * Resolve or create an entity by canonical name or alias. Lookup is
 * case-insensitive over the alias table (canonical is always stored as an
 * alias), so "OpenAI"/"open ai" style drift converges only when an owner or
 * adapter has declared the alias — ambiguous names are never merged silently.
 */
export function ensureEntity(store, input) {
    const parsed = entityInput.parse(input);
    const existing = findEntity(store, parsed.canonical);
    if (existing) {
        for (const name of parsed.aliases) addAlias(store, existing.id, name);
        return findEntity(store, parsed.canonical) || existing;
    }
    return store.db.transaction(() => {
        const id = randomUUID();
        const now = new Date().toISOString();
        store.db
            .prepare(
                'INSERT INTO entities (id, kind, canonical, scope, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(id, parsed.kind, parsed.canonical, parsed.scope, now);
        const insertAlias = store.db.prepare(
            'INSERT OR IGNORE INTO entity_aliases (entity_id, alias, created_at) VALUES (?, ?, ?)',
        );
        for (const name of [parsed.canonical, ...parsed.aliases]) {
            insertAlias.run(id, name.trim(), now);
        }
        return entityFromRow(
            store,
            store.db.prepare('SELECT * FROM entities WHERE id = ?').get(id),
        );
    })();
}

/** Find an entity by id, canonical name or alias (case-insensitive). */
export function findEntity(store, nameOrId) {
    if (typeof nameOrId !== 'string' || !nameOrId.trim()) return null;
    const key = nameOrId.trim();
    const direct = store.db.prepare('SELECT * FROM entities WHERE id = ?').get(key);
    if (direct) return entityFromRow(store, direct);
    const viaAlias = store.db
        .prepare(
            `SELECT entities.* FROM entities
             JOIN entity_aliases ON entity_aliases.entity_id = entities.id
             WHERE entity_aliases.alias = ? COLLATE NOCASE`,
        )
        .get(key);
    if (!viaAlias) return null;
    // Follow merge redirects so callers always land on the surviving entity.
    if (viaAlias.merged_into) return findEntity(store, viaAlias.merged_into);
    return entityFromRow(store, viaAlias);
}

export function listEntities(store, options = {}) {
    const rows = store.db
        .prepare(
            `SELECT * FROM entities
             WHERE merged_into IS NULL
               AND (@kind IS NULL OR kind = @kind)
               AND (@scope IS NULL OR scope = @scope OR substr(scope, 1, length(@scope) + 1) = @scope || '/')
             ORDER BY canonical LIMIT @limit`,
        )
        .all({
            kind: options.kind || null,
            scope: options.scope || null,
            limit: Math.min(Math.max(options.limit ?? 100, 1), 1000),
        });
    return rows.map((row) => entityFromRow(store, row));
}

export function addAlias(store, entityId, name) {
    const entity = store.db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId);
    if (!entity) throw new Error(`Entity not found: ${entityId}`);
    const cleaned = alias.parse(name);
    const owner = store.db
        .prepare('SELECT entity_id FROM entity_aliases WHERE alias = ? COLLATE NOCASE')
        .get(cleaned);
    if (owner && owner.entity_id !== entityId) {
        throw new Error(`Alias "${cleaned}" already belongs to another entity`);
    }
    store.db
        .prepare(
            'INSERT OR IGNORE INTO entity_aliases (entity_id, alias, created_at) VALUES (?, ?, ?)',
        )
        .run(entityId, cleaned, new Date().toISOString());
    return entityFromRow(store, entity);
}

/**
 * Merge duplicate entities into `primaryId`: aliases and memory links are
 * repointed, losers are marked `merged_into` for reversibility and audit.
 */
export function mergeEntities(store, primaryId, duplicateIds) {
    const primary = store.db
        .prepare('SELECT * FROM entities WHERE id = ? AND merged_into IS NULL')
        .get(primaryId);
    if (!primary) throw new Error(`Primary entity not found: ${primaryId}`);
    const ids = [...new Set(duplicateIds)].filter((id) => id !== primaryId);
    if (!ids.length) throw new Error('At least one duplicate entity ID is required');
    return store.db.transaction(() => {
        for (const id of ids) {
            const dup = store.db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
            if (!dup) throw new Error(`Duplicate entity not found: ${id}`);
            store.db
                .prepare('UPDATE entity_aliases SET entity_id = ? WHERE entity_id = ?')
                .run(primaryId, id);
            store.db
                .prepare('UPDATE OR IGNORE memory_entities SET entity_id = ? WHERE entity_id = ?')
                .run(primaryId, id);
            store.db.prepare('DELETE FROM memory_entities WHERE entity_id = ?').run(id);
            store.db.prepare('UPDATE entities SET merged_into = ? WHERE id = ?').run(primaryId, id);
        }
        return entityFromRow(store, { ...primary });
    })();
}

export function linkMemoryEntity(store, memoryId, entityId, role = 'mentions') {
    if (!store.get(memoryId, { includeForgotten: true })) {
        throw new Error(`Memory not found: ${memoryId}`);
    }
    if (!store.db.prepare('SELECT id FROM entities WHERE id = ?').get(entityId)) {
        throw new Error(`Entity not found: ${entityId}`);
    }
    store.db
        .prepare(
            'INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, role) VALUES (?, ?, ?)',
        )
        .run(memoryId, entityId, z.string().trim().min(1).max(50).parse(role));
    return true;
}

export function unlinkMemoryEntity(store, memoryId, entityId, role = 'mentions') {
    return (
        store.db
            .prepare(
                'DELETE FROM memory_entities WHERE memory_id = ? AND entity_id = ? AND role = ?',
            )
            .run(memoryId, entityId, role).changes > 0
    );
}

export function entitiesForMemory(store, memoryId) {
    return store.db
        .prepare(
            `SELECT entities.*, memory_entities.role FROM memory_entities
             JOIN entities ON entities.id = memory_entities.entity_id
             WHERE memory_entities.memory_id = ? ORDER BY entities.canonical`,
        )
        .all(memoryId)
        .map((row) => ({ ...entityFromRow(store, row), role: row.role }));
}

export function memoriesForEntity(store, entityId, options = {}) {
    return store.db
        .prepare(`SELECT memory_id, role FROM memory_entities WHERE entity_id = ? LIMIT ?`)
        .all(entityId, Math.min(Math.max(options.limit ?? 100, 1), 1000))
        .map((row) => ({
            memory: store.get(row.memory_id, {
                includeForgotten: Boolean(options.includeForgotten),
            }),
            role: row.role,
        }))
        .filter((item) => item.memory);
}

// ---------- Timeline ----------

/**
 * Temporal view over memory lifecycle: versions, supersession and edges.
 * Each entry is inspectable — what changed, when, and which record it touched.
 */
export function timeline(store, options = {}) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const clauses = [];
    const params = { limit };
    if (options.scope) {
        clauses.push(
            "(m.scope = @scope OR substr(m.scope, 1, length(@scope) + 1) = @scope || '/')",
        );
        params.scope = options.scope;
    }
    if (options.type) {
        clauses.push('m.type = @type');
        params.type = options.type;
    }
    if (options.since) {
        clauses.push('v.changed_at >= @since');
        params.since = options.since;
    }
    if (options.until) {
        clauses.push('v.changed_at <= @until');
        params.until = options.until;
    }
    const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';
    const rows = store.db
        .prepare(
            `SELECT v.memory_id, v.version, v.change_kind, v.changed_at, v.snapshot,
                    m.scope AS memory_scope, m.type AS memory_type
             FROM memory_versions v
             JOIN memories m ON m.id = v.memory_id
             WHERE 1 = 1 ${where}
             ORDER BY v.changed_at DESC, v.memory_id, v.version DESC
             LIMIT @limit`,
        )
        .all(params);
    return rows.map((row) => {
        const snapshot = JSON.parse(store.codec.decode(row.snapshot, 'version'));
        return {
            at: row.changed_at,
            memoryId: row.memory_id,
            version: row.version,
            kind: row.change_kind,
            scope: row.memory_scope,
            type: row.memory_type,
            summary: snapshot.content?.slice(0, 160) || '',
            supersededBy: snapshot.supersededBy || null,
        };
    });
}
