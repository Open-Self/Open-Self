import type { Buffer } from 'node:buffer';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

export type MemoryType =
    'fact' | 'preference' | 'decision' | 'commitment' | 'relationship' | 'event' | 'note';
export type Sensitivity = 'public' | 'personal' | 'private' | 'restricted';
/**
 * Ordered trust in the entity that supplied a memory, lowest to highest.
 * `owner` is owner-authored; `external` is imported or agent-proposed content
 * that has not been owner-reviewed.
 */
export type SourceTrust = 'untrusted' | 'external' | 'trusted' | 'verified' | 'owner';
export type RetrievalMode = 'hybrid' | 'lexical' | 'vector';
export const MEMORY_TYPES: readonly MemoryType[];
export const SENSITIVITY_LEVELS: readonly Sensitivity[];
export const SOURCE_TRUST_LEVELS: readonly SourceTrust[];
export const VAULT_SCHEMA_VERSION: number;
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
    sourceTrust?: SourceTrust;
    confidence?: number;
    validFrom?: string | null;
    validTo?: string | null;
    occurredAt?: string | null;
    tags?: readonly string[];
}
export interface MemoryRecord extends MemoryInput {
    id: string;
    type: MemoryType;
    /** sha256("openself-memory-v1\n" + content) — stable content address. */
    contentHash: string;
    summary: string;
    source: MemorySource;
    scope: string;
    sensitivity: Sensitivity;
    sourceTrust: SourceTrust;
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
    minSourceTrust?: SourceTrust;
    asOf?: string;
    retrieval?: RetrievalMode;
    limit?: number;
    vectorCandidateLimit?: number;
    minVectorScore?: number;
}
export interface ListOptions extends Pick<
    SearchOptions,
    'scope' | 'allowedScopes' | 'type' | 'maxSensitivity' | 'minSourceTrust' | 'asOf' | 'limit'
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
    /** Present when built with `explain: true`. */
    receipt?: ContextReceipt;
}
export interface ContextReceiptCandidate {
    id: string;
    /** sha256 content address of the candidate record. */
    contentHash: string;
    type: MemoryType;
    scope: string;
    sensitivity: Sensitivity;
    sourceTrust: SourceTrust;
    confidence: number;
    source: MemorySource;
    relevance: number | null;
    match: RetrievalMatch | null;
    /** Days between the memory's effective timestamp and the receipt's asOf. */
    recencyDays: number | null;
    decision: 'selected' | 'skipped';
    reason: string;
    chars: number;
}
export interface ContextReceipt {
    version: 1;
    query: string;
    /** sha256("openself-context-v1\n" + context) — cites the exact rendered block. */
    contextHash: string;
    asOf: string;
    /** Vector index state at build time. */
    vector: {
        model: string;
        provider: string;
        indexed: number;
        pending: number;
    };
    retrieval: RetrievalMode;
    filters: {
        scope: string | null;
        allowedScopes: string[] | null;
        type: MemoryType | null;
        maxSensitivity: Sensitivity | null;
        minSourceTrust: SourceTrust | null;
    };
    limits: { maxChars: number; limit: number };
    candidates: ContextReceiptCandidate[];
    totals: {
        candidates: number;
        selected: number;
        skipped: number;
        usedChars: number;
    };
    /** Ed25519 fingerprint of the vault that produced this receipt. */
    signer?: string;
    /** Ed25519 signature over `contextHash` (domain `openself-sign-v1`). */
    signature?: string;
}
export type VaultKey = string | Buffer;
export interface VectorEncoder {
    model: string;
    encode(text: string): number[];
}
/**
 * Pluggable embedding provider. Synchronous providers expose `encodeSync`;
 * async providers expose `encode`/`batchEncode` and index lazily through
 * `store.indexPending()`. `model` is recorded per-vector — changing it
 * re-indexes pending rows.
 */
