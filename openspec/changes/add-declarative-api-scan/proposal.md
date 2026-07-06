## Why

Chrome 149+ supports two WebMCP APIs: the imperative `document.modelContext.registerTool()` (what the bridge currently understands) and the **declarative** HTML form annotation API (`<form toolname="...">` and `<input toolname-target="...">`). Pages that opt for the declarative API never call `registerTool()`, so the bridge discovers zero tools even though the page exposes real functionality.

For example, a search page might expose its search input declaratively:
```html
<form toolname="search">
  <input name="q" toolname-target="search.query">
  <button>Search</button>
</form>
```

The page never registers an imperative tool. The bridge's `document.modelContext.getTools()` returns nothing. The MCP client can't discover the search capability.

## What Changes

- The bridge SHALL scan the current page's DOM for HTML elements annotated with the declarative WebMCP API (`toolname` and `toolname-target` attributes).
- For each `<form toolname="x">`, the bridge SHALL synthesize an MCP tool whose name is `x` and whose input schema is derived from the form's named/targeted fields.
- The synthesized tool SHALL be exposed via `McpServer.tool()` alongside imperative tools.
- The bridge SHALL use the page's built-in mechanism (`document.modelContext` declarative API) where available; if Chrome's declarative API is supported natively, the bridge falls back to DOM scraping only as a backup.

## Capabilities

### New Capabilities
- `declarative-tool-discovery`: Discover tools registered via HTML form annotations, not just imperative `registerTool()` calls.

### Modified Capabilities
<!-- None. Existing capabilities unchanged. -->

## Impact

- **Code**: `server.js` — add `scanDeclarativeTools(page)` that reads `document.querySelectorAll('[toolname]')` and synthesizes MCP tool descriptors. ~80-120 lines.
- **APIs**: No new MCP tools. New synthetic tools appear in `tools/list`.
- **Performance**: DOM scan on navigation. `<100ms` for typical pages. Cached per navigation event.
- **Compatibility**: Falls back gracefully if `toolname` attribute is unrecognized (no error).