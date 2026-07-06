import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer from 'puppeteer-core';

// =========================================================================
// Configuration loader
// =========================================================================

const DEFAULTS = {
  chromePath: '/usr/bin/chromium',
  targetUrl: 'https://www.google.com',
  headless: true,
  historyMax: 1000,
  logHistory: false,
  declarativeScan: true,
};

/**
 * Parse `--config`, `--headless`, `--no-headless` from argv manually.
 * @param {string[]} argv
 * @returns {{config: string|null, headless: boolean|undefined}}
 */
function parseCliArgs(argv) {
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

/**
 * Read and parse a YAML or JSON config file by extension.
 * @param {string} configPath
 * @returns {object}
 */
function readConfigFile(configPath) {
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

/**
 * Layered config precedence: defaults → env → file → CLI.
 * @param {{argv: string[], env: object, cwd: string}} opts
 * @returns {object} merged config
 */
function loadConfig({ argv, env, cwd }) {
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

// --- Configuration ---
let CONFIG;
try {
  CONFIG = loadConfig({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd() });
} catch (err) {
  process.stderr.write(`[webmcp-bridge] ${err.message}\n`);
  process.exit(1);
}

const CHROME_PATH = CONFIG.chromePath;
const TARGET_URL = CONFIG.targetUrl;
const HEADLESS = CONFIG.headless;
const HISTORY_MAX = CONFIG.historyMax;
const LOG_HISTORY = CONFIG.logHistory;
const DECLARATIVE_SCAN_ENABLED = CONFIG.declarativeScan;

// --- State ---
let browser = null;
/** Active page mirror. Kept for backward compat with single-page code paths. */
let page = null;
/** Map of tabId → Puppeteer Page. */
const tabs = new Map();
/** UUID of the currently active tab, or null if no tabs. */
let activeTabId = null;
/** Per-tab cached tool list (imperative + declarative, deduped). */
const cachedToolsByTab = new Map();
/** Per-tab declarative tools array. */
const declarativeToolsByTab = new Map();
/** @type {Array<{timestamp:string,toolName:string,arguments:object,success:boolean,durationMs:number,error:string|null}>} */
const history = [];

/** Convenience: tools for the active tab. */
function activeCachedTools() {
  return activeTabId ? (cachedToolsByTab.get(activeTabId) || []) : [];
}

// =========================================================================
// Tab management
// =========================================================================

/**
 * Generate a new UUID tabId.
 * @returns {string}
 */
function makeTabId() {
  return crypto.randomUUID();
}

/**
 * Wire up close + framenavigated + console handlers for a page and register
 * it in the tabs map. Returns the assigned tabId.
 * @param {import('puppeteer-core').Page} p
 * @returns {string} tabId
 */
function attachTabLifecycle(p) {
  const tabId = makeTabId();
  tabs.set(tabId, p);
  p.on('close', () => {
    tabs.delete(tabId);
    cachedToolsByTab.delete(tabId);
    declarativeToolsByTab.delete(tabId);
    if (activeTabId === tabId) {
      const remaining = Array.from(tabs.keys());
      if (remaining.length > 0) {
        activeTabId = remaining[0];
        page = tabs.get(activeTabId);
      } else {
        activeTabId = null;
        page = null;
      }
    }
  });
  p.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[page:error] ${msg.text()}`);
  });
  p.on('framenavigated', async () => {
    if (p.isClosed()) return;
    try {
      await scanDeclarativeTools(p);
      const tools = await refreshTools(p);
      cachedToolsByTab.set(tabId, tools);
      await notifyToolsChanged();
      console.error(`[webmcp-bridge] Tab ${tabId.slice(0, 8)} discovered ${tools.length} tools`);
    } catch { /* ignore detached frame */ }
  });
  return tabId;
}

/**
 * Switch the active tab. Updates `page` mirror.
 * @param {string} tabId
 * @returns {boolean} true if switched, false if tabId not found
 */
function setActiveTab(tabId) {
  const p = tabs.get(tabId);
  if (!p) return false;
  activeTabId = tabId;
  page = p;
  return true;
}

/**
 * Resolve a tabId argument to a Page. If tabId is given and the tab exists,
 * returns that page. Otherwise returns the active page.
 * @param {{tabId?: string}} args
 * @returns {{page: import('puppeteer-core').Page, tabId: string}}
 */
function resolveTabPage(args) {
  if (args && typeof args.tabId === 'string' && args.tabId) {
    const p = tabs.get(args.tabId);
    if (!p) throw new Error(`Tab "${args.tabId}" not found`);
    return { page: p, tabId: args.tabId };
  }
  if (!page || !activeTabId) throw new Error('No active tab');
  return { page, tabId: activeTabId };
}

/**
 * Recreate a tab's page after a detached-frame error. Keeps the same tabId.
 * @param {string} tabId
 * @returns {Promise<import('puppeteer-core').Page>}
 */
async function recoverTabPage(tabId) {
  if (!browser) throw new Error('Browser not initialized');
  console.error(`[webmcp-bridge] Tab ${tabId.slice(0, 8)} frame detached — recreating page`);
  const oldPage = tabs.get(tabId);
  try { if (oldPage && !oldPage.isClosed()) await oldPage.close(); } catch { /* ignore */ }
  const newPage = await browser.newPage();
  await newPage.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT, DECLARATIVE_SCAN_ENABLED);
  tabs.set(tabId, newPage);
  // Re-attach event handlers by replacing the entry with a fresh attach.
  // The previous close handler on the old page is dead (page is gone).
  newPage.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[page:error] ${msg.text()}`);
  });
  newPage.on('framenavigated', async () => {
    if (newPage.isClosed()) return;
    try {
      await scanDeclarativeTools(newPage);
      const tools = await refreshTools(newPage);
      cachedToolsByTab.set(tabId, tools);
      await notifyToolsChanged();
    } catch { /* ignore */ }
  });
  newPage.on('close', () => {
    tabs.delete(tabId);
    cachedToolsByTab.delete(tabId);
    declarativeToolsByTab.delete(tabId);
    if (activeTabId === tabId) {
      const remaining = Array.from(tabs.keys());
      if (remaining.length > 0) {
        activeTabId = remaining[0];
        page = tabs.get(activeTabId);
      } else {
        activeTabId = null;
        page = null;
      }
    }
  });
  if (tabId === activeTabId) page = newPage;
  await newPage.goto('about:blank', { waitUntil: 'domcontentloaded' });
  return newPage;
}

