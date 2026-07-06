## Context

The webmcp-bridge (`server.js`, ~400 lines, ESM) currently calls `document.modelContext.registerTool()` to discover imperative tools. Chrome 149+ also ships a declarative WebMCP API where HTML forms declare tools via attributes:

- `toolname="x"` on a `<form>` (or any element) declares a tool.
- `toolname-target="x.field"` on an `<input>`/`<select>`/`<textarea>` declares an input parameter that maps to the tool's schema.

When the page uses the declarative API, `document.modelContext.getTools()` may or may not return those tools depending on Chrome's implementation. As of early Chrome 149, the declarative API is shipped behind the same `WebMCPTesting` feature flag as the imperative API.

The bridge currently has no fallback for pages that use only declarative tools. Adding DOM-scanning provides a safety net and supports declarative-only pages.

## Goals / Non-Goals

**Goals:**
- Discover declarative tools by scanning the DOM for `[toolname]` attributes.
- Synthesize MCP tool descriptors (name, input schema) from the form structure.
- Treat declarative tools the same as imperative tools in `tools/list` and `tools/call`.
- Update the tool list on navigation/re-render via `MutationObserver`.

**Non-Goals:**
- Replacing the imperative API. Both APIs coexist; declarative is a supplement.
- Auto-filling forms from tool arguments — that's the page's responsibility.
- Inferring tool descriptions from form labels (out of scope for v1; description may be empty).

## Decisions

**Decision 1: Try native declarative API first, DOM scan as fallback.**

Chrome 149+ has its own declarative support. If `document.modelContext.getTools()` returns declarative tools natively, use those. Otherwise, scan the DOM. This avoids duplicate tools and respects Chrome's source of truth.

**Decision 2: MutationObserver on `document.body` for re-scan.**

Forms can be added/removed dynamically. Watch for `[toolname]` attribute changes and re-publish the tool list.

**Decision 3: Synthesize input schema from form fields.**

For each `<input name="..." toolname-target="tool.field">`, add `{ field: { type: "string" } }` to the schema. Real types (number, boolean, enum) can be inferred from `type="number"` / `type="checkbox"` etc., but v1 keeps it as `string` for simplicity.

**Decision 4: Tool execution submits the form.**

The synthesized tool's handler creates a synthetic `submit` event on the form. Puppeteer's `page.evaluate()` runs the code in the page context, so the form submission triggers the page's own JavaScript handlers.

**Decision 5: No description inference.**

Forms don't carry a standard description. v1 leaves the description empty or generates a generic one like "Tool declared by `<form toolname='x'>` on the current page."

## Risks / Trade-offs

- **[DOM scan cost]** → Scanning the DOM on every navigation/mutation can be expensive on large pages. → Mitigation: scope querySelector to `[toolname]`, debounce mutation handler (100ms).
- **[Synthetic schema quality]** → Generic `string` types may not match what the form actually expects. → Mitigation: document this limitation; users can override via the imperative API.
- **[Duplicate tools]** → A page may register the same tool name both imperatively and declaratively. → Mitigation: imperative wins (it's registered first); deduplicate by name.
- **[Spec churn]** → Chrome's declarative API is still in origin trial; the attribute names could change. → Mitigation: keep the scanner behind a feature flag (`WEBMCP_DECLARATIVE_SCAN`), default on. Add unit tests for the current attribute names.

## Migration Plan

- Opt-out via `WEBMCP_DECLARATIVE_SCAN=false` env var.
- Rollback: remove the scanner and the MutationObserver wiring.

## Open Questions

- Should we surface the `toolname` attribute's docstring (e.g., from a sibling `<p toolname-description="x">` element)? Out of scope for v1; can add later if Chrome standardizes it.
- Should the scanner respect `toolname-disabled` attribute? Not yet standardized; defer.