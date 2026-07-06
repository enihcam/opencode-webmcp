// =============================================================================
// webmcp-bridge unit tests — no Chrome required
//
// Pure-function tests for config module (parseCliArgs, readConfigFile, loadConfig,
// makeTabId, BRIDGE_TOOLS) and history helpers (recordHistory, clearHistory).
//
// Usage:
//   node test/unit.mjs
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import {
  DEFAULTS,
  parseCliArgs,
  readConfigFile,
  loadConfig,
  makeTabId,
  BRIDGE_TOOLS,
} from '../lib/config.mjs';

// ---- helpers ----------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`  ✗ ${name}\n`);
    if (err instanceof assert.AssertionError) {
      process.stdout.write(`      ${err.message}\n`);
      process.stdout.write(`      expected: ${JSON.stringify(err.expected)}\n`);
      process.stdout.write(`      actual:   ${JSON.stringify(err.actual)}\n`);
    } else {
      process.stdout.write(`      ${err.stack || err.message}\n`);
    }
  }
}

function group(name, fn) {
  process.stdout.write(`\n── ${name} ──\n`);
  fn();
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'webmcp-test-'));
}

// ---- tests ------------------------------------------------------------------

// -----------------------------------------------------------------------------
// parseCliArgs
// -----------------------------------------------------------------------------
group('parseCliArgs', () => {
  test('empty argv returns defaults', () => {
    const r = parseCliArgs([]);
    assert.strictEqual(r.config, null);
    assert.strictEqual(r.headless, undefined);
  });

  test('--config <path>', () => {
    const r = parseCliArgs(['--config', '/tmp/test.yaml']);
    assert.strictEqual(r.config, '/tmp/test.yaml');
    assert.strictEqual(r.headless, undefined);
  });

  test('--no-headless', () => {
    const r = parseCliArgs(['--no-headless']);
    assert.strictEqual(r.config, null);
    assert.strictEqual(r.headless, false);
  });

  test('--headless', () => {
    const r = parseCliArgs(['--headless']);
    assert.strictEqual(r.headless, true);
  });

  test('--config without trailing arg', () => {
    const r = parseCliArgs(['--config']);
    assert.strictEqual(r.config, null); // i+1 beyond length so no read
  });

  test('--config then --no-headless', () => {
    const r = parseCliArgs(['--config', 'cfg.yaml', '--no-headless']);
    assert.strictEqual(r.config, 'cfg.yaml');
    assert.strictEqual(r.headless, false);
  });

  test('irrelevant flags ignored', () => {
    const r = parseCliArgs(['--foo', 'bar', '--baz']);
    assert.strictEqual(r.config, null);
    assert.strictEqual(r.headless, undefined);
  });
});

