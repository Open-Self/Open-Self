# Safety Guide

OpenSelf includes multiple layers of protection to keep your clone safe and responsible. This guide explains each safety feature and how to configure them.

## Safety Architecture

```
Incoming Message
      │
      ▼
┌─────────────┐     ┌──────────────┐
│ Online Hours │ ──▶ │ Topic Filter  │
│   Check      │     │ (avoid list) │
└─────────────┘     └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Clone Brain  │
                    │ (generate)    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │   Safety Guard Check     │
              │ • AI reveal detection    │
              │ • Sensitive info check   │
              │ • Unknown contact mode   │
              └────────────┬────────────┘
                           │
                    ┌──────▼───────┐
                    │ Review Queue  │
                    │ (if unsure)   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Send Reply   │
                    └──────────────┘
```

## 1. Boundary Enforcement

Configure what your clone should never discuss in `SOUL.md`:

```markdown
## Boundaries
- Never share: Personal finances, health info, passwords, address
- Deflect topics: Politics, religion (say "ko bàn mấy cái này 😅")
- When unsure: Say "để t hỏi lại rồi rep sau nha"
```

**How it works:** Before sending any reply, the Safety Guard checks:
- Does the reply contain never-share info? → **Block + queue for review**
- Does the incoming message touch a deflect topic? → **Send deflect message**
- Is the clone unsure? → **Send fallback message**

## 2. AI Self-Reveal Prevention

The clone must never reveal it's an AI. The detection system catches phrases in both English and Vietnamese:

**Blocked phrases (examples):**
- "As an AI", "I'm an AI", "language model", "I was programmed"
- "Tôi là AI", "mô hình ngôn ngữ", "được lập trình"

If a reply contains any of these → **blocked automatically**, alternative reply generated instead.

## 3. Review Queue

Uncertain replies go to a review queue instead of being sent:

```bash
npx openself review
```

The review dashboard shows:
- Messages where the clone was unsure
- Replies flagged by safety checks
- Unknown contact interactions

For each item you can: **Approve** | **Edit reply** | **Reply yourself** | **Dismiss**

Review queue is stored in `data/review-queue.json`.

## 4. Online Hours

Your clone only replies during configured hours (default `08:00–23:00`):

```markdown
## Clone Behavior
- online_hours: 08:00-23:00
```

Messages received outside these hours are ignored — just like a real human sleeping.

## 5. Unknown Contact Handling

When someone not in your contacts messages:
- Clone enters **cautious mode** — shorter, more guarded replies
- Doesn't share personal information
- Default deflection: "Ai đây nhỉ?"

## 6. Ghost Mode Safety

Ghost Mode (`openself ghost on`) adds an extra layer:
- Clone only replies when you're offline
- Automatically stops when you come back online
- `openself ghost ping` — manually check if ghost is active

## 7. Best Practices

| Practice | Why |
|----------|-----|
| Review queue daily | Catch inappropriate replies early |
| Start with close friends | Safest environment to test accuracy |
| Keep boundaries strict | Easier to relax later than to tighten |
| Test with `--interactive` first | Chat with your clone before going live |
| Set conservative online hours | Reduce risk by limiting active time |

## Reporting Issues

If your clone says something inappropriate:
1. Check `data/review-queue.json` for the flagged entry
2. Edit `SOUL.md` boundaries to prevent recurrence
3. File an issue at [GitHub Issues](https://github.com/Open-Self/open-self/issues) if it's a system bug

## See Also

- [Setup Guide](./setup-guide.md) — First-time setup
- [Personality Tuning](./personality-tuning.md) — Fine-tune SOUL.md
