// Tests targeting 100% line coverage for satellite codegen files:
// - edge-codegen.js, cli-codegen.js, form-codegen.js, deploy-codegen.js, security-codegen.js

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  analyzer.analyze();
  const gen = new CodeGenerator(ast, '<test>', { sourceMaps: false });
  return gen.generate();
}

// ═══════════════════════════════════════════════════════════════
// Edge Codegen Coverage
// ═══════════════════════════════════════════════════════════════

describe('edge-codegen — security CSP in edge block', () => {
  test('edge + security CSP generates __getCspHeader', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        csp {
          default_src: ["self"]
          script_src: ["self"]
        }
      }
      edge {
        route GET "/api" => fn(req) { "ok" }
      }
    `);
    expect(result.edge).toContain('__getCspHeader');
    expect(result.edge).toContain('Content Security Policy');
    expect(result.edge).toContain('default-src');
    expect(result.edge).toContain('script-src');
  });
});

describe('edge-codegen — security audit in edge block', () => {
  test('edge + security audit generates __auditLog', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role admin { permissions: ["write"] }
        audit {
          events: ["login", "logout"]
          store: "my_audit"
          retain: 30
        }
      }
      edge {
        route GET "/api" => fn(req) { "ok" }
      }
    `);
    expect(result.edge).toContain('__auditLog');
    expect(result.edge).toContain('Audit');
    expect(result.edge).toContain('my_audit');
  });
});

describe('edge-codegen — misc statements default case (line 88)', () => {
  test('mergeEdgeBlocks puts unknown statement types into miscStatements', () => {
    const { EdgeCodegen } = require('../src/codegen/edge-codegen.js');

    const fakeBlock = {
      body: [
        { type: 'EdgeConfigField', key: 'target', value: { value: 'cloudflare' } },
        { type: 'RouteDeclaration', method: 'GET', path: '/', params: [], handler: { type: 'Identifier', name: 'fn' } },
        { type: 'SomethingUnknown', data: 'test' }, // hits the default case
      ],
    };

    const config = EdgeCodegen.mergeEdgeBlocks([fakeBlock]);
    expect(config.miscStatements).toHaveLength(1);
    expect(config.miscStatements[0].type).toBe('SomethingUnknown');
  });
});

