# MCP Context receipt card

The experimental Context receipt card renders the result of `openself_compile_context`
inside a compatible MCP Apps host. It is a real protocol resource, not a simulated compiler:
the tool still returns its existing text and structured context package unchanged.

## Availability and fallback

The server offers the card only when **both** conditions hold:

- The connection's server-side access policy has exactly the `read` capability (duplicates
  of `read` do not add authority). Any write/proposal capability disables the card.
- The client advertises `capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes`
  containing `text/html;profile=mcp-app`.

Default trusted-local connections have write capabilities and therefore remain text-only.
Unsupported clients also retain the existing text/structured output. No existing client
configuration or permission is changed automatically. Use the existing scoped MCP policy
configuration when deliberately setting up a read-only connection; this feature does not
create credentials or broaden scopes.

The tool links `ui://openself/context-receipt/v1`. The resource is a static, packaged HTML/CSS/JS
bundle, identical for every vault. Context arrives through the host's tool-result notification,
not through an admin endpoint or an embedded vault snapshot.

## What the card shows

- Selected memory count, actual character use, effective limit and clearly estimated tokens.
- Selected memory scope, trust, sensitivity and temporal information; source attribution
  remains available in the expandable compiled context.
- Expandable compiled context and selection/skip explanations already present in the tool result.
- Context hash and whether a signature is present. Presence is **not** signature verification.

The renderer accepts at most a 1 MiB UTF-8 protocol envelope, 200,000 context characters
and 500 records. The envelope includes duplicated MCP text and structured output, so very
large or Unicode-heavy results may exceed this limit even within the compiler character
budget. The original text tool result remains available in the host.

Token estimates are not provider billing measurements. The card does not display owner-only
denied-memory diagnostics, request additional context, call tools, submit prompts, write memories,
start Codex, authenticate, or invoke a model. Source strings are inert text, not clickable links.

## Security boundary

Tool visibility metadata and iframe CSP are defense in depth, **not authorization**. A host may
forward app-originated `tools/call` requests over the same MCP connection. The MCP request does
not provide an authenticated app-versus-model identity, so trusting a claimed origin would be
unsafe. OpenSelf instead requires the connection itself to be read-only; existing backend
policy checks reject remember, forget and proposal writes even with forged origin metadata.
Other reads remain bounded by that connection's existing scope/sensitivity policy.

The bundled renderer emits only UI initialization, sizing, ping responses and teardown protocol messages. It
accepts messages only from its parent frame, validates bounded JSON payloads, uses inert DOM
text, and clears stale content on cancellation/error/teardown. It requests no host permissions.
The resource declares empty connection/resource/frame domain lists and an inline hash-based
CSP with no external network, frames, forms, workers or plugins. Hosts still own their sandbox
and capability enforcement; OpenSelf does not claim to secure an arbitrary malicious host.

## Verification and compatibility

Tests exercise the installed MCP SDK with in-memory transports, exact capability negotiation,
text fallback, output equivalence, static resource privacy and backend mutation denial. A
synthetic host harness exercises the protocol and layout in Chromium, including an opaque
sandboxed iframe, adversarial payloads and mobile layout. This is **not** a claim that any
particular production host has been manually verified. Host support must be checked separately.

The implementation keeps the existing MCP SDK dependency. It implements a narrow read-only
subset of the MCP Apps `2026-01-26` UI protocol rather than adding a host-specific SDK or a live
provider integration.

Official references:

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Official host bridge implementation](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/app-bridge.ts)
