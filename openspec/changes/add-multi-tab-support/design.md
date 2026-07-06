## Context

The webmcp-bridge (`server.js`, ~400 lines, ESM) currently holds a single Puppeteer `page` reference. The handlers in `setupToolHandlers()` reference `context.page` for every operation. Navigation, tool calls, and screenshots all act on that one page.

Puppeteer's `browser.newPage()` creates a new tab sharing the browser context (cookies, localStorage). This is exactly what an MCP agent needs to operate on multiple WebMCP-enabled sites in parallel.

## Goals / Non-Goals

**Goals:**
- Manage multiple Puppeteer tabs.
- Add `webmcp_open_tab`, `webmcp_switch_tab`, `webmcp_list_tabs`, `webmcp_close_tab` MCP tools.
- Optional `tabId` parameter on existing tools to target a non-active tab.
- Auto-recovery works per-tab.
- Tab lifecycle events (close, crash) clean up the map entry.

**Non-Goals:**
- Browser contexts (separate cookies/storage). All tabs share the browser's default context.
- Tab groups / windows.
- Closing the browser itself.
- Tab persistence across bridge restarts.
- Cross-tab coordination (e.g., "wait for tab A to load before invoking on tab B"). MCP clients can do this with sequential tool calls.

## Decisions

**Decision 1: `tabId` is a UUID, not an integer.**

UUIDs avoid collisions if tabs are opened/closed rapidly and don't leak information about ordering. Generated with `crypto.randomUUID()` (Node 18+ built-in).

**Decision 2: One tab is always active. Switching is explicit.**

No "last focused" auto-switching. The MCP client must call `webmcp_switch_tab` explicitly. This keeps the mental model simple: tool calls without `tabId` target the active tab.

**Decision 3: Cannot close the last tab.**

The bridge needs at least one tab to operate. `webmcp_close_tab` rejects if it's the last one.

**Decision 4: Optional `tabId` parameter on existing tools.**

Rather than require explicit switching, add `tabId` as an optional param to existing tools. This lets agents do `webmcp_invoke_tool("search", args, { tabId: "abc" })` without switching. If omitted, uses the active tab.

**Decision 5: Auto-recovery is per-tab.**

If a specific tab detaches, only that tab is recreated. The active tab and other tabs are unaffected. The next tool call on the detached tab creates a new page.

**Decision 6: `webmcp_list_tabs` returns minimal info: `tabId`, `url`, `title`, `isActive`.**

URL and title are fetched via `page.url()` and `page.title()`. Avoid heavy data (no screenshots, no full DOM).

## Risks / Trade-offs

- **[Map state divergence]** → If a tab closes itself (e.g., the page navigates to `window.close()`), the bridge may still hold a stale reference. → Mitigation: listen for `page.on('close')` and remove from the map.
- **[Cross-tab race conditions]** → Tools acting on different tabs simultaneously could interleave. → Mitigation: Puppeteer handles one CDP command per page at a time; no extra serialization needed.
- **[Memory]** → Each tab consumes ~50-100 MB of Chrome memory. → Mitigation: document a sane limit; no automatic cap.
- **[Tool ID conflicts across tabs]** → Two tabs could expose tools with the same name. → Mitigation: MCP tools are global (per-bridge), not per-tab. Tool calls always include the tabId, so disambiguation is via the `tabId` arg.

## Migration Plan

- Existing single-tab users: no change. A single tab is created at startup; all existing tools work as before.
- Migration path: turn the existing `page` variable into `tabs.get(activeTabId)`.
- Rollback: revert to single-`page` design.

## Open Questions

- Should `webmcp_open_tab` accept a `background: true` flag to open without auto-focusing? Out of scope; tabs are headless to the MCP client regardless.
- Should we expose `webmcp_tab_count` for quick size checks? `webmcp_list_tabs` is sufficient.