describe('edge-codegen — Deno middleware + CORS (line 841)', () => {
  test('deno: middleware + CORS merges headers in response', () => {
    const result = compile(`edge {
      target: "deno"
      cors {}
      middleware fn logger(req, next) { next(req) }
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('...__getCorsHeaders(request)');
    expect(result.edge).toContain('__mw_logger');
    expect(result.edge).toContain('Deno.serve');
  });
});

describe('edge-codegen — Lambda middleware + CORS (lines 1042, 1057)', () => {
  test('lambda: middleware + CORS merges headers in response', () => {
    const result = compile(`edge {
      target: "lambda"
      cors {}
      middleware fn logger(req, next) { next(req) }
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('...__getCorsHeaders');
    expect(result.edge).toContain('__mw_logger');
    expect(result.edge).toContain('export const handler');
    // Both inner handler and outer result should have CORS headers
    const corsMatches = result.edge.match(/\.\.\.__getCorsHeaders/g);
    expect(corsMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('edge-codegen — Vercel/Lambda binding stubs for sql, storage, queue (lines 521, 524, 527)', () => {
  test('vercel: sql/storage/queue bindings generate null stubs', () => {
    const result = compile(`edge {
      target: "vercel"
      sql DB
      storage UPLOADS
      queue TASKS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('DB = null');
    expect(result.edge).toContain('SQL not supported');
    expect(result.edge).toContain('UPLOADS = null');
    expect(result.edge).toContain('Object storage not supported');
    expect(result.edge).toContain('TASKS = null');
    expect(result.edge).toContain('Queues not supported');
  });

  test('lambda: sql/storage/queue bindings generate null stubs', () => {
    const result = compile(`edge {
      target: "lambda"
      sql DB
      storage FILES
      queue JOBS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('DB = null');
    expect(result.edge).toContain('FILES = null');
    expect(result.edge).toContain('JOBS = null');
  });
});

describe('edge-codegen — Bun queue stub and secrets (lines 574, 582)', () => {
  test('bun: queue binding stubs to null', () => {
    const result = compile(`edge {
      target: "bun"
      queue TASKS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('TASKS = null');
    expect(result.edge).toContain('Queues not natively supported on Bun');
  });

  test('bun: secret binding uses process.env', () => {
    const result = compile(`edge {
      target: "bun"
      secret API_KEY
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('API_KEY = process.env.API_KEY');
  });
});

describe('edge-codegen — Wrangler.toml R2 buckets (lines 1307-1310)', () => {
  test('generates R2 bucket entries in wrangler.toml', () => {
    const { EdgeCodegen } = require('../src/codegen/edge-codegen.js');

    const config = {
      target: 'cloudflare',
      bindings: {
        kv: [],
        sql: [],
        storage: [{ name: 'UPLOADS' }, { name: 'ASSETS' }],
        queue: [],
      },
      envVars: [],
      secrets: [],
      schedules: [],
      consumers: [],
    };

    const toml = EdgeCodegen.generateWranglerToml(config, 'my-worker');
    expect(toml).toContain('[[r2_buckets]]');
    expect(toml).toContain('binding = "UPLOADS"');
    expect(toml).toContain('bucket_name = "uploads"');
    expect(toml).toContain('binding = "ASSETS"');
    expect(toml).toContain('bucket_name = "assets"');
  });
});

describe('edge-codegen — _emitMiscStatements (lines 1224-1227)', () => {
  test('misc statements are emitted in edge output', () => {
    // Use EdgeCodegen directly to call _emitMiscStatements
    const { EdgeCodegen } = require('../src/codegen/edge-codegen.js');
    const gen = new EdgeCodegen();

    const lines = [];
    // Create a fake statement that generateStatement can handle
    const stmt = {
      type: 'ExpressionStatement',
      expression: { type: 'StringLiteral', value: 'hello' },
    };
    gen._emitMiscStatements(lines, [stmt]);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some(l => l.includes('hello'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// CLI Codegen Coverage
// ═══════════════════════════════════════════════════════════════

describe('cli-codegen — Bool type coercion (line 333)', () => {
  test('positional Bool parameter generates boolean coercion', () => {
    // Bool coercion is used for positional params (not flags, which use --flag/--no-flag)
    const result = compile(`cli {
      name: "tool"
      fn run(confirm: Bool) {
        print(confirm)
      }
    }`);
    expect(result.cli).toContain('=== "true"');
    expect(result.cli).toContain('=== "1"');
    expect(result.cli).toContain('=== "yes"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Form Codegen Coverage
// ═══════════════════════════════════════════════════════════════

describe('form-codegen — generateValidatorFn async validate (line 78)', () => {
  test('async validate in field generates deferred comment', () => {
    const result = compile(`browser {
      component App() {
        form myForm {
          field email: String = "" {
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('async validate');
    expect(b).toContain('deferred');
  });
});

describe('form-codegen — generateValidatorFn custom and edge cases (lines 78-89)', () => {
  test('unknown validator name generates custom validator comment', () => {
    const { generateValidatorFn } = require('../src/codegen/form-codegen.js');

    const validators = [{
      name: 'myCustomRule',
      args: [{ type: 'NumberLiteral', value: 42 }],
      isAsync: false,
    }];
    const genExpr = (node) => {
      if (node.type === 'NumberLiteral') return String(node.value);
      if (node.type === 'StringLiteral') return JSON.stringify(node.value);
      return 'null';
    };
    const code = generateValidatorFn('test_field', validators, genExpr, '  ');
    expect(code).toContain('custom validator: myCustomRule');
    expect(code).toContain('42');
  });

  test('async validate in generateValidatorFn generates deferred comment', () => {
    const { generateValidatorFn } = require('../src/codegen/form-codegen.js');

    const validators = [{
      name: 'validate',
      args: [{ type: 'Identifier', name: 'checkEmail' }],
      isAsync: true,
    }];
    const genExpr = (node) => node.name || 'null';
    const code = generateValidatorFn('email', validators, genExpr, '  ');
    expect(code).toContain('async validate');
    expect(code).toContain('deferred');
    expect(code).toContain('checkEmail');
  });

  test('sync validate in generateValidatorFn generates inline check', () => {
    const { generateValidatorFn } = require('../src/codegen/form-codegen.js');

    const validators = [{
      name: 'validate',
      args: [{ type: 'Identifier', name: 'myValidator' }],
      isAsync: false,
    }];
    const genExpr = (node) => node.name || 'null';
    const code = generateValidatorFn('name', validators, genExpr, '  ');
    expect(code).toContain('const __r = myValidator(v)');
    expect(code).toContain('if (__r) return __r');
  });

  test('all validator types in generateValidatorFn', () => {
    const { generateValidatorFn } = require('../src/codegen/form-codegen.js');

    const genExpr = (node) => {
      if (node.type === 'NumberLiteral') return String(node.value);
      if (node.type === 'StringLiteral') return JSON.stringify(node.value);
      if (node.type === 'RegExpLiteral') return node.raw || '/test/';
      if (node.type === 'Identifier') return node.name;
      return 'null';
    };

    // minLength
    const code1 = generateValidatorFn('f', [{ name: 'minLength', args: [{ type: 'NumberLiteral', value: 3 }, { type: 'StringLiteral', value: 'Too short' }], isAsync: false }], genExpr, '  ');
    expect(code1).toContain('v.length < 3');

    // maxLength
    const code2 = generateValidatorFn('f', [{ name: 'maxLength', args: [{ type: 'NumberLiteral', value: 50 }, { type: 'StringLiteral', value: 'Too long' }], isAsync: false }], genExpr, '  ');
    expect(code2).toContain('v.length > 50');

    // min (uses Number() coercion for HTML string inputs)
    const code3 = generateValidatorFn('f', [{ name: 'min', args: [{ type: 'NumberLiteral', value: 0 }, { type: 'StringLiteral', value: 'Too low' }], isAsync: false }], genExpr, '  ');
    expect(code3).toContain('Number(v) < 0');

    // max (uses Number() coercion for HTML string inputs)
    const code4 = generateValidatorFn('f', [{ name: 'max', args: [{ type: 'NumberLiteral', value: 100 }, { type: 'StringLiteral', value: 'Too high' }], isAsync: false }], genExpr, '  ');
    expect(code4).toContain('Number(v) > 100');

    // pattern
    const code5 = generateValidatorFn('f', [{ name: 'pattern', args: [{ type: 'RegExpLiteral', raw: '/^[A-Z]$/' }, { type: 'StringLiteral', value: 'Invalid' }], isAsync: false }], genExpr, '  ');
    expect(code5).toContain('.test(v)');

    // email
    const code6 = generateValidatorFn('f', [{ name: 'email', args: [{ type: 'StringLiteral', value: 'Bad email' }], isAsync: false }], genExpr, '  ');
    expect(code6).toContain('@');

    // matches
    const code7 = generateValidatorFn('f', [{ name: 'matches', args: [{ type: 'Identifier', name: 'password' }, { type: 'StringLiteral', value: 'No match' }], isAsync: false }], genExpr, '  ');
    expect(code7).toContain('__password_value()');
  });
});

describe('form-codegen — generateGuardedValidatorFn validators (lines 185-243)', () => {
  test('guarded validator with minLength', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group billing when toggle {
            field street: String = "" {
              minLength(3, "Too short")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('v.length < 3');
    expect(b).toContain('"Too short"');
  });

  test('guarded validator with maxLength', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group billing when toggle {
            field city: String = "" {
              maxLength(50, "Too long")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('v.length > 50');
    expect(b).toContain('"Too long"');
  });

  test('guarded validator with min', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group details when toggle {
            field age: Int = 0 {
              min(18, "Must be 18+")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('Number(v) < 18');
    expect(b).toContain('"Must be 18+"');
  });

  test('guarded validator with max', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group details when toggle {
            field score: Int = 0 {
              max(100, "Too high")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('Number(v) > 100');
    expect(b).toContain('"Too high"');
  });

  test('guarded validator with pattern', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group details when toggle {
            field code: String = "" {
              pattern(/^[A-Z]+$/, "Letters only")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('.test(v)');
    expect(b).toContain('"Letters only"');
  });

  test('guarded validator with email', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group details when toggle {
            field addr: String = "" {
              email("Invalid email")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('@');
    expect(b).toContain('.test(v)');
    expect(b).toContain('"Invalid email"');
  });

  test('guarded validator with matches', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group passwords when toggle {
            field pass: String = "" {
              required("Required")
            }
            field confirm: String = "" {
              matches(pass, "Must match")
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('__passwords_pass_value()');
    expect(b).toContain('"Must match"');
  });

  test('guarded validator with validate (sync)', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group details when toggle {
            field name: String = "" {
              validate(fn(v) { if v == "" { "Empty" } else { null } })
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('const __r =');
    expect(b).toContain('if (__r) return __r');
  });

  test('guarded validator with async validate', () => {
    const result = compile(`browser {
      component App() {
        form checkout {
          field toggle: Bool = false
          group details when toggle {
            field username: String = "" {
              async validate(fn(v) v)
            }
          }
        }
        <div>"hello"</div>
      }
    }`);
    const b = result.browser;
    expect(b).toContain('async validate');
    expect(b).toContain('deferred');
  });

  test('guarded validator with custom/unknown validator', () => {
    // Test via direct function call since parser won't produce unknown validators
    const { generateGuardedValidatorFn } = require('../src/codegen/form-codegen.js');

    const validators = [{
      name: 'uniqueCheck',
      args: [{ type: 'StringLiteral', value: 'arg1' }],
      isAsync: false,
    }];
    const genExpr = (node) => {
      if (node.type === 'StringLiteral') return JSON.stringify(node.value);
      return 'null';
    };
    const code = generateGuardedValidatorFn('test_field', validators, genExpr, '  ', '!cond');
    expect(code).toContain('custom validator: uniqueCheck');
    expect(code).toContain('"arg1"');
    expect(code).toContain('if (!cond) return null');
  });
});

describe('form-codegen — generateConditionGuard (lines 142-143)', () => {
  test('generateConditionGuard returns guard line', () => {
    const { generateConditionGuard } = require('../src/codegen/form-codegen.js');
    const line = generateConditionGuard('!myCondition', '  ');
    expect(line).toContain('if (!myCondition) return null');
  });

  test('generateConditionGuard returns empty when null', () => {
    const { generateConditionGuard } = require('../src/codegen/form-codegen.js');
    const line = generateConditionGuard(null, '  ');
    expect(line).toBe('');
  });
});

describe('form-codegen — generateConditionExpr binary/logical (lines 321-324)', () => {
  test('binary expression with form field references', () => {
    const { generateConditionExpr } = require('../src/codegen/form-codegen.js');

    const condNode = {
      type: 'BinaryExpression',
      operator: '==',
      left: { type: 'Identifier', name: 'country' },
      right: { type: 'StringLiteral', value: 'US' },
    };
    const genExpr = (node) => {
      if (node.type === 'StringLiteral') return JSON.stringify(node.value);
      if (node.type === 'Identifier') return node.name;
      return 'null';
    };
    const formFields = new Set(['country']);
    const result = generateConditionExpr(condNode, genExpr, formFields);
    expect(result).toContain('__country_value()');
    expect(result).toContain('==');
    expect(result).toContain('"US"');
  });

  test('logical expression with and/or operators', () => {
    const { generateConditionExpr } = require('../src/codegen/form-codegen.js');

    const condNode = {
      type: 'LogicalExpression',
      operator: 'and',
      left: { type: 'Identifier', name: 'active' },
      right: { type: 'Identifier', name: 'premium' },
    };
    const genExpr = (node) => {
      if (node.type === 'Identifier') return node.name;
      return 'null';
    };
    const formFields = new Set(['active', 'premium']);
    const result = generateConditionExpr(condNode, genExpr, formFields);
    expect(result).toContain('__active_value()');
    expect(result).toContain('&&');
    expect(result).toContain('__premium_value()');
  });

  test('logical expression with or operator', () => {
    const { generateConditionExpr } = require('../src/codegen/form-codegen.js');

    const condNode = {
      type: 'LogicalExpression',
      operator: 'or',
      left: { type: 'Identifier', name: 'a' },
      right: { type: 'Identifier', name: 'b' },
    };
    const genExpr = (node) => node.name || 'null';
    const formFields = new Set(['a', 'b']);
    const result = generateConditionExpr(condNode, genExpr, formFields);
    expect(result).toContain('||');
  });

  test('non-matching operator passes through', () => {
    const { generateConditionExpr } = require('../src/codegen/form-codegen.js');

    const condNode = {
      type: 'BinaryExpression',
      operator: '>=',
      left: { type: 'Identifier', name: 'count' },
      right: { type: 'NumberLiteral', value: 5 },
    };
    const genExpr = (node) => {
      if (node.type === 'NumberLiteral') return String(node.value);
      if (node.type === 'Identifier') return node.name;
      return 'null';
    };
    const result = generateConditionExpr(condNode, genExpr, new Set(['count']));
    expect(result).toContain('>=');
    expect(result).toContain('__count_value()');
    expect(result).toContain('5');
  });
});

// ═══════════════════════════════════════════════════════════════
// Deploy Codegen Coverage
// ═══════════════════════════════════════════════════════════════

describe('deploy-codegen — env and db blocks (lines 27-42)', () => {
  test('DeployCodegen.mergeDeployBlocks processes env block', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');

    const blocks = [{
      name: 'prod',
      body: [
        {
          type: 'DeployConfigField',
          key: 'server',
          value: { value: 'root@example.com' },
        },
        {
          type: 'DeployEnvBlock',
          entries: [
            { key: 'NODE_ENV', value: { value: 'production' } },
            { key: 'PORT', value: { value: 3000 } },
          ],
        },
      ],
    }];

    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.server).toBe('root@example.com');
    expect(config.env.NODE_ENV).toBe('production');
    expect(config.env.PORT).toBe(3000);
  });

  test('DeployCodegen.mergeDeployBlocks processes db block', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');

    const blocks = [{
      name: 'prod',
      body: [
        {
          type: 'DeployDbBlock',
          engine: 'postgres',
          config: {
            name: { value: 'myapp_db' },
            host: { value: 'db.example.com' },
          },
        },
        {
          type: 'DeployDbBlock',
          engine: 'redis',
          config: null,
        },
      ],
    }];

    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.databases).toHaveLength(2);
    expect(config.databases[0].engine).toBe('postgres');
    expect(config.databases[0].config.name).toBe('myapp_db');
    expect(config.databases[0].config.host).toBe('db.example.com');
    expect(config.databases[1].engine).toBe('redis');
    expect(config.databases[1].config).toEqual({});
  });

  test('deploy codegen end-to-end with env and db', () => {
    const result = compile(`
      deploy "prod" {
        server: "root@example.com"
        domain: "app.com"
        env {
          NODE_ENV: "production"
          PORT: 8080
        }
        db {
          postgres {
            name: "maindb"
          }
        }
      }
    `);
    expect(result.deploy).toBeDefined();
    expect(result.deploy.prod.server).toBe('root@example.com');
    expect(result.deploy.prod.env.NODE_ENV).toBe('production');
    expect(result.deploy.prod.env.PORT).toBe(8080);
    expect(result.deploy.prod.databases).toHaveLength(1);
    expect(result.deploy.prod.databases[0].engine).toBe('postgres');
    expect(result.deploy.prod.databases[0].config.name).toBe('maindb');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security Codegen — already at 99.69%, test edge cases if any
// ═══════════════════════════════════════════════════════════════

describe('security-codegen — edge integration CSP + audit', () => {
  test('CSP + audit both appear in edge output', () => {
    const result = compile(`
      security {
        auth jwt { secret: "mysecret" }
        role admin { permissions: ["manage"] }
        csp {
          default_src: ["self"]
        }
        audit {
          events: ["login"]
          store: "logs"
          retain: 60
        }
      }
      edge {
        target: "cloudflare"
        route GET "/api" => fn(req) { "ok" }
      }
    `);
    // CSP code
    expect(result.edge).toContain('Content Security Policy');
    expect(result.edge).toContain('__getCspHeader');
    // Audit code
    expect(result.edge).toContain('Audit');
    expect(result.edge).toContain('__auditLog');
    expect(result.edge).toContain('"logs"');
  });
});
