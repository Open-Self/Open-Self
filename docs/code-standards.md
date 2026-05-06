# Code Standards

Conventions, patterns, and quality gates for OpenSelf development. Follow these standards to maintain consistency and enable effective code review by LLM tools.

## File Organization

### Naming Convention

**JavaScript files:** kebab-case with descriptive long names
- ✅ `personality-extractor.js`, `whatsapp-gateway.js`, `ai-detection.js`
- ❌ `extractor.js`, `gateway.js` (too generic)

**Directories:** kebab-case
- `src/cli/`, `src/parsers/`, `src/gateway/`, `src/safety/`

**Classes/Exported objects:** PascalCase
- `CloneBrain`, `HumanMimicry`, `SafetyGuard`, `ReviewQueue`

**Functions/Imports:** camelCase
- `extractPersonality()`, `loadSoul()`, `createProvider()`

### File Size

**Target:** <200 lines per file (LOC including comments)

**Rationale:** Enables LLM tools (grep, IDE, AI analysis) to maintain full context.

**Current oversize files (flagged for future refactor):**
- `src/personality/extractor.js` — 328 lines (extract emoji analysis, word analysis, VN detection into separate modules)
- `src/cli/test.js` — 287 lines (split: Clone Score logic vs. interactive chat handler)
- `src/gateway/whatsapp.js` — 229 lines (split: QR rendering, connection management, message processing)

**When to split:**
- File approaches 150 lines → plan refactor
- File exceeds 200 lines → refactor in next phase
- Move helper functions to separate modules
- Extract classes into individual files

### Module Shape

**ESM Imports/Exports:**
```javascript
import { foo } from './other.js';
export { bar };
export function baz() { ... }
export class Qux { ... }
```

**Prefer named exports** over default exports (enables easier grep).

**Re-exports in index.js:**
```javascript
// src/index.js
export { extractPersonality } from './personality/extractor.js';
export { createProvider, autoDetectProvider } from './brain/router.js';
```

## Error Handling

### Structured Errors

All errors should have a `.code` property for CLI routing.

```javascript
const error = new Error('SOUL.md not found');
error.code = 'NO_SOUL';
throw error;
```

**Standard error codes:**
- `NO_SOUL` — Missing data/SOUL.md
- `NO_API_KEY` — API key not configured
- `INVALID_SOUL` — SOUL.md failed Zod validation
- `INVALID_PROFILE` — Imported profile malformed
- `ECONNREFUSED` — Network error (API unreachable)
- `MISSING_PROVIDER` — LLM provider not available

### CLI Error Handler

All CLI commands wrap their actions with `wrapAction()`:

```javascript
import { wrapAction, handleError } from './utils/error-handler.js';

program.command('feed')
    .action(wrapAction(feedCommand));
```

The wrapper catches async errors and routes them via `handleError()`:
- Exit code 0: success
- Exit code 1: generic error
- Exit code 2: config error (missing .env, NO_API_KEY, etc.)
- Exit code 3: network error (ECONNREFUSED, timeout)

See `src/cli/utils/error-handler.js` for implementation.

## Code Quality

### Linting

**Tool:** ESLint v9 (flat config)

**Config:** `eslint.config.js` at root

**Run before commit:**
```bash
npm run lint          # Check
npm run lint:fix      # Auto-fix
```

**Rules enforced:**
- No unused variables
- No misleading character classes (emoji regex flagged but exempted with eslint-disable-next-line)
- Consistent import style
- No console.log in production code (OK in CLI setup/help)

**Violations block CI** (GitHub Actions matrix).

### Formatting

**Tool:** Prettier v3

**Config:** `.prettierrc` (if exists) or defaults
- **Tab width:** 4 spaces
- **Line length:** 100 characters
- **Quotes:** Single quotes (`'`)
- **Semicolons:** Enabled
- **Trailing commas:** Enabled

**Run before commit:**
```bash
npm run format        # Apply
npm run format:check  # Check (CI)
```

### Comments

**Good:**
- Explain *why*, not *what*
- Document non-obvious logic
- Reference related code

