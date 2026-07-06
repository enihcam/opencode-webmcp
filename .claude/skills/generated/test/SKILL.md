---
name: test
description: "Skill for the Test area of opencode-webmcp. 3 symbols across 1 files."
---

# Test

3 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `test/`
- Understanding how parseCliArgs, readConfigFile, loadConfig work
- Modifying test-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `test/unit.mjs` | parseCliArgs, readConfigFile, loadConfig |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseCliArgs` | Function | `test/unit.mjs` | 30 |
| `readConfigFile` | Function | `test/unit.mjs` | 45 |
| `loadConfig` | Function | `test/unit.mjs` | 57 |

## How to Explore

1. `context({name: "parseCliArgs"})` — see callers and callees
2. `query({query: "test"})` — find related execution flows
3. Read key files listed above for implementation details
