# MCP Registry and container distribution

OpenSelf is published to the official
[MCP Registry](https://registry.modelcontextprotocol.io) as
`io.github.Open-Self/openself`, so registry-aware clients can discover and
install it without a hand-written command line.

## Registry metadata

[`server.json`](../server.json) declares both install paths:

- **npm** — `npx -y openself mcp` (stdio transport)
- **OCI** — `ghcr.io/open-self/openself` (stdio; `--http` for the streamable
  HTTP transport)

`package.json` carries the matching `mcpName` field, which the registry CLI
verifies against the published npm package.

## Publishing a new version

1. Bump `version` in `package.json` **and** `server.json` (keep them equal —
   the registry rejects mismatches).
2. Publish to npm (`npm publish` — the release workflow handles provenance).
3. Publish to the MCP Registry with the official CLI:

   ```bash
   npm install -g @modelcontextprotocol/mcp-publisher   # or: mcp-publisher
   mcp-publisher login github                           # io.github.* namespace
   mcp-publisher publish                                # reads ./server.json
   ```

   GitHub auth is sufficient for the `io.github.Open-Self/*` namespace — the
   publisher proves repository ownership through your GitHub login.

4. The `docker` workflow builds and pushes `ghcr.io/open-self/openself` on
   every `v*` tag and `main` push; verify the new tag appears under
   [packages](https://github.com/Open-Self/Open-Self/pkgs/container/openself).

## Running the container

```bash
# stdio MCP server (what most clients launch)
docker run -i --rm -v openself-data:/data ghcr.io/open-self/openself

# HTTP transport for shared setups
docker run -p 3211:3211 -v openself-data:/data \
    ghcr.io/open-self/openself mcp --http --token "$TOKEN"

# dashboard
docker run -p 3210:3210 -v openself-data:/data \
    ghcr.io/open-self/openself dashboard
```

The vault lives in the `/data` volume; the container runs unprivileged as the
`node` user. No outbound network access is needed unless you opt into a remote
embedding provider.
