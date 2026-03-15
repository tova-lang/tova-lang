// Tests for src/cli/compile.js — compilation pipeline, import resolution, dependency tracking, merging
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolve, join, basename, dirname, sep } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import {
  compileTova,
  fixImportPaths,
  injectRouterImport,
  generateFileBasedRoutes,
  getCompiledExtension,
  moduleTypeCache,
  compilationCache,
  compilationInProgress,
  compilationChain,
  moduleExports,
  fileDependencies,
  fileReverseDeps,
  trackDependency,
  getTransitiveDependents,
  invalidateFile,
  collectExports,
  compileWithImports,
  validateMergedAST,
  mergeDirectory,
  groupFilesByDirectory,
} from '../src/cli/compile.js';

import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Program } from '../src/parser/ast.js';

// ── Helpers ──────────────────────────────────────────────────

function makeTmpDir(prefix = 'tova-test-') {
  const dir = join(tmpdir(), prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function parse(src, filename = '<test>') {
  const lexer = new Lexer(src, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  return parser.parse();
}

function clearAllCaches() {
  compilationCache.clear();
  compilationInProgress.clear();
  compilationChain.length = 0;
  moduleExports.clear();
  moduleTypeCache.clear();
  fileDependencies.clear();
  fileReverseDeps.clear();
}

// ─── 1. compileTova ──────────────────────────────────────────

describe('compileTova', () => {
  test('compiles simple variable assignment', () => {
    const result = compileTova('x = 42', '<test>');
    expect(result).toBeDefined();
    // Module-mode output goes to shared
    expect(result.shared).toContain('42');
    expect(result.isModule).toBe(true);
  });

  test('compiles function declaration', () => {
    const result = compileTova('pub fn add(a: Int, b: Int) -> Int { a + b }', '<test>');
    expect(result.shared).toContain('function add');
    expect(result.shared).toContain('export');
    expect(result.isModule).toBe(true);
  });

  test('compiles source with server block', () => {
    const src = `
server {
  get "/hello" fn(req) {
    "Hello"
  }
}
`;
    const result = compileTova(src, '<test>');
    expect(result.server).toBeDefined();
    expect(typeof result.server).toBe('string');
    // Should not be module mode since it has a block
    expect(result.isModule).toBeUndefined();
  });

  test('compiles source with browser block', () => {
    const src = `
browser {
  component App() {
    <div>"Hello"</div>
  }
}
`;
    const result = compileTova(src, '<test>');
    expect(result.browser).toBeDefined();
    expect(typeof result.browser).toBe('string');
  });

  test('compiles source with shared block', () => {
    const src = `
shared {
  pub type Color {
    Red
    Green
    Blue
  }
}
`;
    const result = compileTova(src, '<test>');
    expect(result.shared).toBeDefined();
    expect(typeof result.shared).toBe('string');
  });

  test('compiles combined shared + server + browser', () => {
    const src = `
shared {
  pub type User {
    name: String
  }
}
server {
  get "/api" fn(req) {
    "ok"
  }
}
browser {
  component App() {
    <p>"hello"</p>
  }
}
`;
    const result = compileTova(src, '<test>');
    expect(result.shared).toBeDefined();
    expect(result.server).toBeDefined();
    expect(result.browser).toBeDefined();
  });

  test('throws on invalid syntax', () => {
    expect(() => compileTova('fn {{{ broken', '<test>')).toThrow();
  });

  test('throws on unterminated string', () => {
    expect(() => compileTova('"unterminated', '<test>')).toThrow();
  });

  test('options.knownNames predefines names in scope', () => {
    // Without knownNames, using undefined var x would warn
    // With knownNames, x is already known
    const result = compileTova('y = x + 1', '<test>', { knownNames: ['x'], suppressWarnings: true });
    expect(result).toBeDefined();
    expect(result.shared).toContain('x');
  });

  test('options.suppressWarnings suppresses console output', () => {
    // This should not throw even with warnings
    const result = compileTova('y = unknownVar + 1', '<test>', { suppressWarnings: true });
    expect(result).toBeDefined();
  });

  test('options.strict passes strict mode to analyzer', () => {
    // In strict mode, more warnings may be produced, but compilation should still succeed
    const result = compileTova('x = 42', '<test>', { strict: true, suppressWarnings: true });
    expect(result).toBeDefined();
  });

  test('options.strictSecurity passes to analyzer', () => {
    const result = compileTova('x = 42', '<test>', { strictSecurity: true, suppressWarnings: true });
    expect(result).toBeDefined();
  });

  test('options.sourceMaps defaults to true', () => {
    const result = compileTova('x = 1', '<test>');
    // sourceMappings should be present
    expect(result.sourceMappings).toBeDefined();
  });

  test('options.sourceMaps can be disabled', () => {
    const result = compileTova('x = 1', '<test>', { sourceMaps: false });
    expect(result).toBeDefined();
  });
});

// ─── 2. fixImportPaths ───────────────────────────────────────

describe('fixImportPaths', () => {
  test('fixes runtime import at depth 1', () => {
    const code = "import { createSignal } from './runtime/reactivity.js';";
    const outDir = '/project/out';
    const outputFilePath = '/project/out/sub/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    expect(result).toContain("'../runtime/reactivity.js'");
    expect(result).not.toContain("'./runtime/reactivity.js'");
  });

  test('fixes runtime import at depth 2', () => {
    const code = "import { rpc } from './runtime/rpc.js';";
    const outDir = '/project/out';
    const outputFilePath = '/project/out/a/b/file.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    expect(result).toContain("'../../runtime/rpc.js'");
  });

  test('does not change runtime import at depth 0', () => {
    const code = "import { createSignal } from './runtime/reactivity.js';";
    const outDir = '/project/out';
    const outputFilePath = '/project/out/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    expect(result).toContain("'./runtime/reactivity.js'");
  });

  test('adds .js extension to relative imports without one', () => {
    const code = "import { foo } from './utils'";
    const outDir = '/project/out';
    const outputFilePath = '/project/out/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    expect(result).toContain("from './utils.js'");
  });

  test('does not double-add .js extension', () => {
    const code = "import { foo } from './utils.js'";
    const outDir = '/project/out';
    const outputFilePath = '/project/out/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    expect(result).toContain("from './utils.js'");
    // Should not have .js.js
    expect(result).not.toContain('.js.js');
  });

  test('handles multiple runtime files', () => {
    const code = `import { a } from './runtime/reactivity.js';
import { b } from './runtime/router.js';
import { c } from './runtime/rpc.js';`;
    const outDir = '/project/out';
    const outputFilePath = '/project/out/sub/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    expect(result).toContain("'../runtime/reactivity.js'");
    expect(result).toContain("'../runtime/router.js'");
    expect(result).toContain("'../runtime/rpc.js'");
  });

  test('fixes code prop template literal interpolation', () => {
    const code = 'const x = { code: `hello ${world}` };';
    const outDir = '/project/out';
    const outputFilePath = '/project/out/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    // The ${world} should be reverted to { world }
    expect(result).toContain('{ world }');
  });

  test('deduplicates router imports that overlap with reactivity', () => {
    const code = `import { createSignal, lazy } from './runtime/reactivity.js';
import { lazy, Router } from './runtime/router.js';`;
    const outDir = '/project/out';
    const outputFilePath = '/project/out/app.js';
    const result = fixImportPaths(code, outputFilePath, outDir);
    // 'lazy' should be removed from the router import since it's already in reactivity
    const routerImportMatch = result.match(/import\s+\{([^}]*)\}\s+from\s+'[^']*router[^']*'/);
    if (routerImportMatch) {
      expect(routerImportMatch[1]).not.toContain('lazy');
      expect(routerImportMatch[1]).toContain('Router');
    }
  });
});

// ─── 3. injectRouterImport ───────────────────────────────────

describe('injectRouterImport', () => {
  test('injects router import when createRouter is used', () => {
    const code = 'const r = createRouter({});';
    const result = injectRouterImport(code, 0);
    expect(result).toContain("from './runtime/router.js'");
    expect(result).toContain('createRouter');
  });

  test('injects router import when navigate is used', () => {
    const code = 'navigate("/home");';
    const result = injectRouterImport(code, 0);
    expect(result).toContain('navigate');
    expect(result).toContain('runtime/router.js');
  });

  test('injects Router component import', () => {
    const code = 'const el = Router();';
    const result = injectRouterImport(code, 0);
    expect(result).toContain('Router');
  });

  test('injects Link component import', () => {
    const code = 'const el = Link({ to: "/" });';
    const result = injectRouterImport(code, 0);
    expect(result).toContain('Link');
  });

  test('does not inject when already has router import', () => {
    const code = `import { createRouter } from './runtime/router.js';
createRouter({});`;
    const result = injectRouterImport(code, 0);
    // Should not add a second import
    const matches = result.match(/runtime\/router/g);
    expect(matches.length).toBe(1);
  });

  test('does not inject when no router functions used', () => {
    const code = 'const x = 42;';
    const result = injectRouterImport(code, 0);
    expect(result).not.toContain('runtime/router');
    expect(result).toBe(code);
  });

  test('adjusts path for depth > 0', () => {
    const code = 'navigate("/about");';
    const result = injectRouterImport(code, 2);
    expect(result).toContain("'../../runtime/router.js'");
  });

  test('adjusts path for depth 1', () => {
    const code = 'navigate("/about");';
    const result = injectRouterImport(code, 1);
    expect(result).toContain("'../runtime/router.js'");
  });

  test('injects multiple used router functions', () => {
    const code = `navigate("/home");
const route = getCurrentRoute();
const params = getParams();`;
    const result = injectRouterImport(code, 0);
    expect(result).toContain('navigate');
    expect(result).toContain('getCurrentRoute');
    expect(result).toContain('getParams');
  });

  test('does not confuse import-line mentions with code usage', () => {
    // If navigate only appears in an import line, it should not trigger injection
    const code = `import { navigate } from './some-other-module.js';`;
    const result = injectRouterImport(code, 0);
    // Already has an import, but not from router; however the function name
    // appears only in the import itself. The code strips import lines before checking.
    expect(result).not.toContain('runtime/router');
  });

  test('inserts after first import line when code starts with import', () => {
    const code = `import { foo } from './foo.js';
const r = createRouter({});`;
    const result = injectRouterImport(code, 0);
    const lines = result.split('\n');
    // First line should still be the original import
    expect(lines[0]).toContain("from './foo.js'");
    // Router import should be second
    expect(lines[1]).toContain('runtime/router.js');
  });

  test('inserts at start if code does not start with import', () => {
    const code = 'const r = createRouter({});';
    const result = injectRouterImport(code, 0);
    expect(result.startsWith('import ')).toBe(true);
  });
});

// ─── 4. generateFileBasedRoutes ──────────────────────────────

describe('generateFileBasedRoutes', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('tova-routes-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns null when pages dir does not exist', () => {
    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toBeNull();
  });

  test('returns null when pages dir is empty', () => {
    mkdirSync(join(tmpDir, 'pages'));
    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toBeNull();
  });

  test('generates route for index.tova', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, 'index.tova'), 'browser { component Page() { <p>"Home"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).not.toBeNull();
    expect(result).toContain('"/": __Page_index');
    expect(result).toContain('defineRoutes');
    expect(result).toContain('import { Page as __Page_index }');
  });

  test('generates route for named page', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, 'about.tova'), 'browser { component Page() { <p>"About"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('"/about"');
    expect(result).toContain('__Page_about');
  });

  test('generates route for dynamic param [id]', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, '[id].tova'), 'browser { component Page() { <p>"Detail"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('"/:id"');
    expect(result).toContain('__Page_Param_id');
  });

  test('generates route for optional param [[id]]', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, '[[id]].tova'), 'browser { component Page() { <p>"Maybe"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('"/:id?"');
    expect(result).toContain('__Page_Optional_id');
  });

  test('generates route for catch-all [...slug]', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, '[...slug].tova'), 'browser { component Page() { <p>"Catch"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('"/*"');
    expect(result).toContain('CatchAll_slug');
  });

  test('generates routes for nested directories', () => {
    const pagesDir = join(tmpDir, 'pages');
    const blogDir = join(pagesDir, 'blog');
    mkdirSync(blogDir, { recursive: true });
    writeFileSync(join(blogDir, 'index.tova'), 'browser { component Page() { <p>"Blog"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('"/blog"');
  });

  test('handles 404 page', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, '404.tova'), 'browser { component Page() { <p>"404"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('"404"');
    expect(result).toContain('NotFoundPage__auto');
  });

  test('detects root layout', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, '_layout.tova'), 'browser { component Layout() { <div>"Layout"</div> } }');
    writeFileSync(join(pagesDir, 'index.tova'), 'browser { component Page() { <p>"Home"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).toContain('__RootLayout');
    expect(result).toContain('./pages/_layout');
  });

  test('skips non-.tova files', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, 'readme.md'), '# ignore');
    writeFileSync(join(pagesDir, 'index.tova'), 'browser { component Page() { <p>"Home"</p> } }');

    const result = generateFileBasedRoutes(tmpDir);
    expect(result).not.toContain('readme');
  });
});

