import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Read playground build script source to extract SOURCE_FILES and AST shim lists
const buildScript = readFileSync(resolve(ROOT, 'playground/build.js'), 'utf-8');

// Extract the SOURCE_FILES array entries
function extractSourceFiles() {
  const match = buildScript.match(/const SOURCE_FILES = \[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not find SOURCE_FILES in playground/build.js');
  const entries = [];
  for (const m of match[1].matchAll(/'([^']+)'/g)) {
    entries.push(m[1]);
  }
  return entries;
}

// Extract the AST shim file list
function extractAstShimFiles() {
  const match = buildScript.match(/for \(const astFile of \[([\s\S]*?)\]\)/);
  if (!match) throw new Error('Could not find AST shim file list in playground/build.js');
  const entries = [];
  for (const m of match[1].matchAll(/'([^']+)'/g)) {
    entries.push(m[1]);
  }
  return entries;
}

// Get all registered plugins from register-all.js
function getRegisteredPlugins() {
  const registerAll = readFileSync(resolve(ROOT, 'src/registry/register-all.js'), 'utf-8');
  const plugins = [];
  for (const m of registerAll.matchAll(/import \{ (\w+) \} from '\.\/plugins\/([^']+)'/g)) {
    plugins.push({ varName: m[1], file: `src/registry/plugins/${m[2]}` });
  }
  return plugins;
}

// Get all AST files that exist in src/parser/
function getAstFiles() {
  const { globSync } = require('fs');
  // Manual list based on convention: *-ast.js files + ast.js
  const candidates = [
    'src/parser/ast.js',
    'src/parser/browser-ast.js',
    'src/parser/server-ast.js',
    'src/parser/security-ast.js',
    'src/parser/cli-ast.js',
    'src/parser/edge-ast.js',
    'src/parser/form-ast.js',
    'src/parser/concurrency-ast.js',
    'src/parser/select-ast.js',
    'src/parser/deploy-ast.js',
  ];
  return candidates.filter(f => {
    try { readFileSync(resolve(ROOT, f)); return true; } catch { return false; }
  });
}

// Get all parser files that are imported by plugins
function getPluginParserDeps() {
  const deps = [];
  const plugins = getRegisteredPlugins();
  for (const plugin of plugins) {
    const source = readFileSync(resolve(ROOT, plugin.file), 'utf-8');
    for (const m of source.matchAll(/import \{[^}]+\} from '([^']+)'/g)) {
      const importPath = m[1];
      if (importPath.includes('parser') && !importPath.includes('tokens')) {
        // Resolve relative import to src/ path
        const dir = dirname(plugin.file);
        const resolved = resolve(ROOT, dir, importPath);
        const relative = resolved.replace(ROOT + '/', '');
        deps.push(relative);
      }
    }
  }
  return [...new Set(deps)];
}

