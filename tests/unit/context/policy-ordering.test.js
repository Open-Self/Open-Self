import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessPolicy } from '../../../src/context/access-policy.js';
import { ContextStore } from '../../../src/context/store.js';
import { verifyReceiptSignature } from '../../../src/context/signing.js';

/**
 * P0 regression: policy filters must run inside candidate discovery — before
 * ranking and truncation — so denied records can never starve allowed ones
 * out of the bounded candidate window. Covers lexical, vector, hybrid,
 * empty-query and async paths, plus the client-vs-owner receipt boundary.
 */

const reader = new AccessPolicy({
    clientId: 'alpha-reader',
    scopes: ['project/alpha'],
    deny: ['project/alpha/secrets'],
    maxSensitivity: 'private',
    minSourceTrust: 'external',
    capabilities: ['read'],
});

function vault() {
    return new ContextStore({ dbPath: ':memory:' });
}

/**
 * Seed N denied records that all match `term`, plus one allowed record.
 * The default exceeds the compiler's bounded candidate window (≤100), so a
 * denial that happens after retrieval would starve the allowed record out.
 */
function seedStarvation(store, { denied = 110, term = 'deploy' } = {}) {
    for (let index = 0; index < denied; index += 1) {
        store.remember({
            content: `${term} secret record ${index} confidential detail`,
            scope: 'project/alpha/secrets',
            sensitivity: 'restricted',
            sourceTrust: 'owner',
        });
    }
    const allowed = store.remember({
        content: `${term} runbook public step ordering`,
        scope: 'project/alpha',
        sensitivity: 'public',
    });
    return allowed;
}

describe('policy-ordered discovery (no top-k starvation)', () => {
    let store;
    afterEach(() => store?.close());

    it.each(['lexical', 'hybrid', 'vector'])(
        '%s retrieval: denied records cannot starve the allowed top-k',
        (retrieval) => {
            store = vault();
            const allowed = seedStarvation(store);
            const pkg = store.compileContext(
                { query: 'deploy', retrieval, explain: true },
                { policy: reader },
            );
            expect(pkg.memories.map((memory) => memory.id)).toContain(allowed.id);
            expect(pkg.context).not.toContain('confidential detail');
            // The client receipt must not even count the denied records.
            expect(pkg.receipt.candidates.some((c) => c.decision === 'denied')).toBe(false);
        },
    );

    it('async discovery applies the same policy filters as sync', async () => {
        store = vault();
        const allowed = seedStarvation(store);
        const pkg = await store.compileContextAsync(
            { query: 'deploy', explain: true },
            { policy: reader },
        );
        expect(pkg.memories.map((memory) => memory.id)).toEqual([allowed.id]);
        expect(pkg.context).not.toContain('confidential detail');
    });

    it('empty-query fallback is policy-filtered too', () => {
        store = vault();
        const allowed = seedStarvation(store, { denied: 110 });
        const pkg = store.compileContext(
            { query: '', scope: 'project/alpha', explain: true },
            { policy: reader },
        );
        expect(pkg.memories.map((memory) => memory.id)).toEqual([allowed.id]);
        expect(pkg.context).not.toContain('confidential detail');
    });

    it('a query with no FTS terms still respects asOf — not "now"', () => {
        store = vault();
        const expired = store.remember({
            content: 'staging checklist retired in 2020',
            scope: 'project/alpha',
            validFrom: '2020-01-01T00:00:00Z',
            validTo: '2020-06-01T00:00:00Z',
        });
        // '!!!' carries no indexable terms → list() fallback path.
        const pkg = store.compileContext(
            { query: '!!!', scope: 'project/alpha', asOf: '2020-03-01T00:00:00Z' },
            { policy: reader },
        );
        // At asOf 2020-03 the memory was current — it must be discoverable.
        expect(pkg.memories.map((memory) => memory.id)).toEqual([expired.id]);
    });

    it('empty allowed-scope set fails closed — never unbounded', () => {
        store = vault();
        store.remember({ content: 'alpha note', scope: 'project/alpha' });
        // Raw envelopes can express "no scopes" (AccessPolicy requires ≥1) —
        // the result must be deny-all, not unbounded.
        const pkg = store.compileContext(
            { query: 'alpha note' },
            { envelope: { clientId: 'no-scope', allowedScopes: [] } },
        );
        expect(pkg.memories).toHaveLength(0);
        expect(pkg.context).not.toContain('alpha note');
    });

    it('request scopes can only narrow — never widen — the envelope', () => {
        store = vault();
        store.remember({ content: 'finance ledger detail', scope: 'finance' });
        store.remember({ content: 'alpha deploy note', scope: 'project/alpha' });
        const pkg = store.compileContext(
            { query: 'finance ledger alpha deploy', scopes: ['finance', 'project/alpha'] },
            { policy: reader },
        );
        expect(pkg.context).toContain('alpha deploy');
        expect(pkg.context).not.toContain('finance ledger');
    });
});

