import { createHash } from 'node:crypto';
import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { memoryContentHash, SENSITIVITY_LEVELS, SOURCE_TRUST_LEVELS } from './schema.js';
import { signingFingerprint, verifyPayload } from './signing.js';
import { redactSecrets, scanForSecrets, summarizeFindings } from './secrets.js';
import { packageVersion } from '../version.js';

export const CONTEXT_EXPORT_FORMAT = 'openself-context';
export const CONTEXT_EXPORT_VERSION = 1;

/**
 * Domain-separated digest over the record lines of an export — this is the
 * payload the vault signature covers. Spec §4.
 */
export function exportPayloadHash(recordLines) {
    return createHash('sha256')
        .update('openself-export-v1\n')
        .update(recordLines.join('\n'), 'utf8')
        .digest('hex');
}

/**
 * Human-readable, versioned context export (JSONL). This is an
 * interoperability format — it is plaintext and is NOT the encrypted
 * `.osbackup` vault backup.
 *
 * `restricted` memories require `includeRestricted: true`; everything else
 * exports at or below `maxSensitivity` (default `private`).
 */
export function exportMemories(store, options = {}) {
    const scope = options.scope || undefined;
    const includeRestricted = Boolean(options.includeRestricted);
    const maxSensitivity = includeRestricted ? 'restricted' : options.maxSensitivity || 'private';
    if (!SENSITIVITY_LEVELS.includes(maxSensitivity)) {
        throw new Error('maxSensitivity must be public, personal, private, or restricted');
    }

    const memories = collectAll(store, {
        scope,
        maxSensitivity,
        sensitivityRestrictedSkipped: !includeRestricted,
    });

    // Secret hygiene: always scan; --redact strips matches before hashing so
    // contentHash/ signature cover the redacted bytes actually written.
    const redact = Boolean(options.redact);
    const findings = [];
    const exportable = memories.map((memory) => {
        if (!redact) {
            const found = scanMemory(memory);
            if (found.length) findings.push({ id: memory.id, findings: found });
            return memory;
        }
        const content = redactSecrets(memory.content);
        const summary = redactSecrets(memory.summary || '');
        const count = content.findings.length + summary.findings.length;
        if (count)
            findings.push({ id: memory.id, findings: [...content.findings, ...summary.findings] });
        // Drop the stale hash — serializeMemory re-computes it over the
        // redacted bytes so the exported record stays self-consistent.
        return count
            ? { ...memory, content: content.text, summary: summary.text, contentHash: undefined }
            : memory;
    });

    const recordLines = exportable.map((memory) => JSON.stringify(serializeMemory(memory)));
    const header = {
        format: CONTEXT_EXPORT_FORMAT,
        version: CONTEXT_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        generator: `openself ${packageVersion}`,
        scope: scope || null,
        includeRestricted,
        count: memories.length,
    };

    // Cryptographic provenance: sign the record payload with the vault's
    // Ed25519 identity (spec §4). `sign: false` opts out.
    const identity = options.sign === false ? null : store.signingIdentity;
    if (identity) {
        header.exportHash = exportPayloadHash(recordLines);
        header.signer = identity.fingerprint;
        header.publicKey = identity.publicKey;
        header.signature = identity.sign(header.exportHash);
    }

    const lines = [JSON.stringify(header), ...recordLines];
    const payload = `${lines.join('\n')}\n`;

    const result = {
        format: CONTEXT_EXPORT_FORMAT,
        version: CONTEXT_EXPORT_VERSION,
        count: memories.length,
        scope: scope || null,
        includeRestricted,
        bytes: Buffer.byteLength(payload),
        dryRun: Boolean(options.dryRun),
        signed: Boolean(identity),
        signer: identity?.fingerprint || null,
        secrets: summarizeFindings(findings, redact),
    };

    if (options.dryRun) return { ...result, memories };

    if (!options.file) throw new Error('An export --file is required (or use --dry-run)');
    const file = resolve(options.file);
    if (existsSync(file) && statSync(file).isDirectory()) {
        throw new Error(`Export path is a directory: ${file}`);
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, payload, { encoding: 'utf8', mode: 0o600 });
    return { ...result, file };
}

export function serializeMemory(memory) {
    return {
        id: memory.id,
        type: memory.type,
        content: memory.content,
        contentHash: memory.contentHash || memoryContentHash(memory.content),
        summary: memory.summary,
        source: memory.source,
        scope: memory.scope,
        sensitivity: memory.sensitivity,
        sourceTrust: memory.sourceTrust || 'owner',
        confidence: memory.confidence,
        validFrom: memory.validFrom ?? null,
        validTo: memory.validTo ?? null,
        occurredAt: memory.occurredAt ?? null,
        tags: memory.tags,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
    };
}

/**
 * Parse an OpenSelf JSONL export into validated memory candidates. Imported
 * trust is capped at `external`: a file can describe content but cannot claim
 * owner authorship.
 */