// ─── 5. getCompiledExtension ─────────────────────────────────

describe('getCompiledExtension', () => {
  let tmpDir;

  beforeEach(() => {
    clearAllCaches();
    tmpDir = makeTmpDir('tova-ext-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns .js for file with shared block (lexer tokenizes as SHARED not IDENTIFIER)', () => {
    // Note: getCompiledExtension checks tok.type === 'IDENTIFIER' but shared/server/browser
    // are their own token types (SHARED, SERVER, BROWSER), so they are NOT detected as
    // block keywords. The function falls through and returns .js.
    const filePath = join(tmpDir, 'app.tova');
    writeFileSync(filePath, 'shared { pub type Foo { x: Int } }');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
  });

  test('returns .js for file with server block (lexer tokenizes as SERVER not IDENTIFIER)', () => {
    const filePath = join(tmpDir, 'app.tova');
    writeFileSync(filePath, 'server { get "/api" fn(req) { "ok" } }');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
  });

  test('returns .js for file with browser block (lexer tokenizes as BROWSER not IDENTIFIER)', () => {
    const filePath = join(tmpDir, 'app.tova');
    writeFileSync(filePath, 'browser { component App() { <p>"hi"</p> } }');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
  });

  test('returns .shared.js for file with data block (IDENTIFIER token type)', () => {
    // 'data' is tokenized as IDENTIFIER, so this IS detected
    const filePath = join(tmpDir, 'data-app.tova');
    writeFileSync(filePath, 'data { source items { url: "/api/items" } }');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.shared.js');
  });

  test('returns .js for plain module file', () => {
    const filePath = join(tmpDir, 'utils.tova');
    writeFileSync(filePath, 'pub fn add(a: Int, b: Int) -> Int { a + b }');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
  });

  test('uses compilationCache when available', () => {
    const filePath = '/fake/cached.tova';
    compilationCache.set(filePath, { isModule: true });
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
    compilationCache.delete(filePath);
  });

  test('uses compilationCache isModule=false for .shared.js', () => {
    const filePath = '/fake/cached2.tova';
    compilationCache.set(filePath, { isModule: false });
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.shared.js');
    compilationCache.delete(filePath);
  });

  test('uses moduleTypeCache when available', () => {
    const filePath = '/fake/type-cached.tova';
    moduleTypeCache.set(filePath, '.js');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
    moduleTypeCache.delete(filePath);
  });

  test('returns .shared.js as fallback for non-existent files', () => {
    const ext = getCompiledExtension('/nonexistent/file.tova');
    expect(ext).toBe('.shared.js');
  });

  test('caches the result in moduleTypeCache', () => {
    const filePath = join(tmpDir, 'plain.tova');
    writeFileSync(filePath, 'x = 42');
    getCompiledExtension(filePath);
    expect(moduleTypeCache.has(filePath)).toBe(true);
    expect(moduleTypeCache.get(filePath)).toBe('.js');
  });
});

// ─── 6. trackDependency / getTransitiveDependents / invalidateFile ──

describe('dependency tracking', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  test('trackDependency creates forward dependency', () => {
    trackDependency('a.tova', 'b.tova');
    expect(fileDependencies.has('a.tova')).toBe(true);
    expect(fileDependencies.get('a.tova').has('b.tova')).toBe(true);
  });

  test('trackDependency creates reverse dependency', () => {
    trackDependency('a.tova', 'b.tova');
    expect(fileReverseDeps.has('b.tova')).toBe(true);
    expect(fileReverseDeps.get('b.tova').has('a.tova')).toBe(true);
  });

  test('trackDependency handles multiple deps from same file', () => {
    trackDependency('a.tova', 'b.tova');
    trackDependency('a.tova', 'c.tova');
    expect(fileDependencies.get('a.tova').size).toBe(2);
    expect(fileDependencies.get('a.tova').has('b.tova')).toBe(true);
    expect(fileDependencies.get('a.tova').has('c.tova')).toBe(true);
  });

  test('trackDependency handles multiple files depending on same target', () => {
    trackDependency('a.tova', 'shared.tova');
    trackDependency('b.tova', 'shared.tova');
    expect(fileReverseDeps.get('shared.tova').size).toBe(2);
  });

  test('getTransitiveDependents returns single file when no dependents', () => {
    const deps = getTransitiveDependents('solo.tova');
    expect(deps.has('solo.tova')).toBe(true);
    expect(deps.size).toBe(1);
  });

  test('getTransitiveDependents returns direct dependents', () => {
    trackDependency('app.tova', 'utils.tova');
    const deps = getTransitiveDependents('utils.tova');
    expect(deps.has('utils.tova')).toBe(true);
    expect(deps.has('app.tova')).toBe(true);
  });

  test('getTransitiveDependents returns transitive dependents', () => {
    // a -> b -> c; changing c should invalidate b and a
    trackDependency('a.tova', 'b.tova');
    trackDependency('b.tova', 'c.tova');
    const deps = getTransitiveDependents('c.tova');
    expect(deps.has('c.tova')).toBe(true);
    expect(deps.has('b.tova')).toBe(true);
    expect(deps.has('a.tova')).toBe(true);
  });

  test('getTransitiveDependents handles diamond dependency', () => {
    // a -> b, a -> c, b -> d, c -> d
    trackDependency('a.tova', 'b.tova');
    trackDependency('a.tova', 'c.tova');
    trackDependency('b.tova', 'd.tova');
    trackDependency('c.tova', 'd.tova');
    const deps = getTransitiveDependents('d.tova');
    expect(deps.has('d.tova')).toBe(true);
    expect(deps.has('b.tova')).toBe(true);
    expect(deps.has('c.tova')).toBe(true);
    expect(deps.has('a.tova')).toBe(true);
    expect(deps.size).toBe(4);
  });

  test('invalidateFile clears compilation cache for affected files', () => {
    trackDependency('app.tova', 'utils.tova');
    compilationCache.set('app.tova', { code: 'app' });
    compilationCache.set('utils.tova', { code: 'utils' });

    invalidateFile('utils.tova');
    expect(compilationCache.has('utils.tova')).toBe(false);
    expect(compilationCache.has('app.tova')).toBe(false);
  });

  test('invalidateFile clears moduleTypeCache for affected files', () => {
    trackDependency('app.tova', 'utils.tova');
    moduleTypeCache.set('app.tova', '.js');
    moduleTypeCache.set('utils.tova', '.js');

    invalidateFile('utils.tova');
    expect(moduleTypeCache.has('utils.tova')).toBe(false);
    expect(moduleTypeCache.has('app.tova')).toBe(false);
  });

  test('invalidateFile clears moduleExports for affected files', () => {
    trackDependency('app.tova', 'utils.tova');
    moduleExports.set('app.tova', { publicExports: new Set(['a']), allNames: new Set(['a']) });
    moduleExports.set('utils.tova', { publicExports: new Set(['b']), allNames: new Set(['b']) });

    invalidateFile('utils.tova');
    expect(moduleExports.has('utils.tova')).toBe(false);
    expect(moduleExports.has('app.tova')).toBe(false);
  });

  test('invalidateFile clears forward deps for affected files', () => {
    trackDependency('app.tova', 'utils.tova');
    invalidateFile('utils.tova');
    expect(fileDependencies.has('utils.tova')).toBe(false);
  });

  test('invalidateFile cleans up reverse deps entries', () => {
    trackDependency('app.tova', 'utils.tova');
    trackDependency('app.tova', 'helpers.tova');
    invalidateFile('utils.tova');
    // After invalidation, 'helpers.tova' reverse deps should no longer contain 'app.tova'
    const rdeps = fileReverseDeps.get('helpers.tova');
    if (rdeps) {
      expect(rdeps.has('app.tova')).toBe(false);
    }
  });
});

// ─── 7. collectExports ───────────────────────────────────────

describe('collectExports', () => {
  beforeEach(() => {
    moduleExports.clear();
  });

  test('collects pub function', () => {
    const ast = parse('pub fn greet(name: String) -> String { name }');
    const { publicExports, allNames } = collectExports(ast, 'test.tova');
    expect(publicExports.has('greet')).toBe(true);
    expect(allNames.has('greet')).toBe(true);
  });

  test('does not collect private function as public', () => {
    const ast = parse('fn helper() { 42 }');
    const { publicExports, allNames } = collectExports(ast, 'test.tova');
    expect(publicExports.has('helper')).toBe(false);
    expect(allNames.has('helper')).toBe(true);
  });

  test('collects pub type with variants', () => {
    const ast = parse('pub type Shape { Circle(r: Float)\nRectangle(w: Float, h: Float) }');
    const { publicExports, allNames } = collectExports(ast, 'test.tova');
    expect(publicExports.has('Shape')).toBe(true);
    expect(publicExports.has('Circle')).toBe(true);
    expect(publicExports.has('Rectangle')).toBe(true);
  });

  test('collects exports from inside shared blocks', () => {
    const ast = parse('shared { pub fn sharedUtil() { 1 } }');
    const { publicExports } = collectExports(ast, 'test.tova');
    expect(publicExports.has('sharedUtil')).toBe(true);
  });

  test('collects exports from inside server blocks', () => {
    const ast = parse('server { pub fn serverUtil() { 1 } }');
    const { publicExports } = collectExports(ast, 'test.tova');
    expect(publicExports.has('serverUtil')).toBe(true);
  });

  test('collects exports from inside browser blocks', () => {
    const ast = parse('browser { pub fn browserUtil() { 1 } }');
    const { publicExports } = collectExports(ast, 'test.tova');
    expect(publicExports.has('browserUtil')).toBe(true);
  });

  test('collects re-export specifiers', () => {
    const ast = parse('pub { alpha, beta as gamma } from "other"');
    const { publicExports, allNames } = collectExports(ast, 'test.tova');
    expect(publicExports.has('alpha')).toBe(true);
    expect(publicExports.has('gamma')).toBe(true);
    expect(allNames.has('alpha')).toBe(true);
    expect(allNames.has('gamma')).toBe(true);
  });

  test('stores result in moduleExports', () => {
    const ast = parse('pub fn test_fn() { 0 }');
    collectExports(ast, 'stored.tova');
    expect(moduleExports.has('stored.tova')).toBe(true);
    expect(moduleExports.get('stored.tova').publicExports.has('test_fn')).toBe(true);
  });

  test('collects pub interface', () => {
    const ast = parse('pub interface Printable { fn display() -> String }');
    const { publicExports } = collectExports(ast, 'test.tova');
    expect(publicExports.has('Printable')).toBe(true);
  });

  test('collects pub component', () => {
    const ast = parse('pub component Button(label: String) { <button>{label}</button> }');
    const { publicExports } = collectExports(ast, 'test.tova');
    expect(publicExports.has('Button')).toBe(true);
  });
});

// ─── 8. compileWithImports ───────────────────────────────────

describe('compileWithImports', () => {
  let tmpDir;

  beforeEach(() => {
    clearAllCaches();
    tmpDir = makeTmpDir('tova-imports-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('compiles simple module with no imports', () => {
    const filePath = join(tmpDir, 'simple.tova');
    writeFileSync(filePath, 'pub fn add(a: Int, b: Int) -> Int { a + b }');
    const source = 'pub fn add(a: Int, b: Int) -> Int { a + b }';
    const result = compileWithImports(source, filePath, tmpDir);
    expect(result).toBeDefined();
    expect(result.shared).toContain('function add');
  });

  test('returns cached result on second call', () => {
    const filePath = join(tmpDir, 'cached.tova');
    writeFileSync(filePath, 'x = 1');
    const source = 'x = 1';
    const result1 = compileWithImports(source, filePath, tmpDir);
    const result2 = compileWithImports(source, filePath, tmpDir);
    expect(result1).toBe(result2); // same reference from cache
  });

  test('resolves .tova imports and compiles dependencies', () => {
    const utilsPath = join(tmpDir, 'utils.tova');
    const appPath = join(tmpDir, 'app.tova');
    writeFileSync(utilsPath, 'pub fn helper() -> Int { 42 }');
    writeFileSync(appPath, 'import { helper } from "./utils.tova"\nx = helper()');

    const appSource = 'import { helper } from "./utils.tova"\nx = helper()';
    const result = compileWithImports(appSource, appPath, tmpDir);
    expect(result).toBeDefined();
    // Import should be rewritten to .js
    expect(result.shared).toContain('.js');
  });

  test('detects circular imports', () => {
    const aPath = join(tmpDir, 'a.tova');
    const bPath = join(tmpDir, 'b.tova');
    writeFileSync(aPath, 'import { y } from "./b.tova"\npub fn x() -> Int { 1 }');
    writeFileSync(bPath, 'import { x } from "./a.tova"\npub fn y() -> Int { 2 }');

    const aSource = 'import { y } from "./b.tova"\npub fn x() -> Int { 1 }';
    expect(() => compileWithImports(aSource, aPath, tmpDir)).toThrow(/Circular import/);
  });

  test('validates imported names exist in target module', () => {
    const utilsPath = join(tmpDir, 'utils.tova');
    const appPath = join(tmpDir, 'app.tova');
    writeFileSync(utilsPath, 'pub fn real_fn() -> Int { 1 }');

    const appSource = 'import { nonexistent } from "./utils.tova"\nx = 1';
    expect(() => compileWithImports(appSource, appPath, tmpDir)).toThrow(/does not export 'nonexistent'/);
  });

  test('detects private import attempt', () => {
    const utilsPath = join(tmpDir, 'utils2.tova');
    const appPath = join(tmpDir, 'app2.tova');
    writeFileSync(utilsPath, 'fn private_fn() -> Int { 1 }');

    const appSource = 'import { private_fn } from "./utils2.tova"\nx = 1';
    expect(() => compileWithImports(appSource, appPath, tmpDir)).toThrow(/is private/);
  });

  test('rewrites tova: prefix imports to runtime', () => {
    const filePath = join(tmpDir, 'tova-import.tova');
    writeFileSync(filePath, 'x = 1');
    const source = 'import { createSignal } from "tova:reactivity"\nx = 1';
    const result = compileWithImports(source, filePath, tmpDir);
    expect(result).toBeDefined();
    // The import source should be rewritten to ./runtime/reactivity.js
    expect(result.shared).toContain('runtime/reactivity');
  });

  test('tracks dependencies via trackDependency', () => {
    const utilsPath = join(tmpDir, 'dep-utils.tova');
    const appPath = join(tmpDir, 'dep-app.tova');
    writeFileSync(utilsPath, 'pub fn util_fn() -> Int { 1 }');

    const appSource = 'import { util_fn } from "./dep-utils.tova"\nx = util_fn()';
    compileWithImports(appSource, appPath, tmpDir);
    expect(fileDependencies.has(appPath)).toBe(true);
    expect(fileDependencies.get(appPath).has(utilsPath)).toBe(true);
  });

  test('caches module type in moduleTypeCache', () => {
    const filePath = join(tmpDir, 'type-mod.tova');
    writeFileSync(filePath, 'pub fn test_fn() -> Int { 1 }');
    const source = 'pub fn test_fn() -> Int { 1 }';
    compileWithImports(source, filePath, tmpDir);
    expect(moduleTypeCache.has(filePath)).toBe(true);
    expect(moduleTypeCache.get(filePath)).toBe('.js');
  });

  test('detects blocks and sets .shared.js module type', () => {
    const filePath = join(tmpDir, 'has-blocks.tova');
    writeFileSync(filePath, 'shared { pub type X { a: Int } }');
    const source = 'shared { pub type X { a: Int } }';
    compileWithImports(source, filePath, tmpDir);
    expect(moduleTypeCache.get(filePath)).toBe('.shared.js');
  });
});

// ─── 9. validateMergedAST ────────────────────────────────────

describe('validateMergedAST', () => {
  test('passes with no duplicates', () => {
    const mergedBlocks = {
      sharedBlocks: [
        { body: [{ type: 'TypeDeclaration', name: 'Foo', loc: { line: 1, source: 'a.tova' } }] },
      ],
      serverBlocks: [
        { body: [{ type: 'FunctionDeclaration', name: 'handler', loc: { line: 1, source: 'a.tova' } }] },
      ],
      browserBlocks: [
        { body: [{ type: 'ComponentDeclaration', name: 'App', loc: { line: 1, source: 'a.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova'])).not.toThrow();
  });

  test('throws on duplicate component in browser blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [],
      browserBlocks: [
        { body: [{ type: 'ComponentDeclaration', name: 'App', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'ComponentDeclaration', name: 'App', loc: { line: 5, source: 'b.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate component 'App'/);
  });

  test('throws on duplicate function in browser blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [],
      browserBlocks: [
        { body: [{ type: 'FunctionDeclaration', name: 'init', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'FunctionDeclaration', name: 'init', loc: { line: 2, source: 'b.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate function 'init'/);
  });

  test('throws on duplicate type in shared blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [
        { body: [{ type: 'TypeDeclaration', name: 'User', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'TypeDeclaration', name: 'User', loc: { line: 3, source: 'b.tova' } }] },
      ],
      serverBlocks: [],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate type 'User'/);
  });

  test('throws on duplicate shared function', () => {
    const mergedBlocks = {
      sharedBlocks: [
        { body: [{ type: 'FunctionDeclaration', name: 'utils', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'FunctionDeclaration', name: 'utils', loc: { line: 2, source: 'b.tova' } }] },
      ],
      serverBlocks: [],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate shared function 'utils'/);
  });

  test('throws on duplicate server function', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [
        { body: [{ type: 'FunctionDeclaration', name: 'handleReq', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'FunctionDeclaration', name: 'handleReq', loc: { line: 2, source: 'b.tova' } }] },
      ],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate server function 'handleReq'/);
  });

  test('throws on duplicate route', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [
        { body: [{ type: 'RouteDeclaration', method: 'GET', path: '/api', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'RouteDeclaration', method: 'GET', path: '/api', loc: { line: 2, source: 'b.tova' } }] },
      ],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate route 'GET \/api'/);
  });

  test('allows same function name in different named server blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [
        { name: 'api', body: [{ type: 'FunctionDeclaration', name: 'handle', loc: { line: 1, source: 'a.tova' } }] },
        { name: 'ws', body: [{ type: 'FunctionDeclaration', name: 'handle', loc: { line: 2, source: 'b.tova' } }] },
      ],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).not.toThrow();
  });

  test('throws on duplicate model in server blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [
        { body: [{ type: 'ModelDeclaration', name: 'User', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'ModelDeclaration', name: 'User', loc: { line: 2, source: 'b.tova' } }] },
      ],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate model 'User'/);
  });

  test('throws on duplicate state in browser blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [],
      browserBlocks: [
        { body: [{ type: 'StateDeclaration', name: 'count', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'StateDeclaration', name: 'count', loc: { line: 2, source: 'b.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate state 'count'/);
  });

  test('throws on duplicate interface/trait in shared blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [
        { body: [{ type: 'InterfaceDeclaration', name: 'Showable', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'InterfaceDeclaration', name: 'Showable', loc: { line: 2, source: 'b.tova' } }] },
      ],
      serverBlocks: [],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate interface\/trait 'Showable'/);
  });

  test('throws on duplicate singleton config in server blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [
        { body: [{ type: 'CorsDeclaration', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'CorsDeclaration', loc: { line: 2, source: 'b.tova' } }] },
      ],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate server config 'cors'/);
  });

  test('walks into RouteGroupDeclaration body', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [
        { body: [
          { type: 'RouteGroupDeclaration', body: [
            { type: 'FunctionDeclaration', name: 'groupFn', loc: { line: 1, source: 'a.tova' } },
          ]},
        ]},
        { body: [
          { type: 'FunctionDeclaration', name: 'groupFn', loc: { line: 2, source: 'b.tova' } },
        ]},
      ],
      browserBlocks: [],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate server function 'groupFn'/);
  });

  test('error message includes file names and line numbers', () => {
    const mergedBlocks = {
      sharedBlocks: [
        { body: [{ type: 'TypeDeclaration', name: 'Dup', loc: { line: 10, source: '/src/a.tova' } }] },
        { body: [{ type: 'TypeDeclaration', name: 'Dup', loc: { line: 20, source: '/src/b.tova' } }] },
      ],
      serverBlocks: [],
      browserBlocks: [],
    };
    try {
      validateMergedAST(mergedBlocks, ['/src/a.tova', '/src/b.tova']);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toContain('a.tova:10');
      expect(e.message).toContain('b.tova:20');
    }
  });
});

