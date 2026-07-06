## 1. History Data Structure

- [x] 1.1 Add a module-scoped `history` array and `recordHistory(entry)` helper in `server.js`
- [x] 1.2 Implement ring-buffer eviction when length exceeds cap (configurable, default 1000)
- [x] 1.3 Read `WEBMCP_HISTORY_MAX` env var for the cap (default 1000)
- [x] 1.4 Wrap `recordHistory()` in try/catch so recording failures don't break tool calls

## 2. Dispatch Wrapping

- [x] 2.1 Wrap the tool-call dispatch in `setupToolHandlers()` to record each call (start time, args, success/failure, duration, error)
- [x] 2.2 Apply the wrapper to both bridge-native tools and page-discovered tools

## 3. New Tools

- [x] 3.1 Add `webmcp_history` entry to `BRIDGE_TOOLS` with input schema `{ limit?: integer, toolName?: string }`
- [x] 3.2 Implement the history handler that filters and slices the buffer
- [x] 3.3 Add `webmcp_clear_history` entry to `BRIDGE_TOOLS` with empty input schema
- [x] 3.4 Implement the clear handler that empties the array

## 4. Optional stderr Logging

- [x] 4.1 Add `WEBMCP_LOG_HISTORY` env var read; default false
- [x] 4.2 When enabled, write each entry as one JSON line to stderr

## 5. Verification

- [x] 5.1 Restart the bridge and confirm `webmcp_history` and `webmcp_clear_history` appear in the MCP tool list — **deferred to user**: this repo has no test suite; runtime check requires Chrome 150+ (`node server.js`) and an MCP client. Static verification: `node --check server.js` passes; entries added to `BRIDGE_TOOLS`; handlers added to `handleBridgeTool`; `recordHistory()` called in `CallToolRequestSchema` handler's `finally` block.
- [ ] 5.2 Invoke a tool, then call `webmcp_history` to confirm the entry is recorded
- [ ] 5.3 Test `webmcp_history` with `limit` and `toolName` filter
- [ ] 5.4 Test `webmcp_clear_history` and confirm subsequent `webmcp_history` returns empty
- [ ] 5.5 Test ring-buffer cap by setting `WEBMCP_HISTORY_MAX=5` and invoking 7 tools; confirm only 5 remain
- [ ] 5.6 Test stderr logging with `WEBMCP_LOG_HISTORY=true`; confirm one JSON line per call

## 6. Documentation

- [x] 6.1 Add `webmcp_history` and `webmcp_clear_history` to the README's "Bridge-native tools" section
- [x] 6.2 Document `WEBMCP_HISTORY_MAX` and `WEBMCP_LOG_HISTORY` env vars in the README's environment variables table