```javascript
/**
 * Personality Extractor — Analyze chat messages to extract personality traits
 * 
 * Returns numeric + semantic fields for brain prompt injection.
 * Numeric fields (avgMessageLength, emojiFrequency) override defaults at runtime.
 */
export function extractPersonality(yourMessages, conversations = []) {
    // ...
}

// Vietnamese AI-reveal detection: "\bTôi là một AI\b"
// v0.6.0 fix: corrected "\t" (tab) to "\b" (word boundary)
// so patterns actually match Vietnamese text.
const VN_AI_PATTERNS = [
    /\bTôi là một AI\b/gi,
    // ...
];
```

**Avoid:**
- Stating obvious: `const x = 5; // x is 5`
- Commented-out code (use git history instead)
- Emojis in code (OK in CLI output, not in source)

## Testing

### Test Structure

**Location:**
- Unit tests: `tests/unit/<module>/` (mirrors src structure)
- Integration tests: `tests/integration/`
- Test data: `tests/fixtures/`
- Mock SDKs: `tests/helpers/mock-*.js`

**Naming:**
```
tests/unit/brain/clone.test.js
tests/unit/safety/ai-detection.test.js
tests/integration/pipeline.test.js
```

### Test Framework

**Tool:** Vitest

**Run:**
```bash
npm test              # Single run
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

**Coverage thresholds (graduated):**
- Line: ≥50% (phase 04), target 70% (phase 07)
- Function: ≥50%
- Branch: ≥40%
- Statement: ≥50%

### Mock Patterns

**SDK mocks:** Centralized in `tests/helpers/`
```javascript
// tests/helpers/mock-anthropic.js
export const mockAnthropicSDK = {
    messages: {
        create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Mock reply' }]
        })
    }
};
```

**Usage in tests:**
```javascript
import { describe, it, beforeEach, vi } from 'vitest';
import { mockAnthropicSDK } from '../../helpers/mock-anthropic.js';

vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: vi.fn(() => mockAnthropicSDK)
}));
```

### No Real Network/LLM Calls

- Never make real HTTP requests in tests
- Never call real LLM APIs (mocks only)
- Use fixture data (JSON files under tests/fixtures/)
- Mock Vectra / embeddings modules

**Bad:**
```javascript
// ❌ This calls real Claude API
const brain = new CloneBrain(soul, config);
const reply = await brain.generateReply(msg, contact, realProvider);
```

**Good:**
```javascript
// ✅ Mocked provider
const mockProvider = {
    chat: vi.fn().mockResolvedValue('Mock reply')
};
const reply = await brain.generateReply(msg, contact, mockProvider);
```

## Commit Conventions

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code refactor (no behavior change)
- `test:` — Test additions / changes
- `chore:` — Build, deps, CI config
- `security:` — Security hardening

**Examples:**
```
feat(brain): add support for DeepSeek provider

fix(safety): regex corrected from \t to \b for VN AI detection

docs(setup): add Troubleshooting section

refactor(personality): split extractor into 3 modules
```

**Rules:**
- Subject <70 characters
- No emojis in commit message (use in CLI help, not version control)
- Lowercase subject
- Imperative mood ("add", "fix", not "adds", "fixed")

### Commits Block CI

All commits run through:
- Linting (`npm run lint`)
- Formatting check (`npm run format:check`)
- Tests (`npm test`)

Violations fail GitHub Actions and block merge.

## Branch Naming

**Format:** `<user>/<type>/<description>`

**Examples:**
- `minhvu/feat/profile-import-sanitization`
- `kai/fix/whatsapp-reconnect`
- `alice/docs/system-architecture`

**Types:** feat, fix, refactor, docs, test, chore

## Code Review Checklist

Before submitting PR, verify:

- [ ] Lint passes (`npm run lint`)
- [ ] Format passes (`npm run format:check`)
- [ ] Tests pass (`npm test`) + coverage not regressed
- [ ] No console.log outside CLI
- [ ] Error handling with `.code` property
- [ ] Comments explain *why*, not *what*
- [ ] File size <200 LOC (new files)
- [ ] External dependencies justified + documented
- [ ] No secrets committed (.env, API keys, tokens)

## Configuration Files

### .eslintrc.js (ESLint Configuration)

```javascript
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    prettier,
    {
        files: ['src/**/*.js'],
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-unused-vars': 'error'
        }
    },
    {
        files: ['src/personality/extractor.js'],
        rules: {
            'no-misleading-character-class': 'off' // emoji regex
        }
    }
];
```

### .prettierrc.json (Formatting)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 4,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### vitest.config.js (Test Configuration)

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            lines: 50,
            functions: 50,
            branches: 40,
            statements: 50
        }
    }
});
```

