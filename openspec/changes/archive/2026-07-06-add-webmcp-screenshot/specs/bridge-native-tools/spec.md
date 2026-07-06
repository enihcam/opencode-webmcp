# bridge-native-tools

Tools provided by the webmcp-bridge itself, independent of any WebMCP-enabled page. Always available as long as the bridge is running.

## ADDED Requirements

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