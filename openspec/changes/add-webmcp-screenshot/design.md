## Context

The webmcp-bridge (`server.js`, ~400 lines, ESM) is a single-file MCP server that connects MCP clients to Chrome's WebMCP API. It already exposes 5 bridge-native tools (`webmcp_navigate`, `webmcp_status`, `webmcp_evaluate`, `webmcp_invoke_tool`, `webmcp_register_test_tools`) defined in a `BRIDGE_TOOLS` array. Each entry has `name`, `description`, `inputSchema` (JSON Schema), and a `handler` function that takes `(args, context)` and returns `{ content: [...] }`.

Puppeteer's `page.screenshot()` is already available via the existing `page` instance in the context. The bridge uses `page.screenshot()` nowhere currently. The MCP SDK's `ImageContent` schema (returned in `content` arrays) accepts `{ type: "image", data: "<base64>", mimeType: "image/png" }`.

Adding a screenshot tool is a purely additive change with no architectural impact.

## Goals / Non-Goals

**Goals:**
- Expose a `webmcp_screenshot` MCP tool that returns the current page screenshot.
- Return MCP-compliant `ImageContent` (base64 + mimeType) so any MCP client renders it inline.
- Keep latency low (< 500ms for a default viewport screenshot).
- Support common Puppeteer screenshot options (format, quality, fullPage, clip).

**Non-Goals:**
- Element-targeted screenshots (e.g., screenshot of one button). Puppeteer supports this via `clip`; out of scope to keep the API simple.
- Video recording or animated GIF capture.
- OCR or vision analysis on the returned image — that's the MCP client's job.
- Caching or deduplication of screenshots.

## Decisions

**Decision 1: Return MCP `ImageContent`, not a saved file path.**

Puppeteer can save screenshots to disk (`page.screenshot({ path: '/tmp/x.png' })`) or return buffers. The MCP `ImageContent` schema requires base64-encoded data inline. So we capture to buffer, base64-encode, return as `{ type: "image", data, mimeType }`.

*Alternatives considered:*
- Save to disk + return path: requires MCP client to read files, complicates the protocol, and leaks filesystem paths.
- Save to disk + return URL: would require a static file server, vastly more complex.

**Decision 2: Default to PNG, not JPEG.**

PNG is lossless and supports transparency. MCP clients typically render images inline and benefit from sharper text/UI rendering. JPEG is offered as an option for users who want smaller payloads (e.g., long agent loops).

**Decision 3: Default `fullPage: false`.**

A viewport screenshot is what an MCP client typically wants ("what's on screen now"). `fullPage: true` can produce massive images for tall pages. Default to viewport; expose `fullPage` as opt-in.

**Decision 4: No viewport sizing in the tool args — use Puppeteer's current viewport.**

The bridge already sets a viewport when launching Chrome. The screenshot uses whatever viewport is currently set. If the MCP client wants a different viewport, it can call `page.setViewport()` via `webmcp_evaluate` first (or this could be a future feature).

**Decision 5: Use `omitBackground: false` (default).**

Page background is included. Most pages have backgrounds; transparent screenshots are an edge case.

## Risks / Trade-offs

- **[Large payloads]** → Screenshots can be megabytes. The MCP transport (stdio JSON) base64-encodes them, growing them ~33%. For very large `fullPage` screenshots this could exceed MCP message size limits. → Mitigation: keep the default to viewport-only, document the option, and consider adding a `scale` option in a future change if needed.
- **[Auto-recovery]** → If the page detaches mid-screenshot, the bridge's auto-recovery creates a new page. The screenshot call would fail with a detached-frame error and be retried by the caller. → Mitigation: rely on existing auto-recovery logic; the tool just needs to throw clearly.
- **[CSP blocks canvas readback]** → Some pages with strict CSP might block screenshots via `--disable-features=...` or other mechanisms. → Mitigation: out of scope; Puppeteer's default screenshot bypasses page-level CSP.

## Migration Plan

Purely additive. No rollback needed beyond reverting the `BRIDGE_TOOLS` entry.

## Open Questions

None — the implementation is well-defined.