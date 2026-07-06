---
name: cluster-4
description: "Skill for the Cluster_4 area of opencode-webmcp. 4 symbols across 1 files."
---

# Cluster_4

4 symbols | 1 files | Cohesion: 57%

## When to Use

- Understanding how recoverTabPage, executeWebMCPTool, executeDeclarativeTool work
- Modifying cluster_4-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server.js` | recoverTabPage, executeWebMCPTool, executeDeclarativeTool, escapeAttr |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `recoverTabPage` | Function | `server.js` | 239 |
| `executeWebMCPTool` | Function | `server.js` | 1036 |
| `executeDeclarativeTool` | Function | `server.js` | 1076 |
| `escapeAttr` | Function | `server.js` | 1081 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ExecuteWebMCPTool → FindTabIdForPage` | cross_community | 5 |
| `ExecuteWebMCPTool → CssEscape` | cross_community | 5 |
| `HandleBridgeTool → FindTabIdForPage` | cross_community | 4 |
| `HandleBridgeTool → CssEscape` | cross_community | 4 |
| `ExecuteWebMCPTool → NotifyToolsChanged` | cross_community | 4 |
| `HandleBridgeTool → NotifyToolsChanged` | cross_community | 3 |
| `ExecuteWebMCPTool → EscapeAttr` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_1 | 2 calls |
| Cluster_2 | 1 calls |

## How to Explore

1. `context({name: "recoverTabPage"})` — see callers and callees
2. `query({query: "cluster_4"})` — find related execution flows
3. Read key files listed above for implementation details
