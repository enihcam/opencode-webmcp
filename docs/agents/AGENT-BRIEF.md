# Agent Brief — opencode-webmcp

## Project Overview

Single-file MCP server bridging MCP clients (OpenCode, Claude Code) to Chromium's WebMCP API.
Connects via Puppeteer + CDP, discovers tools registered via `document.modelContext` on the page,
and exposes them as MCP tools.

**Entry point**: `server.js` (ESM, Node 18+, ~400 lines)
**Deps**: `@modelcontextprotocol/sdk` + `puppeteer-core`
**No build step** — edit `server.js`, restart to apply changes.

## Architecture

- **Bridge-native tools** (always available):
  - `webmcp_navigate` — navigate to a URL
  - `webmcp_status` — get page/tool status
  - `webmcp_evaluate` — run JS in page context
  - `webmcp_invoke_tool` — call a registered WebMCP tool
  - `webmcp_register_test_tools` — register test helpers
- **Page-discovered WebMCP tools** — served alongside bridge tools
- **Monkey-patch** via `evaluateOnNewDocument`: Chrome 150+ has a bug where
  `page.webmcp.invokeTool()` returns `{}`. The bridge intercepts
  `document.modelContext.registerTool` to capture each tool's `execute` function,
  then replaces `executeTool` to call captured functions directly.
- **Auto-recovery**: detached-frame errors re-create the page automatically.

## Key Implementation Details

- Chrome requirement: 150+ with `--enable-features=WebMCPTesting,DevToolsWebMCPSupport`
- `puppeteer-core` — no bundled browser; must have system Chrome/Chromium
- `CHROME_PATH`, `WEBMCP_TARGET_URL`, `WEBMCP_HEADLESS` env vars
- `--no-sandbox` always set; `--ozone-platform=wayland` added when not headless

## Testing

```bash
node --check server.js      # syntax check
node test/unit.mjs          # 36 unit tests
```

## Useful Links

- [WebMCP API](https://chromium.googlesource.com/chromium/src/+/main/docs/webmcp.md)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk)
