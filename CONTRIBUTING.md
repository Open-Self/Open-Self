# Contributing to OpenSelf

First off, thank you for considering contributing to OpenSelf! 🎉

## How Can I Contribute?

### 🐛 Reporting Bugs

- Use the [Bug Report](https://github.com/Open-Self/Open-Self/issues/new?template=bug_report.md) template
- Include your Node.js version, OS, and steps to reproduce

### 💡 Suggesting Features

- Use the [Feature Request](https://github.com/Open-Self/Open-Self/issues/new?template=feature_request.md) template
- Describe the use case and expected behavior

### 🔧 Submitting Changes

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b <your-name>/<type>/<description>
   # Example: minhvu/feat/spanish-language-support
   ```
3. **Make your changes** — follow the code style below
4. **Test** your changes:
   ```bash
   npm test                    # Run unit + integration tests (vitest)
   npm run test:coverage       # Check coverage
   npm run test:clone          # Run Clone Score test (optional, slow)
   npx openself feed --whatsapp ./test-data/sample-whatsapp.txt --name Harvey
   ```
5. **Lint & format:**
   ```bash
   npm run lint                # Check for linting errors
   npm run lint:fix            # Auto-fix if possible
   npm run format              # Auto-format code
   ```
6. **Commit** with a descriptive message (see format below):
   ```bash
   git commit -m "feat: add Spanish language support"
   ```
7. **Push** and create a **Pull Request**
   - Title: <70 characters, descriptive
   - Body: Include summary + test plan

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Code Style

See [Code Standards](./docs/code-standards.md) for detailed guidelines.

**Quick summary:**
- **ESM modules** — `import`/`export`, Node ≥18
- **File naming** — kebab-case (e.g., `personality-extractor.js`)
- **File size** — <200 lines of code per file
- **Indentation** — 4 spaces (Prettier enforced)
- **Comments** — Explain *why*, not *what*
- **Error handling** — Structured errors with `.code` property
- **No secrets** — Never commit `.env`, API keys, session tokens

## Project Structure

```
src/
├── parsers/       # Chat history parsers (WhatsApp, Telegram, etc.)
├── personality/   # Personality extraction & SOUL.md generation
├── brain/         # Clone brain (LLM integration, system prompts)
├── mimicry/       # Human-like behavior simulation
├── safety/        # Safety guards, AI detection, review queue
├── config/        # Configuration loading
├── cli/           # CLI commands
└── index.js       # Main entry (re-exports)
```

## Testing

All code changes require tests. Use [Vitest](https://vitest.dev/):

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode (develop faster)
npm run test:coverage # Check coverage
```

**Test location:** Mirror the `src/` structure in `tests/`:
- `tests/unit/<module>/<module>.test.js`
- `tests/integration/<feature>.test.js`
- `tests/fixtures/` for test data

**Mocking:** SDK mocks in `tests/helpers/mock-*.js` (no real API calls).

**Coverage target:** ≥50% on core modules (brain, safety, personality, parsers). See [Code Standards](./docs/code-standards.md).

## Release Process (Maintainers)

### Preparing a Release

1. **Update version & changelog:**
   ```bash
   # Edit package.json: "version": "0.X.0"
   # Edit CHANGELOG.md: add entry at top with [0.X.0] — YYYY-MM-DD
   ```

2. **Run full CI locally:**
   ```bash
   npm test
   npm run lint
   npm run format:check
   npx publint --strict     # npm publish validation
   npm pack --dry-run       # Check bundled files
   ```

3. **Commit & tag:**
   ```bash
   git add package.json CHANGELOG.md docs/
   git commit -m "release: v0.X.0"
   git tag v0.X.0
   git push origin main
   git push origin v0.X.0
   ```

4. **Publish to npm:**
   ```bash
   npm publish
   ```

5. **Create GitHub Release:**
   - Go to Releases → Draft Release
   - Tag: `v0.X.0`
   - Title: `v0.X.0 — <descriptive title>`
   - Body: Copy CHANGELOG entry

### Hotfixes (v0.X.1)

For urgent bug fixes:
```bash
git checkout -b hotfix/v0.X.1
# Make fix, commit, test
git tag v0.X.1
npm publish
```

## What We're Looking For

High-impact contributions right now:

- 🌍 **New language support** — parsers for Line, WeChat, Facebook Messenger
- 🧠 **Better personality extraction** — more accurate style matching
- 🔐 **Safety improvements** — better AI detection, new boundary types
- 🌐 **i18n** — UI strings in multiple languages
- 📖 **Documentation** — tutorials, setup guides, personality tuning tips
- 🧪 **Tests** — unit tests, integration tests

## Questions?

Open a [Discussion](https://github.com/Open-Self/Open-Self/discussions) — we're happy to help!

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
