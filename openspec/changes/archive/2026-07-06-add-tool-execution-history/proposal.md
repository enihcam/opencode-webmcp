## Why

The webmcp-bridge currently provides no visibility into past tool invocations. When an MCP client invokes `webmcp_invoke_tool("add_to_cart", { id: 42 })` and the cart doesn't update, or a tool returns malformed output, the client has no audit trail to debug from. There's no way to see what was called, when, with what arguments, or how long it took.

A persistent execution history unlocks debugging, post-mortem analysis, and gives the MCP client context about its own behavior. Other MCP servers (e.g., filesystem MCP, GitHub MCP) commonly expose `*_log` or audit-trail tools for the same reason.

## What Changes

- The bridge SHALL record every tool invocation (bridge-native and page-discovered) to an in-memory ring buffer.
- Each history entry captures: timestamp, tool name, arguments, result summary (success/failure), duration in ms, and any error message.
- Add a new bridge-native tool `webmcp_history` that returns recent history entries (default last 50, max 1000, with optional filter by tool name).
- Add a new bridge-native tool `webmcp_clear_history` that empties the ring buffer.
- Optionally write each entry as a single line of JSON to stderr for offline analysis (controlled by a `WEBMCP_LOG_HISTORY` env var, default false).

## Capabilities

### New Capabilities
- `bridge-native-tools`: Will gain `webmcp_history` and `webmcp_clear_history`.
- `execution-history`: Persistent record of tool invocations for debugging and observability.

### Modified Capabilities
<!-- None. Existing capabilities unchanged. -->

## Impact

- **Code**: `server.js` — add a `history` array, a `recordHistory()` helper, and two new entries in `BRIDGE_TOOLS`. Wrap the existing tool-call dispatch in the handler to record each call. ~50 lines.
- **APIs**: Two new MCP tools (`webmcp_history`, `webmcp_clear_history`).
- **Dependencies**: None.
- **Performance**: Recording to an in-memory array is O(1). Memory is bounded by the ring-buffer cap (default 50, max 1000). Each entry is small (~200 bytes typical), so worst-case ~200 KB.
- **Backwards compatibility**: Fully additive. Existing tools unchanged.