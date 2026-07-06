## 1. DOM Scanner

- [x] 1.1 Implement `scanDeclarativeTools(page)` that returns an array of synthesized tool descriptors
- [x] 1.2 Use `page.evaluate(() => Array.from(document.querySelectorAll('[toolname]')).map(...))` to extract forms
- [x] 1.3 Synthesize an input schema from fields with `name` and `toolname-target` attributes
- [x] 1.4 Generate tool name from the `toolname` attribute value

## 2. Tool Registration

- [x] 2.1 On every navigation, call `scanDeclarativeTools()` after the existing imperative-tool discovery
- [x] 2.2 Register each synthesized tool via `McpServer.tool()` with a handler that submits the form
- [x] 2.3 Deduplicate against imperative tools (imperative wins)
- [x] 2.4 Send `notifications/tools/list_changed` after registration

## 3. MutationObserver

- [x] 3.1 Inject a `MutationObserver` via `evaluateOnNewDocument` that watches for `[toolname]` attribute changes
- [x] 3.2 Debounce re-scans (100ms)
- [x] 3.3 Forward change events to the bridge's tool-list refresh logic

## 4. Opt-Out Flag

- [x] 4.1 Read `WEBMCP_DECLARATIVE_SCAN` env var; default `true`
- [x] 4.2 When `false`, skip DOM scan and MutationObserver wiring entirely

## 5. Verification

- [ ] 5.1 Open a page with `<form toolname="x">` and confirm `tools/list` includes `x`
- [ ] 5.2 Open a page with no declarative tools and confirm no synthetic tools appear
- [ ] 5.3 Open a page where JS dynamically adds a form and confirm the tool appears after a short delay
- [ ] 5.4 Invoke a synthesized tool and confirm the form submits with the right values
- [ ] 5.5 Test name collision: imperative tool wins
- [ ] 5.6 Set `WEBMCP_DECLARATIVE_SCAN=false` and confirm no synthetic tools on a declarative page

> Browser-side verification deferred to user — requires Chrome 150+ and a WebMCP-enabled target page. The config-flag plumbing (4.1-4.2) was verified via a 5-case env-parsing smoke test (`unset → true`, `"false" → false`, `"true" → true`, empty-string edge, config-file layer override). All 5 cases passed; smoke-test file removed afterward.

## 6. Documentation

- [x] 6.1 Document the declarative-API support in README
- [x] 6.2 Document `WEBMCP_DECLARATIVE_SCAN` env var
- [x] 6.3 Add a sample declarative page to `examples/` (or document an existing one)