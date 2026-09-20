import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ed25519 vault identity for cryptographic provenance.
 *
 * Each vault directory holds a persistent `signing-key.json` (mode 0600).
 * Context receipts and JSONL exports are signed over a domain-separated
 * digest so a consumer can verify that a receipt/export came from the
 * vault holding the matching private key — and that the bytes were not
 * modified in transit. Signatures prove *integrity and origin*, never
 * trust: imported records are still clamped to `external`.
 *
 * Signed payload format: `openself-sign-v1\n` + utf8(payload).
 */

export const SIGNING_DOMAIN = 'openself-sign-v1';
const KEY_FILE = 'signing-key.json';
const KEY_VERSION = 1;

export function signingFingerprint(publicKeyBase64) {
    return createHash('sha256')
        .update(`${SIGNING_DOMAIN}\n`)
        .update(publicKeyBase64, 'utf8')
        .digest('hex');
}

export function signPayload(privateKeyBase64, payload) {
    const privateKey = privateKeyFromBase64(privateKeyBase64);
    const data = Buffer.concat([
        Buffer.from(`${SIGNING_DOMAIN}\n`, 'utf8'),
        Buffer.from(String(payload), 'utf8'),
    ]);
    return sign(null, data, privateKey).toString('base64');
}

export function verifyPayload(publicKeyBase64, payload, signatureBase64) {
    try {
        const data = Buffer.concat([
            Buffer.from(`${SIGNING_DOMAIN}\n`, 'utf8'),
            Buffer.from(String(payload), 'utf8'),
        ]);
        return verify(
            null,
            data,
            publicKeyFromBase64(publicKeyBase64),
            Buffer.from(String(signatureBase64), 'base64'),
        );
    } catch {
        return false;
    }
}

/**
 * Deterministic JSON serialization — object keys sorted recursively, arrays
 * keep order, undefined-valued keys are dropped. Used so a receipt hash can
 * be recomputed from the emitted object regardless of key insertion order.
 */
export function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

const RECEIPT_SIGNATURE_FIELDS = ['receiptHash', 'receiptSignature', 'signer', 'signature'];

/**
 * Domain-separated digest over the emitted receipt fields — the payload a
 * receipt's `receiptSignature` covers. Everything that steers interpretation
 * (requester, filters, asOf, compiler/schema versions, budgets, per-candidate
 * decisions, contextHash) is bound; signature fields are excluded.
 */
export function receiptPayloadHash(receipt) {
    const payload = Object.fromEntries(
        Object.entries(receipt || {}).filter(([key]) => !RECEIPT_SIGNATURE_FIELDS.includes(key)),
    );
    return createHash('sha256')
        .update('openself-receipt-v1\n')
        .update(canonicalJson(payload), 'utf8')
        .digest('hex');
}

/**
 * Verify a context receipt's signature. Current receipts carry
 * `receiptSignature` over the full receipt payload (integrity + provenance of
 * the whole explanation); legacy receipts signed only `contextHash`, and stay
 * verifiable through the fallback. Returns false on any mismatch — signatures
 * prove integrity and origin, never that memory content is true.
 */
export function verifyReceiptSignature(receipt, publicKeyBase64) {
    if (!receipt || typeof receipt !== 'object') return false;
    if (receipt.receiptHash || receipt.receiptSignature) {
        if (!receipt.receiptHash || !receipt.receiptSignature) return false;
        if (receiptPayloadHash(receipt) !== receipt.receiptHash) return false;
        return verifyPayload(publicKeyBase64, receipt.receiptHash, receipt.receiptSignature);
    }
    if (receipt.signature && receipt.contextHash) {
        return verifyPayload(publicKeyBase64, receipt.contextHash, receipt.signature);
    }
    return false;
}

/**
 * Load (or create on first use) the vault signing identity for a data
 * directory. Returns null when the directory is not writable/readable —
 * read-only consumers simply omit signatures. Pass `create: false` for
 * non-mutating lookups (e.g. diagnostics) that must not materialize a key.
 */
export function loadSigningIdentity(dataDir, options = {}) {
    if (!dataDir) return null;
    const file = join(dataDir, KEY_FILE);
    try {
        if (!existsSync(file) && options.create === false) return null;
        if (existsSync(file)) {
            const parsed = JSON.parse(readFileSync(file, 'utf8'));
            if (parsed.version !== KEY_VERSION || !parsed.publicKey || !parsed.privateKey) {
                throw new Error(`Unsupported ${KEY_FILE} — expected version ${KEY_VERSION}`);
            }
            return identity(parsed.publicKey, parsed.privateKey, file, false);
        }
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const publicDer = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
        const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
        const document = {
            version: KEY_VERSION,
            algorithm: 'ed25519',
            publicKey: publicDer,
            privateKey: privateDer,
            createdAt: new Date().toISOString(),
        };
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
        });
        return identity(publicDer, privateDer, file, true);
    } catch (error) {
        if (error.code === 'EACCES' || error.code === 'EROFS' || error.code === 'EPERM') {
            return null;
        }
        throw error;
    }
}

function identity(publicKey, privateKey, file, created) {
    return {
        publicKey,
        fingerprint: signingFingerprint(publicKey),
        file,
        created,
        sign: (payload) => signPayload(privateKey, payload),
    };
}

function privateKeyFromBase64(base64) {
    return {
        key: Buffer.from(base64, 'base64'),
        format: 'der',
        type: 'pkcs8',
    };
}

function publicKeyFromBase64(base64) {
    return {
        key: Buffer.from(base64, 'base64'),
        format: 'der',
        type: 'spki',
    };
}
