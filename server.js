import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer from 'puppeteer-core';

// --- Configuration ---
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/chromium';
const TARGET_URL = process.env.WEBMCP_TARGET_URL || 'https://www.google.com';
const HEADLESS = process.env.WEBMCP_HEADLESS !== 'false';

// --- State ---
let browser = null;
let page = null;
/** @type {Array<{name:string,description:string,inputSchema:object}>} */
let cachedTools = [];

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
  page = await browser.newPage();

  // --- Monkey-patch: inject before any page script runs ---
  await page.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT);

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[page:error] ${msg.text()}`);
  });

  // Re-discover tools after navigation
  page.on('framenavigated', async () => {
    console.error(`[webmcp-bridge] Navigated to ${page.url()}`);
    cachedTools = await refreshTools();
    await notifyToolsChanged();
    console.error(`[webmcp-bridge] Discovered ${cachedTools.length} tools`);
  });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle0' });
  console.error(`[webmcp-bridge] Navigated to ${page.url()}`);

  cachedTools = await refreshTools();
  console.error(`[webmcp-bridge] Discovered ${cachedTools.length} WebMCP tools`);
  if (cachedTools.length === 0) {
    console.error(`[webmcp-bridge] No tools found — navigate to a WebMCP-enabled page via webmcp_navigate`);
  }
}

async function checkWebMCP() {
  try { return !!(page?.webmcp && typeof page.webmcp.tools === 'function'); } catch { return false; }
}

async function refreshTools() {
  try {
    if (!page || page.isClosed()) return [];
    if (!page?.webmcp || typeof page.webmcp.tools !== 'function') return [];
    const raw = await page.webmcp.tools();
    return (raw || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));
  } catch (err) {
    console.error(`[webmcp-bridge] refreshTools error: ${err.message}`);
    return [];
  }
}

// =========================================================================
// Bridge-native tools
// =========================================================================

const BRIDGE_TOOLS = [
  {
    name: 'webmcp_navigate',
    description: 'Navigate Chrome to a URL and refresh discovered WebMCP tools',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to navigate to' } },
      required: ['url'],
    },
  },
  {
    name: 'webmcp_status',
    description: 'Report WebMCP connection status, current page URL, and tool count',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'webmcp_evaluate',
    description: 'Execute arbitrary JavaScript on the page and return the result',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'JavaScript code to evaluate' } },
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
      },
      required: ['name'],
    },
  },
  {
    name: 'webmcp_register_test_tools',
    description: 'Register sample WebMCP tools for testing',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function ensurePage() {
  if (!page || page.isClosed()) {
    console.error('[webmcp-bridge] Page is closed/detached — creating new page');
    page = await browser.newPage();
    await page.evaluateOnNewDocument(MONKEY_PATCH_SCRIPT);
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[page:error] ${msg.text()}`);
    });
    page.on('framenavigated', async () => {
      console.error(`[webmcp-bridge] Navigated to ${page.url()}`);
      cachedTools = await refreshTools();
      await notifyToolsChanged();
      console.error(`[webmcp-bridge] Discovered ${cachedTools.length} tools`);
    });
    return true;
  }
  return false;
}

const MONKEY_PATCH_SCRIPT = () => {
  const poll = setInterval(() => {
    const mc = document.modelContext;
    if (mc && mc.registerTool) {
      clearInterval(poll);
      window.__webmcp_executors = new Map();
      const origRegister = mc.registerTool.bind(mc);
      mc.registerTool = (def, opts) => {
        if (def && typeof def.execute === 'function') {
          window.__webmcp_executors.set(def.name, def.execute);
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
    }
  }, 5);
};

async function handleBridgeTool(name, args) {
  switch (name) {
    case 'webmcp_navigate': {
      const url = args?.url;
      if (!url) return { isError: true, content: [{ type: 'text', text: 'Missing required argument: url' }] };
      await ensurePage();
      try {
        await page.goto(url, { waitUntil: 'networkidle0' });
      } catch (e) {
        if (e.message.includes('detached Frame')) {
          console.error(`[webmcp-bridge] Frame detached during navigate — re-creating page`);
          page = null;
          await ensurePage();
          await page.goto(url, { waitUntil: 'networkidle0' });
        } else {
          throw e;
        }
      }
      cachedTools = await refreshTools();
      await notifyToolsChanged();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 'ok', url: page.url(), toolsFound: cachedTools.length }, null, 2),
        }],
      };
    }

    case 'webmcp_status': {
      const wmAvail = await checkWebMCP();
      let patchReady = false;
      try {
        if (page && !page.isClosed() && wmAvail) {
          patchReady = await page.evaluate(() => window.__webmcp_bridge_patched || false).catch(() => false);
        }
      } catch { /* ignore detached frame */ }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected: !!(page && !page.isClosed()),
            url: page?.url() || null,
            webmcpAvailable: wmAvail,
            monkeyPatchActive: patchReady,
            toolCount: cachedTools.length,
            toolNames: cachedTools.map(t => t.name),
          }, null, 2),
        }],
      };
    }

    case 'webmcp_evaluate': {
      const code = args?.code;
      if (!code) return { isError: true, content: [{ type: 'text', text: 'Missing argument: code' }] };
      await ensurePage();
      const result = await page.evaluate((c) => eval(c), code);
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
      const result = await executeWebMCPTool(toolName, args?.args || {});
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    }

    case 'webmcp_register_test_tools': {
      await ensurePage();
      await page.evaluate(() => {
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
      cachedTools = await refreshTools();
      await notifyToolsChanged();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            registered: 3,
            toolNames: cachedTools.map(t => t.name),
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

async function executeWebMCPTool(toolName, args) {
  await ensurePage();
  let result;
  try {
    result = await page.evaluate(async (name, toolArgs) => {
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
      console.error(`[webmcp-bridge] Frame detached during execute — re-creating page`);
      page = null;
      await ensurePage();
      await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
      throw new Error(`Frame was detached; re-created page. Please try again.`);
    }
    throw e;
  }

  if (result && result.__bridge_error) {
    throw new Error(result.message);
  }
  return result;
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
  cachedTools = await refreshTools();
  return { tools: [...BRIDGE_TOOLS, ...cachedTools] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 1) Bridge-native tool
    const bridgeResult = await handleBridgeTool(name, args);
    if (bridgeResult) return bridgeResult;

    // 2) WebMCP tool from the page
    const result = await executeWebMCPTool(name, args);
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
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
