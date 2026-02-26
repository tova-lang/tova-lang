// Tova Diagnostic Error Codes Registry
// Every diagnostic has a unique code: E### for errors, W### for warnings

// ─── Error Codes ─────────────────────────────────────────────

export const ErrorCode = {
  // === Syntax / Parse Errors (E001–E099) ===
  E001: { code: 'E001', title: 'Unexpected token',           category: 'syntax' },
  E002: { code: 'E002', title: 'Unterminated string',        category: 'syntax' },
  E003: { code: 'E003', title: 'Expected closing delimiter', category: 'syntax' },
  E004: { code: 'E004', title: 'Invalid number literal',     category: 'syntax' },
  E005: { code: 'E005', title: 'Unexpected character',       category: 'syntax' },
  E006: { code: 'E006', title: 'Unterminated comment',       category: 'syntax' },
  E007: { code: 'E007', title: 'Expected expression',        category: 'syntax' },
  E008: { code: 'E008', title: 'Mismatched JSX tag',         category: 'syntax' },
  E009: { code: 'E009', title: 'Invalid operator',           category: 'syntax' },
  E010: { code: 'E010', title: 'Max nesting depth exceeded', category: 'syntax' },

  // === Type Errors (E100–E199) ===
  E100: { code: 'E100', title: 'Type mismatch',                  category: 'type' },
  E101: { code: 'E101', title: 'Return type mismatch',           category: 'type' },
  E102: { code: 'E102', title: 'Cannot assign to type',          category: 'type' },
  E103: { code: 'E103', title: 'Invalid argument type',          category: 'type' },
  E104: { code: 'E104', title: 'Incompatible operand types',     category: 'type' },
  E105: { code: 'E105', title: 'Cannot apply operator to type',  category: 'type' },

  // === Scope / Definition Errors (E200–E299) ===
  E200: { code: 'E200', title: 'Undefined variable',             category: 'scope' },
  E201: { code: 'E201', title: 'Duplicate definition',           category: 'scope' },
  E202: { code: 'E202', title: 'Cannot reassign immutable',      category: 'scope' },
  E203: { code: 'E203', title: 'Invalid redeclaration',          category: 'scope' },

  // === Context Errors (E300–E399) ===
  E300: { code: 'E300', title: 'Invalid context: await',         category: 'context' },
  E301: { code: 'E301', title: 'Invalid context: return',        category: 'context' },
  E302: { code: 'E302', title: 'Invalid context: browser-only',  category: 'context' },
  E303: { code: 'E303', title: 'Invalid context: server-only',   category: 'context' },
  E304: { code: 'E304', title: 'Invalid context: function-only', category: 'context' },

  // === Import Errors (E400–E499) ===
  E400: { code: 'E400', title: 'Invalid import',                 category: 'import' },
  E401: { code: 'E401', title: 'Circular import',                category: 'import' },

  // === Pattern Match Errors (E500–E599) ===
  E500: { code: 'E500', title: 'Invalid pattern',                category: 'match' },

  // === Trait / Impl Errors (E600–E699) ===
  E600: { code: 'E600', title: 'Missing trait method',           category: 'trait' },
  E601: { code: 'E601', title: 'Trait method signature mismatch', category: 'trait' },
  E602: { code: 'E602', title: 'Unknown trait',                  category: 'trait' },
};

// ─── Warning Codes ───────────────────────────────────────────

export const WarningCode = {
  // === Unused (W001–W099) ===
  W001: { code: 'W001', title: 'Unused variable',            category: 'unused' },
  W002: { code: 'W002', title: 'Unused function',            category: 'unused' },
  W003: { code: 'W003', title: 'Unused import',              category: 'unused' },

  // === Style (W100–W199) ===
  W100: { code: 'W100', title: 'Naming convention violation', category: 'style' },
  W101: { code: 'W101', title: 'Variable shadows outer',      category: 'style' },

  // === Potential Bugs (W200–W299) ===
  W200: { code: 'W200', title: 'Non-exhaustive match',        category: 'match' },
  W201: { code: 'W201', title: 'Unreachable code',            category: 'logic' },
  W202: { code: 'W202', title: 'Condition always true',       category: 'logic' },
  W203: { code: 'W203', title: 'Condition always false',      category: 'logic' },
  W204: { code: 'W204', title: 'Potential data loss',         category: 'type' },
  W205: { code: 'W205', title: 'Missing return on some paths', category: 'logic' },
  W206: { code: 'W206', title: 'Non-Tova keyword used',       category: 'style' },
  W207: { code: 'W207', title: 'Unreachable match arm',       category: 'match' },
  W208: { code: 'W208', title: 'Defer outside function',      category: 'context' },

  // === Trait Conformance (W300–W399) ===
  W300: { code: 'W300', title: 'Missing trait method',        category: 'trait' },
  W301: { code: 'W301', title: 'Trait parameter mismatch',    category: 'trait' },
  W302: { code: 'W302', title: 'Trait return type mismatch',  category: 'trait' },
  W303: { code: 'W303', title: 'Unknown derive trait',        category: 'trait' },
};

