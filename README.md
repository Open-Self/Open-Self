# OpenSelf

[![npm version](https://img.shields.io/npm/v/openself?color=blue)](https://www.npmjs.com/package/openself)
[![CI](https://github.com/Open-Self/Open-Self/actions/workflows/ci.yml/badge.svg)](https://github.com/Open-Self/Open-Self/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

### Your context. Your memory. Your rules.

OpenSelf is a private, persistent context layer for every AI you use. It stores decisions,
preferences, commitments, relationships, events, and facts with their source, time, scope,
confidence, and sensitivity—then exposes only the relevant context through MCP or its JavaScript API.

Open source. Local-first. Bring your own model. Your existing OpenSelf personality and messaging
tools continue to work.

> A chatbot starts every conversation from zero. OpenSelf lets your agents remember without giving
> them unrestricted access to your life.

## Why OpenSelf?

AI memory is usually trapped inside one vendor, mixed into an opaque conversation history, or
missing the information needed to tell whether a memory is current and trustworthy. OpenSelf makes
memory explicit and portable:

- **Source-attributed:** every memory can point back to a file, chat, meeting, or agent.
- **Time-aware:** `validFrom`, `validTo`, and `occurredAt` distinguish old beliefs from current ones.
- **Scoped:** keep personal context separate from `project/acme` or `relationship/minh`.
- **Sensitivity-aware:** public, personal, private, and restricted memories are filtered at retrieval.
- **Recoverable forgetting:** forgotten memories disappear from retrieval without destroying the audit trail.
- **Agent-native:** MCP tools work with compatible AI clients; the core is also a normal Node.js library.
- **Local-first:** SQLite and FTS5 run on your machine with no account or server required.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install -g openself

# Store a durable decision
openself memory add \
  --type decision \
  --scope project/openself \
  --content "Use SQLite as the local source of truth" \
  --source docs/architecture.md \
  --tags architecture,database

# Recall it later
openself memory search --query "Which database did we choose?" --scope project/openself

# Inspect the vault
openself memory stats
```

From this repository, replace `openself` with `node src/cli/index.js`.

## Connect an AI client with MCP

Run the stdio server directly:

```bash
openself mcp
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "openself": {
      "command": "npx",
      "args": ["-y", "openself", "mcp"],
      "env": {
        "DATA_DIR": "/absolute/path/to/your/openself-data"
      }
    }
  }
}
```

OpenSelf provides four tools:

| Tool | Purpose |
|---|---|
| `openself_remember` | Store typed context with provenance and permissions |
| `openself_search_memory` | Search active memories with scope/time/sensitivity filters |
| `openself_get_context` | Build a bounded, source-attributed context block for a task |
| `openself_forget` | Soft-delete a memory and remove it from future retrieval |

See [Context Vault & MCP](./docs/context-vault.md) for the schema, security model, and integration details.

## Memory model

```json
{
  "type": "decision",
  "content": "Do not use Firebase for Project Atlas",
  "scope": "project/atlas",
  "sensitivity": "private",
  "confidence": 0.95,
  "validFrom": "2026-08-13T09:00:00.000Z",
  "source": {
    "kind": "meeting",
    "locator": "notes/architecture.md",
    "title": "Architecture review"
  },
  "tags": ["database", "architecture"]
}
```

Supported types are `fact`, `preference`, `decision`, `commitment`, `relationship`, `event`, and
`note`. SQLite is the source of truth; FTS5 provides fast Unicode full-text retrieval. The storage
API is intentionally model-independent.

## JavaScript API

```js
import { ContextStore } from 'openself';

const store = new ContextStore({ dataDir: './data' });

store.remember({
    type: 'preference',
    content: 'Prefer concise status updates with concrete evidence',
    scope: 'personal/work',
    source: { kind: 'manual', title: 'Working preferences' },
});

const context = store.buildContext('How should I write this project update?', {
    scope: 'personal/work',
    maxSensitivity: 'private',
    maxChars: 4000,
});

console.log(context.context);
store.close();
```

## Personality and messaging tools

OpenSelf began as a local AI personality clone. Those workflows remain available while the project
moves toward user-controlled context and human-approved actions:

```bash
openself setup
openself feed --whatsapp ./chat.txt --name "You"
openself feed --telegram ./result.json --name "You"
openself test --interactive
openself start --telegram
openself start --discord
openself start --whatsapp
```

Other compatible commands include `review`, `profile`, `share`, `arena`, and `ghost`. Autonomous
messaging should be used only with clear consent, narrow boundaries, and appropriate disclosure.

## Privacy model

OpenSelf is **local-first**, not magically offline in every configuration.

- Context Vault storage and FTS search stay on your machine.
- The MCP server itself makes no model API calls.
- Ollama can keep generation local.
- If you configure OpenAI, Anthropic, DeepSeek, or another cloud model, the context supplied to that
  model leaves your machine under that provider's terms.
- `restricted` memories are excluded from MCP retrieval unless the caller explicitly raises the
  sensitivity ceiling.
- The current stdio MCP transport inherits the permissions of the local client that launches it.
  Protect the data directory and do not expose it as an unauthenticated network service.

## Architecture

```text
Files / chat exports / manual notes / agents
                    │
                    ▼
          typed memory + provenance
                    │
                    ▼
        SQLite source of truth + FTS5
                    │
          scope · time · sensitivity
                    │
             ┌──────┴──────┐
             ▼             ▼
          MCP tools    JavaScript API
             │             │
             └──────┬──────┘
                    ▼
             AI clients/agents
```

The original personality pipeline, RAG index, and messaging gateways remain separate from Context
Vault so existing users are not forced into a migration.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
npm run test:coverage
```

Key documentation:

- [Context Vault & MCP](./docs/context-vault.md)
- [System Architecture](./docs/system-architecture.md)
- [Setup Guide](./docs/setup-guide.md)
- [Safety Guide](./docs/safety-guide.md)
- [Project Roadmap](./docs/project-roadmap.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT
