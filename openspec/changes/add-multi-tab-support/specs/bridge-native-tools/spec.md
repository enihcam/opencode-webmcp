# bridge-native-tools

Tools provided by the webmcp-bridge itself, independent of any WebMCP-enabled page. Always available as long as the bridge is running.

## ADDED Requirements

### Requirement: Existing tools accept optional tabId
Existing bridge-native tools (`webmcp_navigate`, `webmcp_invoke_tool`, `webmcp_evaluate`, `webmcp_screenshot`) SHALL accept an optional `tabId` parameter to target a non-active tab.

#### Scenario: Tool call with tabId
- **WHEN** the MCP client invokes `webmcp_invoke_tool` with `{ name: "search", arguments: {...}, tabId: "<uuid>" }`
- **THEN** the bridge performs the tool invocation on the specified tab
- **AND** the active tab is unchanged

#### Scenario: Tool call without tabId
- **WHEN** the MCP client invokes `webmcp_invoke_tool` without `tabId`
- **THEN** the bridge uses the currently active tab

#### Scenario: tabId targets missing tab
- **WHEN** the MCP client invokes any tool with `{ tabId: "missing" }` and no such tab exists
- **THEN** the bridge returns an MCP error response identifying the missing tab