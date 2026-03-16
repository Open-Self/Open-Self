---
platform: Reddit
subreddit: r/SideProject, r/artificial, r/programming
method: auto
---
Title: I replaced myself on WhatsApp for a week using my open-source AI clone — nobody noticed

Body:
I built OpenSelf, an open-source tool that turns your chat history into an AI personality clone. After a week of letting it handle all my messages, not a single friend realized.

How it works:

1. Export your WhatsApp/Telegram chat history
2. Feed it to OpenSelf — it extracts your vocabulary, humor, catchphrases, emoji habits, abbreviations
3. It generates a SOUL.md — your personality in readable, editable markdown
4. Start your clone on WhatsApp (QR code), Telegram, or Discord
5. Your clone replies 24/7 in your style

What makes it different from "just using ChatGPT":

- Trained on YOUR real messages, not generic AI — it uses YOUR catchphrases, YOUR abbreviations
- Human mimicry — random reply delays, typing indicators, typos, message splitting
- Self-hosted — your chat data never leaves your machine
- BYOK — Claude, GPT, DeepSeek, or free local Ollama
- Safety system — boundaries, topic avoidance, review queue for uncertain replies
- Ghost Mode — auto-replies when offline, stops when you return
- Clone Arena — two clones debate each other on any topic

After 7 days: 156 messages received, 131 handled autonomously (84%), $3.12 total API cost. Zero friends noticed.

v0.5.0 ships with full documentation, GitHub Actions CI, and npm publish support. MIT license.

Blog post with full story: [link]
GitHub: https://github.com/Open-Self/open-self
