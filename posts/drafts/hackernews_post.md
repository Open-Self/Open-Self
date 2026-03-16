---
platform: Hacker News
method: auto
---
Title: Show HN: OpenSelf – Open-source AI personality clone for messaging apps (v0.5.0)

Text:
OpenSelf turns your chat history into an AI clone that speaks exactly like you on WhatsApp, Telegram, and Discord.

The personality engine extracts vocabulary fingerprints, emoji patterns, catchphrases, formality levels, and language-specific traits from exported chat files. It generates a SOUL.md — your personality in readable markdown that you can audit and edit.

Processing pipeline: RAG retrieval over indexed conversations → dynamic system prompt construction → LLM generation (Claude/GPT/DeepSeek/Ollama BYOK) → safety guard → human mimicry post-processing (reply delays, typing simulation, typo injection).

v0.5.0 adds documentation (setup/personality-tuning/safety guides), GitHub Actions CI, colored CLI help with quickstart examples, and npm publish readiness.

I replaced myself on WhatsApp for a week — 156 messages, 84% handled autonomously, $3.12 API cost, zero friends noticed. Full write-up: [blog link]

Tech: Node.js ESM, vectra (vector search), grammy, discord.js, Baileys. MIT license.

https://github.com/Open-Self/open-self
