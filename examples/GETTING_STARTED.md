# Getting Started with webmcp-bridge

An 8-step walkthrough from zero to tool invocation.

## Prerequisites

- Node 18+
- Chrome/Chromium 150+
- This repo cloned and `npm install` run

## 1. Start the bridge

```bash
CHROME_PATH=/usr/bin/chromium WEBMCP_HEADLESS=false node server.js
```

Expected output:

```
[webmcp-bridge] Starting Chrome...
[webmcp-bridge] Navigated to https://www.google.com
[webmcp-bridge] Discovered 0 WebMCP tools
[webmcp-bridge] Browser PID: 12345
[webmcp-bridge] MCP server ready over stdio
```

The "0 tools" message is expected — the initial page (google.com) doesn't register any tools.

## 2. Check connection

```
webmcp_status({})
```

Expected response:

```json
{
  "status": "ok",
  "tabId": "550e8400-e29b-41d4-a716-446655440000",
  "connected": true,
  "url": "https://www.google.com",
  "tabCount": 1,
  "toolCount": 12,
  "toolNames": [
    "webmcp_navigate",
    "webmcp_status",
    "webmcp_evaluate",
    "webmcp_invoke_tool",
    "webmcp_register_test_tools",
    "webmcp_screenshot",
    "webmcp_history",
    "webmcp_clear_history",
    "webmcp_open_tab",
    "webmcp_switch_tab",
    "webmcp_list_tabs",
    "webmcp_close_tab"
  ]
}
```

You should see all 12 bridge-native tools. `webmcpAvailable` may be `false` since the initial page doesn't use WebMCP — that's fine.

## 3. Navigate to a WebMCP-enabled page

Any of the `examples/*.html` files work. For example, if you're serving them via a local HTTP server:

```
webmcp_navigate({ url: "http://localhost:8080/imperative-tools.html" })
```

Expected response:

```json
{
  "status": "ok",
  "tabId": "550e8400-e29b-41d4-a716-446655440000",
  "url": "http://localhost:8080/imperative-tools.html",
  "toolsFound": 4
}
```

## 4. Discover available tools

```
webmcp_status({})
```

Expected response should now show `toolCount: 16` (12 bridge + 4 page tools) and `webmcpAvailable: true`. The tool list includes the page's custom tools like `get_weather` and `set_alert`.

For a full list, you can use evaluate:

```
webmcp_evaluate({ code: "JSON.stringify((await document.modelContext.getTools()).map(t => t.name))" })
```

## 5. Invoke a page-discovered tool

```
webmcp_invoke_tool({ name: "get_weather", args: { city: "Tokyo" } })
```

Expected response:

```json
{
  "city": "Tokyo",
  "temperature": 22,
  "conditions": "Partly Cloudy",
  "humidity": 65,
  "timestamp": "2026-07-06T10:00:00.000Z"
}
```

## 6. Take a screenshot

```
webmcp_screenshot({ format: "jpeg", quality: 80 })
```

Returns an MCP `image` content block. The client renders it inline (OpenCode shows the image).

## 7. Evaluate custom JavaScript

Run arbitrary JS on the page:

```
webmcp_evaluate({ code: "document.title" })
```

Expected response (varies by page):

```json
"Imperative WebMCP Tools — Weather Dashboard"
```

Or inspect the WebMCP tool list directly:

```
webmcp_evaluate({ code: "(await document.modelContext.getTools()).map(t => t.name)" })
```

## 8. Check tool history

```
webmcp_history({ limit: 5 })
```

Expected response lists the last 5 tool calls in reverse chronological order, each with timestamp, tool name, arguments, success status, and duration.

---

## Next steps

- Try the [annotation demo](annotation-demo.html) to see all annotation combos
- Open multiple tabs and switch between them ([multi-tab guide](MULTI_TAB_SCENARIOS.md))
- Build your own WebMCP-enabled page using the imperative or declarative API
