# bridge-native-tools Specification

## Purpose
TBD - created by archiving change add-webmcp-screenshot. Update Purpose after archive.
## Requirements
### Requirement: Bridge exposes webmcp_screenshot tool
The bridge SHALL expose a `webmcp_screenshot` MCP tool that returns a screenshot of the current page.

#### Scenario: Default screenshot
- **WHEN** the MCP client invokes `webmcp_screenshot` with no arguments
- **THEN** the bridge captures the current viewport as a PNG
- **AND** returns the image as MCP `ImageContent` with `mimeType: "image/png"`

#### Scenario: JPEG format with quality
- **WHEN** the MCP client invokes `webmcp_screenshot` with `{ format: "jpeg", quality: 80 }`
- **THEN** the bridge captures the page as JPEG with quality 80
- **AND** returns the image as MCP `ImageContent` with `mimeType: "image/jpeg"`

#### Scenario: Full-page screenshot
- **WHEN** the MCP client invokes `webmcp_screenshot` with `{ fullPage: true }`
- **THEN** the bridge captures the entire scrollable page
- **AND** returns it as a single image

#### Scenario: Region clip
- **WHEN** the MCP client invokes `webmcp_screenshot` with `{ clip: { x: 0, y: 0, width: 200, height: 100 } }`
- **THEN** the bridge captures only that region

#### Scenario: Page not available
- **WHEN** the MCP client invokes `webmcp_screenshot` but the page is detached
- **THEN** the bridge attempts auto-recovery
- **AND** if recovery succeeds, takes the screenshot on the new page
- **AND** if recovery fails, returns an MCP error response

### Requirement: webmcp_screenshot input schema
The bridge SHALL accept the following optional input parameters for `webmcp_screenshot`: `format` (enum "png" | "jpeg", default "png"), `quality` (integer 1-100, only valid when format is "jpeg"), `fullPage` (boolean, default false), `clip` (object with `x`, `y`, `width`, `height` integers).

#### Scenario: Invalid format
- **WHEN** the MCP client invokes `webmcp_screenshot` with `{ format: "gif" }`
- **THEN** the JSON Schema validation rejects the call
- **AND** the bridge returns an MCP invalid-arguments error

#### Scenario: Quality without JPEG
- **WHEN** the MCP client invokes `webmcp_screenshot` with `{ quality: 80 }` and `format` is omitted (defaults to PNG)
- **THEN** the bridge ignores the quality parameter and produces a PNG

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