export interface VectorProvider {
    name?: string;
    model: string;
    encode?(text: string): Promise<number[]>;
    encodeSync?(text: string): number[];
    batchEncode?(texts: string[]): Promise<number[][]>;
}
export type EmbeddingProviderName = 'feature-hash' | 'ollama' | 'openai-compatible';
export interface ContextStoreOptions {
    dataDir?: string;
    dbPath?: string | Buffer;
    encryptionKey?: VaultKey;
    /** Back-compat alias: a synchronous vector encoder. */
    vectorEncoder?: VectorEncoder;
    /** Provider name ('feature-hash'|'ollama'|'openai-compatible') or a custom provider object. */
    embeddings?: EmbeddingProviderName | VectorProvider;
    /** Alias for `embeddings` when passing a provider object. */
    vectorProvider?: VectorProvider;
}
export interface VaultStats {
    total: number;
    active: number;
    forgotten: number;
    vectors: number;
    vectorModel: string;
    vectorProvider: string;
    /** Memories whose vectors are not yet indexed under the current model. */
    pendingVectors: number;
    encrypted: boolean;
    byType: Partial<Record<MemoryType, number>>;
    /** Memory Inbox counts keyed by proposal status. */
    proposals: Partial<Record<ProposalStatus, number>>;
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
    /** True when the embedding provider encodes synchronously. */
    readonly vectorSync: boolean;
    search(query: string, options?: SearchOptions): SearchMemory[];
    searchAsync(query: string, options?: SearchOptions): Promise<SearchMemory[]>;
    list(options?: ListOptions): MemoryRecord[];
    findPotentialConflicts(input: MemoryInput, options?: ConflictOptions): ConflictMemory[];
    findPotentialConflictsAsync(
        input: MemoryInput,
        options?: ConflictOptions,
    ): Promise<ConflictMemory[]>;
    buildContext(
        query: string,
        options?: SearchOptions & { maxChars?: number; explain?: boolean },
    ): ContextBlock;
    buildContextAsync(
        query: string,
        options?: SearchOptions & { maxChars?: number; explain?: boolean },
    ): Promise<ContextBlock>;
    /** Drain pending vector rows through the configured provider. */
    indexPending(options?: { limit?: number }): Promise<{
        model: string;
        indexed: number;
        pending: number;
    }>;
    /**
     * Submit a memory for owner review instead of writing it directly.
     * The proposal is persisted in the Memory Inbox until approved or rejected.
     */
    proposeMemory(input: MemoryInput, options?: ProposeOptions): MemoryProposal;
    getProposal(id: string): MemoryProposal | null;
    listProposals(options?: ListProposalsOptions): MemoryProposal[];
    /** Approve a pending proposal into a durable memory; `overrides` edit before commit. */
    approveProposal(
        id: string,
        overrides?: Partial<MemoryInput>,
        options?: { reviewNote?: string },
    ): MemoryRecord | null;
    rejectProposal(id: string, options?: { reviewNote?: string }): boolean;
    forget(id: string): boolean;
    /** Forget active memories whose `validTo` has lapsed. */
    sweepExpired(options?: { now?: string; limit?: number; dryRun?: boolean }): {
        swept: number;
        expired: number;
        ids: string[];
    };
    /** Vault Ed25519 identity, lazily loaded (null for read-only/in-memory). */
    readonly signingIdentity: SigningIdentity | null;
    stats(): VaultStats;
    close(): void;
}
export type ProposalStatus = 'pending' | 'approved' | 'rejected';
export interface MemoryProposal {
    id: string;
    /** The normalized memory payload awaiting review. */
    memory: MemoryRecord;
    status: ProposalStatus;
    proposedBy: string;
    note: string;
    proposedAt: string;
    reviewedAt?: string | null;
    reviewNote?: string;
    memoryId?: string | null;
}
export interface ProposeOptions {
    proposedBy?: string;
    note?: string;
}
export interface ListProposalsOptions {
    /** `undefined` defaults to pending; pass `null` to list every status. */
    status?: ProposalStatus | null;
    proposedBy?: string;
    limit?: number;
    offset?: number;
}
export function normalizeMemory(input: MemoryInput, now?: Date): MemoryRecord;
export const memoryInputSchema: z.ZodType<
    Omit<MemoryRecord, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'forgottenAt'> & {
        id?: string;
    },
    MemoryInput
>;

export type ImportFormat = 'markdown' | 'text' | 'whatsapp' | 'telegram' | 'openself';
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
/**
 * Human-readable interoperability export (JSONL). Plaintext — this is NOT the
 * encrypted `.osbackup` vault backup. `restricted` memories require
 * `includeRestricted: true`.
 */
