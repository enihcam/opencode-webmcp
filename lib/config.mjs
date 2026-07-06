import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

// =========================================================================
// Defaults
// =========================================================================

export const DEFAULTS = {
  chromePath: '/usr/bin/chromium',
  targetUrl: 'https://www.google.com',
  headless: true,
  historyMax: 1000,
  logHistory: false,
  declarativeScan: true,
};

// =========================================================================
// CLI argument parser
// =========================================================================

/**
 * Parse `--config`, `--headless`, `--no-headless` from argv manually.
 * @param {string[]} argv
 * @returns {{config: string|null, headless: boolean|undefined}}
 */
export function parseCliArgs(argv) {
  const args = { config: null, headless: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config' && i + 1 < argv.length) {
      args.config = argv[++i];
    } else if (a === '--no-headless') {
      args.headless = false;
    } else if (a === '--headless') {
      args.headless = true;
    }
  }
  return args;
}

// =========================================================================
// Config file reader
// =========================================================================

/**
 * Read and parse a YAML or JSON config file by extension.
 * @param {string} configPath
 * @returns {object}
 */
export function readConfigFile(configPath) {
  const ext = path.extname(configPath).toLowerCase();
  const text = fs.readFileSync(configPath, 'utf8');
  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(text, { schema: yaml.CORE_SCHEMA });
  }
  if (ext === '.json') {
    return JSON.parse(text);
  }
  throw new Error(`Unsupported config file extension '${ext}'. Use .yaml, .yml, or .json.`);
}

// =========================================================================
// Layered config loader
// =========================================================================

/**
 * Layered config precedence: defaults → env → file → CLI.
 * @param {{argv: string[], env: object, cwd: string}} opts
 * @returns {object} merged config
 */
export function loadConfig({ argv, env, cwd }) {
  const cli = parseCliArgs(argv);

  // Build env layer (only set keys that are present in env)
  const fromEnv = {};
  if (env.CHROME_PATH) fromEnv.chromePath = env.CHROME_PATH;
  if (env.WEBMCP_TARGET_URL) fromEnv.targetUrl = env.WEBMCP_TARGET_URL;
  if (env.WEBMCP_HEADLESS !== undefined) fromEnv.headless = env.WEBMCP_HEADLESS !== 'false';
  if (env.WEBMCP_HISTORY_MAX) fromEnv.historyMax = parseInt(env.WEBMCP_HISTORY_MAX, 10);
  if (env.WEBMCP_LOG_HISTORY) fromEnv.logHistory = env.WEBMCP_LOG_HISTORY === 'true';
  if (env.WEBMCP_DECLARATIVE_SCAN !== undefined) fromEnv.declarativeScan = env.WEBMCP_DECLARATIVE_SCAN !== 'false';

  // Resolve config path: explicit → discovery → none
  let configPath = cli.config;
  if (!configPath) {
    for (const name of ['webmcp.yaml', 'webmcp.yml', 'webmcp.json']) {
      const candidate = path.join(cwd, name);
      if (fs.existsSync(candidate)) {
        configPath = candidate;
        break;
      }
    }
  }

  let fromFile = {};
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    try {
      const parsed = readConfigFile(configPath);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(
          `Config file must contain an object, got ${parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed}`,
        );
      }
      fromFile = parsed;
      process.stderr.write(`[webmcp-bridge] Loaded config from ${configPath}\n`);
    } catch (err) {
      throw new Error(`Failed to parse ${configPath}: ${err.message}`);
    }
  }

  // Build CLI layer (only what was explicitly passed)
  const fromCli = {};
  if (cli.headless !== undefined) fromCli.headless = cli.headless;

  return { ...DEFAULTS, ...fromEnv, ...fromFile, ...fromCli };
}

// =========================================================================
// Utilities
// =========================================================================

/**
 * Generate a new UUID tabId.
 * @returns {string}
 */
