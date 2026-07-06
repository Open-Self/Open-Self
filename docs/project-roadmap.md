# Project Roadmap

OpenSelf's release history, current work, and future vision. See [CHANGELOG.md](../CHANGELOG.md) for detailed change entries.

## Released Versions

### v0.1.0 — 2026-02-20 (Initial Release)

**Core personality engine:**
- Chat export parsers (WhatsApp .txt, Telegram JSON, generic text)
- Personality extractor (emoji frequency, catchphrases, vocabulary, Vietnamese traits)
- SOUL.md auto-generator
- Clone Brain with 4 LLM providers (Claude, GPT, DeepSeek, Ollama)
- Human mimicry (reply delays, typing simulation, typo injection)
- Safety system (AI reveal detection EN+VN, boundary enforcement, review queue)
- CLI with 5 commands: setup, feed, test, start (stub), review

### v0.2.0 — 2026-02-21 (Memory & Gateways)

**RAG + Telegram + Web:**
- Vector-based memory (Vectra + embeddings)
- Per-contact conversation history
- Telegram gateway (grammy bot, group chat awareness)
- Interactive test mode (`--interactive` flag)
- "Talk to My Clone" web UI (Express server on localhost)
- Full 10-step message processing pipeline

### v0.3.0 — 2026-02-23 (Arena & Discord)

**Clone vs Clone debates:**
- Clone Arena (two clones debate topics)
- Ghost Mode (auto-reply when offline)
- Discord gateway (discord.js, DM + @mention responses)
- Shareable clone score badge (`/badge/:name` SVG endpoint)
- Arena spectate via web (`/arena/:id`)
- Automatic RAG indexing during feed

### v0.4.0 — 2026-02-26 (WhatsApp)

**Mobile messaging:**
- WhatsApp gateway (Baileys SDK with QR code pairing)
- Profile export/import (`.openself` bundles)
- All 3 messaging platforms fully live

### v0.5.0 — 2026-03-16 (Polish & Documentation)

**UX improvements:**
- 3 documentation guides (setup, personality tuning, safety)
- GitHub Actions CI (Node 20/22 smoke tests)
- Colored CLI help with quickstart examples
- Global error handler with friendly messages
- `files` field in package.json for npm publish prep

### v0.6.0 — 2026-05-07 (Completion & Publish-Ready)

**Testing, security, polish:**

**Fixed (P0 critical):**
- Vietnamese AI-reveal regex: `\t` → `\b` word boundary (now detects VN patterns)
- Web route path traversal: `/arena/:id` and `/badge/:name` validation
- Personality pipeline: numeric stats from extractor now persist to `data/personality.json` and merge at runtime (was silently defaulting)

**Fixed (P1):**
- WhatsApp reconnection: removed deprecated `printQRInTerminal`, added qrcode-terminal; fixed event listener leaks
- Profile import sanitization: code-fence stripping, length cap, user warning
- Centralized CLI error handler with structured exit codes (2=config, 3=network, 1=generic)
- 7 additional refinements per phase-02

**Added:**
- Vitest test suite + coverage reporting
- ESLint v9 flat config + Prettier formatting
- Zod runtime validation for SOUL.md
- update-notifier on CLI start
- New modules: `personality-loader.js`, `soul-schema.js`, `error-handler.js`

**Breaking changes:**
- `npm test` now runs vitest (use `npm run test:clone` for Clone Score test)

**Metrics:**
- All 3 P0 bugs fixed with regression tests
- All 9 P1 bugs fixed
- Coverage ≥50% on core modules
- ESLint + Prettier clean
- CI matrix: Linux + Windows × Node 20/22 (Node 18 dropped — baileys requires ≥20)
- 4 new docs created (7 total in `./docs/`)

## In Progress

**Phase 09 (this session):** Documentation completion
- Create codebase-summary.md, system-architecture.md, code-standards.md, project-roadmap.md
- Update README badges and Troubleshooting section
- Create/extend CONTRIBUTING.md
- Extend safety-guide.md with profile import threat model

---

## Future Candidates

