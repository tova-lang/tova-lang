# Export Keyword Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `export` as a full synonym for `pub`, plus post-declaration named export lists (`export { foo, bar }`) and default exports (`export default`).

**Architecture:** Route `EXPORT` token through the existing `parsePubDeclaration()` path, add two new AST nodes (`ExportDefault`, `ExportList`), with corresponding codegen and analyzer support. Restrict `export default` and `export { }` to module level via analyzer.

**Tech Stack:** Bun test runner, no new dependencies.

---

### Task 1: Add DEFAULT Token to Lexer

**Files:**
- Modify: `src/lexer/tokens.js:58` (add DEFAULT token type)
- Modify: `src/lexer/tokens.js:226` (add 'default' keyword mapping)
- Test: `tests/export-keyword.test.js` (new file)

- [ ] **Step 1: Write failing test for DEFAULT token**

Create `tests/export-keyword.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function lex(src) {
  return new Lexer(src, '<test>').tokenize();
}

function parse(src) {
  const tokens = lex(src);
  return new Parser(tokens, '<test>').parse();
}

function compile(src) {
  const tokens = lex(src);
  const ast = new Parser(tokens, '<test>').parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function analyze(src) {
  const tokens = lex(src);
  const ast = new Parser(tokens, '<test>').parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

// ─── Lexer Tests ─────────────────────────────────────────────

describe('Export keyword — Lexer', () => {
  test('lexes DEFAULT token', () => {
    const tokens = lex('default');
    expect(tokens[0].type).toBe('DEFAULT');
  });

  test('lexes EXPORT token', () => {
    const tokens = lex('export');
    expect(tokens[0].type).toBe('EXPORT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — `DEFAULT` token not recognized (lexes as IDENTIFIER)

- [ ] **Step 3: Add DEFAULT token type and keyword**

In `src/lexer/tokens.js`, add `DEFAULT: 'DEFAULT'` after the `PUB` entry (~line 58) in the TokenType object, and add `'default': TokenType.DEFAULT` to the Keywords map (~line 226, after the `'extern'` entry).

```javascript
// In TokenType object, after PUB line:
DEFAULT: 'DEFAULT',

// In Keywords map, after 'extern' line:
'default': TokenType.DEFAULT,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lexer/tokens.js tests/export-keyword.test.js
git commit -m "feat: add DEFAULT token to lexer for export default support"
```

---

### Task 2: Add AST Nodes (ExportDefault, ExportList)

**Files:**
- Modify: `src/parser/ast.js:236` (add new AST nodes after ReExportSpecifier)

- [ ] **Step 1: Add ExportDefault and ExportList AST nodes**

In `src/parser/ast.js`, add after `ReExportSpecifier` class (after line 236):

```javascript
// export default <value>
export class ExportDefault {
  constructor(value, loc) {
    this.type = 'ExportDefault';
    this.value = value;  // FunctionDeclaration or expression node
    this.loc = loc;
  }
}

// export { a, b as c } (post-declaration, no source/from)
export class ExportList {
  constructor(specifiers, loc) {
    this.type = 'ExportList';
    this.specifiers = specifiers; // [{local, exported}]
    this.loc = loc;
  }
}

