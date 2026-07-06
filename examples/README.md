# WebMCP Bridge Examples

Example HTML pages and guides for the webmcp-bridge MCP server.

## Examples

| Example | File | What it shows |
|---|---|---|
| Declarative API | `declarative-search.html` | HTML forms with `[toolname]` attributes — no JS needed for tool registration. Also demonstrates dynamic injection via `MutationObserver`. |
| Imperative API | `imperative-tools.html` | JavaScript `registerTool()` calls for a weather dashboard with async executors, typed input schemas, and annotation metadata. |
| Annotation reference | `annotation-demo.html` | Every annotation combination visualised as a card grid — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. |
| Hybrid dashboard | `mixed-dashboard.html` | Declarative forms + imperative JS tools on the same page, with collision handling (imperative wins) and dynamic injection. |

## Guides

| Guide | File | What it covers |
|---|---|---|
| Getting Started | `GETTING_STARTED.md` | 8-step walkthrough from setup to history inspection. |
| Multi-Tab Scenarios | `MULTI_TAB_SCENARIOS.md` | Compare pages, reference-tab pattern, dashboard monitoring. |

## How to use

1. Start the bridge:
   ```bash
   node server.js
   ```

2. Navigate to an example page:
   ```
   webmcp_navigate({ url: "http://localhost/path/to/examples/declarative-search.html" })
   ```

3. Discover tools via `webmcp_status` and invoke them.

See `GETTING_STARTED.md` for the full walkthrough.
