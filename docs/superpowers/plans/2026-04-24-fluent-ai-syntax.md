# Fluent AI Syntax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tova's AI features usable outside `server { }` blocks with ambient `ai` bindings, provider-tagged prompt literals (`claude"..."`), `prompt fn` declarations, and callable providers — zero breaking changes.

**Architecture:** The change is a ladder of small, independent features. We add a callable-client runtime first (no language impact), then surface module-level `ai { }` configuration and env-default bootstrapping, then layer in the new syntax (`TAGGED_STRING` lexeme, `PromptLiteral` AST, `prompt fn` declarations), and finally the client-block error checks. Each rung is committable and testable on its own. The spec driving every decision is [`docs/superpowers/specs/2026-04-24-fluent-ai-syntax-design.md`](../specs/2026-04-24-fluent-ai-syntax-design.md); read it before touching any task.

**Tech Stack:** Bun, hand-rolled lexer/parser/analyzer/codegen in JS (ES modules). Tests use `bun:test`.

**Conventions:**
- Run single test files via `bun test tests/<name>.test.js`.
- Never skip a test or delete a failing test to move on — fix the underlying cause.
- Commits are imperative and scoped to a single task; one commit per task unless a task explicitly splits itself.
- Follow the rule: write the failing test first, run it, implement, rerun, commit.

---

## File map

Files created or modified by this plan:

| File | Create / Modify | Responsibility |
|------|-----------------|----------------|
| `src/runtime/ai.js` | Modify | Return a callable client (function-with-methods) from `createAI`. Export an env-backed `createDefaultAI()` helper. |
| `src/lexer/lexer.js` | Modify | Emit `TAGGED_STRING` tokens when an identifier is immediately followed by `"`/`"""` (and the identifier is not `f` or `r`). |
| `src/lexer/tokens.js` | Modify | Add `TAGGED_STRING` token type. |
| `src/parser/ast.js` | Modify | Add `PromptFnDeclaration` and `PromptLiteral` AST nodes. |
| `src/parser/parser.js` | Modify | Parse module-level `ai { }` (lift from server-parser); parse `prompt fn`; parse `with <identifier>` suffix; parse `TAGGED_STRING` expressions. |
| `src/parser/server-parser.js` | Modify | Keep the existing `ai { }` dispatch; delegate to the shared helper. |
| `src/analyzer/analyzer.js` | Modify | Register ambient `ai`/named providers in scope; dispatch `prompt fn` by return type; emit `E700`/`E701`/`E702`/`E703`/`E704`/`W304`/`E705`. |
| `src/analyzer/types.js` | Modify | Expose a small helper to classify a return type as `ask` / `extract` / `classify` / reject. |
| `src/diagnostics/error-codes.js` | Modify | Register `E700`–`E705` and `W304` with descriptions. |
| `src/codegen/base-codegen.js` | Modify | Lower `PromptLiteral` and `PromptFnDeclaration`; emit env-backed default `ai` when needed. |
| `src/codegen/server-codegen.js` | Modify | Delegate AI-client emission to the shared path. |
| `src/codegen/codegen.js` | Modify | Module-mode codegen gains the env-default prefix when AI is used without a block. |
| `src/lsp/server.js` | Modify | Inlay hint for dispatched method on prompt literals and `prompt fn`; quick-fix for "move `ai` block out of `client`". |
| `tests/ai.test.js` | Modify | Expanded coverage per spec §7 examples and §6 error surface. |
| `docs/guide/ai.md` | Modify | Rewrite around the ambient model; add a "What's new" callout. |

---

## Task 1: Callable provider runtime

**Files:**
- Modify: `src/runtime/ai.js`
- Test: `tests/ai.test.js` (runtime section, ~line 241)

Make every client returned by `createAI` callable. `client(prompt, opts?)` must equal `client.ask(prompt, opts)`. Methods `.ask`/`.chat`/`.embed`/`.extract`/`.classify` continue to exist. Also add `createDefaultAI()` that reads from `process.env.TOVA_AI_*`.

- [ ] **Step 1: Write the failing test.** Add to `tests/ai.test.js` inside the `describe('AI runtime — createAI factory', ...)` block:

```js
test('client is directly callable and defaults to ask', async () => {
  const mod = await import('../src/runtime/ai.js');
  const client = mod.createAI({ provider: 'anthropic', model: 'test', api_key: 'test' });
  expect(typeof client).toBe('function');
  expect(client.ask).toBe(client.__ask || client.ask); // method still exists
  // Calling the client directly must call the same underlying function as .ask
  // We verify by stubbing _provider
  let captured = null;
  client._provider = async (_config, method, args) => { captured = { method, args }; return 'ok'; };
  const direct = await client('hello', { temperature: 0.1 });
  expect(direct).toBe('ok');
  expect(captured.method).toBe('ask');
  expect(captured.args[0]).toBe('hello');
  expect(captured.args[1]).toEqual({ temperature: 0.1 });
});

test('callable client works end-to-end through compiled pipe', async () => {
  // This guards the pipe-fluency promise in spec §4: `article |> claude`
  // compiles to `claude(article)`, which (after this task's runtime change)
  // equals `claude.ask(article)`. We verify the runtime shape only; the
  // codegen side for `|> claude` is covered by the existing pipe emitter —
  // no language change is needed for pipes once the client is callable.
  const mod = await import('../src/runtime/ai.js');
  const client = mod.createAI({ provider: 'anthropic', model: 'test', api_key: 'test' });
  let captured = null;
  client._provider = async (_c, method, args) => { captured = { method, args }; return 'r'; };
  // Simulate the lowered pipe: `client(article)`
  const result = await client('article');
  expect(result).toBe('r');
  expect(captured.method).toBe('ask');
  expect(captured.args[0]).toBe('article');
});

test('createDefaultAI reads from TOVA_AI_* env vars', async () => {
  const prev = {
    p: process.env.TOVA_AI_PROVIDER,
    m: process.env.TOVA_AI_MODEL,
    k: process.env.TOVA_AI_API_KEY,
    b: process.env.TOVA_AI_BASE_URL,
  };
  try {
    process.env.TOVA_AI_PROVIDER = 'anthropic';
    process.env.TOVA_AI_MODEL = 'claude-haiku';
    process.env.TOVA_AI_API_KEY = 'sk-env';
    process.env.TOVA_AI_BASE_URL = 'https://example.com';
    const mod = await import('../src/runtime/ai.js');
    const client = mod.createDefaultAI();
    expect(client._config.provider).toBe('anthropic');
    expect(client._config.model).toBe('claude-haiku');
    expect(client._config.api_key).toBe('sk-env');
    expect(client._config.base_url).toBe('https://example.com');
  } finally {
    process.env.TOVA_AI_PROVIDER = prev.p;
    process.env.TOVA_AI_MODEL = prev.m;
    process.env.TOVA_AI_API_KEY = prev.k;
    process.env.TOVA_AI_BASE_URL = prev.b;
  }
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bun test tests/ai.test.js -t "directly callable"`
Expected: FAIL — `client` is an object, not a function.

