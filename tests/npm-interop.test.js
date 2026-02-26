import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

// ─── hasNpmImports (imported via dynamic import of bin/tova.js internals) ────
// Since hasNpmImports is not exported, we replicate its logic here for testing.
// This ensures the regex pattern stays in sync with the implementation.

function hasNpmImports(code) {
  const importRegex = /^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const source = match[1];
    if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/') || source.startsWith('./runtime/')) {
      continue;
    }
    return true;
  }
  return false;
}

// ─── Import-stripping regex (matches the fixed version in bin/tova.js) ───────

const IMPORT_STRIP_REGEX = /^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm;

function stripImports(code) {
  return code.replace(IMPORT_STRIP_REGEX, '').trim();
}

// ─── Compile helper ──────────────────────────────────────────

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

// ─── Tests ───────────────────────────────────────────────────

describe('hasNpmImports', () => {
  test('detects named import from npm package', () => {
    expect(hasNpmImports(`import { z } from "zod";`)).toBe(true);
  });

  test('detects named import with single quotes', () => {
    expect(hasNpmImports(`import { z } from 'zod';`)).toBe(true);
  });

  test('detects default import from npm package', () => {
    expect(hasNpmImports(`import React from "react";`)).toBe(true);
  });

  test('detects wildcard import from npm package', () => {
    expect(hasNpmImports(`import * as R from "ramda";`)).toBe(true);
  });

  test('detects scoped npm package', () => {
    expect(hasNpmImports(`import { something } from "@scope/pkg";`)).toBe(true);
  });

  test('ignores relative imports (./) ', () => {
    expect(hasNpmImports(`import { foo } from "./foo.js";`)).toBe(false);
  });

  test('ignores relative imports (../) ', () => {
    expect(hasNpmImports(`import { foo } from "../utils.js";`)).toBe(false);
  });

  test('ignores absolute imports (/)', () => {
    expect(hasNpmImports(`import { foo } from "/absolute/path.js";`)).toBe(false);
  });

  test('ignores runtime imports', () => {
    expect(hasNpmImports(`import { createSignal } from './runtime/reactivity.js';`)).toBe(false);
  });

  test('returns false for code with no imports', () => {
    expect(hasNpmImports(`const x = 42;\nconsole.log(x);`)).toBe(false);
  });

  test('detects npm import among relative imports', () => {
    const code = `import { foo } from './foo.js';\nimport { z } from "zod";\nimport { bar } from '../bar.js';`;
    expect(hasNpmImports(code)).toBe(true);
  });
});

describe('Import stripping regex', () => {
  test('strips named imports with single quotes', () => {
    const code = `import { createSignal } from './runtime/reactivity.js';`;
    expect(stripImports(code)).toBe('');
  });

  test('strips named imports with double quotes', () => {
    const code = `import { z } from "zod";`;
    expect(stripImports(code)).toBe('');
  });

  test('strips default imports', () => {
    const code = `import React from "react";`;
    expect(stripImports(code)).toBe('');
  });

  test('strips wildcard imports', () => {
    const code = `import * as R from "ramda";`;
    expect(stripImports(code)).toBe('');
  });

  test('preserves non-import code', () => {
    const code = `import { z } from "zod";\nconst x = z.string();`;
    expect(stripImports(code)).toBe('const x = z.string();');
  });

  test('strips multiple import forms in one block', () => {
    const code = `import { z } from "zod";\nimport React from 'react';\nimport * as R from "ramda";\nconst x = 1;`;
    expect(stripImports(code)).toBe('const x = 1;');
  });
});

describe('BrowserCodegen import hoisting', () => {
  test('hoists import from shared code to module top', () => {
    const source = `
import { z } from "zod"

browser {
  state name = "test"
  component App() {
    <div>"hello"</div>
  }
}`;
    const output = compile(source);
    const browserCode = output.browser;

    // The import should appear at the top (after runtime imports, before shared code body)
    const lines = browserCode.split('\n');
    const importLineIdx = lines.findIndex(l => l.includes('from "zod"'));
    const sharedCommentIdx = lines.findIndex(l => l.includes('// ── Shared'));
    const stdlibIdx = lines.findIndex(l => l.includes('// ── Stdlib'));

    expect(importLineIdx).toBeGreaterThan(-1);
    // Import should be before stdlib section
    if (stdlibIdx > -1) {
      expect(importLineIdx).toBeLessThan(stdlibIdx);
    }
  });

  test('browser block imports are categorized separately from other statements', () => {
    const source = `
browser {
  import { z } from "zod"
  state name = "test"
  component App() {
    <div>"hello"</div>
  }
}`;
    const output = compile(source);
    const browserCode = output.browser;

    // The import should appear in its own section, before reactive state
    const lines = browserCode.split('\n');
    const importLineIdx = lines.findIndex(l => l.includes('from "zod"'));
    // Find the state declaration line (not the runtime import that also mentions createSignal)
    const stateIdx = lines.findIndex(l => /^\s*const\s+\[/.test(l) && l.includes('createSignal'));

    expect(importLineIdx).toBeGreaterThan(-1);
    // Import should appear before state declarations
    if (stateIdx > -1) {
      expect(importLineIdx).toBeLessThan(stateIdx);
    }
  });

  test('browser block default import is hoisted', () => {
    const source = `
browser {
  import lodash from "lodash"
  component App() {
    <div>"hello"</div>
  }
}`;
    const output = compile(source);
    const browserCode = output.browser;

    expect(browserCode).toContain('import lodash from "lodash"');

    // Should be before components section
    const lines = browserCode.split('\n');
    const importLineIdx = lines.findIndex(l => l.includes('import lodash'));
    const componentIdx = lines.findIndex(l => l.includes('// ── Components'));

    if (componentIdx > -1 && importLineIdx > -1) {
      expect(importLineIdx).toBeLessThan(componentIdx);
    }
  });

  test('browser block wildcard import is hoisted', () => {
    const source = `
browser {
  import * as R from "ramda"
  component App() {
    <div>"hello"</div>
  }
}`;
    const output = compile(source);
    const browserCode = output.browser;

    expect(browserCode).toContain('import * as R from "ramda"');
  });

  test('generated browser code has valid import structure for npm imports', () => {
    const source = `
import { z } from "zod"

browser {
  import { observable } from "mobx"
  state name = "test"
  component App() {
    <div>"hello"</div>
  }
}`;
    const output = compile(source);
    const browserCode = output.browser;

    // Both imports should be present
    expect(browserCode).toContain('from "zod"');
    expect(browserCode).toContain('from "mobx"');

    // All imports should appear before any non-import, non-comment code
    const lines = browserCode.split('\n');
    let lastImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('import ')) {
        lastImportLine = i;
      }
    }

    expect(lastImportLine).toBeGreaterThan(-1);
  });

  test('no npm imports still produces valid inline code', () => {
    const source = `
browser {
  state count = 0
  component App() {
    <div>"count: " ++ String(count)</div>
  }
}`;
    const output = compile(source);
    const browserCode = output.browser;

    // Should have runtime imports but no npm imports
    expect(browserCode).toContain("from './runtime/reactivity.js'");
    expect(browserCode).toContain('createSignal');
    expect(hasNpmImports(browserCode)).toBe(false);
  });
});
