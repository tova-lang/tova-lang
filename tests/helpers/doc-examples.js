// Helpers for validating Tova code examples extracted from markdown docs.
//
// Validation strategy (Approach C, Phase 1): compile-validation.
// For each example we run lex → parse → analyze (tolerant) → codegen.
// We do NOT execute the generated JS — that's a future phase.
//
// Examples can be tagged in the markdown to opt out of strict checks:
//   - A comment line containing "Error:", "Wrong", "Invalid", or "❌"
//     means the example is *intentionally* broken; we expect parse or
//     analyze to surface diagnostics and pass the test if so.
//   - A fenced block opened with ```tova-skip is recorded but not validated.
//   - A fenced block opened with ```tova-snippet is parsed only (no analyze).
//   - A fenced block opened with ```tova-jsx is wrapped in
//     `browser { component _DocSample { ... } }` before validation. Tova's
//     JSX parser only accepts JSX inside that context, but pedagogical
//     reactivity examples elide the wrapper for brevity. The wrap reflects
//     the doc's implied scope without forcing every example to add 4 lines
//     of nesting.
//
// Auto-classified blocks:
//   - Blocks that look like *type signatures* (e.g. `iter(iterable) -> Seq`
//     or `PI -> Float`) are documentation notation, not executable code.
//     We detect them by: no `{`, no `}`, no `=`, every non-comment line
//     contains `->`. These are skipped from validation. (Tova uses `=>`
//     for arrow lambdas, never `->`, so this never collides with real code.)

import { readFileSync } from 'fs';
import { Lexer } from '../../src/lexer/lexer.js';
import { Parser } from '../../src/parser/parser.js';
import { Analyzer } from '../../src/analyzer/analyzer.js';
import { CodeGenerator } from '../../src/codegen/codegen.js';

const FENCE_RE = /```(tova(?:-skip|-snippet|-jsx)?)\n([\s\S]*?)```/g;

// Wraps for tova-jsx blocks. JSX requires `browser { component ... }`
// context to parse. Two variants:
//   - if the block already declares `component`(s) at top level, wrap in
//     plain `browser { ... }` (avoids nesting components, which codegen
//     rejects with "unknown expression type 'ComponentDeclaration'");
//   - otherwise wrap the body in `browser { component _DocSample { ... } }`
//     so bare JSX gets parser + codegen context.
//
// Both wrappers add 1 line before and 1 line after, keeping block-line
// numbers in error messages close to the doc source (off by one).
const JSX_BARE_PRELUDE = 'browser { component _DocSample {\n';
const JSX_BARE_CLOSER = '\n} }\n';
const JSX_OUTER_PRELUDE = 'browser {\n';
const JSX_OUTER_CLOSER = '\n}\n';

function looksLikeComponentDeclaration(code) {
  // First non-blank, non-comment, non-import line.
  const lines = code.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('//')) continue;
    return /^component\s+[A-Za-z_]/.test(line);
  }
  return false;
}

function wrapForJsx(code) {
  if (looksLikeComponentDeclaration(code)) {
    return JSX_OUTER_PRELUDE + code + JSX_OUTER_CLOSER;
  }
  return JSX_BARE_PRELUDE + code + JSX_BARE_CLOSER;
}
const NEGATIVE_MARKERS = [
  /\/\/\s*Error\b/i,
  /\/\/\s*Wrong\b/i,
  /\/\/\s*Invalid\b/i,
  /\/\/\s*Bad\b/i,
  /\/\/\s*Won['’]t compile\b/i,
  /\/\/\s*Compile[- ]?error\b/i,
  /❌/,
];

/**
 * Extract every fenced Tova block from a markdown string.
 * Returns blocks in source order with 1-based start line numbers.
 *
 * Each block: { code, startLine, kind, isNegative, index }
 *   - kind: 'tova' | 'tova-skip' | 'tova-snippet' | 'tova-jsx'
 *   - isNegative: true if a NEGATIVE_MARKERS pattern was found in the block
 *   - index: 0-based position among blocks in this file
 */
export function extractTovaBlocks(markdown) {
  const blocks = [];
  let m;
  let i = 0;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(markdown)) !== null) {
    const before = markdown.slice(0, m.index);
    const startLine = (before.match(/\n/g) || []).length + 1;
    const code = m[2];
    blocks.push({
      code,
      startLine,
      kind: m[1],
      isNegative: NEGATIVE_MARKERS.some(re => re.test(code)),
      index: i++,
    });
  }
  return blocks;
}