export interface ContextExportOptions {
    file?: string;
    scope?: string;
    maxSensitivity?: Sensitivity;
    includeRestricted?: boolean;
    dryRun?: boolean;
    /** Strip secret-shaped strings before hashing/signing. */
    redact?: boolean;
    /** Sign the export with the vault's Ed25519 identity (default true). */
    sign?: boolean;
}
export interface ContextExportReport {
    format: 'openself-context';
    version: 1;
    count: number;
    scope: string | null;
    includeRestricted: boolean;
    bytes: number;
    dryRun: boolean;
    file?: string;
    memories?: MemoryRecord[];
    signed: boolean;
    /** Fingerprint of the signing vault identity, when signed. */
    signer: string | null;
    secrets: { findings: number; kinds: string[]; redacted: boolean; memories: number };
}
export function exportMemories(
    store: ContextStore,
    options?: ContextExportOptions,
): ContextExportReport;
export function serializeMemory(memory: MemoryRecord): Record<string, unknown>;
export const CONTEXT_EXPORT_FORMAT: 'openself-context';
export const CONTEXT_EXPORT_VERSION: 1;
export function parseContextExport(text: string): {
    header: Record<string, unknown>;
    records: { memory: MemoryInput; dedupeKey: string }[];
    errors: string[];
};
export interface ContextExportValidation {
    ok: boolean;
    errors: string[];
    records: number;
    header: Record<string, unknown> | null;
    /** Signature block status — `present: false` for unsigned exports. */
    signature?: { present: boolean; signer?: string | null; valid?: boolean };
}
/** Non-throwing spec validator for openself-context JSONL payloads. */
export function validateContextExport(text: string): ContextExportValidation;
/** sha256("openself-export-v1\n" + join(recordLines,"\n")) — signed payload. */
export function exportPayloadHash(recordLines: string[]): string;
/** Ed25519 fingerprint: sha256("openself-sign-v1\n" + publicKeyBase64). */
export function signingFingerprint(publicKeyBase64: string): string;
/** Ed25519 sign over domain-separated payload ("openself-sign-v1\n" + payload). */
export function signPayload(privateKeyBase64: string, payload: string): string;
export function verifyPayload(
    publicKeyBase64: string,
    payload: string,
    signatureBase64: string,
): boolean;
export interface SigningIdentity {
    publicKey: string;
    fingerprint: string;
    file: string;
    created: boolean;
    sign(payload: string): string;
}
/**
 * Load or create the vault's persistent Ed25519 identity (null when read-only).
 * Pass `create: false` for non-mutating lookups that must not write a key.
 */
export function loadSigningIdentity(
    dataDir: string | null | undefined,
    options?: { create?: boolean },
): SigningIdentity | null;
export const SIGNING_DOMAIN: 'openself-sign-v1';
export interface SecretFinding {
    kind: string;
    index: number;
    /** Masked preview — first 6 chars + ellipsis. */
    match: string;
}
/** Pattern-based detection of credential-shaped strings in text. */
export function scanForSecrets(text: string): SecretFinding[];
/** Replace detected secrets with `[REDACTED:<kind>]`. */
export function redactSecrets(text: string): { text: string; findings: SecretFinding[] };
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
/** sha256("openself-memory-v1\n" + utf8(content)) — stable content address. */
export function memoryContentHash(content: string): string;
/** sha256("openself-context-v1\n" + renderedContext) — receipt citation. */
export function contextBlockHash(renderedContext: string): string;
export function resolveVectorProvider(
    spec?: EmbeddingProviderName | VectorProvider,
    env?: Record<string, string | undefined>,
): VectorProvider;
export function featureHashProvider(options?: { dimensions?: number }): VectorProvider;
export class OllamaEmbeddingProvider implements VectorProvider {
    constructor(options?: {
        baseUrl?: string;
        model?: string;
        timeoutMs?: number;
        fetch?: typeof globalThis.fetch;
    });
    name: 'ollama';
    baseUrl: string;
    model: string;
    encode(text: string): Promise<number[]>;
    batchEncode(texts: string[]): Promise<number[][]>;
}
export class OpenAiCompatibleProvider implements VectorProvider {
    constructor(options: {
        baseUrl: string;
        model: string;
        apiKey?: string;
        timeoutMs?: number;
        fetch?: typeof globalThis.fetch;
    });
    name: 'openai-compatible';
    baseUrl: string;
    model: string;
    encode(text: string): Promise<number[]>;
    batchEncode(texts: string[]): Promise<number[][]>;
}