// =========================================================================
// Execution history (ring buffer)
// =========================================================================

/**
 * Append a tool-invocation entry to the in-memory ring buffer.
 * Evicts the oldest entry when the buffer exceeds HISTORY_MAX.
 * Optionally writes one JSON line to stderr when LOG_HISTORY is enabled.
 * Errors raised here are intentionally swallowed so they never break a tool call.
 */
function recordHistory(entry) {
  try {
    history.push(entry);
    while (history.length > HISTORY_MAX) history.shift();
    if (LOG_HISTORY) {
      process.stderr.write(JSON.stringify(entry) + '\n');
    }
  } catch {
    /* never let history recording break a tool call */
  }
}

function clearHistory() {
  history.length = 0;
}

// =========================================================================
// Chrome / WebMCP lifecycle
// =========================================================================

async function initBrowser() {
  const args = [
    '--enable-features=WebMCPTesting,DevToolsWebMCPSupport',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,720',
  ];
  if (!HEADLESS) args.push('--ozone-platform=wayland');

  browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: HEADLESS, args });

  // Create the first tab via attachTabLifecycle (registers handlers + returns tabId).
  const firstPage = await browser.newPage();
  await firstPage.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT, DECLARATIVE_SCAN_ENABLED);
  activeTabId = attachTabLifecycle(firstPage);
  page = firstPage;

  await firstPage.goto(TARGET_URL, { waitUntil: 'networkidle0' });
  console.error(`[webmcp-bridge] Navigated to ${firstPage.url()}`);

  await scanDeclarativeTools(firstPage);
  cachedToolsByTab.set(activeTabId, await refreshTools(firstPage));
  console.error(`[webmcp-bridge] Discovered ${activeCachedTools().length} WebMCP tools`);
  if (activeCachedTools().length === 0) {
    console.error(`[webmcp-bridge] No tools found — navigate to a WebMCP-enabled page via webmcp_navigate`);
  }
}

