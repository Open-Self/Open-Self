# Setup Guide

Get OpenSelf running in 5 minutes. This guide covers installation, API key configuration, feeding your personality, and going live.

## Prerequisites

- **Node.js** ≥ 18.0.0 ([download](https://nodejs.org))
- **An LLM API key** — Claude, GPT, DeepSeek, or [Ollama](https://ollama.ai) (free, local)
- **Chat history** — WhatsApp `.txt` export, Telegram JSON export, or a manual personality brief

## 1. Install

```bash
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install
```

## 2. Run the Setup Wizard

```bash
npx openself setup
```

The wizard will guide you through:
1. **Choose LLM provider** — Anthropic Claude (recommended), OpenAI GPT, DeepSeek, or Ollama
2. **Enter API key** — paste your key (Ollama users can skip, it's local)
3. **Enter your name** — used to identify your messages in chat exports

This creates a `.env` file with your configuration.

### Manual Configuration

Alternatively, copy and edit `.env` directly:

```bash
cp .env.example .env
# Edit with your API key and provider
```

## 3. Export Your Chat History

### WhatsApp (easiest, most popular)

1. Open WhatsApp on your phone
2. Go to a conversation → **⋮ Menu** → **More** → **Export chat**
3. Choose **Without media** → save the `.txt` file
4. Transfer to your computer

> **Tip:** Export 3–5 conversations with different people for the most accurate clone. Mix casual friends, family, and work chats.

### Telegram

1. Open **Telegram Desktop**
2. **Settings** → **Advanced** → **Export Telegram Data**
3. Choose **JSON** format → select conversations → export
4. The export produces a `result.json` file

### Manual Brief

Write a markdown file describing your communication style:

```markdown
# My Personality
- I use lots of emoji 😂
- Casual tone, hate small talk, love deep conversation
- Vietnamese with some English mixed in
- Catchphrases: "oke", "ngon", "vl"
- Short messages, rarely over 20 words
```

## 4. Feed Your Personality

```bash
# WhatsApp (can feed multiple files)
npx openself feed --whatsapp ./chat-with-bestfriend.txt --name "Your Name"
npx openself feed --whatsapp ./chat-with-mom.txt --name "Your Name"

# Telegram
npx openself feed --telegram ./telegram-export/result.json --name "Your Name"

# Manual personality brief
npx openself feed --manual ./my-personality.md
```

**More chats = better clone accuracy.** Aim for at least 500 messages total.

After feeding, OpenSelf generates your `SOUL.md` — a readable personality profile. See [Personality Tuning](./personality-tuning.md) to customize it.

## 5. Test Your Clone

```bash
# Automated Clone Score test (10 conversations)
npx openself test

# Interactive chat — talk to your clone in the terminal
npx openself test --interactive
```

Clone Score tells you how accurately your clone mimics you. Aim for **80%+** before going live.

## 6. Go Live

```bash
# Telegram (need a bot token from @BotFather)
npx openself start --telegram

# Discord (need a bot token from Discord Developer Portal)
npx openself start --discord

# WhatsApp (scans QR code — no API key needed!)
npx openself start --whatsapp
```

Your clone is now live and will respond to messages in your style.

## 7. Review & Monitor

```bash
# Daily report — what your clone said
npx openself review
```

Check each morning what your clone replied overnight. Approve, edit, or take over uncertain replies.

## What's Next?

- **[Personality Tuning](./personality-tuning.md)** — Fine-tune SOUL.md for better accuracy
- **[Safety Guide](./safety-guide.md)** — Understand boundaries, review queue, and safety features
- **Clone Arena** — `npx openself arena --topic "..."` to pit clones against each other
- **Ghost Mode** — `npx openself ghost on` for automatic offline replies