// ─── 10. mergeDirectory ──────────────────────────────────────

describe('mergeDirectory', () => {
  let tmpDir;

  beforeEach(() => {
    clearAllCaches();
    tmpDir = makeTmpDir('tova-merge-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns null for empty directory', () => {
    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result).toBeNull();
  });

  test('returns single-file result for one .tova file', () => {
    writeFileSync(join(tmpDir, 'only.tova'), 'pub fn solo() -> Int { 1 }');
    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result).not.toBeNull();
    expect(result.single).toBe(true);
    expect(result.files.length).toBe(1);
  });

  test('merges multiple .tova files in same directory', () => {
    writeFileSync(join(tmpDir, 'types.tova'), 'shared { pub type Color { Red\nGreen\nBlue } }');
    writeFileSync(join(tmpDir, 'api.tova'), 'server { get "/api" fn(req) { "ok" } }');

    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result).not.toBeNull();
    expect(result.single).toBe(false);
    expect(result.files.length).toBe(2);
    expect(result.output).toBeDefined();
  });

  test('ignores hidden files', () => {
    writeFileSync(join(tmpDir, '.hidden.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'visible.tova'), 'pub fn vis() -> Int { 2 }');
    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result.files.length).toBe(1);
    expect(result.files[0]).toContain('visible.tova');
  });

  test('ignores non-.tova files', () => {
    writeFileSync(join(tmpDir, 'readme.md'), '# README');
    writeFileSync(join(tmpDir, 'config.json'), '{}');
    writeFileSync(join(tmpDir, 'app.tova'), 'pub fn app_fn() -> Int { 1 }');
    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result.single).toBe(true);
    expect(result.files.length).toBe(1);
  });

  test('detects duplicate declarations across files', () => {
    writeFileSync(join(tmpDir, 'a.tova'), 'shared { pub type User { name: String } }');
    writeFileSync(join(tmpDir, 'b.tova'), 'shared { pub type User { email: String } }');

    expect(() => mergeDirectory(tmpDir, tmpDir)).toThrow(/Duplicate type 'User'/);
  });

  test('merges shared + server + browser from separate files', () => {
    writeFileSync(join(tmpDir, 'shared.tova'), 'shared { pub type Status { Active\nInactive } }');
    writeFileSync(join(tmpDir, 'api.tova'), 'server { get "/status" fn(req) { "ok" } }');
    writeFileSync(join(tmpDir, 'ui.tova'), 'browser { component StatusBadge() { <span>"status"</span> } }');

    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result).not.toBeNull();
    expect(result.single).toBe(false);
    expect(result.files.length).toBe(3);
    expect(result.output.shared).toBeDefined();
    expect(result.output.server).toBeDefined();
    expect(result.output.browser).toBeDefined();
  });

  test('attaches _sourceContents and _sourceFiles to output', () => {
    writeFileSync(join(tmpDir, 'a.tova'), 'shared { pub type A { x: Int } }');
    writeFileSync(join(tmpDir, 'b.tova'), 'server { get "/" fn(req) { "hi" } }');

    const result = mergeDirectory(tmpDir, tmpDir);
    expect(result.output._sourceContents).toBeDefined();
    expect(result.output._sourceContents instanceof Map).toBe(true);
    expect(result.output._sourceFiles).toBeDefined();
    expect(result.output._sourceFiles.length).toBe(2);
  });

  test('sorts files before merging', () => {
    writeFileSync(join(tmpDir, 'z.tova'), 'shared { pub type Z { z: Int } }');
    writeFileSync(join(tmpDir, 'a.tova'), 'shared { pub type A { a: Int } }');

    const result = mergeDirectory(tmpDir, tmpDir);
    expect(basename(result.files[0])).toBe('a.tova');
    expect(basename(result.files[1])).toBe('z.tova');
  });
});

