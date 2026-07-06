# webmcp-bridge — Context

## What this project is

An MCP (Model Context Protocol) server that bridges MCP clients (OpenCode, Claude Code) to Chromium's WebMCP API. It connects via Puppeteer + Chrome DevTools Protocol (CDP), discovers tools registered through `document.modelContext` on the page, and exposes them as MCP tools on stdio.

## Domain terminology

| Term | Meaning |
|---|---|
| **MCP** | Model Context Protocol — the protocol this server speaks (stdio transport). |
| **WebMCP** | Chrome-browser-side API surfaced at `document.modelContext` on pages with the WebMCP feature flag enabled. |
| **Bridge-native tool** | A tool implemented in `server.js` itself, always available regardless of page content. Examples: `webmcp_navigate`, `webmcp_status`. |
| **Page-discovered tool** | A tool registered by a web page via `document.modelContext.registerTool()` or declared declaratively via HTML `[toolname]` attributes. Discovered at navigation and served alongside bridge-native tools. |
| **Declarative tool** | A page-discovered tool defined by an HTML element with a `toolname` attribute and named child fields (`[toolname-target]`). Scanned from the DOM on navigation and when a MutationObserver fires. |
| **Imperative tool** | A page-discovered tool registered via `document.modelContext.registerTool()` in JavaScript. |
| **Monkey-patch** | The `evaluateOnNewDocument` script that intercepts `registerTool` and `executeTool` to work around a Chrome bug where `page.webmcp.invokeTool()` returns `{}`. |
| **Dispatch table** | The `BRIDGE_HANDLERS` object mapping tool names to handler functions — replaced the original 310-line switch statement. |
| **Tab** | A Chrome tab (Puppeteer Page) managed by the bridge. Each has a UUID `tabId`, a cached tool list, and a declarative tool array. One tab is always active. |
| **Ring buffer** | Fixed-size in-memory array (`history`) that stores recent tool invocations. Evicts oldest when full. |

## Architecture at a glance

```
MCP client (OpenCode/Claude Code)
    │ stdio
    ▼
server.js  ─── lib/config.mjs  (config layer)
    │
    ├── Config loading: DEFAULTS → env → file → CLI
    ├── Tab lifecycle: attach → navigate → discover → cache
    ├── Monkey-patch: injected on every new page
    ├── Bridge dispatch: BRIDGE_HANDLERS table (12 handlers)
    │   └── bridge-native tools returned first
    ├── Page dispatch: executeWebMCPTool / executeDeclarativeTool
    ├── Tool merging: site tools + bridge tools → MCP ListTools
    └── Auto-recovery: detached frames recreate the page
```

## Key invariants

- **The bridge must always keep at least one tab open.** Closing the last tab is rejected.
- **Tool history is in-memory only.** Cleared on restart.
- **Config is read once at startup.** No hot-reload.
- **Monkey-patch is injected via `evaluateOnNewDocument`** before every `page.goto()`.
- **Bridge-native tools take priority** over page-discovered tools with the same name.

## Deps & toolchain

- Node 18+ (ESM only)
- `@modelcontextprotocol/sdk` v1.x
- `puppeteer-core` v25.x (no bundled browser — needs system Chrome/Chromium 150+)
- `js-yaml` v5.x for config file parsing
- No build step, no test framework, no linter
- 36/39 unit tests in `test/unit.mjs` (self-assert, no framework)
