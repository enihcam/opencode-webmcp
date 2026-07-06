---
name: cluster-1
description: "Skill for the Cluster_1 area of opencode-webmcp. 6 symbols across 1 files."
---

# Cluster_1

6 symbols | 1 files | Cohesion: 57%

## When to Use

- Understanding how activeCachedTools, initBrowser, refreshTools work
- Modifying cluster_1-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server.js` | activeCachedTools, initBrowser, refreshTools, findTabIdForPage, scanDeclarativeTools (+1) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `activeCachedTools` | Function | `server.js` | 149 |
| `initBrowser` | Function | `server.js` | 311 |
| `refreshTools` | Function | `server.js` | 344 |
| `findTabIdForPage` | Function | `server.js` | 389 |
| `scanDeclarativeTools` | Function | `server.js` | 401 |
| `cssEscape` | Function | `server.js` | 410 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ExecuteWebMCPTool → FindTabIdForPage` | cross_community | 5 |
| `ExecuteWebMCPTool → CssEscape` | cross_community | 5 |
| `HandleBridgeTool → FindTabIdForPage` | cross_community | 4 |
| `HandleBridgeTool → CssEscape` | cross_community | 4 |
| `InitBrowser → FindTabIdForPage` | cross_community | 4 |
| `InitBrowser → CssEscape` | cross_community | 4 |
| `EnsurePage → FindTabIdForPage` | cross_community | 4 |
| `EnsurePage → CssEscape` | cross_community | 4 |
| `InitBrowser → MakeTabId` | cross_community | 3 |
| `InitBrowser → NotifyToolsChanged` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_2 | 1 calls |

## How to Explore

1. `context({name: "activeCachedTools"})` — see callers and callees
2. `query({query: "cluster_1"})` — find related execution flows
3. Read key files listed above for implementation details
