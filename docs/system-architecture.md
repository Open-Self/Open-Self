# System Architecture

Detailed component design, data flow, and security boundaries for OpenSelf's personality cloning system.

## High-Level Architecture

OpenSelf operates as a **4-layer system**:

1. **CLI / Command Layer** — User interface (setup, feed, test, start, review, etc.)
2. **Processing Layer** — Chat parsing, personality extraction, soul generation
3. **Brain & Runtime Layer** — Prompt building, LLM selection, full pipeline orchestration
4. **Gateway & Persistence Layer** — Messaging platforms, storage, web interfaces

## Message Processing Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                       INCOMING MESSAGE                               │
│                   (text, contact, timestamp)                         │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Mimicry Filter  │ (shouldIgnore)
                    │ • Group chats   │
                    │ • System msgs   │
                    │ • Rate limit    │
                    └────────┬────────┘
                             │
                    ┌────────▼─────────────┐
                    │ RAG Memory Lookup    │
                    │ (find relevant past  │
                    │  conversations)      │
                    └────────┬─────────────┘
                             │
                    ┌────────▼──────────────────┐
                    │ Conversation Memory       │
                    │ (recent exchange history) │
                    └────────┬──────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │    Clone Brain — Build System Prompt     │
         │ • Load SOUL.md (personality description) │
         │ • Merge personality.json (numeric stats) │
         │ • Format with contact context           │
         │ • Inject RAG + recent history            │
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │    LLM Provider — Chat Completion        │
         │ • Route to Claude/GPT/DeepSeek/Ollama    │
         │ • Call API with system + user message    │
         │ • Retry logic + streaming                │
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │    AI Reveal Detection & Cleaning        │
         │ • Strip "I'm an AI" patterns             │
         │ • Remove "as an AI model" disclaimers    │
         │ • English regex + Vietnamese NLP         │
         └───────────────────┬──────────────────────┘
                             │
         ┌───────────────────▼──────────────────────┐
         │    Safety Guard Check                    │
         │ • Detect sensitive info leaks            │
         │ • Enforce topic boundaries               │
         │ • Unknown contact mode (extra caution)   │
         │ → Actions: deflect | block | queue       │
         └──────┬──────────────────┬────────────────┘
                │                  │
         ┌──────▼───┐     ┌────────▼──────────┐
         │  Safe    │     │  Unsafe/Unsure    │
         │  Reply   │     │  → Review Queue   │
         └──────┬───┘     └───────────────────┘
                │
    ┌───────────▼────────────────┐
    │ Style Processing           │
    │ • Adjust caps/punctuation  │
    │ • Emoji frequency matching │
    │ • Abbreviation expansion   │
    └───────────┬────────────────┘
                │
    ┌───────────▼──────────────────────┐
    │ Human Mimicry (Timing & Behavior)│
    │ • Calculate reply delay (avg)    │
    │ • Inject typos (0.5–2%)          │
    │ • Split long messages            │
    │ • Typing indicator simulation    │
    └───────────┬──────────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │   Gateway (WhatsApp /        │
    │   Telegram / Discord / Web)  │
    └──────────────────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │  SEND TO USER (with delay)   │
    └──────────────────────────────┘
```

## Component Breakdown

### ClonePipeline (src/brain/pipeline.js)

Central orchestrator. Owns one instance per gateway. Coordinates all subsystems.

```javascript
const pipeline = new ClonePipeline({
    config: loadConfig(),
    dataDir: './data',
    provider: createProvider('anthropic')
});

const { replies, delay, action, issues } = await pipeline.processMessage(
    { text: "Hi clone!", source: "whatsapp" },
    { name: "Alice", platform: "whatsapp" }
);
```

**Responsibilities:**
- Load SOUL.md, personality.json, and merge them
- Instantiate Brain, Provider, RAG, Memory, Safety, Mimicry components
- Orchestrate processMessage() flow
- Route errors to review queue

### CloneBrain (src/brain/clone.js)

Loads and interprets personality; builds dynamic system prompts per contact.

```javascript
const brain = new CloneBrain(soulContent, config);

