# Codebase Summary

OpenSelf is a Node.js ESM CLI application (Node ≥18) that transforms chat history into an AI personality clone. This document maps the source structure, data flow, and public API surface.

## Project Type & Entry Points

**Type:** Node.js ESM CLI with optional library usage
- **Binary entry:** `src/cli/index.js` (Commander-based CLI with 9 commands)
- **Library entry:** `src/index.js` (re-exports 16+ public modules)
- **Data directory:** `./data/` (SOUL.md, personality.json, conversations.json, memory-index/)

## Module Map

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| **src/cli/** | Commander CLI commands (9 commands) | `index.js`, `setup.js`, `feed.js`, `test.js`, `start.js`, `review.js`, `share.js`, `arena.js`, `ghost.js`, `profile.js` |
| **src/parsers/** | Chat export parsers (WhatsApp .txt, Telegram JSON, generic text) | `index.js`, `whatsapp.js`, `telegram.js`, `generic.js` |
| **src/personality/** | Personality extraction & synthesis | `extractor.js` (328 lines), `fingerprint.js`, `soul-generator.js` |
| **src/brain/** | Clone logic: prompt building, LLM provider routing, pipeline | `clone.js`, `pipeline.js`, `router.js`, `providers/` (4 providers) |
| **src/safety/** | AI-reveal detection, boundary enforcement, review queue | `ai-detection.js`, `guard.js`, `review-queue.js` |
| **src/mimicry/** | Human-like timing, typing, style, typo injection | `humanlike.js`, `timing.js`, `style.js` |
| **src/gateway/** | Messaging app integrations (WhatsApp, Telegram, Discord) | `whatsapp.js`, `telegram.js`, `discord.js`, `router.js` |
| **src/rag/** | Vector-based memory (Vectra + embeddings) | `memory.js`, `embeddings.js` |
| **src/memory/** | Per-contact conversation history | `conversation.js` |
| **src/config/** | Configuration & soul loading | `loader.js`, `soul.js`, `soul-schema.js`, `personality-loader.js` |
| **src/web/** | Express server (badge generation, arena spectate, chat share) | `server.js`, `badge.js` |
| **src/arena/** | Clone vs Clone debate orchestration | `arena.js` |
| **src/ghost/** | Ghost Mode (auto-reply when offline) | `ghost.js` |
| **src/cli/utils/** | Shared CLI utilities | `error-handler.js` |

## Public API Surface

**From `src/index.js`:**

```javascript
// Parsers
export { parseWhatsApp, parseTelegram, parseGeneric, splitBySender, detectUserName }

// Personality
export { extractPersonality, createFingerprint, generateSoulMd, saveSoulMd }

// Brain & LLM
export { CloneBrain, loadSoul, createProvider, autoDetectProvider }

// Safety & Mimicry
export { HumanMimicry, SafetyGuard, ReviewQueue }

// Memory & RAG
export { ChatMemory, createEmbedding }

// Config
export { loadConfig }

// Extensions (v0.3+)
export { CloneArena, GhostMode, generateBadge, DiscordGateway, WhatsAppGateway }
```

## Data Flow

```
┌─────────────────┐
│  Chat Export    │ (WhatsApp .txt / Telegram JSON / Manual)
└────────┬────────┘
         │
         ▼
    ┌────────────┐
    │  Parser    │ (src/parsers/)
    └────┬───────┘
         │
         ▼
    ┌──────────────────────┐
    │ Personality Extractor │ (src/personality/extractor.js)
    │ • Emoji frequency     │
    │ • Top words/phrases   │
    │ • Catchphrases        │
    │ • Response timing     │
    │ • Vietnamese traits   │
    └────┬───────────────┬──┘
         │               │
         ▼               ▼
    ┌──────────────┐  ┌──────────────────────┐
    │  SOUL.md     │  │ personality.json     │
    │  (string)    │  │ (numeric stats)      │
    └──────┬───────┘  └──────┬───────────────┘
           │                 │
           └────────┬────────┘
                    ▼
           ┌────────────────────┐
           │ Personality Loader │ (src/config/)
           │ (merges both)      │
           └────────┬───────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  ClonePipeline      │ (src/brain/pipeline.js)
         │ ┌─────────────────┐ │
         │ │ 1. RAG lookup   │ │
         │ │ 2. Brain build  │ │
         │ │ 3. LLM call     │ │
         │ │ 4. Safety check │ │
         │ │ 5. Style proc   │ │
         │ │ 6. Mimic delay  │ │
         │ └─────────────────┘ │
         └────────┬────────────┘
                  │
         ┌────────▼──────────┐
         │   Gateway         │ (src/gateway/)
         │ • WhatsApp        │
         │ • Telegram        │
         │ • Discord         │
         └────────┬──────────┘
                  │
                  ▼
            ┌──────────────┐
            │  User reply  │
            │  (delayed)   │
            └──────────────┘
```

## Architecture Layers

### 1. CLI Layer (src/cli/)
- **Command Handler Pattern:** Each command (setup, feed, test, start, etc.) is a module exporting a handler function
- **Error Handling:** Unified `wrapAction()` catches async errors and routes to `handleError()` with structured exit codes
- **Update Notifier:** Checks npm registry on startup (cached, non-blocking)

**9 Commands:**
- `setup` — Interactive wizard for API key + provider selection
- `feed` — Parse chat export, extract personality, save SOUL.md + personality.json
- `test` — Clone Score (10 test conversations) or interactive terminal chat
- `start` — Launch clone on WhatsApp/Telegram/Discord
- `review` — Dashboard of clone's recent replies (pending human approval)
- `share` — "Talk to My Clone" Express web server
- `arena` — Clone vs Clone debate
- `ghost` — Ghost Mode toggle (auto-reply offline)
- `profile` — Export/import personality as `.openself` bundles

### 2. Processing Layer (src/parsers/, src/personality/)
- **Parsers:** Extract messages, split by sender, detect user name
- **Extractor:** 328-line module analyzing emoji, words, phrases, timing, Vietnamese traits
- **Fingerprint:** Create numeric personality fingerprint for vector storage
- **Soul Generator:** Format SOUL.md (human-readable personality file)

### 3. Brain Layer (src/brain/)
- **CloneBrain (clone.js):** Parses SOUL.md into personality object; builds system prompt dynamically per contact
- **LLM Providers (router.js + providers/):** Abstraction over Claude, GPT, DeepSeek, Ollama
  - Each provider implements `chat(systemPrompt, userMessage)` → returns string
  - `autoDetectProvider()` picks first available API key from env
- **ClonePipeline (pipeline.js):** Orchestrates full message flow (RAG → Brain → LLM → Safety → Style → Mimicry)

### 4. Safety & Style Layer (src/safety/, src/mimicry/)
- **Safety Guard (guard.js):** Checks replies for AI reveals, sensitive info, unknown contact mode
- **AI Detection (ai-detection.js):** English regex patterns + Vietnamese NLP (regex-based, no model)
- **Review Queue (review-queue.js):** File-based queue for flagged messages
- **Human Mimicry (humanlike.js):** Reply delays, typing indicators, ignore filters
- **Style Processor (style.js):** Adjusts caps, punctuation, emoji based on personality
- **Personality Loader (personality-loader.js):** Merges SOUL.md (strings) + personality.json (numbers) at runtime

### 5. Memory & Integration Layer (src/rag/, src/memory/, src/gateway/)
- **RAG Memory (rag/memory.js):** Vectra vector DB + dual embeddings (OpenAI or TF-IDF fallback)
- **Conversation Memory (memory/conversation.js):** Per-contact history for context window
- **Gateways (gateway/):** Each platform (WhatsApp, Telegram, Discord) owns one ClonePipeline; handles platform-specific transport
- **Web Server (web/server.js):** Express serving badge SVG, arena spectate, chat UI

### 6. Configuration Layer (src/config/)
- **soul.js:** Parse SOUL.md (string splitting, no validation)
- **soul-schema.js:** Zod schema enforcing SOUL.md shape before LLM use (prevents prompt injection)
- **loader.js:** YAML config loader with env override
- **personality-loader.js:** Bridges JSON stats into runtime memory

## File Size Convention

Target: <200 lines per file for optimal context in LLM-driven tools.

**Currently oversize (flagged for future modularization):**
- `src/personality/extractor.js` — 328 lines (should split: emoji extraction, word analysis, Vietnamese detection)
- `src/cli/test.js` — 287 lines (should split: Clone Score logic, interactive chat handler)
- `src/gateway/whatsapp.js` — 229 lines (should split: QR rendering, message processing)

**Naming convention:** kebab-case (e.g., `personality-loader.js`, `error-handler.js`). Long descriptive names are acceptable to ensure self-documentation for grep/IDE tools.

## Data Persistence

| Path | Format | Purpose | Created By |
|------|--------|---------|-----------|
| `data/SOUL.md` | Markdown (string) | Human personality description | `soul-generator.js` (feed cmd) |
| `data/personality.json` | JSON (numeric) | Trained stats from extractor | `extractPersonality` (feed cmd) |
| `data/conversations.json` | JSON array | Sample conversation pairs | `extractPersonality` |
| `data/memory-index/` | Vectra binary | Vector embeddings for RAG | `ChatMemory.index()` |
| `data/config.yml` | YAML | Optional LLM/safety overrides | User manual edit |
| `.env` | Key=value | API keys, provider selection | `setup` command |
| `data/whatsapp-session/` | Baileys binary | WhatsApp session tokens | Baileys SDK |
| `data/profiles/<name>/` | JSON | Exported personality bundles | `profile export` |

## Development Patterns

### Module Exports
- Prefer named exports over default exports
- Getter functions: `loadSoul(dataDir)`, `loadConfig()`
- Class constructors: `CloneBrain`, `HumanMimicry`, `SafetyGuard`

### Error Handling
- Structured errors with `.code` property (e.g., `error.code = 'NO_SOUL'`)
- Exit codes: 0 (success), 1 (generic error), 2 (config error), 3 (network error)
- CLI handler wraps async with `wrapAction()` to catch and route errors

### Testing
- Unit tests in `tests/unit/<module>/`
- Integration tests in `tests/integration/`
- Mock SDK implementations in `tests/helpers/mock-*.js`
- Vitest, no real LLM calls or network requests

### Configuration
- `.env` + auto-detection: CLI tries multiple API keys in order
- YAML override: `data/config.yml` can override `.env`
- Zod validation: `soul-schema.js` ensures SOUL.md shape before use

## Extending OpenSelf

**Adding a new gateway (e.g., WhatsApp → Signal):**
1. Create `src/gateway/signal.js` extending base gateway pattern
2. Add to `src/gateway/router.js` registration
3. Add CLI flag in `src/cli/start.js`

**Adding a new LLM provider:**
1. Create `src/brain/providers/yourllm.js` implementing `chat(systemPrompt, userMessage)`
2. Register in `src/brain/router.js` PROVIDERS map
3. Update `.env.example`

**Modifying personality extraction:**
1. Edit `src/personality/extractor.js`
2. Update `personality-loader.js` NUMERIC_KEYS list if adding new numeric fields
3. Re-run `feed` command to regenerate `personality.json`
