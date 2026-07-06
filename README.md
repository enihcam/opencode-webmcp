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

### With a config file

```bash
node server.js --config ./webmcp.yaml
```

If `--config` is omitted, the bridge looks for `./webmcp.yaml`, `./webmcp.yml`, or `./webmcp.json` in the current working directory before falling back to environment variables.

**Layered precedence (highest wins):** CLI args → config file → environment variables → built-in defaults.

For example, `node server.js --no-headless` overrides `headless: true` in a config file, which overrides `WEBMCP_HEADLESS=true` in the environment.

Supported keys (camelCase): `chromePath`, `targetUrl`, `headless`, `historyMax`, `logHistory`.

Example `webmcp.yaml`:
```yaml
chromePath: /usr/bin/chromium
targetUrl: https://www.google.com
headless: false
historyMax: 500
logHistory: false
```

Or `webmcp.json`:
```json
{
  "chromePath": "/usr/bin/chromium",
  "targetUrl": "https://www.google.com",
  "headless": false
}
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

### Quick Start (OpenCode)

After adding the config above, restart OpenCode. The bridge tools are now available — just ask:

> **"Navigate to a WebMCP-enabled page and tell me what tools are available"**

OpenCode calls `webmcp_navigate` → bridge opens the page → `webmcp_status` to show discovered tools. From there you can invoke any page tool, take screenshots, evaluate JS, or manage tabs conversationally.

For a full 8-step walkthrough (status → navigate → discover → invoke → screenshot → evaluate → history), see `examples/GETTING_STARTED.md`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CHROME_PATH` | `/usr/bin/chromium` | Path to Chromium/Chrome executable |
| `WEBMCP_TARGET_URL` | `https://www.google.com` | Initial page to navigate to |
| `WEBMCP_HEADLESS` | `true` | Run headless (`true`) or with a visible window (`false`) |
| `WEBMCP_HISTORY_MAX` | `1000` | Maximum number of tool invocations to keep in the in-memory history ring buffer |
| `WEBMCP_LOG_HISTORY` | `false` | When `true`, write each history entry as one JSON line to stderr |
| `WEBMCP_DECLARATIVE_SCAN` | `true` | Scan the page DOM for declarative WebMCP tools (`<form toolname="…">`); set to `false` to disable |

## Bridge-Native Tools

These tools are always available, regardless of what the page exposes:

| Tool | Description |
|---|---|
| `webmcp_navigate` | Navigate Chrome to a URL and refresh discovered WebMCP tools |
| `webmcp_status` | Report connection status, current URL, and available tools |
| `webmcp_evaluate` | Execute arbitrary JavaScript in the page context |
| `webmcp_invoke_tool` | Call any WebMCP tool by name with arguments |
| `webmcp_register_test_tools` | Register sample tools (`test_greet`, `test_calculator`, `test_fetch_title`) for validation |
| `webmcp_screenshot` | Capture a screenshot of the current page (PNG/JPEG, viewport/full-page/clip) and return it as an MCP image |
| `webmcp_history` | Return recent tool invocations from the in-memory history buffer (most recent first; optional `limit`, optional `toolName` filter) |
| `webmcp_clear_history` | Empty the in-memory history buffer |
| `webmcp_open_tab` | Open a new tab, optionally navigating to a URL; returns the new tabId |
| `webmcp_switch_tab` | Make a specific tab the active tab |
| `webmcp_list_tabs` | List all open tabs with `tabId`, `url`, `title`, and `isActive` flag |
| `webmcp_close_tab` | Close a tab by tabId (cannot close the last one) |

### `webmcp_screenshot` example

Default (viewport PNG):
```json
{ "name": "webmcp_screenshot", "arguments": {} }
```

Full-page JPEG at quality 75:
```json
{ "name": "webmcp_screenshot", "arguments": { "format": "jpeg", "quality": 75, "fullPage": true } }
```

Region clip (200×100 at top-left):
```json
{ "name": "webmcp_screenshot", "arguments": { "clip": { "x": 0, "y": 0, "width": 200, "height": 100 } } }
```

## Multi-Tab Sessions

The bridge can manage multiple Puppeteer tabs sharing a single browser context. Each tab has a UUID `tabId`; one tab is **active** at a time. Tools without `tabId` act on the active tab; pass `tabId` to target a specific tab without switching.