async function checkWebMCP() {
  try { return !!(page?.webmcp && typeof page.webmcp.tools === 'function'); } catch { return false; }
}

async function refreshTools(p) {
  try {
    if (!p || p.isClosed()) return [];
    if (!p?.webmcp || typeof p.webmcp.tools !== 'function') return [];
    const raw = await p.webmcp.tools();
    // Pull annotations/title from the page-side captured meta map (monkey-patch).
    // page.webmcp.tools() may not include them in all Chrome versions.
    let metaMap = {};
    try {
      metaMap = await p.evaluate(() => {
        const m = {};
        if (window.__webmcp_meta) {
          for (const [name, info] of window.__webmcp_meta) {
            m[name] = info;
          }
        }
        return m;
      });
    } catch { /* ignore detached frame */ }
    const imperative = (raw || []).map(t => {
      const meta = metaMap[t.name] || {};
      const descriptor = {
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      };
      const annotations = t.annotations || meta.annotations;
      if (annotations) descriptor.annotations = annotations;
      const title = t.title || meta.title;
      if (title) descriptor.title = title;
      return descriptor;
    });
    // Merge in declarative tools for this tab (imperative wins on collision)
    const tabId = findTabIdForPage(p);
    const declarative = tabId ? (declarativeToolsByTab.get(tabId) || []) : [];
    const imperativeNames = new Set(imperative.map(t => t.name));
    const filteredDeclarative = declarative.filter(t => !imperativeNames.has(t.name));
    return [...imperative, ...filteredDeclarative];
  } catch (err) {
    console.error(`[webmcp-bridge] refreshTools error: ${err.message}`);
    return [];
  }
}

/** Reverse lookup: which tabId owns this page object? */
function findTabIdForPage(p) {
  for (const [id, pageInMap] of tabs) {
    if (pageInMap === p) return id;
  }
  return null;
}

/**
 * Scan a page's DOM for HTML elements with a `toolname` attribute (the
 * declarative WebMCP API). Returns synthesized MCP tool descriptors, also
 * cached in `declarativeToolsByTab[tabId]`.
 */