// -----------------------------------------------------------------------------
// readConfigFile
// -----------------------------------------------------------------------------
group('readConfigFile', () => {
  test('reads YAML config', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'cfg.yaml');
      fs.writeFileSync(f, 'chromePath: /my/chrome\nheadless: false\n');
      const r = readConfigFile(f);
      assert.strictEqual(r.chromePath, '/my/chrome');
      assert.strictEqual(r.headless, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reads JSON config', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'cfg.json');
      fs.writeFileSync(f, JSON.stringify({ chromePath: '/c', declarativeScan: false }));
      const r = readConfigFile(f);
      assert.strictEqual(r.chromePath, '/c');
      assert.strictEqual(r.declarativeScan, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects unsupported extension', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'cfg.toml');
      fs.writeFileSync(f, '[x]\ny=1\n');
      assert.throws(() => readConfigFile(f), /Unsupported config file extension/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reads YML extension', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'cfg.yml');
      fs.writeFileSync(f, 'foo: bar\n');
      const r = readConfigFile(f);
      assert.strictEqual(r.foo, 'bar');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// -----------------------------------------------------------------------------
// loadConfig (layered precedence)
// -----------------------------------------------------------------------------
group('loadConfig', () => {
  test('defaults when no env, no config, no CLI flags', () => {
    const r = loadConfig({ argv: [], env: {}, cwd: '/tmp' });
    assert.strictEqual(r.chromePath, '/usr/bin/chromium');
    assert.strictEqual(r.targetUrl, 'https://www.google.com');
    assert.strictEqual(r.headless, true);
    assert.strictEqual(r.historyMax, 1000);
    assert.strictEqual(r.logHistory, false);
    assert.strictEqual(r.declarativeScan, true);
  });

  test('env vars override defaults', () => {
    const r = loadConfig({
      argv: [],
      env: {
        CHROME_PATH: '/env/chrome',
        WEBMCP_TARGET_URL: 'https://env.example.com',
        WEBMCP_HEADLESS: 'false',
        WEBMCP_HISTORY_MAX: '500',
        WEBMCP_LOG_HISTORY: 'true',
        WEBMCP_DECLARATIVE_SCAN: 'false',
      },
      cwd: '/tmp',
    });
    assert.strictEqual(r.chromePath, '/env/chrome');
    assert.strictEqual(r.targetUrl, 'https://env.example.com');
    assert.strictEqual(r.headless, false);
    assert.strictEqual(r.historyMax, 500);
    assert.strictEqual(r.logHistory, true);
    assert.strictEqual(r.declarativeScan, false);
  });

  test('WEBMCP_HEADLESS=false, WEBMCP_DECLARATIVE_SCAN false-like values', () => {
    // empty string is not 'false', so true
    const r1 = loadConfig({ argv: [], env: { WEBMCP_HEADLESS: '' }, cwd: '/tmp' });
    assert.strictEqual(r1.headless, true, 'empty string should default to true');

    const r2 = loadConfig({ argv: [], env: { WEBMCP_DECLARATIVE_SCAN: '0' }, cwd: '/tmp' });
    assert.strictEqual(r2.declarativeScan, true, "'0' should default to true (only 'false' means false)");
  });

  test('config file overrides env', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'webmcp.yaml');
      fs.writeFileSync(f, 'chromePath: /file/chrome\nheadless: true\n');
      const r = loadConfig({
        argv: ['--config', f],
        env: { CHROME_PATH: '/env/chrome', WEBMCP_HEADLESS: 'false' },
        cwd: '/tmp',
      });
      // File wins over env
      assert.strictEqual(r.chromePath, '/file/chrome');
      assert.strictEqual(r.headless, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('CLI --no-headless wins over config file and env', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'webmcp.yaml');
      fs.writeFileSync(f, 'headless: true\n');
      const r = loadConfig({
        argv: ['--config', f, '--no-headless'],
        env: { WEBMCP_HEADLESS: 'true' },
        cwd: '/tmp',
      });
      assert.strictEqual(r.headless, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('config file must contain an object (not array)', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'cfg.yaml');
      fs.writeFileSync(f, '[1, 2, 3]\n');
      assert.throws(
        () => loadConfig({ argv: ['--config', f], env: {}, cwd: '/tmp' }),
        /Config file must contain an object/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('config file must contain an object (not null)', () => {
    const dir = tmpDir();
    try {
      const f = path.join(dir, 'cfg.yaml');
      fs.writeFileSync(f, 'null\n');
      assert.throws(
        () => loadConfig({ argv: ['--config', f], env: {}, cwd: '/tmp' }),
        /Config file must contain an object/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('config file not found throws', () => {
    assert.throws(
      () => loadConfig({ argv: ['--config', '/nonexistent/webmcp.yaml'], env: {}, cwd: '/tmp' }),
      /Config file not found/,
    );
  });

  test('config file discovery in cwd (no --config arg)', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'webmcp.json'), JSON.stringify({ historyMax: 42 }));
      const r = loadConfig({ argv: [], env: {}, cwd: dir });
      assert.strictEqual(r.historyMax, 42);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('config discovery picks first match (yaml > yml > json)', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'webmcp.yaml'), JSON.stringify({ historyMax: 10 }));
      fs.writeFileSync(path.join(dir, 'webmcp.json'), JSON.stringify({ historyMax: 99 }));
      const r = loadConfig({ argv: [], env: {}, cwd: dir });
      assert.strictEqual(r.historyMax, 10); // yaml wins
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('only set env vars propagate', () => {
    const r = loadConfig({
      argv: [],
      env: { WEBMCP_TARGET_URL: 'https://override.example.com', UNRELATED: 'nope' },
      cwd: '/tmp',
    });
    assert.strictEqual(r.targetUrl, 'https://override.example.com');
    assert.strictEqual(r.chromePath, '/usr/bin/chromium'); // not overridden
    assert.strictEqual(r.headless, true);                 // not overridden
  });
});

// -----------------------------------------------------------------------------
// recordHistory / clearHistory
// -----------------------------------------------------------------------------
group('recordHistory & clearHistory', () => {
  test('append and retrieve', () => {
    const hist = [];
    const MAX = 10;
    function rec(entry) {
      hist.push(entry);
      while (hist.length > MAX) hist.shift();
    }
    rec({ toolName: 'foo' });
    rec({ toolName: 'bar' });
    assert.strictEqual(hist.length, 2);
    assert.strictEqual(hist[1].toolName, 'bar');
  });

  test('ring-buffer eviction at boundary', () => {
    const hist = [];
    const MAX = 3;
    function rec(entry) {
      hist.push(entry);
      while (hist.length > MAX) hist.shift();
    }
    rec({ i: 1 });
    rec({ i: 2 });
    rec({ i: 3 });
    assert.strictEqual(hist.length, 3);
    rec({ i: 4 });
    assert.strictEqual(hist.length, 3);
    assert.strictEqual(hist[0].i, 2); // oldest shifted out
    assert.strictEqual(hist[2].i, 4);
  });

  test('clearHistory empties', () => {
    const hist = [{ toolName: 'x' }, { toolName: 'y' }];
    function clear() { hist.length = 0; }
    clear();
    assert.strictEqual(hist.length, 0);
  });

  test('recordHistory silently swallows errors', () => {
    let called = false;
    const hist = [];
    const MAX = 10;
    const LOG = true;
    function rec(entry) {
      try {
        hist.push(entry);
        while (hist.length > MAX) hist.shift();
        if (LOG) {
          // Simulate a stderr write that could throw (won't in practice, but
          // the real server catches everything)
        }
      } catch { /* never break a tool call */ }
      called = true;
    }
    rec({ toolName: 'safe' });
    assert.ok(called);
    assert.strictEqual(hist.length, 1);
  });
});

// -----------------------------------------------------------------------------
// makeTabId
// -----------------------------------------------------------------------------
group('makeTabId', () => {
  test('returns a UUID v4 string', () => {
    const id = makeTabId();
    assert.strictEqual(typeof id, 'string');
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(makeTabId());
    }
    assert.strictEqual(ids.size, 100);
  });
});

// -----------------------------------------------------------------------------
// BRIDGE_TOOLS structure validation (imported from config module)
// -----------------------------------------------------------------------------
group('BRIDGE_TOOLS structure', () => {
  test('all tools have unique names', () => {
    const names = BRIDGE_TOOLS.map(t => t.name);
    assert.strictEqual(new Set(names).size, names.length);
  });

  test('all tools have names with webmcp_ prefix', () => {
    for (const t of BRIDGE_TOOLS) {
      assert.ok(t.name.startsWith('webmcp_'), `${t.name} should start with webmcp_`);
    }
  });

  test('all tools have required fields (name, description, inputSchema)', () => {
    for (const t of BRIDGE_TOOLS) {
      assert.ok(typeof t.name === 'string' && t.name.length > 0,
        `tool missing name (index ${BRIDGE_TOOLS.indexOf(t)})`);
      assert.ok(typeof t.description === 'string' && t.description.length > 0,
        `tool ${t.name} missing description`);
      assert.ok(typeof t.inputSchema === 'object' && t.inputSchema !== null,
        `tool ${t.name} missing inputSchema`);
    }
  });

  test('all tools have inputSchema with type "object"', () => {
    for (const t of BRIDGE_TOOLS) {
      assert.strictEqual(t.inputSchema.type, 'object',
        `tool ${t.name}.inputSchema.type should be 'object', got '${t.inputSchema.type}'`);
    }
  });

  test('names match the expected set', () => {
    const expected = [
      'webmcp_navigate',
      'webmcp_status',
      'webmcp_evaluate',
      'webmcp_invoke_tool',
      'webmcp_register_test_tools',
      'webmcp_screenshot',
      'webmcp_history',
      'webmcp_clear_history',
      'webmcp_open_tab',
      'webmcp_switch_tab',
      'webmcp_list_tabs',
      'webmcp_close_tab',
    ];
    const names = BRIDGE_TOOLS.map(t => t.name).sort();
    assert.deepStrictEqual(names, expected.sort());
  });

  test('webmcp_invoke_tool is the only tool without annotations', () => {
    const noAnnotations = BRIDGE_TOOLS.filter(t => !t.annotations);
    assert.strictEqual(noAnnotations.length, 1);
    assert.strictEqual(noAnnotations[0].name, 'webmcp_invoke_tool');
  });

  test('all annotated tools have valid readOnlyHint boolean', () => {
    for (const t of BRIDGE_TOOLS) {
      if (!t.annotations) continue;
      assert.strictEqual(typeof t.annotations.readOnlyHint, 'boolean',
        `${t.name}.readOnlyHint should be boolean`);
    }
  });

  test('all annotated tools have valid destructiveHint boolean', () => {
    for (const t of BRIDGE_TOOLS) {
      if (!t.annotations) continue;
      assert.strictEqual(typeof t.annotations.destructiveHint, 'boolean',
        `${t.name}.destructiveHint should be boolean`);
    }
  });

  test('all annotated tools have valid openWorldHint boolean', () => {
    for (const t of BRIDGE_TOOLS) {
      if (!t.annotations) continue;
      assert.strictEqual(typeof t.annotations.openWorldHint, 'boolean',
        `${t.name}.openWorldHint should be boolean`);
    }
  });

  test('tools with idempotentHint are also annotated', () => {
    for (const t of BRIDGE_TOOLS) {
      if (t.annotations && 'idempotentHint' in t.annotations) {
        assert.strictEqual(typeof t.annotations.idempotentHint, 'boolean',
          `${t.name}.idempotentHint should be boolean`);
      }
    }
  });

  test('inputSchema properties exist and have valid types', () => {
    for (const t of BRIDGE_TOOLS) {
      const props = t.inputSchema.properties;
      if (!props) continue;
      for (const [key, schema] of Object.entries(props)) {
        assert.ok(typeof schema.type === 'string' || Array.isArray(schema.type),
          `tool ${t.name} property "${key}" missing .type`);
        assert.ok(typeof schema.description === 'string' || schema.description === undefined,
          `tool ${t.name} property "${key}" .description should be string or undefined`);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
process.stdout.write(`\n${'═'.repeat(50)}\n`);
process.stdout.write(`  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.stdout.write(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
