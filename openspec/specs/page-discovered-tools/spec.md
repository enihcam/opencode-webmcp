# page-discovered-tools Specification

## Purpose
TBD - created by archiving change surface-tool-annotations. Update Purpose after archive.
## Requirements
### Requirement: Page-discovered tools forward annotations
When the bridge registers a tool discovered via the page's WebMCP API, the bridge SHALL forward the page's annotations to the MCP SDK so clients see them.

#### Scenario: Page sets readOnlyHint
- **WHEN** the page calls `document.modelContext.registerTool("list_items", { annotations: { readOnlyHint: true }, ... })`
- **THEN** the bridge exposes the tool with `annotations.readOnlyHint: true`

#### Scenario: Page sets destructiveHint
- **WHEN** the page calls `registerTool("delete_account", { annotations: { destructiveHint: true }, ... })`
- **THEN** the bridge exposes the tool with `annotations.destructiveHint: true`

#### Scenario: Page sets title
- **WHEN** the page calls `registerTool("search", { title: "Search products", ... })`
- **THEN** the bridge exposes the tool with `title: "Search products"`

#### Scenario: Page provides no annotations
- **WHEN** the page calls `registerTool("x", { /* no annotations */ })`
- **THEN** the bridge exposes the tool without an `annotations` field
- **AND** does not inject defaults

### Requirement: Page annotations override bridge defaults
When both the page and the bridge supply annotations for the same tool, the bridge SHALL use the page's annotations.

#### Scenario: Conflict resolution
- **WHEN** the page registers a tool with `readOnlyHint: true`
- **AND** the bridge would otherwise default to `readOnlyHint: false`
- **THEN** the bridge uses `readOnlyHint: true`

### Requirement: Annotation changes trigger tool list refresh
When the page calls `registerTool()` again with new annotations for the same tool name, the bridge SHALL update the exposed tool descriptor.

#### Scenario: Tool re-registered with new annotations
- **WHEN** the page calls `registerTool("search", { annotations: { destructiveHint: true } })`
- **AND** then calls `registerTool("search", { annotations: { destructiveHint: false } })`
- **THEN** the bridge's exposed `search` tool has `destructiveHint: false`
- **AND** a `notifications/tools/list_changed` is sent