export function parseContextExport(text) {
    const lines = String(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (!lines.length) throw new Error('Empty export file');
    let header;
    try {
        header = JSON.parse(lines[0]);
    } catch {
        throw new Error('First line must be the openself-context export header');
    }
    if (header.format !== CONTEXT_EXPORT_FORMAT) {
        throw new Error(`Unsupported export format: ${header.format || 'unknown'}`);
    }
    if (header.version !== CONTEXT_EXPORT_VERSION) {
        throw new Error(`Unsupported export version: ${header.version}`);
    }
    const records = [];
    const errors = [];
    for (let index = 1; index < lines.length; index++) {
        try {
            const raw = JSON.parse(lines[index]);
            // Spec §3: a recomputed contentHash that differs marks a corrupt
            // record — surface it as an error instead of importing tampered
            // content.
            if (raw.contentHash && memoryContentHash(raw.content) !== raw.contentHash) {
                throw new Error('contentHash mismatch');
            }
            records.push({
                memory: {
                    id: raw.id,
                    type: raw.type,
                    content: raw.content,
                    summary: raw.summary,
                    source: raw.source,
                    scope: raw.scope,
                    sensitivity: raw.sensitivity,
                    sourceTrust: clampImportedTrust(raw.sourceTrust),
                    confidence: raw.confidence,
                    validFrom: raw.validFrom,
                    validTo: raw.validTo,
                    occurredAt: raw.occurredAt,
                    tags: raw.tags,
                },
                dedupeKey: `openself-export:${raw.id || `line-${index}`}`,
            });
        } catch (error) {
            errors.push(`line ${index + 1}: ${error.message}`);
        }
    }
    return { header, records, errors };
}

/**
 * Non-throwing validator for spec/consumers: returns a structured report
 * instead of raising. Verifies header shape, per-record JSON, required
 * fields, and contentHash integrity (when present).
 */
export function validateContextExport(text) {
    const report = { ok: true, errors: [], records: 0, header: null };
    const lines = String(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (!lines.length) {
        report.ok = false;
        report.errors.push('empty file');
        return report;
    }
    try {
        report.header = JSON.parse(lines[0]);
    } catch {
        report.ok = false;
        report.errors.push('line 1: header is not valid JSON');
        return report;
    }
    if (report.header.format !== CONTEXT_EXPORT_FORMAT) {
        report.ok = false;
        report.errors.push(`line 1: unsupported format "${report.header.format}"`);
    }
    if (report.header.version !== CONTEXT_EXPORT_VERSION) {
        report.ok = false;
        report.errors.push(`line 1: unsupported version ${report.header.version}`);
    }
    for (let index = 1; index < lines.length; index++) {
        let raw;
        try {
            raw = JSON.parse(lines[index]);
        } catch {
            report.ok = false;
            report.errors.push(`line ${index + 1}: invalid JSON`);
            continue;
        }
        const missing = [
            'id',
            'type',
            'content',
            'contentHash',
            'scope',
            'sensitivity',
            'sourceTrust',
        ].filter((field) => raw[field] === undefined);
        if (missing.length) {
            report.ok = false;
            report.errors.push(`line ${index + 1}: missing ${missing.join(', ')}`);
            continue;
        }
        if (memoryContentHash(raw.content) !== raw.contentHash) {
            report.ok = false;
            report.errors.push(`line ${index + 1}: contentHash mismatch`);
            continue;
        }
        report.records += 1;
    }
    verifyExportSignature(report, lines.slice(1));
    return report;
}

/**
 * When the header carries a signature, the whole record payload must verify
 * against the embedded public key — an invalid signature marks the export
 * as tampered. Absent signatures are legal (unsigned exports exist) and are
 * reported as `present: false`.
 */
function verifyExportSignature(report, recordLines) {
    const { signature, publicKey, exportHash, signer } = report.header;
    if (!signature && !publicKey && !exportHash) {
        report.signature = { present: false };
        return;
    }
    report.signature = { present: true, signer: signer || null, valid: false };
    if (!signature || !publicKey || !exportHash || !signer) {
        report.ok = false;
        report.errors.push(
            'line 1: incomplete signature block (signer/publicKey/exportHash/signature)',
        );
        return;
    }
    if (exportHash !== exportPayloadHash(recordLines)) {
        report.ok = false;
        report.errors.push('line 1: exportHash does not match the record payload');
        return;
    }
    if (signer !== signingFingerprint(publicKey)) {
        report.ok = false;
        report.errors.push('line 1: signer does not match publicKey');
        return;
    }
    if (!verifyPayload(publicKey, exportHash, signature)) {
        report.ok = false;
        report.errors.push('line 1: signature verification failed');
        return;
    }
    report.signature.valid = true;
}

function scanMemory(memory) {
    return [...scanForSecrets(memory.content), ...scanForSecrets(memory.summary || '')];
}

function clampImportedTrust(value) {
    const index = SOURCE_TRUST_LEVELS.indexOf(value);
    // Imported memories can never arrive with owner/verified trust.
    return index <= SOURCE_TRUST_LEVELS.indexOf('external')
        ? SOURCE_TRUST_LEVELS[Math.max(index, 0)]
        : 'external';
}

function collectAll(store, { scope, maxSensitivity }) {
    const memories = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
        const page = store.list({ scope, maxSensitivity, limit: pageSize, offset });
        memories.push(...page);
        if (page.length < pageSize) break;
    }
    return memories;
}
