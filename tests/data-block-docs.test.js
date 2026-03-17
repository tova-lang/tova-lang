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

// ── Doc Example 1: Sources (line 19-25) ──────────────────────
describe('Doc: Sources', () => {
  test('parses basic source declarations', () => {
    const ast = parse(`data {
  source customers = read("customers.csv")
  source orders = read("orders.csv")
  source exchange_rates = read("https://api.exchangerate.host/latest")
}`);
    const data = ast.body[0];
    expect(data.type).toBe('DataBlock');
    const sources = data.body.filter(s => s.type === 'SourceDeclaration');
    expect(sources.length).toBe(3);
    expect(sources[0].name).toBe('customers');
    expect(sources[1].name).toBe('orders');
    expect(sources[2].name).toBe('exchange_rates');
  });

  test('compiles basic source declarations', () => {
    const result = compile(`data {
  source customers = read("customers.csv")
  source orders = read("orders.csv")
  source exchange_rates = read("https://api.exchangerate.host/latest")
}`);
    expect(result.shared).toContain('__data_customers_cache');
    expect(result.shared).toContain('__data_orders_cache');
    expect(result.shared).toContain('__data_exchange_rates_cache');
  });
});

// ── Doc Example 2: Type Annotations (line 32-36) ─────────────
describe('Doc: Type Annotations', () => {
  test('parses source with type annotations', () => {
    const ast = parse(`data {
  source customers: Table<Customer> = read("customers.csv")
  source orders: Table<Order> = read("orders.csv")
}`);
    const sources = ast.body[0].body.filter(s => s.type === 'SourceDeclaration');
    expect(sources.length).toBe(2);
    expect(sources[0].name).toBe('customers');
    expect(sources[0].typeAnnotation).toBeTruthy();
    expect(sources[1].name).toBe('orders');
    expect(sources[1].typeAnnotation).toBeTruthy();
  });

  test('compiles source with type annotations', () => {
    const result = compile(`data {
  source customers: Table<Customer> = read("customers.csv")
  source orders: Table<Order> = read("orders.csv")
}`);
    expect(result.shared).toContain('__data_customers_cache');
    expect(result.shared).toContain('__data_orders_cache');
  });
});

// ── Doc Example 3: Pipelines (line 63-83) ────────────────────
describe('Doc: Pipelines', () => {
  test('parses pipeline with pipe transforms', () => {
    const ast = parse(`data {
  source raw_customers = read("customers.csv")

  pipeline clean = raw_customers
    |> dropNil(.email)
    |> fillNil(.spend, 0.0)
    |> derive(
      .name = .name |> trim(),
      .email = .email |> lower()
    )
    |> where(.spend > 0)

  pipeline summary = clean
    |> groupBy(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sortBy(.total_spend, desc: true)
}`);
    const data = ast.body[0];
    expect(data.type).toBe('DataBlock');
    const sources = data.body.filter(s => s.type === 'SourceDeclaration');
    const pipelines = data.body.filter(s => s.type === 'PipelineDeclaration');
    expect(sources.length).toBe(1);
    expect(pipelines.length).toBe(2);
    expect(pipelines[0].name).toBe('clean');
    expect(pipelines[1].name).toBe('summary');
  });

  test('compiles pipeline with pipe transforms', () => {
    const result = compile(`data {
  source raw_customers = read("customers.csv")

  pipeline clean = raw_customers
    |> dropNil(.email)
    |> fillNil(.spend, 0.0)
    |> derive(
      .name = .name |> trim(),
      .email = .email |> lower()
    )
    |> where(.spend > 0)

  pipeline summary = clean
    |> groupBy(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sortBy(.total_spend, desc: true)
}`);
    expect(result.shared).toContain('__pipeline_clean');
    expect(result.shared).toContain('__pipeline_summary');
  });
});

// ── Doc Example 4: Validation Rules (line 92-104) ────────────
describe('Doc: Validation Rules', () => {
  test('parses validate blocks', () => {
    const ast = parse(`data {
  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  validate Order {
    .quantity > 0,
    .amount > 0
  }
}`);
    const validates = ast.body[0].body.filter(s => s.type === 'ValidateBlock');
    expect(validates.length).toBe(2);
    expect(validates[0].typeName).toBe('Customer');
    expect(validates[0].rules.length).toBe(3);
    expect(validates[1].typeName).toBe('Order');
    expect(validates[1].rules.length).toBe(2);
  });

  test('compiles validate blocks', () => {
    const result = compile(`data {
  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  validate Order {
    .quantity > 0,
    .amount > 0
  }
}`);
    expect(result.shared).toContain('__validate_Customer');
    expect(result.shared).toContain('__validate_Order');
  });
});

