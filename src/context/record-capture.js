import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const STATE_VERSION = 1;

export class RecordCapture {
    constructor(store, sourcePath, parser, options = {}) {
        this.store = store;
        this.sourcePath = resolve(sourcePath);
        if (!existsSync(this.sourcePath))
            throw new Error(`Capture source not found: ${this.sourcePath}`);
        const stats = statSync(this.sourcePath);
        if (!stats.isFile() && !stats.isDirectory()) {
            throw new Error(`Capture source must be a file or directory: ${this.sourcePath}`);
        }
        this.parser = parser;
        this.connector = options.connector || 'source';
        this.scope = options.scope || `${this.connector}/${slug(basename(this.sourcePath))}`;
        this.sensitivity = options.sensitivity || 'private';
        this.limit = positiveInteger(options.limit, 1_000);
        this.configHash = hash(
            JSON.stringify({
                connector: this.connector,
                scope: this.scope,
                sensitivity: this.sensitivity,
                limit: this.limit,
            }),
        );
        const stateDirectory =
            store.dbPath === ':memory:'
                ? join(dirname(this.sourcePath), '.openself')
                : dirname(store.dbPath);
        this.statePath =
            options.statePath ||
            join(
                stateDirectory,
                'connectors',
                `${this.connector}-${hash(this.sourcePath).slice(0, 16)}.json`,
            );
    }

    scan(options = {}) {
        const dryRun = Boolean(options.dryRun);
        const previous = this._loadState();
        const parsed = this.parser(this.sourcePath, {
            scope: this.scope,
            sensitivity: this.sensitivity,
            limit: this.limit,
        });
        const records = uniqueRecords(parsed);
        const currentKeys = new Set(records.map((record) => record.key));
        const nextRecords = { ...previous.records };
        const report = {
            source: this.sourcePath,
            connector: this.connector,
            scope: this.scope,
            discovered: records.length,
            added: 0,
            updated: 0,
            removed: 0,
            unchanged: 0,
            dryRun,
            errors: [],
        };

        for (const record of records) {
            const recordHash = hash(stableStringify(record.memory));
            const prior = previous.records[record.key];
            if (prior?.hash === recordHash) {
                report.unchanged++;
                continue;
            }
            if (dryRun) {
                if (prior) report.updated++;
                else report.added++;
                continue;
            }
            const memory = prior?.memoryId
                ? this.store.update(prior.memoryId, record.memory) ||
                  this.store.remember(record.memory)
                : this.store.remember(record.memory);
            nextRecords[record.key] = { hash: recordHash, memoryId: memory.id };
            if (prior) report.updated++;
            else report.added++;
        }

        for (const [key, prior] of Object.entries(previous.records)) {
            if (currentKeys.has(key)) continue;
            report.removed++;
            if (dryRun) continue;
            this.store.forget(prior.memoryId);
            delete nextRecords[key];
        }

        if (!dryRun) {
            this._writeState({
                version: STATE_VERSION,
                connector: this.connector,
                source: this.sourcePath,
                scope: this.scope,
                configHash: this.configHash,
                scannedAt: new Date().toISOString(),
                records: nextRecords,
            });
        }
        return report;
    }

    _loadState() {
        if (!existsSync(this.statePath)) return emptyState();
        try {
            const state = JSON.parse(readFileSync(this.statePath, 'utf8'));
            if (
                state.version !== STATE_VERSION ||
                state.connector !== this.connector ||
                state.source !== this.sourcePath ||
                !state.records
            ) {
                return emptyState();
            }
            if (state.configHash !== this.configHash) {
                state.records = Object.fromEntries(
                    Object.entries(state.records).map(([key, record]) => [
                        key,
                        { ...record, hash: '' },
                    ]),
                );
            }
            return state;
        } catch {
            return emptyState();
        }
    }

    _writeState(state) {
        mkdirSync(dirname(this.statePath), { recursive: true });
        const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
        writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
        renameSync(temporaryPath, this.statePath);
    }
}

function uniqueRecords(records) {
    const seen = new Set();
    const unique = [];
    for (const record of records) {
        const key = String(record.key || '').trim();
        if (!key) throw new Error('Capture parser returned a record without a key');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({ ...record, key });
    }
    return unique;
}

function emptyState() {
    return { version: STATE_VERSION, records: {} };
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function slug(value) {
    return (
        String(value || 'source')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80) || 'source'
    );
}

function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}