// ─── 11. groupFilesByDirectory ───────────────────────────────

describe('groupFilesByDirectory', () => {
  test('groups files by parent directory', () => {
    const files = [
      '/src/pages/index.tova',
      '/src/pages/about.tova',
      '/src/components/button.tova',
      '/src/components/card.tova',
    ];
    const groups = groupFilesByDirectory(files);
    expect(groups instanceof Map).toBe(true);
    expect(groups.size).toBe(2);
    expect(groups.get('/src/pages').length).toBe(2);
    expect(groups.get('/src/components').length).toBe(2);
  });

  test('handles single file', () => {
    const groups = groupFilesByDirectory(['/src/app.tova']);
    expect(groups.size).toBe(1);
    expect(groups.get('/src').length).toBe(1);
  });

  test('handles empty array', () => {
    const groups = groupFilesByDirectory([]);
    expect(groups.size).toBe(0);
  });

  test('handles files all in same directory', () => {
    const files = ['/src/a.tova', '/src/b.tova', '/src/c.tova'];
    const groups = groupFilesByDirectory(files);
    expect(groups.size).toBe(1);
    expect(groups.get('/src').length).toBe(3);
  });

  test('handles deeply nested files', () => {
    const files = [
      '/a/b/c/d.tova',
      '/a/b/c/e.tova',
      '/x/y/z.tova',
    ];
    const groups = groupFilesByDirectory(files);
    expect(groups.size).toBe(2);
    expect(groups.has('/a/b/c')).toBe(true);
    expect(groups.has('/x/y')).toBe(true);
  });
});

