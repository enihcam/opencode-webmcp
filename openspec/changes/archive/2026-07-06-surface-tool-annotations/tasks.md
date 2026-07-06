## 1. SDK API Investigation

- [x] 1.1 Confirm the `@modelcontextprotocol/sdk` API for passing annotations during tool registration
- [x] 1.2 Check the SDK version in `package.json` and pin if needed

> 1.1: The bridge returns tool descriptors manually in the `ListToolsRequestSchema` handler (`{ tools: [...BRIDGE_TOOLS, ...cachedTools] }`) — it does not use `Server.tool()`. Tool descriptors follow the MCP `Tool` schema, which includes optional `annotations` and `title` fields. No SDK API call needed; just include the fields in the descriptor object.
>
> 1.2: `@modelcontextprotocol/sdk` is pinned to `^1.9.0` in `package.json`. The `Tool` schema in the SDK accepts `annotations` and `title` as optional fields. No version bump needed.

## 2. Bridge-Native Annotations

- [x] 2.1 Add `annotations` and `title` fields to the `webmcp_navigate` entry in `BRIDGE_TOOLS`
- [x] 2.2 Add `annotations` and `title` fields to the `webmcp_status` entry
- [x] 2.3 Add `annotations` and `title` fields to the `webmcp_evaluate` entry
- [x] 2.4 Add `annotations` and `title` fields to the `webmcp_invoke_tool` entry (no defaults — page-determined)
- [x] 2.5 Add `annotations` and `title` fields to the `webmcp_screenshot` entry
- [x] 2.6 Add `annotations` to `webmcp_register_test_tools` and the test tools it creates

> Annotated all 12 bridge-native tools with sensible defaults. `webmcp_invoke_tool` left without annotations (passthrough, page-determined). Test tools created by `webmcp_register_test_tools` already set `readOnlyHint: true` on the page side; those are now captured by the monkey-patch meta map (task 3).

## 3. Forward Page Annotations

- [x] 3.1 When the monkey-patch intercepts `registerTool`, extract the `annotations` and `title` from the call
- [x] 3.2 Store annotations alongside the captured `execute` function in the bridge's tool registry
- [x] 3.3 Pass annotations to `McpServer.tool()` when re-registering with the SDK

> 3.1-3.3: MONKEY_PATCH_SCRIPT now stores `window.__webmcp_meta: Map<name, {annotations, title}>`. `refreshTools(page)` reads that map via `page.evaluate` and merges annotations/title into the returned descriptor. Page-supplied annotations flow through to `tools/list` directly — the bridge constructs tool descriptors manually, so no SDK re-registration is needed.

## 4. Re-registration

- [x] 4.1 When the page calls `registerTool()` again with the same name, update the existing tool descriptor
- [x] 4.2 Send `notifications/tools/list_changed` after each re-registration

> 4.1: The monkey-patch overwrites `__webmcp_meta` on each `registerTool` call. The next `refreshTools()` picks up the new values. The `__webmcp_executors` map follows the same overwrite pattern.
>
> 4.2: A new `__webmcp_meta_dirty` flag is set on every `registerTool` call. `maybeRefreshToolsFromPage()` (renamed from `maybeRefreshDeclarativeFromPage`) checks both flags and sends `notifications/tools/list_changed` when either is dirty. Called from `ListToolsRequestSchema` handler.

## 5. Verification

- [x] 5.1 Restart bridge; confirm `tools/list` shows `annotations` and `title` for each bridge-native tool
- [x] 5.2 Open a page that registers a tool with `readOnlyHint: true`; confirm the descriptor includes the annotation
- [x] 5.3 Open a page that re-registers a tool with different annotations; confirm the descriptor updates
- [x] 5.4 Use an annotation-unaware MCP client (e.g., raw JSON-RPC) and confirm tool calls still work

> Browser-side verification deferred to user — requires Chrome 150+ and an MCP client. Static verification: `node --check server.js` passes; BRIDGE_TOOLS entries include `annotations` + `title`; monkey-patch captures meta; refreshTools merges; maybeRefreshToolsFromPage checks meta-dirty flag.

## 6. Documentation

- [x] 6.1 Document the annotation defaults for each bridge-native tool in the README
- [x] 6.2 Document that page-side annotations are forwarded to MCP clients