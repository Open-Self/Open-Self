# OpenSelf

[![npm version](https://img.shields.io/npm/v/openself?color=blue)](https://www.npmjs.com/package/openself)
[![CI](https://github.com/Open-Self/Open-Self/actions/workflows/ci.yml/badge.svg)](https://github.com/Open-Self/Open-Self/actions)
[![CodeQL](https://github.com/Open-Self/Open-Self/actions/workflows/codeql.yml/badge.svg)](https://github.com/Open-Self/Open-Self/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Open-Self/Open-Self/badge)](https://scorecard.dev/viewer/?uri=github.com/Open-Self/Open-Self)
[![codecov](https://codecov.io/gh/Open-Self/Open-Self/graph/badge.svg)](https://codecov.io/gh/Open-Self/Open-Self)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.Open--Self%2Fopenself-purple)](./server.json)
[![Docker](https://img.shields.io/badge/ghcr.io-open--self%2Fopenself-blue?logo=docker)](https://github.com/Open-Self/Open-Self/pkgs/container/openself)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

### Your context. Your memory. Your rules.

OpenSelf is the user-owned context layer for AI agents — one private context layer for
Claude, Codex, ChatGPT, Cursor, local agents, and whatever comes next. It stores decisions,
preferences, commitments, relationships, events, and facts with their source, time, scope,
confidence, sensitivity, and trust — then exposes only the relevant context through MCP,
an authenticated dashboard, or its JavaScript API.

Open source. Local-first. Bring your own model. Agents propose memories; you approve them.
Your existing OpenSelf personality and messaging tools continue to work.

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
- **Trust-aware:** every memory carries a source trust level (`untrusted` → `owner`), so
  imported files and agent proposals can be filtered out of retrieval until you trust them.
- **Owner-approved writes:** agents can only *propose* memories; nothing enters the vault
  without your approval in the inbox.
- **Explainable retrieval:** every context build can return a receipt showing which
  memories were selected or skipped and why — with a `contextHash` over the exact
  block an agent received and a `contentHash` for each cited memory.
- **Cryptographic provenance:** each vault holds an Ed25519 identity; receipts sign
  `contextHash` and exports sign their record payload, so consumers can verify
  integrity and origin offline. Tampered signed exports are refused on import.
- **Tamper-evident audit:** MCP access events are hash-chained; `openself audit verify`
  detects modified or deleted history, and `openself audit export` produces a JSONL
  trail for archival.
- **Recoverable forgetting:** forgotten memories disappear from retrieval without destroying the audit trail.
- **Pluggable embeddings:** the default feature-hash encoder is fully offline and
  deterministic; Ollama and OpenAI-compatible providers are opt-in via one flag.
- **Hybrid retrieval:** FTS5 and vectors are fused with reciprocal-rank fusion.
- **Conflict-aware:** similar active facts, preferences, and decisions are surfaced before storage.
- **Portable:** export the vault to the versioned [context exchange format](./spec/context-exchange-format.md)
  (JSONL + JSON Schema) and import it elsewhere — content-hash dedupe makes re-imports idempotent.
- **Agent-native:** MCP tools, resources, and prompts work with compatible AI clients over
  stdio or an authenticated HTTP transport; the core is also a normal Node.js library.
- **Local-first:** SQLite and FTS5 run on your machine with no account or server required.

## Quick start

Requires Node.js 22.13 or newer. Node.js 24 is also tested.

OpenSelf stable 1.x is available on npm under the default `latest` tag.
See [GitHub Releases](https://github.com/Open-Self/Open-Self/releases) for version history.

```bash
npm install -g openself
openself --version

# Initialize a vault (optionally encrypted) in one step
openself init --data-dir ~/.openself
openself doctor --data-dir ~/.openself   # sanity-check vault, key, schema

# Store a durable decision
openself memory add \
  --type decision \
  --scope project/openself \
  --content "Use SQLite as the local source of truth" \
  --source docs/architecture.md \
  --tags architecture,database

# Recall it later
openself memory search --query "Which database did we choose?" --scope project/openself

# Preview the exact context block an agent would receive, with a receipt
openself context "Which database did we choose?" --scope project/openself --explain

# Check a possible preference change before storing it
openself memory conflicts \
  --type preference \
  --scope personal/work \
  --content "My preferred code editor is Zed"

# Inspect the vault
openself memory stats
```

See the whole agent workflow end-to-end — proposals, approvals, scoped reads, denials,
and the access audit — in one offline command:

```bash
openself demo --data-dir ./demo-data
```

From this repository, replace `openself` with `node src/cli/index.js`.
See [release verification](./docs/release-readiness.md) for CI, audit and distribution evidence.
The [upgrade guide](./docs/upgrade-guide.md) covers existing vaults. Stable 1.x preserves the
[documented public contracts](./docs/api-reference.md).

For library use, run `npm install openself`. To pin this release, use `openself@1.1.0`.
The `next` channel remains separate and currently points to the older `1.0.0-rc.2` candidate;
use the default stable channel for normal installation.

For a direct download, use [openself-1.0.0.tgz](https://github.com/Open-Self/Open-Self/releases/download/v1.0.0/openself-1.0.0.tgz)
and verify SHA-256 `24d264272590167f333614d9cad264f209e2c86bde476f9087dffcf6af0366a6`.
The GitHub and npm tarballs were downloaded independently and have the same digest.

Or run the published container — the vault lives in a mounted volume:

```bash
docker run -i --rm -v openself-data:/data ghcr.io/open-self/openself mcp
docker run -p 3211:3211 -v openself-data:/data ghcr.io/open-self/openself mcp --http
```

OpenSelf is also listed on the MCP Registry as `io.github.Open-Self/openself`
(see [`server.json`](./server.json)), so registry-aware clients can discover it
directly.

## Local dashboard

Launch the Context Vault dashboard:

```bash
openself dashboard
openself dashboard --port 3210 --data-dir /absolute/path/to/openself-data
```

The CLI prints a tokenized bootstrap URL. The dashboard binds only to `127.0.0.1`, exchanges that
token for an HttpOnly/SameSite session cookie, and protects mutations from cross-origin requests.
It supports hybrid search, create/edit/forget, conflict review, duplicate merge, provenance fields,
and version history, plus three agent-facing views:

- **Context Debugger** — run a query as an agent would and inspect the explain receipt:
  which candidates matched, their lexical/vector ranks, trust, and why each was selected
  or skipped.
- **Inbox** — review memories proposed by agents; approve (optionally promoting trust to
  `verified`) or reject with a note.
- **Audit** — which MCP client called which tool and whether policy allowed it.

It is a local administration surface—not a public multi-user service.

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

# Poll local exports from other high-signal sources
openself capture calendar ./calendar.ics --watch
openself capture email ./mail-export --watch
openself capture browser ./Bookmarks --watch --limit 500
```

The connector incrementally versions changed files and soft-forgets memories whose files were
deleted, so stale source text stops appearing in retrieval. It captures common text, documentation,
configuration, and source-code extensions. Dependency/build directories, symlinks, oversized or
binary files, `.env` files, and common credential/private-key filenames are excluded by default.
Use `--extensions` and `--ignore` to narrow the source set further. Connector state contains hashes
and memory IDs, not a second copy of file content, and stays under the OpenSelf data directory.

Calendar capture reads ICS events. Email capture reads EML, MBOX/MBX, or directories containing
those exports. Browser capture reads Netscape bookmark HTML, Chromium-style JSON, and Chromium or
Firefox history SQLite files. Browser URLs are reduced to HTTP(S) origin and path: credentials,
queries, and fragments are discarded before storage. These are local-export connectors; OpenSelf
does not request account OAuth tokens or contact cloud services.

## Encrypt the Context Vault

Enable payload encryption for a data directory once:

```bash
openself vault init --data-dir /absolute/path/to/openself-data
openself vault status --data-dir /absolute/path/to/openself-data
```

Existing plaintext payloads are migrated transactionally. New and existing content, summaries,
source details, tags, local vectors, and version snapshots use AES-256-GCM. Lexical retrieval uses
an HMAC blind index, so search terms are not stored in plaintext. The random key is protected by
Windows DPAPI, macOS Keychain, or Linux Secret Service and is never written into `vault.json`.

Scope, type, sensitivity, timestamps, status, record IDs, and access-frequency patterns remain
visible as operational SQLite metadata. This is payload encryption, not SQLCipher/full-database
encryption. Back up the vault while signed into the same OS account; losing the OS-bound key makes
encrypted payloads unrecoverable. Headless deployments can explicitly supply a 32-byte base64 or
hex key through `OPENSELF_VAULT_KEY` and assume responsibility for secret management.

## Portable backup and recovery

```bash
openself vault backup --data-dir ./data --file ./context.osbackup
openself vault restore --file ./context.osbackup --data-dir ./recovered-data
```

A confirmed passphrase encrypts the entire snapshot, including the payload key, version
history, and import ledger. Restore validates the archive and creates an encrypted vault
bound to the destination OS account. Existing destinations are refused. See the
[backup and recovery guide](./docs/backup-recovery.md) for key recovery, automation,
256 MiB archive limit, and the distinction from a whole application-directory backup.

## Run Context Vault evaluations

```bash
npm run eval:context
```

The checked-in, deterministic suite measures Recall@K, mean reciprocal rank, temporal correctness,
sensitivity leakage, and provenance completeness. It exits non-zero when a versioned threshold is
missed, making retrieval and privacy regressions suitable for CI gating.

## Connect an AI client with MCP

Generate a ready-to-paste client configuration:

```bash
openself connect claude --data-dir ~/.openself            # writes ~/.claude.json
openself connect cursor --policy ./policy.json --client atlas-reader
openself connect codex                                    # ~/.codex/config.toml
openself connect generic --transport http --token "$TOKEN"  # prints a config block
```

Supported targets include Claude Code, Cursor, VS Code, Windsurf, OpenAI Codex, and a
generic MCP entry. Writing merges into the client's existing config file (with a
timestamped backup), `--project` targets project-level config where supported,
`--remove` uninstalls, and `--dry-run` previews.

Or run the stdio server directly:

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

For per-agent scope, sensitivity, trust ceilings, and read/write/propose permissions, launch
with `--policy /protected/mcp-policy.json --client atlas-reader`. Policy is fixed by the
owner at startup; agent tool arguments cannot expand it.
[Agent permissions and audit](./docs/agent-permissions.md) covers configuration,
trust boundaries, and the audit CLI.

### Tamper-evident access audit

Every MCP tool call is recorded in a hash-chained audit log (`mcp-audit.db`). Each
completed event's hash commits to the previous event, so edits to historical rows —
or deleting them — are detectable:

```bash
openself audit list                 # recent events + chain status
openself audit verify               # exits non-zero if the chain was tampered
openself audit export --file audit.jsonl   # JSONL trail for archival/anchoring
openself audit prune --retention-days 90   # anchored retention (chain stays verifiable)
```

Interrupted attempts appear as `pending` rather than tampering; retention pruning
anchors the surviving suffix so the chain stays verifiable. The dashboard's Audit
view shows the same chain status.

### Pluggable embeddings

Semantic retrieval works out of the box with a deterministic, fully-offline
feature-hash encoder — no model download, no network. To use a real embedding
model instead:

```bash
# Local LLM embeddings through Ollama (still local-first)
openself memory add --embeddings ollama --content "..."
OPENSELF_EMBEDDINGS=ollama OPENSELF_EMBEDDINGS_MODEL=nomic-embed-text openself mcp

# Any OpenAI-compatible /v1/embeddings endpoint (the only provider that can
# leave the machine — strictly opt-in)
OPENSELF_EMBEDDINGS=openai-compatible \
OPENSELF_EMBEDDINGS_BASE_URL=https://api.openai.com/v1 \
OPENSELF_EMBEDDINGS_API_KEY=... openself mcp
```

Async providers never block synchronous writes: memories are stored immediately
and their vectors are drained by `openself memory index` (or automatically after
each MCP mutation). `openself memory stats` reports the provider, model, and
pending count. See [docs/embeddings.md](./docs/embeddings.md).

To expose the vault over HTTP instead of stdio (e.g. for a shared workstation setup):

```bash
openself mcp --http --port 3211                      # localhost, prints a bearer token
openself mcp --http --host 0.0.0.0 --allow-remote --token "$TOKEN"
```

The HTTP transport binds `127.0.0.1` by default, requires bearer authentication, validates
Host/Origin headers against DNS-rebinding and browser cross-origin access, and refuses
non-localhost binds without `--allow-remote` and an explicit token.

### MCP tools, resources, and prompts

| Tool | Purpose |
|---|---|
| `openself_search_memory` | Search active memories with scope/time/sensitivity/trust filters |
| `openself_get_context` | Build a bounded, source-attributed context block; `explain` adds a selection receipt |
| `openself_remember` | Store typed context with provenance and permissions |
| `openself_propose_memory` | Propose a memory for owner review; lands in the inbox, not the vault |
| `openself_list_memory_proposals` | List pending/recent proposals and their review state |
| `openself_find_conflicts` | Surface similar current facts/preferences/decisions before writing |
| `openself_forget` | Soft-delete a memory and remove it from future retrieval |

All tools return structured output alongside the text block. The server also exposes
`openself://recent` and `openself://memory/{id}` resources and a `prepare_task_context`
prompt that renders a scoped context block for a task description.

## Review agent proposals

Agents with only the `propose` capability cannot write directly — proposals wait for you:

```bash
openself inbox                                    # list pending proposals
openself inbox approve --id <id> --note ok        # approve, optionally overriding fields
openself inbox reject --id <id> --note "no"       # reject with a note
```

The same queue appears in the dashboard's Inbox tab.

## Portable export and import

Export the vault to a versioned JSONL interchange format and re-import it elsewhere:

```bash
openself memory export --file ./context.openself.jsonl
openself memory export --file ./project.jsonl --scope project/atlas --max-sensitivity personal
openself memory export --file ./clean.jsonl --redact      # strip secret-shaped strings
openself memory export --file ./unsigned.jsonl --no-sign  # opt out of signing
openself memory import --file ./context.openself.jsonl
```

The export preserves provenance, scope, sensitivity, trust, temporal bounds, and tags.
Restricted memories are excluded unless you pass `--include-restricted`. Imported records
are clamped to `external` source trust — a file cannot claim owner-level trust. Exports
are Ed25519-signed by the vault identity (`signer`/`signature`/`exportHash` in the header);
importers verify the signature and refuse tampered files. Exports are also scanned for
credential-shaped strings — findings are reported and `--redact` strips them. This is a
plaintext interoperability format, not an encrypted backup; use `openself vault backup`
for protection at rest.

Memories whose `validTo` has lapsed can be forgotten in one pass:

```bash
openself memory sweep --dry-run   # preview expired memories
openself memory sweep             # forget them
```

## Install the Agent Skill

OpenSelf ships an [Agent Skills](https://agentskills.io)-compatible skill that teaches
compatible agents how to use the vault — propose memories, respect scope and sensitivity,
and read explain receipts:

```bash
openself skill path        # print the bundled skill directory
openself skill validate    # check the SKILL.md contract
openself skill install --project   # copy into ./.agents/skills/openself-context
openself skill install             # or ~/.agents/skills for all projects
```

## Memory model

```json
{
  "type": "decision",
  "content": "Do not use Firebase for Project Atlas",
  "scope": "project/atlas",
  "sensitivity": "private",
  "sourceTrust": "owner",
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
`note`. Source trust climbs `untrusted` → `external` → `trusted` → `verified` → `owner`; owner
records default to `owner`, agent proposals and imports to `external`. SQLite is the source of
truth. Unicode FTS5 results and deterministic 256-dimensional local feature vectors are combined
with reciprocal-rank fusion. The storage API remains model-independent.

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

TypeScript declarations cover every root export. See the [API reference](./docs/api-reference.md),
[support policy](./docs/support-policy.md), and [upgrade guide](./docs/upgrade-guide.md).

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
- Optional Vault encryption protects memory payloads at rest; filter metadata remains visible.
- The MCP server itself makes no model API calls.
- Ollama can keep generation local.
- If you configure OpenAI, Anthropic, DeepSeek, or another cloud model, the context supplied to that
  model leaves your machine under that provider's terms.
- `restricted` memories require an explicit owner policy grant; a tool request cannot raise the
  configured sensitivity ceiling.
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
npm run test:types
npm run test:package
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
