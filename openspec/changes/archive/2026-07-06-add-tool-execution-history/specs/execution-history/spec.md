# execution-history

A persistent record of tool invocations handled by the bridge. Bounded in-memory ring buffer. Read via `webmcp_history`, cleared via `webmcp_clear_history`.

## ADDED Requirements

### Requirement: History records every tool invocation
The bridge SHALL record every tool invocation (bridge-native and page-discovered) to an in-memory ring buffer after the handler resolves.

#### Scenario: Bridge-native tool succeeds
- **WHEN** the MCP client invokes `webmcp_navigate` with `{ url: "https://example.com" }` and the handler returns successfully
- **THEN** the bridge appends a history entry with: timestamp, toolName "webmcp_navigate", arguments, success true, durationMs, error null

#### Scenario: Bridge-native tool fails
- **WHEN** the MCP client invokes `webmcp_invoke_tool` with a non-existent tool name
- **THEN** the bridge appends a history entry with: success false, error message, durationMs

#### Scenario: Page-discovered tool invoked
- **WHEN** the MCP client invokes a tool registered via `document.modelContext.registerTool` on the page
- **THEN** the bridge appends a history entry with the page-registered tool's name

### Requirement: Ring buffer is bounded
The bridge SHALL cap the ring buffer at a configurable maximum (default 1000 entries). When the cap is reached, the oldest entry SHALL be evicted.

#### Scenario: Buffer reaches cap
- **WHEN** the bridge has 1000 entries and a new tool invocation completes
- **THEN** the bridge appends the new entry
- **AND** removes the oldest entry to maintain the cap

### Requirement: Optional stderr JSON-line logging
The bridge SHALL write each history entry as a single line of JSON to stderr when the `WEBMCP_LOG_HISTORY` environment variable is set to `"true"`.

#### Scenario: Stderr logging disabled
- **WHEN** `WEBMCP_LOG_HISTORY` is unset or not `"true"`
- **THEN** the bridge does not write history entries to stderr

#### Scenario: Stderr logging enabled
- **WHEN** `WEBMCP_LOG_HISTORY=true` and a tool invocation completes
- **THEN** the bridge writes one line of JSON to stderr containing the same fields as the in-memory entry

### Requirement: History recording is non-blocking
The bridge SHALL catch and ignore any errors raised by the recording logic so that a history-write failure never breaks a tool invocation.

#### Scenario: Recording throws
- **WHEN** the history-recording code throws an exception
- **THEN** the bridge swallows the exception
- **AND** returns the tool's actual result to the MCP client unchanged