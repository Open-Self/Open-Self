import { afterEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

describe('context receipts', () => {
    let store;
    afterEach(() => store?.close());

    it('explains exactly which memories were selected and why', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        const keeper = store.remember({
            type: 'decision',
            content: 'Atlas uses SQLite for portable offline operation',
            scope: 'project/atlas',
        });
        const overflow = store.remember({
            type: 'fact',
            content: 'Atlas also evaluated Postgres and rejected it for weight',
            scope: 'project/atlas',
        });
        const result = store.buildContext('what database does Atlas use', {
            scope: 'project/atlas',
            explain: true,
            maxChars: 600,
        });
        expect(result.receipt.version).toBe(1);
        expect(result.receipt.query).toBe('what database does Atlas use');
        expect(result.receipt.filters.scope).toBe('project/atlas');
        expect(result.receipt.totals.candidates).toBe(2);

        const byId = Object.fromEntries(
            result.receipt.candidates.map((entry) => [entry.id, entry]),
        );
        expect(byId[keeper.id] || byId[overflow.id]).toBeDefined();
        for (const candidate of result.receipt.candidates) {
            expect(['selected', 'skipped']).toContain(candidate.decision);
            expect(candidate.reason).toBeTruthy();
            expect(candidate.source.kind).toBeTruthy();
        }
        const selectedIds = result.receipt.candidates
            .filter((entry) => entry.decision === 'selected')
            .map((entry) => entry.id);
        expect(selectedIds.sort()).toEqual(result.memories.map((memory) => memory.id).sort());
        expect(result.receipt.totals.usedChars).toBe(result.usedChars);
    });

    it('does not include a receipt unless explain is requested', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        store.remember({ content: 'plain build' });
        expect(store.buildContext('plain').receipt).toBeUndefined();
    });

    it('never reveals denied memories in the receipt', () => {
        store = new ContextStore({ dbPath: ':memory:' });
        store.remember({
            content: 'restricted banking detail',
            sensitivity: 'restricted',
            scope: 'personal/finance',
        });
        store.remember({ content: 'public fact', sensitivity: 'public' });
        const result = store.buildContext('banking', {
            maxSensitivity: 'private',
            explain: true,
        });
        const ids = result.receipt.candidates.map((entry) => entry.id);
        expect(result.memories.every((memory) => memory.sensitivity !== 'restricted')).toBe(true);
        // The denied memory is filtered before candidacy — it never appears.
        expect(result.receipt.candidates.length).toBe(ids.length);
        expect(result.context).not.toContain('banking detail');
    });
});
