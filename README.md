# opencode-webmcp

MCP bridge connecting OpenCode to Chromium's WebMCP API.

Exposes WebMCP tools registered in a Chromium page as MCP tools consumable by any MCP client (OpenCode, Claude Code, etc.).

## How It Works

```
OpenCode (MCP client)
    ↕  MCP stdio protocol
webmcp-bridge (MCP server)
    ↕  Puppeteer + CDP
Chromium (WebMCP enabled)
    ↕  monkey-patched document.modelContext
Web page with registered WebMCP tools
```

The bridge launches Chromium with `--enable-features=WebMCPTesting`, navigates to a target page, discovers tools via the WebMCP API, and makes them available to MCP clients.

**Monkey-patch:** Chrome 150+ has a bug where `page.webmcp.invokeTool()` returns `{}` instead of the actual tool result. The bridge works around this by intercepting `registerTool` to capture `execute` functions and replacing `executeTool` to call the captured functions directly.

## Prerequisites

- Node.js 18+
- Chromium/Chrome with WebMCP support (Chrome 150+)
- An MCP client (OpenCode, Claude Code, etc.)

## Setup

```bash
git clone <repo-url> webmcp-bridge
cd webmcp-bridge
npm install
```

## Usage

### Standalone

```bash
CHROME_PATH=/usr/bin/chromium \
WEBMCP_TARGET_URL="https://www.google.com" \
WEBMCP_HEADLESS=false \
node server.js
```

### OpenCode (opencode.json)

```json
{
  "mcp": {
    "webmcp-bridge": {
      "command": ["node", "/path/to/webmcp-bridge/server.js"],
      "enabled": true,
      "type": "local",
      "environment": {
        "CHROME_PATH": "/usr/bin/chromium",
        "WEBMCP_TARGET_URL": "about:blank",
        "WEBMCP_HEADLESS": "false"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CHROME_PATH` | `/usr/bin/chromium` | Path to Chromium/Chrome executable |
| `WEBMCP_TARGET_URL` | `https://www.google.com` | Initial page to navigate to |
| `WEBMCP_HEADLESS` | `true` | Run headless (`true`) or with a visible window (`false`) |

## Bridge-Native Tools

These tools are always available, regardless of what the page exposes:

| Tool | Description |
|---|---|
| `webmcp_navigate` | Navigate Chrome to a URL and refresh discovered WebMCP tools |
| `webmcp_status` | Report connection status, current URL, and available tools |
| `webmcp_evaluate` | Execute arbitrary JavaScript in the page context |
| `webmcp_invoke_tool` | Call any WebMCP tool by name with arguments |
| `webmcp_register_test_tools` | Register sample tools (`test_greet`, `test_calculator`, `test_fetch_title`) for validation |

## Architecture

- **`server.js`** — single-file MCP server using `@modelcontextprotocol/sdk`
- **Puppeteer** (`puppeteer-core`) — drives Chromium via Chrome DevTools Protocol
- **Monkey-patch** — `page.evaluateOnNewDocument` injects a script that intercepts `document.modelContext.registerTool` and `executeTool` to capture actual `execute` functions

## Troubleshooting

- **"Failed to parse input arguments"** — caused by `document.modelContext.executeTool()` failing on the page side. The monkey-patch bypasses this by calling the captured executor directly.
- **"detached Frame"** — the page was navigated away or closed. The bridge auto-recovers by creating a new page. Re-run the tool call.
- **No tools discovered** — ensure the page has called `document.modelContext.registerTool()` with tool definitions. Use `webmcp_evaluate` to call `document.modelContext.getTools()` manually.
- **CORS errors in test tools** — `test_fetch_title` uses `fetch()` which is subject to page CSP. Test on a permissive origin.

## License

MIT