export class ExportListSpecifier {
  constructor(local, exported, loc) {
    this.type = 'ExportListSpecifier';
    this.local = local;      // name in current scope
    this.exported = exported; // exported name (same as local if no alias)
    this.loc = loc;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/parser/ast.js
git commit -m "feat: add ExportDefault, ExportList, ExportListSpecifier AST nodes"
```

---

### Task 3: Parser — Route EXPORT to parsePubDeclaration + Error Recovery

**Files:**
- Modify: `src/parser/parser.js:112` (_synchronize — add EXPORT token)
- Modify: `src/parser/parser.js:163` (_synchronizeBlock — add EXPORT token)
- Modify: `src/parser/parser.js:551` (parseStatement — add EXPORT check)
- Test: `tests/export-keyword.test.js`

- [ ] **Step 1: Write failing tests for export as pub alias**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── Parser Tests — export as pub alias ─────────────────────

describe('Export keyword — Parser (alias for pub)', () => {
  test('export fn produces same AST as pub fn', () => {
    const pubAst = parse('pub fn add(a, b) { a + b }');
    const exportAst = parse('export fn add(a, b) { a + b }');
    expect(exportAst.body[0].type).toBe('FunctionDeclaration');
    expect(exportAst.body[0].isPublic).toBe(true);
    expect(exportAst.body[0].name).toBe(pubAst.body[0].name);
  });

  test('export type works like pub type', () => {
    const ast = parse('export type Color { Red, Green, Blue }');
    expect(ast.body[0].type).toBe('TypeDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].name).toBe('Color');
  });

  test('export variable assignment', () => {
    const ast = parse('export x = 42');
    expect(ast.body[0].isPublic).toBe(true);
  });

  test('export async fn', () => {
    const ast = parse('export async fn fetch_data() { await 1 }');
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].isAsync).toBe(true);
  });

  test('export re-export with from', () => {
    const ast = parse('export { foo, bar } from "utils"');
    expect(ast.body[0].type).toBe('ReExportDeclaration');
    expect(ast.body[0].source).toBe('utils');
    expect(ast.body[0].specifiers).toHaveLength(2);
  });

  test('export wildcard re-export', () => {
    const ast = parse('export * from "utils"');
    expect(ast.body[0].type).toBe('ReExportDeclaration');
    expect(ast.body[0].specifiers).toBeNull();
    expect(ast.body[0].source).toBe('utils');
  });

  test('duplicate visibility modifier errors', () => {
    expect(() => parse('export export fn foo() { 1 }')).toThrow(/[Dd]uplicate/);
    expect(() => parse('pub export fn foo() { 1 }')).toThrow(/[Dd]uplicate/);
    expect(() => parse('export pub fn foo() { 1 }')).toThrow(/[Dd]uplicate/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — parser doesn't recognize `export` keyword as start of declaration

- [ ] **Step 3: Implement parser changes**

In `src/parser/parser.js`:

**3a.** In `_synchronize()` (~line 112), add `tok.type === TokenType.EXPORT ||` next to `TokenType.PUB`:

```javascript
          tok.type === TokenType.PUB || tok.type === TokenType.EXPORT || tok.type === TokenType.DEFER ||
```

**3b.** In `_synchronizeBlock()` (~line 163), add `tok.type === TokenType.EXPORT ||` next to `TokenType.PUB`:

```javascript
          tok.type === TokenType.PUB || tok.type === TokenType.EXPORT || tok.type === TokenType.DEFER ||
```

**3c.** In `parseStatement()` (~line 551), add EXPORT routing right after the PUB check:

```javascript
    if (this.check(TokenType.PUB)) return this.parsePubDeclaration();
    if (this.check(TokenType.EXPORT)) return this.parsePubDeclaration();
```

**3d.** In `parsePubDeclaration()` (~line 596-618), update to handle both tokens and the duplicate check:

```javascript
  parsePubDeclaration() {
    const l = this.loc();
    const keyword = this.current().type; // PUB or EXPORT
    this.advance(); // consume 'pub' or 'export'
    if (this.check(TokenType.PUB) || this.check(TokenType.EXPORT)) {
      this.error("Duplicate visibility modifier");
    }
    // Re-export: pub/export { a, b } from "module" or pub/export * from "module"
    if (this.check(TokenType.STAR) && this.peek(1).type === TokenType.FROM) {
      return this.parseReExport(l);
    }
    if (this.check(TokenType.LBRACE) && this._looksLikeReExport()) {
      return this.parseReExport(l);
    }
    // Handle pub component at top level (parseComponent is installed by browser-parser plugin)
    if (this.check(TokenType.COMPONENT) && typeof this.parseComponent === 'function') {
      const comp = this.parseComponent();
      comp.isPublic = true;
      return comp;
    }
    const stmt = this.parseStatement();
    if (stmt) stmt.isPublic = true;
    return stmt;
  }
```

**3e.** In `parseReExport()` (~line 650), fix hardcoded "pub" in error message:

```javascript
    this.expect(TokenType.FROM, "Expected 'from' after '*'");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/parser/parser.js tests/export-keyword.test.js
git commit -m "feat: route export keyword through parsePubDeclaration"
```

---

### Task 4: Parser — Export Default

**Files:**
- Modify: `src/parser/parser.js` (parsePubDeclaration — add DEFAULT handling)
- Test: `tests/export-keyword.test.js`

- [ ] **Step 1: Write failing tests for export default**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── Parser Tests — export default ──────────────────────────

describe('Export keyword — Parser (export default)', () => {
  test('export default fn', () => {
    const ast = parse('export default fn main() { "hello" }');
    const node = ast.body[0];
    expect(node.type).toBe('ExportDefault');
    expect(node.value.type).toBe('FunctionDeclaration');
    expect(node.value.name).toBe('main');
  });

  test('export default expression (identifier)', () => {
    const ast = parse('x = 42\nexport default x');
    const node = ast.body[1];
    expect(node.type).toBe('ExportDefault');
  });

  test('pub default is an error', () => {
    expect(() => parse('pub default fn foo() { 1 }')).toThrow(/export default.*not.*pub default/i);
  });

  test('export default type is an error', () => {
    expect(() => parse('export default type Color { Red, Blue }')).toThrow(/Cannot.*export default.*type/i);
  });

  test('export default async fn', () => {
    const ast = parse('export default async fn handler() { await 1 }');
    const node = ast.body[0];
    expect(node.type).toBe('ExportDefault');
    expect(node.value.type).toBe('FunctionDeclaration');
    expect(node.value.isAsync).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — `DEFAULT` not handled in parsePubDeclaration

- [ ] **Step 3: Implement export default parsing**

In `src/parser/parser.js`, in `parsePubDeclaration()`, add DEFAULT handling after the duplicate check and before the re-export checks:

```javascript
    // export default: only valid with 'export', not 'pub'
    if (this.check(TokenType.DEFAULT)) {
      if (keyword === TokenType.PUB) {
        this.error("Use 'export default', not 'pub default'");
      }
      this.advance(); // consume 'default'
      // export default type is invalid (types generate multiple statements)
      if (this.check(TokenType.TYPE)) {
        this.error("Cannot use 'export default' with type declarations. Use 'export type' instead");
      }
      const stmt = this.parseStatement();
      return new AST.ExportDefault(stmt, l);
    }
```

Make sure `AST` import at the top of the file includes the new classes. Check the import line — it should import from `./ast.js` with a wildcard or explicit names. Since Tova parser uses `import * as AST from './ast.js'` (verify), the new classes will be automatically available.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/parser.js tests/export-keyword.test.js
git commit -m "feat: parse export default fn/expr"
```

---

### Task 5: Parser — Post-Declaration Export List

**Files:**
- Modify: `src/parser/parser.js` (add _looksLikeExportList, parseExportList, wire into parsePubDeclaration)
- Test: `tests/export-keyword.test.js`

- [ ] **Step 1: Write failing tests for export list**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── Parser Tests — post-declaration export list ────────────

describe('Export keyword — Parser (export list)', () => {
  test('export { a, b } produces ExportList', () => {
    const ast = parse('fn add(a, b) { a + b }\nexport { add }');
    const node = ast.body[1];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers).toHaveLength(1);
    expect(node.specifiers[0].local).toBe('add');
    expect(node.specifiers[0].exported).toBe('add');
  });

  test('pub { a, b } without from produces ExportList', () => {
    const ast = parse('fn foo() { 1 }\npub { foo }');
    const node = ast.body[1];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers[0].local).toBe('foo');
  });

  test('export { a as b } aliased export list', () => {
    const ast = parse('fn add(a, b) { a + b }\nexport { add as addition }');
    const node = ast.body[1];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers[0].local).toBe('add');
    expect(node.specifiers[0].exported).toBe('addition');
  });

