# Changelog

## [0.6.0] — 2026-05-07

### Fixed (P0)
- **VN safety regex** (`src/safety/ai-detection.js`) — Vietnamese AI-reveal patterns previously had `\t` (tab) instead of `\b` (word boundary), so detection silently never fired. Patterns rewritten; trailing `\b` removed where it followed non-ASCII chars.
- **Path traversal** in `/arena/:id` web route — IDs now whitelisted to `[a-zA-Z0-9_-]{1,64}`; rejected requests return 400. Arena content HTML-escaped before rendering.
- **Badge SVG XSS** — `/badge/:name` HTML-escapes name and length-caps to 64.
- **Personality pipeline data loss** — Numeric stats from extractor (responseTimeAvg, avgMessageLength, etc.) now persist to `data/personality.json` and are merged into mimicry/style modules at runtime. Previously the pipeline silently fell back to hard-coded defaults.

### Fixed (P1)
- **WhatsApp gateway**: removed deprecated `printQRInTerminal`, render via `qrcode-terminal`. Reconnect refactored into `_connect()` with explicit listener teardown — no more duplicate-reply storms when network flaps.
- **Profile import sanitization** (`src/cli/profile.js`): code-fences stripped, 50 KB length cap, soul shape validated, user warning before LLM ingestion.
- **Centralized CLI error handler** (`src/cli/utils/error-handler.js`) — structured exit codes: 0 ok, 1 generic, 2 config (NO_SOUL/MISSING_API_KEY), 3 network (ECONNREFUSED/auth).

### Added
- **Vitest test suite** — 284 tests across 26 files, 84.6% line / 87.5% function coverage. Mock helpers for Anthropic, OpenAI, Discord, grammy, baileys SDKs.
- **ESLint v9 flat config** + **Prettier v3** (`eslint.config.js`, `.prettierrc.json`). Scripts: `lint`, `lint:fix`, `format`, `format:check`.
- **Zod runtime validation** for SOUL.md (`src/config/soul-schema.js`) — catches malformed soul before LLM ingestion.
- **`update-notifier`** banner on CLI start.
- **CI matrix** Linux + Windows × Node 18/20/22 — runs lint, tests, coverage upload, publint, npm pack dry-run.
- **Docs**: `codebase-summary.md`, `system-architecture.md`, `code-standards.md`, `project-roadmap.md`. Profile-import trust boundary section in safety-guide.

### Changed (BREAKING)
- `npm test` now runs vitest, not the CLI Clone Score test. Use `npm run test:clone` for the original behaviour.
- Errors thrown by `loadSoul`/CLI now carry a `.code` property (`NO_SOUL`, `MISSING_API_KEY`, `INVALID_SOUL`, `ECONNREFUSED`).
- `package.json`: added `exports`, `sideEffects: false`, `prepack`, `prepublishOnly`, `prepare` scripts; `data/` removed from `files` array (was leaking user runtime data into the tarball).

### Deferred (v0.6.1)
- Modularization of files >200 LOC (`personality/extractor.js` 328, `cli/test.js` 287, `gateway/whatsapp.js` 229) — coverage already locks behaviour, deferred to keep v0.6.0 surface minimal.

---

## [0.5.0] — 2026-03-16

### Added
- **Documentation** — `docs/` folder with 3 guides: setup, personality tuning, safety
- **GitHub Actions CI** — Smoke tests on Node 18/20/22 matrix (feed sample data, help checks)
- **CLI Help Polish** — Colored `--help` output with quickstart examples and docs link
- **Global Error Handler** — Friendly error messages with suggestions instead of raw stack traces

### Changed
- CLI bumped to v0.5.0
- `package.json` — Added `files`, `homepage`, `bugs` fields for npm publish readiness
- README — Badges, cleaner structure, "Why OpenSelf?" section

### Preparing
- Soft launch — targeting 20-30 early users for feedback
- Content bomb — Blog post drafts and updated social media posts

---

## [0.4.0] — 2026-02-26

### Added
- **WhatsApp Gateway** — Clone on WhatsApp via Baileys with QR code pairing (`openself start --whatsapp`)
- **Profile Export/Import** — Share personality as `.openself` files (`openself profile export/import`)
- All 3 messaging platforms now fully live: Telegram, Discord, WhatsApp

### Changed
- CLI bumped to v0.4.0 with `profile` command
- `openself start` now shows all 3 platforms as ready
- Gateway router registers WhatsApp gateway

### Dependencies
- Added: `@whiskeysockets/baileys`, `qrcode-terminal`

---

## [0.3.0] — 2026-02-23

### Added
- **Clone Arena** — Two clones debate each other on any topic (`openself arena --topic "..."`)
- **Ghost Mode** — Clone auto-replies when you're offline, stops when you're back (`openself ghost on/off`)
- **Discord Gateway** — Clone lives on Discord via discord.js, responds to DMs and @mentions (`openself start --discord`)
- **Shareable Badge** — SVG clone score badge via `/badge/:name` endpoint for README embeds
- **Arena Spectate** — View debate transcripts via `/arena/:id` web routes
- **RAG Auto-Index** — `openself feed` now automatically indexes conversations into vector memory

### Changed
- CLI bumped to v0.3.0 with `arena` and `ghost` commands
- Enhanced language detection: percentage-based mixed Vietnamese/English detection with slang awareness
- Web server now serves badge and arena routes alongside chat
- Feed command shows arena command in "Next steps" output

### Dependencies
- Added: `discord.js`

---

## [0.2.0] — 2026-02-21

### Added
- **RAG Memory** — Vector search over chat history using vectra + dual embedding providers (OpenAI / local TF-IDF)
- **Clone Pipeline** — Full 10-step message processing flow (RAG → brain → LLM → safety → mimicry → reply)
- **Conversation Memory** — Per-contact context tracking with persistent memory.md log
- **Telegram Gateway** — Live messaging bot via grammy with typing simulation and group chat awareness
- **Interactive Test** — `openself test --interactive` for live terminal chat with your clone
- **Web Share Page** — "Talk to My Clone" dark-themed chat UI via `openself share --web`
- **Share Command** — `openself share --web` launches Express server on localhost

### Changed
- CLI bumped to v0.2.0
- `openself start --telegram` now fully functional (was stub)
- `openself test` now supports `--interactive` flag

### Dependencies
- Added: `vectra`, `grammy`, `express`

---

## [0.1.0] — 2026-02-20

### Added
- **Chat Parsers** — WhatsApp (.txt), Telegram (JSON), generic text with auto-format detection
- **Personality Engine** — Extractor (emoji, catchphrases, formality, Vietnamese traits), vocabulary fingerprinter, SOUL.md auto-generator
- **Clone Brain** — Dynamic system prompt builder with 4 LLM providers (Claude, GPT, DeepSeek, Ollama) and auto-detection router
- **Human Mimicry** — Reply delays, typing simulation, typo injection, message splitting
- **Safety System** — AI self-reveal detection (EN + VN), boundary enforcement, file-based review queue
- **CLI** — 5 commands: `setup` (wizard), `feed` (parse + extract), `test` (Clone Score), `start` (stub), `review` (dashboard)
- **Config** — YAML loader with env override, SOUL.md reader/writer
- Project scaffold: `package.json` (ESM + CLI bin), `README.md`, `LICENSE` (MIT), `.env.example`, `SOUL.md.example`
- Contributor files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates
