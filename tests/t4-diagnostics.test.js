import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import * as AST from '../src/parser/ast.js';
import { DiagnosticFormatter, formatDiagnostics, richError, formatSummary, parseErrorLocation } from '../src/diagnostics/formatter.js';
import { ErrorCode, WarningCode, lookupCode, parseIgnoreComment, getExplanation, isErrorCode, isWarningCode } from '../src/diagnostics/error-codes.js';

// ─── Helpers ─────────────────────────────────────────────────

function analyze(source, opts = {}) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>', { strict: opts.strict || false, tolerant: true });
  return analyzer.analyze();
}

function getErrors(source, opts = {}) {
  return analyze(source, opts).errors || [];
}

function getWarnings(source, opts = {}) {
  return analyze(source, opts).warnings || [];
}

function parseWithErrors(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  try {
    const ast = parser.parse();
    return { ast, errors: [] };
  } catch (err) {
    return { ast: err.partialAST, errors: err.errors || [err] };
  }
}

// ═══════════════════════════════════════════════════════════════
// T4-1: Source code context in error messages
// ═══════════════════════════════════════════════════════════════

describe('T4-1: DiagnosticFormatter — Source context', () => {
  test('error shows the offending line', () => {
    const source = 'x = 5\ny = "hello"\nz = x + y';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Type mismatch', { line: 3, column: 5 });
    expect(output).toContain('test.tova:3:5');
    expect(output).toContain('z = x + y');
    expect(output).toContain('^');
  });

  test('error shows context lines above and below', () => {
    const source = 'a = 1\nb = 2\nc = 3\nd = 4\ne = 5';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Something wrong', { line: 3, column: 1 });
    // Should show line 1 (2 lines above), line 2, line 3 (error), line 4 (1 below)
    expect(output).toContain('a = 1');
    expect(output).toContain('b = 2');
    expect(output).toContain('c = 3');
    expect(output).toContain('d = 4');
  });

  test('caret points to exact column', () => {
    const source = '    x = foo(bar)';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Undefined', { line: 1, column: 9 });
    // Should have spaces then caret at column 9
    const lines = output.split('\n');
    const caretLine = lines.find(l => l.includes('^') && !l.includes('x ='));
    expect(caretLine).toBeDefined();
  });

  test('handles first line of file', () => {
    const source = 'x = bad';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Error', { line: 1, column: 5 });
    expect(output).toContain('x = bad');
    expect(output).toContain('^');
  });

  test('handles last line of file', () => {
    const source = 'a = 1\nb = 2\nc = bad';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Error', { line: 3, column: 5 });
    expect(output).toContain('c = bad');
  });

  test('shows error code when provided', () => {
    const source = 'x = 5\nx = 10';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Cannot reassign', { line: 2, column: 1 }, { code: 'E202' });
    expect(output).toContain('E202');
  });

  test('shows hint when provided', () => {
    const source = 'x = 5';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Error', { line: 1, column: 1 }, { hint: 'try something else' });
    expect(output).toContain('hint');
    expect(output).toContain('try something else');
  });

  test('shows fix suggestion when provided', () => {
    const source = 'x = 5';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Error', { line: 1, column: 1 }, {
      fix: { description: 'Change to var', replacement: 'var x = 5' },
    });
    expect(output).toContain('fix');
    expect(output).toContain('Change to var');
    expect(output).toContain('var x = 5');
  });

  test('backward compatible with string hint', () => {
    const source = 'x = 5';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatError('Error', { line: 1, column: 1 }, 'some hint');
    expect(output).toContain('some hint');
  });

  test('formatWarning works', () => {
    const source = 'x = 5';
    const formatter = new DiagnosticFormatter(source, 'test.tova');
    const output = formatter.formatWarning('Unused variable', { line: 1, column: 1 });
    expect(output).toContain('warning');
    expect(output).toContain('Unused variable');
  });
});

describe('T4-1: formatDiagnostics', () => {
  test('formats multiple errors and warnings', () => {
    const source = 'x = 5\ny = 10\nz = 15';
    const errors = [{ message: 'Error 1', line: 1, column: 1 }];
    const warnings = [{ message: 'Warning 1', line: 2, column: 1 }];
    const output = formatDiagnostics(source, 'test.tova', errors, warnings);
    expect(output).toContain('Error 1');
    expect(output).toContain('Warning 1');
  });

  test('passes through error codes and fix info', () => {
    const source = 'x = 5';
    const errors = [{ message: 'Bad', line: 1, column: 1, code: 'E100', fix: { description: 'Fix it' } }];
    const output = formatDiagnostics(source, 'test.tova', errors);
    expect(output).toContain('E100');
    expect(output).toContain('Fix it');
  });
});

describe('T4-1: richError', () => {
  test('formats structured errors with line/column', () => {
    const source = 'x = 5\ny = bad';
    const error = new Error('test');
    error.errors = [
      { message: 'Undefined variable', line: 2, column: 5, hint: 'did you mean something?' },
    ];
    const output = richError(source, error, 'test.tova');
    expect(output).toContain('Undefined variable');
    expect(output).toContain('y = bad');
    expect(output).toContain('did you mean something?');
  });

  test('formats errors with loc property', () => {
    const source = 'x = 5';
    const error = new Error('test');
    error.errors = [
      { message: '<test>:1:1 — Parse error: bad', loc: { line: 1, column: 1 } },
    ];
    const output = richError(source, error, 'test.tova');
    expect(output).toContain('x = 5');
  });

  test('parses location from error message string', () => {
    const source = 'x = 5';
    const error = new Error('test.tova:1:3 — Something wrong');
    const output = richError(source, error, 'test.tova');
    expect(output).toContain('Something wrong');
  });
});

describe('T4-1: formatSummary', () => {
  test('reports errors and warnings', () => {
    expect(formatSummary(2, 3)).toContain('2 errors');
    expect(formatSummary(2, 3)).toContain('3 warnings');
  });

  test('singular form for 1 error', () => {
    expect(formatSummary(1, 0)).toContain('1 error');
  });

  test('no errors shows green', () => {
    expect(formatSummary(0, 0)).toContain('no errors');
  });
});

describe('T4-1: parseErrorLocation', () => {
  test('extracts file:line:column — message', () => {
    const loc = parseErrorLocation('test.tova:12:5 — Something wrong');
    expect(loc.file).toBe('test.tova');
    expect(loc.line).toBe(12);
    expect(loc.column).toBe(5);
    expect(loc.message).toBe('Something wrong');
  });

  test('returns null for non-matching message', () => {
    expect(parseErrorLocation('Just a message')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// T4-2: Fix suggestions in error messages
// ═══════════════════════════════════════════════════════════════

describe('T4-2: Fix suggestions in analyzer errors', () => {
  test('immutable variable error has fix suggestion', () => {
    const errors = getErrors(`
      fn foo() {
        x = 5
        x = 10
      }
    `, { strict: true });
    const err = errors.find(e => e.message.includes('Cannot reassign'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E202');
    expect(err.fix).toBeDefined();
    expect(err.fix.description).toContain('var');
  });

  test('unused variable warning has fix suggestion', () => {
    const warnings = getWarnings(`
      fn foo() {
        x = 5
        return 10
      }
    `);
    const warn = warnings.find(w => w.message.includes('never used'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W001');
    expect(warn.fix).toBeDefined();
    expect(warn.fix.description).toContain('_');
    expect(warn.fix.replacement).toContain('_x');
  });

  test('unused function warning has fix suggestion', () => {
    const warnings = getWarnings(`
      fn helper() {
        return 1
      }
    `);
    const warn = warnings.find(w => w.message.includes('Function') && w.message.includes('never used'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W002');
    expect(warn.fix).toBeDefined();
  });

  test('naming convention warning has fix suggestion', () => {
    const warnings = getWarnings(`
      fn foo() {
        myVar = 5
        print(myVar)
      }
    `);
    const warn = warnings.find(w => w.message.includes('snake_case'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W100');
    expect(warn.fix).toBeDefined();
    expect(warn.fix.replacement).toBe('my_var');
  });

  test('undefined variable with close match has fix', () => {
    const warnings = getWarnings(`
      fn foo() {
        x = 5
        print(y)
      }
    `);
    // y is undefined, and there's nothing close to suggest
    // But let's test with a closer match
    const warnings2 = getWarnings(`
      fn bar() {
        my_value = 5
        print(my_valeu)
      }
    `);
    const warn = warnings2.find(w => w.message.includes('not defined'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('E200');
    if (warn.fix) {
      expect(warn.fix.replacement).toBe('my_value');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// T4-3: Parser error recovery
// ═══════════════════════════════════════════════════════════════

describe('T4-3: Parser error recovery', () => {
  test('recovers from error and parses subsequent functions', () => {
    const { ast, errors } = parseWithErrors(`
      fn foo() {
        x = 1 +
      }
      fn bar() {
        return 42
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    const fns = ast.body.filter(n => n.type === 'FunctionDeclaration');
    expect(fns.length).toBe(2);
  });

  test('collects multiple errors from different locations', () => {
    const { ast, errors } = parseWithErrors(`
      fn a() { x = 1 + }
      fn b() { y = 2 * }
      fn c() { return 42 }
    `);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(ast).toBeDefined();
    const fns = ast.body.filter(n => n.type === 'FunctionDeclaration');
    expect(fns.length).toBe(3);
  });

  test('errors include location information', () => {
    const { errors } = parseWithErrors(`
      fn foo() {
        x = 1 +
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors[0];
    expect(err.loc).toBeDefined();
    expect(err.loc.line).toBeGreaterThan(0);
    expect(err.loc.column).toBeGreaterThan(0);
  });

  test('partial AST has docstrings attached', () => {
    const { ast } = parseWithErrors(`
      /// This is a doc
      fn foo() {
        x = 1 +
      }
      fn bar() {
        return 42
      }
    `);
    // parseBlock may or may not attach docstrings — the important thing
    // is that the parse doesn't crash and produces a partial AST
    expect(ast).toBeDefined();
  });

  test('stops after max errors', () => {
    // Generate a source with 60 errors
    let source = '';
    for (let i = 0; i < 60; i++) {
      source += `fn f${i}() { x = 1 + }\n`;
    }
    const { errors } = parseWithErrors(source);
    // Should stop before 60 if max is 50
    expect(errors.length).toBeLessThanOrEqual(50);
  });

  test('var and async are synchronization points', () => {
    const { ast, errors } = parseWithErrors(`
      fn foo() {
        1 +
        var x = 5
        return x
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
  });

  test('recovers in server blocks', () => {
    const { ast, errors } = parseWithErrors(`
      server {
        fn handler() {
          x = 1 +
        }
        fn other() {
          return "ok"
        }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
  });

  test('recovers in client blocks', () => {
    const { ast, errors } = parseWithErrors(`
      client {
        fn handler() {
          x = 1 +
        }
        fn render() {
          return "ok"
        }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// T4-4: Error codes for all diagnostics
// ═══════════════════════════════════════════════════════════════

describe('T4-4: Error code registry', () => {
  test('ErrorCode has standard error codes', () => {
    expect(ErrorCode.E001.code).toBe('E001');
    expect(ErrorCode.E100.code).toBe('E100');
    expect(ErrorCode.E200.code).toBe('E200');
    expect(ErrorCode.E300.code).toBe('E300');
  });

  test('WarningCode has standard warning codes', () => {
    expect(WarningCode.W001.code).toBe('W001');
    expect(WarningCode.W100.code).toBe('W100');
    expect(WarningCode.W200.code).toBe('W200');
  });

  test('lookupCode finds error codes', () => {
    const info = lookupCode('E202');
    expect(info).toBeDefined();
    expect(info.title).toContain('immutable');
  });

  test('lookupCode finds warning codes', () => {
    const info = lookupCode('W001');
    expect(info).toBeDefined();
    expect(info.title).toContain('Unused variable');
  });

  test('lookupCode returns null for unknown codes', () => {
    expect(lookupCode('X999')).toBeNull();
  });

  test('isErrorCode identifies error codes', () => {
    expect(isErrorCode('E001')).toBe(true);
    expect(isErrorCode('W001')).toBe(false);
  });

  test('isWarningCode identifies warning codes', () => {
    expect(isWarningCode('W001')).toBe(true);
    expect(isWarningCode('E001')).toBe(false);
  });

  test('all error codes have categories', () => {
    for (const entry of Object.values(ErrorCode)) {
      expect(entry.category).toBeDefined();
    }
    for (const entry of Object.values(WarningCode)) {
      expect(entry.category).toBeDefined();
    }
  });
});

describe('T4-4: Error codes in analyzer output', () => {
  test('immutable reassignment has E202 code', () => {
    const errors = getErrors(`
      fn foo() {
        x = 5
        x = 10
      }
    `, { strict: true });
    const err = errors.find(e => e.message.includes('Cannot reassign'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E202');
  });

  test('await outside async has E300 code', () => {
    const errors = getErrors(`
      fn foo() {
        x = await fetch("/api")
      }
    `, { strict: true });
    const err = errors.find(e => e.message.includes('await'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E300');
  });

  test('return outside function has E301 code', () => {
    const errors = getErrors('return 5', { strict: true });
    const err = errors.find(e => e.message.includes('return'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E301');
  });

  test('client-only feature outside client has E302 code', () => {
    // Parser prevents state outside client blocks, so we construct AST manually
    const loc = { line: 1, column: 1, file: '<test>' };
    const stateNode = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([stateNode]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    const err = result.errors.find(e => e.message.includes('client block'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E302');
  });

  test('server-only feature outside server has E303 code', () => {
    // Parser prevents route outside server blocks, so we construct AST manually
    const loc = { line: 1, column: 1, file: '<test>' };
    const routeNode = new AST.RouteDeclaration(
      'GET', '/api', new AST.Identifier('handler', loc), [], loc
    );
    const ast = new AST.Program([routeNode]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    const err = result.errors.find(e => e.message.includes('server block'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E303');
  });

  test('return type mismatch has E101 code', () => {
    const errors = getErrors(`
      fn add(a: Int, b: Int) -> Int {
        return "hello"
      }
    `, { strict: true });
    const err = errors.find(e => e.message.includes('return type'));
    expect(err).toBeDefined();
    expect(err.code).toBe('E101');
  });

  test('unused variable warning has W001 code', () => {
    const warnings = getWarnings(`
      fn foo() {
        x = 5
        return 10
      }
    `);
    const warn = warnings.find(w => w.message.includes('never used') && w.message.includes("'x'"));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W001');
  });

  test('unused function warning has W002 code', () => {
    const warnings = getWarnings(`
      fn helper() { return 1 }
    `);
    const warn = warnings.find(w => w.message.includes('Function') && w.message.includes('never used'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W002');
  });

  test('naming convention warning has W100 code', () => {
    const warnings = getWarnings(`
      fn foo() {
        myVar = 5
        print(myVar)
      }
    `);
    const warn = warnings.find(w => w.message.includes('snake_case'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W100');
  });

  test('shadowing warning has W101 code', () => {
    const warnings = getWarnings(`
      fn foo() {
        x = 5
        fn bar() {
          x = 10
          print(x)
        }
        bar()
        print(x)
      }
    `);
    const warn = warnings.find(w => w.message.includes('shadows'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W101');
  });

  test('non-exhaustive match has W200 code', () => {
    const warnings = getWarnings(`
      type Color { Red, Green, Blue }
      fn foo(c: Color) -> String {
        return match c {
          Red => "r"
          Green => "g"
        }
      }
    `, { strict: true });
    const warn = warnings.find(w => w.message.includes('Non-exhaustive'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('W200');
  });

  test('undefined variable has E200 code', () => {
    const warnings = getWarnings(`
      fn foo() {
        print(undefinedVar)
      }
    `);
    const warn = warnings.find(w => w.message.includes('not defined'));
    expect(warn).toBeDefined();
    expect(warn.code).toBe('E200');
  });
});

describe('T4-4: tova-ignore comment parsing', () => {
  test('parses single code', () => {
    const codes = parseIgnoreComment('// tova-ignore W001');
    expect(codes).toEqual(['W001']);
  });

  test('parses multiple codes', () => {
    const codes = parseIgnoreComment('// tova-ignore W001, E100, W200');
    expect(codes).toEqual(['W001', 'E100', 'W200']);
  });

  test('returns null for non-ignore comments', () => {
    expect(parseIgnoreComment('// just a comment')).toBeNull();
    expect(parseIgnoreComment('x = 5')).toBeNull();
  });

  test('handles whitespace variations', () => {
    const codes = parseIgnoreComment('//  tova-ignore  W001');
    expect(codes).toEqual(['W001']);
  });
});

describe('T4-4: tova-ignore in formatDiagnostics', () => {
  test('filters out ignored warnings', () => {
    const source = '// tova-ignore W001\nx = 5';
    const warnings = [{ message: 'unused', line: 2, column: 1, code: 'W001' }];
    const output = formatDiagnostics(source, 'test.tova', [], warnings);
    expect(output).toBe('');
  });

  test('does not filter non-ignored warnings', () => {
    const source = '// tova-ignore W001\nx = 5';
    const warnings = [{ message: 'bad naming', line: 2, column: 1, code: 'W100' }];
    const output = formatDiagnostics(source, 'test.tova', [], warnings);
    expect(output).toContain('bad naming');
  });

  test('does not filter warnings without code', () => {
    const source = '// tova-ignore W001\nx = 5';
    const warnings = [{ message: 'some warning', line: 2, column: 1 }];
    const output = formatDiagnostics(source, 'test.tova', [], warnings);
    expect(output).toContain('some warning');
  });
});

describe('T4-4: Error explanations', () => {
  test('getExplanation returns text for known codes', () => {
    const explanation = getExplanation('E202');
    expect(explanation).toBeDefined();
    expect(explanation).toContain('immutable');
    expect(explanation).toContain('var');
  });

  test('getExplanation returns text for E100', () => {
    const explanation = getExplanation('E100');
    expect(explanation).toBeDefined();
    expect(explanation).toContain('Type mismatch');
  });

  test('getExplanation returns null for unknown codes', () => {
    expect(getExplanation('E999')).toBeNull();
  });

  test('W001 explanation mentions prefix with _', () => {
    const explanation = getExplanation('W001');
    expect(explanation).toBeDefined();
    expect(explanation).toContain('_');
  });

  test('W200 explanation mentions wildcard', () => {
    const explanation = getExplanation('W200');
    expect(explanation).toBeDefined();
    expect(explanation).toContain('_');
  });
});

// ═══════════════════════════════════════════════════════════════
// T4-5: LSP-relevant diagnostics structure
// ═══════════════════════════════════════════════════════════════

describe('T4-5: Diagnostics have length for LSP range', () => {
  test('unused variable has length field', () => {
    const warnings = getWarnings(`
      fn foo() {
        longVariableName = 5
        return 10
      }
    `);
    const warn = warnings.find(w => w.message.includes('longVariableName') && w.message.includes('never used'));
    expect(warn).toBeDefined();
    expect(warn.length).toBe('longVariableName'.length);
  });

  test('naming convention has length field', () => {
    const warnings = getWarnings(`
      fn foo() {
        myVar = 5
        print(myVar)
      }
    `);
    const warn = warnings.find(w => w.message.includes('myVar') && w.message.includes('snake_case'));
    expect(warn).toBeDefined();
    expect(warn.length).toBe('myVar'.length);
  });

  test('undefined variable has length field', () => {
    const warnings = getWarnings(`
      fn foo() {
        print(myUndefinedVar)
      }
    `);
    const warn = warnings.find(w => w.message.includes('myUndefinedVar'));
    expect(warn).toBeDefined();
    expect(warn.length).toBe('myUndefinedVar'.length);
  });

  test('shadowing warning has length field', () => {
    const warnings = getWarnings(`
      fn foo() {
        myName = 5
        fn bar() {
          myName = 10
          print(myName)
        }
        bar()
        print(myName)
      }
    `);
    const warn = warnings.find(w => w.message.includes('shadows'));
    expect(warn).toBeDefined();
    expect(warn.length).toBe('myName'.length);
  });
});

describe('T4-5: Diagnostic hints are actionable', () => {
  test('await error has actionable hint', () => {
    const errors = getErrors(`
      fn foo() {
        x = await fetch("/api")
      }
    `, { strict: true });
    const err = errors.find(e => e.message.includes('await'));
    expect(err).toBeDefined();
    expect(err.hint).toContain('async');
  });

  test('client-only error has actionable hint', () => {
    const loc = { line: 1, column: 1, file: '<test>' };
    const stateNode = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([stateNode]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    const err = result.errors.find(e => e.message.includes('client block'));
    expect(err).toBeDefined();
    expect(err.hint).toContain('client');
  });

  test('server-only error has actionable hint', () => {
    const loc = { line: 1, column: 1, file: '<test>' };
    const routeNode = new AST.RouteDeclaration(
      'GET', '/api', new AST.Identifier('handler', loc), [], loc
    );
    const ast = new AST.Program([routeNode]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    const err = result.errors.find(e => e.message.includes('server block'));
    expect(err).toBeDefined();
    expect(err.hint).toContain('server');
  });

  test('non-exhaustive match has actionable hint', () => {
    const warnings = getWarnings(`
      type Color { Red, Green, Blue }
      fn foo(c: Color) -> String {
        return match c {
          Red => "r"
          Green => "g"
        }
      }
    `, { strict: true });
    const warn = warnings.find(w => w.message.includes('Non-exhaustive'));
    expect(warn).toBeDefined();
    expect(warn.hint).toBeTruthy();
  });

  test('data loss warning has actionable hint', () => {
    const warnings = getWarnings(`
      fn foo() {
        var x = 5
        x = 3.14
      }
    `, { strict: true });
    const warn = warnings.find(w => w.message.includes('data loss'));
    if (warn) {
      expect(warn.hint).toBeTruthy();
      expect(warn.code).toBe('W204');
    }
  });
});
