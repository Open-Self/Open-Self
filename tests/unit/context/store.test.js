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
