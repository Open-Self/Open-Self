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
   git checkout -b feat/your-feature
   ```
3. **Make your changes** — follow the code style below
4. **Test** your changes:
   ```bash
   npx openself feed --whatsapp ./test-data/sample-whatsapp.txt --name Harvey
   npx openself test
   ```
5. **Commit** with a descriptive message:
   ```bash
   git commit -m "feat: add Spanish language support"
   ```
6. **Push** and create a **Pull Request**

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Code Style

- **ESM modules** (`import`/`export`, not `require`)
- **No TypeScript** (plain JS for simplicity)
- **Meaningful variable names** — code should read like prose
- **Comment the "why"**, not the "what"
- Use **2-space indentation**

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
