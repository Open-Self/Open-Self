import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';

const proposal = {
    type: 'decision',
    content: 'Use SQLite for the database',
    scope: 'project/fixture',
    sensitivity: 'public',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2026-12-01T00:00:00Z',
};
const existing = {
    ...proposal,
    content: 'Use PostgreSQL for the database',
    validFrom: '2026-03-01T00:00:00Z',
    validTo: '2026-06-01T00:00:00Z',
};

describe.each([false, true])('conflict validity windows (encrypted: %s)', (encrypted) => {
    let store;
    beforeEach(() => {
        store = new ContextStore({
            dbPath: ':memory:',
            ...(encrypted ? { encryptionKey: Buffer.alloc(32, 8) } : {}),
        });
    });
    afterEach(() => store.close());

    it('finds a future interval contained inside the proposal without changing point-in-time search', () => {
        const memory = store.remember(existing);
        const conflicts = store.findPotentialConflicts(proposal, { threshold: 0 });
        expect(conflicts.map(({ id }) => id)).toEqual([memory.id]);
        expect(conflicts[0].similarity).toBe(conflicts[0].match.vectorSimilarity);
        expect(store.search('database', { asOf: proposal.validFrom })).toEqual([]);
    });

    it('uses unbounded validity when dates are missing and does not use occurredAt as a bound', () => {
        const memory = store.remember(existing);
        const draft = {
            ...proposal,
            validFrom: null,
            validTo: null,
            occurredAt: '2030-01-01T00:00:00Z',
        };
        expect(store.findPotentialConflicts(draft, { threshold: 0 }).map(({ id }) => id)).toEqual([
            memory.id,
        ]);
        expect(
            store.findPotentialConflicts(
                { ...draft, validTo: '2026-02-01T00:00:00Z' },
                { threshold: 0 },
            ),
        ).toEqual([]);
        expect(
            store.findPotentialConflicts(
                { ...draft, validFrom: '2026-07-01T00:00:00Z' },
                { threshold: 0 },
            ),
        ).toEqual([]);
    });

    it('includes touching boundaries across offsets and excludes a one-millisecond gap', () => {
        const memory = store.remember(existing);
        const draft = { ...proposal, validFrom: '2026-06-01T07:00:00+07:00' };
        expect(store.findPotentialConflicts(draft, { threshold: 0 }).map(({ id }) => id)).toEqual([
            memory.id,
        ]);
        expect(
            store.findPotentialConflicts(
                { ...draft, validFrom: '2026-06-01T00:00:00.001Z' },
                { threshold: 0 },
            ),
        ).toEqual([]);
    });

    it('applies exact scope, policy, dates, content and excluded IDs before result limits', () => {
        const excludeIds = [];
        for (let index = 0; index < 30; index++) {
            store.remember({ ...existing, content: proposal.content });
            store.remember({ ...existing, scope: 'project/fixture/child' });
            store.remember({ ...existing, sensitivity: 'restricted' });
            store.remember({ ...existing, type: 'note' });
            store.remember({ ...existing, validFrom: '2027-01-01T00:00:00Z', validTo: null });
            excludeIds.push(store.remember(existing).id);
        }
        const valid = store.remember({ ...existing, occurredAt: '2020-01-01T00:00:00Z' });
        const options = {
            threshold: 0,
            limit: 1,
            excludeIds,
            maxSensitivity: 'public',
            allowedScopes: ['project/fixture'],
        };
        expect(store.findPotentialConflicts(proposal, options).map(({ id }) => id)).toEqual([
            valid.id,
        ]);
        expect(store.findPotentialConflicts(proposal, { ...options, allowedScopes: [] })).toEqual(
            [],
        );
        store.forget(valid.id);
        expect(store.findPotentialConflicts(proposal, options)).toEqual([]);
    });

    it('does not surface a reversed legacy validity interval', () => {
        const invalid = store.remember(existing);
        store.db
            .prepare(
                'UPDATE memories SET valid_from = valid_to, valid_to = valid_from WHERE id = ?',
            )
            .run(invalid.id);
        expect(store.findPotentialConflicts(proposal, { threshold: 0 })).toEqual([]);
    });
});

it('identical content cannot exhaust the conflict candidate budget', () => {
    const store = new ContextStore({
        dbPath: ':memory:',
        vectorEncoder: { model: 'test-constant', encode: () => [1] },
    });
    try {
        store.db.transaction(() => {
            for (let index = 0; index < 5001; index++) store.remember(proposal);
        })();
        const valid = store.remember({ ...existing, occurredAt: '2020-01-01T00:00:00Z' });
        expect(store.findPotentialConflicts(proposal, { limit: 1 }).map(({ id }) => id)).toEqual([
            valid.id,
        ]);
    } finally {
        store.close();
    }
}, 20000);