// ── Doc Example 5: Refresh Interval (line 124-131) ───────────
describe('Doc: Refresh Interval', () => {
  test('parses interval refresh policies', () => {
    const ast = parse(`data {
  source exchange_rates = read("https://api.exchangerate.host/latest")
  refresh exchange_rates every 1.hour

  source customers = read("customers.csv")
  refresh customers every 15.minutes
}`);
    const refreshes = ast.body[0].body.filter(s => s.type === 'RefreshPolicy');
    expect(refreshes.length).toBe(2);
    expect(refreshes[0].sourceName).toBe('exchange_rates');
    expect(refreshes[0].interval.value).toBe(1);
    expect(refreshes[0].interval.unit).toBe('hour');
    expect(refreshes[1].sourceName).toBe('customers');
    expect(refreshes[1].interval.value).toBe(15);
    expect(refreshes[1].interval.unit).toBe('minutes');
  });

  test('compiles interval refresh to correct ms', () => {
    const result = compile(`data {
  source exchange_rates = read("https://api.exchangerate.host/latest")
  refresh exchange_rates every 1.hour

  source customers = read("customers.csv")
  refresh customers every 15.minutes
}`);
    expect(result.shared).toContain('3600000');  // 1 hour = 3600000ms
    expect(result.shared).toContain('900000');   // 15 min = 900000ms
  });
});

// ── Doc Example 6: On-Demand Refresh (line 142-146) ──────────
describe('Doc: On-Demand Refresh', () => {
  test('parses on_demand refresh', () => {
    const ast = parse(`data {
  source orders = read("orders.csv")
  refresh orders on_demand
}`);
    const refresh = ast.body[0].body[1];
    expect(refresh.type).toBe('RefreshPolicy');
    expect(refresh.sourceName).toBe('orders');
    expect(refresh.interval).toBe('on_demand');
  });

  test('compiles on_demand refresh', () => {
    const result = compile(`data {
  source orders = read("orders.csv")
  refresh orders on_demand
}`);
    expect(result.shared).toContain('refresh_orders');
  });
});

// ── Doc Example 7: Interaction with Other Blocks (line 155-179) ──
describe('Doc: Interaction with Other Blocks', () => {
  test('parses data + server blocks', () => {
    const ast = parse(`data {
  source users = read("users.csv")
  pipeline active_users = users |> where(.active)
}

server {
  fn get_active_users() {
    active_users
  }

  fn get_user(id: Int) {
    users |> find(fn(u) u.id == id)
  }

  route GET "/api/users" => get_active_users
}`);
    const data = ast.body.find(b => b.type === 'DataBlock');
    const server = ast.body.find(b => b.type === 'ServerBlock');
    expect(data).toBeTruthy();
    expect(server).toBeTruthy();
  });

  test('analyzer: data names accessible in server', () => {
    const result = analyze(`data {
  source users = read("users.csv")
  pipeline active_users = users |> where(.active)
}

server {
  fn get_active_users() {
    active_users
  }

  fn get_user(id: Int) {
    users |> find(fn(u) u.id == id)
  }

  route GET "/api/users" => get_active_users
}`);
    // Should not have errors about undefined 'active_users' or 'users'
    const undefinedErrors = (result.errors || []).filter(e =>
      e.message && (e.message.includes("'active_users'") || e.message.includes("'users'"))
    );
    expect(undefinedErrors.length).toBe(0);
  });

  test('compiles data + server blocks', () => {
    const result = compile(`data {
  source users = read("users.csv")
  pipeline active_users = users |> where(.active)
}

server {
  fn get_active_users() {
    active_users
  }

  fn get_user(id: Int) {
    users |> find(fn(u) u.id == id)
  }

  route GET "/api/users" => get_active_users
}`);
    // Data block generates shared code
    expect(result.shared).toContain('__data_users_cache');
    expect(result.shared).toContain('__pipeline_active_users');
    // Server block generates server code
    expect(result.server).toContain('get_active_users');
  });
});

// ── Doc Example 8: Full interaction with browser (line 155-179) ──
describe('Doc: Full interaction with browser block', () => {
  test('parses data + server + browser blocks', () => {
    const ast = parse(`data {
  source users = read("users.csv")
  pipeline active_users = users |> where(.active)
}

server {
  fn get_active_users() {
    active_users
  }

  fn get_user(id: Int) {
    users |> find(fn(u) u.id == id)
  }

  route GET "/api/users" => get_active_users
}

browser {
  state users = []

  effect {
    users = server.get_active_users()
  }
}`);
    const data = ast.body.find(b => b.type === 'DataBlock');
    const server = ast.body.find(b => b.type === 'ServerBlock');
    const browser = ast.body.find(b => b.type === 'BrowserBlock');
    expect(data).toBeTruthy();
    expect(server).toBeTruthy();
    expect(browser).toBeTruthy();
  });
});