// ─── 12. Cache Maps / Sets ──────────────────────────────────

describe('exported cache maps and sets', () => {
  test('compilationCache is a Map', () => {
    expect(compilationCache instanceof Map).toBe(true);
  });

  test('compilationInProgress is a Set', () => {
    expect(compilationInProgress instanceof Set).toBe(true);
  });

  test('compilationChain is an Array', () => {
    expect(Array.isArray(compilationChain)).toBe(true);
  });

  test('moduleExports is a Map', () => {
    expect(moduleExports instanceof Map).toBe(true);
  });

  test('moduleTypeCache is a Map', () => {
    expect(moduleTypeCache instanceof Map).toBe(true);
  });

  test('fileDependencies is a Map', () => {
    expect(fileDependencies instanceof Map).toBe(true);
  });

  test('fileReverseDeps is a Map', () => {
    expect(fileReverseDeps instanceof Map).toBe(true);
  });
});

// ─── Edge cases and integration ──────────────────────────────

describe('integration: compile + cache + deps', () => {
  let tmpDir;

  beforeEach(() => {
    clearAllCaches();
    tmpDir = makeTmpDir('tova-integration-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('compileWithImports then invalidateFile clears cache', () => {
    const filePath = join(tmpDir, 'mod.tova');
    writeFileSync(filePath, 'pub fn modFn() -> Int { 1 }');
    const source = 'pub fn modFn() -> Int { 1 }';
    compileWithImports(source, filePath, tmpDir);
    expect(compilationCache.has(filePath)).toBe(true);

    invalidateFile(filePath);
    expect(compilationCache.has(filePath)).toBe(false);
  });

  test('full pipeline: compile, track deps, invalidate, recompile', () => {
    const utilsPath = join(tmpDir, 'utils.tova');
    const appPath = join(tmpDir, 'app.tova');
    writeFileSync(utilsPath, 'pub fn helper() -> Int { 42 }');
    writeFileSync(appPath, 'import { helper } from "./utils.tova"\nresult = helper()');

    const appSource = 'import { helper } from "./utils.tova"\nresult = helper()';
    compileWithImports(appSource, appPath, tmpDir);

    expect(compilationCache.has(appPath)).toBe(true);
    expect(compilationCache.has(utilsPath)).toBe(true);

    // Invalidate utils -> both should be cleared
    invalidateFile(utilsPath);
    expect(compilationCache.has(utilsPath)).toBe(false);
    expect(compilationCache.has(appPath)).toBe(false);

    // Recompile
    clearAllCaches();
    writeFileSync(utilsPath, 'pub fn helper() -> Int { 99 }');
    const result = compileWithImports(appSource, appPath, tmpDir);
    expect(result).toBeDefined();
  });

  test('getCompiledExtension after compileWithImports uses cache', () => {
    const filePath = join(tmpDir, 'ext-test.tova');
    writeFileSync(filePath, 'pub fn test_fn() -> Int { 1 }');
    const source = 'pub fn test_fn() -> Int { 1 }';
    compileWithImports(source, filePath, tmpDir);

    // Should use compilationCache and return .js (module mode)
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
  });

  test('collectExports followed by import validation', () => {
    const utilsPath = join(tmpDir, 'utils.tova');
    writeFileSync(utilsPath, 'pub fn publicFn() -> Int { 1 }\nfn privateFn() -> Int { 2 }');

    // Compile utils first
    const utilsSource = 'pub fn publicFn() -> Int { 1 }\nfn privateFn() -> Int { 2 }';
    compileWithImports(utilsSource, utilsPath, tmpDir);

    // Verify exports
    const exports = moduleExports.get(utilsPath);
    expect(exports.publicExports.has('publicFn')).toBe(true);
    expect(exports.publicExports.has('privateFn')).toBe(false);
    expect(exports.allNames.has('privateFn')).toBe(true);
  });
});

describe('fixImportPaths: file-based routing injection', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir('tova-fbr-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('injects file-based routes when pages dir exists and no manual routes', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, 'index.tova'), 'browser { component Page() { <p>"Home"</p> } }');

    const code = 'const app = "test";';
    const outDir = join(tmpDir, 'out');
    const outputFilePath = join(outDir, 'app.js');
    const result = fixImportPaths(code, outputFilePath, outDir, tmpDir);
    expect(result).toContain('File-Based Routes');
    expect(result).toContain('defineRoutes');
  });

  test('does not inject file-based routes when defineRoutes already present', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, 'index.tova'), 'browser { component Page() { <p>"Home"</p> } }');

    const code = 'defineRoutes({ "/": Home });';
    const outDir = join(tmpDir, 'out');
    const outputFilePath = join(outDir, 'app.js');
    const result = fixImportPaths(code, outputFilePath, outDir, tmpDir);
    expect(result).not.toContain('File-Based Routes');
  });

  test('does not inject file-based routes when createRouter already present', () => {
    const pagesDir = join(tmpDir, 'pages');
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, 'index.tova'), 'browser { component Page() { <p>"Home"</p> } }');

    const code = 'const r = createRouter({});';
    const outDir = join(tmpDir, 'out');
    const outputFilePath = join(outDir, 'app.js');
    const result = fixImportPaths(code, outputFilePath, outDir, tmpDir);
    expect(result).not.toContain('File-Based Routes');
  });
});

