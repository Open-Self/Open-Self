# Workspace rehearsal (simulation only)

This prototype exercises approval and cancellation UX before a live agent transport is enabled.
It is not a coding agent, chatbot, research engine, or live Codex integration. The existing
Codex connection controls remain separate and cannot unlock live execution here.

## What happens

1. Enter a task and optionally narrow memory scope and character budget.
2. The existing lexical context compiler creates an exact local preview and receipt under
   the default local policy. Owner-only denied diagnostics are not included.
3. A separate consent dialog binds the start to the preview ID and context hash. Changed
   vault data invalidates the preview instead of silently sending different context.
4. A hard-coded local mock emits visibly synthetic transport messages. No model, shell,
   network tool, or app-server process is invoked.
5. Cancel stops the simulation. Late events cannot resurrect a terminal run.
6. A mock proposal can be approved/rejected in memory only. Neither action creates a vault
   memory or real Inbox proposal. Refreshing/restarting does not persist these mock runs.

The task and selected memory text remain within the authenticated local app and its memory.
A normal browser request still reaches the local server. “No external request” means no
provider/model/tool request, not absence of local HTTP traffic.

## Live transport is intentionally unavailable

A read-only sandbox is not a selected-context-only isolation boundary: it can still execute
commands and read files. Approval policy `never` does not disable tools. Installed generated
Codex protocol v0.163.0 also states that `disabledPluginIds` does not yet filter capabilities.
We therefore do not rely on those settings to claim tool-less inference or token isolation.

Before a live adapter is considered, it needs version-pinned capability enforcement, separate
credential/process isolation, explicit context-disclosure and spend consent, safe server-request
handling, bounded streams, verified cancellation, and adversarial tests. An isolated home or
working directory is not by itself a security boundary. Simulated success proves only the
local control-flow behavior, not a real authentication, model result or completed task.

Official references:
- [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [App-server lifecycle](https://learn.chatgpt.com/docs/app-server)
- [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
