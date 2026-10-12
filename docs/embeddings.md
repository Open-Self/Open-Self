# Embedding providers

OpenSelf's semantic retrieval is provider-pluggable. The default is a
deterministic, fully-offline feature-hash encoder — it needs no network, model
download, or API key, and it is what CI, evals, and fresh installs use. Real
embedding models are opt-in.

| Provider            | Leaves the machine? | Config                                                  |
| ------------------- | ------------------- | ------------------------------------------------------- |
| `feature-hash`      | never               | default — nothing to configure                          |
| `ollama`            | localhost only      | `OPENSELF_OLLAMA_URL`, `OPENSELF_EMBEDDINGS_MODEL`       |
| `openai-compatible` | yes — opt-in        | `OPENSELF_EMBEDDINGS_BASE_URL`, `_MODEL`, `_API_KEY`      |

Selection order: explicit `--embeddings` flag / `embeddings` option >
`OPENSELF_EMBEDDINGS` env > `feature-hash`.

## feature-hash (default)

A local feature-hashing encoder (`src/context/vectors.js`): word features,
concept aliases, bigrams, and character trigrams hashed into a fixed
256-dimensional space. Deterministic across machines, which is what makes
portable exports and reproducible evals possible.

## ollama

Embeds through a local [Ollama](https://ollama.com) server — local-first, no
data leaves the machine:

```bash
ollama pull nomic-embed-text
export OPENSELF_EMBEDDINGS=ollama
export OPENSELF_EMBEDDINGS_MODEL=nomic-embed-text   # default
export OPENSELF_OLLAMA_URL=http://127.0.0.1:11434   # default
openself memory index                              # backfill existing memories
openself mcp                                        # agents use it automatically
```

## openai-compatible

Talks to any `/v1/embeddings`-compatible endpoint (OpenAI, Azure OpenAI,
LiteLLM, vLLM, LM Studio, …):

```bash
export OPENSELF_EMBEDDINGS=openai-compatible
export OPENSELF_EMBEDDINGS_BASE_URL=https://api.openai.com/v1
export OPENSELF_EMBEDDINGS_MODEL=text-embedding-3-small
export OPENSELF_EMBEDDINGS_API_KEY=...   # falls back to OPENAI_API_KEY
```

This is the only provider that can send memory content off the machine. It is
strictly opt-in and is never enabled implicitly. `restricted` memories are not
exempt — if you use a remote provider, choose your scopes and sensitivity
labels accordingly.

## How async providers work

Async providers (`ollama`, `openai-compatible`) never block synchronous write
paths:

- `remember`, `update`, imports, and MCP mutations store the memory
  immediately and mark its vector *pending*.
- `store.indexPending()` batch-encodes pending vectors. The MCP server calls
  it automatically after each mutation; the CLI equivalent is
  `openself memory index`.
- Query paths (`searchAsync`, `buildContextAsync`,
  `findPotentialConflictsAsync`) await the provider for the query embedding.
  Synchronous `search()` skips the vector leg entirely for async providers
  rather than blocking or returning silently-wrong results — use the async
  APIs (or the MCP/CLI surfaces, which do this for you) for semantic retrieval.
- `openself memory stats` reports `vectorProvider`, `vectorModel`,
  `indexed`/`pendingVectors` counts.

Switching providers or models triggers re-indexing automatically: vectors are
recorded per-model, so `indexPending()` picks up everything stored under the
old model.

## Custom providers (API)

```js
const store = new ContextStore({
    dataDir: './data',
    embeddings: {
        name: 'my-provider',
        model: 'my-model-v1',          // recorded per-vector; changing it re-indexes
        encode: async (text) => [...], // and/or encodeSync(text) for sync providers
        batchEncode: async (texts) => [...], // optional, used by indexPending
    },
});
```

Providers with `encodeSync` behave exactly like the built-in feature-hash:
eager, synchronous indexing with no pending state.