- [ ] **Step 3: Minimal implementation.**

In `src/runtime/ai.js`, change `createAI` so its return value is a function with methods hung off it. Replace the `const client = { ... };` block with something equivalent to:

```js
export function createAI(config = {}) {
  const providerName = config.provider || 'custom';
  const providerFn = providers[providerName] || providers.custom;

  const callable = async (prompt, opts = {}) => {
    const mergedConfig = { ...config, ...opts };
    return providerFn(mergedConfig, 'ask', [prompt, opts]);
  };

  callable._config = config;
  callable._provider = providerFn;
  callable.ask = (prompt, opts = {}) => {
    const mergedConfig = { ...callable._config, ...opts };
    return callable._provider(mergedConfig, 'ask', [prompt, opts]);
  };
  callable.chat = (messages, opts = {}) => callable._provider({ ...callable._config, ...opts }, 'chat', [messages, opts]);
  callable.embed = (input, opts = {}) => callable._provider({ ...callable._config, ...opts }, 'embed', [input, opts]);
  callable.extract = (prompt, schema, opts = {}) => callable._provider({ ...callable._config, ...opts }, 'extract', [prompt, schema, opts]);
  callable.classify = (text, categories, opts = {}) => callable._provider({ ...callable._config, ...opts }, 'classify', [text, categories, opts]);
  return callable;
}

export function createDefaultAI() {
  return createAI({
    provider: process.env.TOVA_AI_PROVIDER || 'custom',
    model: process.env.TOVA_AI_MODEL,
    api_key: process.env.TOVA_AI_API_KEY,
    base_url: process.env.TOVA_AI_BASE_URL,
  });
}
```

Important: the inner method closures must read `callable._config` (not the outer `config`) so test-time monkey-patching of `_provider` (see the test) still works.

- [ ] **Step 4: Run tests and verify all pass.**

Run: `bun test tests/ai.test.js`
Expected: all existing tests still pass; both new tests pass.

- [ ] **Step 5: Commit.**

```bash
git add src/runtime/ai.js tests/ai.test.js
git commit -m "runtime: make AI client callable; add createDefaultAI helper"
```

---

## Task 2: Diagnostic codes registered

**Files:**
- Modify: `src/diagnostics/error-codes.js`
- Test: `tests/error-codes.test.js` (check if it exists; otherwise add a small check to `tests/ai.test.js`)

Register the seven new codes. The existing file exports two named objects — `ErrorCode` and `WarningCode` — each keyed by code, with entries of shape `{ code, title, category }`. No `description` field; no default export. Categories in use include `syntax`, `type`, `scope`, `context`, `import`, `match`, `trait`, `unused`, etc. Use `context` for E700/E701 (matches E302/E303), `syntax`/`type` as appropriate for the others. Do **not** claim anything about `tova explain` — that CLI path is not part of this task and its wiring is out of scope.

- [ ] **Step 1: Inspect existing code table.** Read `src/diagnostics/error-codes.js` lines 1–120 to confirm the `{ code, title, category }` shape and see where `context` / `trait` ranges end.

- [ ] **Step 2: Write the failing test.** Add to the end of `tests/ai.test.js`:

```js
describe('AI diagnostic codes', () => {
  test('E700–E705 are registered in ErrorCode', async () => {
    const { ErrorCode } = await import('../src/diagnostics/error-codes.js');
    for (const code of ['E700', 'E701', 'E702', 'E703', 'E704', 'E705']) {
      expect(ErrorCode[code]).toBeDefined();
      expect(ErrorCode[code].code).toBe(code);
      expect(typeof ErrorCode[code].title).toBe('string');
      expect(ErrorCode[code].title.length).toBeGreaterThan(0);
      expect(typeof ErrorCode[code].category).toBe('string');
    }
  });

  test('W304 is registered in WarningCode', async () => {
    const { WarningCode } = await import('../src/diagnostics/error-codes.js');
    expect(WarningCode.W304).toBeDefined();
    expect(WarningCode.W304.code).toBe('W304');
    expect(typeof WarningCode.W304.title).toBe('string');
  });
});
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `bun test tests/ai.test.js -t "diagnostic codes"`
Expected: FAIL — codes not registered.

- [ ] **Step 4: Add the codes.** Append entries to `ErrorCode` and `WarningCode` using the existing shape `{ code, title, category }`:

```js
// In ErrorCode (append after the E6xx trait section):
// === AI Errors (E700–E799) ===
E700: { code: 'E700', title: 'AI calls are server-only',                  category: 'context' },
E701: { code: 'E701', title: 'AI configuration is server-only',           category: 'context' },
E702: { code: 'E702', title: 'prompt fn return type not dispatchable',    category: 'type' },
E703: { code: 'E703', title: 'Prompt-literal tag is not an AI provider',  category: 'scope' },
E704: { code: 'E704', title: 'prompt fn body must be a single string',    category: 'syntax' },
E705: { code: 'E705', title: 'Hardcoded api_key — use env()',             category: 'security' },

