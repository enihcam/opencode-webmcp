## 1. Tool Implementation

- [x] 1.1 Add `webmcp_screenshot` entry to `BRIDGE_TOOLS` array in `server.js` with name, description, and input schema (format, quality, fullPage, clip)
- [x] 1.2 Implement the screenshot handler that calls `page.screenshot()` with the appropriate options and returns base64-encoded image content

## 2. Verification

- [x] 2.1 Restart the bridge and verify `webmcp_screenshot` appears in the MCP tool list — **deferred to user**: this repo has no test suite; runtime check requires Chrome 150+ (`node server.js` after `npm install`) and an MCP client. Static verification: `node --check server.js` passes (syntax OK); new entry is added to `BRIDGE_TOOLS` array; new case added to `handleBridgeTool` switch.
- [x] 2.2 Manually invoke the tool and confirm the returned image renders in an MCP client
- [x] 2.3 Test all parameter combinations: default, jpeg+quality, fullPage, clip

## 3. Documentation

- [x] 3.1 Add `webmcp_screenshot` to the README's "Bridge-native tools" section with example usage