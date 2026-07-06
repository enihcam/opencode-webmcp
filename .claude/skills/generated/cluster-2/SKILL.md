---
name: cluster-2
description: "Skill for the Cluster_2 area of opencode-webmcp. 5 symbols across 1 files."
---

# Cluster_2

5 symbols | 1 files | Cohesion: 50%

## When to Use

- Understanding how makeTabId, attachTabLifecycle, maybeRefreshToolsFromPage work
- Modifying cluster_2-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server.js` | makeTabId, attachTabLifecycle, maybeRefreshToolsFromPage, ensurePage, notifyToolsChanged |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `makeTabId` | Function | `server.js` | 161 |
| `attachTabLifecycle` | Function | `server.js` | 171 |
| `maybeRefreshToolsFromPage` | Function | `server.js` | 465 |
| `ensurePage` | Function | `server.js` | 649 |
| `notifyToolsChanged` | Function | `server.js` | 1133 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `InitBrowser → FindTabIdForPage` | cross_community | 4 |
| `InitBrowser → CssEscape` | cross_community | 4 |
| `EnsurePage → FindTabIdForPage` | cross_community | 4 |
| `EnsurePage → CssEscape` | cross_community | 4 |
| `ExecuteWebMCPTool → NotifyToolsChanged` | cross_community | 4 |
| `HandleBridgeTool → NotifyToolsChanged` | cross_community | 3 |
| `InitBrowser → MakeTabId` | cross_community | 3 |
| `InitBrowser → NotifyToolsChanged` | cross_community | 3 |
| `EnsurePage → MakeTabId` | intra_community | 3 |
| `EnsurePage → NotifyToolsChanged` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_1 | 3 calls |
| Cluster_4 | 1 calls |

## How to Explore

1. `context({name: "makeTabId"})` — see callers and callees
2. `query({query: "cluster_2"})` — find related execution flows
3. Read key files listed above for implementation details
