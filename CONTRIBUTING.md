# Contributing

Thanks for your interest in webmcp-bridge!

## Project structure

- **`server.js`** — Single-file ESM MCP server (~1200 lines). All bridge logic lives here.
- **`test/unit.mjs`** — Pure-function tests (no Chrome needed). Run with `node test/unit.mjs`.
- **`examples/`** — Example pages for testing the declarative WebMCP API.
- **`openspec/`** — Change proposals, designs, specs, and task tracking.

## Getting started

```bash
node test/unit.mjs              # run unit tests
node --check server.js          # syntax check
```

To test with a real browser, you need Chrome 150+ with WebMCP enabled. See `README.md` for details.

## Making changes

1. Open an issue or start a discussion before significant work.
2. Run the existing tests and ensure they pass.
3. Follow the existing code style (no linter or formatter is configured — match the surrounding code).
4. Add or update tests under `test/` for any pure functions you add.
5. Verify with `node --check server.js`.

## Commit conventions

Use clear, descriptive commit messages. Conventional Commits is preferred but not required:
- `feat: add ...`
- `fix: correct ...`
- `docs: update ...`
- `test: add ...`

## Opening a PR

- Keep changes focused — one feature/fix per PR.
- Reference any related issues.
- Ensure `node test/unit.mjs` passes.
- Mark as draft if still in progress.
