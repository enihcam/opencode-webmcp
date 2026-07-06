# multi-tab-session Specification

## Purpose
TBD - created by archiving change add-multi-tab-support. Update Purpose after archive.
## Requirements
### Requirement: Bridge exposes webmcp_open_tab tool
The bridge SHALL expose a `webmcp_open_tab` MCP tool that creates a new tab and returns its tabId.

#### Scenario: Open tab with URL
- **WHEN** the MCP client invokes `webmcp_open_tab` with `{ url: "https://example.com" }`
- **THEN** the bridge creates a new Puppeteer page
- **AND** navigates it to `https://example.com`
- **AND** returns `{ tabId: "<uuid>", url: "https://example.com" }`

#### Scenario: Open tab without URL
- **WHEN** the MCP client invokes `webmcp_open_tab` with no arguments
- **THEN** the bridge creates a new tab pointing at `about:blank`
- **AND** returns `{ tabId: "<uuid>", url: "about:blank" }`

#### Scenario: New tab is not active
- **WHEN** a new tab is opened
- **THEN** the previously active tab remains active
- **AND** the new tab can be made active via `webmcp_switch_tab`

### Requirement: Bridge exposes webmcp_switch_tab tool
The bridge SHALL expose a `webmcp_switch_tab` MCP tool that sets the active tab.

#### Scenario: Switch to existing tab
- **WHEN** the MCP client invokes `webmcp_switch_tab` with `{ tabId: "<uuid>" }` and that tab exists
- **THEN** the bridge sets that tab as active
- **AND** subsequent tool calls without `tabId` target it

#### Scenario: Switch to non-existent tab
- **WHEN** the MCP client invokes `webmcp_switch_tab` with `{ tabId: "missing" }` and no such tab exists
- **THEN** the bridge returns an MCP error response
- **AND** the active tab is unchanged

### Requirement: Bridge exposes webmcp_list_tabs tool
The bridge SHALL expose a `webmcp_list_tabs` MCP tool that returns all open tabs.

#### Scenario: List with multiple tabs
- **WHEN** the MCP client invokes `webmcp_list_tabs` and three tabs are open
- **THEN** the bridge returns an array of three entries
- **AND** each entry contains: `tabId`, `url`, `title`, `isActive: boolean`

#### Scenario: Active flag is set on exactly one tab
- **WHEN** `webmcp_list_tabs` returns multiple entries
- **THEN** exactly one entry has `isActive: true`
- **AND** all others have `isActive: false`

### Requirement: Bridge exposes webmcp_close_tab tool
The bridge SHALL expose a `webmcp_close_tab` MCP tool that closes a tab.

#### Scenario: Close a non-active tab
- **WHEN** the MCP client invokes `webmcp_close_tab` with `{ tabId: "<uuid>" }` for a non-active tab
- **THEN** the bridge closes that tab
- **AND** removes it from the tabs map
- **AND** the active tab remains active

#### Scenario: Close the active tab
- **WHEN** the MCP client invokes `webmcp_close_tab` for the currently active tab
- **AND** other tabs exist
- **THEN** the bridge closes the tab
- **AND** the next-most-recently-active tab becomes the new active tab

#### Scenario: Close the last tab
- **WHEN** the MCP client invokes `webmcp_close_tab` for the only remaining tab
- **THEN** the bridge returns an MCP error response
- **AND** the tab is not closed

#### Scenario: Close non-existent tab
- **WHEN** the MCP client invokes `webmcp_close_tab` with `{ tabId: "missing" }`
- **THEN** the bridge returns an MCP error response

### Requirement: Tab auto-cleanup on page close
The bridge SHALL remove a tab from its map when the underlying Puppeteer page emits a `close` event (including browser-initiated closes).

#### Scenario: Page navigates to about:blank and closes itself
- **WHEN** a tab's page closes due to user code or Chrome
- **THEN** the bridge removes the tab from its map
- **AND** `webmcp_list_tabs` no longer includes it

