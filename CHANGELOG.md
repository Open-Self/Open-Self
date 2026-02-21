# Changelog

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
