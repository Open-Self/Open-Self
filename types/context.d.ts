import type { Buffer } from 'node:buffer';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

export type MemoryType =
    'fact' | 'preference' | 'decision' | 'commitment' | 'relationship' | 'event' | 'note';
export type Sensitivity = 'public' | 'personal' | 'private' | 'restricted';
export type RetrievalMode = 'hybrid' | 'lexical' | 'vector';
export interface MemorySource {
    kind: string;
    locator: string;
    title: string;
}
export interface MemoryInput {
    content: string;
    id?: string;
    type?: MemoryType;
    summary?: string;
    source?: Partial<MemorySource>;
    scope?: string;
    sensitivity?: Sensitivity;
    confidence?: number;
    validFrom?: string | null;
    validTo?: string | null;
    occurredAt?: string | null;
    tags?: readonly string[];
}
export interface MemoryRecord extends MemoryInput {
    id: string;
    type: MemoryType;
    summary: string;
    source: MemorySource;
    scope: string;
    sensitivity: Sensitivity;
    confidence: number;
    tags: string[];
    status: 'active' | 'forgotten';
    createdAt: string;
    updatedAt: string;
    forgottenAt?: string | null;
}
export interface RetrievalMatch {
    lexicalRank: number | null;
    vectorRank: number | null;
    vectorSimilarity: number | null;
}
export interface SearchMemory extends MemoryRecord {
    relevance?: number;
    match?: RetrievalMatch;
}
export interface SearchOptions {
    scope?: string;
    allowedScopes?: readonly string[];
    type?: MemoryType;
    maxSensitivity?: Sensitivity;
    asOf?: string;
    retrieval?: RetrievalMode;
    limit?: number;
    vectorCandidateLimit?: number;
    minVectorScore?: number;
}
export interface ListOptions extends Pick<
    SearchOptions,
    'scope' | 'allowedScopes' | 'type' | 'maxSensitivity' | 'asOf' | 'limit'
> {
    offset?: number;
    includeForgotten?: boolean;
}
export interface ConflictOptions {
    threshold?: number;
    limit?: number;
    excludeIds?: readonly string[];
    maxSensitivity?: Sensitivity;
    allowedScopes?: readonly string[];
}
export interface ConflictMemory extends SearchMemory {
    similarity: number;
    reason: string;
}
export interface MemoryVersion {
    version: number;
    changeKind: string;
    changedAt: string;
    snapshot: MemoryRecord;
}
export interface ContextBlock {
    query: string;
    /** Complete records with attribution; bounded by maxChars (UTF-16 code units). */
    context: string;
    /** Only the records included in context, in retrieval order. */
    memories: SearchMemory[];
    /** Exactly context.length, including separators. */
    usedChars: number;
}
export type VaultKey = string | Buffer;
export interface VectorEncoder {
    model: string;
    encode(text: string): number[];
}
export interface ContextStoreOptions {
    dataDir?: string;
    dbPath?: string | Buffer;
    encryptionKey?: VaultKey;
    vectorEncoder?: VectorEncoder;
}
export interface VaultStats {
    total: number;
    active: number;
    forgotten: number;
    vectors: number;
    vectorModel: string;
    encrypted: boolean;
    byType: Partial<Record<MemoryType, number>>;
    dbPath: string;
}
export class ContextStore {
    constructor(options?: ContextStoreOptions);
    readonly dbPath: string;
    readonly encryptionEnabled: boolean;
    /** Low-level owner access. Not covered by the prospective stable API contract. */
    readonly db: Database.Database;
    remember(input: MemoryInput): MemoryRecord;
    rememberOnce(
        input: MemoryInput,
        dedupeKey: string,
    ): { memory: MemoryRecord | null; created: boolean };
    update(id: string, changes: Partial<MemoryInput>): MemoryRecord | null;
    get(id: string, options?: { includeForgotten?: boolean }): MemoryRecord | null;
    history(id: string): MemoryVersion[];
    merge(
        primaryId: string,
        duplicateIds: readonly string[],
        changes?: Partial<MemoryInput>,
    ): { memory: MemoryRecord; mergedIds: string[] };
    search(query: string, options?: SearchOptions): SearchMemory[];
    list(options?: ListOptions): MemoryRecord[];
    findPotentialConflicts(input: MemoryInput, options?: ConflictOptions): ConflictMemory[];
    buildContext(query: string, options?: SearchOptions & { maxChars?: number }): ContextBlock;
    forget(id: string): boolean;
    stats(): VaultStats;
    close(): void;
}
export function normalizeMemory(input: MemoryInput, now?: Date): MemoryRecord;
export const memoryInputSchema: z.ZodType<
    Omit<MemoryRecord, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'forgottenAt'> & {
        id?: string;
    },
    MemoryInput
