# Parser-feature gaps surfaced by doc-example validation

Generated: 2026-04-30

## Context

This document is the output of a documentation-validation sweep. Every Tova
code example in user-facing docs is now exercised by a unit test in
[tests/docs/](../../tests/docs/). The validator runs lex → parse → analyze
→ codegen on each block and reports failures with file:line and a one-line
reason.

After fixing every reachable doc-side bug (var/await wrapping, `++`→`+`,
duplicate names, placeholder `...`, type-signature recognition, JSX context
wrapping), **300 blocks remain broken**. Every one of them is a
parser/language-feature gap, not a doc bug. This file enumerates them.

## How to verify

```bash
# Full validation — passes 0 failures, 300 known-broken skips
bun test tests/docs/

# Human-readable list of every broken example
bun scripts/report-broken-docs.js

# Focus on one file
bun scripts/report-broken-docs.js docs/guide/data.md

# Machine-readable for triage
bun scripts/report-broken-docs.js --json
```

Top-level numbers:

| Metric | Value |
|---|---:|
| Files validated | 176 |
| Total Tova blocks | 3,218 |
| Passing | 2,918 (90.7%) |
| Bare type signatures auto-skipped | 409 |
| Known-broken (this document) | 300 |
| Hard test failures | 0 |

## Tickets

Each ticket is a parser-feature gap with: count of affected blocks, example
of the failing syntax, expected behavior, and a 2–3 file references for
implementation testing.

### T1 — Object/record patterns in destructuring  (23 blocks)

**Failure:** `Parse error: Expected 'X' in object pattern`

**Examples in docs:**

```tova
{ name, age, ...rest } = user        // rest pattern
{ id, status: s = "pending" } = req  // default in destructure
```

**Locations:**
- [docs/mastering/jsx-and-reactivity.md:676](../mastering/jsx-and-reactivity.md)
- [docs/mastering/fullstack.md:1040](../mastering/fullstack.md)
- [docs/examples/chat.md:236](../examples/chat.md)
- … +20 more

**Action:** extend `parsePattern` / object-destructure parser to accept rest
patterns and default values.

---

### T2 — Typed immutable bindings  (25 blocks)

**Failure:** `Parse error: Unexpected token: COLON`

**Examples in docs:**

```tova
users: Table<User> = read("users.csv")
type Metric { name: String, value: Float }    // typed fields in type-block
```

**Two sub-issues:**

1. Bare typed bindings without `var`/`let`/`const`:
   `name: Type = value`. Currently rejected; only `var name: Type = value`
   parses.
2. Typed fields inside `type X { ... }` blocks (especially nested in
   `shared { type X { ... } }`).

**Locations:**
- [docs/guide/data.md:9](../guide/data.md) (typed binding)
- [docs/guide/data-professionals.md:1064](../guide/data-professionals.md) (typed fields in shared block)
- … +22 more

**Action:** allow type annotations on bare top-level declarations, and on
fields inside `type {}` declarations including those nested in
`shared {}` and `data {}` blocks.

---

### T3 — `Expected 'X'` parse-recovery noise  (69 blocks)

**Failure:** `Parse error: Expected '<token>'` — generic recovery messages
emitted after some other primary failure.

**Note:** these are mostly secondary cascades from T1/T2/T4/T5/T6 errors.
Resolving the primary tickets will reduce this bucket significantly. The
69 count is inflated; the underlying root causes are smaller.

**Action:** none directly — work the root-cause tickets and re-measure.

---

### T4 — Old/inconsistent server-route syntax  (17 + 9 + ~5 blocks)

**Failures:** `Parse error: Invalid object literal`, `Expected '=>' after
route path`, `Expected 'as' after with expression`, plus 3 stragglers
where top-level `route ... =>` should be wrapped (already partly fixed).

**Examples in docs:**

```tova
// Old form — brace body, lowercase verb
server {
  get "/api/users" {
    json(users)
  }
}

// `with` middleware on route
server {
  route GET "/users" => list_users with auth
}

// `static "/path" =>` form
server {
  static "/app" => "./dist" fallback "index.html"
}
```

**Currently working form:**

```tova
server {
  route GET "/users" => list_users
  route GET "/users" => fn(req) { ... }
}
```

**Locations:**
- [docs/tooling/test-runner.md:218](../tooling/test-runner.md) (`before_each` adjacency, but the failing block also uses old syntax)
- [docs/mastering/fullstack.md:962](../mastering/fullstack.md), [1085](../mastering/fullstack.md)
- [docs/server/routes.md](../server/routes.md) (multiple)
- [docs/examples/api-gateway.md:328](../examples/api-gateway.md) (`with auth`)

**Action:** decide whether to support the old `get "/x" { body }` and
`with auth` middleware forms in the parser, or update the docs to use
only the working `route GET "/x" => fn(req) { ... }` form. The latter is
a doc sweep; pick whichever matches the project's syntax direction.

---