### v0.7.0 — TypeScript & Modularization (Speculative)

**Goal:** Improve type safety and maintainability.

**Planned work:**
- Migrate critical modules to TypeScript (brain, safety, config)
- JSDoc type annotations for remaining JS files
- Modularize large files: extractor (3 modules), test.js (2 modules), whatsapp.js (2 modules)
- Build time: `tsc` type check
- Full type coverage on exports

**Not committed:** TypeScript adds complexity; migration is gradual and optional.

### v0.8.0 — Voice Cloning & Vault (Speculative)

**Goal:** Extend to voice and multi-clone management.

**Planned features:**
- Voice cloning via TTS (text-to-speech) integration
- Multi-clone profile vault (manage 3+ personalities locally)
- Profile versioning (git-like history)
- Web dashboard for vault management
- Export profiles with voice models

**Not committed:** Voice APIs are expensive; UI dashboard requires significant effort.

### v0.9.0 — Semantic Release & Auto-Publish (Speculative)

**Goal:** Automate versioning and npm publishing.

**Planned work:**
- semantic-release integration
- Auto-tag releases based on conventional commits
- Auto-publish to npm registry on release
- Automated changelog generation

**Not committed:** Requires careful setup to avoid publishing unstable versions.

### v1.0.0 — Stable API & Public Service (Speculative)

**Goal:** Long-term stability and optional hosted service.

**Planned features:**
- Frozen API contracts (no breaking changes in 1.x)
- Comprehensive API docs (OpenAPI spec)
- Optional hosted "Share My Clone" service (centralized arena)
- Signed profile bundles (for trusted imports)
- Multi-tenant support investigation

**Constraints:**
- No cloud sync (data always local-first)
- No telemetry or tracking
- Optional opt-in public service (user controls visibility)

---

## Non-Goals

**OpenSelf will NOT:**

- **Cloud sync:** All data stays on user's machine. No automatic backup to cloud.
- **Telemetry:** Never collect usage data, conversation transcripts, or device info.
- **SaaS:** Not building a subscription service. Optional public share service would be opt-in.
- **Training on user data:** User's conversations never used to improve global models.
- **Proprietary platforms only:** Will stay open source (MIT license). Commercial forks welcome.
- **Voice messaging UX:** Audio transcription / playback considered low-priority.
- **Full TypeScript rewrite:** Migration is gradual; plain JS + JSDoc is acceptable long-term.

---

## Success Metrics by Version

| Metric | v0.5.0 | v0.6.0 | v0.7.0 (candidate) | v1.0.0 (candidate) |
|--------|--------|--------|-------------------|-------------------|
| **Platforms** | 3 (WhatsApp, Telegram, Discord) | 3 | 4+ (Signal, Matrix) | 5+ |
| **Test Coverage** | 0% | ≥50% | ≥70% | ≥80% |
| **Docs** | 3 guides | 7 docs | 10 docs | 12+ docs |
| **Type Safety** | JSDoc partial | JSDoc full | TS ≥50% | TS ≥80% |
| **npm Downloads/mo** | <100 | 200-500 (target) | 1000+ | 5000+ |
| **CI Platforms** | Linux | Linux + Windows | 3 platforms | 4+ platforms |
| **Breaking Changes** | ✓ (v0.x) | 1 (npm test) | 0 (v1.0 locks) | 0 |
| **API Stability** | Evolving | Pre-release | Stable | Frozen |

---

## Development Priorities

### Short Term (Next Sprint)

1. **Publish v0.6.0 to npm** (after phase 09 docs)
2. **Community feedback cycle** (20-30 early users)
3. **Bug reports & hotfixes** (v0.6.1, v0.6.2)
4. **Usage metrics** (stars, forks, issues from community)

### Medium Term (2-3 months)

1. **Evaluate TypeScript migration** (feedback from v0.6 users)
2. **Modularize large files** (phase 05 follow-up)
3. **Expand test suite** (community contributions?)
4. **New gateway candidates** (Slack, Matrix, Signal interest from users?)

### Long Term (6+ months)

