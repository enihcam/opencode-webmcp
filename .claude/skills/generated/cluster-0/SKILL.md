---
name: cluster-0
description: "Skill for the Cluster_0 area of opencode-webmcp. 3 symbols across 1 files."
---

# Cluster_0

3 symbols | 1 files | Cohesion: 50%

## When to Use

- Understanding how initBrowser, refreshTools, notifyToolsChanged work
- Modifying cluster_0-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server.js` | initBrowser, refreshTools, notifyToolsChanged |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `initBrowser` | Function | `server.js` | 23 |
| `refreshTools` | Function | `server.js` | 65 |
| `notifyToolsChanged` | Function | `server.js` | 352 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleBridgeTool → RefreshTools` | cross_community | 3 |
| `HandleBridgeTool → NotifyToolsChanged` | cross_community | 3 |
| `ExecuteWebMCPTool → RefreshTools` | cross_community | 3 |
| `ExecuteWebMCPTool → NotifyToolsChanged` | cross_community | 3 |

## How to Explore

1. `context({name: "initBrowser"})` — see callers and callees
2. `query({query: "cluster_0"})` — find related execution flows
3. Read key files listed above for implementation details