  test('export list with multiple items', () => {
    const ast = parse('fn a() { 1 }\nfn b() { 2 }\nexport { a, b }');
    const node = ast.body[2];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers).toHaveLength(2);
  });

  test('export { } from "mod" is still a re-export', () => {
    const ast = parse('export { foo } from "mod"');
    expect(ast.body[0].type).toBe('ReExportDeclaration');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — `ExportList` not produced

- [ ] **Step 3: Implement _looksLikeExportList and parseExportList**

In `src/parser/parser.js`, add after the `_looksLikeReExport()` method (~line 645):

```javascript
  // Check if pub/export { ... } is a post-declaration export list (no 'from' after })
  _looksLikeExportList() {
    let i = 1; // start after {
    while (true) {
      const tok = this.peek(i);
      if (!tok || tok.type === TokenType.EOF) return false;
      if (tok.type === TokenType.RBRACE) {
        // After }, must NOT see FROM (that would be a re-export)
        const after = this.peek(i + 1);
        return !after || after.type !== TokenType.FROM;
      }
      if (tok.type !== TokenType.IDENTIFIER) return false;
      i++;
      const next = this.peek(i);
      if (next && next.type === TokenType.AS) {
        i++; // skip as
        i++; // skip alias identifier
      }
      const afterId = this.peek(i);
      if (!afterId) return false;
      if (afterId.type === TokenType.COMMA) { i++; continue; }
      if (afterId.type === TokenType.RBRACE) continue;
      return false;
    }
  }

  parseExportList(l) {
    this.expect(TokenType.LBRACE);
    const specifiers = [];
    while (!this.check(TokenType.RBRACE)) {
      const specL = this.loc();
      const local = this.expect(TokenType.IDENTIFIER, "Expected export name").value;
      let exported = local;
      if (this.match(TokenType.AS)) {
        exported = this.expect(TokenType.IDENTIFIER, "Expected alias name after 'as'").value;
      }
      specifiers.push(new AST.ExportListSpecifier(local, exported, specL));
      if (!this.check(TokenType.RBRACE)) {
        this.expect(TokenType.COMMA, "Expected ',' or '}' in export list");
      }
    }
    this.expect(TokenType.RBRACE);
    return new AST.ExportList(specifiers, l);
  }
```

Then in `parsePubDeclaration()`, add the export list check after the re-export checks but before the component/statement fallthrough:

```javascript
    // Post-declaration export list: pub/export { a, b } (no 'from')
    if (this.check(TokenType.LBRACE) && this._looksLikeExportList()) {
      return this.parseExportList(l);
    }
```

The full order in `parsePubDeclaration` should be:
1. Duplicate check
2. `export default` check
3. Re-export `*` check
4. Re-export `{ } from` check (`_looksLikeReExport`)
5. **Export list `{ }` check (`_looksLikeExportList`)** ← NEW
6. Component check
7. Statement fallthrough

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/parser.js tests/export-keyword.test.js
git commit -m "feat: parse post-declaration export lists (export { a, b })"
```

---

### Task 6: Codegen — ExportDefault and ExportList

**Files:**
- Modify: `src/codegen/base-codegen.js:289` (add cases to generate switch)
- Modify: `src/codegen/base-codegen.js` (add genExportDefault and genExportList methods near genReExport ~line 708)
- Test: `tests/export-keyword.test.js`

- [ ] **Step 1: Write failing tests for codegen**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── Codegen Tests ──────────────────────────────────────────

describe('Export keyword — Codegen', () => {
  test('export fn compiles to export function', () => {
    const out = compile('export fn add(a, b) { a + b }');
    expect(out).toContain('export function add');
  });

  test('export type compiles to export', () => {
    const out = compile('export type Color { Red, Green, Blue }');
    expect(out).toContain('export');
  });

  test('export default fn compiles correctly', () => {
    const out = compile('export default fn main() { "hello" }');
    expect(out).toContain('export default function main');
  });

  test('export default expression compiles correctly', () => {
    const out = compile('x = 42\nexport default x');
    expect(out).toContain('export default x;');
  });

  test('export list compiles to JS export list', () => {
    const out = compile('fn add(a, b) { a + b }\nexport { add }');
    expect(out).toContain('export { add };');
  });

  test('export list with alias', () => {
    const out = compile('fn add(a, b) { a + b }\nexport { add as addition }');
    expect(out).toContain('export { add as addition };');
  });

  test('export list with multiple items', () => {
    const out = compile('fn a() { 1 }\nfn b() { 2 }\nexport { a, b }');
    expect(out).toContain('export { a, b };');
  });

  test('export re-export still works', () => {
    const out = compile('export { foo } from "utils"');
    expect(out).toContain('export { foo } from "utils";');
  });

  test('export wildcard re-export still works', () => {
    const out = compile('export * from "utils"');
    expect(out).toContain('export * from "utils";');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — `ExportDefault` and `ExportList` not handled in generate() switch

- [ ] **Step 3: Implement codegen methods**

In `src/codegen/base-codegen.js`:

**3a.** Add cases to the `generate()` switch (~line 289, after ReExportDeclaration):

```javascript
      case 'ExportDefault': result = this.genExportDefault(node); break;
      case 'ExportList': result = this.genExportList(node); break;
```

**3b.** Add methods after `genReExport()` (~after line 708):

```javascript
  genExportDefault(node) {
    if (node.value && node.value.type === 'FunctionDeclaration') {
      // Generate the function without isPublic (ExportDefault handles export)
      const savedPublic = node.value.isPublic;
      node.value.isPublic = false;
      const fnCode = this.genFunctionDeclaration(node.value);
      node.value.isPublic = savedPublic;
      // Insert 'export default ' before the function declaration
      // Must handle: function, async function, async function*
      return fnCode.replace(/^(\s*)(async\s+)?(?=function)/, '$1export default $2');
    }
    // Expression: export default <expr>;
    const expr = this.genExpression(node.value);
    return `${this.i()}export default ${expr};`;
  }

  genExportList(node) {
    const specs = node.specifiers.map(s =>
      s.local === s.exported ? s.local : `${s.local} as ${s.exported}`
    ).join(', ');
    return `${this.i()}export { ${specs} };`;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/codegen/base-codegen.js tests/export-keyword.test.js
git commit -m "feat: codegen for export default and export list"
```

---

### Task 7: Analyzer — ExportDefault and ExportList Validation

**Files:**
- Modify: `src/analyzer/analyzer.js:781` (add cases to visitNode switch)
- Modify: `src/analyzer/analyzer.js` (add visitExportDefault and visitExportList methods)
- Test: `tests/export-keyword.test.js`

- [ ] **Step 1: Write failing tests for analyzer**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── Analyzer Tests ─────────────────────────────────────────

describe('Export keyword — Analyzer', () => {
  test('export fn analyzed without errors', () => {
    const warnings = analyze('export fn add(a, b) { a + b }');
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('export default analyzed without errors', () => {
    const warnings = analyze('export default fn main() { "hello" }');
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('export list marks symbols as public (no unused warnings)', () => {
    const warnings = analyze('fn add(a, b) { a + b }\nexport { add }');
    const unusedAdd = warnings.filter(w => w.message && w.message.includes('add') && w.message.includes('unused'));
    expect(unusedAdd).toHaveLength(0);
  });

  test('export list warns on undefined names', () => {
    const warnings = analyze('export { nonexistent }');
    const undef = warnings.filter(w => w.message && w.message.toLowerCase().includes('nonexistent'));
    expect(undef.length).toBeGreaterThan(0);
  });

  test('duplicate export default warns', () => {
    const warnings = analyze('export default fn a() { 1 }\nexport default fn b() { 2 }');
    const dupDefault = warnings.filter(w => w.code === 'W_DUPLICATE_DEFAULT_EXPORT');
    expect(dupDefault).toHaveLength(1);
  });

  test('mixed pub and export in same file', () => {
    const warnings = analyze('pub fn add(a, b) { a + b }\nexport fn sub(a, b) { a - b }');
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('export default inside server block warns', () => {
    const warnings = analyze('server { export default fn handler() { 1 } }');
    const blockErr = warnings.filter(w => w.code === 'W_EXPORT_NOT_MODULE_LEVEL');
    expect(blockErr.length).toBeGreaterThan(0);
  });

  test('export list inside browser block warns', () => {
    const warnings = analyze('browser { fn foo() { 1 }\nexport { foo } }');
    const blockErr = warnings.filter(w => w.code === 'W_EXPORT_NOT_MODULE_LEVEL');
    expect(blockErr.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — analyzer doesn't handle ExportDefault/ExportList nodes

- [ ] **Step 3: Implement analyzer visitor methods**

In `src/analyzer/analyzer.js`:

**3a.** Add cases to `visitNode` switch (~line 781, after `ReExportDeclaration`):

```javascript
      case 'ExportDefault': return this.visitExportDefault(node);
      case 'ExportList': return this.visitExportList(node);
```

**3b.** Add visitor methods (near the other visit methods, e.g., after `visitImportWildcard` or wherever import visitors are grouped):

```javascript
  visitExportDefault(node) {
    // Module-level restriction: not valid inside server/browser/edge/shared blocks
    const ctx = this.currentScope.context;
    if (ctx === 'server' || ctx === 'client' || ctx === 'shared') {
      this.warn('W_EXPORT_NOT_MODULE_LEVEL', "'export default' is only valid at module level", node.loc);
    }

    // Track duplicate default exports
    if (this._hasDefaultExport) {
      this.warn('W_DUPLICATE_DEFAULT_EXPORT', 'Module already has a default export', node.loc);
    }
    this._hasDefaultExport = true;

    // Visit the inner value
    if (node.value) {
      this.visitNode(node.value);
    }
  }

  visitExportList(node) {
    // Module-level restriction: not valid inside server/browser/edge/shared blocks
    const ctx = this.currentScope.context;
    if (ctx === 'server' || ctx === 'client' || ctx === 'shared') {
      this.warn('W_EXPORT_NOT_MODULE_LEVEL', "'export { }' is only valid at module level", node.loc);
    }

    for (const spec of node.specifiers) {
      // Check that the referenced name exists in scope
      const sym = this.currentScope.lookup(spec.local);
      if (!sym) {
        this.warn('W201', `'${spec.local}' is not defined`, spec.loc);
      } else {
        // Mark as public so it doesn't trigger unused warnings
        sym.isPublic = true;
      }
    }
  }
```

**3c.** Initialize `_hasDefaultExport` flag. Find the constructor or the `analyze()` method, and add:

```javascript
this._hasDefaultExport = false;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/analyzer/analyzer.js tests/export-keyword.test.js
git commit -m "feat: analyzer validation for export default and export list"
```

---

### Task 8: collectExports — Handle New AST Nodes

**Files:**
- Modify: `src/cli/compile.js:338` (collectExports function)
- Test: `tests/export-keyword.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── collectExports Tests ───────────────────────────────────

import { collectExports } from '../src/cli/compile.js';

describe('Export keyword — collectExports', () => {
  test('ExportDefault adds "default" to publicExports', () => {
    const ast = parse('export default fn main() { 1 }');
    const { publicExports } = collectExports(ast, '<test-collect>');
    expect(publicExports.has('default')).toBe(true);
  });

  test('ExportList adds exported names to publicExports', () => {
    const ast = parse('fn add(a, b) { a + b }\nfn sub(a, b) { a - b }\nexport { add, sub }');
    const { publicExports } = collectExports(ast, '<test-collect>');
    expect(publicExports.has('add')).toBe(true);
    expect(publicExports.has('sub')).toBe(true);
  });

  test('ExportList with alias uses exported name', () => {
    const ast = parse('fn add(a, b) { a + b }\nexport { add as addition }');
    const { publicExports } = collectExports(ast, '<test-collect>');
    expect(publicExports.has('addition')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: FAIL — collectExports doesn't handle ExportDefault/ExportList

- [ ] **Step 3: Implement collectExports changes**

In `src/cli/compile.js`, in the `collectFromNode` function (~line 342), add handling for the new node types, after the `ReExportDeclaration` block (~line 398):

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/compile.js tests/export-keyword.test.js
git commit -m "feat: collectExports handles ExportDefault and ExportList nodes"
```

---

### Task 9: LSP Keyword Completions

**Files:**
- Modify: `src/lsp/server.js:521` (add 'export' and 'default' to keyword list)

- [ ] **Step 1: Add export and default to LSP completions**

In `src/lsp/server.js`, in the keywords array (~line 518-524), add `'export'` and `'default'`:

```javascript
    const keywords = [
      'fn', 'if', 'elif', 'else', 'for', 'while', 'loop', 'when', 'in',
      'return', 'match', 'type', 'import', 'from', 'true', 'false',
      'nil', 'server', 'browser', 'client', 'shared', 'pub', 'export', 'default', 'mut',
      'try', 'catch', 'finally', 'break', 'continue', 'async', 'await',
      'guard', 'interface', 'derive', 'route', 'model', 'db',
    ];
```

- [ ] **Step 2: Commit**

```bash
git add src/lsp/server.js
git commit -m "feat: add export and default to LSP keyword completions"
```

---

### Task 10: TextMate Grammar — Add default Keyword

**Files:**
- Modify: `editors/vscode/syntaxes/tova.tmLanguage.json:113` (add 'default' to keyword pattern)

- [ ] **Step 1: Add default to keyword pattern**

In `editors/vscode/syntaxes/tova.tmLanguage.json`, the keyword declaration pattern (~line 113) already has `export`. Add `default`:

```
"match": "\\b(fn|var|type|interface|import|from|export|default|pub|mut|async|await|derive|impl|trait|defer|yield|extern|with|as)\\b"
```

- [ ] **Step 2: Commit**

```bash
git add editors/vscode/syntaxes/tova.tmLanguage.json
git commit -m "feat: add default keyword to TextMate grammar"
```

---

### Task 11: Integration Tests and Full Suite Verification

**Files:**
- Test: `tests/export-keyword.test.js` (add integration tests)

- [ ] **Step 1: Write integration tests**

Append to `tests/export-keyword.test.js`:

```javascript
// ─── Integration Tests ──────────────────────────────────────

describe('Export keyword — Integration', () => {
  test('mixed pub and export in same file compiles', () => {
    const out = compile(`
      pub fn add(a, b) { a + b }
      export fn sub(a, b) { a - b }
      pub type Color { Red, Blue }
      export type Shape { Circle(r), Square(s) }
    `);
    expect(out).toContain('export function add');
    expect(out).toContain('export function sub');
  });

  test('export list after declarations', () => {
    const out = compile(`
      fn private_add(a, b) { a + b }
      fn private_sub(a, b) { a - b }
      export { private_add as add, private_sub as sub }
    `);
    expect(out).toContain('export { private_add as add, private_sub as sub }');
    expect(out).not.toContain('export function private_add');
  });

  test('export default with export list', () => {
    const out = compile(`
      fn helper() { 1 }
      export default fn main() { helper() }
      export { helper }
    `);
    expect(out).toContain('export default function main');
    expect(out).toContain('export { helper }');
  });

  test('pub { a, b } post-declaration works', () => {
    const out = compile(`
      fn foo() { 1 }
      fn bar() { 2 }
      pub { foo, bar }
    `);
    expect(out).toContain('export { foo, bar }');
  });
});
```

- [ ] **Step 2: Run all export-keyword tests**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/export-keyword.test.js`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All tests pass (no regressions)

- [ ] **Step 4: Commit**

```bash
git add tests/export-keyword.test.js
git commit -m "test: integration tests for export keyword feature"
```
