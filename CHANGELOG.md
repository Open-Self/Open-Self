# Changelog

## [Unreleased]

## [0.13.1] - 2026-09-09

### Fixed

- Temporal interval validation, filtering, chronological ordering and conflict overlap now compare instants rather than ISO timestamp strings.
- Existing memories with numeric timezone offsets or differing fractional-second spellings return consistent results without a data rewrite.
- Invalid `asOf` timestamps are rejected before retrieval, including empty/punctuation fallback paths.

### Added

- UTC/offset equivalence, inclusive millisecond boundaries, reversed interval and ordering regressions for plaintext and encrypted stores across all retrieval paths.
- An installed-package MCP regression using a mixed-offset validity interval.

## [0.13.0] - 2026-09-08

### Added

- Transactional SQLite capture checkpoints, encrypted with vault payloads and included in portable backups.
- Process-exit, failed-checkpoint, partial-file, retry and legacy checkpoint migration regression checks.
- Schema-1 backup restore compatibility with migration into schema 2.

### Fixed

- Failed record scans no longer leave partially committed memories; failed project files roll back all of their chunks while successful files can commit.
- Checkpoint write failures roll back memory, history and index changes, preventing duplicate imports on retry.
- Source keys such as `__proto__` and `constructor` remain ordinary record identities.

### Changed

- Vault schema is now 2; older releases refuse to open upgraded vaults.
- Capture reads existing JSON checkpoints once, then uses SQLite. JSON files are no longer updated; `statePath` remains a legacy import path and optional identity.
- Invalid checkpoints stop scans rather than silently resetting state. In-memory capture no longer writes checkpoint directories into source trees.

## [0.12.1] - 2026-09-08

### Fixed

- Context character budgets now cover the first record, source attribution, headers and separators; `usedChars` equals the full returned context length.
- Oversized records are skipped without truncation, allowing later complete candidates to fit. Returned memory metadata includes only the records in the context block.
- API documentation now describes the existing filtered-list fallback for empty and punctuation-only searches accurately.

### Added

- Boundary, oversized-record, Unicode and attribution regression checks in plaintext and encrypted vaults, plus an installed-package MCP budget and policy check.

## [0.12.0] - 2026-09-08

### Added

- TypeScript declarations for all 50 existing root exports, including nullable memory results, optional retrieval metadata, policy/capability types, backup results, and legacy API signatures.
- Public export parity and strict positive/negative consumer type checks.
- Isolated npm-tarball consumer checks under NodeNext and Bundler, with runtime CLI, MCP, dashboard, encrypted recovery, and frozen-schema upgrade tests.
- Synthetic migration fixtures frozen from v0.9.1 and v0.11.0, preserving history, forgotten state, IDs, and import deduplication.
- API reference, support/compatibility policy, and upgrade guide.

### Fixed

- Punctuation-only conflict proposals return no candidates instead of reading absent vector match metadata.

### Changed

- CI and tag-release verification now run type and installed-package gates on every supported platform/runtime.
- Public declaration dependencies ship with the package; TypeScript remains a development-only tool.

## [0.11.0] - 2026-09-08

### Added

- Owner-managed MCP policy files with fixed client aliases, literal scope roots, sensitivity ceilings, and independent read/remember/forget capabilities.
- Local metadata-only MCP audit with attempted/allowed/denied/error outcomes, bounded retention, and owner list/prune/clear commands.
- Fail-closed policy loading, denied-ID indistinguishability, write-only conflict suppression, and memory rollback when terminal audit recording fails.
- Adversarial MCP tests and a policy configuration, upgrade, trust-boundary, and audit guide.

### Security

- Conflict responses now honor the MCP sensitivity ceiling rather than implicitly reading restricted records.
- Punctuation-only search fallback preserves sensitivity and temporal filters.
- Scope hierarchy matching is case-sensitive and treats SQL wildcard characters literally; allowed-scope unions filter candidates before ranking and limits.
- **MCP behavior change:** requesting restricted sensitivity alone no longer grants it. Configure an explicit owner policy; trusted-local mode has a fixed private ceiling.

