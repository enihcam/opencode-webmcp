# webmcp-bridge

Single-file MCP server that bridges MCP clients (OpenCode, Claude Code) to
Chromium's WebMCP API. Connects via Puppeteer + CDP, discovers tools registered
via `document.modelContext` on the page, and exposes them as MCP tools.

## Key facts

- **Entry point**: `server.js` (ESM, Node 18+, ~400 lines)
- **Deps**: `@modelcontextprotocol/sdk` + `puppeteer-core`
- **No build step, no test suite, no linter, no typecheck, no npm scripts**
- **Only runtime verification**: `node server.js` (needs Chrome 150+)

## Chrome requirement

`puppeteer-core` — no bundled browser. Must have system Chrome/Chromium 150+.
Set `CHROME_PATH` (default `/usr/bin/chromium`).
WebMCP gated behind `--enable-features=WebMCPTesting,DevToolsWebMCPSupport`.

## Running

```bash
CHROME_PATH=/usr/bin/chromium WEBMCP_TARGET_URL="about:blank" WEBMCP_HEADLESS=false node server.js
```

| Env var | Default | Notes |
|---|---|---|
| `CHROME_PATH` | `/usr/bin/chromium` | Path to Chrome/Chromium 150+ |
| `WEBMCP_TARGET_URL` | `https://www.google.com` | Initial page to navigate to |
| `WEBMCP_HEADLESS` | `true` | `false` for visible window |

`--no-sandbox` is always set; `--ozone-platform=wayland` added when not headless.

## Architecture

- **Single file, no build** — edit `server.js`, restart to apply changes.
- **5 bridge-native tools**: `webmcp_navigate`, `webmcp_status`, `webmcp_evaluate`, `webmcp_invoke_tool`, `webmcp_register_test_tools` — always available.
- **Page-discovered WebMCP tools** served alongside bridge tools.
- **Monkey-patch** (`evaluateOnNewDocument`): Chrome 150+ has a bug where `page.webmcp.invokeTool()` returns `{}`. The bridge intercepts `document.modelContext.registerTool` to capture each tool's `execute` function, then replaces `executeTool` to call captured functions directly.
- **Auto-recovery**: detached-frame errors re-create the page automatically. Bridge-native tools retry; page-discovered tool calls re-throw with a retry instruction.
- **`notifications/tools/list_changed`** sent on navigation and tool registration changes.

## Pitfalls

- **No tools discovered** → the page hasn't called `registerTool()`. Use `webmcp_evaluate` with `document.modelContext.getTools()` to inspect, or navigate to a WebMCP-enabled page.
- **Detached Frame** → auto-recovery creates a new page, but the tool call must be retried.
- **`test_fetch_title` fails** → page CSP blocks `fetch()`. Use a permissive origin.

## Openspec workflow

This repo uses the openspec change proposal workflow. Skills are in `.opencode/skills/openspec-*` and `.claude/skills/openspec-*`. Commands: `opsx-propose`, `opsx-explore`, `opsx-apply`, `opsx-archive`. Changes live under `openspec/`.

## OpenCode integration

Reference `README.md` for the `opencode.json` MCP server config snippet. No `opencode.json` at repo root — integration is done in the consuming project.

## Agent skills

### Issue tracker

GitHub Issues (`enihcam/opencode-webmcp`). See `docs/agents/issue-tracker.md`.

### Triage labels

needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one CONTEXT.md + docs/adr/ at repo root. See `docs/agents/domain.md`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **opencode-webmcp** (552 symbols, 690 relationships, 17 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/opencode-webmcp/context` | Codebase overview, check index freshness |
| `gitnexus://repo/opencode-webmcp/clusters` | All functional areas |
| `gitnexus://repo/opencode-webmcp/processes` | All execution flows |
| `gitnexus://repo/opencode-webmcp/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Cluster_1 area (6 symbols) | `.claude/skills/generated/cluster-1/SKILL.md` |
| Work in the Cluster_2 area (5 symbols) | `.claude/skills/generated/cluster-2/SKILL.md` |
| Work in the Cluster_3 area (5 symbols) | `.claude/skills/generated/cluster-3/SKILL.md` |
| Work in the Cluster_4 area (4 symbols) | `.claude/skills/generated/cluster-4/SKILL.md` |
| Work in the Cluster_0 area (3 symbols) | `.claude/skills/generated/cluster-0/SKILL.md` |
| Work in the Test area (3 symbols) | `.claude/skills/generated/test/SKILL.md` |

<!-- gitnexus:end -->
