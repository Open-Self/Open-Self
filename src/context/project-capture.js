import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { chunkDocument } from './importer.js';
import { CaptureState } from './capture-state.js';

const DEFAULT_EXTENSIONS = new Set([
    '.c',
    '.cc',
    '.cpp',
    '.css',
    '.go',
    '.h',
    '.html',
    '.java',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.mdx',
    '.php',
    '.py',
    '.rb',
    '.rs',
    '.sh',
    '.sql',
    '.svelte',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.vue',
    '.xml',
    '.yaml',
    '.yml',
]);

const DEFAULT_IGNORED_DIRECTORIES = new Set([
    '.git',
    '.next',
    '.nuxt',
    '.openself',
    '.output',
    '.turbo',
    '.venv',
    'build',
    'coverage',
    'data',
    'dist',
    'node_modules',
    'out',
    'target',
    'vendor',
]);

const SENSITIVE_FILE_PATTERN = /(^|[._-])(credentials?|secrets?|private[-_]?key)([._-]|$)/i;
const SENSITIVE_EXTENSIONS = new Set(['.env', '.key', '.p12', '.pfx', '.pem']);
const STATE_VERSION = 1;

export class ProjectFolderCapture {
    constructor(store, folderPath, options = {}) {
        this.store = store;
        this.root = resolve(folderPath);
        if (!existsSync(this.root) || !statSync(this.root).isDirectory()) {
            throw new Error(`Project folder not found: ${this.root}`);
        }

        this.projectName = options.projectName || basename(this.root);
        this.scope = options.scope || `project/${slug(this.projectName)}`;
        this.sensitivity = options.sensitivity || 'private';
        this.maxFileBytes = positiveInteger(options.maxFileBytes, 256_000);
        this.maxChunkChars = positiveInteger(options.maxChunkChars, 8_000);
        this.extensions = normalizeExtensions(options.extensions || DEFAULT_EXTENSIONS);
        this.ignoredDirectories = new Set([
            ...DEFAULT_IGNORED_DIRECTORIES,
            ...(options.ignore || []).map((entry) => String(entry).trim()).filter(Boolean),
        ]);
        this.configHash = hash(
            JSON.stringify({
                scope: this.scope,
                sensitivity: this.sensitivity,
                maxFileBytes: this.maxFileBytes,
                maxChunkChars: this.maxChunkChars,
                extensions: [...this.extensions].sort(),
                ignoredDirectories: [...this.ignoredDirectories].sort(),
            }),
        );
        const stateDirectory =
            store.dbPath === ':memory:' ? join(this.root, '.openself') : dirname(store.dbPath);
        this.statePath =
            options.statePath ||
            join(stateDirectory, 'connectors', `project-${shortHash(this.root)}.json`);
        this.checkpoint = new CaptureState(
            store,
            ['project', this.root, options.statePath ? resolve(options.statePath) : null],
            this.statePath,
        );
    }

    scan(options = {}) {
        if (options.dryRun) return this._scan(options);
        return this.store.db.transaction(() => this._scan(options)).immediate();
    }

    _scan(options) {
        const dryRun = Boolean(options.dryRun);
        const previous = this._loadState();
        const discovered = this._discoverFiles();
        const currentPaths = new Set(discovered.map((file) => file.relativePath));
        const nextFiles = Object.assign(Object.create(null), previous.files);
        const report = {
            root: this.root,
            scope: this.scope,
            discovered: discovered.length,
            added: 0,
            updated: 0,
            removed: 0,
            unchanged: 0,
            skipped: 0,
            dryRun,
            errors: [],
        };

        for (const file of discovered) {
            try {
                const content = readFileSync(file.absolutePath, 'utf8');
                if (content.includes('\0')) {
                    report.skipped++;
                    continue;
                }
                const contentHash = hash(content);
                const prior = Object.hasOwn(previous.files, file.relativePath)
                    ? previous.files[file.relativePath]
                    : undefined;
                if (prior?.hash === contentHash) {
                    report.unchanged++;
                    continue;
                }

                const drafts = this._buildDrafts(file.relativePath, content);
                if (dryRun) {
                    if (prior) report.updated++;
                    else report.added++;
                    continue;
                }

                const memoryIds = this.store.db.transaction(() =>
                    this._syncMemories(prior?.memoryIds || [], drafts),
                )();
                nextFiles[file.relativePath] = { hash: contentHash, memoryIds };
                if (prior) report.updated++;
                else report.added++;
            } catch (error) {
                report.skipped++;
                report.errors.push({ file: file.relativePath, message: error.message });
            }
        }

        for (const [relativePath, prior] of Object.entries(previous.files)) {
            if (currentPaths.has(relativePath)) continue;
            report.removed++;
            if (dryRun) continue;
            for (const id of prior.memoryIds || []) this.store.forget(id);
            delete nextFiles[relativePath];
        }

        if (!dryRun) {
            this._writeState({
                version: STATE_VERSION,
                root: this.root,
                scope: this.scope,
                configHash: this.configHash,
                scannedAt: new Date().toISOString(),
                files: nextFiles,
            });
        }
        return report;
    }

