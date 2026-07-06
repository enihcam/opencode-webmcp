## Context

The webmcp-bridge (`server.js`, ~400 lines, ESM) currently reads config via `process.env.X` calls near the top of the file. There are 3 env vars today: `CHROME_PATH`, `WEBMCP_TARGET_URL`, `WEBMCP_HEADLESS`. Node's `process.argv` is unused (no CLI parsing).

Node 18+ ships with a built-in `--experimental-config` flag for some modes, but for a user-facing config file we need our own loader. Adding `js-yaml` is the standard approach; it's tiny (~10 KB) and has zero transitive deps.

## Goals / Non-Goals

**Goals:**
- Accept `--config <path>` CLI flag pointing to a YAML or JSON file.
- Layer config sources: defaults → env vars → config file → CLI args (highest priority).
- Support the existing 3 env vars plus any future config keys without code changes.
- Helpful errors when the file is missing or malformed.

**Non-Goals:**
- Hot-reload of config (file watching). Bridge restart required.
- Multiple config files (e.g., base + override). One file.
- Schema validation beyond what JSON Schema / YAML can express at parse time.
- Remote config (HTTP URL, vault, etc.).

## Decisions

**Decision 1: YAML + JSON, no TOML/INI/etc.**

YAML is the dominant config format in the Node/JS ecosystem (eslint, prettier, github actions, k8s). JSON is the universal fallback. Both can be added with one dep (`js-yaml`) and Node's built-in parser.

*Alternatives considered:*
- TOML: gaining popularity but no Node built-in parser; would need `@iarna/toml`.
- INI: legacy, no real advantage over YAML for our use case.
- Only JSON: forces users to write nested keys without comments.

**Decision 2: Detect format by file extension.**

`.yaml`/`.yml` → parse with `js-yaml`. `.json` → parse with `JSON.parse`. Unknown extension → error.

**Decision 3: CLI args parsed manually, not with a library.**

Only 1-2 flags (`--config`). No need for `commander`, `yargs`, or `minimist`. Manual parsing keeps the dep footprint small.

**Decision 4: Layering: defaults → env → file → CLI.**

Standard precedence. CLI overrides everything (e.g., `node server.js --config ./x.yaml` then later `--headless=false` overrides the file's value). Env vars are a fallback for users who haven't adopted the file yet.

**Decision 5: `js-yaml` as a runtime dep.**

It's tiny, well-maintained, and the standard YAML parser in the Node ecosystem. No alternatives worth considering.

## Risks / Trade-offs

- **[New dependency]** → `js-yaml` adds ~10 KB and one `package.json` entry. → Mitigation: negligible.
- **[YAML security]** → YAML parsers can be vectors for prototype-pollution or arbitrary code execution. → Mitigation: use `js-yaml`'s `safeLoad` / `load` (not `loadAll`, not `unsafeLoad`). Reject YAML tags.
- **[Migration friction]** → Users with env-var setups must keep env vars working. → Mitigation: env vars remain supported; file is opt-in.
- **[Error messages]** → Malformed YAML errors can be cryptic. → Mitigation: catch parse errors, print file path + line number.

## Migration Plan

- Users on env-var-only setups: no action needed.
- Users who want a config file: create `webmcp.yaml`, pass `--config`.
- Rollback: remove `--config` flag and the loader code.

## Open Questions

- Should `--config` accept `stdin` (i.e., `-`)? Useful for `cat webmcp.yaml | node server.js --config -`? Out of scope for v1; can add later.
- Should we support a default config path (e.g., `./webmcp.yaml` if present)? Yes — proposed: check `--config`, then `./webmcp.yaml`, then `./webmcp.json`, then env-only.