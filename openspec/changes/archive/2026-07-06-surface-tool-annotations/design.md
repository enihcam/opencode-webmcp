## Context

The webmcp-bridge (`server.js`, ~400 lines, ESM) calls `McpServer.tool(name, description, schema, handler)` to register every tool. The `@modelcontextprotocol/sdk` version 1.x supports passing annotations as a 5th argument or as a property of the tool descriptor.

The MCP spec (2025-06-18) defines these annotations:
- `title`: human-readable label
- `readOnlyHint`: tool doesn't modify state
- `destructiveHint`: tool modifies state irreversibly
- `idempotentHint`: calling with same args multiple times has same effect
- `openWorldHint`: tool interacts with external/untrusted systems

The existing `webmcp_register_test_tools` handler sets annotations on its test tools (`readOnlyHint: true`). But:
1. Bridge-native tools (`webmcp_navigate`, etc.) have NO annotations.
2. Page-discovered tools have their `annotations` set on the page side but the bridge doesn't forward them.

## Goals / Non-Goals

**Goals:**
- Forward page-discovered tool annotations to MCP clients.
- Annotate bridge-native tools with sensible defaults.
- Add `title` for human-readable display where useful.
- Zero behavior change for clients that ignore annotations.

**Non-Goals:**
- Infer annotations from tool name or behavior (no heuristic guesses).
- Override page-supplied annotations (page wins).
- Add new annotation fields beyond the MCP spec.

## Decisions

**Decision 1: Page annotations take precedence.**

When the page calls `registerTool(name, { annotations })`, the bridge forwards those. The bridge never overrides. This respects page intent.

**Decision 2: Default annotations for bridge-native tools:**

| Tool | readOnlyHint | destructiveHint | openWorldHint |
|------|---|---|---|
| `webmcp_navigate` | false | false (navigates but is reversible via another navigate) | true |
| `webmcp_status` | true | false | false |
| `webmcp_evaluate` | false | true (can mutate DOM/page state) | true |
| `webmcp_invoke_tool` | (page-determined) | (page-determined) | (page-determined) |
| `webmcp_screenshot` | true | false | false |
| `webmcp_register_test_tools` | false | false | false |

`webmcp_invoke_tool` is a passthrough; its annotations depend on the page tool it invokes. We leave it unannotated (MCP clients should treat it as unknown).

**Decision 3: Use SDK's `annotations` parameter.**

The `@modelcontextprotocol/sdk` accepts annotations via the tool registration call. Read the SDK version's API (currently 1.x) and use the supported signature. If the SDK lacks an annotations argument, set `annotations` on the tool descriptor directly.

**Decision 4: Add `title` only where it improves UX.**

Examples: `webmcp_navigate` → "Navigate to URL"; `webmcp_status` → "Get bridge status". Skip `title` for tools where the name is already clear.

## Risks / Trade-offs

- **[Annotation accuracy]** → The bridge's defaults are guesses. A tool marked `readOnlyHint: true` that actually modifies state would mislead clients. → Mitigation: prefer `openWorldHint: true` for tools with unclear semantics; clients must not treat `readOnlyHint` as a hard guarantee (per MCP spec, hints are advisory).
- **[SDK version drift]** → The annotations API may change between SDK versions. → Mitigation: pin the SDK version in `package.json`; document the minimum version.
- **[Backward compatibility]** → Adding `annotations` is purely additive in MCP. Old clients see the same tool descriptors; new clients see annotations.

## Migration Plan

- No migration needed.
- Rollback: remove the `annotations` fields from the bridge's tool descriptors and stop forwarding page annotations.

## Open Questions

- Should `webmcp_invoke_tool` propagate annotations from the invoked tool? Could expose inner tools' hints to the MCP client. Out of scope for v1; complex and could leak info.