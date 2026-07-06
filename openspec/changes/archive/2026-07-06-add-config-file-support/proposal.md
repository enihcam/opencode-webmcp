## Why

The webmcp-bridge currently accepts configuration only via environment variables (`CHROME_PATH`, `WEBMCP_TARGET_URL`, `WEBMCP_HEADLESS`). Env vars work for single-process setups but are awkward for:

- Teams that want to share configuration across machines (env files are per-shell).
- Operators who need comments, defaults, and structured config (env vars are flat).
- Tools like `docker-compose`, systemd, or k8s that can mount config files more cleanly than injecting env.

YAML or JSON config files are the de-facto standard for application configuration. Most MCP servers accept both env and a config file. We should too.

## What Changes

- The bridge SHALL accept a `--config <path>` CLI argument pointing to a YAML or JSON file.
- If `--config` is omitted, the bridge SHALL fall back to env vars (backward compatible).
- Config file keys map to the same names as the current env vars (`chromePath`, `targetUrl`, `headless`) plus any future config (e.g., `historyMax`).
- YAML parsing requires a new dep (`js-yaml`). JSON uses Node's built-in `JSON.parse`. Detect by extension.
- CLI args take precedence over config file, which take precedence over env vars.

## Capabilities

### New Capabilities
- `configuration`: External configuration via YAML/JSON file, layered with env vars and CLI args.

### Modified Capabilities
<!-- None. Existing capabilities unchanged. -->

## Impact

- **Code**: `server.js` — add a `loadConfig(path)` function, parse argv, build the effective config. ~30-50 lines.
- **Dependencies**: Add `js-yaml` (~10 KB). JSON uses Node built-ins.
- **APIs**: New CLI flag `--config`. No MCP API changes.
- **Backwards compatibility**: Fully compatible. Existing env-var users see no behavior change.
- **Documentation**: Add `--config` to README running section.