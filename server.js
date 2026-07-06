import { loadConfig, makeTabId, BRIDGE_TOOLS } from './lib/config.mjs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer from 'puppeteer-core';

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

// =========================================================================
// Response helpers
// =========================================================================

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(msg) {
  return { isError: true, content: [{ type: 'text', text: msg }] };
}

// =========================================================================
// Bridge-native tool dispatch
// =========================================================================

async function refreshTabTools(tabId) {
  await scanDeclarativeTools(tabs.get(tabId));
  cachedToolsByTab.set(tabId, await refreshTools(tabs.get(tabId)));
  await notifyToolsChanged();
}

const BRIDGE_HANDLERS = {
  'webmcp_navigate': handleNavigate,
  'webmcp_status': handleStatus,
  'webmcp_evaluate': handleEvaluate,
  'webmcp_invoke_tool': handleInvokeTool,
  'webmcp_screenshot': handleScreenshot,
  'webmcp_open_tab': handleOpenTab,
  'webmcp_switch_tab': handleSwitchTab,
  'webmcp_list_tabs': handleListTabs,
  'webmcp_close_tab': handleCloseTab,
  'webmcp_history': handleHistory,
  'webmcp_clear_history': handleClearHistory,
  'webmcp_register_test_tools': handleRegisterTestTools,
};

async function handleNavigate(args) {
  const url = args?.url;
  if (!url) return err('Missing required argument: url');
  let resolved;
  try { resolved = resolveTabPage(args); }
  catch (e) { return err(e.message); }
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
  await refreshTabTools(targetTabId);
  return ok({
    status: 'ok', tabId: targetTabId,
    url: tabs.get(targetTabId).url(),
    toolsFound: (cachedToolsByTab.get(targetTabId) || []).length,
  });
}

async function handleStatus(args) {
  const wmAvail = page ? await checkWebMCP() : false;
  let patchReady = false;
  try {
    if (page && !page.isClosed() && wmAvail) {
      patchReady = await page.evaluate(() => window.__webmcp_bridge_patched || false).catch(() => false);
    }
  } catch { /* ignore detached frame */ }
  const tools = activeCachedTools();
  return ok({
    connected: !!(page && !page.isClosed()),
    url: page?.url() || null,
    activeTabId,
    tabCount: tabs.size,
    webmcpAvailable: wmAvail,
    monkeyPatchActive: patchReady,
    toolCount: tools.length,
    toolNames: tools.map(t => t.name),
  });
}

async function handleEvaluate(args) {
  const code = args?.code;
  if (!code) return err('Missing argument: code');
  let resolved;
  try { resolved = resolveTabPage(args); }
  catch (e) { return err(e.message); }
  const { page: targetPage } = resolved;
  if (!targetPage || targetPage.isClosed()) {
    return err(`Tab ${resolved.tabId.slice(0, 8)} page is closed; navigate to recover it.`);
  }
  const result = await targetPage.evaluate((c) => eval(c), code);
  return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
}

async function handleInvokeTool(args) {
  const toolName = args?.name;
  if (!toolName) return err('Missing argument: name');
  let resolved;
  try { resolved = resolveTabPage(args); }
  catch (e) { return err(e.message); }
  const result = await executeWebMCPTool(toolName, args?.args || {}, resolved.page, resolved.tabId);
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: 'text', text }] };
}

async function handleScreenshot(args) {
  let resolved;
  try { resolved = resolveTabPage(args); }
  catch (e) { return err(e.message); }
  const { page: targetPage, tabId: targetTabId } = resolved;
  if (!targetPage || targetPage.isClosed()) {
    return err(`Tab ${targetTabId.slice(0, 8)} page is closed; navigate to recover it.`);
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
    return {
      content: [{
        type: 'image',
        data: buffer.toString('base64'),
        mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
      }],
    };
  } catch (e) {
    if (e.message.includes('detached Frame')) {
      await recoverTabPage(targetTabId);
      return err('Frame was detached; re-created page. Please retry.');
    }
    throw e;
  }
}
async function handleOpenTab(args) {
  if (!browser) return err('Browser not initialized');
  const url = typeof args?.url === 'string' && args.url ? args.url : 'about:blank';
  const newPage = await browser.newPage();
  await newPage.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT, DECLARATIVE_SCAN_ENABLED);
  const tabId = attachTabLifecycle(newPage);
  try {
    await newPage.goto(url, { waitUntil: 'networkidle0' });
  } catch (e) {
    console.error(`[webmcp-bridge] open_tab navigation warning: ${e.message}`);
  }
  await refreshTabTools(tabId);
  return ok({ status: 'ok', tabId, url: newPage.url(), isActive: tabId === activeTabId });
}

