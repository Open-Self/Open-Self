/**
 * OpenSelf — Main Entry
 * Re-exports all public modules
 */

export { parseWhatsApp, parseTelegram, parseGeneric, splitBySender, detectUserName } from './parsers/index.js';
export { extractPersonality } from './personality/extractor.js';
export { createFingerprint } from './personality/fingerprint.js';
export { generateSoulMd, saveSoulMd } from './personality/soul-generator.js';
export { CloneBrain, loadSoul } from './brain/clone.js';
export { createProvider, autoDetectProvider } from './brain/router.js';
export { HumanMimicry } from './mimicry/humanlike.js';
export { SafetyGuard } from './safety/guard.js';
export { ReviewQueue } from './safety/review-queue.js';
export { loadConfig } from './config/loader.js';

// Week 3
export { CloneArena } from './arena/arena.js';
export { GhostMode } from './ghost/ghost.js';
export { ChatMemory } from './rag/memory.js';
export { createEmbedding } from './rag/embeddings.js';
export { generateBadge } from './web/badge.js';
export { DiscordGateway } from './gateway/discord.js';
export { WhatsAppGateway } from './gateway/whatsapp.js';