## [0.10.0] - 2026-09-08

### Added

- Passphrase-encrypted portable Context Vault backup/restore through CLI and JavaScript API.
- Consistent live-WAL snapshots preserve memories, forgotten records, history, vectors, lexical indexes, and import deduplication.
- AES-256-GCM archive encryption with scrypt-derived keys; payload keys are recovered inside the archive and rebound to the destination OS account.
- Restore validates authentication, schema, SQLite integrity, foreign keys, payloads, history, and vectors before publishing a new destination.
- Recovery guide covering key management, automation, exclusions, interrupted operations, and the 256 MiB archive limit.

### Security

- Existing backup files and restore destinations are refused; incomplete writes are never published as completed backups.
- Plaintext source vaults are encrypted and rebuilt entirely in memory before writing the restored database.
- Explicit database schema versioning rejects newer schemas before normal initialization modifies them.

## [0.9.1] - 2026-09-08

### Security

- Update locked `fast-uri` to 3.1.7 and `qs` to 6.16.0 to resolve the two dependencies flagged by npm audit.
- CI and release verification now block on moderate or higher dependency advisories instead of ignoring audit failures.

## [0.9.0] - 2026-09-08

### Added

- `openself memory import` for Markdown/MDX, plain text, WhatsApp text exports, and Telegram JSON.
- Source-attributed document chunking and private timestamped chat-event ingestion.
- SHA-256 import fingerprints and a durable SQLite import ledger make repeated imports idempotent.
- `--dry-run`, explicit format override, scope, sensitivity, type, confidence, and tag controls.
- Deterministic 256-dimensional local feature vectors with automatic backfill for existing vaults.
- Hybrid FTS5/vector retrieval using reciprocal-rank fusion; lexical and vector-only modes remain
  available for debugging and evaluation.
- Potential conflict detection for active facts, preferences, and decisions with matching type,
  exact scope, and overlapping validity windows.
- `openself memory conflicts` and MCP `openself_find_conflicts`; MCP remember responses now include
  conflict warnings.
- Reproducible `benchmark:context` command for local insertion and hybrid-search measurements.
- Authenticated localhost Context Vault dashboard with search, create/edit/forget, conflict review,
  duplicate merge, provenance fields, and version history.
- Immutable lifecycle snapshots for create, update, merge, migration baseline, and forget actions.
- Token-to-HttpOnly-cookie bootstrap, localhost-only binding, CSP/security headers, API no-store,
  cross-origin mutation blocking, and a dedicated `/api/context` namespace.
- `openself capture project` for one-shot or continuously polled project-folder ingestion.
- Incremental connector state that versions changed source chunks, skips unchanged files, and
  soft-forgets context removed from disk.
- Safe project-capture defaults for dependency/build directories, symlinks, binary or oversized
  files, environment files, and common credential/private-key filenames; plus dry-run, extension,
  ignore, scope, sensitivity, size, and polling controls.
- Incremental `calendar`, `email`, and `browser` capture from local ICS, EML/MBOX, bookmark
  HTML/JSON, Chromium History, and Firefox places.sqlite sources.
- Browser URL sanitization removes credentials, query strings, fragments, and non-HTTP(S) schemes
  before storage; structured connectors use stable keys for update/forget lifecycle handling.
- `openself vault init/status` with AES-256-GCM payload/vector/version encryption, HMAC blind FTS
  indexes, transactional plaintext migration, and OS-bound keys through Windows DPAPI, macOS
  Keychain, or Linux Secret Service.
- `eval:context` regression suite and versioned dataset for Recall@K/MRR, temporal correctness,
  sensitivity leakage, and provenance completeness, with non-zero exit on threshold failure.

### Changed

