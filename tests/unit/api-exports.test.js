import { expect, it } from 'vitest';
import * as api from '../../src/index.js';
import { publicExports } from '../contracts/exports.ts';

it('preserves every public root export declared to consumers', () => {
    expect(Object.keys(api).sort()).toEqual([...publicExports].sort());
});

it('returns no conflicts for punctuation-only proposals rather than assuming vector match metadata', () => {
    const store = new api.ContextStore({ dbPath: ':memory:' });
    try {
        store.remember({ type: 'preference', content: 'Use SQLite', scope: 'project/fixture' });
        expect(
            store.findPotentialConflicts({
                type: 'preference',
                content: '!!!',
                scope: 'project/fixture',
            }),
        ).toEqual([]);
    } finally {
        store.close();
    }
});