export interface CaptureOptions {
    scope?: string;
    sensitivity?: Sensitivity;
    /** Legacy JSON input and optional checkpoint identity; scans persist state in SQLite. */
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

export type McpCapability = 'read' | 'remember' | 'forget' | 'propose';
export const MCP_CAPABILITIES: readonly McpCapability[];
export interface McpPolicy {
    clientId: string;
    /** Omit to grant all scopes. */
    scopes?: readonly string[];
    maxSensitivity: Sensitivity;
    capabilities: readonly McpCapability[];
    /**
     * Highest source trust this client's writes may claim. Agent writes
     * default to `external`; owners may raise this deliberately.
     */
    maxSourceTrust?: SourceTrust;
}
export class AccessPolicy {
    constructor(input?: McpPolicy);
    readonly clientId: string;
    readonly scopes?: readonly string[];
    readonly maxSensitivity: Sensitivity;
    readonly maxSourceTrust: SourceTrust;
    readonly capabilities: readonly McpCapability[];
    require(capability: McpCapability): void;
    contains(scope: string): boolean;
    requireMemory(memory: { scope?: string; sensitivity?: string } | null): void;
    readOptions<T extends { maxSensitivity?: Sensitivity; scope?: string }>(
        input: T,
    ): T & {
        maxSensitivity: Sensitivity;
        allowedScopes?: readonly string[];
    };
    clampSourceTrust(requested?: SourceTrust): SourceTrust;
    deny(): never;
}
export function loadMcpPolicy(path: string, id: string): McpPolicy;
export type AuditOutcome = 'attempted' | 'allowed' | 'denied' | 'error';
export interface AuditEvent {
    id: number;
    occurredAt: string;
    client: string;
    tool: string;
    outcome: AuditOutcome;
    /** Hash of the previous completed event; absent on legacy/pending rows. */
    prevHash?: string | null;
    /** SHA-256 over `prevHash + occurredAt + client + tool + outcome`. */
    entryHash?: string | null;
}
export interface AuditChainVerification {
    /** False when a completed event's hash or link was tampered with. */
    ok: boolean;
    /** Completed events that verified against the chain. */
    checked: number;
    /** Pre-chain rows (written before hash chaining existed). */
    legacy: number;
    /** Interrupted `attempted` rows that never joined the chain. */
    pending: number;
    /** First row where verification failed, or null. */
    brokenAt: number | null;
    /** Hash of the newest verified event, or null. */
    tip: string | null;
    genesis: string;
}
export class AccessAudit {
    constructor(options?: {
        dbPath?: string;
        retentionDays?: number;
        maxEntries?: number;
        /** Open without creating/mutating; legacy databases stay unmigrated. */
        readonly?: boolean;
    });
    begin(client: string, tool: string): number;
    finish(id: number, outcome: AuditOutcome): void;
    list(options?: { client?: string; limit?: number }): AuditEvent[];
    /** Walk the hash chain; detects edited/deleted history. */
    verify(): AuditChainVerification;
    /** JSONL export for archival or transparency-log anchoring. */
    toJSONL(options?: { client?: string; limit?: number }): string;
    prune(): number;
    clear(): number;
    close(): void;
}
export function auditEntryHash(
    prevHash: string | null,
    event: { occurred_at?: string; occurredAt?: string; client: string; tool: string },
    outcome: string,
): string;
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
        embeddings?: EmbeddingProviderName | VectorProvider;
    },
): Promise<{ server: McpServer; store: ContextStore }>;
/**
 * Authenticated, localhost-first Streamable HTTP transport. Stateless request
 * handling: every POST creates a short-lived MCP session server-side.
 *
 * Threat model: the bearer token authorizes requests; Host/Origin checks plus
 * the loopback default defend against DNS rebinding and browser cross-origin
 * reads. `allowRemote` only removes the loopback expectation — never auth.
 */
export interface McpHttpOptions extends McpServerOptions {
    store: ContextStore;
    host?: string;
    port?: number;
    token?: string;
    allowRemote?: boolean;
}
export interface McpHttpApp {
    app: Express;
    /** The effective bearer token (generated when not supplied). */
    token: string;
    generatedToken: boolean;
    host: string;
    allowRemote: boolean;
}
export function createMcpHttpApp(options: McpHttpOptions): McpHttpApp;
export function runContextMcpHttpServer(options?: McpHttpOptions): Promise<
    McpHttpApp & {
        listener: import('node:http').Server;
        port: number;
        url: string;
        close(): Promise<void>;
    }
>;
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
