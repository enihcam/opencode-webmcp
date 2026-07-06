---
name: cluster-3
description: "Skill for the Cluster_3 area of opencode-webmcp. 5 symbols across 1 files."
---

# Cluster_3

5 symbols | 1 files | Cohesion: 53%

## When to Use

- Understanding how setActiveTab, resolveTabPage, clearHistory work
- Modifying cluster_3-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server.js` | setActiveTab, resolveTabPage, clearHistory, checkWebMCP, handleBridgeTool |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `setActiveTab` | Function | `server.js` | 210 |
| `resolveTabPage` | Function | `server.js` | 224 |
| `clearHistory` | Function | `server.js` | 303 |
| `checkWebMCP` | Function | `server.js` | 340 |
| `handleBridgeTool` | Function | `server.js` | 717 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleBridgeTool → FindTabIdForPage` | cross_community | 4 |
| `HandleBridgeTool → CssEscape` | cross_community | 4 |
| `HandleBridgeTool → NotifyToolsChanged` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_1 | 3 calls |
| Cluster_4 | 2 calls |
| Cluster_2 | 2 calls |

## How to Explore

1. `context({name: "setActiveTab"})` — see callers and callees
2. `query({query: "cluster_3"})` — find related execution flows
3. Read key files listed above for implementation details