```json
{ "name": "webmcp_open_tab", "arguments": { "url": "https://example.com" } }
// → { "tabId": "a1b2c3d4-…", "url": "https://example.com" }

{ "name": "webmcp_list_tabs", "arguments": {} }
// → { "count": 2, "tabs": [{ "tabId": "…", "url": "…", "title": "…", "isActive": true }, …] }

{ "name": "webmcp_switch_tab", "arguments": { "tabId": "a1b2c3d4-…" } }
{ "name": "webmcp_invoke_tool", "arguments": { "name": "search", "args": { "q": "weather" }, "tabId": "a1b2c3d4-…" } }
{ "name": "webmcp_close_tab", "arguments": { "tabId": "a1b2c3d4-…" } }
```

Closing the last remaining tab returns an error. When the active tab is closed (with other tabs remaining), the next tab in the map becomes active.

## Architecture

- **`server.js`** — single-file MCP server using `@modelcontextprotocol/sdk`
- **Puppeteer** (`puppeteer-core`) — drives Chromium via Chrome DevTools Protocol
- **Monkey-patch** — `page.evaluateOnNewDocument` injects a script that intercepts `document.modelContext.registerTool` and `executeTool` to capture actual `execute` functions
- **Declarative API scanner** — also scans the DOM for `<form toolname="…">` and synthesizes MCP tools from `[toolname-target]` attributes. Wired through a 100ms-debounced MutationObserver that flips a dirty flag whenever `[toolname]` attributes change. Imperative tools take precedence on name collisions.

## Tool Annotations

MCP tool annotations (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are surfaced to MCP clients. Defaults for bridge-native tools:

| Tool | readOnly | destructive | openWorld |
|---|---|---|---|
| `webmcp_navigate` | false | false | true |
| `webmcp_status` | true | false | false |
| `webmcp_evaluate` | false | true | true |
| `webmcp_invoke_tool` | (page-determined) | (page-determined) | (page-determined) |
| `webmcp_screenshot` | true | false | false |
| `webmcp_register_test_tools` | false | false | false |
| `webmcp_history` / `webmcp_list_tabs` | true | false | false |
| `webmcp_clear_history` / `webmcp_close_tab` | false | true | false |
| `webmcp_open_tab` / `webmcp_switch_tab` | false | false | false |

Page-discovered tools forward their annotations to MCP clients as-is. The bridge never overrides page-supplied annotations. If a page calls `registerTool("delete_account", { annotations: { destructiveHint: true } })`, that annotation flows through to `tools/list`. Annotation changes on the page trigger `notifications/tools/list_changed`.

Clients that ignore the `annotations` field see no behavior change.

## Declarative WebMCP API

Chrome's WebMCP API has two surfaces. The bridge handles both:

1. **Imperative** — pages call `document.modelContext.registerTool({ name, inputSchema, execute })`.
2. **Declarative** — pages annotate HTML with `toolname` / `toolname-target` attributes:

   ```html
   <form toolname="search">
     <input name="q" toolname-target="search.query" required>
     <input name="limit" toolname-target="search.limit" type="number">
     <button>Search</button>
   </form>
   ```

The bridge synthesizes an MCP tool descriptor from this form. Invoking the tool fills the targeted fields with the provided arguments and dispatches a `submit` event on the form.

**Name collisions:** if the page registers an imperative tool with the same name, the imperative registration wins.

**Opt-out:** set `WEBMCP_DECLARATIVE_SCAN=false` to disable DOM scanning and the MutationObserver entirely.

## Troubleshooting

- **"Failed to parse input arguments"** — caused by `document.modelContext.executeTool()` failing on the page side. The monkey-patch bypasses this by calling the captured executor directly.
- **"detached Frame"** — the page was navigated away or closed. The bridge auto-recovers by creating a new page. Re-run the tool call.
- **No tools discovered** — ensure the page has called `document.modelContext.registerTool()` with tool definitions. Use `webmcp_evaluate` to call `document.modelContext.getTools()` manually.
- **CORS errors in test tools** — `test_fetch_title` uses `fetch()` which is subject to page CSP. Test on a permissive origin.

## License

MIT
