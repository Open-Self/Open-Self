import * as api from 'openself';
import type { MemoryRecord, SearchMemory, KeyBackend, McpPolicy } from 'openself';
import { publicExports } from './exports.js';

// The runtime and declaration entrypoints must expose exactly the same value names.
type Missing = Exclude<keyof typeof api, (typeof publicExports)[number]>;
type Extra = Exclude<(typeof publicExports)[number], keyof typeof api>;
const noMissing: Missing extends never ? true : never = true;
const noExtra: Extra extends never ? true : never = true;
void [noMissing, noExtra];

const store = new api.ContextStore({ dbPath: ':memory:', encryptionKey: Buffer.alloc(32, 7) });
const memory: MemoryRecord = store.remember({
    content: 'Use SQLite',
    type: 'decision',
    scope: 'project/atlas',
    source: { kind: 'document' },
});
const results: SearchMemory[] = store.search('database', {
    maxSensitivity: 'private',
    allowedScopes: ['project/atlas'],
});
const relevance: number | undefined = results[0]?.relevance;
const rank: number | null | undefined = results[0]?.match?.lexicalRank;
const source: string | undefined = store.get(memory.id)?.source.locator;
const context: string = store.buildContext('database').context;
const history: string | undefined = store.history(memory.id)[0]?.snapshot.content;
const forgotten: boolean = store.forget(memory.id);
const nullable: MemoryRecord | null = store.update('missing', { confidence: 0.5 });
const config: McpPolicy = {
    clientId: 'reader',
    scopes: ['project/atlas'],
    capabilities: ['read'],
    maxSensitivity: 'public',
};
const mcp = api.createContextMcpServer(store, { policy: config });
api.createContextMcpServer(store, { policy: { ...config, capabilities: ['read'] as const } });
store.remember({ content: 'Readonly input tags', tags: ['fixture'] as const });
const close: Promise<void> = mcp.close();
const dashboard = api.createContextServer({ store });
dashboard.app.get('/health', (_req, res) => res.json({ ok: true }));
dashboard.close();
const importReport = new api.ContextImporter(store).importFile('notes.md', { dryRun: true });
const backend: KeyBackend = { provider: 'test', store(_id, _key) {}, load: () => Buffer.alloc(32) };
const backup: Promise<{ path: string; bytes: number; createdAt: string }> = api.backupVault(
    store,
    'backup',
    { passphrase: 'test passphrase' },
);
const restore = api.restoreVault('backup', 'new-vault', {
    passphrase: 'test passphrase',
    keyBackend: backend,
});
// Agent-era API fixtures: trust, proposals, receipts, export, HTTP transport.
const trust: api.SourceTrust = memory.sourceTrust;
const proposal: api.MemoryProposal = store.proposeMemory(
    { content: 'proposed fixture', sourceTrust: 'external' },
    { proposedBy: 'fixture-agent', note: 'why' },
);
const pendingProposals: api.MemoryProposal[] = store.listProposals({ status: 'pending' });
const allProposals: api.MemoryProposal[] = store.listProposals({ status: null });
const approved: MemoryRecord | null = store.approveProposal(proposal.id, {
    sourceTrust: 'verified',
});
const rejected: boolean = store.rejectProposal(proposal.id, { reviewNote: 'n/a' });
const explained = store.buildContext('database', { explain: true, minSourceTrust: 'external' });
const receipt: api.ContextReceipt | undefined = explained.receipt;
const exportReport: api.ContextExportReport = api.exportMemories(store, { dryRun: true });
const httpApp: api.McpHttpApp = api.createMcpHttpApp({ store });
const policy = new api.AccessPolicy(config);
const clamped: api.SourceTrust = policy.clampSourceTrust('owner');
const parsedExport = api.parseContextExport('{"format":"openself-context","version":1}\n');
const _proposalChecks: [typeof pendingProposals, typeof allProposals] = [
    pendingProposals,
    allProposals,
];
void [
    trust,
    approved,
    rejected,
    receipt,
    exportReport,
    httpApp,
    clamped,
    parsedExport,
    _proposalChecks,
];
const audit = new api.AccessAudit();
const event = audit.begin('reader', 'openself_search_memory');
audit.finish(event, 'allowed');
const pending: api.AuditOutcome | undefined = audit.list()[0]?.outcome;
const chain: api.AuditChainVerification = audit.verify();
const auditJsonl: string = audit.toJSONL();
const roAudit = new api.AccessAudit({ readonly: true });
roAudit.close();
// Wave-2 fixtures: content/context hashes, async providers, export validation.
const contentHash: string = memory.contentHash;
const contextHash: string | undefined = explained.receipt?.contextHash;
const candidateHash: string | undefined = receipt?.candidates[0]?.contentHash;
const provider: api.VectorProvider = api.resolveVectorProvider('feature-hash', {});
const ollama = new api.OllamaEmbeddingProvider({ fetch: globalThis.fetch });
const openaiProvider = new api.OpenAiCompatibleProvider({
    baseUrl: 'http://localhost:1234/v1',
    model: 'm',
});
const asyncStore = new api.ContextStore({
    dbPath: ':memory:',
    embeddings: { model: 'x', encode: async () => [1, 2, 3] },
});
const pendingIndex: Promise<{ indexed: number; pending: number }> = asyncStore.indexPending();
const asyncSearch: Promise<SearchMemory[]> = asyncStore.searchAsync('q');
const asyncContext: Promise<api.ContextBlock> = asyncStore.buildContextAsync('q');
const asyncConflicts: Promise<api.ConflictMemory[]> = asyncStore.findPotentialConflictsAsync({
    content: 'x',
});
const validation: api.ContextExportValidation = api.validateContextExport('');
const hashFns: [string, string] = [api.memoryContentHash('c'), api.contextBlockHash('ctx')];
void [
    chain,
    auditJsonl,
    contentHash,
    contextHash,
    candidateHash,
    provider,
    ollama,
    openaiProvider,
    asyncStore,
    pendingIndex,
    asyncSearch,
    asyncContext,
    asyncConflicts,
    validation,
    hashFns,
];
const parsed: api.MemoryInput = api.memoryInputSchema.parse({ content: 'runtime validated' });
const messages = api.parseWhatsApp('fixture.txt');
const pairs = api.splitBySender(messages, 'Fixture');
const traits = api.extractPersonality(pairs.yours, pairs.conversations);
const profile: string = api.generateSoulMd(traits, api.createFingerprint(['hello']), {
    contacts: { Example: { relationship: 'friend', messageCount: 3 } },
});
const stats: Promise<{ totalMemories: number; indexDir: string }> = new api.ChatMemory(
    api.createEmbedding({ provider: 'local' }),
).getStats();
void [
    relevance,
    rank,
    source,
    context,
    history,
    forgotten,
    nullable,
    close,
    importReport,
    backup,
    restore,
    pending,
    parsed,
    profile,
    stats,
];

// @ts-expect-error required content must not be silently optional
store.remember({ type: 'note' });
// @ts-expect-error invalid sensitivity must not become any
store.search('query', { maxSensitivity: 'secret' });
// @ts-expect-error numeric confidence is required
store.remember({ content: 'test', confidence: 'high' });
// @ts-expect-error missing records must be narrowed before property access
store.get('missing').content;
// @ts-expect-error capabilities use explicit operation names
api.createContextMcpServer(store, { policy: { ...config, capabilities: ['admin'] } });
// @ts-expect-error asynchronous backup needs a passphrase
api.backupVault(store, 'backup', {});
// @ts-expect-error the runtime returns strings, not arbitrary object values
const wrong: number = api.generateBadge('Fixture', 80);
void wrong;
