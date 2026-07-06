# ADR-0001: MCP Bridge Architecture

**Status:** Accepted  
**Date:** 2026-07-06  
**Deciders:** enihcam  

## Context

The webmcp-bridge project needs a lightweight MCP server that exposes Chrome WebMCP tools to any MCP client (OpenCode, Claude Code). The design must favour simplicity, debuggability, and zero-friction iteration over abstraction or framework adoption.

## Decision

### 1. Single-file implementation with minimal extraction

Keep the core logic in `server.js` as a single ES module. Extract only when a concern is (a) purely data-driven and (b) independently testable without Chrome. Currently `lib/config.mjs` is the only extraction — it holds defaults, CLI/env/file config parsing, and the bridge-native tool definitions.

Rationale: A single file is trivially editable, diffable, and deployable. The project has no build step; a file rename or split is a git mv + one import. Premature extraction creates indirection without proven payoff.

### 2. Bridge-native tools via dispatch table, not switch

Tool dispatch uses an object map (`BRIDGE_HANDLERS`) rather than a switch statement. Each tool handler is a named `async function handleXxx(args)` with a consistent signature. Shared response helpers (`ok`, `err`) and a `refreshTabTools` middleware eliminate duplicated boilerplate.

Rationale: A switch with 12+ cases is a single indentation level deeper than a map, harder to grep, and conflates dispatch logic with handler logic. Named functions appear in stack traces and are independently testable.

### 3. Page-discovered tools are merged with bridge-native tools

The `ListToolsRequestSchema` handler returns `[...BRIDGE_TOOLS, ...cachedTools]`. Bridge-native tools always take priority — if a page registers a tool with the same name as a bridge tool, the bridge tool wins.

Rationale: Clients see a unified tool list. The bridge owns the namespace for its native tools (prefixed `webmcp_`), and page tools occupy the rest. No collision resolution is needed because the prefix convention is enforced.

### 4. Monkey-patch for Chrome WebMCP bug

Chrome 150+ has a bug where `page.webmcp.invokeTool()` returns `{}`. The bridge injects a script via `evaluateOnNewDocument` that intercepts `document.modelContext.registerTool` to capture each tool's `execute` function, then replaces `executeTool` to call captured functions directly.

Rationale: The bug is in upstream Chrome with no fix timeline. The monkey-patch is self-contained in one function (`MONKEY_PATCH_SCRIPT`) and runs only when `document.modelContext` becomes available. It also captures annotation/title metadata that Chrome's native `page.webmcp.tools()` omits.

### 5. Declarative tools via DOM scanning

HTML elements with a `toolname` attribute are synthesised into MCP tool descriptors. Child fields with `[name][toolname-target]` become input schema properties. A MutationObserver detects DOM changes and flags them for re-scan.

Rationale: This allows non-JS pages (static HTML, server-rendered) to participate in WebMCP without client-side scripts. Scanning is opt-in via the `declarativeScan` config flag.

### 6. Tab management with auto-recovery

Each Chrome tab is tracked by UUID (`tabId`). Lifecycle events (close, frame navigation, console errors) are wired on creation. If a frame detaches, `recoverTabPage` creates a fresh Puppeteer page, re-attaches handlers, assigns the same `tabId`, and preserves the cache.

Rationale: Detached frames are a known Puppeteer failure mode in multi-tab scenarios. Auto-recovery makes them transparent to the MCP client except for a one-retry error message.

### 7. Layered config (defaults → env → file → CLI)

Config merges in four layers with increasing priority: built-in defaults, environment variables, YAML/JSON config file, and CLI flags. The file path is either explicit (`--config`) or auto-discovered (`webmcp.yaml`/`webmcp.yml`/`webmcp.json` in CWD).

Rationale: The layered pattern follows established convention (cf. 12-factor apps). It lets users set a base config file for their project and override per-invocation via env or CLI without editing files.

### 8. Ring buffer for tool history

Tool invocations are stored in a fixed-size in-memory array (`history`, default 1000). The `webmcp_history` tool returns recent entries; `webmcp_clear_history` empties the buffer. Optionally logs each entry as a JSON line to stderr.

Rationale: In-memory is zero-latency and needs no I/O. The ring buffer has a bounded memory footprint regardless of session length. Stderr logging provides an out-of-band audit trail for production debugging.

## Consequences

- Zero build step, zero framework overhead, zero configuration to run
- All state is in-memory — a process restart loses tabs, caches, and history
- Single-file core makes code review easy but the file is ~900 lines
- Chrome 150+ is a hard requirement (WebMCP feature flag + monkey-patch target)
- No hot-reload: any config change needs a restart
