import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

describe('ContextStore', () => {
    let store;

    beforeEach(() => {
        store = new ContextStore({ dbPath: ':memory:' });
    });

    afterEach(() => {
        store.close();
    });

    it('stores typed memories with provenance', () => {
        const saved = store.remember({
            type: 'decision',
            content: 'Use SQLite instead of Firebase for OpenSelf',
            scope: 'project/openself',
            source: { kind: 'meeting', locator: 'notes/architecture.md', title: 'Architecture' },
            confidence: 0.95,
        });

        expect(store.get(saved.id)).toMatchObject({
            type: 'decision',
            content: 'Use SQLite instead of Firebase for OpenSelf',
            scope: 'project/openself',
            confidence: 0.95,
            source: { kind: 'meeting', locator: 'notes/architecture.md' },
        });
    });

    it('updates memories and records immutable version snapshots', () => {
        const memory = store.remember({
            type: 'decision',
            content: 'Use Firebase for the project',
            source: { kind: 'meeting', title: 'Old review' },
            tags: ['database'],
        });

        const updated = store.update(memory.id, {
            content: 'Use SQLite for the project',
            source: { title: 'New review' },
        });
        const history = store.history(memory.id);

        expect(updated).toMatchObject({
            content: 'Use SQLite for the project',
            source: { kind: 'meeting', title: 'New review' },
            tags: ['database'],
        });
        expect(history).toHaveLength(2);
        expect(history[0]).toMatchObject({
            version: 2,
            changeKind: 'updated',
            snapshot: { content: 'Use SQLite for the project' },
        });
        expect(history[1]).toMatchObject({
            version: 1,
            changeKind: 'created',
            snapshot: { content: 'Use Firebase for the project' },
        });
        expect(store.update('00000000-0000-4000-8000-000000000000', {})).toBeNull();
    });

    it('merges duplicate memories, unions tags, and preserves audit history', () => {
        const primary = store.remember({
            type: 'fact',
            content: 'The launch date is Friday',
            tags: ['launch'],
        });
        const duplicate = store.remember({
            type: 'fact',
            content: 'We launch this Friday',
            tags: ['calendar'],
        });

        const result = store.merge(primary.id, [duplicate.id], { tags: ['confirmed'] });

        expect(result.memory.tags).toEqual(['launch', 'calendar', 'confirmed']);
        expect(result.mergedIds).toEqual([duplicate.id]);
        expect(store.get(duplicate.id)).toBeNull();
        expect(store.get(duplicate.id, { includeForgotten: true }).status).toBe('forgotten');
        expect(store.history(primary.id)[0].changeKind).toBe('merged');
        expect(store.history(duplicate.id)[0].changeKind).toBe(`merged_into:${primary.id}`);
    });

    it('validates merge targets', () => {
        const primary = store.remember({ content: 'Primary' });
        expect(() => store.merge(primary.id, [])).toThrow(
            'At least one duplicate memory ID is required',
        );
        expect(() => store.merge(primary.id, [primary.id])).toThrow(
            'A memory cannot be merged into itself',
        );
    });

    it('stores imported memories idempotently by dedupe key', () => {
        const first = store.rememberOnce({ content: 'Imported project decision' }, 'source:item:1');
        const second = store.rememberOnce(
            { content: 'A changed value that must not create a duplicate' },
            'source:item:1',
        );

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.memory.id).toBe(first.memory.id);
        expect(store.stats().total).toBe(1);
        expect(store.stats()).toMatchObject({
            vectors: 1,
            vectorModel: 'openself-feature-hash-v1-256',
        });
    });

    it('requires a dedupe key for idempotent storage', () => {
        expect(() => store.rememberOnce({ content: 'Missing key' }, '')).toThrow(
            'A non-empty dedupe key is required',
        );
    });

    it('searches full text and respects nested scopes', () => {
        store.remember({
            type: 'decision',
            content: 'The billing service uses PostgreSQL',
            scope: 'project/acme/billing',
        });
        store.remember({
            type: 'preference',
            content: 'I prefer SQLite for personal tools',
            scope: 'personal',
        });

        const results = store.search('billing PostgreSQL', { scope: 'project/acme' });
        expect(results).toHaveLength(1);
        expect(results[0].scope).toBe('project/acme/billing');
        expect(results[0].relevance).toBeGreaterThan(0);
    });

    it('uses local vectors when lexical search cannot match an alias', () => {
        store.remember({
            type: 'decision',
            content: 'PostgreSQL is the storage backend',
            scope: 'project/acme',
        });

        expect(
            store.search('Which db did we choose?', {
                scope: 'project/acme',
                retrieval: 'lexical',
            }),
        ).toEqual([]);

        const [result] = store.search('Which db did we choose?', {
            scope: 'project/acme',
            retrieval: 'hybrid',
        });
        expect(result.content).toContain('PostgreSQL');
        expect(result.match).toMatchObject({ lexicalRank: null, vectorRank: 1 });
        expect(result.match.vectorSimilarity).toBeGreaterThan(0.08);
    });

    it('rejects unknown retrieval modes', () => {
        expect(() => store.search('database', { retrieval: 'magic' })).toThrow(
            'retrieval must be hybrid, lexical, or vector',
        );
        expect(() => store.search('database', { maxSensitivity: 'secret' })).toThrow(
            'maxSensitivity must be public, personal, private, or restricted',
        );
    });

    it('flags similar current preferences as potential conflicts', () => {
        const existing = store.remember({
            type: 'preference',
            content: 'My preferred code editor is Vim',
            scope: 'personal/work',
        });

        const conflicts = store.findPotentialConflicts({
            type: 'preference',
            content: 'My preferred code editor is Zed',
            scope: 'personal/work',
        });

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
            id: existing.id,
            reason: 'Same type and scope with overlapping validity',
        });
        expect(conflicts[0].similarity).toBeGreaterThan(0.28);
        expect(
            store.findPotentialConflicts(
                {
                    type: 'preference',
                    content: 'My preferred code editor is Zed',
                    scope: 'personal/work',
                },
                { excludeIds: [existing.id] },
            ),
        ).toEqual([]);
    });

    it('does not flag non-overlapping validity windows or non-conflict types', () => {
        store.remember({
            type: 'preference',
            content: 'My preferred code editor is Vim',
            scope: 'personal/work',
            validTo: '2025-12-31T23:59:59.000Z',
        });

        expect(
            store.findPotentialConflicts({
                type: 'preference',
                content: 'My preferred code editor is Zed',
                scope: 'personal/work',
                validFrom: '2026-01-01T00:00:00.000Z',
            }),
        ).toEqual([]);
        expect(store.findPotentialConflicts({ type: 'note', content: 'Editor note' })).toEqual([]);
        expect(() =>
            store.findPotentialConflicts(
                { type: 'preference', content: 'Editor note' },
                { threshold: 2 },
            ),
        ).toThrow('conflict threshold must be between 0 and 1');
    });

    it('skips a corrupted local vector without breaking retrieval', () => {
        const memory = store.remember({ content: 'A memory with a damaged vector' });
        store.db
            .prepare('UPDATE memory_vectors SET vector = ? WHERE memory_id = ?')
            .run('not-json', memory.id);

        expect(store.search('damaged vector', { retrieval: 'vector' })).toEqual([]);
    });

    it('filters memories that are invalid at the requested time', () => {
        store.remember({
            type: 'preference',
            content: 'Preferred editor is Vim',
            validTo: '2025-12-31T23:59:59.000Z',
        });
        store.remember({
            type: 'preference',
            content: 'Preferred editor is Zed',
            validFrom: '2026-01-01T00:00:00.000Z',
        });

        const current = store.search('preferred editor', { asOf: '2026-08-13T00:00:00.000Z' });
        expect(current).toHaveLength(1);
        expect(current[0].content).toContain('Zed');
    });

    it('does not expose memories above the requested sensitivity', () => {
        store.remember({ content: 'Public biography', sensitivity: 'public' });
        store.remember({ content: 'Private biography detail', sensitivity: 'private' });

        const results = store.search('biography', { maxSensitivity: 'personal' });
        expect(results.map((memory) => memory.sensitivity)).toEqual(['public']);
    });

    it('soft-deletes memories and removes them from retrieval', () => {
        const memory = store.remember({ content: 'My temporary launch code is bluebird' });

        expect(store.forget(memory.id)).toBe(true);
        expect(store.get(memory.id)).toBeNull();
        expect(store.get(memory.id, { includeForgotten: true }).status).toBe('forgotten');
        expect(store.search('bluebird')).toEqual([]);
        expect(store.stats()).toMatchObject({ total: 1, active: 0, forgotten: 1 });
    });

    it('builds bounded, source-attributed context', () => {
        store.remember({
            type: 'commitment',
            content: 'Send Minh the product brief on Friday',
            source: { kind: 'chat', title: 'Conversation with Minh' },
        });

        const result = store.buildContext('Minh product brief', { maxChars: 1000 });
        expect(result.context).toContain('[commitment | personal');
        expect(result.context).toContain('Source: Conversation with Minh');
        expect(result.memories).toHaveLength(1);
    });
});
