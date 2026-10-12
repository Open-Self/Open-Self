/** Existing personality and messaging API. Context Vault is independent of these modules. */
export interface ChatMessage {
    date: string;
    time: string;
    timestamp?: string;
    sender: string;
    text: string;
}
export interface Conversation {
    contact: string;
    date: string;
    time: string;
    theirMessage: string;
    yourReply: string;
    replyDelay: number;
}
export function parseWhatsApp(filePath: string): ChatMessage[];
export function parseTelegram(filePath: string): ChatMessage[];
export function parseGeneric(filePath: string): {
    type: 'manual';
    rawContent: string;
    sections: Record<string, string[]>;
};
export function splitBySender(
    messages: ChatMessage[],
    yourName: string,
): { yours: ChatMessage[]; others: ChatMessage[]; conversations: Conversation[] };
export function detectUserName(messages: ChatMessage[]): {
    likelyUser: string;
    allSenders: { name: string; count: number }[];
};
export interface Personality {
    totalMessages: number;
    avgMessageLength: number;
    avgWordCount: number;
    emojiFrequency: number;
    topEmojis: { emoji: string; count: number }[];
    topWords: { word: string; count: number }[];
    topPhrases: { phrase: string; count: number }[];
    catchphrases: string[];
    greetingStyle: string;
    usesSlang: boolean;
    formality: 'formal' | 'casual' | 'mixed';
    humorPatterns: string[];
    responseTimeAvg: number;
    pronounUsage: string[];
    toneDiacritics: boolean;
    abbreviations: string[];
    primaryLanguage: string;
}
export interface Fingerprint {
    uniqueWords: number;
    avgWordLength: number;
    punctuationStyle: {
        dots: number;
        commas: number;
        exclamations: number;
        questions: number;
        ellipsis: number;
    };
    capitalizationStyle: 'ALL_CAPS' | 'lowercase' | 'Normal';
    messageEndStyle: { char: string; count: number }[];
    questionFrequency: number;
    exclamationFrequency: number;
}
export function extractPersonality(
    yourMessages: { text: string }[],
    conversations?: { replyDelay: number }[],
): Personality;
export function createFingerprint(texts: string[]): Fingerprint;
export function generateSoulMd(
    personality: Personality,
    fingerprint: Fingerprint,
    userInfo?: {
        name?: string;
        contacts?: Record<string, { relationship?: string; messageCount?: number }>;
    },
): string;
export function saveSoulMd(content: string, dataDir?: string): string;
export function loadSoul(dataDir?: string): string;
/** YAML configuration supports arbitrary application extensions; narrow values before using them. */
export function loadConfig(configPath?: string): Record<string, unknown>;
export type ProviderName = 'anthropic' | 'openai' | 'deepseek' | 'ollama';
export interface ChatProvider {
    chat(systemPrompt: string, userMessage: string): Promise<string>;
}
export function createProvider(
    providerName?: ProviderName,
    config?: { apiKey?: string; model?: string; maxTokens?: number; baseURL?: string },
): ChatProvider;
export function autoDetectProvider(): ProviderName;
export interface Contact {
    name?: string;
    relationship?: string;
    channel?: string;
    rules?: string;
    known?: boolean;
    closeness?: string;
}
export class CloneBrain {
    constructor(soulContent: string, config?: Record<string, unknown>);
    buildSystemPrompt(contact?: Contact, recentHistory?: string, ragContext?: string): string;
    generateReply(
        message: string,
        contact: Contact,
        provider: ChatProvider,
        options?: { recentHistory?: string; ragContext?: string },
    ): Promise<string>;
}
export class HumanMimicry {
    constructor(
        personality?: Partial<Personality> & { onlineHoursStart?: number; onlineHoursEnd?: number },
    );
    getReplyDelay(message: string, contact?: Contact): number;
    getTypingDuration(reply: string): number;
    shouldIgnore(message?: {
        isGroup?: boolean;
        mentionsMe?: boolean;
        isMedia?: boolean;
        hasCaption?: boolean;
    }): boolean;
    addTypos(reply: string): string;
    splitMessage(reply: string): string[];
    processReply(reply: string): string[];
}
export interface SafetyIssue {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    topic?: string;
}
export interface SafetyVerdict {
    safe: boolean;
    issues: SafetyIssue[];
    action?: 'block' | 'queue_for_review' | 'deflect';
    deflectMessage?: string;
}
export class SafetyGuard {
    constructor(soul?: {
        neverShare?: string;
        avoidTopics?: string;
        deflectMessage?: string;
        unsureFallback?: string;
    });
    checkReply(reply: string, message?: { text?: string }, contact?: Contact): SafetyVerdict;
}
/** Review items are extensible user-defined records persisted without schema validation. */
export class ReviewQueue {
    constructor(dataDir?: string);
    add(item: Record<string, unknown>): void;
    getPending(): Record<string, unknown>[];
    approve(id: string): Record<string, unknown> | undefined;
    reject(id: string, editedReply?: string): Record<string, unknown> | undefined;
    getStats(): { pending: number; approved: number; rejected: number; total: number };
}
export interface ArenaClone {
    name: string;
    brain: CloneBrain;
    soulContent: string;
}
export interface DebateResult {
    topic: string;
    clone1: string;
    clone2: string;
    rounds: number;
    transcript: { speaker: string; text: string }[];
}
export class CloneArena {
    constructor(options?: { provider?: ProviderName; rounds?: number });
    loadClone(soulPath: string, name?: string): ArenaClone;
    runDebate(
        clone1: ArenaClone,
        clone2: ArenaClone,
        topic: string,
        callbacks?: { onMessage?: (speaker: string, text: string, round: number) => void },
    ): Promise<DebateResult>;
    exportTranscript(result: DebateResult, outputDir?: string): string;
}
export interface GhostStatus {
    ghostMode: boolean;
    online: boolean;
    lastSeen?: string;
    isUserOffline?: boolean;
    status: 'unknown' | 'ghost' | 'online' | 'offline';
}
export class GhostMode {
    constructor(dataDir?: string);
    ping(): void;
    enable(): void;
    disable(): void;
    isUserOffline(): boolean;
    getStatus(): GhostStatus;
    shouldCloneReply(): boolean | undefined;
    startHeartbeat(intervalMs?: number): ReturnType<typeof setInterval>;
    stopHeartbeat(): void;
}
export interface EmbeddingProvider {
    name: string;
    dimensions: number;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    buildVocabulary?(texts: string[]): void;
}
export function createEmbedding(config?: {
    provider?: 'local' | 'openai';
    apiKey?: string;
    model?: string;
}): EmbeddingProvider;
export interface ChatMemoryResult {
    text: string;
    contact: string;
    score: number;
    theirMessage: string;
    yourReply: string;
}
export class ChatMemory {
    constructor(embedding: EmbeddingProvider, dataDir?: string);
    init(): Promise<void>;
    indexHistory(conversations: Conversation[], options?: { batchSize?: number }): Promise<number>;
    findRelevant(message: string, contact?: string, topK?: number): Promise<ChatMemoryResult[]>;
    formatContext(memories: ChatMemoryResult[]): string;
    getStats(): Promise<{ totalMemories: number; indexDir: string }>;
}
export function generateBadge(name: string, score: number, options?: { dark?: boolean }): string;
export class DiscordGateway {
    constructor(config?: { token?: string; appConfig?: Record<string, unknown> });
    start(): Promise<void>;
    stop(): void;
}
export class WhatsAppGateway {
    constructor(config?: {
        sessionDir?: string;
        dataDir?: string;
        appConfig?: Record<string, unknown>;
    });
    start(): Promise<void>;
    stop(): void;
    getStats(): { received: number; replied: number; ignored: number; queued: number };
}