1. **Platform stability:** Lock v1.0.0 API
2. **Optional service:** Investigate "Share My Clone" public service
3. **Voice cloning:** TTS integration (if community interest)
4. **Ecosystem:** Documentation for custom gateways, providers

---

## Community Contribution Roadmap

**OpenSelf welcomes:**
- Bug reports and fixes
- New LLM provider integrations (local models, proprietary APIs)
- New messaging platforms (Signal, Matrix, Slack, etc.)
- Documentation improvements
- Personality extraction enhancements (dialect detection, emoji categories)
- Test coverage improvements

**How to contribute:**
1. Fork repo
2. Branch: `<name>/feat/...` or `<name>/fix/...`
3. Add tests + docs
4. Submit PR with clear description
5. Code review via maintainer

**Maintainers:**
- Primary: minhvu2212@gmail.com
- Help wanted: [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## Release Process (v0.6.0+)

### Manual Release Steps

1. **Prepare release branch:**
   ```bash
   git checkout -b release/v0.X.0
   ```

2. **Update version:**
   - Bump `package.json` version
   - Update `CHANGELOG.md` with all changes
   - Verify `npm pack --dry-run` shows expected files

3. **Final checks:**
   ```bash
   npm test                 # All tests pass
   npm run lint             # ESLint clean
   npm run format:check     # Prettier clean
   npx publint --strict     # npm publish validation
   ```

4. **Commit & tag:**
   ```bash
   git add package.json CHANGELOG.md docs/
   git commit -m "release: v0.X.0"
   git tag v0.X.0
   ```

5. **Push & publish:**
   ```bash
   git push origin release/v0.X.0
   git push origin v0.X.0
   npm publish              # To npm registry
   ```

6. **GitHub Release:**
   - Create release from tag
   - Attach release notes from CHANGELOG.md
   - Trigger GitHub Actions (CI validates)

7. **Merge to main:**
   ```bash
   git checkout main
   git merge release/v0.X.0
   ```

### Version Numbering

- **Major (X.0.0):** Breaking API changes (0.6 → 1.0 locks API)
- **Minor (0.X.0):** New features (0.5 → 0.6 = tests + security)
- **Patch (0.0.X):** Bug fixes only (0.6.0 → 0.6.1 = hotfix)

### Breaking Change Policy

**v0.x:** Breaking changes allowed (pre-release)
- Documented clearly in CHANGELOG
- Migration guide provided
- Deprecation warning in previous version (if possible)

**v1.0+:** No breaking changes (API locked)
- Additions only
- Deprecations with 2-version warning
- Major breaking changes reserved for v2.0+

---

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Stay ESM-only | Node ≥18 assumed; CommonJS adds maintenance burden | 2026-02 |
| Gradual TypeScript | JSDoc sufficient for v0.x; TS migration low-priority | 2026-02 |
| No cloud sync | User control prioritized over convenience | 2026-02 |
| Zod for validation | Lightweight, easy to debug, no TypeScript dependency | 2026-05 |
| Vitest over Jest | Faster, ESM-native, simpler config | 2026-05 |
| Manual release (v0.6) | semantic-release overhead not justified pre-v1.0 | 2026-05 |

---

## FAQs

**Q: When will OpenSelf publish to npm?**
A: After v0.6.0 is complete and tested. Planned for early May 2026.

**Q: Will OpenSelf support TypeScript?**
A: JSDoc + Zod provide type safety for v0.x. Gradual migration to TypeScript planned for v0.7+, not required.

**Q: Can I run OpenSelf in the cloud?**
A: Yes, but data stays local. Deploy to a VPS and open port 3000 for web access. Not recommended for shared hosting (security risk).

**Q: Will there be a web dashboard?**
A: Possible in v0.8+. Currently, management via CLI + local files only.

**Q: Can I contribute a new messaging platform?**
A: Yes! Create a gateway class extending the base pattern. See [CONTRIBUTING.md](../CONTRIBUTING.md).

**Q: How do I report a security issue?**
A: Email security concerns to minhvu2212@gmail.com or file a private security advisory on GitHub.