async function scanDeclarativeTools(p) {
  if (!DECLARATIVE_SCAN_ENABLED) {
    const tabId = findTabIdForPage(p);
    if (tabId) declarativeToolsByTab.set(tabId, []);
    return [];
  }
  if (!p || p.isClosed()) return [];
  try {
    const scanned = await p.evaluate(() => {
      const cssEscape = (s) => {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
        return String(s).replace(/([!"#$%&'()*+,./:;<=>?@\[\\\]^`{|}~])/g, '\\$1');
      };
      const elements = document.querySelectorAll('[toolname]');
      const out = [];
      const seen = new Set();
      for (const el of elements) {
        const name = el.getAttribute('toolname');
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const tag = el.tagName.toLowerCase();
        const fields = el.querySelectorAll('[name][toolname-target]');
        const properties = {};
        const required = [];
        for (const f of fields) {
          const fname = f.getAttribute('name');
          if (!fname) continue;
          let type = 'string';
          const ftype = (f.getAttribute('type') || '').toLowerCase();
          if (ftype === 'number' || ftype === 'range') type = 'number';
          else if (ftype === 'checkbox') type = 'boolean';
          properties[fname] = { type, description: `Field '${fname}' of <${tag} toolname="${name}">` };
          if (f.hasAttribute('required')) required.push(fname);
        }
        const descriptor = {
          name,
          description: `Tool declared by <${tag} toolname="${name}"> on the current page`,
          inputSchema: {
            type: 'object',
            properties,
            ...(required.length ? { required } : {}),
          },
          __declarative: true,
          __elementSelector: `[toolname="${cssEscape(name)}"]`,
        };
        out.push(descriptor);
      }
      return out;
    });
    const tabId = findTabIdForPage(p);
    if (tabId) declarativeToolsByTab.set(tabId, scanned || []);
    return scanned || [];
  } catch (err) {
    console.error(`[webmcp-bridge] scanDeclarativeTools error: ${err.message}`);
    return [];
  }
}

/**
 * Check the page-side dirty flags set by the MutationObserver and the
 * monkey-patch (after registerTool calls). Re-scans declarative tools if
 * the DOM changed; resets the meta-dirty flag for imperative tool updates.
 * Sends a tools/list_changed notification if either flag was set.
 */
async function maybeRefreshToolsFromPage(p) {
  if (!p || p.isClosed()) return false;
  let dirty = false;
  try {
    if (DECLARATIVE_SCAN_ENABLED) {
      const declDirty = await p.evaluate(() => window.__webmcp_declarative_dirty === true);
      if (declDirty) {
        await p.evaluate(() => { window.__webmcp_declarative_dirty = false; });
        await scanDeclarativeTools(p);
        dirty = true;
      }
    }
    const metaDirty = await p.evaluate(() => window.__webmcp_meta_dirty === true);
    if (metaDirty) {
      await p.evaluate(() => { window.__webmcp_meta_dirty = false; });
      dirty = true;
    }
  } catch { /* ignore detached frame */ }
  if (dirty) await notifyToolsChanged();
  return dirty;
}

// =========================================================================
// Bridge-native tools
// =========================================================================

const BRIDGE_TOOLS = [
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

/**
 * Ensure the active tab has a live page. If the page is closed/detached,
 * recreate it (same tabId) so subsequent operations work.
 */
async function ensurePage() {
  if (page && !page.isClosed()) return false;
  if (!activeTabId) {
    // No active tab at all — create one.
    const p = await browser.newPage();
    await p.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT, DECLARATIVE_SCAN_ENABLED);
    activeTabId = attachTabLifecycle(p);
    page = p;
    console.error('[webmcp-bridge] Created initial tab');
  } else {
    console.error(`[webmcp-bridge] Active tab ${activeTabId.slice(0, 8)} page is closed — recreating`);
    page = await recoverTabPage(activeTabId);
  }
  return true;
}

const MONKEY_PATCH_SCRIPT = (declarativeScanEnabled) => {
  const poll = setInterval(() => {
    const mc = document.modelContext;
    if (mc && mc.registerTool) {
      clearInterval(poll);
      window.__webmcp_executors = new Map();
      window.__webmcp_meta = new Map(); // name → { annotations, title }
      const origRegister = mc.registerTool.bind(mc);
      mc.registerTool = (def, opts) => {
        if (def && typeof def.name === 'string') {
          if (typeof def.execute === 'function') {
            window.__webmcp_executors.set(def.name, def.execute);
          }
          window.__webmcp_meta.set(def.name, {
            annotations: def.annotations || null,
            title: def.title || null,
          });
          window.__webmcp_meta_dirty = true;
        }
        return origRegister(def, opts);
      };
      const origExecute = mc.executeTool.bind(mc);
      mc.executeTool = async (tool, execArgs) => {
        const fn = window.__webmcp_executors.get(tool.name);
        if (fn) return await fn(execArgs);
        return await origExecute(tool, execArgs);
      };
      window.__webmcp_bridge_patched = true;

      // MutationObserver: track [toolname] attribute changes for declarative API.
      // Only wired when declarative scan is enabled.
      if (declarativeScanEnabled) {
        window.__webmcp_declarative_dirty = true;
        let debounceTimer = null;
        const flagDirty = () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            window.__webmcp_declarative_dirty = true;
          }, 100);
        };
        const observer = new MutationObserver(flagDirty);
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['toolname', 'toolname-target'],
          subtree: true,
          childList: true,
        });
      }
    }
  }, 5);
};