describe('client receipts vs owner diagnostics', () => {
    let store;
    afterEach(() => store?.close());

    it('client receipts carry no denied candidates, deny roots, or denied totals', () => {
        store = vault();
        seedStarvation(store, { denied: 3 });
        const pkg = store.compileContext(
            { query: 'deploy', explain: true },
            { policy: reader },
        );
        expect(pkg.receipt.candidates.some((c) => c.decision === 'denied')).toBe(false);
        expect(pkg.receipt.totals.denied).toBeUndefined();
        expect(pkg.receipt.filters.deniedScopes).toBeNull();
        // The denied scope name itself must not appear in the JSON payload.
        expect(JSON.stringify(pkg.receipt)).not.toContain('project/alpha/secrets');
    });

    it('request fields cannot self-enable diagnostics', () => {
        store = vault();
        seedStarvation(store, { denied: 2 });
        expect(() =>
            store.compileContext(
                { query: 'deploy', diagnostics: true, explain: true },
                { policy: reader },
            ),
        ).toThrow(); // strict request schema strips/forbids unknown fields
        // And a caller that passes it through options gets a client receipt anyway.
        const pkg = store.compileContext(
            { query: 'deploy', explain: true },
            { policy: reader },
        );
        expect(pkg.receipt.candidates.every((c) => c.decision !== 'denied')).toBe(true);
    });

    it('diagnostics receipts enumerate denied candidates with id+hash+reason only', () => {
        store = vault();
        seedStarvation(store, { denied: 3 });
        const pkg = store.compileContext(
            { query: 'deploy', explain: true },
            { policy: reader, diagnostics: true },
        );
        const denied = pkg.receipt.candidates.filter((c) => c.decision === 'denied');
        expect(denied.length).toBe(3);
        for (const candidate of denied) {
            expect(candidate.reason).toBeDefined();
            expect(Object.keys(candidate).sort()).toEqual(
                ['contentHash', 'decision', 'id', 'reason'].sort(),
            );
        }
        expect(pkg.receipt.totals.denied).toBe(3);
        expect(pkg.receipt.filters.deniedScopes).toEqual(['project/alpha/secrets']);
    });
});

describe('receipt signatures bind the whole payload', () => {
    const dirs = [];
    afterEach(() => {
        while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
    });
    function signedVault() {
        const dir = mkdtempSync(join(tmpdir(), 'openself-rcpt-'));
        dirs.push(dir);
        return new ContextStore({ dataDir: dir });
    }

    it('receiptHash + receiptSignature verify against the emitted receipt', () => {
        const store = signedVault();
        store.remember({ content: 'alpha uses SQLite', scope: 'project/alpha' });
        const pkg = store.compileContext(
            { query: 'sqlite', scope: 'project/alpha', explain: true },
            { policy: reader },
        );
        expect(pkg.receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
        expect(pkg.receipt.receiptSignature).toBeDefined();
        expect(
            verifyReceiptSignature(pkg.receipt, store.signingIdentity.publicKey),
        ).toBe(true);
        store.close();
    });

    it('metadata tampering breaks the signature', () => {
        const store = signedVault();
        store.remember({ content: 'alpha uses SQLite', scope: 'project/alpha' });
        const pkg = store.compileContext(
            { query: 'sqlite', explain: true },
            { policy: reader },
        );
        const key = store.signingIdentity.publicKey;
        for (const tamper of [
            (receipt) => {
                receipt.requester.clientId = 'attacker';
            },
            (receipt) => {
                receipt.filters.maxSensitivity = 'restricted';
            },
            (receipt) => {
                receipt.asOf = '1999-01-01T00:00:00Z';
            },
            (receipt) => {
                receipt.candidates[0].decision = 'denied';
            },
        ]) {
            const forged = JSON.parse(JSON.stringify(pkg.receipt));
            tamper(forged);
            expect(verifyReceiptSignature(forged, key)).toBe(false);
        }
        store.close();
    });

    it('a wrong key cannot verify the receipt', () => {
        const store = signedVault();
        const other = signedVault();
        store.remember({ content: 'alpha uses SQLite', scope: 'project/alpha' });
        const pkg = store.compileContext(
            { query: 'sqlite', explain: true },
            { policy: reader },
        );
        expect(
            verifyReceiptSignature(pkg.receipt, other.signingIdentity.publicKey),
        ).toBe(false);
        store.close();
        other.close();
    });

    it('partial signature blocks fail closed', () => {
        const store = signedVault();
        store.remember({ content: 'alpha uses SQLite', scope: 'project/alpha' });
        const pkg = store.compileContext(
            { query: 'sqlite', explain: true },
            { policy: reader },
        );
        const key = store.signingIdentity.publicKey;
        const forged = JSON.parse(JSON.stringify(pkg.receipt));
        delete forged.receiptSignature;
        expect(verifyReceiptSignature(forged, key)).toBe(false);
        store.close();
    });
});