// ─── Lookup maps ─────────────────────────────────────────────

const _allCodes = new Map();
for (const entry of Object.values(ErrorCode)) _allCodes.set(entry.code, entry);
for (const entry of Object.values(WarningCode)) _allCodes.set(entry.code, entry);

export function lookupCode(code) {
  return _allCodes.get(code) || null;
}

export function isErrorCode(code) {
  return code.startsWith('E');
}

export function isWarningCode(code) {
  return code.startsWith('W');
}

// ─── tova-ignore comment parsing ─────────────────────────────

const IGNORE_PATTERN = /\/\/\s*tova-ignore\s+((?:[EW]\d{3}(?:\s*,\s*)?)+)/;

export function parseIgnoreComment(line) {
  const match = line.match(IGNORE_PATTERN);
  if (!match) return null;
  return match[1].split(',').map(c => c.trim()).filter(c => c);
}

// ─── Explanation text for --explain flag ─────────────────────

const EXPLANATIONS = {
  E001: `
Unexpected token in source code.

This error occurs when the parser encounters a token it doesn't expect
in the current context.

Example:
    fn foo() {
        x = 1 +
    }            // error: unexpected '}', expected expression after '+'

Fix: complete the expression or remove the trailing operator.
`,
  E100: `
Type mismatch between expected and actual types.

This error occurs when a value of one type is used where a different
type is expected.

Example:
    fn add(a: Int, b: Int) -> Int {
        return a + b
    }
    add("hello", 5)  // error: expected Int, got String

Fix: ensure the value matches the expected type, or use a conversion
function like to_int(), to_string(), etc.
`,
  E200: `
Reference to an undefined variable or function.

This error occurs when you use a name that hasn't been defined in the
current scope or any parent scope.

Example:
    print(foo)  // error: 'foo' is not defined

Fix: define the variable before using it, or check for typos.
`,
  E202: `
Attempt to reassign an immutable variable.

In Tova, variables bound with '=' are immutable by default. Use 'var'
to create a mutable variable.

Example:
    x = 5
    x = 10     // error: cannot reassign immutable variable 'x'

    var y = 5
    y = 10     // ok: 'var' makes it mutable

Fix: change the declaration to 'var x = 5' if you need mutability.
`,
  E300: `
'await' used outside an async function.

The 'await' keyword can only be used inside functions declared with
the 'async' keyword.

Example:
    fn fetch_data() {
        data = await fetch("/api")  // error: await outside async

    }

    async fn fetch_data() {
        data = await fetch("/api")  // ok
    }

Fix: add 'async' to the enclosing function declaration.
`,
  E302: `
Client-only feature used outside a client block.

Features like 'state', 'computed', 'effect', 'component', and 'store'
can only be used inside a client { } block.

Example:
    state count = 0  // error: 'state' outside client block

    client {
        state count = 0  // ok
    }

Fix: move the code inside a client { } block.
`,
  E303: `
Server-only feature used outside a server block.

Features like 'route', 'middleware', 'ws', 'db', 'auth', etc.
can only be used inside a server { } block.

Example:
    route GET "/api/users" => get_users  // error: outside server block

    server {
        route GET "/api/users" => get_users  // ok
    }

Fix: move the code inside a server { } block.
`,
  W001: `
A variable is declared but never used.

This warning helps catch typos and dead code.

Example:
    fn foo() {
        x = 5       // warning: 'x' declared but never used
        return 10
    }

Fix: remove the variable, or prefix with _ to suppress: _x = 5
`,
  W200: `
A match expression doesn't cover all possible variants.

This can lead to runtime errors if an unmatched variant is encountered.

Example:
    type Color = Red | Green | Blue
    match color {
        Red => "red"
        Green => "green"
    }  // warning: missing 'Blue' variant

Fix: add the missing variants, or add a wildcard: _ => "other"
`,
  W204: `
Implicit narrowing conversion that may lose data.

Example:
    x: Int = 3.14  // warning: assigning Float to Int loses decimal

Fix: use an explicit conversion like floor(), round(), or to_int().
`,
};

export function getExplanation(code) {
  return EXPLANATIONS[code] || null;
}
