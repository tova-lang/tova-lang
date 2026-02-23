import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(code) {
  const lexer = new Lexer(code, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(code) {
  const ast = parse(code);
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileShared(code) {
  return compile(code).shared.trim();
}

function getWarnings(code) {
  const ast = parse(code);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  const result = analyzer.analyze();
  return result.warnings;
}

// Helper: evaluate compiled Tova code in a sandbox and return the last variable's value
// This is safe — we're only evaluating our own compiler output in tests
function evalTova(tovaCode, returnVar) {
  const compiled = compileShared(tovaCode);
  const wrapped = compiled + `\nreturn ${returnVar};`;
  // eslint-disable-next-line no-new-func -- safe: test-only, evaluates compiler output
  const fn = new Function(wrapped);
  return fn();
}

// ── @fast decorator — basic codegen ─────────────────────────────

describe('@fast decorator — basic codegen', () => {
  test('@fast function with [Float] param emits TypedArray coercion', () => {
    const code = compileShared(`
@fast
fn dot_product(a: [Float], b: [Float]) -> Float {
  n = len(a)
  var s = 0.0
  for i in range(n) {
    s = s + a[i] * b[i]
  }
  s
}
`);
    expect(code).toContain('Float64Array');
    expect(code).toContain('instanceof Float64Array');
    expect(code).toContain('new Float64Array');
  });

  test('@fast function with [Int] param emits Int32Array coercion', () => {
    const code = compileShared(`
@fast
fn sum_ints(arr: [Int]) -> Int {
  var s = 0
  for i in range(len(arr)) {
    s = s + arr[i]
  }
  s
}
`);
    expect(code).toContain('Int32Array');
    expect(code).toContain('instanceof Int32Array');
  });

  test('@fast function with [Byte] param emits Uint8Array coercion', () => {
    const code = compileShared(`
@fast
fn process_bytes(data: [Byte]) -> Int {
  var s = 0
  for i in range(len(data)) {
    s = s + data[i]
  }
  s
}
`);
    expect(code).toContain('Uint8Array');
    expect(code).toContain('instanceof Uint8Array');
  });

  test('@fast preserves function name and export', () => {
    const code = compileShared(`
@fast
fn compute(arr: [Float]) -> Float {
  typed_sum(arr)
}
`);
    expect(code).toContain('function compute(');
  });

  test('@fast with no typed params does not emit coercion', () => {
    const code = compileShared(`
@fast
fn add(a, b) {
  a + b
}
`);
    expect(code).not.toContain('instanceof');
    expect(code).not.toContain('Float64Array');
  });
});

// ── @fast decorator — array literal optimization ────────────────

describe('@fast decorator — array literal optimization', () => {
  test('numeric float array literal emits Float64Array in @fast mode', () => {
    const code = compileShared(`
@fast
fn make_array() {
  arr = [1.5, 2.5, 3.5]
  arr
}
`);
    expect(code).toContain('new Float64Array([1.5, 2.5, 3.5])');
  });

  test('numeric int array literal emits Int32Array in @fast mode', () => {
    const code = compileShared(`
@fast
fn make_ints() {
  arr = [1, 2, 3, 4, 5]
  arr
}
`);
    expect(code).toContain('new Int32Array([1, 2, 3, 4, 5])');
  });

  test('mixed (non-numeric) array literal stays as regular array in @fast mode', () => {
    const code = compileShared(`
@fast
fn make_strings() {
  arr = ["a", "b", "c"]
  arr
}
`);
    expect(code).toContain('["a", "b", "c"]');
    expect(code).not.toContain('new Float64Array');
    expect(code).not.toContain('new Int32Array');
  });

  test('array literal outside @fast is not optimized', () => {
    const code = compileShared(`
fn make_nums() {
  arr = [1, 2, 3]
  arr
}
`);
    expect(code).toContain('[1, 2, 3]');
    expect(code).not.toContain('Int32Array');
  });
});

// ── @fast decorator — for-loop optimization ─────────────────────

describe('@fast decorator — for-loop optimization', () => {
  test('for-in over typed array param emits index-based loop', () => {
    const code = compileShared(`
@fast
fn process(arr: [Float]) -> Float {
  var s = 0.0
  for val in arr {
    s = s + val
  }
  s
}
`);
    // Should use index-based loop instead of for-of
    expect(code).toContain('.length');
    expect(code).toContain('arr[');
    // Should NOT use for-of iterator protocol
    expect(code).not.toContain('of arr');
  });

  test('for-in over non-typed variable still uses for-of', () => {
    const code = compileShared(`
@fast
fn process(items) {
  for item in items {
    print(item)
  }
}
`);
    expect(code).toContain('of items');
  });
});

// ── @fast decorator — analyzer integration ──────────────────────

describe('@fast decorator — analyzer integration', () => {
  test('@fast does not produce W205 return path warning', () => {
    const warnings = getWarnings(`
@fast
fn dot(a: [Float], b: [Float]) -> Float {
  n = len(a)
  var s = 0.0
  for i in range(n) {
    s = s + a[i] * b[i]
  }
  s
}
`);
    const w205 = warnings.filter(w => w.code === 'W205');
    expect(w205.length).toBe(0);
  });

  test('@fast function parses without errors', () => {
    const ast = parse(`
@fast
fn compute(data: [Float]) -> Float {
  typed_sum(data)
}
`);
    expect(ast.body.length).toBeGreaterThan(0);
    const fn = ast.body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.decorators).toHaveLength(1);
    expect(fn.decorators[0].name).toBe('fast');
  });
});

// ── Typed stdlib functions — codegen emission ───────────────────

describe('typed stdlib functions — codegen emission', () => {
  test('typed_sum is emitted when used', () => {
    const code = compileShared(`
result = typed_sum([1.0, 2.0, 3.0])
`);
    expect(code).toContain('function typed_sum(');
    expect(code).toContain('typed_sum([');
  });

  test('typed_dot is emitted when used', () => {
    const code = compileShared(`
result = typed_dot([1.0, 2.0], [3.0, 4.0])
`);
    expect(code).toContain('function typed_dot(');
  });

  test('typed_add is emitted when used', () => {
    const code = compileShared(`
result = typed_add([1.0, 2.0], [3.0, 4.0])
`);
    expect(code).toContain('function typed_add(');
  });

  test('typed_scale is emitted when used', () => {
    const code = compileShared(`
result = typed_scale([1.0, 2.0], 3.0)
`);
    expect(code).toContain('function typed_scale(');
  });

  test('typed_map is emitted when used', () => {
    const code = compileShared(`
result = typed_map([1.0, 2.0], fn(x) x * 2)
`);
    expect(code).toContain('function typed_map(');
  });

  test('typed_reduce is emitted when used', () => {
    const code = compileShared(`
result = typed_reduce([1.0, 2.0], fn(acc, x) acc + x, 0)
`);
    expect(code).toContain('function typed_reduce(');
  });

  test('typed_sort is emitted when used', () => {
    const code = compileShared(`
result = typed_sort([3.0, 1.0, 2.0])
`);
    expect(code).toContain('function typed_sort(');
  });

  test('typed_zeros is emitted when used', () => {
    const code = compileShared(`
arr = typed_zeros(100)
`);
    expect(code).toContain('function typed_zeros(');
  });

  test('typed_ones is emitted when used', () => {
    const code = compileShared(`
arr = typed_ones(100)
`);
    expect(code).toContain('function typed_ones(');
  });

  test('typed_linspace is emitted when used', () => {
    const code = compileShared(`
arr = typed_linspace(0.0, 1.0, 100)
`);
    expect(code).toContain('function typed_linspace(');
  });

  test('typed_norm is emitted when used', () => {
    const code = compileShared(`
result = typed_norm([3.0, 4.0])
`);
    expect(code).toContain('function typed_norm(');
  });

  test('typed_fill is emitted when used', () => {
    const code = compileShared(`
arr = typed_fill([1.0, 2.0], 0.0)
`);
    expect(code).toContain('function typed_fill(');
  });

  test('typed_range is emitted when used', () => {
    const code = compileShared(`
arr = typed_range(0, 10, 0.5)
`);
    expect(code).toContain('function typed_range(');
  });
});

// ── Typed stdlib functions — runtime correctness ────────────────

describe('typed stdlib functions — runtime correctness', () => {
  test('typed_zeros creates zeroed Float64Array', () => {
    const result = evalTova(`arr = typed_zeros(5)`, 'arr');
    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(5);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0]);
  });

  test('typed_ones creates filled Float64Array', () => {
    const result = evalTova(`arr = typed_ones(3)`, 'arr');
    expect(result).toBeInstanceOf(Float64Array);
    expect(Array.from(result)).toEqual([1, 1, 1]);
  });

  test('typed_sum computes correct sum (Kahan)', () => {
    const result = evalTova(`result = typed_sum([0.1, 0.2, 0.3])`, 'result');
    expect(Math.abs(result - 0.6)).toBeLessThan(1e-15);
  });

  test('typed_dot computes correct dot product', () => {
    const result = evalTova(`result = typed_dot([1, 2, 3], [4, 5, 6])`, 'result');
    expect(result).toBe(32);
  });

  test('typed_norm computes correct L2 norm', () => {
    const result = evalTova(`result = typed_norm([3, 4])`, 'result');
    expect(result).toBe(5);
  });

  test('typed_add computes element-wise addition', () => {
    const result = evalTova(`result = typed_add([1, 2, 3], [4, 5, 6])`, 'result');
    expect(Array.from(result)).toEqual([5, 7, 9]);
  });

  test('typed_scale multiplies by scalar', () => {
    const result = evalTova(`result = typed_scale([1, 2, 3], 2)`, 'result');
    expect(Array.from(result)).toEqual([2, 4, 6]);
  });

  test('typed_linspace creates evenly-spaced array', () => {
    const result = evalTova(`result = typed_linspace(0, 1, 5)`, 'result');
    expect(result).toBeInstanceOf(Float64Array);
    expect(result.length).toBe(5);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(1);
    expect(Math.abs(result[2] - 0.5)).toBeLessThan(1e-15);
  });

  test('typed_sort sorts correctly', () => {
    const result = evalTova(`result = typed_sort([3, 1, 4, 1, 5, 9])`, 'result');
    expect(Array.from(result)).toEqual([1, 1, 3, 4, 5, 9]);
  });

  test('typed_map applies function', () => {
    const result = evalTova(`result = typed_map([1, 2, 3], fn(x) x * x)`, 'result');
    expect(Array.from(result)).toEqual([1, 4, 9]);
  });

  test('typed_reduce accumulates', () => {
    const result = evalTova(`result = typed_reduce([1, 2, 3, 4], fn(acc, x) acc + x, 0)`, 'result');
    expect(result).toBe(10);
  });

  test('typed_range creates float range', () => {
    const result = evalTova(`result = typed_range(0, 5, 1)`, 'result');
    expect(result).toBeInstanceOf(Float64Array);
    expect(Array.from(result)).toEqual([0, 1, 2, 3, 4]);
  });

  test('typed_fill creates filled copy', () => {
    const result = evalTova(`result = typed_fill([1, 2, 3], 7)`, 'result');
    expect(Array.from(result)).toEqual([7, 7, 7]);
  });
});

