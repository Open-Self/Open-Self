# Changelog

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