/** Read a doc file from disk and extract Tova blocks. */
export function loadDocBlocks(absPath) {
  const md = readFileSync(absPath, 'utf-8');
  return extractTovaBlocks(md);
}

/** Lex + parse a snippet. Throws on lex/parse failure. */
export function parseSource(code, filename = '<doc>') {
  const lexer = new Lexer(code, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  return parser.parse();
}

/** Lex + parse + analyze (tolerant). Returns { ast, errors, warnings }. */
export function analyzeSource(code, filename = '<doc>') {
  const ast = parseSource(code, filename);
  const analyzer = new Analyzer(ast, filename, { tolerant: true });
  const result = analyzer.analyze();
  return {
    ast,
    errors: result?.errors ?? [],
    warnings: result?.warnings ?? [],
  };
}

/** Full pipeline: lex + parse + analyze + codegen. */
export function compileSource(code, filename = '<doc>') {
  const { ast, errors, warnings } = analyzeSource(code, filename);
  const gen = new CodeGenerator(ast, filename);
  let output = null;
  let codegenError = null;
  try {
    output = gen.generate();
  } catch (e) {
    codegenError = e;
  }
  return { ast, errors, warnings, output, codegenError };
}

/**
 * Heuristic: does this block look like a bare type signature rather than
 * executable Tova? Signatures show the shape of an API (return types,
 * parameter types) without a body. They use `->` to mean "returns", which
 * Tova's grammar reserves for actual function declarations.
 *
 * A block is a bare signature when, after stripping line comments, every
 * non-blank line:
 *   - contains `->`,
 *   - does NOT contain `=` (no assignment),
 *   - has no residual `{` or `}` after stripping balanced `<...>` and
 *     `{...}` pairs. The strip lets inline record return types like
 *     `Result<{stdout: String}>` and `{ changes: Int }` count as
 *     signatures; any `{` that survives is a function body.
 *
 * Known small blind spot: a one-line `fn name() -> T { body }` would be
 * misclassified as a signature. Docs rarely use that style; the cost of
 * the rare slip is far smaller than the benefit of correctly recognizing
 * the hundreds of legitimate signature blocks.
 *
 * Tova uses `=>` for arrow lambdas, never `->`, so this never collides
 * with real arrow-lambda code.
 */
function stripBalancedPairs(line, open, close) {
  let depth = 0;
  let out = '';
  for (const ch of line) {
    if (ch === open) depth++;
    else if (ch === close && depth > 0) depth--;
    else if (depth === 0) out += ch;
  }
  return out;
}

export function isBareSignature(code) {
  const stripped = code
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .filter(line => line.length > 0);
  if (stripped.length === 0) return false;
  for (const line of stripped) {
    if (!line.includes('->')) return false;
    if (line.includes('=')) return false;
    let scrubbed = stripBalancedPairs(line, '<', '>');
    scrubbed = stripBalancedPairs(scrubbed, '{', '}');
    if (scrubbed.includes('{') || scrubbed.includes('}')) return false;
  }
  return true;
}

/**
 * Validate a single block. Returns a normalized result the test layer
 * can assert on:
 *   {
 *     ok: boolean,             // overall pass/fail given block kind
 *     phase: string|null,      // 'lex' | 'parse' | 'analyze' | 'codegen' | null
 *     message: string|null,    // first error message
 *     errors: array,           // analyzer errors (empty if not reached)
 *     warnings: array,
 *     codegenError: Error|null,
 *     skipped: boolean,        // true for ```tova-skip
 *   }
 *
 * Negative blocks (isNegative=true): we expect *some* diagnostic to
 * surface in lex/parse/analyze; ok=true if at least one was raised.
 *
 * Snippet blocks (kind='tova-snippet'): only lex+parse must succeed.
 *
 * Regular blocks: lex+parse+analyze+codegen must all succeed with no errors.
 */
export function validateBlock(block, filename = '<doc>') {
  if (block.kind === 'tova-skip') {
    return { ok: true, phase: null, message: null, errors: [], warnings: [], codegenError: null, skipped: true };
  }
  if (block.kind !== 'tova-jsx' && isBareSignature(block.code)) {
    return { ok: true, phase: 'signature', message: null, errors: [], warnings: [], codegenError: null, skipped: true };
  }

  const sourceToValidate = block.kind === 'tova-jsx'
    ? wrapForJsx(block.code)
    : block.code;

  // Lex+parse first (always required).
  let ast;
  try {
    ast = parseSource(sourceToValidate, filename);
  } catch (e) {
    const msg = (e?.message ?? String(e)).split('\n')[0];
    const phase = /tokeniz|lex/i.test(msg) ? 'lex' : 'parse';
    if (block.isNegative) {
      return { ok: true, phase, message: msg, errors: [], warnings: [], codegenError: null, skipped: false };
    }
    return { ok: false, phase, message: msg, errors: [], warnings: [], codegenError: null, skipped: false };
  }

  if (block.kind === 'tova-snippet') {
    return { ok: true, phase: null, message: null, errors: [], warnings: [], codegenError: null, skipped: false };
  }

  // Analyze.
  let analyzed;
  try {
    const analyzer = new Analyzer(ast, filename, { tolerant: true });
    analyzed = analyzer.analyze();
  } catch (e) {
    const msg = (e?.message ?? String(e)).split('\n')[0];
    if (block.isNegative) {
      return { ok: true, phase: 'analyze', message: msg, errors: [], warnings: [], codegenError: null, skipped: false };
    }
    return { ok: false, phase: 'analyze', message: msg, errors: [], warnings: [], codegenError: null, skipped: false };
  }
  const errors = analyzed?.errors ?? [];
  const warnings = analyzed?.warnings ?? [];

  if (block.isNegative) {
    // We expected something to be flagged.
    const someDiag = errors.length > 0;
    return {
      ok: someDiag,
      phase: someDiag ? 'analyze' : null,
      message: someDiag ? errorText(errors[0]) : 'expected a diagnostic but none was raised',
      errors,
      warnings,
      codegenError: null,
      skipped: false,
    };
  }

  if (errors.length > 0) {
    return {
      ok: false,
      phase: 'analyze',
      message: errorText(errors[0]),
      errors,
      warnings,
      codegenError: null,
      skipped: false,
    };
  }

  // Codegen.
  try {
    const gen = new CodeGenerator(ast, filename);
    gen.generate();
  } catch (e) {
    const msg = (e?.message ?? String(e)).split('\n')[0];
    return { ok: false, phase: 'codegen', message: msg, errors, warnings, codegenError: e, skipped: false };
  }

  return { ok: true, phase: null, message: null, errors, warnings, codegenError: null, skipped: false };
}

function errorText(err) {
  if (!err) return '<unknown>';
  if (typeof err === 'string') return err.split('\n')[0];
  if (err.message) return err.message.split('\n')[0];
  return String(err).split('\n')[0];
}

/**
 * Build a stable test label for a block.
 * Example: "block #3 (line 42)"
 */
export function blockLabel(block) {
  return `block #${block.index + 1} (line ${block.startLine})`;
}
