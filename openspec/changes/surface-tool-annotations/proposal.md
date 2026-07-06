## Why

The MCP protocol supports tool annotations: `title` (human-readable display name), `readOnlyHint` (does not modify state), `destructiveHint` (modifies state in an irreversible way), `idempotentHint` (safe to retry), and `openWorldHint` (interacts with external systems). MCP clients use these to render UIs differently, gate destructive actions behind confirmation, and avoid asking permission for read-only tools.

The webmcp-bridge already defines a `webmcp_register_test_tools` MCP tool that uses the SDK's annotation support (sets `readOnlyHint: true`). However, annotations set by **page-discovered** tools are silently dropped — the bridge registers those tools without forwarding the page's annotations to the MCP client.

This means MCP clients see all page-discovered tools as "no annotations known," losing useful safety signals.

## What Changes

- When registering a page-discovered tool, the bridge SHALL forward any annotations the tool set via `registerTool()`.
- Specifically: if a page calls `document.modelContext.registerTool(name, { description, inputSchema, annotations: { readOnlyHint, ... } })`, the bridge SHALL pass those annotations to `McpServer.tool()`.
- The bridge SHALL set sensible default annotations for bridge-native tools: `webmcp_navigate` is destructive; `webmcp_evaluate` is open-world; `webmcp_status` is read-only; etc.

## Capabilities

### New Capabilities
<!-- None — annotations extend existing capabilities. -->

### Modified Capabilities
- `bridge-native-tools`: Existing tools gain explicit annotation hints.
- `page-discovered-tools`: Page-discovered tools forward their annotations to MCP clients.

## Impact

- **Code**: `server.js` — extract annotation values from page-discovered tool descriptors and pass to `McpServer.tool()`. Add an `annotations` field to each `BRIDGE_TOOLS` entry. ~30-50 lines.
- **APIs**: No new tools. Existing tool descriptors gain `annotations` (per MCP spec).
- **Compatibility**: Fully backward compatible. Clients that ignore annotations see no behavior change. Clients that respect annotations get richer signals.