>;

export type ImportFormat = 'markdown' | 'text' | 'whatsapp' | 'telegram';
export interface ImportOptions extends Pick<
    MemoryInput,
    'scope' | 'sensitivity' | 'type' | 'confidence' | 'tags'
> {
    format?: ImportFormat | 'auto';
    maxChunkChars?: number;
    dryRun?: boolean;
}
export interface ImportReport {
    format: ImportFormat;
    source: string;
    discovered: number;
    created: number;
    duplicates: number;
    skipped: number;
    dryRun: boolean;
    errors: string[];
}
export class ContextImporter {
    constructor(store: ContextStore);
    importFile(filePath: string, options?: ImportOptions): ImportReport;
}
export function detectImportFormat(filePath: string): ImportFormat;
export function chunkDocument(
    content: string,
    maxChars?: number,
): { heading: string; content: string }[];
export class LocalVectorEncoder implements VectorEncoder {
    constructor(options?: { dimensions?: number });
    dimensions: number;
    model: string;
    encode(text: string): number[];
}
export function cosineSimilarity(left: number[], right: number[]): number;

export interface CaptureOptions {
    scope?: string;
    sensitivity?: Sensitivity;
    statePath?: string;
}
export interface CaptureReport {
    scope: string;
    discovered: number;
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
    dryRun: boolean;
}
export class ProjectFolderCapture {
    constructor(
        store: ContextStore,
        folderPath: string,
        options?: CaptureOptions & {
            projectName?: string;
            maxFileBytes?: number;
            maxChunkChars?: number;
            extensions?: Iterable<string>;
            ignore?: string[];
        },
    );
    readonly statePath: string;
    scan(options?: { dryRun?: boolean }): CaptureReport & {
        root: string;
        skipped: number;
        errors: { file: string; message: string }[];
    };
}
export interface CaptureParserOptions {
    scope: string;
    sensitivity: Sensitivity;
    limit: number;
}
export type CaptureParser = (
    sourcePath: string,
    options: CaptureParserOptions,
) => { key: string; memory: MemoryInput }[];
export class RecordCapture {
    constructor(
        store: ContextStore,
        sourcePath: string,
        parser: CaptureParser,
        options?: CaptureOptions & { connector?: string; limit?: number },
    );
    readonly statePath: string;
    scan(options?: {
        dryRun?: boolean;
    }): CaptureReport & { source: string; connector: string; errors: string[] };
}
export const parseCalendarSource: CaptureParser;
export const parseEmailSource: CaptureParser;
export const parseBrowserSource: CaptureParser;

export class VaultCodec {
    constructor(key: VaultKey);
    readonly enabled: true;
    encode(value: unknown, purpose?: string): string;
    decode(value: unknown, purpose?: string): string;
    indexText(value: string): string;
    indexQuery(value: string): string;
    isEncrypted(value: unknown): boolean;
}
export class PlaintextCodec {
    readonly enabled: false;
    encode(value: unknown): string;
    decode(value: unknown): string;
    indexText(value: string): string;
    indexQuery(value: string): string;
    isEncrypted(): false;
}
export function normalizeKey(value: VaultKey): Buffer;
export interface KeyBackend {
    provider: string;
    store(id: string, key: Buffer): void;
    load(id: string): Buffer;
}
export interface VaultConfiguration {
    version: 1;
    encrypted: true;
    provider: string;
    keyId: string;
    createdAt: string;
}
export type VaultKeyStatus =
    | { configured: false; configPath: string }
    | (VaultConfiguration & {
          configured: true;
          configPath: string;
          keyAvailable: boolean;
          error?: string;
      });
