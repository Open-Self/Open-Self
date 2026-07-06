# 🧑 OpenSelf

[![npm version](https://img.shields.io/badge/npm-v0.6.0-blue)](https://www.npmjs.com/package/openself)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![CI](https://github.com/Open-Self/open-self/actions/workflows/ci.yml/badge.svg)](https://github.com/Open-Self/open-self/actions)
[![Tests](https://img.shields.io/badge/tests-vitest-purple)](./docs/code-standards.md)

### Your AI clone. Your messages. Your machine.

OpenSelf turns your chat history into an AI clone that speaks exactly like you — on WhatsApp, Telegram, and Discord. Open source. Self-hosted. Bring your own API key.

> OpenClaw is AI that does things *for* you.
> OpenSelf is AI that *is* you.

---

## 💡 Why OpenSelf?

**ChatGPT doesn't know your catchphrases.** It doesn't know you greet your best friend with "ê" and your mom with "dạ". It doesn't know you never write "Best regards" because you never have.

OpenSelf learns from YOUR real messages — your vocabulary, humor, emoji habits, abbreviations, and tone — then runs 24/7 as your digital twin.

*I replaced myself on WhatsApp for a week. 156 messages. Nobody noticed. [Read the story →](./posts/drafts/blog-replaced-myself.md)*

---

## ⚡ Quick Start

```bash
# Install
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install

# Feed your personality
npx openself feed --whatsapp ./my-chat-export.txt --name "You"

# Test your clone
npx openself test

# Go live
npx openself start --telegram
npx openself start --discord
npx openself start --whatsapp
```

## 🧠 How It Works

```
You export chat history → Feed into OpenSelf → Clone learns personality
→ Clone runs 24/7 on messaging apps → Replies in YOUR voice
→ You review next morning "what did my clone say last night"
```

1. **Export** your chat history (WhatsApp, Telegram, or write a bio)
2. **Feed** it to OpenSelf → AI learns your vocabulary, style, humor, catchphrases
3. **Start** → Your clone runs 24/7 on your messaging apps
4. **Review** → Check what your clone said each morning

## 🎭 Features

| Feature | Description |
|---------|-------------|
| **Personality Cloning** | Learns from your real messages, not generic AI |
| **Human Mimicry** | Random reply delays, typing indicators, occasional typos |
| **Safety First** | Boundaries, topic avoidance, review queue |
| **SOUL.md** | Your personality in a file — editable and transparent |
| **Multi-channel** | WhatsApp, Telegram, Discord — all ready |
| **Clone Arena** | Two clones debate each other on any topic |
| **Ghost Mode** | Clone auto-replies when you're offline |
| **BYOK** | Claude, GPT, DeepSeek, or Ollama (free, local) |
| **100% Local** | Your data never leaves your machine |
| **Clone Score** | Test how accurately your clone mimics you |
| **Shareable Badge** | SVG badge for your README or profile |
| **Profile Sharing** | Export/import personality for cross-clone debates |
| **RAG Memory** | Clone references past conversations naturally |

## 📋 CLI Reference

| Command | Description |
|---------|-------------|
| `openself setup` | Interactive setup wizard |
| `openself feed` | Feed chat history to train personality |
| `openself test` | Clone Score test or interactive chat |
| `openself start` | Start clone on messaging apps |
| `openself share --web` | "Talk to My Clone" web page |
| `openself review` | Review what your clone said |
| `openself arena` | Clone vs Clone debate |
| `openself ghost` | Ghost Mode — clone replies when offline |
| `openself profile` | Export/import personality profiles |

## 📊 Clone Score

```
npx openself test

🧪 Clone Score: 89% (Grade: A-)
Your clone is 89% you.
```

Share your score and challenge your friends!

## 🏟️ Clone Arena

Two clones debate each other — the viral "Clone vs Clone" feature:

```bash
npx openself arena --topic "Cà phê hay trà sữa?"
```

Export a friend's profile and pit your clones against each other:

```bash
npx openself profile export        # Bundle your profile
npx openself arena --soul2 friend.openself  # Debate!
```

## 👻 Ghost Mode

Your clone replies when you're offline and stops when you're back:

```bash
npx openself ghost on    # Clone takes over
npx openself ghost off   # You're back
npx openself ghost       # Check status
```

## 🔧 Setup

See the full [Setup Guide](./docs/setup-guide.md) for detailed instructions.

```bash
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install
cp .env.example .env    # Edit with your API key
```

**Feed your personality:**

```bash
npx openself feed --whatsapp ./chat-export.txt --name "Your Name"
npx openself feed --telegram ./telegram-export/result.json --name "Your Name"
npx openself feed --manual ./my-personality.md
```

**Test & Go Live:**

```bash
npx openself test                   # Clone Score test
npx openself test --interactive     # Chat with your clone
npx openself start --whatsapp       # QR code pairing
npx openself start --telegram       # Telegram bot
npx openself start --discord        # Discord bot
```

## 🏷️ Clone Score Badge

Add to your GitHub README or website:

```markdown
[![OpenSelf Clone Score](http://localhost:3000/badge/yourname)](http://localhost:3000)
```

## 🔐 Privacy

- All data stays on **YOUR** machine
- Chat history is processed locally
- No cloud, no tracking, no telemetry
- You control every boundary via SOUL.md
- Review queue lets you approve uncertain replies

## 🛠 Supported LLM Providers

| Provider | Cost/message | Setup |
|---|---|---|
| **Claude** (Anthropic) | ~$0.003 | API key |
| **GPT-4o-mini** (OpenAI) | ~$0.0015 | API key |
| **DeepSeek V3** | ~$0.0003 | API key |
| **Ollama** (local) | $0 | Local install |

Average user cost: **$2-5/month** (cheaper than a coffee ☕)

## 📖 Documentation

**Getting started:**
- [Setup Guide](./docs/setup-guide.md) — Get started in 5 minutes
- [Personality Tuning](./docs/personality-tuning.md) — Fine-tune SOUL.md
- [Safety Guide](./docs/safety-guide.md) — Understand safety features

**Reference & development:**
- [Codebase Summary](./docs/codebase-summary.md) — Module map and data flow
- [System Architecture](./docs/system-architecture.md) — Component design and security boundaries
- [Code Standards](./docs/code-standards.md) — Development conventions and testing
- [Project Roadmap](./docs/project-roadmap.md) — Release history and future plans

**Resources:**
- [SOUL.md.example](./SOUL.md.example) — Personality template
- [CHANGELOG](./CHANGELOG.md) — Release history

## 🧪 Testing

```bash
npm test              # Run tests with vitest
npm run test:watch   # Watch mode for development
npm run test:coverage # Generate coverage report
npm run test:clone   # Run Clone Score test (the old 'npm test' behavior)
```

See [Code Standards](./docs/code-standards.md) for testing conventions.

## 🛠 Development

```bash
npm run lint         # Check code with ESLint
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format with Prettier
npm run format:check # Check formatting
```

See [Code Standards](./docs/code-standards.md) for development guidelines and [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution process.

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| **WhatsApp QR code doesn't render** | Terminal may not support Unicode. Try WSL, Git Bash, or `--qr-ascii` mode if available. On Windows, use PowerShell Core v7+. |
| **Clone never replies** | Check: (1) API key in `.env` is correct, (2) `data/SOUL.md` exists, (3) provider env var matches (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.). Run `npx openself setup` to re-configure. |
| **"Vietnamese AI-reveal not detected"** | Upgrade to v0.6.0+. Earlier versions had a regex bug (`\t` vs `\b`). Run `npm update openself`. |
| **Personality stats not used by clone** | Run `npx openself feed` again to regenerate `data/personality.json`. Without it, mimicry uses defaults (standard delays, no custom emoji frequency). |
| **"No SOUL.md found" error** | Run `npx openself feed --whatsapp ./chat.txt --name "Your Name"` to create one. You need at least one chat export. |
| **Clone replies too fast / too slow** | Edit `data/personality.json` and adjust `responseTimeAvg` (milliseconds). Or re-feed with more diverse conversation examples. |
| **"Unknown provider" error** | Set one of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, or `OLLAMA_BASE_URL` in `.env`. See [Setup Guide](./docs/setup-guide.md). |
| **Memory errors on large chat exports** | Break into multiple feed commands: `npx openself feed --whatsapp chat1.txt --name You && npx openself feed --whatsapp chat2.txt --name You`. RAG indexing is incremental. |

See [Safety Guide](./docs/safety-guide.md) for safety features and [System Architecture](./docs/system-architecture.md) for how the clone works.

## 🤝 Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install
npx openself feed --whatsapp ./test-data/sample-whatsapp.txt --name "Harvey"
npm test
```

## 📜 License

MIT — do whatever you want with it.

---

**OpenSelf** — *AI that IS you.* 🧑
