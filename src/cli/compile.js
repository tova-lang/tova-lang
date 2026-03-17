// src/cli/compile.js — Shared compilation pipeline
import { resolve, basename, dirname, join, relative, sep, extname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { createRequire as _createRequire } from 'module';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Analyzer } from '../analyzer/analyzer.js';
import { Symbol } from '../analyzer/scope.js';
import { Program } from '../parser/ast.js';
import { CodeGenerator } from '../codegen/codegen.js';
import { richError, formatDiagnostics, DiagnosticFormatter, formatSummary } from '../diagnostics/formatter.js';
import { buildSelectiveStdlib, BUILTIN_NAMES } from '../stdlib/inline.js';
import { findFiles } from './utils.js';

export function compileTova(source, filename, options = {}) {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens, filename);
  const ast = parser.parse();

  const analyzer = new Analyzer(ast, filename, { strict: options.strict || false, strictSecurity: options.strictSecurity || false });
  // Pre-define extra names in the analyzer scope (used by REPL for cross-line persistence)
  if (options.knownNames) {
    for (const name of options.knownNames) {
      analyzer.globalScope.define(name, new Symbol(name, 'variable', null, true, { line: 0, column: 0, file: '<repl>' }));
    }
  }
  const { warnings } = analyzer.analyze();

  if (warnings.length > 0 && !options.suppressWarnings) {
    const formatter = new DiagnosticFormatter(source, filename);
    for (const w of warnings) {
      console.warn(formatter.formatWarning(w.message, { line: w.line, column: w.column }, { hint: w.hint, code: w.code, length: w.length, fix: w.fix }));
    }
  }

  const codegen = new CodeGenerator(ast, filename, { sourceMaps: options.sourceMaps !== false });
  return codegen.generate();
}