    _discoverFiles() {
        const files = [];
        const visit = (directory) => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                if (entry.isSymbolicLink()) continue;
                if (entry.isDirectory()) {
                    if (!this.ignoredDirectories.has(entry.name))
                        visit(join(directory, entry.name));
                    continue;
                }
                if (!entry.isFile() || this._shouldIgnoreFile(entry.name)) continue;
                const absolutePath = join(directory, entry.name);
                const size = statSync(absolutePath).size;
                if (size > this.maxFileBytes) continue;
                files.push({
                    absolutePath,
                    relativePath: relative(this.root, absolutePath).replaceAll('\\', '/'),
                });
            }
        };
        visit(this.root);
        return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    }

    _shouldIgnoreFile(name) {
        const lowerName = name.toLowerCase();
        const extension = extname(lowerName);
        return (
            lowerName === '.env' ||
            lowerName.startsWith('.env.') ||
            SENSITIVE_EXTENSIONS.has(extension) ||
            SENSITIVE_FILE_PATTERN.test(lowerName) ||
            !this.extensions.has(extension)
        );
    }

    _buildDrafts(relativePath, content) {
        const chunks = chunkDocument(content, this.maxChunkChars);
        return chunks.map((chunk, index) => ({
            type: 'note',
            content: chunk.content,
            summary: chunk.heading || `${relativePath} - part ${index + 1}`,
            source: {
                kind: 'project-file',
                locator: relativePath,
                title: relativePath,
            },
            scope: this.scope,
            sensitivity: this.sensitivity,
            confidence: 1,
            tags: unique(['project', extensionTag(relativePath), chunk.heading]),
        }));
    }

    _syncMemories(previousIds, drafts) {
        const memoryIds = [];
        for (let index = 0; index < drafts.length; index++) {
            const previousId = previousIds[index];
            const memory = previousId
                ? this.store.update(previousId, drafts[index]) || this.store.remember(drafts[index])
                : this.store.remember(drafts[index]);
            memoryIds.push(memory.id);
        }
        for (const id of previousIds.slice(drafts.length)) this.store.forget(id);
        return memoryIds;
    }

    _loadState() {
        const state = this.checkpoint.load();
        if (!state) return emptyState();
        if (state.version !== STATE_VERSION || state.root !== this.root || !state.files) {
            throw new Error('Invalid or incompatible project capture checkpoint');
        }
        if (typeof state.files !== 'object' || Array.isArray(state.files))
            throw new Error('Invalid project capture checkpoint');
        for (const file of Object.values(state.files)) {
            if (
                !file ||
                typeof file.hash !== 'string' ||
                !Array.isArray(file.memoryIds) ||
                file.memoryIds.some((id) => typeof id !== 'string')
            )
                throw new Error('Invalid project capture checkpoint');
            if (file.memoryIds.some((id) => !this.store.get(id, { includeForgotten: true })))
                file.hash = '';
        }
        if (state.configHash !== this.configHash) {
            state.files = Object.fromEntries(
                Object.entries(state.files).map(([path, file]) => [path, { ...file, hash: '' }]),
            );
        }
        return state;
    }

    _writeState(state) {
        this.checkpoint.save(state);
    }
}

function emptyState() {
    return { version: STATE_VERSION, files: {} };
}

function normalizeExtensions(values) {
    return new Set(
        [...values].map((value) => {
            const extension = String(value).trim().toLowerCase();
            return extension.startsWith('.') ? extension : `.${extension}`;
        }),
    );
}

function extensionTag(path) {
    return extname(path).toLowerCase().replace(/^\./, '') || 'text';
}

function unique(values) {
    return [
        ...new Set(
            values
                .map((value) =>
                    String(value || '')
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean),
        ),
    ];
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function shortHash(value) {
    return hash(value).slice(0, 16);
}

function slug(value) {
    return (
        String(value || 'project')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80) || 'project'
    );
}

function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}
