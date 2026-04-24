# Fluent AI Syntax — Design

**Date:** 2026-04-24
**Status:** Draft — awaiting review
**Affects:** Tova language surface, analyzer, codegen, runtime, docs

## Summary

Today, AI in Tova only works inside a `server { }` block: the `ai { }` configuration declaration is parsed only by `server-parser.js`, and the resulting `const ai = __createAI(...)` is emitted only by `server-codegen.js`. As a result, plain `.tova` scripts, modules, and `shared` code cannot configure or use AI, and AI does not compose fluently with Tova's pipe-oriented style.

This spec makes `ai` an ambient, first-class value anywhere server-reachable, adds two pieces of new syntax (prompt literals and `prompt fn`), and makes every provider binding callable so pipes read naturally. No existing program breaks.

## Goals

1. Let users call `ai.ask(...)` — and the new sugar — from any server-reachable context: scripts, top-level modules, `shared` blocks, functions imported by the server.
2. Make prompts feel like ordinary Tova values: composable through pipes, `map`, and `derive`.
3. Keep API keys server-side. Client-side AI usage is a compile error with a concrete fix suggestion.
4. Zero breaking changes: every existing `server { ai { ... } }` program compiles and runs unchanged.

## Non-goals (explicitly out of scope)

- Parallel pipe operator or `await_all` helper.
- System-prompt syntax inside `prompt fn`.
- Streaming prompt literals returning async iterators.
- Client-side auto-proxy of AI calls through generated routes.
- Cost/token tracking primitives.
- Caching or memoization of prompt calls.

Each is a clean future extension that this design leaves room for.

## Design

### 1. Scope and resolution

#### 1.1 Where `ai { }` is legal

| Location | Allowed? | Notes |
|----------|----------|-------|
| Module top-level (plain `.tova` files, scripts) | ✅ new | `ai` becomes a module-scope binding |
| Inside `server { ... }` | ✅ existing | Unchanged |
| Inside `shared { ... }` | ✅ new | Server-reachable only |
| Inside `client { ... }` | ❌ | Error `E701` |

#### 1.2 Where AI calls are legal

AI calls — `ai.ask(...)`, prompt literals, prompt fns, callable providers — are legal anywhere server-reachable. A call inside `client { ... }` (or a browser-targeted output file) is a compile error:

```
E700: AI calls are server-only. Expose via a server route or use a shared server function.
```

The analyzer already tracks block context; this is one additional check at the call site.

#### 1.3 Default `ai` resolution (no block present)

When a file uses an AI construct without any `ai { }` block in scope, the compiler emits an implicit default client that reads configuration from env at first call:

- `TOVA_AI_PROVIDER` (default: `"custom"`)
- `TOVA_AI_MODEL`
- `TOVA_AI_API_KEY`
- `TOVA_AI_BASE_URL`

An explicit `ai { }` in the same or an enclosing scope shadows the env defaults. Named providers (`ai "claude" { ... }`) never read env unless the block itself says `api_key: env("...")`.

A script with no env vars and no block produces a clean runtime error at first call:

```
No AI provider configured. Set TOVA_AI_PROVIDER or add an `ai { }` block.
```

### 2. Prompt literals

```tova
summary    = ai"Summarize in 10 words: {text}"
translated = claude"Translate to French: {text}"
tagged     = fast"Tag as bug or feature: {issue}"

long_form  = claude"""
  Produce a three-paragraph analysis of:
  {document}
"""
```

Rules:
- Desugars to `<tag>.ask(f"...")`; interpolation follows existing f-string rules.
- The tag must resolve to an `ai`-typed binding (default `ai`, a named provider, or a `shared` alias). Any other binding is error `E703`.
- Triple-quoted variant supported, auto-dedented like other triple-quoted strings (T3-1).
- Lexer emits a single `TAGGED_STRING` token for `<ident>"..."` and `<ident>"""..."""`. The tag identifier is resolved by the analyzer, not the lexer; unresolved tags fall through to the existing parse-error path so unrelated juxtapositions aren't silently absorbed.

### 3. Prompt functions (`prompt fn`)

```tova
prompt fn summarize(text: String) -> String {
  "Summarize in 10 words: {text}"
}

prompt fn extract_contact(raw: String) -> ContactInfo {
  "Extract contact info from: {raw}"
}

prompt fn triage(issue: String) -> Category {
  "Classify this issue: {issue}"
}

prompt fn deep_analysis(x: String) -> Report with smart {
  "Produce a detailed report on: {x}"
}
```

Rules:
- Body must be exactly one string expression — single- or triple-quoted. Anything else is error `E704`.
- Return type drives method dispatch:
  - `String` / `Int` / `Float` / `Bool` / `[<primitive>]` → `ask`
  - Record / struct type → `extract(prompt, ReturnType)`
  - Fieldless enum / ADT variant type → `classify(prompt, ReturnType)`
  - Anything else (unions, generics, `Option`, tuples) → error `E702`, with the suggested fix "use a plain function that calls `ai.ask`/`.extract`/`.classify` explicitly."
- Optional `with <provider>` clause picks a non-default provider. Without it, the enclosing `ai` binding is used.
- Compiled as `async` automatically. Call sites follow the usual await/async rules; the analyzer's existing "Add `async` to function" quick-fix applies unchanged.

### 4. Callable providers

Every binding created by `ai { }` or `ai "name" { }` is callable. The default `ai` is also callable.

```tova
claude(text)              // == claude.ask(text)
summary = article |> claude
classifications = issues |> map(fast)
```

Methods remain: `.ask`, `.chat`, `.embed`, `.extract`, `.classify`. The callable form is sugar for `.ask` only — other methods must be accessed through their member name, since their signatures differ.

### 5. Pipe, async, and collection semantics