// Parsed personality object with semantic fields:
// { name, language, catchphrases, abbreviations, avoidTopics, 
//   unsureFallback, avgMessageLength, emojiFrequency, ... }

// Dynamic system prompt built on each message:
const systemPrompt = brain.buildSystemPrompt(contact, personality);
```

**Key fields parsed from SOUL.md:**
- `name` — Your name (used in prompt context)
- `language` — Primary language (EN, VN, mixed)
- `catchphrases` — Your unique phrases (injected into examples)
- `abbreviations` — Your shortcuts (ko → không, vl → vl lắm)
- `avoidTopics` — Never discuss (e.g., health, politics)
- `unsureFallback` — What to say when unsure (e.g., "để t hỏi lại")
- `neverShare` — Personal info never in replies (e.g., address, SSN)

### LLM Provider Abstraction (src/brain/router.js + providers/)

**Provider Interface:**
```javascript
class Provider {
    async chat(systemPrompt, userMessage) {
        // Returns string reply or throws error
    }
}
```

Four implementations:
- **AnthropicProvider** — Uses @anthropic-ai/sdk
- **OpenAIProvider** — Uses openai SDK
- **DeepSeekProvider** — Compatible with OpenAI API
- **OllamaProvider** — Local LLM (free, no API key)

**Auto-detection (in order):**
```
if (ANTHROPIC_API_KEY) → anthropic
else if (OPENAI_API_KEY) → openai
else if (DEEPSEEK_API_KEY) → deepseek
else if (OLLAMA_BASE_URL) → ollama
else default to ollama
```

### Safety Guard (src/safety/guard.js)

Multi-layer safety checks on replies.

```javascript
const guard = new SafetyGuard(personality);
const result = guard.checkReply(reply, incomingMessage, contact);
// result = { safe: bool, action: 'deflect'|'block'|'queue_for_review', ... }
```

**Layers:**
1. **AI Reveal Detection** — Strip "I'm Claude/GPT" patterns
2. **Sensitive Info Check** — Match neverShare keywords (regex-based)
3. **Topic Boundary Check** — Reject avoidTopics patterns
4. **Unknown Contact Mode** — Extra caution for strangers (queue vs deflect)

### AI Detection (src/safety/ai-detection.js)

Detects when LLM outputs self-identifies as AI.

**English patterns:**
- "I am an AI", "I'm Claude", "As a language model", "I cannot...", etc.

**Vietnamese patterns (v0.6.0):**
- "Tôi là một AI" (I am an AI)
- "Là một mô hình ngôn ngữ" (I'm a language model)
- "Tôi không thể" (I cannot)
- "Bạn là một AI" (You are an AI — when mistaken identity)

**v0.6.0 fix:** Regex corrected from `\t` (tab) to `\b` (word boundary), ensuring VN patterns actually match.

### Human Mimicry (src/mimicry/humanlike.js)

Makes replies feel human: delays, typos, timing patterns.

```javascript
const mimicry = new HumanMimicry(personality);

// Check if should ignore this message at all
if (mimicry.shouldIgnore(message)) {
    return { action: 'ignore', replies: [] };
}

// Get realistic reply delay
const delay = mimicry.getReplyDelay();  // ms, varies by personality

// Inject typos at personality.typoRate
const typoedReply = mimicry.injectTypos(reply);

// Split long messages (if personality.avgMessageLength small)
const splitReplies = mimicry.splitMessages(reply);
```

**Ignores:**
- Messages from groups (unless @mentioned)
- System messages (group notifications)
- High-frequency replies (rate limit: 1 per 30s)

### Style Processor (src/mimicry/style.js)

Adjusts capitalization, punctuation, emoji density to match personality.

```javascript
const style = new StyleProcessor(personality);
const styledReply = style.applyStyle(reply);
// Adjusts for: capitalizationStyle, emojiFrequency, punctuation patterns
```

### RAG Memory (src/rag/memory.js)

Vector search over past conversations for context injection.

```javascript
const memory = new ChatMemory(embedding, './data');