async function handleBridgeTool(name, args) {
  switch (name) {
    case 'webmcp_navigate': {
      const url = args?.url;
      if (!url) return { isError: true, content: [{ type: 'text', text: 'Missing required argument: url' }] };
      let resolved;
      try { resolved = resolveTabPage(args); }
      catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
      const { page: targetPage, tabId: targetTabId } = resolved;
      try {
        await targetPage.goto(url, { waitUntil: 'networkidle0' });
      } catch (e) {
        if (e.message.includes('detached Frame')) {
          await recoverTabPage(targetTabId);
          const fresh = tabs.get(targetTabId);
          await fresh.goto(url, { waitUntil: 'networkidle0' });
        } else {
          throw e;
        }
      }
      await scanDeclarativeTools(tabs.get(targetTabId));
      cachedToolsByTab.set(targetTabId, await refreshTools(tabs.get(targetTabId)));
      await notifyToolsChanged();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'ok', tabId: targetTabId, url: tabs.get(targetTabId).url(), toolsFound: (cachedToolsByTab.get(targetTabId) || []).length }, null, 2),
        }],
      };
    }

    case 'webmcp_status': {
      const wmAvail = page ? await checkWebMCP() : false;
      let patchReady = false;
      try {
        if (page && !page.isClosed() && wmAvail) {
          patchReady = await page.evaluate(() => window.__webmcp_bridge_patched || false).catch(() => false);
        }
      } catch { /* ignore detached frame */ }
      const tools = activeCachedTools();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: !!(page && !page.isClosed()),
            url: page?.url() || null,
            activeTabId,
            tabCount: tabs.size,
            webmcpAvailable: wmAvail,
            monkeyPatchActive: patchReady,
            toolCount: tools.length,
            toolNames: tools.map(t => t.name),
          }, null, 2),
        }],
      };
    }

    case 'webmcp_evaluate': {
      const code = args?.code;
      if (!code) return { isError: true, content: [{ type: 'text', text: 'Missing argument: code' }] };
      let resolved;
      try { resolved = resolveTabPage(args); }
      catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
      const { page: targetPage } = resolved;
      if (!targetPage || targetPage.isClosed()) {
        return { isError: true, content: [{ type: 'text', text: `Tab ${resolved.tabId.slice(0, 8)} page is closed; navigate to recover it.` }] };
      }
      const result = await targetPage.evaluate((c) => eval(c), code);
      return {
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }],
      };
    }

    case 'webmcp_invoke_tool': {
      const toolName = args?.name;
      if (!toolName) return { isError: true, content: [{ type: 'text', text: 'Missing argument: name' }] };
      let resolved;
      try { resolved = resolveTabPage(args); }
      catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
      const result = await executeWebMCPTool(toolName, args?.args || {}, resolved.page, resolved.tabId);
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    }

    case 'webmcp_screenshot': {
      let resolved;
      try { resolved = resolveTabPage(args); }
      catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
      const { page: targetPage, tabId: targetTabId } = resolved;
      if (!targetPage || targetPage.isClosed()) {
        return { isError: true, content: [{ type: 'text', text: `Tab ${targetTabId.slice(0, 8)} page is closed; navigate to recover it.` }] };
      }
      const format = args?.format === 'jpeg' ? 'jpeg' : 'png';
      const options = { type: format };
      if (format === 'jpeg' && typeof args?.quality === 'number') options.quality = args.quality;
      if (args?.fullPage) options.fullPage = true;
      if (args?.clip && typeof args.clip === 'object') {
        const { x, y, width, height } = args.clip;
        if ([x, y, width, height].every(v => typeof v === 'number')) {
          options.clip = { x, y, width, height };
        }
      }
      try {
        const buffer = await targetPage.screenshot(options);
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        return {
          content: [{
            type: 'image',
            data: buffer.toString('base64'),
            mimeType,
          }],
        };
      } catch (e) {
        if (e.message.includes('detached Frame')) {
          await recoverTabPage(targetTabId);
          return { isError: true, content: [{ type: 'text', text: 'Frame was detached; re-created page. Please retry.' }] };
        }
        throw e;
      }
    }

    case 'webmcp_open_tab': {
      if (!browser) return { isError: true, content: [{ type: 'text', text: 'Browser not initialized' }] };
      const url = typeof args?.url === 'string' && args.url ? args.url : 'about:blank';
      const newPage = await browser.newPage();
      await newPage.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT, DECLARATIVE_SCAN_ENABLED);
      const tabId = attachTabLifecycle(newPage);
      try {
        await newPage.goto(url, { waitUntil: 'networkidle0' });
      } catch (e) {
        // Continue — tab is created even if navigation failed.
        console.error(`[webmcp-bridge] open_tab navigation warning: ${e.message}`);
      }
      await scanDeclarativeTools(newPage);
      cachedToolsByTab.set(tabId, await refreshTools(newPage));
      await notifyToolsChanged();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'ok', tabId, url: newPage.url(), isActive: tabId === activeTabId }, null, 2),
        }],
      };
    }

    case 'webmcp_switch_tab': {
      const tabId = args?.tabId;
      if (!tabId || typeof tabId !== 'string') return { isError: true, content: [{ type: 'text', text: 'Missing argument: tabId' }] };
      if (!setActiveTab(tabId)) {
        return { isError: true, content: [{ type: 'text', text: `Tab "${tabId}" not found` }] };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'ok', tabId, url: page.url() }, null, 2),
        }],
      };
    }

    case 'webmcp_list_tabs': {
      const out = [];
      for (const [id, p] of tabs) {
        let url = null;
        let title = '';
        try { if (!p.isClosed()) { url = p.url(); title = await p.title(); } } catch { /* detached frame */ }
        out.push({ tabId: id, url, title, isActive: id === activeTabId });
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ count: out.length, tabs: out, activeTabId }, null, 2),
        }],
      };
    }

    case 'webmcp_close_tab': {
      const tabId = args?.tabId;
      if (!tabId || typeof tabId !== 'string') return { isError: true, content: [{ type: 'text', text: 'Missing argument: tabId' }] };
      const target = tabs.get(tabId);
      if (!target) return { isError: true, content: [{ type: 'text', text: `Tab "${tabId}" not found` }] };
      if (tabs.size === 1) {
        return { isError: true, content: [{ type: 'text', text: 'Cannot close the last tab; the bridge needs at least one tab.' }] };
      }
      const wasActive = tabId === activeTabId;
      // Find the next-most-recent active candidate. Since we don't track recency,
      // pick the first remaining tab in the map.
      let nextActive = null;
      if (wasActive) {
        for (const id of tabs.keys()) {
          if (id !== tabId) { nextActive = id; break; }
        }
      }
      try { if (!target.isClosed()) await target.close(); } catch { /* ignore */ }
      // Manually remove (page.on('close') will also fire and try to remove, but it's idempotent)
      tabs.delete(tabId);
      cachedToolsByTab.delete(tabId);
      declarativeToolsByTab.delete(tabId);
      if (wasActive && nextActive) {
        activeTabId = nextActive;
        page = tabs.get(nextActive);
      }
      await notifyToolsChanged();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'ok', closed: tabId, wasActive, nextActiveTabId: wasActive ? nextActive : activeTabId }, null, 2),
        }],
      };
    }

    case 'webmcp_history': {
      const limit = typeof args?.limit === 'number' ? args.limit : 50;
      const filterName = typeof args?.toolName === 'string' ? args.toolName : null;
      let entries = filterName ? history.filter(e => e.toolName === filterName) : history.slice();
      // Most recent first
      entries.reverse();
      if (entries.length > limit) entries = entries.slice(0, limit);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: entries.length,
            total: history.length,
            entries,
          }, null, 2),
        }],
      };
    }

    case 'webmcp_clear_history': {
      const previous = history.length;
      clearHistory();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'ok', cleared: previous }, null, 2),
        }],
      };
    }

    case 'webmcp_register_test_tools': {
      let resolved;
      try { resolved = resolveTabPage(args); }
      catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
      const { page: targetPage, tabId: targetTabId } = resolved;
      if (!targetPage || targetPage.isClosed()) {
        return { isError: true, content: [{ type: 'text', text: `Tab ${targetTabId.slice(0, 8)} page is closed; navigate to recover it.` }] };
      }
      await targetPage.evaluate(() => {
        const ac = new AbortController();
        document.modelContext.registerTool({
          name: 'test_greet',
          description: 'Say hello to a person by name',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'The name to greet' } },
            required: ['name'],
          },
          execute: ({ name }) => `Hello, ${name}! Welcome to WebMCP.`,
          annotations: { readOnlyHint: true },
        }, { signal: ac.signal });
        document.modelContext.registerTool({
          name: 'test_calculator',
          description: 'Add two numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' },
            },
            required: ['a', 'b'],
          },
          execute: ({ a, b }) => a + b,
          annotations: { readOnlyHint: true },
        }, { signal: ac.signal });
        document.modelContext.registerTool({
          name: 'test_fetch_title',
          description: 'Fetch a URL and return the page title',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'URL to fetch' } },
            required: ['url'],
          },
          execute: async ({ url }) => {
            const resp = await fetch(url);
            const html = await resp.text();
            const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            return match ? match[1] : 'No title found';
          },
          annotations: { readOnlyHint: true },
        }, { signal: ac.signal });
      });
      await scanDeclarativeTools(tabs.get(targetTabId));
      cachedToolsByTab.set(targetTabId, await refreshTools(tabs.get(targetTabId)));
      await notifyToolsChanged();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            tabId: targetTabId,
            registered: 3,
            toolNames: (cachedToolsByTab.get(targetTabId) || []).map(t => t.name),
          }, null, 2),
        }],
      };
    }

    default:
      return null; // Not a bridge tool
  }
}

