import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import { normalizeMemory } from '../../../src/context/schema.js';

it('validates interval order by instant rather than ISO spelling', () => {
    expect(() =>
        normalizeMemory({
            content: 'Valid interval',
            validFrom: '2026-01-01T10:00:00+07:00',
            validTo: '2026-01-01T04:00:00Z',
        }),
    ).not.toThrow();
    expect(() =>
        normalizeMemory({
            content: 'Reversed interval',
            validFrom: '2026-01-01T03:00:00Z',
            validTo: '2026-01-01T09:00:00+07:00',
        }),
    ).toThrow('validFrom must be before validTo');
});

describe.each([false, true])('temporal retrieval (encrypted: %s)', (encrypted) => {
    let store;
    beforeEach(() => {
        store = new ContextStore({
            dbPath: ':memory:',
            ...(encrypted ? { encryptionKey: Buffer.alloc(32, 6) } : {}),
        });
    });
    afterEach(() => store.close());

    const readers = {
        lexical: (store, asOf) => store.search('database decision', { asOf, retrieval: 'lexical' }),
        vector: (store, asOf) => store.search('database decision', { asOf, retrieval: 'vector' }),
        hybrid: (store, asOf) => store.search('database decision', { asOf }),
        fallback: (store, asOf) => store.search('!!!', { asOf }),
        list: (store, asOf) => store.list({ asOf }),
        context: (store, asOf) => store.buildContext('database decision', { asOf }).memories,
    };
    it.each(Object.entries(readers))(
        '%s respects equivalent offsets and inclusive millisecond boundaries',
        (_name, read) => {
            const memory = store.remember({ content: 'database decision' });
            // Simulate an existing row written by a released version. Retrieval must
            // work without rewriting the stored spelling or requiring reimport.
            const start = '2026-01-01T15:00:00+07:00';
            const end = '2026-01-01T04:00:00.123-05:00';
            store.db
                .prepare('UPDATE memories SET valid_from = ?, valid_to = ? WHERE id = ?')
                .run(start, end, memory.id);
            for (const instant of [
                '2026-01-01T08:00:00Z',
                '2026-01-01T10:00:00.000+02:00',
                '2026-01-01T09:00:00.123Z',
                '2026-01-01T04:00:00.123-05:00',
            ])
                expect(read(store, instant).map(({ id }) => id)).toEqual([memory.id]);
            for (const instant of ['2026-01-01T07:59:59.999Z', '2026-01-01T09:00:00.124Z'])
                expect(read(store, instant)).toEqual([]);
            expect(store.get(memory.id)).toMatchObject({ validFrom: start, validTo: end });
        },
    );

    it('orders event times chronologically across offsets in every retrieval mode', () => {
        const older = store.remember({
            content: 'database decision',
            occurredAt: '2026-01-01T14:00:00+07:00',
        });
        const newer = store.remember({
            content: 'database decision',
            occurredAt: '2026-01-01T08:00:00Z',
        });
        for (const read of Object.values(readers))
            expect(read(store, '2026-01-01T09:00:00Z').map(({ id }) => id)).toEqual([
                newer.id,
                older.id,
            ]);
    });

    it('detects conflict overlap across UTC and offset representations', () => {
        const existing = store.remember({
            content: 'Use SQLite for the database',
            type: 'decision',
            validFrom: '2026-01-01T03:00:00Z',
            validTo: '2026-01-01T05:00:00Z',
        });
        const conflicts = store.findPotentialConflicts(
            {
                content: 'Use PostgreSQL for the database',
                type: 'decision',
                validFrom: '2026-01-01T10:00:00+07:00',
                validTo: '2026-01-01T12:00:00+07:00',
            },
            { threshold: 0 },
        );
        expect(conflicts.map(({ id }) => id)).toEqual([existing.id]);
    });

    it('uses the same millisecond precision for interval validation and retrieval', () => {
        const memory = store.remember({
            content: 'database decision',
            validFrom: '2026-01-01T08:00:00.1239Z',
            validTo: '2026-01-01T08:00:00.1239Z',
        });
        for (const read of Object.values(readers)) {
            expect(read(store, '2026-01-01T08:00:00.123Z').map(({ id }) => id)).toEqual([
                memory.id,
            ]);
            expect(read(store, '2026-01-01T08:00:00.124Z')).toEqual([]);
        }
    });

    it.each([
        null,
        42,
        'not a date',
        '',
        '2026-01-01',
        '2026-01-01T08:00:00',
        '2026-01-01T08:00:00+99:00',
    ])('rejects invalid asOf %j before any retrieval path', (asOf) => {
        for (const read of Object.values(readers)) expect(() => read(store, asOf)).toThrow();
    });
});
