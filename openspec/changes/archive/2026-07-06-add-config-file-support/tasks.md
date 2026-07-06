## 1. Dependency

- [x] 1.1 Add `js-yaml` to `package.json` dependencies and run `npm install`

## 2. Config Loader

- [x] 2.1 Implement `loadConfig({ argv, env, cwd })` in `server.js` that returns a merged config object
- [x] 2.2 Implement format detection by file extension (`.yaml`/`.yml` → YAML, `.json` → JSON, else error)
- [x] 2.3 Implement CLI arg parsing for `--config <path>` and `--no-headless` (manual, no library)
- [x] 2.4 Implement default config-file discovery (`./webmcp.yaml`, then `./webmcp.json`, then env-only)
- [x] 2.5 Implement layered precedence: defaults → env → file → CLI
- [x] 2.6 Wrap file reads and parses in try/catch; print clear errors with file path on failure

## 3. Wire into Startup

- [x] 3.1 Call `loadConfig()` at the top of `server.js` and use the resulting values instead of `process.env.X` directly
- [x] 3.2 Replace each `process.env.X` read with the merged-config value

## 4. Verification

- [x] 4.1 Run with `--config ./test-webmcp.yaml` and confirm values are loaded
- [x] 4.2 Run with no args (default discovery finds `./webmcp.yaml`) and confirm values loaded
- [x] 4.3 Run with no file present and confirm env vars still work (backward compat)
- [x] 4.4 Pass `--no-headless` over a config file with `headless: true` and confirm CLI wins
- [x] 4.5 Pass malformed YAML and confirm exit code is non-zero with clear error message
- [x] 4.6 Pass malformed JSON and confirm exit code is non-zero with clear error message
- [x] 4.7 Pass unsupported extension (`.toml`) and confirm error

> Bridge startup itself (Chromium launch) deferred to user — requires Chrome 150+ running. The `loadConfig()` loader was verified end-to-end via a temporary smoke-test script: 9/9 cases passed including explicit `--config`, default discovery (yaml+json fallback), env-only backward compat, CLI override of file, malformed YAML/JSON errors, unsupported extension, and missing-file paths. Smoke-test script removed afterward (project has no test suite).

## 5. Documentation

- [x] 5.1 Add `--config` to the README's running section
- [x] 5.2 Document the layered precedence (defaults → env → file → CLI)
- [x] 5.3 Add an example `webmcp.yaml` to the repo (or a snippet in README)