// =========================================================================
// WebMCP tool execution (via patched page API)
// =========================================================================

async function executeWebMCPTool(toolName, args, targetPage, targetTabId) {
  targetPage = targetPage || page;
  targetTabId = targetTabId || activeTabId;

  // Route to declarative path if this name matches a synthesized tool for this tab
  const declarative = (declarativeToolsByTab.get(targetTabId) || []).find(t => t.name === toolName);
  if (declarative) {
    return await executeDeclarativeTool(toolName, args, targetPage, targetTabId);
  }

  let result;
  try {
    result = await targetPage.evaluate(async (name, toolArgs) => {
      try {
        const tools = await document.modelContext.getTools();
        const tool = tools.find(t => t.name === name);
        if (!tool) throw new Error(`WebMCP tool "${name}" not found on the page`);
        return await document.modelContext.executeTool(tool, toolArgs);
      } catch (e) {
        return { __bridge_error: true, message: e.message };
      }
    }, toolName, args || {});
  } catch (e) {
    if (e.message.includes('detached Frame')) {
      console.error(`[webmcp-bridge] Tab ${targetTabId.slice(0, 8)} frame detached during execute — re-creating page`);
      await recoverTabPage(targetTabId);
      throw new Error(`Frame was detached; re-created page. Please try again.`);
    }
    throw e;
  }

  if (result && result.__bridge_error) {
    throw new Error(result.message);
  }
  return result;
}

