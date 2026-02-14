import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova');
  return gen.generate();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, 'test.tova', { tolerant: true });
  return analyzer.analyze();
}

describe('Data block parsing', () => {
  test('source declaration', () => {
    const ast = parse(`data {
      source users = read("users.csv")
    }`);
    const data = ast.body[0];
    expect(data.type).toBe('DataBlock');
    const source = data.body[0];
    expect(source.type).toBe('SourceDeclaration');
    expect(source.name).toBe('users');
  });

  test('source with type annotation', () => {
    const ast = parse(`data {
      source users: Table = read("users.csv")
    }`);
    const source = ast.body[0].body[0];
    expect(source.type).toBe('SourceDeclaration');
    expect(source.name).toBe('users');
    expect(source.typeAnnotation.name).toBe('Table');
  });

  test('pipeline declaration', () => {
    const ast = parse(`data {
      source users = read("users.csv")
      pipeline adults = users |> where(.age >= 18)
    }`);
    const pipeline = ast.body[0].body[1];
    expect(pipeline.type).toBe('PipelineDeclaration');
    expect(pipeline.name).toBe('adults');
    expect(pipeline.expression.type).toBe('PipeExpression');
  });

  test('validate block', () => {
    const ast = parse(`data {
      validate User {
        .name |> len() > 0,
        .age >= 0
      }
    }`);
    const validate = ast.body[0].body[0];
    expect(validate.type).toBe('ValidateBlock');
    expect(validate.typeName).toBe('User');
    expect(validate.rules.length).toBe(2);
  });

  test('refresh policy with interval', () => {
    const ast = parse(`data {
      source users = read("users.csv")
      refresh users every 15.minutes
    }`);
    const refresh = ast.body[0].body[1];
    expect(refresh.type).toBe('RefreshPolicy');
    expect(refresh.sourceName).toBe('users');
    expect(refresh.interval.value).toBe(15);
    expect(refresh.interval.unit).toBe('minutes');
  });

  test('refresh policy on_demand', () => {
    const ast = parse(`data {
      source orders = read("orders.csv")
      refresh orders on_demand
    }`);
    const refresh = ast.body[0].body[1];
    expect(refresh.type).toBe('RefreshPolicy');
    expect(refresh.sourceName).toBe('orders');
    expect(refresh.interval).toBe('on_demand');
  });

  test('full data block', () => {
    const ast = parse(`data {
      source customers = read("customers.csv")
      source orders = read("orders.csv")

      pipeline clean = customers
        |> drop_nil(.email)
        |> fill_nil(.spend, 0.0)

      pipeline summary = clean
        |> group_by(.country)
        |> agg(count: count(), total: sum(.spend))

      validate Customer {
        .email |> contains("@")
      }

      refresh customers every 10.minutes
      refresh orders on_demand
    }`);

    const data = ast.body[0];
    expect(data.type).toBe('DataBlock');

    // Count statements by type
    const sources = data.body.filter(s => s.type === 'SourceDeclaration');
    const pipelines = data.body.filter(s => s.type === 'PipelineDeclaration');
    const validates = data.body.filter(s => s.type === 'ValidateBlock');
    const refreshes = data.body.filter(s => s.type === 'RefreshPolicy');

    expect(sources.length).toBe(2);
    expect(pipelines.length).toBe(2);
    expect(validates.length).toBe(1);
    expect(refreshes.length).toBe(2);
  });
});

describe('Data block codegen', () => {
  test('source compiles to lazy getter', () => {
    const result = compile(`data {
      source users = read("users.csv")
    }`);
    const shared = result.shared;
    expect(shared).toContain('__data_users_cache');
    expect(shared).toContain('__data_users_load');
  });

  test('pipeline compiles to function', () => {
    const result = compile(`data {
      source users = read("users.csv")
      pipeline adults = users |> where(.age >= 18)
    }`);
    const shared = result.shared;
    expect(shared).toContain('__pipeline_adults');
  });

  test('validate compiles to validator function', () => {
    const result = compile(`data {
      validate User {
        .name |> len() > 0
      }
    }`);
    const shared = result.shared;
    expect(shared).toContain('__validate_User');
    expect(shared).toContain('errors');
  });

  test('refresh with interval compiles to setInterval', () => {
    const result = compile(`data {
      source users = read("users.csv")
      refresh users every 15.minutes
    }`);
    const shared = result.shared;
    expect(shared).toContain('setInterval');
    expect(shared).toContain('900000'); // 15 * 60 * 1000
  });

  test('refresh on_demand compiles to function', () => {
    const result = compile(`data {
      source orders = read("orders.csv")
      refresh orders on_demand
    }`);
    const shared = result.shared;
    expect(shared).toContain('refresh_orders');
    expect(shared).toContain('__data_orders_cache = null');
  });
});

