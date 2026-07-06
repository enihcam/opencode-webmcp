## Why

The webmcp-bridge currently operates on a single Puppeteer page. All bridge-native tools (`webmcp_navigate`, `webmcp_invoke_tool`, `webmcp_evaluate`, `webmcp_screenshot`) target that one page. Real-world agent workflows often need to compare multiple pages, run parallel WebMCP-enabled sites, or keep context separate across tasks (e.g., search results in one tab, the product page in another).

Multi-tab support unlocks these workflows without changing the per-tab tool semantics.

## What Changes

- The bridge SHALL manage a collection of tabs (Puppeteer `Page` objects), each with a unique tabId.
- One tab is "active" at any time. Most tools (`webmcp_navigate`, `webmcp_invoke_tool`, `webmcp_evaluate`, `webmcp_screenshot`) operate on the active tab.
- Add four new bridge-native tools:
  - `webmcp_open_tab` — opens a new tab, optionally navigating to a URL, returns the new tabId.
  - `webmcp_switch_tab` — sets the active tab by tabId.
  - `webmcp_list_tabs` — returns all open tabs with their tabId, URL, and title.
  - `webmcp_close_tab` — closes a tab by tabId (cannot close the last one).
- A new `tabId` parameter on existing tools (optional) targets a specific tab without switching.

## Capabilities

### New Capabilities
- `multi-tab-session`: Open, switch, list, and close multiple Puppeteer tabs from MCP tools.

### Modified Capabilities
- `bridge-native-tools`: Existing tools accept an optional `tabId` parameter to target a non-active tab.

## Impact

- **Code**: `server.js` — replace the single `page` variable with a `tabs: Map<tabId, Page>` and an `activeTabId`. Update each existing handler to look up the tab. Add 4 new tools. ~150-200 lines.
- **APIs**: 4 new MCP tools. Existing tools gain optional `tabId`.
- **Performance**: Tabs share a Browser context. Adding a tab is ~50ms.
- **Backwards compatibility**: Existing tools work as before when no `tabId` is given (defaults to active tab). A single-tab setup behaves identically to today.
- **Pitfalls**: Auto-recovery now needs to know which tab detached. Tab close events need to remove the entry from the map.