// ── Doc Example 9: Complete Example (line 186-233) ───────────
describe('Doc: Complete Example', () => {
  test('parses complete example', () => {
    const ast = parse(`shared {
  type Customer {
    id: Int
    name: String
    email: String
    spend: Float
    country: String
  }
}

data {
  source customers: Table<Customer> = read("customers.csv")
  source orders = read("orders.csv")

  pipeline clean = customers
    |> dropNil(.email)
    |> fillNil(.spend, 0.0)
    |> derive(.name = .name |> trim(), .email = .email |> lower())
    |> where(.spend > 0)

  pipeline summary = clean
    |> groupBy(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sortBy(.total_spend, desc: true)

  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  refresh customers every 10.minutes
  refresh orders on_demand
}

server {
  fn get_customers() { clean }
  fn get_summary() { summary }

  route GET "/api/customers" => get_customers
  route GET "/api/summary" => get_summary
}`);
    const shared = ast.body.find(b => b.type === 'SharedBlock');
    const data = ast.body.find(b => b.type === 'DataBlock');
    const server = ast.body.find(b => b.type === 'ServerBlock');
    expect(shared).toBeTruthy();
    expect(data).toBeTruthy();
    expect(server).toBeTruthy();

    // Verify all data block contents
    const sources = data.body.filter(s => s.type === 'SourceDeclaration');
    const pipelines = data.body.filter(s => s.type === 'PipelineDeclaration');
    const validates = data.body.filter(s => s.type === 'ValidateBlock');
    const refreshes = data.body.filter(s => s.type === 'RefreshPolicy');

    expect(sources.length).toBe(2);
    expect(pipelines.length).toBe(2);
    expect(validates.length).toBe(1);
    expect(refreshes.length).toBe(2);
  });

  test('compiles complete example', () => {
    const result = compile(`shared {
  type Customer {
    id: Int
    name: String
    email: String
    spend: Float
    country: String
  }
}

data {
  source customers: Table<Customer> = read("customers.csv")
  source orders = read("orders.csv")

  pipeline clean = customers
    |> dropNil(.email)
    |> fillNil(.spend, 0.0)
    |> derive(.name = .name |> trim(), .email = .email |> lower())
    |> where(.spend > 0)

  pipeline summary = clean
    |> groupBy(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sortBy(.total_spend, desc: true)

  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  refresh customers every 10.minutes
  refresh orders on_demand
}

server {
  fn get_customers() { clean }
  fn get_summary() { summary }

  route GET "/api/customers" => get_customers
  route GET "/api/summary" => get_summary
}`);
    // Data block code
    expect(result.shared).toContain('__data_customers_cache');
    expect(result.shared).toContain('__data_orders_cache');
    expect(result.shared).toContain('__pipeline_clean');
    expect(result.shared).toContain('__pipeline_summary');
    expect(result.shared).toContain('__validate_Customer');
    expect(result.shared).toContain('600000');   // 10 min = 600000ms
    expect(result.shared).toContain('refresh_orders');
    // Server code
    expect(result.server).toContain('get_customers');
    expect(result.server).toContain('get_summary');
  });

  test('analyzer: complete example has no critical errors', () => {
    const result = analyze(`shared {
  type Customer {
    id: Int
    name: String
    email: String
    spend: Float
    country: String
  }
}

data {
  source customers: Table<Customer> = read("customers.csv")
  source orders = read("orders.csv")

  pipeline clean = customers
    |> dropNil(.email)
    |> fillNil(.spend, 0.0)
    |> derive(.name = .name |> trim(), .email = .email |> lower())
    |> where(.spend > 0)

  pipeline summary = clean
    |> groupBy(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sortBy(.total_spend, desc: true)

  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  refresh customers every 10.minutes
  refresh orders on_demand
}

server {
  fn get_customers() { clean }
  fn get_summary() { summary }

  route GET "/api/customers" => get_customers
  route GET "/api/summary" => get_summary
}`);
    // Should not have errors about 'clean' or 'summary' being undefined
    const undefinedErrors = (result.errors || []).filter(e =>
      e.message && (e.message.includes("'clean'") || e.message.includes("'summary'"))
    );
    expect(undefinedErrors.length).toBe(0);
  });
});

// ── Doc: Supported time units mentioned in docs ──────────────
describe('Doc: Time units', () => {
  test('singular "second" works', () => {
    const ast = parse(`data {
  source x = read("x.csv")
  refresh x every 1.second
}`);
    const refresh = ast.body[0].body[1];
    expect(refresh.interval.value).toBe(1);
    expect(refresh.interval.unit).toBe('second');
  });

  test('singular "minute" works', () => {
    const ast = parse(`data {
  source x = read("x.csv")
  refresh x every 1.minute
}`);
    const refresh = ast.body[0].body[1];
    expect(refresh.interval.value).toBe(1);
    expect(refresh.interval.unit).toBe('minute');
  });

  test('"seconds" compiles to correct ms', () => {
    const result = compile(`data {
  source x = read("x.csv")
  refresh x every 1.second
}`);
    expect(result.shared).toContain('1000');
  });

  test('"minute" compiles to correct ms', () => {
    const result = compile(`data {
  source x = read("x.csv")
  refresh x every 1.minute
}`);
    expect(result.shared).toContain('60000');
  });
});
