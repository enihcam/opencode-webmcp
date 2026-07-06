## Context

The webmcp-bridge (`server.js`, ~400 lines, ESM) currently exposes 5 bridge-native tools but has no observability into what it actually does over time. Each tool call enters `setupToolHandlers()` → `McpServer.tool(name, schema, handler)`. The handler receives `(args, context)` where `context = { page, ... }`. Results are returned as `{ content: [{ type: "text", text: "..." }] }` (or `ImageContent` for images).

MCP servers commonly expose audit/log tools for the same reason other systems do: debugging, post-mortem, and client-side replay. Adding execution history is a purely additive capability that wraps each call to the existing handlers.

## Goals / Non-Goals

**Goals:**
- Record every tool invocation (bridge-native AND page-discovered) to an in-memory ring buffer.
- Capture: timestamp, tool name, arguments, result summary (success/failure), duration in ms, error message if any.
- Add `webmcp_history` tool that returns recent entries with optional filtering.
- Add `webmcp_clear_history` tool that empties the buffer.
- Optional stderr JSON-line logging controlled by `WEBMCP_LOG_HISTORY` env var.
- Bound memory: ring buffer capped (default 50, max 1000).

**Non-Goals:**
- Persistent storage (file/DB). History is per-process and lost on restart — that's a future change.
- Replay tools (re-running past invocations). History is read-only.
- Sampling/aggregation (p50/p95 latency). Could be a follow-up.
- Forwarding to an external observability system (Datadog, OTLP, etc.).

## Decisions

**Decision 1: In-memory ring buffer, not disk/DB.**

Zero setup, zero dependencies. History is scoped to the bridge process lifetime. The MCP client can capture entries via `webmcp_history` before the bridge exits if needed.

*Alternatives considered:*
- Append-only file (NDJSON): durable across restarts but adds I/O on every call, requires rotation, leaks path concerns.
- SQLite: overkill for a few hundred entries.

**Decision 2: Wrap dispatch, not handler functions.**

Record at the point of dispatch in `setupToolHandlers()` rather than wrapping each handler. This way, page-discovered tools (which are registered via `McpServer.tool()` too) get the same treatment for free, without modifying each handler.

**Decision 3: Cap the ring buffer at 1000.**

1000 entries × ~200 bytes ≈ 200 KB max. Sufficient for debugging typical sessions. Configurable via `WEBMCP_HISTORY_MAX` (env var) or `historyMax` (config file in a future change).

**Decision 4: Default `WEBMCP_LOG_HISTORY` to false.**

stderr logging is for offline analysis. Most MCP clients don't want bridge stderr mixed into their own logs. Off by default; opt-in via env var.

**Decision 5: Tool-call wrap is synchronous from the perspective of the MCP response.**

Recording happens AFTER the handler resolves. If the handler throws, we record the failure. We don't record before-the-fact. This avoids recording calls that never ran (e.g., schema-validation rejections, which are rejected before the handler is even called).

## Risks / Trade-offs

- **[Sensitive arguments in history]** → Tool arguments may contain credentials, PII, or tokens. History is unredacted. → Mitigation: document this in the tool description. A future change could add a redaction config.
- **[Memory growth]** → Long-running bridge + many tool calls = memory pressure. → Mitigation: ring buffer cap (1000).
- **[stderr pollution]** → If `WEBMCP_LOG_HISTORY=true` and the MCP client captures stderr, logs leak to the client. → Mitigation: opt-in only.
- **[Failure to record]** → If `recordHistory()` itself throws (e.g., out of memory), we shouldn't break the actual tool call. → Mitigation: wrap in try/catch and silently ignore.

## Migration Plan

Purely additive. No rollback needed beyond reverting the `BRIDGE_TOOLS` entries.

## Open Questions

- Should we record calls that fail JSON Schema validation (i.e., rejected before dispatch)? Currently **no** — those are MCP transport errors, not tool executions. Could be revisited.