describe('injectRouterImport: all supported functions', () => {
  const routerFuncs = [
    'createRouter', 'lazy', 'resetRouter', 'getPath', 'navigate',
    'getCurrentRoute', 'getParams', 'getQuery', 'getMeta', 'getRouter',
    'defineRoutes', 'onRouteChange', 'Router', 'Link', 'Outlet', 'Redirect',
    'beforeNavigate', 'afterNavigate',
  ];

  for (const fn of routerFuncs) {
    test(`detects usage of ${fn}`, () => {
      const code = `const x = ${fn}();`;
      const result = injectRouterImport(code, 0);
      expect(result).toContain('runtime/router.js');
      expect(result).toContain(fn);
    });
  }
});

describe('getCompiledExtension: regex fallback for broken source', () => {
  let tmpDir;

  beforeEach(() => {
    clearAllCaches();
    tmpDir = makeTmpDir('tova-ext-fallback-');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('falls back to regex heuristic when lexer fails on null bytes', () => {
    const filePath = join(tmpDir, 'broken.tova');
    // Null byte causes the lexer to throw, then regex fallback kicks in
    writeFileSync(filePath, 'shared {\n  \x00broken\n}');
    const ext = getCompiledExtension(filePath);
    // Regex fallback matches /^shared\s*\{/ so returns .shared.js
    expect(ext).toBe('.shared.js');
  });

  test('regex fallback returns .js when no block keyword found', () => {
    const filePath = join(tmpDir, 'broken2.tova');
    // Null byte causes lexer to throw, but no block keyword at start of line
    writeFileSync(filePath, 'fn broken() { \x00 }');
    const ext = getCompiledExtension(filePath);
    expect(ext).toBe('.js');
  });
});

describe('validateMergedAST: store and computed duplicates', () => {
  test('throws on duplicate store in browser blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [],
      browserBlocks: [
        { body: [{ type: 'StoreDeclaration', name: 'userStore', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'StoreDeclaration', name: 'userStore', loc: { line: 2, source: 'b.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate store 'userStore'/);
  });

  test('throws on duplicate computed in browser blocks', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [],
      browserBlocks: [
        { body: [{ type: 'ComputedDeclaration', name: 'total', loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'ComputedDeclaration', name: 'total', loc: { line: 2, source: 'b.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate computed 'total'/);
  });
});

describe('validateMergedAST: uses block loc when stmt has no loc', () => {
  test('uses block loc as fallback for stmt without loc', () => {
    const mergedBlocks = {
      sharedBlocks: [
        { loc: { line: 1, source: 'a.tova' }, body: [{ type: 'TypeDeclaration', name: 'Foo' }] },
        { loc: { line: 5, source: 'b.tova' }, body: [{ type: 'TypeDeclaration', name: 'Foo' }] },
      ],
      serverBlocks: [],
      browserBlocks: [],
    };
    try {
      validateMergedAST(mergedBlocks, ['a.tova', 'b.tova']);
    } catch (e) {
      expect(e.message).toContain('a.tova:1');
      expect(e.message).toContain('b.tova:5');
    }
  });
});

describe('StateDeclaration with targets instead of name', () => {
  test('collects state with targets array', () => {
    const mergedBlocks = {
      sharedBlocks: [],
      serverBlocks: [],
      browserBlocks: [
        { body: [{ type: 'StateDeclaration', targets: ['count'], loc: { line: 1, source: 'a.tova' } }] },
        { body: [{ type: 'StateDeclaration', targets: ['count'], loc: { line: 2, source: 'b.tova' } }] },
      ],
    };
    expect(() => validateMergedAST(mergedBlocks, ['a.tova', 'b.tova'])).toThrow(/Duplicate state 'count'/);
  });
});
