# Personality Tuning Guide

Your clone's personality lives in `SOUL.md` — a readable markdown file auto-generated from your chat history. This guide shows how to fine-tune it for maximum accuracy.

## Understanding SOUL.md

After running `openself feed`, OpenSelf generates `data/SOUL.md` with sections:

| Section | What it controls |
|---------|-----------------|
| **Identity** | Name, language, typing style |
| **Communication Patterns** | Message length, emoji frequency, formality |
| **Vocabulary Fingerprint** | Catchphrases, greetings, abbreviations |
| **Boundaries** | Topics to avoid, deflect messages, never-share info |
| **Relationships** | Per-contact rules (optional) |
| **Clone Behavior** | Reply delay, online hours, proactive messages |

## Editing SOUL.md

Open `data/SOUL.md` in any text editor. Changes take effect on next `openself start`.

### Improve Accuracy

**Problem:** Clone sounds too formal.
```markdown
## Communication Patterns
- Formality: Casual          # Changed from "Semi-formal"
- Humor: Sarcastic, dry      # Added humor style
```

**Problem:** Clone doesn't use your catchphrases.
```markdown
## Vocabulary Fingerprint
- Catchphrases: oke, ngon, đỉnh, vl, ez, bruh    # Add missing ones
- Never says: "I appreciate your patience", "Best regards"
```

**Problem:** Clone replies too slowly/quickly.
```markdown
## Clone Behavior
- reply_delay: random 10s-2min    # Adjusted from 30s-5min
- typing_indicator: true
```

### Per-Contact Rules

Add relationship context so your clone adjusts its tone:

```markdown
## Relationships
- @bestfriend: Roast freely, inside jokes allowed, use "mày/tao"
- @mom: Respectful, shorter replies, more emoji hearts, use "con/mẹ"
- @boss: Professional but friendly, no slang, no abbreviations
- @girlfriend: Affectionate, remember important dates, use "anh/em"
```

### Vietnamese-Specific Tuning

```markdown
## Vietnamese Style
- Pronoun usage: tao/mày with close friends, anh/em default
- Diacritics: Sometimes skipped (e.g., "dc" for "được")
- Abbreviations: k, ko, dc, nc, vl, =)), ahihi
- Slang awareness: "xịn", "gắt", "chill", "flex"
```

## Improving Clone Score

Run `npx openself test` to measure accuracy. Tips to raise your score:

1. **Feed more data** — More chats = better vocabulary and pattern detection
2. **Mix conversation types** — Include casual, work, family, and group chats
3. **Edit catchphrases** — Manually add phrases the extractor missed
4. **Adjust formality** — Set the right level for your default tone
5. **Re-run test** — After editing SOUL.md, test again to see improvement

```bash
# Feed more data
npx openself feed --whatsapp ./another-chat.txt --name "Your Name"

# Re-test
npx openself test --count 20    # More test cases for accurate score
```

## Resetting Personality

To start fresh:

```bash
# Delete generated data
rm data/SOUL.md
rm -rf data/memory-index/

# Re-feed with new/different chats
npx openself feed --whatsapp ./new-chat.txt --name "Your Name"
```

## See Also

- [SOUL.md.example](../SOUL.md.example) — Reference template
- [Setup Guide](./setup-guide.md) — First-time setup
- [Safety Guide](./safety-guide.md) — Boundary configuration