- **Requires Node.js >=22.13.0.** Upgrade Node before installing; current CLI dependencies no longer support Node 20.
- CLI and MCP versions now read the package manifest to prevent release version drift.
- CI validates Linux, Windows, and macOS on Node 22.13 and 24; tag releases run the same gates.
- Release packaging produces a GitHub artifact and fails explicitly when npm credentials are missing.
- Telegram parsing now preserves the export's normalized ISO timestamp for Context Vault ingestion.
- WhatsApp and Telegram imports default to `private`; document imports default to `personal`.

## [0.8.0] — 2026-08-13

### Added

- **Personal Context Vault:** typed facts, preferences, decisions, commitments, relationships,
  events, and notes with provenance, scope, sensitivity, confidence, and temporal validity.
- **SQLite + FTS5 storage:** local source of truth, Unicode full-text search, deterministic security
  filters, bounded context construction, and recoverable forgetting.
- **MCP server:** `openself_remember`, `openself_search_memory`, `openself_get_context`, and
  `openself_forget` over stdio for compatible AI clients.
- **Context CLI:** `openself memory add/search/list/forget/stats`.
- Context Vault architecture, schema, security semantics, client configuration, and limitations in
  `docs/context-vault.md`.

### Changed

- Product direction evolved from autonomous personality impersonation to private, persistent
  context for AI agents. Existing personality, clone, and messaging commands remain compatible.
- Privacy language now distinguishes local-first storage from cloud model configurations that send
  selected context to a provider.
- Package and CLI version bumped to 0.8.0; CLI onboarding now leads with memory and MCP workflows.
- MCP SDK is lazy-loaded so non-MCP CLI commands do not pay its startup cost.

### Security

- Retrieval enforces memory status, hierarchical scope, temporal validity, type, and an ordered
  sensitivity ceiling.
- `restricted` memories are excluded from MCP search/context by default.
- Dependency audit returned to zero known vulnerabilities after adding the new storage/MCP stack.

## [0.7.0] — 2026-07-07

### Changed (BREAKING)
- **Requires Node.js ≥ 20.** Node 18 dropped from support and the CI matrix — `@whiskeysockets/baileys` hard-fails its install engine check on Node < 20, so the previous `>=18` claim never actually installed.
- **Default LLM model** updated from the end-of-life `claude-sonnet-4-20250514` to `claude-sonnet-5` (provider, config loader, `.env.example`). Fresh clones on defaults previously failed even with a valid key.

### Fixed
- **CI was never green.** `package-lock.json` was git-ignored so `npm ci` failed at install on every runner; two integration tests failed from a mock-teardown bug; 81 files were unformatted behind a non-blocking format step. Lockfile committed, tests stabilized, formatting enforced with LF normalization.
- **RAG retrieval silently returned nothing** after the vectra 0.15 upgrade — `queryItems` gained a `query` argument, shifting `topK` out of position. Fixed and guarded with a non-empty-result test.
- **dotenv** no longer prints its promotional banner into every command (`{ quiet: true }`).

### Security
- `npm audit`: **14 vulnerabilities (2 critical, 5 high) → 0.** Every dependency bumped to latest; the last undici advisories cleared via a scoped `overrides` pin instead of downgrading discord.js.

### Added
- **Multi-language engine** — language detection now covers English, Vietnamese, Spanish, French, German and Portuguese (was a binary VN/EN check), with all language data (detection, stop words, formality, AI self-reveal patterns, SOUL fallbacks) centralized in a single registry (`src/lang/`). User-facing UI/examples standardized to English; the clone still speaks whatever language your own messages are in.
- All dependencies upgraded to current majors: ESLint 10, Vitest 4, zod 4, express 5, openai 6, `@anthropic-ai/sdk` 0.110, commander 15, inquirer 14, vectra 0.15; baileys pinned to latest stable 6.7.x.
- **Dependabot** (weekly, grouped) + a non-blocking `npm audit` CI step.
- Test suite grown to **324 tests**; coverage thresholds raised to lines 80 / functions 85 / branches 72, with previously-excluded core modules (ConversationMemory, GhostMode, ReviewQueue, loadConfig, generateSoulMd) now covered.
- End-to-end verification pass over all credential-free CLI commands.

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