// ── @fast end-to-end — compile + execute ────────────────────────

describe('@fast end-to-end — compile and execute', () => {
  test('@fast dot product with [Float] params executes correctly', () => {
    const result = evalTova(`
@fast
fn dot(a: [Float], b: [Float]) -> Float {
  n = len(a)
  var s = 0.0
  for i in range(n) {
    s = s + a[i] * b[i]
  }
  s
}
result = dot([1.0, 2.0, 3.0], [4.0, 5.0, 6.0])
`, 'result');
    expect(result).toBe(32);
  });

  test('@fast function handles regular JS arrays via coercion', () => {
    const result = evalTova(`
@fast
fn total(arr: [Float]) -> Float {
  var s = 0.0
  for i in range(len(arr)) {
    s = s + arr[i]
  }
  s
}
result = total([10, 20, 30])
`, 'result');
    expect(result).toBe(60);
  });

  test('@fast Int32Array coercion works end-to-end', () => {
    const result = evalTova(`
@fast
fn sum_ints(arr: [Int]) -> Int {
  var s = 0
  for i in range(len(arr)) {
    s = s + arr[i]
  }
  s
}
result = sum_ints([1, 2, 3, 4, 5])
`, 'result');
    expect(result).toBe(15);
  });
});

// ── TYPED_ARRAY_MAP coverage ────────────────────────────────────

describe('TYPED_ARRAY_MAP supports all JS typed array types', () => {
  const types = [
    ['Int', 'Int32Array'],
    ['Float', 'Float64Array'],
    ['Byte', 'Uint8Array'],
    ['Int8', 'Int8Array'],
    ['Int16', 'Int16Array'],
    ['Int32', 'Int32Array'],
    ['Uint8', 'Uint8Array'],
    ['Uint16', 'Uint16Array'],
    ['Uint32', 'Uint32Array'],
    ['Float32', 'Float32Array'],
    ['Float64', 'Float64Array'],
  ];

  for (const [tovaType, jsType] of types) {
    test(`[${tovaType}] param maps to ${jsType}`, () => {
      const code = compileShared(`
@fast
fn process(arr: [${tovaType}]) {
  arr[0]
}
`);
      expect(code).toContain(jsType);
    });
  }
});
