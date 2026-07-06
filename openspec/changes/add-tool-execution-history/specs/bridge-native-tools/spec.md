# bridge-native-tools

Tools provided by the webmcp-bridge itself, independent of any WebMCP-enabled page. Always available as long as the bridge is running.

## ADDED Requirements

### Requirement: Bridge exposes webmcp_history tool
The bridge SHALL expose a `webmcp_history` MCP tool that returns recent tool invocations from the in-memory ring buffer.

#### Scenario: Default history query
- **WHEN** the MCP client invokes `webmcp_history` with no arguments
- **THEN** the bridge returns the most recent 50 entries
- **AND** each entry contains: timestamp (ISO 8601), tool name, arguments, success boolean, durationMs, error (if any)

#### Scenario: Limited number of entries
- **WHEN** the MCP client invokes `webmcp_history` with `{ limit: 10 }`
- **THEN** the bridge returns at most 10 entries, most recent first

#### Scenario: Filter by tool name
- **WHEN** the MCP client invokes `webmcp_history` with `{ toolName: "webmcp_navigate" }`
- **THEN** the bridge returns only entries whose tool name equals `webmcp_navigate`

#### Scenario: Empty history
- **WHEN** the MCP client invokes `webmcp_history` and no tool calls have been made
- **THEN** the bridge returns an empty array

### Requirement: Bridge exposes webmcp_clear_history tool
The bridge SHALL expose a `webmcp_clear_history` MCP tool that empties the in-memory ring buffer.

#### Scenario: Clear with entries present
- **WHEN** the MCP client invokes `webmcp_clear_history` and history contains entries
- **THEN** the bridge removes all entries
- **AND** returns a confirmation response

#### Scenario: Clear with empty history
- **WHEN** the MCP client invokes `webmcp_clear_history` and history is already empty
- **THEN** the bridge returns a confirmation response with no error

### Requirement: webmcp_history input schema
The bridge SHALL accept the following optional input parameters for `webmcp_history`: `limit` (integer 1-1000, default 50), `toolName` (string, optional filter).

#### Scenario: Limit exceeds cap
- **WHEN** the MCP client invokes `webmcp_history` with `{ limit: 5000 }`
- **THEN** the JSON Schema validation rejects the call
- **AND** the bridge returns an MCP invalid-arguments error