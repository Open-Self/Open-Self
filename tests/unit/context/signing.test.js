import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextStore } from '../../../src/context/store.js';
import {
    loadSigningIdentity,
    signingFingerprint,
    verifyPayload,
} from '../../../src/context/signing.js';
import { exportMemories, validateContextExport } from '../../../src/context/exporter.js';
import { ContextImporter } from '../../../src/context/importer.js';
import { redactSecrets, scanForSecrets } from '../../../src/context/secrets.js';

const dirs = [];
function vault() {
    const dir = mkdtempSync(join(tmpdir(), 'openself-sign-'));
    dirs.push(dir);
    return dir;
}

afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('vault signing identity', () => {
    it('creates a persistent 0600 key and reloads it', () => {
        const dir = vault();
        const first = loadSigningIdentity(dir);
        expect(first.created).toBe(true);
        expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
        const keyFile = join(dir, 'signing-key.json');
        expect(JSON.parse(readFileSync(keyFile, 'utf8')).algorithm).toBe('ed25519');
        const second = loadSigningIdentity(dir);
        expect(second.created).toBe(false);
        expect(second.fingerprint).toBe(first.fingerprint);
        expect(second.publicKey).toBe(first.publicKey);
    });

    it('signs and verifies domain-separated payloads', () => {
        const identity = loadSigningIdentity(vault());
        const signature = identity.sign('payload');
        expect(verifyPayload(identity.publicKey, 'payload', signature)).toBe(true);
        expect(verifyPayload(identity.publicKey, 'other', signature)).toBe(false);
        expect(verifyPayload(identity.publicKey, 'payload', 'bogus')).toBe(false);
        expect(signingFingerprint(identity.publicKey)).toBe(identity.fingerprint);
    });

    it('rejects a corrupt key file', () => {
        const dir = vault();
        writeFileSync(join(dir, 'signing-key.json'), '{"version":99}');
        expect(() => loadSigningIdentity(dir)).toThrow('signing-key');
    });
});

describe('signed receipts', () => {
    it('explain receipts carry a verifiable signature over contextHash', () => {
        const dir = vault();
        const store = new ContextStore({ dataDir: dir });
        store.remember({ content: 'Atlas deploys via GitHub Actions', scope: 'project/atlas' });
        const result = store.buildContext('deploys', { scope: 'project/atlas', explain: true });
        expect(result.receipt.signer).toMatch(/^[0-9a-f]{64}$/);
        expect(
            verifyPayload(
                store.signingIdentity.publicKey,
                result.receipt.contextHash,
                result.receipt.signature,
            ),
        ).toBe(true);
        store.close();
    });
});

describe('signed exports', () => {
    function seedStore(dir) {
        const store = new ContextStore({ dataDir: dir });
        store.remember({ content: 'Deploys run through GitHub Actions', type: 'fact' });
        return store;
    }

    it('signs exports and verifies them end-to-end', () => {
        const dir = vault();
        const store = seedStore(dir);
        const file = join(dir, 'out.jsonl');
        const report = exportMemories(store, { file });
        expect(report.signed).toBe(true);
        const text = readFileSync(file, 'utf8');
        const validation = validateContextExport(text);
        expect(validation.ok).toBe(true);
        expect(validation.signature).toEqual({
            present: true,
            signer: store.signingIdentity.fingerprint,
            valid: true,
        });
        store.close();
    });

    it('detects payload tampering under a valid signature block', () => {
        const dir = vault();
        const store = seedStore(dir);
        const file = join(dir, 'out.jsonl');
        exportMemories(store, { file });
        const lines = readFileSync(file, 'utf8').split('\n');
        const record = JSON.parse(lines[1]);
        record.content = 'tampered content';
        lines[1] = JSON.stringify(record);
        const validation = validateContextExport(lines.join('\n'));
        expect(validation.ok).toBe(false);
        expect(validation.signature.valid).toBe(false);
        store.close();
    });

    it('unsigned exports stay valid; --no-sign omits the block', () => {
        const dir = vault();
        const store = seedStore(dir);
        const file = join(dir, 'out.jsonl');
        exportMemories(store, { file, sign: false });
        const validation = validateContextExport(readFileSync(file, 'utf8'));
        expect(validation.ok).toBe(true);
        expect(validation.signature).toEqual({ present: false });
        store.close();
    });

    it('refuses to import a tampered signed export', () => {
        const dir = vault();
        const store = seedStore(dir);
        const file = join(dir, 'out.jsonl');
        exportMemories(store, { file });
        const lines = readFileSync(file, 'utf8').split('\n');
        const record = JSON.parse(lines[1]);
        record.content = 'tampered';
        record.contentHash = undefined; // strip hash so the mutation is not caught by it
        delete record.contentHash;
        lines[1] = JSON.stringify(record);
        writeFileSync(file, lines.join('\n'));

        const target = new ContextStore({ dataDir: vault() });
        const importer = new ContextImporter(target);
        expect(() => importer.importFile(file)).toThrow('signature');
        store.close();
        target.close();
    });

    it('imports a validly signed export and reports the signature', () => {
        const dir = vault();
        const store = seedStore(dir);
        const file = join(dir, 'out.jsonl');
        exportMemories(store, { file });
        const target = new ContextStore({ dataDir: vault() });
        const report = new ContextImporter(target).importFile(file);
        expect(report.created).toBe(1);
        expect(report.signature.valid).toBe(true);
        expect(target.list()[0].sourceTrust).toBe('external'); // trust clamp still applies
        store.close();
        target.close();
    });
});