/**
 * Execute a declarative tool by filling its form's targeted fields and submitting.
 */
async function executeDeclarativeTool(toolName, args, targetPage, targetTabId) {
  targetPage = targetPage || page;
  targetTabId = targetTabId || activeTabId;
  try {
    return await targetPage.evaluate(async (name, toolArgs) => {
      const escapeAttr = (s) => String(s).replace(/(["\\])/g, '\\$1');
      const el = document.querySelector(`[toolname="${escapeAttr(name)}"]`);
      if (!el) throw new Error(`Declarative tool "${name}" not found on the page`);
      const fields = el.querySelectorAll('[name][toolname-target]');
      const applied = [];
      for (const f of fields) {
        const fname = f.getAttribute('name');
        if (!toolArgs || !Object.prototype.hasOwnProperty.call(toolArgs, fname)) continue;
        const value = toolArgs[fname];
        const ftype = (f.getAttribute('type') || '').toLowerCase();
        if (ftype === 'checkbox') {
          f.checked = !!value;
        } else if (ftype === 'radio') {
          const radios = el.querySelectorAll(`[name="${escapeAttr(fname)}"]`);
          for (const r of radios) {
            if (r.value === String(value)) r.checked = true;
          }
        } else {
          f.value = value == null ? '' : String(value);
        }
        applied.push(fname);
      }
      // Dispatch a submit event. If the form has a handler it can intercept.
      let cancelled = false;
      if (el.tagName === 'FORM') {
        const evt = new Event('submit', { bubbles: true, cancelable: true });
        cancelled = !el.dispatchEvent(evt);
        if (typeof el.requestSubmit === 'function') {
          try { el.requestSubmit(); } catch { /* ignore */ }
        }
      }
      return { submitted: true, cancelled, applied };
    }, toolName, args || {});
  } catch (e) {
    if (e.message.includes('detached Frame')) {
      console.error(`[webmcp-bridge] Tab ${targetTabId.slice(0, 8)} frame detached during declarative execute — re-creating page`);
      await recoverTabPage(targetTabId);
      throw new Error(`Frame was detached; re-created page. Please try again.`);
    }
    throw e;
  }
}

// =========================================================================
// MCP Server
// =========================================================================

const server = new Server(
  { name: 'webmcp-bridge', version: '0.3.0' },
  { capabilities: { tools: { listChanged: true } } },
);

async function notifyToolsChanged() {
  try { await server.sendNotification({ method: 'notifications/tools/list_changed' }); } catch { /* ignore */ }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (page && !page.isClosed()) {
    await maybeRefreshToolsFromPage(page);
    const tools = await refreshTools(page);
    cachedToolsByTab.set(activeTabId, tools);
  }
  return { tools: [...BRIDGE_TOOLS, ...activeCachedTools()] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startedAt = Date.now();
  let result;
  let error = null;

  try {
    // 1) Bridge-native tool
    const bridgeResult = await handleBridgeTool(name, args);
    if (bridgeResult) {
      result = bridgeResult;
      if (bridgeResult.isError) {
        const text = (bridgeResult.content || []).map(c => c.text || '').join('\n');
        error = text || 'tool returned isError';
      }
    } else {
      // 2) WebMCP tool from the page
      try {
        const inner = await executeWebMCPTool(name, args);
        const text = typeof inner === 'string' ? inner : JSON.stringify(inner, null, 2);
        result = { content: [{ type: 'text', text }] };
      } catch (innerErr) {
        error = innerErr.message;
        result = { isError: true, content: [{ type: 'text', text: error }] };
      }
    }
    return result;
  } catch (err) {
    error = err.message;
    return { isError: true, content: [{ type: 'text', text: error }] };
  } finally {
    recordHistory({
      timestamp: new Date().toISOString(),
      toolName: name,
      arguments: args || {},
      success: error === null,
      durationMs: Date.now() - startedAt,
      error,
    });
  }
});

// =========================================================================
// Lifecycle
// =========================================================================

async function shutdown() {
  console.error('[webmcp-bridge] Shutting down...');
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  console.error('[webmcp-bridge] Starting Chrome...');
  await initBrowser();
  console.error(`[webmcp-bridge] Browser PID: ${browser.process()?.pid}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[webmcp-bridge] MCP server ready over stdio');
} catch (err) {
  console.error(`[webmcp-bridge] Fatal: ${err.message}`);
  if (browser) try { await browser.close(); } catch { /* ignore */ }
  process.exit(1);
}