export function makeTabId() {
  return crypto.randomUUID();
}

// =========================================================================
// Bridge-native tool definitions
// =========================================================================

export const BRIDGE_TOOLS = [
  {
    name: 'webmcp_navigate',
    title: 'Navigate to URL',
    description: 'Navigate Chrome to a URL and refresh discovered WebMCP tools',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        tabId: { type: 'string', description: 'Optional: target a specific tab by id (defaults to active tab)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'webmcp_status',
    title: 'Get bridge and page status',
    description: 'Report WebMCP connection status, current page URL, tab count, and tool count for the active tab',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'webmcp_evaluate',
    title: 'Evaluate JavaScript on page',
    description: 'Execute arbitrary JavaScript on the page and return the result',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to evaluate' },
        tabId: { type: 'string', description: 'Optional: target a specific tab by id' },
      },
      required: ['code'],
    },
  },
  {
    name: 'webmcp_invoke_tool',
    description: 'Execute a WebMCP tool by name. Use webmcp_status (toolNames) or webmcp_evaluate with document.modelContext.getTools() to discover available tools.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'WebMCP tool name' },
        args: { type: 'object', description: 'Arguments to pass to the tool', properties: {}, additionalProperties: true },
        tabId: { type: 'string', description: 'Optional: target a specific tab by id' },
      },
      required: ['name'],
    },
  },
  {
    name: 'webmcp_register_test_tools',
    title: 'Register sample WebMCP tools',
    description: 'Register sample WebMCP tools for testing',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'Optional: target a specific tab by id' },
      },
    },
  },
  {
    name: 'webmcp_screenshot',
    title: 'Capture page screenshot',
    description: 'Capture a screenshot of the current page and return it as an MCP image. Returns the viewport by default; pass fullPage for the entire scrollable page, or clip to capture a region.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format (default png)' },
        quality: { type: 'integer', minimum: 1, maximum: 100, description: 'JPEG quality 1-100 (ignored unless format=jpeg)' },
        fullPage: { type: 'boolean', description: 'Capture the full scrollable page instead of just the viewport (default false)' },
        clip: {
          type: 'object',
          description: 'Capture a specific rectangular region of the page',
          properties: {
            x: { type: 'integer', description: 'Left edge in pixels' },
            y: { type: 'integer', description: 'Top edge in pixels' },
            width: { type: 'integer', description: 'Region width in pixels' },
            height: { type: 'integer', description: 'Region height in pixels' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
        tabId: { type: 'string', description: 'Optional: target a specific tab by id' },
      },
    },
  },
  {
    name: 'webmcp_history',
    title: 'Get recent tool history',
    description: 'Return recent tool invocations from the in-memory history ring buffer. Most recent first. Use limit to control how many entries are returned; pass toolName to filter by a single tool.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Max number of entries to return (default 50)' },
        toolName: { type: 'string', description: 'Optional: only return entries whose tool name equals this value' },
      },
    },
  },
  {
    name: 'webmcp_clear_history',
    title: 'Clear tool history',
    description: 'Empty the in-memory history ring buffer.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'webmcp_open_tab',
    title: 'Open new tab',
    description: 'Open a new tab, optionally navigating to a URL. Returns the new tabId. The previously active tab remains active.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL to navigate to (defaults to about:blank)' },
      },
    },
  },
  {
    name: 'webmcp_switch_tab',
    title: 'Switch active tab',
    description: 'Make a specific tab the active tab. Subsequent calls without tabId target this tab.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'The tabId to switch to' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'webmcp_list_tabs',
    title: 'List open tabs',
    description: 'List all open tabs with their tabId, url, title, and isActive flag.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'webmcp_close_tab',
    title: 'Close tab',
    description: 'Close a tab by tabId. Cannot close the last remaining tab. If the active tab is closed, another tab becomes active.',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'The tabId to close' },
      },
      required: ['tabId'],
    },
  },
];
