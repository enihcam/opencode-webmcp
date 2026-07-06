# configuration Specification

## Purpose
TBD - created by archiving change add-config-file-support. Update Purpose after archive.
## Requirements
### Requirement: Bridge accepts --config CLI flag
The bridge SHALL accept a `--config <path>` CLI flag pointing to a YAML or JSON configuration file.

#### Scenario: Explicit config path
- **WHEN** the operator runs `node server.js --config ./webmcp.yaml`
- **THEN** the bridge loads `./webmcp.yaml` and merges its keys into the configuration

#### Scenario: Default config discovery
- **WHEN** the operator runs `node server.js` with no `--config` flag
- **AND** `./webmcp.yaml` exists in the current working directory
- **THEN** the bridge loads `./webmcp.yaml`

#### Scenario: Default config discovery falls back to JSON
- **WHEN** the operator runs `node server.js` with no `--config` flag
- **AND** `./webmcp.yaml` does not exist
- **AND** `./webmcp.json` exists
- **THEN** the bridge loads `./webmcp.json`

#### Scenario: No config file present
- **WHEN** the operator runs `node server.js` with no `--config` flag
- **AND** no default config file is found
- **THEN** the bridge falls back to environment variables only

### Requirement: Config file format detection by extension
The bridge SHALL parse files with `.yaml` or `.yml` extensions as YAML and `.json` as JSON.

#### Scenario: YAML file
- **WHEN** the bridge loads a file with extension `.yaml`
- **THEN** the bridge parses it with a YAML parser

#### Scenario: JSON file
- **WHEN** the bridge loads a file with extension `.json`
- **THEN** the bridge parses it with `JSON.parse`

#### Scenario: Unknown extension
- **WHEN** the bridge loads a file with extension `.toml` or other
- **THEN** the bridge exits with a clear error message identifying the unsupported extension

### Requirement: Layered config precedence
The bridge SHALL merge configuration sources in this order: built-in defaults → environment variables → config file → CLI args. Higher-precedence sources override lower-precedence sources.

#### Scenario: CLI overrides config file
- **WHEN** the config file sets `headless: true`
- **AND** the CLI passes `--no-headless`
- **THEN** the bridge uses `headless: false`

#### Scenario: Config file overrides env var
- **WHEN** `WEBMCP_HEADLESS=true` is set
- **AND** the config file sets `headless: false`
- **THEN** the bridge uses `headless: false`

#### Scenario: Env var overrides default
- **WHEN** `CHROME_PATH=/usr/bin/chrome` is set
- **AND** no config file is provided
- **THEN** the bridge uses `/usr/bin/chrome`

### Requirement: Helpful errors for malformed config
The bridge SHALL exit with a clear error message when the config file is missing, unreadable, or malformed.

#### Scenario: File does not exist
- **WHEN** `--config ./missing.yaml` points to a non-existent file
- **THEN** the bridge prints an error including the path
- **AND** exits with a non-zero status code

#### Scenario: YAML parse error
- **WHEN** the config file is malformed YAML
- **THEN** the bridge prints the YAML parser error including line number
- **AND** exits with a non-zero status code

#### Scenario: JSON parse error
- **WHEN** the config file is malformed JSON
- **THEN** the bridge prints the JSON parser error
- **AND** exits with a non-zero status code

