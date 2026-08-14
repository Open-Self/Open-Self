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
- **Hybrid retrieval:** FTS5 and deterministic local vectors are fused without an embedding API.
- **Conflict-aware:** similar active facts, preferences, and decisions are surfaced before storage.
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

# Check a possible preference change before storing it
openself memory conflicts \
  --type preference \
  --scope personal/work \
  --content "My preferred code editor is Zed"

# Inspect the vault
openself memory stats
```

From this repository, replace `openself` with `node src/cli/index.js`.

## Local dashboard

Launch the Context Vault dashboard:

```bash
openself dashboard
openself dashboard --port 3210 --data-dir /absolute/path/to/openself-data
```

The CLI prints a tokenized bootstrap URL. The dashboard binds only to `127.0.0.1`, exchanges that
token for an HttpOnly/SameSite session cookie, and protects mutations from cross-origin requests.
It supports hybrid search, create/edit/forget, conflict review, duplicate merge, provenance fields,
and version history. It is a local administration surface—not a public multi-user service.

## Import existing context

Import documents and chat exports directly into the vault:

```bash
# Markdown/text becomes source-attributed notes, split by headings and size
openself memory import --file ./notes.md ./decisions.txt --scope project/atlas

# WhatsApp .txt and Telegram result.json become private timestamped events
openself memory import --file ./whatsapp-chat.txt --scope relationship/minh
openself memory import --file ./result.json --scope relationship/team

# Preview without writing
openself memory import --file ./notes.md --dry-run
```

Format detection supports Markdown, plain text, WhatsApp exports, and Telegram JSON. Every imported
item receives a stable source fingerprint, so rerunning the same import reports it as a duplicate
instead of creating another memory. Use `--format` to override detection, `--sensitivity` to change
the default, and `--tags` to attach comma-separated labels.

## Capture a project folder

Keep project context current without repeatedly importing files by hand:

```bash
# Preview what the connector would capture
openself capture project ./my-project --dry-run

# Scan once, then search the derived project scope
openself capture project ./my-project
openself memory search --query "current architecture" --scope project/my-project

# Poll for edits and deletions until Ctrl+C
openself capture project ./my-project --watch --interval 5
```

The connector incrementally versions changed files and soft-forgets memories whose files were
deleted, so stale source text stops appearing in retrieval. It captures common text, documentation,
configuration, and source-code extensions. Dependency/build directories, symlinks, oversized or
binary files, `.env` files, and common credential/private-key filenames are excluded by default.
Use `--extensions` and `--ignore` to narrow the source set further. Connector state contains hashes
and memory IDs, not a second copy of file content, and stays under the OpenSelf data directory.

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

OpenSelf provides five tools:

| Tool | Purpose |
|---|---|
| `openself_remember` | Store typed context with provenance and permissions |
| `openself_search_memory` | Search active memories with scope/time/sensitivity filters |
| `openself_find_conflicts` | Surface similar current facts/preferences/decisions before writing |
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
`note`. SQLite is the source of truth. Unicode FTS5 results and deterministic 256-dimensional local
feature vectors are combined with reciprocal-rank fusion. The storage API remains model-independent.

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
Files / project capture / chat exports / manual notes / agents
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

The authenticated localhost dashboard is a third interface over the same `ContextStore`; it does
not maintain a separate copy of memory.

The original personality pipeline, RAG index, and messaging gateways remain separate from Context
Vault so existing users are not forced into a migration.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
npm run test:coverage
npm run benchmark:context -- --count=1000
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