async function handleSwitchTab(args) {
  const tabId = args?.tabId;
  if (!tabId || typeof tabId !== 'string') return err('Missing argument: tabId');
  if (!setActiveTab(tabId)) return err(`Tab "${tabId}" not found`);
  return ok({ status: 'ok', tabId, url: page.url() });
}

async function handleListTabs(args) {
  const out = [];
  for (const [id, p] of tabs) {
    let url = null;
    let title = '';
    try { if (!p.isClosed()) { url = p.url(); title = await p.title(); } } catch { /* detached frame */ }
    out.push({ tabId: id, url, title, isActive: id === activeTabId });
  }
  return ok({ count: out.length, tabs: out, activeTabId });
}

async function handleCloseTab(args) {
  const tabId = args?.tabId;
  if (!tabId || typeof tabId !== 'string') return err('Missing argument: tabId');
  const target = tabs.get(tabId);
  if (!target) return err(`Tab "${tabId}" not found`);
  if (tabs.size === 1) return err('Cannot close the last tab; the bridge needs at least one tab.');
  const wasActive = tabId === activeTabId;
  let nextActive = null;
  if (wasActive) {
    for (const id of tabs.keys()) {
      if (id !== tabId) { nextActive = id; break; }
    }
  }
  try { if (!target.isClosed()) await target.close(); } catch { /* ignore */ }
  tabs.delete(tabId);
  cachedToolsByTab.delete(tabId);
  declarativeToolsByTab.delete(tabId);
  if (wasActive && nextActive) {
    activeTabId = nextActive;
    page = tabs.get(nextActive);
  }
  await notifyToolsChanged();
  return ok({ status: 'ok', closed: tabId, wasActive, nextActiveTabId: wasActive ? nextActive : activeTabId });
}

async function handleHistory(args) {
  const limit = typeof args?.limit === 'number' ? args.limit : 50;
  const filterName = typeof args?.toolName === 'string' ? args.toolName : null;
  let entries = filterName ? history.filter(e => e.toolName === filterName) : history.slice();
  entries.reverse();
  if (entries.length > limit) entries = entries.slice(0, limit);
  return ok({ count: entries.length, total: history.length, entries });
}

async function handleClearHistory(args) {
  const previous = history.length;
  clearHistory();
  return ok({ status: 'ok', cleared: previous });
}

async function handleRegisterTestTools(args) {
  let resolved;
  try { resolved = resolveTabPage(args); }
  catch (e) { return err(e.message); }
  const { page: targetPage, tabId: targetTabId } = resolved;
  if (!targetPage || targetPage.isClosed()) {
    return err(`Tab ${targetTabId.slice(0, 8)} page is closed; navigate to recover it.`);
  }
  await targetPage.evaluate(() => {
    const ac = new AbortController();
    document.modelContext.registerTool({
      name: 'test_greet',
      description: 'Say hello to a person by name',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name to greet' } }, required: ['name'] },
      execute: ({ name }) => `Hello, ${name}! Welcome to WebMCP.`,
      annotations: { readOnlyHint: true },
    }, { signal: ac.signal });
    document.modelContext.registerTool({
      name: 'test_calculator',
      description: 'Add two numbers',
      inputSchema: { type: 'object', properties: { a: { type: 'number', description: 'First number' }, b: { type: 'number', description: 'Second number' } }, required: ['a', 'b'] },
      execute: ({ a, b }) => a + b,
      annotations: { readOnlyHint: true },
    }, { signal: ac.signal });
    document.modelContext.registerTool({
      name: 'test_fetch_title',
      description: 'Fetch a URL and return the page title',
      inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'URL to fetch' } }, required: ['url'] },
      execute: async ({ url }) => {
        const resp = await fetch(url);
        const html = await resp.text();
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1] : 'No title found';
      },
      annotations: { readOnlyHint: true },
    }, { signal: ac.signal });
  });
  await refreshTabTools(targetTabId);
  return ok({
    status: 'ok', tabId: targetTabId, registered: 3,
    toolNames: (cachedToolsByTab.get(targetTabId) || []).map(t => t.name),
  });
}

async function handleBridgeTool(name, args) {
  const handler = BRIDGE_HANDLERS[name];
  return handler ? await handler(args) : null;
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
  let error = null;
  let result;

  try {
    const bridgeResult = await handleBridgeTool(name, args);
    if (bridgeResult) {
      result = bridgeResult;
      if (bridgeResult.isError) {
        error = result.content?.map(c => c.text || '').join('\n') || 'tool returned isError';
      }
    } else {
      const inner = await executeWebMCPTool(name, args);
      const text = typeof inner === 'string' ? inner : JSON.stringify(inner, null, 2);
      result = { content: [{ type: 'text', text }] };
    }
  } catch (err) {
    error = err.message;
    result = { isError: true, content: [{ type: 'text', text: error }] };
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
  return result;
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