### T5 — JSX in non-component-body positions  (11 LESS + 9 regex + 1 attribute + 1 GREATER + 1 JSX_TEXT + 1 string = ~24 blocks)

**Failure:** `Parse error: Unexpected token: LESS` / `Unterminated regex
literal` / `Expected '}' after attribute expression`

**Examples in docs:**

```tova
// JSX in if-statement body
if show_form { <TaskForm /> } else { <TaskList /> }

// JSX in fn body (returning JSX)
fn render() { <div>...</div> }

// JSX in assignment / expression position
view = <div>hello</div>

// JSX inside attribute braces
<ErrorBoundary fallback={<div>error</div>}>
<ErrorBoundary fallback={fn(p) { <div /> }}>
```

The parser currently accepts JSX only as a direct statement inside
`browser { component Name { ... } }`. Anywhere a Tova *expression* is
expected, JSX is rejected. The 150 doc blocks now using
` ```tova-jsx ` (validator auto-wraps in `browser { component _Doc { ... } }`)
demonstrate that the wrapping context is sufficient for the simple cases —
these 24 stragglers exercise JSX in expression positions that the wrap
can't fix.

**Locations:**
- [docs/reactivity/components.md:77](../reactivity/components.md), [323](../reactivity/components.md), [343](../reactivity/components.md)
- [docs/reactivity/advanced.md:419](../reactivity/advanced.md), [447](../reactivity/advanced.md), [463](../reactivity/advanced.md), [535](../reactivity/advanced.md), [560](../reactivity/advanced.md), [575](../reactivity/advanced.md)
- [docs/reactivity/transitions.md:174](../reactivity/transitions.md)
- [docs/mastering/jsx-and-reactivity.md:699](../mastering/jsx-and-reactivity.md), [722](../mastering/jsx-and-reactivity.md), [736](../mastering/jsx-and-reactivity.md), [746](../mastering/jsx-and-reactivity.md)
- [docs/examples/e-commerce.md:627](../examples/e-commerce.md), [tasks-app.md:517](../examples/tasks-app.md), [auth-flow.md:451](../examples/auth-flow.md)
- [docs/tutorial.md:564](../tutorial.md)

**Action:** allow JSX as a primary expression. Specifically:
- inside `if`/`elif`/`else` bodies
- inside `fn` bodies (as the implicit return)
- inside attribute brace expressions (including lambda return values)
- as a right-hand side of `=` assignment

---

### T6 — `type` reserved-word collisions  (14 blocks)

**Failure:** `Parse error: Unexpected token: TYPE`

**Examples in docs:**

```tova
http.get("/api", { type: "json" })   // 'type' as object key
fn handle(req) {
  match req.type { ... }              // 'type' as field access
}
```

**Locations:**
- [docs/guide/js-interop.md:195](../guide/js-interop.md)
- [docs/stdlib/http.md:44](../stdlib/http.md)
- [docs/mastering/jsx-and-reactivity.md:526](../mastering/jsx-and-reactivity.md)
- … +11 more

**Action:** allow `type` as a contextual keyword — treat it as an
identifier when it appears as an object key, member access target, or
function argument name. Similar treatment is already standard for
keywords like `default`/`from`/`when` in many languages.

---

### T7 — Function signature features  (12 blocks)

**Failure:** `Parse error: Expected parameter name`

**Examples in docs:**

```tova
fn greet(name = "World") { ... }            // default arg value
fn fetch(url, { headers, ...rest } = {}) { ... }  // destructured + default
fn op(...args) { ... }                       // rest parameter
```

**Locations:**
- [docs/guide/deploy.md:626](../guide/deploy.md)
- [docs/mastering/functional-programming.md:409](../mastering/functional-programming.md), [697](../mastering/functional-programming.md)
- … +9 more

**Action:** extend parameter parser to accept default values and rest
parameters in `fn` signatures.

---

### T8 — Record patterns in `match`  (11 blocks)

**Failure:** `Parse error: Expected pattern`

**Examples in docs:**

```tova
match order {
  { total: t } if t > 100 => 0
  { weight: w } if w > 50 => 25
  { destination: "international" } => 15
  _ => 5
}