export function fixImportPaths(code, outputFilePath, outDir, srcDir) {
  const relPath = relative(outDir, outputFilePath);
  const depth = dirname(relPath).split(sep).filter(p => p && p !== '.').length;

  // Fix runtime imports: './runtime/X.js' → correct relative path based on depth
  if (depth > 0) {
    const prefix = '../'.repeat(depth);
    for (const runtimeFile of ['reactivity.js', 'rpc.js', 'router.js', 'devtools.js', 'ssr.js', 'testing.js']) {
      code = code.split("'./runtime/" + runtimeFile + "'").join("'" + prefix + "runtime/" + runtimeFile + "'");
      code = code.split('"./runtime/' + runtimeFile + '"').join('"' + prefix + 'runtime/' + runtimeFile + '"');
    }
  }

  // Add .js extension to relative imports that don't have one
  code = code.replace(
    /from\s+(['"])(\.[^'"]+)\1/g,
    (match, quote, path) => {
      if (path.endsWith('.js')) return match;
      return 'from ' + quote + path + '.js' + quote;
    }
  );

  // Inject missing router imports
  code = injectRouterImport(code, depth);

  // Fix duplicate identifiers between reactivity and router imports (e.g. 'lazy')
  const reactivityMatch = code.match(/^import\s+\{([^}]+)\}\s+from\s+['"][^'"]*runtime\/reactivity[^'"]*['"]/m);
  const routerMatch = code.match(/^(import\s+\{)([^}]+)(\}\s+from\s+['"][^'"]*runtime\/router[^'"]*['"])/m);
  if (reactivityMatch && routerMatch) {
    const reactivityNames = new Set(reactivityMatch[1].split(',').map(s => s.trim()));
    const routerNames = routerMatch[2].split(',').map(s => s.trim());
    const deduped = routerNames.filter(n => !reactivityNames.has(n));
    if (deduped.length < routerNames.length) {
      if (deduped.length === 0) {
        // Remove the entire router import line if nothing left
        code = code.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]*runtime\/router[^'"]*['"];?\s*\n?/m, '');
      } else {
        code = code.replace(routerMatch[0], routerMatch[1] + ' ' + deduped.join(', ') + ' ' + routerMatch[3]);
      }
    }
  }

  // Fix CodeBlock/code prop template literal interpolation: the compiler treats {identifier}
  // inside string attributes as interpolation, generating `${identifier}` in template literals.
  // For code example strings, these should be literal braces. Revert them.
  code = code.replace(/code:\s*`([\s\S]*?)`/g, (match, content) => {
    if (!content.includes('${')) return match;
    const fixed = content.replace(/\$\{(\w+)\}/g, '{ $1 }');
    // Convert template literal to regular string with escaped quotes and newlines
    return 'code: "' + fixed.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  });

  // File-based routing: inject routes if src/pages/ exists and no manual routes defined
  if (srcDir && !(/\b(defineRoutes|createRouter)\s*\(/.test(code))) {
    const fileRoutes = generateFileBasedRoutes(srcDir);
    if (fileRoutes) {
      // Convert Tova-style imports to JS imports with .js extensions
      const jsRoutes = fileRoutes
        .replace(/from\s+"([^"]+)"/g, (m, p) => 'from "' + p + '.js"');
      // Inject before the last closing function or at the end
      code = code + '\n// ── File-Based Routes (auto-generated from src/pages/) ──\n' + jsRoutes + '\n';
    }
  }

  return code;
}

export function injectRouterImport(code, depth) {
  const routerFuncs = ['createRouter', 'lazy', 'resetRouter', 'getPath', 'navigate',
                       'getCurrentRoute', 'getParams', 'getQuery', 'getMeta', 'getRouter',
                       'defineRoutes', 'onRouteChange', 'Router', 'Link', 'Outlet', 'Redirect',
                       'beforeNavigate', 'afterNavigate'];
  const hasRouterImport = /runtime\/router/.test(code);
  if (hasRouterImport) return code;

  // Strip import lines before checking for router function usage to avoid false positives
  const codeWithoutImports = code.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, '');
  const usedFuncs = routerFuncs.filter(fn => new RegExp('\\b' + fn + '\\b').test(codeWithoutImports));
  if (usedFuncs.length === 0) return code;

  const routerPath = depth === 0
    ? './runtime/router.js'
    : '../'.repeat(depth) + 'runtime/router.js';

  const importLine = "import { " + usedFuncs.join(', ') + " } from '" + routerPath + "';\n";

  // Insert after first import line, or at the start
  const firstImportEnd = code.indexOf(';\n');
  if (firstImportEnd !== -1 && code.trimStart().startsWith('import ')) {
    return code.slice(0, firstImportEnd + 2) + importLine + code.slice(firstImportEnd + 2);
  }
  return importLine + code;
}

// ─── File-Based Routing ──────────────────────────────────────

export function generateFileBasedRoutes(srcDir) {
  const pagesDir = join(srcDir, 'pages');
  if (!existsSync(pagesDir) || !statSync(pagesDir).isDirectory()) return null;

  // Scan pages directory recursively
  const routes = [];
  let hasLayout = false;
  let has404 = false;

  function scanDir(dir, prefix) {
    const entries = readdirSync(dir).sort();
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Check for layout in subdirectory
        const subLayout = join(fullPath, '_layout.tova');
        if (existsSync(subLayout)) {
          const childRoutes = [];
          scanDir(fullPath, prefix + '/' + entry);
          // Layout routes handled via nested children
          continue;
        }
        scanDir(fullPath, prefix + '/' + entry);
        continue;
      }

      if (!entry.endsWith('.tova')) continue;
      const name = entry.replace('.tova', '');

      // Skip layout files (handled separately)
      if (name === '_layout') {
        if (prefix === '') hasLayout = true;
        continue;
      }

      // 404 page
      if (name === '404') {
        has404 = true;
        const relImport = './pages' + (prefix ? prefix + '/' : '/') + name;
        routes.push({ path: '404', importPath: relImport, componentName: 'NotFoundPage__auto' });
        continue;
      }

      // Determine route path
      let routePath;
      if (name === 'index') {
        routePath = prefix || '/';
      } else if (name.startsWith('[...') && name.endsWith(']')) {
        // Catch-all: [...slug] → *
        routePath = prefix + '/*';
      } else if (name.startsWith('[[') && name.endsWith(']]')) {
        // Optional param: [[id]] → /:id?
        const paramName = name.slice(2, -2);
        routePath = prefix + '/:' + paramName + '?';
      } else if (name.startsWith('[') && name.endsWith(']')) {
        // Dynamic param: [id] → /:id
        const paramName = name.slice(1, -1);
        routePath = prefix + '/:' + paramName;
      } else {
        routePath = prefix + '/' + name;
      }

      const relImport = './pages' + (prefix ? prefix + '/' : '/') + name;
      // Generate safe component name from path
      const safeName = name
        .replace(/\[\.\.\.(\w+)\]/, 'CatchAll_$1')
        .replace(/\[\[(\w+)\]\]/, 'Optional_$1')
        .replace(/\[(\w+)\]/, 'Param_$1')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      const componentName = '__Page_' + (prefix ? prefix.slice(1).replace(/\//g, '_') + '_' : '') + safeName;

      routes.push({ path: routePath, importPath: relImport, componentName });
    }
  }

  scanDir(pagesDir, '');

  if (routes.length === 0) return null;

  // Generate import statements and route map
  const imports = routes.map(r =>
    'import { Page as ' + r.componentName + ' } from "' + r.importPath + '"'
  ).join('\n');

  const routeEntries = routes.map(r =>
    '    "' + r.path + '": ' + r.componentName + ','
  ).join('\n');

  // Check for root layout
  let layoutImport = '';
  let layoutWrap = '';
  if (hasLayout) {
    layoutImport = '\nimport { Layout as __RootLayout } from "./pages/_layout"';
    // With layout, wrap routes as children
    // For now, just generate flat routes — layout support can be added later
  }

  const generated = imports + layoutImport + '\n\n' +
    'defineRoutes({\n' + routeEntries + '\n})';

  return generated;
}

export const moduleTypeCache = new Map(); // tovaPath -> '.js' | '.shared.js'

export function getCompiledExtension(tovaPath) {
  // Check compilation cache first
  if (compilationCache.has(tovaPath)) {
    return compilationCache.get(tovaPath).isModule ? '.js' : '.shared.js';
  }
  // Check module type cache (set during parsing)
  if (moduleTypeCache.has(tovaPath)) {
    return moduleTypeCache.get(tovaPath);
  }
  // Fall back: quick-lex the file to detect block keywords at top level
  if (existsSync(tovaPath)) {
    const src = readFileSync(tovaPath, 'utf-8');
    try {
      const lexer = new Lexer(src, tovaPath);
      const tokens = lexer.tokenize();
      // Check if any top-level token is a block keyword (shared/server/client/test/bench/data)
      const BLOCK_KEYWORDS = new Set(['shared', 'server', 'client', 'browser', 'test', 'bench', 'data']);
      let depth = 0;
      for (const tok of tokens) {
        if (tok.type === 'LBRACE') depth++;
        else if (tok.type === 'RBRACE') depth--;
        else if (depth === 0 && tok.type === 'IDENTIFIER' && BLOCK_KEYWORDS.has(tok.value)) {
          moduleTypeCache.set(tovaPath, '.shared.js');
          return '.shared.js';
        }
      }
      moduleTypeCache.set(tovaPath, '.js');
      return '.js';
    } catch {
      // If lexing fails, fall back to regex heuristic
      if (/^(?:shared|server|client|test|bench|data)\s*(?:\{|")/m.test(src)) {
        return '.shared.js';
      }
      return '.js';
    }
  }
  return '.shared.js'; // default fallback
}

export const compilationCache = new Map();
export const compilationInProgress = new Set();
export const compilationChain = []; // ordered import chain for circular import error messages

// Track module exports for cross-file import validation
export const moduleExports = new Map();

// Dependency graph: file -> Set of files it imports (forward deps)
export const fileDependencies = new Map();
// Reverse dependency graph: file -> Set of files that import it
export const fileReverseDeps = new Map();

export function trackDependency(fromFile, toFile) {
  if (!fileDependencies.has(fromFile)) fileDependencies.set(fromFile, new Set());
  fileDependencies.get(fromFile).add(toFile);
  if (!fileReverseDeps.has(toFile)) fileReverseDeps.set(toFile, new Set());
  fileReverseDeps.get(toFile).add(fromFile);
}

// Get all files that transitively depend on changedFile
export function getTransitiveDependents(changedFile) {
  const dependents = new Set();
  const queue = [changedFile];
  while (queue.length > 0) {
    const file = queue.pop();
    dependents.add(file);
    const rdeps = fileReverseDeps.get(file);
    if (rdeps) {
      for (const dep of rdeps) {
        if (!dependents.has(dep)) queue.push(dep);
      }
    }
  }
  return dependents;
}

export function invalidateFile(changedPath) {
  const toInvalidate = getTransitiveDependents(changedPath);
  for (const file of toInvalidate) {
    compilationCache.delete(file);
    moduleTypeCache.delete(file);
    moduleExports.delete(file);
    // Clear forward deps (will be rebuilt on recompile)
    const deps = fileDependencies.get(file);
    if (deps) {
      for (const dep of deps) {
        const rdeps = fileReverseDeps.get(dep);
        if (rdeps) rdeps.delete(file);
      }
      fileDependencies.delete(file);
    }
  }
}

export function collectExports(ast, filename) {
  const publicExports = new Set();
  const allNames = new Set();

  function collectFromNode(node) {
    if (node.type === 'FunctionDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'Assignment' && node.targets) {
      for (const t of node.targets) {
        allNames.add(t);
        if (node.isPublic) publicExports.add(t);
      }
    }
    if (node.type === 'TypeDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
      if (node.variants) {
        for (const v of node.variants) {
          if (v.type === 'TypeVariant') {
            allNames.add(v.name);
            if (node.isPublic) publicExports.add(v.name);
          }
        }
      }
    }
    if (node.type === 'VarDeclaration' && node.targets) {
      for (const t of node.targets) {
        allNames.add(t);
        if (node.isPublic) publicExports.add(t);
      }
    }
    if (node.type === 'InterfaceDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'TraitDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'TypeAlias') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'ComponentDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'ImplDeclaration') { /* impl doesn't export a name */ }
    if (node.type === 'ReExportDeclaration') {
      if (node.specifiers) {
        // Named re-exports: pub { a, b as c } from "module"
        for (const spec of node.specifiers) {
          publicExports.add(spec.exported);
          allNames.add(spec.exported);
        }
      }
      // Wildcard re-exports: pub * from "module" — can't enumerate statically,
      // but mark as having re-exports so import validation can allow through
    }
    if (node.type === 'ExportDefault') {
      publicExports.add('default');
      allNames.add('default');
      // Also collect the inner value's name if it's a named declaration
      if (node.value) collectFromNode(node.value);
    }
    if (node.type === 'ExportList') {
      for (const spec of node.specifiers) {
        publicExports.add(spec.exported);
        allNames.add(spec.exported);
      }
    }
  }

  for (const node of ast.body) {
    // Also collect exports from inside shared/server/client blocks
    if (node.type === 'SharedBlock' || node.type === 'ServerBlock' || node.type === 'BrowserBlock') {
      if (node.body) {
        for (const inner of node.body) {
          collectFromNode(inner);
        }
      }
      continue;
    }
    collectFromNode(node);
  }
  moduleExports.set(filename, { publicExports, allNames });
  return { publicExports, allNames };
}

export function compileWithImports(source, filename, srcDir, options = {}) {
  if (compilationCache.has(filename)) {
    return compilationCache.get(filename);
  }

  compilationInProgress.add(filename);
  compilationChain.push(filename);

  try {
    // Parse and find .tova imports
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, filename);
    const ast = parser.parse();

    // Cache module type from AST (avoids regex heuristic on subsequent lookups)
    const hasBlocks = ast.body.some(n => n.type === 'SharedBlock' || n.type === 'ServerBlock' || n.type === 'BrowserBlock' || n.type === 'TestBlock' || n.type === 'BenchBlock' || n.type === 'DataBlock');
    moduleTypeCache.set(filename, hasBlocks ? '.shared.js' : '.js');

    // Collect this module's exports for validation
    collectExports(ast, filename);

    // Resolve imports: tova: prefix, @/ prefix, then .tova files
    for (const node of ast.body) {
      // Resolve tova: prefix imports to runtime modules
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportDefault' || node.type === 'ImportWildcard') && node.source.startsWith('tova:')) {
        node.source = './runtime/' + node.source.slice(5) + '.js';
        continue;
      }
      // Resolve @/ prefix imports to project root
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportDefault' || node.type === 'ImportWildcard') && node.source.startsWith('@/')) {
        const relPath = node.source.slice(2);
        let resolved = resolve(srcDir, relPath);
        if (!resolved.endsWith('.tova')) resolved += '.tova';
        const fromDir = dirname(filename);
        let rel = relative(fromDir, resolved);
        if (!rel.startsWith('.')) rel = './' + rel;
        node.source = rel;
        // Fall through to .tova import handling below
      }
      if (node.type === 'ImportDeclaration' && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(filename), node.source);
        trackDependency(filename, importPath);
        if (compilationInProgress.has(importPath)) {
          const chain = [...compilationChain, importPath].map(f => basename(f)).join(' \u2192 ');
          throw new Error(`Circular import detected: ${chain}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        // Validate imported names exist in target module's public exports
        if (moduleExports.has(importPath)) {
          const { publicExports, allNames } = moduleExports.get(importPath);
          for (const spec of node.specifiers) {
            if (!publicExports.has(spec.imported)) {
              if (allNames.has(spec.imported)) {
                throw new Error(`'${spec.imported}' is private in module '${node.source}'. Add 'pub' to export it.`);
              } else {
                throw new Error(`Module '${node.source}' does not export '${spec.imported}'`);
              }
            }
          }
        }
        // Rewrite the import path to .js (module) or .shared.js (app)
        const ext = getCompiledExtension(importPath);
        node.source = node.source.replace('.tova', ext);
      }
      if (node.type === 'ImportDefault' && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(filename), node.source);
        trackDependency(filename, importPath);
        if (compilationInProgress.has(importPath)) {
          const chain = [...compilationChain, importPath].map(f => basename(f)).join(' \u2192 ');
          throw new Error(`Circular import detected: ${chain}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        const ext2 = getCompiledExtension(importPath);
        node.source = node.source.replace('.tova', ext2);
      }
      if (node.type === 'ImportWildcard' && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(filename), node.source);
        trackDependency(filename, importPath);
        if (compilationInProgress.has(importPath)) {
          const chain = [...compilationChain, importPath].map(f => basename(f)).join(' \u2192 ');
          throw new Error(`Circular import detected: ${chain}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        const ext3 = getCompiledExtension(importPath);
        node.source = node.source.replace('.tova', ext3);
      }
    }

    const analyzer = new Analyzer(ast, filename);
    const { warnings } = analyzer.analyze();

    if (warnings.length > 0) {
      const formatter = new DiagnosticFormatter(source, filename);
      for (const w of warnings) {
        console.warn(formatter.formatWarning(w.message, { line: w.line, column: w.column }));
      }
    }

    const codegen = new CodeGenerator(ast, filename, { isDev: options.isDev });
    const output = codegen.generate();
    compilationCache.set(filename, output);
    return output;
  } finally {
    compilationInProgress.delete(filename);
    compilationChain.pop();
  }
}

export function validateMergedAST(mergedBlocks, sourceFiles) {
  const errors = [];

  function addDup(kind, name, loc1, loc2) {
    const f1 = loc1.source || 'unknown';
    const f2 = loc2.source || 'unknown';
    errors.push(
      `Duplicate ${kind} '${name}'\n` +
      `  → first defined in ${basename(f1)}:${loc1.line}\n` +
      `  → also defined in ${basename(f2)}:${loc2.line}`
    );
  }

  // Check browser blocks — top-level declarations only
  const browserDecls = { component: new Map(), state: new Map(), computed: new Map(), store: new Map(), fn: new Map() };
  for (const block of mergedBlocks.browserBlocks) {
    for (const stmt of block.body) {
      const loc = stmt.loc || block.loc;
      if (stmt.type === 'ComponentDeclaration') {
        if (browserDecls.component.has(stmt.name)) addDup('component', stmt.name, browserDecls.component.get(stmt.name), loc);
        else browserDecls.component.set(stmt.name, loc);
      } else if (stmt.type === 'StateDeclaration') {
        const name = stmt.name || (stmt.targets && stmt.targets[0]);
        if (name) {
          if (browserDecls.state.has(name)) addDup('state', name, browserDecls.state.get(name), loc);
          else browserDecls.state.set(name, loc);
        }
      } else if (stmt.type === 'ComputedDeclaration') {
        const name = stmt.name;
        if (name) {
          if (browserDecls.computed.has(name)) addDup('computed', name, browserDecls.computed.get(name), loc);
          else browserDecls.computed.set(name, loc);
        }
      } else if (stmt.type === 'StoreDeclaration') {
        if (browserDecls.store.has(stmt.name)) addDup('store', stmt.name, browserDecls.store.get(stmt.name), loc);
        else browserDecls.store.set(stmt.name, loc);
      } else if (stmt.type === 'FunctionDeclaration') {
        if (browserDecls.fn.has(stmt.name)) addDup('function', stmt.name, browserDecls.fn.get(stmt.name), loc);
        else browserDecls.fn.set(stmt.name, loc);
      }
    }
  }

  // Check server blocks — group by block name, check within same-name groups
  const serverGrouped = new Map();
  for (const block of mergedBlocks.serverBlocks) {
    const key = block.name || null;
    if (!serverGrouped.has(key)) serverGrouped.set(key, []);
    serverGrouped.get(key).push(block);
  }

  for (const [, blocks] of serverGrouped) {
    const serverDecls = { fn: new Map(), model: new Map(), route: new Map() };
    const singletons = new Map(); // db, cors, auth, session, etc.
    const SINGLETON_TYPES = {
      'DbDeclaration': 'db', 'CorsDeclaration': 'cors', 'AuthDeclaration': 'auth',
      'SessionDeclaration': 'session', 'CompressionDeclaration': 'compression',
      'TlsDeclaration': 'tls', 'UploadDeclaration': 'upload', 'RateLimitDeclaration': 'rate_limit',
    };

    for (const block of blocks) {
      const walkBody = (stmts) => {
        for (const stmt of stmts) {
          const loc = stmt.loc || block.loc;
          if (stmt.type === 'FunctionDeclaration') {
            if (serverDecls.fn.has(stmt.name)) addDup('server function', stmt.name, serverDecls.fn.get(stmt.name), loc);
            else serverDecls.fn.set(stmt.name, loc);
          } else if (stmt.type === 'ModelDeclaration') {
            if (serverDecls.model.has(stmt.name)) addDup('model', stmt.name, serverDecls.model.get(stmt.name), loc);
            else serverDecls.model.set(stmt.name, loc);
          } else if (stmt.type === 'RouteDeclaration') {
            const routeKey = `${stmt.method} ${stmt.path}`;
            if (serverDecls.route.has(routeKey)) addDup('route', routeKey, serverDecls.route.get(routeKey), loc);
            else serverDecls.route.set(routeKey, loc);
          } else if (SINGLETON_TYPES[stmt.type]) {
            const sName = SINGLETON_TYPES[stmt.type];
            if (singletons.has(sName)) addDup('server config', sName, singletons.get(sName), loc);
            else singletons.set(sName, loc);
          } else if (stmt.type === 'RouteGroupDeclaration') {
            walkBody(stmt.body);
          }
        }
      };
      walkBody(block.body);
    }
  }

  // Check shared blocks
  const sharedDecls = { type: new Map(), fn: new Map(), interface: new Map() };
  for (const block of mergedBlocks.sharedBlocks) {
    for (const stmt of block.body) {
      const loc = stmt.loc || block.loc;
      if (stmt.type === 'TypeDeclaration') {
        if (sharedDecls.type.has(stmt.name)) addDup('type', stmt.name, sharedDecls.type.get(stmt.name), loc);
        else sharedDecls.type.set(stmt.name, loc);
      } else if (stmt.type === 'FunctionDeclaration') {
        if (sharedDecls.fn.has(stmt.name)) addDup('shared function', stmt.name, sharedDecls.fn.get(stmt.name), loc);
        else sharedDecls.fn.set(stmt.name, loc);
      } else if (stmt.type === 'InterfaceDeclaration' || stmt.type === 'TraitDeclaration') {
        if (sharedDecls.interface.has(stmt.name)) addDup('interface/trait', stmt.name, sharedDecls.interface.get(stmt.name), loc);
        else sharedDecls.interface.set(stmt.name, loc);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Merge validation failed:\n\n' + errors.join('\n\n'));
  }
}

export function mergeDirectory(dir, srcDir, options = {}) {
  // Find all .tova files in this directory only (non-recursive)
  const entries = readdirSync(dir);
  const tovaFiles = entries
    .filter(e => e.endsWith('.tova') && !e.startsWith('.'))
    .map(e => join(dir, e))
    .filter(f => statSync(f).isFile())
    .sort();

  if (tovaFiles.length === 0) return null;
  if (tovaFiles.length === 1) {
    // Single file — use existing per-file compilation
    const file = tovaFiles[0];
    const source = readFileSync(file, 'utf-8');
    return { output: compileWithImports(source, file, srcDir, { isDev: options.isDev }), files: [file], single: true };
  }

  // Parse all files in the directory
  const parsedFiles = [];
  for (const file of tovaFiles) {
    const source = readFileSync(file, 'utf-8');
    const lexer = new Lexer(source, file);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, file);
    const ast = parser.parse();

    // Collect exports for cross-file import validation
    collectExports(ast, file);

    // Resolve imports: tova: prefix, @/ prefix, then cross-directory .tova
    for (const node of ast.body) {
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportDefault' || node.type === 'ImportWildcard') && node.source.startsWith('tova:')) {
        node.source = './runtime/' + node.source.slice(5) + '.js';
        continue;
      }
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportDefault' || node.type === 'ImportWildcard') && node.source.startsWith('@/')) {
        const relPath = node.source.slice(2);
        let resolved = resolve(srcDir, relPath);
        if (!resolved.endsWith('.tova')) resolved += '.tova';
        const fromDir = dirname(file);
        let rel = relative(fromDir, resolved);
        if (!rel.startsWith('.')) rel = './' + rel;
        node.source = rel;
        // Fall through to .tova import handling below
      }
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportDefault' || node.type === 'ImportWildcard') && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(file), node.source);
        // Only process imports from OTHER directories (same-dir files are merged)
        if (dirname(importPath) !== dir) {
          if (compilationInProgress.has(importPath)) {
            const chain = [...compilationChain, importPath].map(f => basename(f)).join(' \u2192 ');
            throw new Error(`Circular import detected: ${chain}`);
          } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
            const importSource = readFileSync(importPath, 'utf-8');
            compileWithImports(importSource, importPath, srcDir);
          }
          // Validate imported names
          if (node.type === 'ImportDeclaration' && moduleExports.has(importPath)) {
            const { publicExports, allNames } = moduleExports.get(importPath);
            for (const spec of node.specifiers) {
              if (!publicExports.has(spec.imported)) {
                if (allNames.has(spec.imported)) {
                  throw new Error(`'${spec.imported}' is private in module '${node.source}'. Add 'pub' to export it.`);
                } else {
                  throw new Error(`Module '${node.source}' does not export '${spec.imported}'`);
                }
              }
            }
          }
          // Rewrite to .js (module) or .shared.js (app)
          const ext = getCompiledExtension(importPath);
          node.source = node.source.replace('.tova', ext);
        } else {
          // Same-directory import — remove it since files are merged
          node._removed = true;
        }
      }
    }

    parsedFiles.push({ file, source, ast });
  }

  // Merge ASTs: collect blocks from all files, tagged with source file
  const mergedBody = [];
  const sharedBlocks = [];
  const serverBlocks = [];
  const browserBlocks = [];

  for (const { file, ast } of parsedFiles) {
    for (const node of ast.body) {
      // Skip removed same-directory imports
      if (node._removed) continue;

      // Tag node with source file for source maps and error reporting
      if (node.loc) node.loc.source = file;
      else node.loc = { line: 1, column: 0, source: file };

      // Tag children too
      if (node.body && Array.isArray(node.body)) {
        for (const child of node.body) {
          if (child.loc) child.loc.source = file;
          else child.loc = { line: 1, column: 0, source: file };
        }
      }

      if (node.type === 'SharedBlock') sharedBlocks.push(node);
      else if (node.type === 'ServerBlock') serverBlocks.push(node);
      else if (node.type === 'BrowserBlock') browserBlocks.push(node);

      mergedBody.push(node);
    }
  }

  // Validate for duplicate declarations across files
  validateMergedAST({ sharedBlocks, serverBlocks, browserBlocks }, tovaFiles);

  // Build merged Program AST
  const mergedAST = new Program(mergedBody);

  // Run analyzer on merged AST
  const analyzer = new Analyzer(mergedAST, dir, { strict: options.strict, strictSecurity: options.strictSecurity });
  const { warnings } = analyzer.analyze();

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`  Warning: ${w.message} (line ${w.line})`);
    }
  }

  // Run codegen on merged AST
  const codegen = new CodeGenerator(mergedAST, dir, { isDev: options.isDev });
  const output = codegen.generate();

  // Collect source content from all files for source maps
  const sourceContents = new Map();
  for (const { file, source } of parsedFiles) {
    sourceContents.set(file, source);
  }
  output._sourceContents = sourceContents;
  output._sourceFiles = tovaFiles;

  // Extract security info for scorecard
  const hasServer = mergedBody.some(n => n.type === 'ServerBlock');
  const hasEdge = mergedBody.some(n => n.type === 'EdgeBlock');
  const securityNode = mergedBody.find(n => n.type === 'SecurityBlock');
  let securityConfig = null;
  if (securityNode) {
    securityConfig = {};
    for (const child of securityNode.body || []) {
      if (child.type === 'AuthDeclaration') securityConfig.auth = { authType: child.authType || 'jwt', storage: child.config?.storage?.value };
      else if (child.type === 'CsrfDeclaration') securityConfig.csrf = { enabled: child.config?.enabled?.value !== false };
      else if (child.type === 'RateLimitDeclaration') securityConfig.rateLimit = { max: child.config?.max?.value };
      else if (child.type === 'CspDeclaration') securityConfig.csp = { default_src: true };
      else if (child.type === 'CorsDeclaration') {
        const origins = child.config?.origins;
        securityConfig.cors = { origins: origins ? (origins.elements || []).map(e => e.value) : [] };
      }
      else if (child.type === 'AuditDeclaration') securityConfig.audit = { events: ['auth'] };
    }
  }

  return { output, files: tovaFiles, single: false, warnings, securityConfig, hasServer, hasEdge };
}

// Group .tova files by their parent directory
export function groupFilesByDirectory(files) {
  const groups = new Map();
  for (const file of files) {
    const dir = dirname(file);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }
  return groups;
}