export class VaultKeyManager {
    constructor(dataDir?: string, options?: { backend?: KeyBackend });
    initialize(options?: { key?: VaultKey }): { config: VaultConfiguration; key: Buffer };
    loadKey(): Buffer;
    status(): VaultKeyStatus;
}
export function loadConfiguredVaultKey(dataDir?: string): Buffer | null;
export function backupVault(
    store: ContextStore,
    outputPath: string,
    options: { passphrase: string },
): Promise<{ path: string; bytes: number; createdAt: string }>;
export function restoreVault(
    backupPath: string,
    destination: string,
    options: { passphrase: string; keyBackend?: KeyBackend },
): Promise<{ dataDir: string; createdAt: string; encrypted: true }>;

export type McpCapability = 'read' | 'remember' | 'forget';
export interface McpPolicy {
    clientId: string;
    scopes: readonly string[];
    maxSensitivity: Sensitivity;
    capabilities: readonly McpCapability[];
}
export function loadMcpPolicy(path: string, id: string): McpPolicy;
export type AuditOutcome = 'attempted' | 'allowed' | 'denied' | 'error';
export interface AuditEvent {
    id: number;
    occurredAt: string;
    client: string;
    tool: string;
    outcome: AuditOutcome;
}
export class AccessAudit {
    constructor(options?: { dbPath?: string; retentionDays?: number; maxEntries?: number });
    begin(client: string, tool: string): number;
    finish(id: number, outcome: AuditOutcome): void;
    list(options?: { client?: string; limit?: number }): AuditEvent[];
    prune(): number;
    clear(): number;
    close(): void;
}
export interface McpServerOptions {
    version?: string;
    policy?: McpPolicy;
    audit?: AccessAudit;
    auditRetentionDays?: number;
    auditMaxEntries?: number;
}
export function createContextMcpServer(store: ContextStore, options?: McpServerOptions): McpServer;
export function runContextMcpServer(
    options?: McpServerOptions & {
        store?: ContextStore;
        dataDir?: string;
        policyFile?: string;
        clientId?: string;
    },
): Promise<{ server: McpServer; store: ContextStore }>;
export function createContextServer(options?: {
    token?: string;
    host?: string;
    port?: number;
    store?: ContextStore;
    dataDir?: string;
}): { app: Express; token: string; host: string; port: number; store: ContextStore; close(): void };

export type EvaluationMetric =
    | 'recallAtK'
    | 'meanReciprocalRank'
    | 'temporalCorrectness'
    | 'privacyProtection'
    | 'provenanceCompleteness';
export interface EvaluationCase extends Pick<
    SearchOptions,
    'scope' | 'type' | 'maxSensitivity' | 'retrieval' | 'asOf'
> {
    name: string;
    query: string;
    k?: number;
}
export interface EvaluationDataset {
    name?: string;
    memories?: { key: string; memory: MemoryInput }[];
    recall?: (EvaluationCase & { relevant: string[] })[];
    temporal?: (EvaluationCase & { include?: string[]; exclude?: string[] })[];
    privacy?: (EvaluationCase & { forbidden: string[] })[];
    provenance?: string[];
    thresholds?: Partial<Record<EvaluationMetric, number>>;
}
export interface EvaluationReport {
    dataset: string;
    passed: boolean;
    metrics: Record<EvaluationMetric, number>;
    thresholds: Record<EvaluationMetric, number>;
    failures: { metric: string; actual: number; threshold: number }[];
    cases: {
        recall: { name: string; recall: number; reciprocalRank: number; returned: number }[];
        temporal: { name: string; score: number }[];
        privacy: { name: string; checked: number; leaked: number; score: number }[];
        provenance: { key: string; complete: boolean }[];
    };
}
export function evaluateContextVault(
    dataset: EvaluationDataset,
    options?: { store?: ContextStore },
): EvaluationReport;