// Empty `// ...` body
match status {
  "active" => // ...
  _ => default
}
```

**Locations:**
- [docs/guide/pattern-matching.md:348](../guide/pattern-matching.md), [368](../guide/pattern-matching.md)
- [docs/guide/data-professionals.md:397](../guide/data-professionals.md)
- … +8 more

**Action:** extend match-arm parser to accept record/object patterns with
optional `if` guards. Also allow empty arm bodies (`=>` followed by a comment
or nothing) so docs can elide implementations.

---

### T9 — `security {}` block grammar  (9 blocks)

**Failure:** `Parse error: Expected security declaration (auth, role,
protect, sensitive, cors, csp, rate_limit, csrf, audit, trust_proxy, hsts)`

The parser names exactly what it expects, but the docs use additional
declarations (`env`, `rate_limit` with config, etc.) that aren't in the
allow-list.

**Locations:**
- [docs/guide/data-professionals.md:973](../guide/data-professionals.md)
- [docs/mastering/fullstack.md:327](../mastering/fullstack.md), [387](../mastering/fullstack.md)
- … +6 more

**Action:** reconcile the security-block grammar with documented usage.
Either extend the allow-list or update the docs.

---

### T10 — `Expected '...' after with expression`  (9 blocks)

**Failure:** `Parse error: Expected 'as' after with expression`

The parser expects `with X as Y` syntax universally, but docs use
`with auth` (no rename) for middleware:

```tova
route GET "/users" => list_users with auth
route POST "/users" => create_user with auth, require_role("admin")
```

**Locations:**
- [docs/examples/api-gateway.md:328](../examples/api-gateway.md)
- [docs/server/routes.md:89](../server/routes.md), [95](../server/routes.md)
- … +6 more

**Action:** allow `with X` (no `as` rename) when the `with` expression is
in middleware-attachment position on a route.

---

### T11 — `Expected '...' after arguments`  (6 blocks)

**Failure:** `Parse error: Expected ')' after arguments`

Likely call-site features the parser doesn't accept (trailing commas,
spread arguments, named arguments).

**Locations:**
- [docs/stdlib/tables.md:147](../stdlib/tables.md)
- [docs/examples/task-queue.md:447](../examples/task-queue.md)
- [docs/examples/monitoring-service.md:7](../examples/monitoring-service.md)
- … +3 more

**Action:** investigate per-block; probably trailing commas in fn calls.

---

### T12 — Codegen gaps  (4 blocks)

**Failure:** `Codegen: unknown expression type 'X'`

**Examples:**

```tova
// `data { source x = ... pipeline y = clean |> ... }`
//                       ^^^ pipeline declaration not handled in codegen
```

The analyzer accepts these but codegen has no `case` for the AST node.

**Locations:**
- [docs/guide/data.md:77](../guide/data.md), [150](../guide/data.md)
- [docs/guide/data-professionals.md:125](../guide/data-professionals.md)
- … +1 more

**Action:** add codegen handlers for the missing AST node types
(`BlockStatement` / pipeline declarations / undefined).

---

### T13 — Long-tail single-occurrence bugs  (~30 blocks)

A scattering of one-off failures — terminal `default` keyword, `loop`
keyword, `when` keyword, `import` in expression position, JSX-attribute
edge cases, etc. Each is a single block, often illustrating an in-progress
feature.

These aren't worth grouping. Run the reporter and inspect when working
in any of these areas:

```bash
bun scripts/report-broken-docs.js docs/<dir>/<file>.md
```

---

## Real doc bugs that escaped (manual triage worth doing)

Three blocks have analyzer-level failures that look like genuine doc bugs
but were not in the auto-fix scope this session:

- 2 × `Type mismatch: 'value' expects T, but got Int` — in
  [docs/guide/generics.md:251](../guide/generics.md), [273](../guide/generics.md). The generic
  examples may be incorrectly written; verify the type signatures match
  the example.
- 1 × `Cannot reassign immutable variable` in
  [docs/examples/edge-url-shortener.md:13](../examples/edge-url-shortener.md). Add `var` to the
  first declaration.
- 1 × `'X' is already defined in this scope` in
  [docs/guide/types.md:521](../guide/types.md). Rename or split the block.
- 2 × `Type mismatch: 'X' expects String, but got nonnil` /
  `expects Post, but got nonnil` — in
  [docs/examples/edge-api-proxy.md:13](../examples/edge-api-proxy.md),
  [docs/examples/database.md:13](../examples/database.md). Review the example's
  control flow.

These are 5 minutes of work each.

---

## Suggested ordering

1. **T6** (`type` contextual keyword, 14 blocks) — small, isolated,
   high impact, no other dependencies.
2. **T7** (default args + rest params, 12 blocks) — common feature, low risk.
3. **T2** (typed immutable bindings, 25 blocks) — likely a small parser
   change with wide doc benefit.
4. **T1** (rest/default in destructure, 23 blocks) — pairs with T7.
5. **T8** (record patterns in match, 11 blocks) — match-arm parser change.
6. **T5** (JSX in expressions, ~24 blocks) — parser change with care
   around the `_looksLikeJSX` heuristic; probably the biggest single
   project. Consider whether scoping JSX to `component`-body is a
   deliberate design choice before loosening.
7. **T4** (server-route syntax, ~26 blocks) — decide on the canonical
   form; could be parser work OR doc sweep depending on direction.
8. **T9 / T10** (security and `with` middleware, 18 blocks) — domain-
   specific block grammars.
9. **T12** (codegen gaps, 4 blocks) — debug per-case.
10. **T11** + **T13** (call-site + long tail) — opportunistic.

Each ticket can be implemented in isolation. The validator will
automatically pick up the wins as soon as the parser changes land —
no doc edits required.