describe('secret scanning', () => {
    it('detects common credential shapes', () => {
        const text = [
            'aws AKIAIOSFODNN7EXAMPLE',
            'ghp_abcdefghijklmnop123456',
            'sk-proj-abcdefghijklmnopqrstuvwxyz',
            'api_key = "supersecretvalue123"',
            '-----BEGIN RSA PRIVATE KEY-----',
        ].join('\n');
        const kinds = scanForSecrets(text).map((f) => f.kind);
        expect(kinds).toContain('aws-access-key');
        expect(kinds).toContain('github-token');
        expect(kinds).toContain('openai-key');
        expect(kinds).toContain('credential-assignment');
        expect(kinds).toContain('private-key-block');
        expect(scanForSecrets('nothing secret here')).toEqual([]);
    });

    it('redactSecrets strips matches without leaking them', () => {
        const { text, findings } = redactSecrets('token: ghp_abcdefghijklmnop123456');
        expect(text).not.toContain('ghp_abcdefghijklmnop123456');
        expect(text).toContain('[REDACTED:github-token]');
        expect(findings[0].match).not.toContain('123456'); // masked preview
    });

    it('export --redact strips secrets and reports them', () => {
        const dir = vault();
        const store = new ContextStore({ dataDir: dir });
        store.remember({ content: 'api_key = "supersecretvalue123" for the vendor' });
        const file = join(dir, 'out.jsonl');
        const report = exportMemories(store, { file, redact: true });
        expect(report.secrets.findings).toBeGreaterThan(0);
        expect(report.secrets.redacted).toBe(true);
        store.close();
        const text = readFileSync(file, 'utf8');
        expect(text).not.toContain('supersecretvalue123');
        expect(text).toContain('[REDACTED:credential-assignment]');
        expect(validateContextExport(text).ok).toBe(true); // still hash-consistent
    });

    it('export without --redact still reports findings as a warning', () => {
        const dir = vault();
        const store = new ContextStore({ dataDir: dir });
        store.remember({ content: 'aws key AKIAIOSFODNN7EXAMPLE inside' });
        const report = exportMemories(store, { file: join(dir, 'out.jsonl') });
        expect(report.secrets.findings).toBeGreaterThan(0);
        expect(report.secrets.redacted).toBe(false);
        store.close();
    });
});

describe('sweepExpired', () => {
    it('forgets memories whose validTo has lapsed', () => {
        const dir = vault();
        const store = new ContextStore({ dataDir: dir });
        store.remember({
            content: 'expired fact',
            validFrom: '2020-01-01T00:00:00.000Z',
            validTo: '2020-02-01T00:00:00.000Z',
        });
        store.remember({ content: 'still valid', validTo: '2999-01-01T00:00:00.000Z' });
        store.remember({ content: 'no expiry' });

        const dry = store.sweepExpired({ dryRun: true });
        expect(dry.expired).toBe(1);
        expect(store.list()).toHaveLength(3); // dry-run changed nothing

        const report = store.sweepExpired();
        expect(report.swept).toBe(1);
        expect(store.list()).toHaveLength(2);
        expect(store.list({ includeForgotten: true })).toHaveLength(3);
        store.close();
    });
});
