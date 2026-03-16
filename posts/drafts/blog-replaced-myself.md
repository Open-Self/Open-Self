---
type: blog
status: draft
target_platforms: hackernews, reddit, dev.to, medium, twitter-thread
word_count: ~1800
---

# I Replaced Myself on WhatsApp for a Week — Nobody Noticed

*How I built an open-source AI clone that texts like me, and what happened when I let it loose on my friends.*

---

Last Tuesday, I did something most people would call unhinged: I let an AI pretend to be me on WhatsApp. For seven days. To all my contacts.

Not a generic chatbot. Not some customer service bot with my name on it. A **clone** — trained on 5 years of my actual chat history — that speaks in my voice, uses my slang, drops my emoji at the right moments, and even delays replies the way I do.

I built it. I called it **OpenSelf**. And then I vanished.

## Why I Did This

I was drowning. 147 unread messages across WhatsApp, Telegram, and Discord. Group chats pinging about dinner plans. A friend sending memes at 2 AM. My mom asking if I'd eaten.

The usual AI answer is "use ChatGPT to draft replies." But that's still *me* doing the work — reading, deciding, editing. I wanted something radical:

**What if an AI could just BE me?**

Not an assistant. Not a helper. A digital twin that knows my personality so well that my friends wouldn't notice.

## The Setup (5 Minutes, No GPU)

OpenSelf is stupidly simple. No fine-tuning, no GPU, no cloud:

```bash
git clone https://github.com/Open-Self/open-self.git
cd open-self && npm install

# Feed 5 years of WhatsApp history
npx openself feed --whatsapp ./chat-bestfriend.txt --name "Harvey"
npx openself feed --whatsapp ./chat-mom.txt --name "Harvey"
npx openself feed --whatsapp ./chat-workgroup.txt --name "Harvey"

# Check the clone accuracy
npx openself test
# Clone Score: 89% (Grade: A-)

# Let it loose
npx openself start --whatsapp
```

That's it. My clone scanned 12,847 messages, built a personality profile (saved as a readable `SOUL.md` file), and started intercepting my WhatsApp.

It even generated relationship-specific rules:
- **Best friend**: Roast mode on, inside jokes allowed
- **Mom**: Respectful, short replies, emoji hearts
- **Work group**: Professional-ish, no slang

## Day 1: The Easy Wins

My best friend texted: *"ê mai đi nhậu ko?"*

Clone replied: *"mai t rảnh, 7h đi nha 🍺"*

I checked the log. That's almost exactly what I would've said — same abbreviation, same emoji, same confirming tone. Clone Score: 94% match.

Mom asked: *"Con ơi chiều nay con về ăn cơm không?"*

Clone: *"Dạ chiều con về mẹ ơi ❤️"*

Spot on. The "dạ" at the start, the heart emoji I always send my mom. I started feeling... weirdly proud.

## Day 3: The First Near-Miss

Colleague in a group chat: *"Khi nào xong project?"*

Clone: *"Để t check lại rồi rep sau nha"*

This was the safety net kicking in. The clone didn't know the actual project timeline, so it used my default deflection — which is EXACTLY what I say when I don't know something. The colleague didn't question it.

But it got queued in my review dashboard:

```
⚠️ @colleague asked about project deadline
→ Clone deflected: "Để t check lại rồi rep sau nha"
→ [Approve] [Edit reply] [Reply yourself]
```

I jumped in, sent the real answer, and let the clone continue with everything else.

## Day 5: The Turing Test

An unknown number texted: *"Ê Harvey, nhớ tao không?"*

Clone: *"Ai đây nhỉ? 🤔"*

PERFECT. That's my exact response to unknown numbers. The stranger turned out to be an old classmate. They chatted for 10 minutes. The clone never broke character.

My friend later told me it was a normal conversation. He had no idea.

## Day 7: The Reveal

I told my 3 closest friends the truth.

**Best friend**: "WHAT. Which messages were the clone? Wait I literally can't tell??"

**Mom**: She wasn't amused. Then she asked if the clone always sends the heart emoji. I said yes. She said: *"Thì giống con thật mà."*

**Colleague**: "So the project status thing... that was a bot?" He was impressed it knew to deflect rather than make up a deadline.

## The Numbers

After 7 days:

| Metric | Value |
|--------|-------|
| Messages received | 156 |
| Clone replied | 131 (84%) |
| Queued for review | 19 (12%) |
| Skipped (unsure) | 6 (4%) |
| Friends who noticed | **0** |
| Total API cost | **$3.12** |

The clone handled 84% of my conversations autonomously. I only needed to step in for project-specific questions and one sensitive topic it correctly avoided (politics in a group chat).

## What Makes It Work

Three things separate OpenSelf from a generic chatbot:

**1. Human Mimicry** — My clone doesn't reply instantly like a bot. It waits 30 seconds to 3 minutes (randomized), shows "typing..." before responding, and occasionally sends multiple short messages instead of one long one. Because that's what I do.

**2. Vocabulary Fingerprint** — It doesn't just have my writing style. It has my EXACT vocabulary: my catchphrases ("oke", "ngon", "vl"), my greeting style ("ê", "yo", "hello bro"), my abbreviations ("k", "dc", "nc"). It even knows I never write "Best regards" because I never have.

**3. Safety Boundaries** — When unsure, it deflects instead of hallucinating. It won't share my finances, won't discuss topics I've blocked, and queues uncertain replies for my review. This is what prevents the "AI clone says something insane" scenario.

## Open Source, $0, Your Machine

OpenSelf is MIT-licensed. No cloud, no subscription, no data collection.

- You clone the repo
- You feed YOUR chat history (stays on YOUR machine)
- You bring your own API key (Claude, GPT, DeepSeek, or free local Ollama)
- You control every boundary via an editable `SOUL.md` file

Average cost: $2-5/month in API calls. Less than a coffee.

→ **[GitHub: Open-Self/open-self](https://github.com/Open-Self/open-self)**

## FAQ I Know You're Thinking

**"Isn't this... catfishing?"** — Fair point. I told my close circle afterward. For ongoing use, Ghost Mode auto-stops when you're back online. You can also add a disclaimer in SOUL.md.

**"What if the clone says something harmful?"** — Safety guard blocks revealing it's AI, avoids sensitive topics, and queues uncertain messages. No system is perfect, but the review queue catches edge cases.

**"Why not just use ChatGPT?"** — ChatGPT doesn't know your vocabulary, your emoji habits, your relationship with your mom vs. your best friend. OpenSelf does. That's the difference between "AI-assisted reply" and "digital twin."

**"Is this legal?"** — Same legal framework as auto-responders and email filters. Your messages, your choice. But always consider the ethics of who you're talking to.

---

*I'm building OpenSelf solo. If you think your friends can't tell the difference either, try it. Then share your Clone Score.*

*And if your clone roasts your friend better than you could — that's a feature, not a bug. 💀*
