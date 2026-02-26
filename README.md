# 🧑 OpenSelf

### Your AI clone. Your messages. Your machine.

OpenSelf turns your chat history into an AI clone that speaks exactly like you — on WhatsApp, Telegram, and Discord. Open source. Self-hosted. Bring your own API key.

> OpenClaw is AI that does things *for* you.
> OpenSelf is AI that *is* you.

---

## ⚡ Quick Start

```bash
# Install
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install

# Feed your personality
npx openself feed --whatsapp ./my-chat-export.txt

# Test your clone
npx openself test

# Go live
npx openself start --telegram
npx openself start --discord
npx openself start --whatsapp
```

## 🧠 How It Works

1. **Export** your chat history (WhatsApp, Telegram, or write a bio)
2. **Feed** it to OpenSelf → AI learns your vocabulary, style, humor, catchphrases
3. **Start** → Your clone runs 24/7 on your messaging apps
4. **Review** → Check what your clone said each morning

```
You export chat history → Feed into OpenSelf → Clone learns personality
→ Clone runs 24/7 on messaging apps → Replies in YOUR voice
→ You review next morning "what did my clone say last night"
```

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

### 1. Install

```bash
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install
```

### 2. Configure API Key

```bash
cp .env.example .env
# Edit .env with your API key (Claude, GPT, DeepSeek, or Ollama)
```

### 3. Feed Your Personality

**Option A: WhatsApp Export (easiest)**
```bash
# WhatsApp → Settings → Chats → Export Chat → Save .txt file
npx openself feed --whatsapp ./chat-with-bestfriend.txt
npx openself feed --whatsapp ./chat-with-mom.txt
# More chats = better clone accuracy
```

**Option B: Telegram Export**
```bash
# Telegram Desktop → Settings → Advanced → Export Telegram Data (JSON)
npx openself feed --telegram ./telegram-export/result.json
```

**Option C: Manual Personality Brief**
```bash
npx openself feed --manual ./my-personality.md
```

### 4. Test & Go Live

```bash
npx openself test                   # Clone Score test
npx openself test --interactive     # Chat with your clone
npx openself start --whatsapp       # QR code pairing — no API key needed!
npx openself start --telegram       # Telegram bot
npx openself start --discord        # Discord bot
```

### 5. SOUL.md

After feeding, OpenSelf generates a `SOUL.md` file — your personality in readable markdown. You can edit it to fine-tune your clone. See [SOUL.md.example](./SOUL.md.example) for reference.

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

## 🤝 Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development

```bash
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install
# Make changes...
npx openself feed --whatsapp ./test-data/sample-whatsapp.txt
npx openself test
```

## 📜 License

MIT — do whatever you want with it.

---

**OpenSelf** — *AI that IS you.* 🧑
