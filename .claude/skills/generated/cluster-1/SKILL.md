---
name: cluster-1
description: "Skill for the Cluster_1 area of opencode-webmcp. 4 symbols across 1 files."
---

# Cluster_1

4 symbols | 1 files | Cohesion: 67%

## When to Use

- Understanding how checkWebMCP, ensurePage, handleBridgeTool work
- Modifying cluster_1-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `server.js` | checkWebMCP, ensurePage, handleBridgeTool, executeWebMCPTool |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `checkWebMCP` | Function | `server.js` | 61 |
| `ensurePage` | Function | `server.js` | 128 |
| `handleBridgeTool` | Function | `server.js` | 171 |
| `executeWebMCPTool` | Function | `server.js` | 312 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleBridgeTool → RefreshTools` | cross_community | 3 |
| `HandleBridgeTool → NotifyToolsChanged` | cross_community | 3 |
| `ExecuteWebMCPTool → RefreshTools` | cross_community | 3 |
| `ExecuteWebMCPTool → NotifyToolsChanged` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_0 | 4 calls |

## How to Explore

1. `context({name: "checkWebMCP"})` — see callers and callees
2. `query({query: "cluster_1"})` — find related execution flows
3. Read key files listed above for implementation details
