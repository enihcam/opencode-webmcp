# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — describes the project, domain terminology, architecture at a glance, key invariants, and dependency/toolchain info.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-mcp-bridge-architecture.md
├── docs/agents/
│   ├── AGENT-BRIEF.md
│   ├── domain.md
│   ├── issue-tracker.md
│   └── triage-labels.md
├── lib/
│   └── config.mjs
├── server.js
└── test/
    └── unit.mjs
```

No `CONTEXT-MAP.md` — this is a single-module project.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Key terms: MCP, WebMCP, bridge-native tool, page-discovered tool, declarative tool, imperative tool, monkey-patch, dispatch table, tab, ring buffer.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (section 6 — tab management auto-recovery) — but worth reopening because…_