## Common Patterns

### Loading Configuration

```javascript
import { loadConfig } from '../config/loader.js';

const config = loadConfig();
// Returns { llm: { provider, apiKey }, data: { dir }, ... }
```

### Loading Soul with Validation

```javascript
import { loadSoul } from '../brain/clone.js';
import { validateSoul } from '../config/soul-schema.js';

const rawContent = loadSoul('./data');
const parsed = parseSoulMd(rawContent);
const validated = validateSoul(parsed);
```

### Creating Providers

```javascript
import { createProvider, autoDetectProvider } from '../brain/router.js';

// Auto-detect from .env
const provider = createProvider(autoDetectProvider());

// Or explicit
const provider = createProvider('anthropic');

// Use
const reply = await provider.chat(systemPrompt, userMessage);
```

### Error Handling in CLI

```javascript
import { handleError } from './utils/error-handler.js';

export async function myCommand() {
    try {
        // Do work
    } catch (error) {
        handleError(error);
        process.exit(error.code === 'NO_SOUL' ? 2 : 1);
    }
}
```

## Security Standards

### Never Commit Secrets

Use `.gitignore`:
```
.env
.env.local
data/whatsapp-session/
data/discord-token
```

### Input Validation

**Profile imports:** Sanitize before LLM injection
```javascript
const MAX_PERSONALITY_LEN = 5000;
const sanitized = profile.personality
    .replace(/```[\s\S]*?```/g, '')  // Remove code fences
    .substring(0, MAX_PERSONALITY_LEN);
```

**Web inputs:** Whitelist expected formats
```javascript
// /api/chat endpoint
if (!message || message.length > 500) {
    res.status(400).json({ error: 'Invalid message' });
    return;
}
```

**SOUL.md:** Zod validation before use
```javascript
import { validateSoul } from '../config/soul-schema.js';
const soul = validateSoul(parsed);  // Throws if invalid shape
```

## Documentation Requirements

**Module must have JSDoc if:**
- Exported function/class
- Non-obvious parameters
- Return type complex

**Example:**
```javascript
/**
 * Extract personality traits from message array.
 * 
 * @param {Array} yourMessages - Messages sent by user (must have .text field)
 * @param {Array} conversations - Conversation pairs (optional, for response timing)
 * @returns {Object} Numeric + semantic personality object
 *   - avgMessageLength: number
 *   - emojiFrequency: number
 *   - catchphrases: string array
 *   - ... (see return type in code)
 */
export function extractPersonality(yourMessages, conversations = []) {
    // ...
}
```

## Dependencies

**Allowed without justification:**
- CLI: commander, chalk, inquirer, ora (UI)
- Config: yaml, zod, dotenv
- LLM: @anthropic-ai/sdk, openai, (deepseek uses openai SDK)
- Gateway: grammy, discord.js, @whiskeysockets/baileys, qrcode-terminal
- Memory: vectra
- Server: express
- Testing: vitest

**New deps require discussion:**
- Why not use existing patterns?
- What's the overhead (bundle size, security surface)?
- Is it actively maintained?

## Performance Guidelines

- Avoid O(n²) algorithms in hot paths (RAG lookup, extractor)
- Profile before optimizing (use Node.js --inspect)
- Lazy-load heavy modules (Discord.js loaded only in start command)
- Cache parsed SOUL.md / personality.json at pipeline startup (not per message)

## Accessibility & Internationalization

- CLI output: Use chalk for color (respects NO_COLOR env var)
- Error messages: Clear, actionable, in English
- Vietnamese support: Tested patterns with diacritics (ă, ê, ô, etc.)
- Emoji: Works in terminal (verify on Windows + Linux CI)

## Future Directions

**v0.7+:**
- TypeScript migration (gradually, via JSDoc + type checking)
- Modularize extractor, test.js, whatsapp.js (phase 05)
- Semantic-release for automated versioning (phase 08+)
- HTML test reports (vitest HTML coverage)
