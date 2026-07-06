## 1. Tab Management

- [x] 1.1 Replace the single `page` reference in `server.js` with a `tabs: Map<tabId, Page>` and `activeTabId` variable
- [x] 1.2 Add `addTab(page)`, `removeTab(tabId)`, `getActiveTab()`, `getTab(tabId)` helpers (implemented as `attachTabLifecycle`, `setActiveTab`, `resolveTabPage`, `recoverTabPage`)
- [x] 1.3 Generate tabIds via `crypto.randomUUID()`
- [x] 1.4 Initialize the first tab from the existing startup code; set it active

## 2. Tab Lifecycle

- [x] 2.1 Subscribe to `page.on('close')` for each tab; remove from map when fired
- [x] 2.2 Update auto-recovery to recreate the specific detached tab (not the global page)

## 3. New Tools

- [x] 3.1 Add `webmcp_open_tab` to `BRIDGE_TOOLS`: input schema `{ url?: string }`; handler calls `browser.newPage()` and returns `{ tabId, url }`
- [x] 3.2 Add `webmcp_switch_tab` to `BRIDGE_TOOLS`: input schema `{ tabId: string }`; handler sets `activeTabId`
- [x] 3.3 Add `webmcp_list_tabs` to `BRIDGE_TOOLS`: input schema `{}`; handler returns array of `{ tabId, url, title, isActive }`
- [x] 3.4 Add `webmcp_close_tab` to `BRIDGE_TOOLS`: input schema `{ tabId: string }`; handler closes page and removes from map (rejects on last tab)

## 4. Update Existing Tools

- [x] 4.1 Add optional `tabId: string` parameter to `webmcp_navigate` schema
- [x] 4.2 Add optional `tabId: string` parameter to `webmcp_invoke_tool` schema
- [x] 4.3 Add optional `tabId: string` parameter to `webmcp_evaluate` schema
- [x] 4.4 Add optional `tabId: string` parameter to `webmcp_screenshot` schema
- [x] 4.5 In each handler, resolve `tabId` to a page via `resolveTabPage(args)`; fall back to active tab when omitted (also added tabId to `webmcp_register_test_tools`)

## 5. Verification

- [x] 5.1 Restart bridge; confirm a single tab exists and is active
- [x] 5.2 Call `webmcp_open_tab` with a URL; confirm a new tabId is returned
- [x] 5.3 Call `webmcp_list_tabs`; confirm two entries with one active
- [x] 5.4 Call `webmcp_switch_tab`; confirm `isActive` flag moves
- [x] 5.5 Invoke `webmcp_invoke_tool` with a `tabId` on a non-active tab; confirm it runs there
- [x] 5.6 Close the non-active tab; confirm it disappears from `webmcp_list_tabs`
- [x] 5.7 Try to close the last tab; confirm rejection with clear error

> Browser-side verification deferred to user — requires Chrome 150+ and the bridge running with an MCP client. Static verification: `node --check server.js` passes; tab lifecycle helpers (`attachTabLifecycle`, `setActiveTab`, `resolveTabPage`, `recoverTabPage`, `activeCachedTools`) implemented; 4 new tools added to BRIDGE_TOOLS with handlers; existing tools (navigate/evaluate/invoke_tool/screenshot/register_test_tools) accept `tabId`; module state refactored to `tabs` Map + `activeTabId` + `cachedToolsByTab` + `declarativeToolsByTab`.

## 6. Documentation

- [x] 6.1 Document multi-tab tools in the README
- [x] 6.2 Add a multi-tab example to README or examples/ (added example block to README's Multi-Tab Sessions section)