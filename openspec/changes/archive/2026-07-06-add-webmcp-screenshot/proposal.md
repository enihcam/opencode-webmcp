## Why

When OpenCode navigates a browser via the webmcp-bridge, it can call structured WebMCP tools on a page, but it has no way to **see** what's happening on the page. After invoking a tool that mutates the UI (e.g., `apply_filters`, `select_flight`, `add_to_cart`), the MCP client must either trust the tool's structured response or re-run `webmcp_evaluate` to inspect DOM state. Both are error-prone and miss visual context (rendering errors, layout shifts, async-loaded content).

A `webmcp_screenshot` bridge-native tool lets the MCP client request a PNG screenshot of the current page state, returned as base64. This is the same capability that `chrome-devtools-mcp` exposes; the webmcp-bridge should provide parity.

## What Changes

- Add a new bridge-native MCP tool `webmcp_screenshot` that returns the current page's screenshot as base64-encoded PNG.
- Tool input schema accepts optional `format` ("png" | "jpeg", default "png") and optional `quality` (1-100, jpeg only).
- Tool input schema accepts optional `fullPage` (boolean, default false) and optional `clip` (region as `{x, y, width, height}`).
- Implementation wraps Puppeteer's `page.screenshot()` with sensible defaults for MCP traffic: 1280×720 viewport, PNG compression, base64 encoding.
- Update README.md to document the new tool.

## Capabilities

### New Capabilities
- `bridge-native-tools`: MCP tools provided by the bridge itself, independent of any WebMCP page. Currently houses `webmcp_navigate`, `webmcp_status`, `webmcp_evaluate`, `webmcp_invoke_tool`, `webmcp_register_test_tools`. Will gain `webmcp_screenshot`.

### Modified Capabilities
<!-- No existing spec changes. This is a purely additive change. -->

## Impact

- **Code**: `server.js` — add one entry to `BRIDGE_TOOLS` array and one handler that calls `page.screenshot()` and base64-encodes the result. ~30 lines of code.
- **APIs**: New MCP tool surface area. Adds one tool to the always-available toolset.
- **Dependencies**: None — Puppeteer already exposes `page.screenshot()`.
- **Backwards compatibility**: Fully additive. No existing tools or interfaces change. Existing MCP clients will see one additional tool in the tool list.