describe('Playground Build — SOURCE_FILES completeness', () => {
  const sourceFiles = extractSourceFiles();

  test('every registered plugin is included in SOURCE_FILES', () => {
    const plugins = getRegisteredPlugins();
    const missing = [];
    for (const plugin of plugins) {
      if (!sourceFiles.includes(plugin.file)) {
        missing.push(plugin.file);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every parser file imported by plugins is included in SOURCE_FILES', () => {
    const parserDeps = getPluginParserDeps();
    const missing = [];
    for (const dep of parserDeps) {
      if (!sourceFiles.includes(dep)) {
        missing.push(dep);
      }
    }
    expect(missing).toEqual([]);
  });

  test('register-all.js is included in SOURCE_FILES', () => {
    expect(sourceFiles).toContain('src/registry/register-all.js');
  });

  test('all source files actually exist on disk', () => {
    const missing = [];
    for (const file of sourceFiles) {
      if (file === '__AST_SHIM__') continue;
      try {
        readFileSync(resolve(ROOT, file));
      } catch {
        missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('Playground Build — AST shim completeness', () => {
  const astShimFiles = extractAstShimFiles();

  test('every AST file in src/parser/ is included in the AST shim collector', () => {
    const astFiles = getAstFiles();
    const missing = [];
    for (const file of astFiles) {
      if (!astShimFiles.includes(file)) {
        missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });

  test('every AST file in SOURCE_FILES is also in the AST shim collector', () => {
    const sourceFiles = extractSourceFiles();
    const astInSources = sourceFiles.filter(f => f.match(/parser\/.*-ast\.js$/) || f === 'src/parser/ast.js');
    const missing = [];
    for (const file of astInSources) {
      if (!astShimFiles.includes(file)) {
        missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('Playground Build — bundle integrity', () => {
  // Build the playground and test the output
  let html;
  try {
    html = readFileSync(resolve(ROOT, 'playground/index.html'), 'utf-8');
  } catch {
    html = null;
  }

  test('playground/index.html exists', () => {
    expect(html).not.toBeNull();
  });

  test('bundle contains Lexer class definition', () => {
    expect(html).toContain('class Lexer');
  });

  test('bundle contains Parser class definition', () => {
    expect(html).toContain('class Parser');
  });

  test('bundle contains Analyzer class definition', () => {
    expect(html).toContain('class Analyzer');
  });

  test('bundle contains CodeGenerator class definition', () => {
    expect(html).toContain('class CodeGenerator');
  });

  test('bundle exposes Lexer on window', () => {
    expect(html).toContain('window.Lexer = Lexer');
  });

  test('bundle exposes Parser on window', () => {
    expect(html).toContain('window.Parser = Parser');
  });

  test('bundle exposes Analyzer on window', () => {
    expect(html).toContain('window.Analyzer = Analyzer');
  });

  test('bundle exposes CodeGenerator on window', () => {
    expect(html).toContain('window.CodeGenerator = CodeGenerator');
  });

  test('bundle contains all registered plugin names', () => {
    const plugins = getRegisteredPlugins();
    for (const plugin of plugins) {
      expect(html).toContain(plugin.varName);
    }
  });

  test('bundle contains BlockRegistry.register calls for all plugins', () => {
    const plugins = getRegisteredPlugins();
    for (const plugin of plugins) {
      expect(html).toContain(`BlockRegistry.register(${plugin.varName})`);
    }
  });

  test('bundle contains AST shim with all AST classes', () => {
    const astFiles = getAstFiles();
    for (const file of astFiles) {
      const source = readFileSync(resolve(ROOT, file), 'utf-8');
      for (const m of source.matchAll(/^(?:export\s+)?class\s+(\w+)/gm)) {
        expect(html).toContain(m[1]);
      }
    }
  });
});

describe('Playground Build — SOURCE_FILES ordering', () => {
  const sourceFiles = extractSourceFiles();

  test('tokens.js comes before lexer.js', () => {
    expect(sourceFiles.indexOf('src/lexer/tokens.js'))
      .toBeLessThan(sourceFiles.indexOf('src/lexer/lexer.js'));
  });

  test('all AST files come before __AST_SHIM__', () => {
    const shimIdx = sourceFiles.indexOf('__AST_SHIM__');
    const astFiles = sourceFiles.filter(f => f.match(/parser\/.*-ast\.js$/) || f === 'src/parser/ast.js');
    for (const file of astFiles) {
      expect(sourceFiles.indexOf(file)).toBeLessThan(shimIdx);
    }
  });

  test('__AST_SHIM__ comes before parser.js', () => {
    expect(sourceFiles.indexOf('__AST_SHIM__'))
      .toBeLessThan(sourceFiles.indexOf('src/parser/parser.js'));
  });

  test('all parsers come before parser.js', () => {
    const mainParserIdx = sourceFiles.indexOf('src/parser/parser.js');
    const subParsers = sourceFiles.filter(f =>
      f.match(/parser\/.*-parser\.js$/) && f !== 'src/parser/parser.js'
    );
    for (const file of subParsers) {
      expect(sourceFiles.indexOf(file)).toBeLessThan(mainParserIdx);
    }
  });

  test('all plugins come before register-all.js', () => {
    const registerIdx = sourceFiles.indexOf('src/registry/register-all.js');
    const plugins = sourceFiles.filter(f => f.includes('plugins/'));
    for (const file of plugins) {
      expect(sourceFiles.indexOf(file)).toBeLessThan(registerIdx);
    }
  });

  test('register-all.js comes before codegen files', () => {
    const registerIdx = sourceFiles.indexOf('src/registry/register-all.js');
    const codegenFiles = sourceFiles.filter(f => f.includes('codegen/'));
    for (const file of codegenFiles) {
      expect(sourceFiles.indexOf(file)).toBeGreaterThan(registerIdx);
    }
  });
});