// Index new conversations
await memory.index([
    { text: "How are you?", sender: "Alice" },
    { text: "Good, you?", sender: "You" }
], 'Alice');

// Find relevant past messages
const similar = await memory.findRelevant(
    "What's new?",  // query
    "Alice",        // contact name
    5               // top-k results
);

// Format for prompt injection
const ragContext = memory.formatContext(similar);
```

**Backend:** Vectra (lightweight vector DB) + embeddings (OpenAI or TF-IDF fallback).

### Conversation Memory (src/memory/conversation.js)

Maintains per-contact conversation history (last 8 messages).

```javascript
const conversationMemory = new ConversationMemory('./data');

// Add exchange
conversationMemory.logExchange(contact, userMsg, yourReply);

// Get context for system prompt
const history = conversationMemory.getRecentContext('Alice', 8);
```

### Gateway Abstraction (src/gateway/)

Each messaging platform implements same interface. Owns one ClonePipeline.

```javascript
class Gateway {
    async start() { /* platform-specific setup */ }
    async stop() { /* graceful shutdown */ }
    async sendMessage(contact, text, options) { /* send */ }
    getStats() { /* return { uptime, messagesProcessed, ... } */ }
}
```

**WhatsAppGateway (src/gateway/whatsapp.js):**
- Uses Baileys SDK (reverse-engineered WhatsApp Web)
- QR code pairing in terminal
- Session persistence in `data/whatsapp-session/`
- Reconnection with exponential backoff

**TelegramGateway (src/gateway/telegram.js):**
- Uses Grammy (Telegram bot framework)
- Polling or webhook (configurable)
- Group chat awareness

**DiscordGateway (src/gateway/discord.js):**
- Uses discord.js
- Responds to DMs + @mentions
- Typing simulation

### Web Server (src/web/server.js)

Express server serving three routes:

1. **Badge route:** `/badge/:name` → SVG clone score badge
   - Fetches clone score from `data/SOUL.md`
   - Renders as shareable SVG for GitHub README

2. **Arena spectate:** `/arena/:id` → HTML transcript of clone debate
   - Displays debate history
   - XSS protection: sanitize SVG output

3. **Chat share:** `/` → "Talk to My Clone" dark-themed UI
   - React/vanilla JS chat interface
   - Calls `/api/chat` endpoint
   - No authentication (local LAN assumption; hardened in v0.6.0)

### Personality Loader (src/config/personality-loader.js)

**Problem:** SOUL.md parser extracts only strings (name, catchphrases, language). Numeric stats from `extractPersonality()` were lost at runtime.

**Solution:** `mergePersonality(soulParsed, personalityJson)` overlays personality.json numeric fields onto the soul object at pipeline startup.

**Numeric keys merged:**
- `responseTimeAvg` — milliseconds
- `avgMessageLength` — characters
- `avgWordCount` — words
- `emojiFrequency` — per message
- `typoRate` — percentage
- `onlineHoursStart`, `onlineHoursEnd` — hours
- `capitalizationStyle` — percentage caps

## Data Lifecycle

### Feeding Phase (npx openself feed)
1. Parse chat export → list of messages with sender, timestamp, text
2. Split by sender → identify your messages
3. Extract personality → object with 15+ numeric + semantic fields
4. Save SOUL.md → `data/SOUL.md` (human-readable markdown)
5. Save personality.json → `data/personality.json` (numeric stats)
6. Index RAG → vectra embeddings in `data/memory-index/`

### Runtime Phase (npx openself start)
1. Load SOUL.md → string with personality description
2. Load personality.json → numeric stats
3. Merge → personality object at pipeline startup
4. On message:
   - Pass message + personality through pipeline
   - Brain builds dynamic system prompt (injected personality fields)
   - LLM generates reply
   - Safety guard checks reply
   - Mimicry applies delays + typos
   - Gateway sends to platform

### Long-term Updates
- **personality.json persists:** Numeric stats don't change without re-feeding
- **SOUL.md is editable:** User can manually refine personality.md (validated by soul-schema.js before use)
- **RAG index persists:** Grows with each conversation logged by ConversationMemory
- **Review queue grows:** Flagged messages pile up in `data/review-queue.json`

## Security Boundaries

### Trust Zones

| Zone | Source | Validation | Risk |
|------|--------|-----------|------|
| **SOUL.md** | User (local file) | Zod schema (shape + length caps) | Low — user controls own personality; prompt injection unlikely (no direct injection, semantic fields only) |
| **personality.json** | Extractor output (deterministic) | Type-checked at load (numeric fields) | Low — generated from chat history, not user input |
| **Imported profile (.openself)** | External user (ZIP bundle) | Unzip + sanitize (code-fence strip, length cap) | **High** — untrusted; content lands in LLM system prompt |
| **Web `/api/chat` input** | HTTP request (public if port exposed) | Whitelist input length (max 500 chars) | **High** — potential prompt injection if forwarded to LLM unescaped |
| **WhatsApp/Telegram/Discord messages** | Platform API (identity verified) | Per-gateway validation | Medium — platform user identity trusted; content free-form |

### Security Hardening (v0.6.0)

1. **Profile Import Sanitization:**
   - Strip code fences from imported personality (prevents markdown injection)
   - Cap personality.md length at 5000 chars (prevents buffer overflow)
   - Warn user before loading untrusted profile

2. **Web Route Path Traversal:**
   - `/arena/:id` validates ID format (UUID only, no `../` escapes)
   - `/badge/:name` whitelist against invalid characters

3. **SVG XSS Prevention:**
   - Badge SVG doesn't embed user input directly
   - Arena transcripts escapes HTML tags

4. **SOUL.md Validation:**
   - soul-schema.js enforces shape before LLM prompt build
   - Rejects unknown fields (passthrough after validation)
   - Max length limits on each field

## Configuration Hierarchy

1. **Defaults** (hardcoded in modules)
   - LLM provider: anthropic
   - Reply delay: 1000ms base + jitter
   - Typo rate: 0.5%

2. **Environment Variables** (.env)
   - ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, OLLAMA_BASE_URL
   - LLM_PROVIDER (override)

3. **YAML Config** (data/config.yml, optional)
   - LLM settings (temperature, max_tokens)
   - Safety thresholds (sensitivity)
   - Data directory override

4. **SOUL.md** (data/SOUL.md)
   - Personality description + boundaries

5. **personality.json** (data/personality.json)
   - Trained numeric stats (overrides defaults)

## Deployment Topology

**Single-Clone Setup:**
```
┌──────────────┐
│   Your PC    │
│ ┌──────────┐ │
│ │ OpenSelf │ │ (running continuously)
│ └──────────┘ │
│ • data/      │
│ • .env       │
│ • npm start  │
└──────┬───────┘
       │ connects to
       ├─ WhatsApp (Baileys)
       ├─ Telegram (Grammy)
       ├─ Discord (discord.js)
       └─ LLM API (Claude / GPT / DeepSeek / Ollama)
```

**Multi-Clone / Arena Setup:**
```
┌──────────────────────────────┐
│   Your PC                    │
│ ┌─────────────┐              │
│ │ Arena Mode  │ runs         │
│ │ 2 instances │ simultaneously │
│ │ of pipeline │              │
│ └─────────────┘              │
└──────────────────────────────┘
```

**Web Share Setup:**
```
┌──────────────┐        ┌──────────────┐
│   Your PC    │◀──────▶│  Browser     │
│  Express     │        │  (localhost) │
│  :3000       │        │  /           │
└──────────────┘        └──────────────┘
```

## Performance Characteristics

- **Feed parsing:** O(n) where n = message count (100 msgs ≈ 100ms)
- **Personality extraction:** O(n log n) due to phrase deduplication
- **RAG embedding:** O(k) where k = conversations indexed (~10ms per conversation)
- **Message processing:** O(1) local ops + O(1) LLM API call (1-2 seconds depending on provider)
- **Memory footprint:** ~50MB baseline + ~20MB per RAG index
