import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { memoryContentHash, SENSITIVITY_LEVELS, SOURCE_TRUST_LEVELS } from './schema.js';
import { packageVersion } from '../version.js';

export const CONTEXT_EXPORT_FORMAT = 'openself-context';
export const CONTEXT_EXPORT_VERSION = 1;

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

    const lines = [
        JSON.stringify({
            format: CONTEXT_EXPORT_FORMAT,
            version: CONTEXT_EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            generator: `openself ${packageVersion}`,
            scope: scope || null,
            includeRestricted,
            count: memories.length,
        }),
        ...memories.map((memory) => JSON.stringify(serializeMemory(memory))),
    ];
    const payload = `${lines.join('\n')}\n`;

    const result = {
        format: CONTEXT_EXPORT_FORMAT,
        version: CONTEXT_EXPORT_VERSION,
        count: memories.length,
        scope: scope || null,
        includeRestricted,
        bytes: Buffer.byteLength(payload),
        dryRun: Boolean(options.dryRun),
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
    return report;
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