No new operators are introduced. Because providers are callable and `prompt fn`s are ordinary async functions, existing pipe machinery and the implicit `it` binding (T3-5) already produce fluent code:

```tova
summary = article |> summarize

summaries = articles |> map(summarize)
tickets |> derive(.category = triage(.description))
emails |> map(extract_contact) |> filter(it.email is not Nil)

moods = reviews |> map(fn(r) claude"Mood check: {r}")
moods = reviews |> map(claude"Mood of {it}")
```

Async model:
- All AI calls return promises.
- Using AI in a non-async `fn` triggers the existing "Add `async` to function" diagnostic.
- `map`/`filter`/`derive` over a collection of AI calls produce `[Promise<T>]`. Users collect results with `await Promise.all(...)` — this is explicit Tova today; the spec adds no implicit parallelism.

### 6. Error surface (new diagnostic codes)

| Code | Condition | Fix suggestion |
|------|-----------|----------------|
| `E700` | AI call inside `client { }` | "Expose via a server route or a shared server function" |
| `E701` | `ai { }` block inside `client { }` | "Move the `ai` block to `server { }` or module top-level" |
| `E702` | `prompt fn` return type cannot be dispatched | "Use a plain function that calls `ai.ask`/`.extract`/`.classify` explicitly" |
| `E703` | Prompt-literal tag is not an `ai`-typed binding | "`foo` is not an AI provider. Did you mean `ai\"...\"`?" |
| `E704` | `prompt fn` body is not a single string expression | "Prompt function body must be a string template" |
| `E705` | `api_key` is a hardcoded string literal (warning) | "Hardcoded API keys are a leak risk. Use `env(\"...\")`" — escalates to error under `--strict` |

One runtime error accompanies the env-default path (Section 1.3).

### 7. Worked examples

A plain script that was previously impossible:

```tova
// scripts/triage.tova — plain module, no server block
import { read_text } from "fs"

prompt fn triage(issue: String) -> Category {
  "Classify this issue: {issue}"
}

issues = read_text("issues.txt") |> str.split("\n---\n")
classifications = await Promise.all(issues |> map(triage))

for c in classifications {
  print(c)
}
```

A pipeline mixing two providers:

```tova
ai "fast" {
  provider: "anthropic"
  model: "claude-haiku"
  api_key: env("ANTHROPIC_API_KEY")
}

ai "smart" {
  provider: "anthropic"
  model: "claude-sonnet-4-20250514"
  api_key: env("ANTHROPIC_API_KEY")
}

enriched = reviews
  |> derive(.sentiment = fast"Classify as bug/feature/other: {.text}")
  |> where(.sentiment == "bug")
  |> derive(.root_cause = smart"Analyze root cause: {.text}")
```

## Implementation impact

Touching the smallest surface that delivers the design:

- **Lexer** `src/lexer/lexer.js` — emit `TAGGED_STRING` tokens for `<ident>"..."` and `<ident>"""..."""`.
- **Tokens** `src/lexer/tokens.js` — add `PROMPT` keyword; add `TAGGED_STRING` token type. Reuse the existing `WITH` keyword contextually for the `with <provider>` clause.
- **Parser** `src/parser/parser.js` — parse `prompt fn` declarations (one-string-expression body); parse `with <identifier>`; parse `TAGGED_STRING` expressions.
- **Module parser** `src/parser/parser.js` — lift `parseAiConfig` so `ai { }` is legal at module top-level and inside `shared { }`. Keep the server-parser dispatch in `parseServerStatement` unchanged for its existing entry.
- **AST** `src/parser/ast.js` — add `PromptFnDeclaration`, `PromptLiteral`. No new flag on `AiConfigDeclaration`; all AI bindings are callable by convention at runtime.
- **Analyzer** `src/analyzer/analyzer.js` —
  - Register `ai`/named providers as callable symbols in any scope where `ai { }` appears.
  - Resolve prompt-literal tags to AI bindings (`E703`).
  - Dispatch `prompt fn` by return type (`E702`).
  - Enforce client/browser-block rejection (`E700`, `E701`).
  - Warn on hardcoded `api_key` in `--strict` (`E705`).
- **Codegen** `src/codegen/base-codegen.js`, `src/codegen/server-codegen.js`, `src/codegen/codegen.js` —
  - Emit module-level `const ai = __createAI({...})` when an `ai { }` appears at top level.
  - Emit an implicit env-backed client when the file uses `ai` without a block.
  - Compile `PromptLiteral` to `<tag>.ask(\`...\`)`.
  - Compile `PromptFnDeclaration` to an `async` function that calls the selected method.
- **Runtime** `src/runtime/ai.js` — make the client a callable function-with-methods via `Object.assign(fn, methods)`; the bare call defaults to `ask`.
- **Tests** `tests/ai.test.js` — extend coverage for:
  - Module-level `ai { }`.
  - Prompt literals (all tag kinds, interpolation, triple-quote).
  - `prompt fn` (one test per dispatch case — `ask`/`extract`/`classify`; `E702` ambiguity case).
  - Callable provider shorthand.
  - `client { }`-block rejection (`E700`/`E701`).
- **Docs** `docs/guide/ai.md` — rewrite around the ambient model; add a "What's new" migration callout with side-by-side old/new snippets.
- **LSP** `src/lsp/server.js` — inlay hint showing the dispatched method on prompt-literal tags and `prompt fn` declarations; quick-fix for "move `ai` block out of `client`".

## Migration

Zero breaking changes. Every existing `server { ai { ... } }` program and every call to `ai.ask(...)` continue to compile and run identically. The new syntax is additive and can be adopted file-by-file.

## Open questions

None remaining after brainstorm. Open questions for future work are tracked under "Non-goals" above.