describe('Data block parsing — additional', () => {
  test('empty data block', () => {
    const ast = parse('data {}');
    const data = ast.body[0];
    expect(data.type).toBe('DataBlock');
    expect(data.body.length).toBe(0);
  });

  test('refresh policy with seconds unit', () => {
    const ast = parse(`data {
      source users = read("users.csv")
      refresh users every 30.seconds
    }`);
    const refresh = ast.body[0].body[1];
    expect(refresh.interval.value).toBe(30);
    expect(refresh.interval.unit).toBe('seconds');
  });

  test('refresh policy with hours unit', () => {
    const ast = parse(`data {
      source users = read("users.csv")
      refresh users every 1.hour
    }`);
    const refresh = ast.body[0].body[1];
    expect(refresh.interval.value).toBe(1);
    expect(refresh.interval.unit).toBe('hour');
  });

  test('multiple validate blocks', () => {
    const ast = parse(`data {
      validate User {
        .name |> len() > 0
      }
      validate Order {
        .amount > 0,
        .quantity > 0
      }
    }`);
    const validates = ast.body[0].body.filter(s => s.type === 'ValidateBlock');
    expect(validates.length).toBe(2);
    expect(validates[0].typeName).toBe('User');
    expect(validates[1].typeName).toBe('Order');
    expect(validates[1].rules.length).toBe(2);
  });

  test('pipeline referencing another pipeline', () => {
    const ast = parse(`data {
      source raw = read("data.csv")
      pipeline clean = raw |> where(.valid)
      pipeline summary = clean |> group_by(.cat)
    }`);
    const pipelines = ast.body[0].body.filter(s => s.type === 'PipelineDeclaration');
    expect(pipelines.length).toBe(2);
    expect(pipelines[1].name).toBe('summary');
  });
});

describe('Data block codegen — additional', () => {
  test('source compiles to lazy getter with defineProperty', () => {
    const result = compile(`data {
      source users = read("users.csv")
    }`);
    const shared = result.shared;
    expect(shared).toContain('Object.defineProperty');
    expect(shared).toContain('__data_users_cache');
  });

  test('pipeline compiles to async function', () => {
    const result = compile(`data {
      source users = read("users.csv")
      pipeline adults = users |> where(.age >= 18)
    }`);
    const shared = result.shared;
    expect(shared).toContain('__pipeline_adults');
    expect(shared).toContain('async function');
  });

  test('validate with multiple rules generates indexed error messages', () => {
    const result = compile(`data {
      validate Customer {
        .email |> contains("@"),
        .name |> len() > 0
      }
    }`);
    const shared = result.shared;
    expect(shared).toContain('__validate_Customer');
    expect(shared).toContain('Validation rule 1 failed');
    expect(shared).toContain('Validation rule 2 failed');
    expect(shared).toContain('valid: true');
    expect(shared).toContain('valid: false');
  });

  test('refresh with seconds compiles to correct ms', () => {
    const result = compile(`data {
      source users = read("users.csv")
      refresh users every 30.seconds
    }`);
    const shared = result.shared;
    expect(shared).toContain('setInterval');
    expect(shared).toContain('30000'); // 30 * 1000
  });

  test('refresh with hours compiles to correct ms', () => {
    const result = compile(`data {
      source users = read("users.csv")
      refresh users every 2.hours
    }`);
    const shared = result.shared;
    expect(shared).toContain('7200000'); // 2 * 60 * 60 * 1000
  });

  test('empty data block compiles without error', () => {
    const result = compile('data {}');
    expect(result.shared).toContain('Data Block');
  });
});

describe('Data block analyzer', () => {
  test('source and pipeline names registered in scope', () => {
    const result = analyze(`
      data {
        source users = read("users.csv")
        pipeline active = users |> where(.active)
      }
      server {
        fn get() { active }
      }
    `);
    // No errors about 'active' being undefined
    const undefinedErrors = (result.errors || []).filter(e =>
      e.message.includes("'active'")
    );
    expect(undefinedErrors.length).toBe(0);
  });

  test('validate block does not produce errors', () => {
    const result = analyze(`
      data {
        validate User {
          .name |> len() > 0
        }
      }
    `);
    expect((result.errors || []).length).toBe(0);
  });
});

describe('Data block with server interaction', () => {
  test('data sources accessible in server block', () => {
    const result = analyze(`
      data {
        source users = read("users.csv")
        pipeline active = users |> where(.active)
      }
      server {
        fn get_users() {
          active
        }
      }
    `);
    // Should not have errors about undefined 'active' or 'users'
    const undefinedErrors = (result.errors || []).filter(e =>
      e.message.includes("'active'") || e.message.includes("'users'")
    );
    expect(undefinedErrors.length).toBe(0);
  });
});