// In WarningCode (append in the W3xx range — inspect the file to confirm the next free slot):
W304: { code: 'W304', title: 'Hardcoded api_key — use env()',             category: 'security' },
```

If `security` isn't already a category in the file, pick an existing one (`style` or `logic`) that best fits; consistency with the rest of the registry matters more than inventing a new category.

- [ ] **Step 5: Run tests and verify pass.**

Run: `bun test tests/ai.test.js`
Expected: new tests pass; all others still pass.

- [ ] **Step 6: Commit.**

```bash
git add src/diagnostics/error-codes.js tests/ai.test.js
git commit -m "diagnostics: register E700-E705 and W304 for fluent AI syntax"
```

---

## Task 3: Lift `ai { }` parsing to module level

**Files:**
- Modify: `src/parser/parser.js`
- Modify: `src/parser/server-parser.js` (delegate to the shared method)
- Test: `tests/ai.test.js`

Move `parseAiConfig` from `server-parser.js` onto the base `Parser` class so it is callable from the top-level statement dispatch. Wire the top-level parser to recognize `ai { ... }` and `ai "name" { ... }` anywhere a statement is valid. Server-parser keeps working via delegation.

- [ ] **Step 1: Write the failing test.**

```js
describe('AI config — module level', () => {
  test('ai block at module top-level parses', () => {
    const ast = parse(`ai {
      provider: "anthropic"
      model: "claude-haiku"
      api_key: "k"
    }`);
    expect(ast.body[0].type).toBe('AiConfigDeclaration');
    expect(ast.body[0].name).toBeNull();
  });

  test('named ai block at module top-level parses', () => {
    const ast = parse(`ai "claude" {
      provider: "anthropic"
      model: "claude-haiku"
      api_key: "k"
    }`);
    expect(ast.body[0].type).toBe('AiConfigDeclaration');
    expect(ast.body[0].name).toBe('claude');
  });

  test('ai block inside shared parses', () => {
    const ast = parse(`shared {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "k"
      }
    }`);
    const block = ast.body.find(n => n.type === 'SharedBlock');
    expect(block.body[0].type).toBe('AiConfigDeclaration');
  });

  test('existing server-level ai block still works', () => {
    const ast = parse(`server { ai { provider: "anthropic", model: "x", api_key: "y" } }`);
    expect(ast.body[0].body[0].type).toBe('AiConfigDeclaration');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bun test tests/ai.test.js -t "module level"`
Expected: FAIL — top-level `ai` produces a parse error.

- [ ] **Step 3: Implementation.**

(a) In `src/parser/parser.js`, locate the top-level statement dispatch (the part that peeks an identifier and fans out to specific parsers). Add:

```js
// Module-level `ai { ... }` or `ai "name" { ... }`
if (this.check(TokenType.IDENTIFIER) &&
    this.current().value === 'ai' &&
    (this.peek(1).type === TokenType.LBRACE || this.peek(1).type === TokenType.STRING)) {
  return this.parseAiConfig();
}
```

(b) Move the body of `ParserClass.prototype.parseAiConfig` from `src/parser/server-parser.js` to `src/parser/parser.js` (attach it as `Parser.prototype.parseAiConfig`). In `server-parser.js`, replace the method body with `return Parser.prototype.parseAiConfig.call(this);` (or delete the duplicate if the prototype already resolves up the chain — verify via a quick test).

(c) Do the same dispatch inside `parseSharedBlock` / the `shared { }` body parser so the `ai` form is accepted there too.

- [ ] **Step 4: Run the full test suite.**

Run: `bun test`
Expected: new tests pass, no regressions.

- [ ] **Step 5: Commit.**

```bash
git add src/parser/parser.js src/parser/server-parser.js tests/ai.test.js
git commit -m "parser: lift ai{} config to module/shared level; server-parser delegates"
```

---

## Task 4: Codegen emits module-level `ai` binding

**Files:**
- Modify: `src/codegen/base-codegen.js` (or `src/codegen/codegen.js` depending on where module-mode lives — verify first)
- Modify: `src/codegen/shared-codegen.js`
- Test: `tests/ai.test.js`

When an `AiConfigDeclaration` appears at module top-level, emit `const ai = __createAI({...});` (or `const <name> = __createAI({...})` for named providers). Wire in the `__createAI` import for module-mode output.

- [ ] **Step 1: Write the failing test.**

```js
test('module-level ai block generates const ai = __createAI', () => {
  const result = compile(`ai { provider: "anthropic", model: "x", api_key: "k" }`);
  const out = typeof result === 'string' ? result : (result.module || result.shared || result.server || '');
  expect(out).toContain('const ai = __createAI');
});

test('module-level named ai block generates named const', () => {
  const result = compile(`ai "claude" { provider: "anthropic", model: "x", api_key: "k" }`);
  const out = typeof result === 'string' ? result : (result.module || result.shared || result.server || '');
  expect(out).toContain('const claude = __createAI');
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `bun test tests/ai.test.js -t "module-level ai block"`
Expected: FAIL.

- [ ] **Step 3: Implementation.**

Inspect how `AiConfigDeclaration` is currently emitted (see `src/codegen/server-codegen.js` around the `aiConfigs.push(stmt)` branch — roughly line 347 and the emission around line 633). Extract the emission into a small helper on `base-codegen.js`:

```js
emitAiConfig(node) {
  const parts = [];
  for (const [key, valueNode] of Object.entries(node.config)) {
    parts.push(`${key}: ${this.generateExpression(valueNode)}`);
  }
  const cfg = `{ ${parts.join(', ')} }`;
  const name = node.name || 'ai';
  return `const ${name} = __createAI(${cfg});`;
}
```

Call it from both:
- `server-codegen.js` AI client initialization path (replacing the inline emission)
- `codegen.js`/`base-codegen.js` module-mode visitor for top-level `AiConfigDeclaration`

Ensure `__createAI` is injected into the runtime preamble for module mode. The server path already injects it; mirror that. (Look for where `createAI` is imported and copy the pattern.)

- [ ] **Step 4: Run the full test suite.**

Run: `bun test`
Expected: new tests pass, server-block codegen tests still pass.

- [ ] **Step 5: Commit.**

```bash
git add src/codegen/base-codegen.js src/codegen/server-codegen.js src/codegen/codegen.js tests/ai.test.js
git commit -m "codegen: emit module-level ai bindings; centralize __createAI emission"
```

---

## Task 5: Analyzer registers module-level `ai` in scope

**Files:**
- Modify: `src/analyzer/analyzer.js`
- Test: `tests/ai.test.js`

Existing analyzer tests already prove `ai`/named providers are registered inside `server { }`. Extend that to module/`shared` scope.

- [ ] **Step 1: Write the failing test.**

```js
test('module-level ai is registered in scope (no E200)', () => {
  const result = analyze(`ai { provider: "anthropic", model: "x", api_key: "k" }\nresult = ai.ask("hi")`);
  const errs = (result.errors || []).filter(e => String(e.code || '') === 'E200');
  expect(errs.length).toBe(0);
});

test('module-level named ai is registered in scope (no E200)', () => {
  const result = analyze(`ai "claude" { provider: "anthropic", model: "x", api_key: "k" }\nresult = claude.ask("hi")`);
  const errs = (result.errors || []).filter(e => String(e.code || '') === 'E200');
  expect(errs.length).toBe(0);
});

test('ai bindings are module-local (not auto-exported)', () => {
  // Compiling a module that declares `ai {}` should NOT emit `export` for it.
  const out = compile(`ai { provider: "anthropic", model: "x", api_key: "k" }`);
  const code = typeof out === 'string' ? out : (out.module || out.server || out.shared || '');
  expect(code).toMatch(/const\s+ai\s*=\s*__createAI/);
  expect(code).not.toMatch(/export\s+(const\s+ai|\{[^}]*\bai\b[^}]*\})/);
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `bun test tests/ai.test.js -t "module-level ai is registered"`
Expected: FAIL.

- [ ] **Step 3: Implementation.**

Locate the `AiConfigDeclaration` visitor in `src/analyzer/analyzer.js`. It currently only runs inside the server-block walker. Hoist the registration: when the analyzer walks top-level program nodes (or a `shared` block), any `AiConfigDeclaration` must call the same `_registerAiBinding(name)` helper. Extract that helper if it's inlined.

- [ ] **Step 4: Run full suite.**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add src/analyzer/analyzer.js tests/ai.test.js
git commit -m "analyzer: register module- and shared-level ai bindings in scope"
```

---

## Task 6: Env-default `ai` emission

**Files:**
- Modify: `src/codegen/base-codegen.js` (or `codegen.js`)
- Modify: `src/analyzer/analyzer.js` (track "file uses `ai` without an explicit binding")
- Test: `tests/ai.test.js`

Per spec §1.3, when the compiled unit references `ai` (as a free variable, as a prompt-literal tag, or via an unbound `prompt fn`) and no `ai { }` block resolves that reference, the codegen prepends an env-backed `const ai = __createDefaultAI();` declaration.

Since `TAGGED_STRING` and `PromptFnDeclaration` don't exist yet, in this task we only handle the **free-variable `ai` reference** case. The two other triggers will be handled incrementally in their own tasks (Tasks 8 and 10).

- [ ] **Step 1: Write the failing test.**

```js
test('using ai.ask without a block emits __createDefaultAI', () => {
  const result = compile(`result = ai.ask("hi")`);
  const out = typeof result === 'string' ? result : (result.module || result.server || result.shared || '');
  expect(out).toContain('__createDefaultAI');
  expect(out).toMatch(/const ai = __createDefaultAI/);
});

test('using ai.ask WITH a block does NOT emit __createDefaultAI', () => {
  const result = compile(`ai { provider: "anthropic", model: "x", api_key: "k" }\nresult = ai.ask("hi")`);
  const out = typeof result === 'string' ? result : (result.module || result.server || result.shared || '');
  expect(out).not.toContain('__createDefaultAI');
});

test('__createDefaultAI is emitted exactly once even with multiple triggers', () => {
  // Extension: the flag-then-emit rule from later tasks must not double-emit
  // when both a free `ai` reference and an `ai"..."` prompt literal exist.
  // Until Task 8 lands, this case tests only the free-var trigger — still
  // useful to lock the "exactly one prefix" invariant.
  const result = compile(`x = ai.ask("a")\ny = ai.ask("b")`);
  const out = typeof result === 'string' ? result : (result.module || result.server || result.shared || '');
  const matches = out.match(/__createDefaultAI/g) || [];
  expect(matches.length).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `bun test tests/ai.test.js -t "__createDefaultAI"`
Expected: FAIL.

- [ ] **Step 3: Implementation.**

(a) In the analyzer, after scope resolution, compute `usesImplicitAi = (free reference to identifier "ai" exists) && (no AiConfigDeclaration binds it)`. Attach the flag to the program AST (e.g. `program._usesImplicitAi = true`).

(b) In module/server codegen, check the flag. If set, prepend `const ai = __createDefaultAI();` to the emitted output right after the runtime preamble.

(c) In the runtime preamble emission, add an import/inject for `createDefaultAI` alongside `createAI`. Alias as `__createDefaultAI`.

- [ ] **Step 4: Run full suite.**

Run: `bun test`
Expected: new tests pass, no regressions.

- [ ] **Step 5: Commit.**

```bash
git add src/codegen/ src/analyzer/analyzer.js tests/ai.test.js
git commit -m "codegen: emit env-default ai client when ai is referenced without a block"
```

---

## Task 7: Lexer emits `TAGGED_STRING`

**Files:**
- Modify: `src/lexer/tokens.js`
- Modify: `src/lexer/lexer.js`
- Test: `tests/lexer.test.js`

Per spec §2: when an `IDENTIFIER` is immediately followed (no whitespace, no newline) by `"` or `"""`, and the identifier is not `f` or `r`, emit a single `TAGGED_STRING` token carrying `{ tag: "<ident>", value: "<string contents, interpolation-aware>" }`.

- [ ] **Step 1: Add `TAGGED_STRING` token type.**

In `src/lexer/tokens.js`, add to the `TokenType` enum:

```js
TAGGED_STRING: 'TAGGED_STRING',
```

- [ ] **Step 2: Write the failing test.** Add to `tests/lexer.test.js` (or create `tests/lexer-tagged-string.test.js` if easier):

```js
describe('tagged strings', () => {
  test('claude"hello" emits a single TAGGED_STRING token wrapping STRING', () => {
    const tokens = new Lexer('claude"hello"', 't').tokenize();
    const sig = tokens.filter(t => t.type !== 'NEWLINE' && t.type !== 'EOF');
    expect(sig.length).toBe(1);
    expect(sig[0].type).toBe('TAGGED_STRING');
    expect(sig[0].value.tag).toBe('claude');
    expect(sig[0].value.inner.type).toBe('STRING');
    expect(sig[0].value.inner.value).toBe('hello');
  });

  test('claude"hello {name}" emits TAGGED_STRING wrapping STRING_TEMPLATE', () => {
    const tokens = new Lexer('claude"hello {name}"', 't').tokenize();
    const sig = tokens.filter(t => t.type !== 'NEWLINE' && t.type !== 'EOF');
    expect(sig.length).toBe(1);
    expect(sig[0].type).toBe('TAGGED_STRING');
    expect(sig[0].value.tag).toBe('claude');
    expect(sig[0].value.inner.type).toBe('STRING_TEMPLATE');
    const parts = sig[0].value.inner.value;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.some(p => p.type === 'expr')).toBe(true);
  });

  test('f"hello" is NOT a TAGGED_STRING (f stays reserved)', () => {
    const tokens = new Lexer('f"hello"', 't').tokenize();
    expect(tokens.some(t => t.type === 'TAGGED_STRING')).toBe(false);
  });

  test('r"hello" is NOT a TAGGED_STRING (r stays reserved)', () => {
    const tokens = new Lexer('r"hello"', 't').tokenize();
    expect(tokens.some(t => t.type === 'TAGGED_STRING')).toBe(false);
  });

  test('whitespace between ident and quote disables tag', () => {
    const tokens = new Lexer('claude "hello"', 't').tokenize();
    // Should lex as IDENTIFIER + STRING, not TAGGED_STRING
    expect(tokens.some(t => t.type === 'TAGGED_STRING')).toBe(false);
    expect(tokens.some(t => t.type === 'IDENTIFIER' && t.value === 'claude')).toBe(true);
    expect(tokens.some(t => t.type === 'STRING')).toBe(true);
  });

  test('triple-quoted variant: claude"""x""" is a TAGGED_STRING', () => {
    const tokens = new Lexer('claude"""hello"""', 't').tokenize();
    expect(tokens.some(t => t.type === 'TAGGED_STRING' && t.value.tag === 'claude')).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify tests fail.**

Run: `bun test tests/lexer.test.js -t "tagged strings"`
Expected: FAIL.

- [ ] **Step 4: Implementation.**

**Established fact (verified during plan authoring):** `scanString()` emits **exactly one token** per string — `STRING` for plain strings and `STRING_TEMPLATE` for interpolated ones (both plain double-quoted and triple-quoted inputs collapse to a single token; the template's interpolations are carried inside the token's `value` as an array of `text`/`expr` parts). This simplifies the tag path — there is no splice-marker case.

In `src/lexer/lexer.js`, inside `scanIdentifier()` (around line 867), **after** the existing `r"..."` (line 888) and `f"..."` (line 905) specializations, add:

```js
// Tagged prompt literal: <ident>"..." / <ident>"""..."""
// Requires adjacency: scanIdentifier stops at the first non-identifier char, so
// the next char being `"` means no whitespace was consumed between them.
if (value !== 'f' && value !== 'r' && this.pos < this.length && this.peek() === '"') {
  const beforeLen = this.tokens.length;
  this.scanString(); // pushes exactly one STRING or STRING_TEMPLATE token
  const emitted = this.tokens[beforeLen];
  // Wrap the emitted token as a TAGGED_STRING while preserving its payload.
  this.tokens[beforeLen] = new Token(
    TokenType.TAGGED_STRING,
    { tag: value, inner: emitted },  // `inner` carries either STRING or STRING_TEMPLATE shape
    startLine,
    startCol,
  );
  return;
}
```

The `{ tag, inner }` shape keeps the original scanned token available so the parser can reuse the existing String/StringTemplate parse path on the inner payload. Do not invent a new payload format — the parser task uses `inner` directly.

- [ ] **Step 5: Run lexer tests and verify pass.**

Run: `bun test tests/lexer.test.js`
Expected: new tests pass; no existing tests regress.

- [ ] **Step 6: Commit.**

```bash
git add src/lexer/tokens.js src/lexer/lexer.js tests/lexer.test.js
git commit -m "lexer: emit TAGGED_STRING for <ident>\"...\" adjacency"
```

---

## Task 8: Parse and lower prompt literals

**Files:**
- Modify: `src/parser/ast.js` (add `PromptLiteral` node)
- Modify: `src/parser/parser.js` (recognize `TAGGED_STRING` in `parsePrimary`)
- Modify: `src/analyzer/analyzer.js` (resolve tag; emit `E703`)
- Modify: `src/codegen/base-codegen.js` (lower `PromptLiteral` to `<tag>.ask(...)`)
- Test: `tests/ai.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
describe('prompt literals', () => {
  test('ai"hello" parses as PromptLiteral and codegens to ai.ask', () => {
    const ast = parse(`ai { provider: "anthropic", model: "x", api_key: "k" }\nresult = ai"hello {name}"`);
    const assignment = ast.body.find(n => n.type === 'VariableDeclaration' || n.type === 'Assignment' || n.type === 'ExpressionStatement');
    // Find a PromptLiteral anywhere in the tree; simpler than depending on exact shape:
    const json = JSON.stringify(ast);
    expect(json).toContain('"PromptLiteral"');
    expect(json).toContain('"tag":"ai"');
    const out = compile(`ai { provider: "anthropic", model: "x", api_key: "k" }\nresult = ai"hello"`);
    const code = typeof out === 'string' ? out : (out.module || out.server || out.shared || '');
    expect(code).toContain('ai.ask');
  });

  test('E703 when tag is not an AI binding', () => {
    const result = analyze(`x = 1\nresult = x"hello"`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E703') || e.message.toLowerCase().includes('not an ai provider'));
    expect(err).toBeDefined();
  });

  test('interpolation in prompt literals compiles to a template literal', () => {
    const out = compile(`ai { provider: "anthropic", model: "x", api_key: "k" }\nname = "world"\nresult = ai"hello {name}"`);
    const code = typeof out === 'string' ? out : (out.module || out.server || out.shared || '');
    // The lowered call should be `ai.ask(\`hello ${name}\`)` (modulo whitespace and awaits).
    // Assert the key shape tokens appear in order: ai.ask( ... `hello ${ ... name ... }` ... )
    expect(code).toMatch(/ai\.ask\(\s*`hello \$\{[^`]*name[^`]*\}`/);
  });
});
```

- [ ] **Step 2: Run tests to verify fail.**

Run: `bun test tests/ai.test.js -t "prompt literals"`
Expected: FAIL.

- [ ] **Step 3: AST node.**

In `src/parser/ast.js`, add:

```js
export class PromptLiteral {
  constructor(tag, template, loc) {
    this.type = 'PromptLiteral';
    this.tag = tag;            // string, the identifier
    this.template = template;  // AST of the string expression (reuse existing String/InterpolatedString node)
    this.loc = loc;
  }
}
```

- [ ] **Step 4: Parser.**

In `src/parser/parser.js`, inside `parsePrimary()` (or wherever literal tokens are handled), add:

```js
if (this.check(TokenType.TAGGED_STRING)) {
  const tok = this.advance();
  const { tag, inner } = tok.value;
  // `inner` is the token that scanString() would have emitted on its own:
  //   { type: 'STRING', value: <string> } or
  //   { type: 'STRING_TEMPLATE', value: <parts[]> }
  // Reuse the existing primary-expression builders for each shape. Do NOT
  // re-invoke parseExpression — the inner payload is not in the token stream.
  const template = inner.type === 'STRING_TEMPLATE'
    ? this._buildStringTemplateAst(inner, tok)     // existing helper used by STRING_TEMPLATE parsing
    : new AST.StringLiteral(inner.value, tok);
  return new AST.PromptLiteral(tag, template, tok);
}
```

Find the existing branch that handles `STRING_TEMPLATE` in `parsePrimary` and extract it into a `_buildStringTemplateAst(token, loc)` helper if it isn't already factored. Use that helper from both the normal string path and the prompt-literal path.

- [ ] **Step 5: Analyzer.**

In the expression visitor for `PromptLiteral`, look up `node.tag` in scope. If it resolves to an AI-typed binding (tracked via `_aiBindings` set populated in Task 5), accept. Else emit `E703` with the `did-you-mean` hint from the spec.

- [ ] **Step 6: Codegen.**

In `src/codegen/base-codegen.js`, add a visitor:

```js
visitPromptLiteral(node) {
  const template = this.generateExpression(node.template);
  return `await ${node.tag}.ask(${template})`;
}
```

(If the surrounding context is not `async`, the analyzer's existing await-outside-async diagnostic fires. That's intentional — no special-casing.)

Also update the env-default trigger in Task 6: the analyzer must now also set `program._usesImplicitAi = true` if any `PromptLiteral` has `tag === 'ai'` and no `ai` block binds it.

- [ ] **Step 7: Run full suite.**

Run: `bun test`
Expected: all pass.

- [ ] **Step 8: Commit.**

```bash
git add src/parser/ast.js src/parser/parser.js src/analyzer/analyzer.js src/codegen/base-codegen.js tests/ai.test.js
git commit -m "lang: prompt literals (ai\"...\" and claude\"...\" tagged strings)"
```

---

## Task 9: Parse `prompt fn` declarations

**Files:**
- Modify: `src/parser/ast.js` (add `PromptFnDeclaration`)
- Modify: `src/parser/parser.js` (contextual `prompt fn` keyword; `with <provider>` suffix)
- Test: `tests/ai.test.js`

Contextual keyword rule: `prompt` is recognized as the declaration introducer only when the very next token is `fn`.

- [ ] **Step 1: Write the failing tests.**

```js
describe('prompt fn declarations', () => {
  test('prompt fn with String return parses', () => {
    const ast = parse(`prompt fn summarize(text: String) -> String { "Summarize: {text}" }`);
    const decl = ast.body[0];
    expect(decl.type).toBe('PromptFnDeclaration');
    expect(decl.name).toBe('summarize');
    expect(decl.params.length).toBe(1);
    expect(decl.returnType).toBeDefined();
    expect(decl.provider).toBeNull();
    expect(decl.body.type).toMatch(/String/);
  });

  test('prompt fn with provider suffix parses', () => {
    const ast = parse(`prompt fn deep(x: String) -> String with smart { "..." }`);
    const decl = ast.body[0];
    expect(decl.type).toBe('PromptFnDeclaration');
    expect(decl.provider).toBe('smart');
  });

  test('prompt identifier outside `prompt fn` still works', () => {
    // prompt("name?") in a client context should still parse as an identifier call
    const ast = parse(`client { name = prompt("name?") }`);
    // Must not crash and must not produce a PromptFnDeclaration
    expect(JSON.stringify(ast)).not.toContain('PromptFnDeclaration');
  });

  test('E704 when body is not a single string', () => {
    const result = analyze(`prompt fn bad(x: String) -> String { x + "!" }`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E704') || e.message.toLowerCase().includes('single string'));
    expect(err).toBeDefined();
  });

  test('regression: `with ... as` context-manager statement still parses', () => {
    // T3-7 context manager syntax must not be disturbed by the prompt fn `with <provider>` suffix.
    const ast = parse(`with open("file.txt") as f { data = f.read() }`);
    // Just assert it parses without error — exact AST shape is owned by T3-7.
    expect(ast.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify fail.**

Run: `bun test tests/ai.test.js -t "prompt fn declarations"`
Expected: FAIL.

- [ ] **Step 3: AST node.**

```js
export class PromptFnDeclaration {
  constructor(name, params, returnType, body, provider, loc) {
    this.type = 'PromptFnDeclaration';
    this.name = name;
    this.params = params;
    this.returnType = returnType;
    this.body = body;        // must be a single string expression (validated in analyzer for E704)
    this.provider = provider; // string | null
    this.loc = loc;
  }
}
```

- [ ] **Step 4: Parser.**

**Verified token facts** (from `src/lexer/tokens.js`): `FN: 'FN'`, `WITH: 'WITH'`, `THIN_ARROW: 'THIN_ARROW'` (i.e. `->`), `ARROW: 'ARROW'` (i.e. `=>`). **Use `THIN_ARROW` for the return-type arrow — `ARROW` is the lambda `=>`.** Existing function declarations at `parser.js:775, 800, 848, 909` all use `this.match(TokenType.THIN_ARROW)` and then `parseTypeAnnotation()` — mirror that exactly.

In the statement dispatch, **before** the regular identifier path:

```js
// Contextual keyword: `prompt fn name(params) -> Type [with provider] { "..." }`
if (this.check(TokenType.IDENTIFIER) &&
    this.current().value === 'prompt' &&
    this.peek(1).type === TokenType.FN) {
  return this.parsePromptFnDeclaration();
}
```

Then implement `parsePromptFnDeclaration()`:

```js
parsePromptFnDeclaration() {
  const l = this.loc();
  this.advance(); // consume 'prompt'
  this.expect(TokenType.FN);
  const name = this.expect(TokenType.IDENTIFIER, "Expected prompt fn name").value;
  this.expect(TokenType.LPAREN);
  const params = this.parseParameterList();
  this.expect(TokenType.RPAREN);
  this.expect(TokenType.THIN_ARROW, "prompt fn requires a return type (use '-> Type')");
  const returnType = this.parseTypeAnnotation();
  let provider = null;
  if (this.check(TokenType.WITH)) {
    this.advance(); // consume 'with'
    provider = this.expect(TokenType.IDENTIFIER, "Expected provider identifier after 'with'").value;
  }
  this.expect(TokenType.LBRACE);
  const body = this.parseExpression(); // analyzer enforces single-string-expression invariant (E704)
  this.expect(TokenType.RBRACE);
  return new AST.PromptFnDeclaration(name, params, returnType, body, provider, l);
}
```

- [ ] **Step 5: Analyzer E704 check.**

In the `PromptFnDeclaration` visitor, check `node.body.type`. Accept `StringLiteral`, `InterpolatedString`, `TripleQuoteString` (whatever the existing names are). Reject anything else with `E704`.

- [ ] **Step 6: Run full suite.**

Run: `bun test`
Expected: all pass. Importantly, verify `tests/client-dom-apis.test.js` still passes — specifically the `prompt("name?")` test.

- [ ] **Step 7: Commit.**

```bash
git add src/parser/ast.js src/parser/parser.js src/analyzer/analyzer.js tests/ai.test.js
git commit -m "parser: prompt fn declarations with optional 'with <provider>' clause"
```

---

## Task 10: Dispatch `prompt fn` by return type (analyzer + codegen)

**Files:**
- Modify: `src/analyzer/types.js` (add classifier helper)
- Modify: `src/analyzer/analyzer.js` (call classifier; emit `E702` on reject)
- Modify: `src/codegen/base-codegen.js` (lower `PromptFnDeclaration` based on method)
- Test: `tests/ai.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
describe('prompt fn dispatch', () => {
  test('String return lowers to ask', () => {
    const out = compile(`prompt fn s(t: String) -> String { "Summarize: {t}" }`);
    const code = typeof out === 'string' ? out : (out.module || '');
    expect(code).toContain('.ask(');
  });

  test('record return lowers to extract', () => {
    const out = compile(`
      type Contact { name: String }
      prompt fn ec(raw: String) -> Contact { "Extract: {raw}" }
    `);
    const code = typeof out === 'string' ? out : (out.module || '');
    expect(code).toContain('.extract(');
  });

  test('fieldless enum return lowers to classify', () => {
    const out = compile(`
      type Category = Bug | Feature | Other
      prompt fn tr(t: String) -> Category { "Classify: {t}" }
    `);
    const code = typeof out === 'string' ? out : (out.module || '');
    expect(code).toContain('.classify(');
  });

  test('E702 for Option return', () => {
    const result = analyze(`prompt fn bad(x: String) -> Option<String> { "..." }`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E702'));
    expect(err).toBeDefined();
  });

  test('E702 for union return', () => {
    const result = analyze(`prompt fn bad(x: String) -> String | Int { "..." }`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E702'));
    expect(err).toBeDefined();
  });

  test('with <provider> uses that provider in codegen', () => {
    const out = compile(`
      ai "smart" { provider: "anthropic", model: "x", api_key: "k" }
      prompt fn deep(x: String) -> String with smart { "..." }
    `);
    const code = typeof out === 'string' ? out : (out.module || '');
    expect(code).toContain('smart.ask(');
  });
});
```

- [ ] **Step 2: Run to verify fails.**

Run: `bun test tests/ai.test.js -t "prompt fn dispatch"`
Expected: FAIL.

- [ ] **Step 3: Classifier helper.**

In `src/analyzer/types.js`, add:

```js
// Returns 'ask' | 'extract' | 'classify' | null (null = reject with E702)
export function classifyPromptFnReturn(type) {
  if (!type) return null;
  if (type.isPrimitive && type.isPrimitive()) return 'ask';               // String/Int/Float/Bool
  if (type.isArray && type.isArray() && type.element?.isPrimitive?.()) return 'ask';
  if (type.isFieldlessEnum && type.isFieldlessEnum()) return 'classify';
  if (type.isRecord && type.isRecord()) return 'extract';
  // Everything else: Any, Unknown, Nil, TypeVariable, Option/Result/generic, Map, Set, tuples,
  // [Record], [Enum], Union — reject.
  return null;
}
```

Add small matching helpers (`isPrimitive`, `isRecord`, `isFieldlessEnum`, `isArray`) on the existing `Type` hierarchy if not present. Keep them small and local.

- [ ] **Step 4: Analyzer dispatch.**

In the `PromptFnDeclaration` visitor (after E704 body check), call `classifyPromptFnReturn(resolvedReturnType)`. Store the result on `node._method = 'ask' | 'extract' | 'classify'`. If `null`, emit `E702`.

- [ ] **Step 5: Codegen.**

Lower `PromptFnDeclaration` to an async function of the right shape:

```js
visitPromptFnDeclaration(node) {
  const provider = node.provider || 'ai';
  const params = node.params.map(p => p.name).join(', ');
  const template = this.generateExpression(node.body);
  switch (node._method) {
    case 'ask':
      return `async function ${node.name}(${params}) { return ${provider}.ask(${template}); }`;
    case 'extract':
      return `async function ${node.name}(${params}) { return ${provider}.extract(${template}, ${this.typeSchemaFor(node.returnType)}); }`;
    case 'classify':
      return `async function ${node.name}(${params}) { return ${provider}.classify(${template}, ${this.typeSchemaFor(node.returnType)}); }`;
  }
}
```

(`typeSchemaFor` already exists for server-side `extract`/`classify` — find it in `server-codegen.js` and hoist if needed.)

- [ ] **Step 6: Env-default trigger extension.**

A `prompt fn` without `with <provider>` and without an enclosing `ai` block must also set `program._usesImplicitAi = true`. Update the analyzer check from Task 6 to cover this case.

- [ ] **Step 7: Run full suite.**

Run: `bun test`
Expected: all pass.

- [ ] **Step 8: Commit.**

```bash
git add src/analyzer/ src/codegen/ tests/ai.test.js
git commit -m "lang: prompt fn dispatch by return type (ask/extract/classify)"
```

---

## Task 11: `E700`/`E701` for client-block AI usage

**Files:**
- Modify: `src/analyzer/analyzer.js`
- Test: `tests/ai.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
describe('AI in client blocks is an error', () => {
  test('E700 when ai.ask is called inside client {}', () => {
    const result = analyze(`client { x = ai.ask("hi") }`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E700'));
    expect(err).toBeDefined();
  });

  test('E700 when prompt literal is used inside client {}', () => {
    const result = analyze(`client { x = ai"hi" }`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E700'));
    expect(err).toBeDefined();
  });

  test('E701 when ai {} block appears inside client {}', () => {
    const result = analyze(`client { ai { provider: "anthropic", model: "x", api_key: "k" } }`);
    const err = (result.errors || []).find(e => String(e.code || '').includes('E701'));
    expect(err).toBeDefined();
  });

  test('no error when ai.ask is called inside shared {}', () => {
    const result = analyze(`shared { ai { provider: "anthropic", model: "x", api_key: "k" } fn use() { ai.ask("hi") } }`);
    const errs = (result.errors || []).filter(e => String(e.code || '').match(/E70[01]/));
    expect(errs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fails.**

Run: `bun test tests/ai.test.js -t "client blocks is an error"`
Expected: FAIL.

- [ ] **Step 3: Implementation.**

The analyzer already tracks block context (`src/analyzer/analyzer.js` line ~414, ~1734, ~2987). In the `ClientBlock` visitor:
- When visiting any child `AiConfigDeclaration`, emit `E701` immediately.
- While walking the tree with `inClientBlock = true`, intercept:
  - `CallExpression` whose callee resolves to an AI binding or is a prompt-fn name
  - Any `PromptLiteral` node
  - Any `MemberExpression` where `object` is an AI binding and `property` is one of `ask`/`chat`/`embed`/`extract`/`classify` (when invoked)
- Emit `E700` at each site with the fix suggestion from the spec.

- [ ] **Step 4: Run full suite.**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add src/analyzer/analyzer.js tests/ai.test.js
git commit -m "analyzer: E700/E701 reject AI usage inside client blocks"
```

---

## Task 12: `W304` / `E705` for hardcoded `api_key`

**Files:**
- Modify: `src/analyzer/analyzer.js`
- Test: `tests/ai.test.js`

- [ ] **Step 1: Write the failing tests.**

```js
describe('hardcoded api_key diagnostics', () => {
  test('W304 warning when api_key is a string literal', () => {
    const result = analyze(`ai { provider: "anthropic", model: "x", api_key: "sk-xxxx" }`);
    const w = (result.warnings || []).find(d => String(d.code || '').includes('W304'));
    expect(w).toBeDefined();
  });

  test('no W304 when api_key uses env()', () => {
    const result = analyze(`ai { provider: "anthropic", model: "x", api_key: env("K") }`);
    const w = (result.warnings || []).find(d => String(d.code || '').includes('W304'));
    expect(w).toBeUndefined();
  });

  test('E705 error under --strict', () => {
    const ast = parse(`ai { provider: "anthropic", model: "x", api_key: "sk-xxxx" }`);
    const analyzer = new Analyzer(ast, 'test.tova', { tolerant: true, strict: true });
    const result = analyzer.analyze();
    const err = (result.errors || []).find(d => String(d.code || '').includes('E705'));
    expect(err).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify fails.**

Run: `bun test tests/ai.test.js -t "hardcoded api_key"`
Expected: FAIL.

- [ ] **Step 3: Implementation.**

**Verified:** `src/analyzer/analyzer.js:129` sets `this.strict = options.strict || false;` — so `new Analyzer(ast, file, { strict: true })` is the correct invocation. The test above matches this exactly. In the `AiConfigDeclaration` visitor, check whether `config.api_key?.type === 'StringLiteral'`. If so and `!this.strict`, push `W304`; if `this.strict`, push `E705`.

- [ ] **Step 4: Run full suite.**

Run: `bun test`
Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add src/analyzer/analyzer.js tests/ai.test.js
git commit -m "analyzer: warn (W304) / error under --strict (E705) on hardcoded api_key"
```

---

## Task 13: LSP inlay hints + quick-fix

**Files:**
- Modify: `src/lsp/server.js`
- Test: `tests/lsp.test.js` (the file exists — add tests to it)

- [ ] **Step 1: Write the failing tests.**

Before any implementation, add tests to `tests/lsp.test.js` that:
1. Assert the inlay-hint provider returns a hint with label `": ask"` / `": extract"` / `": classify"` at the declaration site of each corresponding `prompt fn`.
2. Assert the inlay-hint provider returns a hint with label `": ask"` at a prompt-literal position.
3. Assert that a document containing `client { ai { provider: "anthropic", model: "x", api_key: "k" } }` produces a code action with the title pattern `/Move .*ai.* block/` for the E701 diagnostic.

Match the existing test style in `tests/lsp.test.js` — read the first 40–80 lines of that file to copy the harness pattern.

- [ ] **Step 2: Run tests to verify fail.**

Run: `bun test tests/lsp.test.js -t "prompt"`
Expected: FAIL.

- [ ] **Step 3: Inlay hints.**

Extend the existing inlay-hint visitor (T10-7) so that for each `PromptLiteral` and `PromptFnDeclaration`, it emits a hint showing the dispatched method, e.g. `: ask` or `: extract` or `: classify`.

- [ ] **Step 4: Quick-fix for E701.**

Add a code-action handler that, given an `E701` diagnostic, offers "Move `ai` block to module top-level" — the text edit removes the block from its `client { ... }` position and prepends it before the enclosing file's first block.

- [ ] **Step 5: Run tests to verify pass.**

Run: `bun test tests/lsp.test.js`
Expected: new tests pass; no regressions.

- [ ] **Step 6: Commit.**

```bash
git add src/lsp/server.js tests/lsp.test.js
git commit -m "lsp: inlay hints for prompt literals / prompt fn; E701 quick-fix"
```

---

## Task 14: Docs rewrite

**Files:**
- Modify: `docs/guide/ai.md`

- [ ] **Step 1: Rewrite the opening paragraph around the ambient model.**

Replace the current "add an `ai {}` block inside a `server` block" framing with: "AI works anywhere server-reachable — scripts, modules, `server`, and `shared` blocks. Configure with an `ai { }` block or let the compiler pick up `TOVA_AI_*` env vars."

- [ ] **Step 2: Add a "What's new" section** at the top with side-by-side before/after snippets. Each of the four entries below must contain one concrete "before" block and one concrete "after" block (not bullet summaries):
  1. Module-level `ai { }`
  2. Prompt literal `ai"..."` / `claude"..."`
  3. `prompt fn` declarations — one case per dispatch method (ask/extract/classify)
  4. Callable providers in pipes (`|> claude`)

**Acceptance check:** after the edit, `grep -c '^### Before' docs/guide/ai.md` should print at least `4`, and `grep -c '^### After' docs/guide/ai.md` should print at least `4`. Run these greps as part of the task; if the counts are lower, the section is incomplete.

- [ ] **Step 3: Keep the existing content** further down for reference. Update only opening framing and add the new section.

- [ ] **Step 4: Commit.**

```bash
git add docs/guide/ai.md
git commit -m "docs: rewrite AI guide around ambient model + new syntax"
```

---

## Task 15: Final verification

- [ ] **Step 1: Run the full test suite.**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 2: Run the build.**

Run: `bun scripts/embed-runtime.js` (to ensure the runtime embed still succeeds with the modified `ai.js`)
Expected: exits 0.

- [ ] **Step 3: Smoke-test with a real script.** Create `tmp/smoke.tova` (make the directory first with `mkdir -p tmp`):

```tova
prompt fn summarize(text: String) -> String {
  "Summarize in 10 words: {text}"
}

result = summarize("The quick brown fox jumps over the lazy dog.")
print(result)
```

Run: `TOVA_AI_PROVIDER=anthropic TOVA_AI_MODEL=claude-haiku TOVA_AI_API_KEY=dummy bun bin/tova.js run tmp/smoke.tova` and verify it compiles and emits `__createDefaultAI` in the output (actual API call is expected to fail with a 401, which is fine — we only want to see the compiled shape is right).

Alternatively: `bun bin/tova.js compile tmp/smoke.tova` and inspect the generated JS for `__createDefaultAI` and `summarize` calling `ai.ask`.

- [ ] **Step 4: Cleanup.**

```bash
rm -f tmp/smoke.tova
```

- [ ] **Step 5: Update TASKS.md.**

Add a new row (or section) documenting the shipped work so the project tracker reflects reality.

- [ ] **Step 6: Final commit.**

```bash
git add TASKS.md
git commit -m "tasks: record fluent AI syntax shipped"
```

---

## What's intentionally left out

- Parallel pipe operator / `await_all` helper.
- System-prompt syntax inside `prompt fn`.
- Streaming prompt literals.
- Client-side auto-proxy routes.
- Cost/token tracking.
- Caching of prompt calls.
- Transitive reachability for `E700`.

All are explicit non-goals in the spec. Do not implement them as part of this plan.
