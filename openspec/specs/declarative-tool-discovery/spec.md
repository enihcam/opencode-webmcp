# declarative-tool-discovery Specification

## Purpose
TBD - created by archiving change add-declarative-api-scan. Update Purpose after archive.
## Requirements
### Requirement: Bridge scans DOM for declarative tools
The bridge SHALL scan the current page's DOM for elements with a `toolname` attribute and synthesize MCP tool descriptors for each.

#### Scenario: Page has one declarative form
- **WHEN** the page contains `<form toolname="search">`
- **THEN** the bridge exposes a tool named `search` to the MCP client
- **AND** the tool appears in `tools/list` alongside imperative tools

#### Scenario: Page has no declarative tools
- **WHEN** the page contains no `toolname` attributes
- **THEN** the bridge exposes only imperative tools (no synthetic ones)

#### Scenario: Multiple declarative tools
- **WHEN** the page contains two forms with `toolname="search"` and `toolname="add_to_cart"`
- **THEN** the bridge exposes both tools

### Requirement: Input schema is synthesized from form fields
For each declarative tool, the bridge SHALL synthesize an input schema from the form's fields with `name` and `toolname-target` attributes.

#### Scenario: Form has named field
- **WHEN** the form `<form toolname="search">` contains `<input name="q" toolname-target="search.query">`
- **THEN** the synthesized tool's input schema includes `properties.query` of type `string`

#### Scenario: Form has multiple fields
- **WHEN** the form has three named/targeted fields
- **THEN** the input schema includes all three as string properties

### Requirement: MutationObserver keeps tool list current
The bridge SHALL observe DOM mutations and re-scan declarative tools when `[toolname]` attributes are added, removed, or changed.

#### Scenario: Form added dynamically
- **WHEN** JavaScript on the page adds a new `<form toolname="checkout">` to the DOM
- **THEN** the bridge updates its tool list within 200ms
- **AND** sends `notifications/tools/list_changed`

#### Scenario: Form removed
- **WHEN** a declarative tool's form is removed from the DOM
- **THEN** the bridge removes it from the tool list

### Requirement: Imperative tools take precedence
When a tool name is registered both imperatively and declaratively, the bridge SHALL expose only the imperative registration.

#### Scenario: Name collision
- **WHEN** `registerTool("search", ...)` is called imperatively
- **AND** the DOM also has `<form toolname="search">`
- **THEN** the bridge exposes only the imperative `search` tool

### Requirement: Declarative scan is opt-out
The bridge SHALL support disabling the declarative scanner via the `WEBMCP_DECLARATIVE_SCAN` environment variable. When set to `"false"`, no DOM scanning occurs.

#### Scenario: Scan disabled
- **WHEN** `WEBMCP_DECLARATIVE_SCAN=false`
- **THEN** the bridge exposes only imperative tools
- **AND** no MutationObserver is registered

### Requirement: Synthesized tool invocation submits the form
When the MCP client invokes a synthesized declarative tool, the bridge SHALL submit the corresponding form on the page with the provided arguments.

#### Scenario: Invoke declarative tool
- **WHEN** the MCP client invokes the synthesized `search` tool with `{ query: "weather" }`
- **THEN** the bridge fills the form field with the value `weather`
- **AND** submits the form
- **AND** returns a success response

#### Scenario: Form submission fails
- **WHEN** the synthesized tool is invoked but the form's submit handler throws
- **THEN** the bridge returns an MCP error response with the thrown error message

