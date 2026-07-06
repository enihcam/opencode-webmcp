# bridge-native-tools

Tools provided by the webmcp-bridge itself, independent of any WebMCP-enabled page. Always available as long as the bridge is running.

## ADDED Requirements

### Requirement: Bridge-native tools expose MCP annotations
Each entry in the bridge's `BRIDGE_TOOLS` array SHALL include an `annotations` object passed to the MCP SDK. Annotations follow the MCP spec (2025-06-18): `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.

#### Scenario: webmcp_navigate annotations
- **WHEN** the MCP client requests the tool list
- **THEN** the `webmcp_navigate` tool descriptor includes `annotations.readOnlyHint: false`
- **AND** `annotations.destructiveHint: false`
- **AND** `annotations.openWorldHint: true`

#### Scenario: webmcp_status annotations
- **WHEN** the MCP client requests the tool list
- **THEN** the `webmcp_status` tool descriptor includes `annotations.readOnlyHint: true`
- **AND** `annotations.destructiveHint: false`
- **AND** `annotations.openWorldHint: false`

#### Scenario: webmcp_evaluate annotations
- **WHEN** the MCP client requests the tool list
- **THEN** the `webmcp_evaluate` tool descriptor includes `annotations.readOnlyHint: false`
- **AND** `annotations.destructiveHint: true`
- **AND** `annotations.openWorldHint: true`

#### Scenario: webmcp_screenshot annotations
- **WHEN** the MCP client requests the tool list
- **THEN** the `webmcp_screenshot` tool descriptor includes `annotations.readOnlyHint: true`

### Requirement: Bridge-native tools expose display titles
Bridge-native tools SHALL include a human-readable `title` in their descriptor where it improves clarity.

#### Scenario: webmcp_navigate title
- **WHEN** the MCP client requests the tool list
- **THEN** the `webmcp_navigate` tool descriptor includes `title: "Navigate to URL"`

#### Scenario: webmcp_status title
- **WHEN** the MCP client requests the tool list
- **THEN** the `webmcp_status` tool descriptor includes `title: "Get bridge and page status"`

### Requirement: Annotations do not break clients that ignore them
Bridge-native tool descriptors SHALL remain valid when MCP clients omit or ignore the `annotations` field.

#### Scenario: Annotation-aware client
- **WHEN** an MCP client requests the tool list and supports annotations
- **THEN** the bridge returns descriptors with annotations intact

#### Scenario: Annotation-unaware client
- **WHEN** an MCP client requests the tool list and ignores annotations
- **THEN** the bridge returns descriptors that the client can use without errors