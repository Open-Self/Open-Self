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

Requires Node.js 22.13 or newer. Node.js 24 is also tested.

As checked on 2026-09-09, npm `latest` is v0.7.0 and does not contain the Context Vault
commands below. The verified Context Vault build without a prerelease suffix is
[v0.13.2 on GitHub](https://github.com/Open-Self/Open-Self/releases/tag/v0.13.2).
Download its [openself-0.13.2.tgz](https://github.com/Open-Self/Open-Self/releases/download/v0.13.2/openself-0.13.2.tgz)
asset and verify SHA-256 `10594cb80bcf19d12f747837b4efcf7ed12137fd2946df8812090a2d0e7627c2`,
then install the downloaded file:

```bash
npm install -g ./openself-0.13.2.tgz
openself --version

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
See [release readiness](./docs/release-readiness.md) for publication status and remaining
v1.0 gates. The [upgrade guide](./docs/upgrade-guide.md) covers existing vaults.

### Try the v1.0 release candidate

[v1.0.0-rc.2](https://github.com/Open-Self/Open-Self/releases/tag/v1.0.0-rc.2) is an opt-in
prerelease with the same public API and schema 2 as v0.13.2. It fixes dashboard saves that
truncated timestamps and date clearing that retained old values. Its release gates passed all
six OS/Node combinations, including real OS key storage, plus Chromium date-edit regressions
in three timezones. Read the [candidate upgrade notes](./docs/upgrade-guide.md#from-v100-rc1-to-v100-rc2)
and test with a copied vault. Prefer this candidate for the dashboard timestamp correction.
Download [openself-1.0.0-rc.2.tgz](https://github.com/Open-Self/Open-Self/releases/download/v1.0.0-rc.2/openself-1.0.0-rc.2.tgz),
verify SHA-256 `b2c4bea0758360f08b966cb416d73e8b25995b9c6119eb43205b0ebdb77ed838`, then run:

```bash
npm install -g ./openself-1.0.0-rc.2.tgz
openself --version
```

Expect `1.0.0-rc.2`. This candidate is also published on npm with provenance via OIDC:

```bash
npm install -g openself@1.0.0-rc.2
# Or select the prerelease channel:
npm install -g openself@next
```

The registry tarball matches the GitHub artifact's SHA-256 above. npm `latest` remains
v0.7.0; use the explicit candidate version or `next` for Context Vault. This candidate does
not declare stable 1.0 support. See [release readiness](./docs/release-readiness.md) for the
current dependency audit and remaining stable-release gates.

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

For per-agent scope, sensitivity, and read/write permissions, launch with
`--policy /protected/mcp-policy.json --client atlas-reader`. Policy is fixed by the
owner at startup; agent tool arguments cannot expand it.
[Agent permissions and audit](./docs/agent-permissions.md) covers configuration,
trust boundaries, and `openself audit list/prune/clear`.

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
