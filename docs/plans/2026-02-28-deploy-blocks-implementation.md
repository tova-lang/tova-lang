# Deploy Blocks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `deploy { }` blocks to Tova — a new block type that declares infrastructure requirements and generates idempotent provisioning scripts, enabling `tova deploy` to take a bare Linux server to a running production app.

**Architecture:** The deploy block follows Tova's plugin-driven block architecture. A new plugin registers with BlockRegistry, providing parser, AST, analyzer, and codegen components. The codegen produces deployment artifacts (provisioning scripts, Caddy configs, systemd units) instead of JavaScript. A new `tova deploy` CLI command orchestrates SSH-based deployment.

**Tech Stack:** Bun (runtime), SSH (via `child_process.spawn`), shell scripts (provisioning), Caddy (reverse proxy/SSL), systemd (process management)

---

### Task 1: Deploy AST Nodes

**Files:**
- Create: `src/parser/deploy-ast.js`

**Step 1: Write the failing test**

Create `tests/deploy-block.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';

describe('Deploy Block AST', () => {
  test('DeployBlock node has correct structure', () => {
    const { DeployBlock } = require('../src/parser/deploy-ast.js');
    const node = new DeployBlock([], { line: 1, col: 0 }, 'prod');
    expect(node.type).toBe('DeployBlock');
    expect(node.name).toBe('prod');
    expect(node.body).toEqual([]);
    expect(node.loc).toEqual({ line: 1, col: 0 });
  });

  test('DeployConfigField node has correct structure', () => {
    const { DeployConfigField } = require('../src/parser/deploy-ast.js');
    const node = new DeployConfigField('server', 'root@example.com', { line: 1, col: 0 });
    expect(node.type).toBe('DeployConfigField');
    expect(node.key).toBe('server');
    expect(node.value).toBe('root@example.com');
  });

  test('DeployEnvBlock node has correct structure', () => {
    const { DeployEnvBlock } = require('../src/parser/deploy-ast.js');
    const node = new DeployEnvBlock([{ key: 'NODE_ENV', value: 'production' }], { line: 1, col: 0 });
    expect(node.type).toBe('DeployEnvBlock');
    expect(node.entries).toHaveLength(1);
  });

  test('DeployDbBlock node has correct structure', () => {
    const { DeployDbBlock } = require('../src/parser/deploy-ast.js');
    const node = new DeployDbBlock('postgres', { name: 'myapp_db' }, { line: 1, col: 0 });
    expect(node.type).toBe('DeployDbBlock');
    expect(node.engine).toBe('postgres');
    expect(node.config.name).toBe('myapp_db');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-block.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/parser/deploy-ast.js`:

```javascript
// Deploy-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when deploy { } blocks are used.

export class DeployBlock {
  constructor(body, loc, name = null) {
    this.type = 'DeployBlock';
    this.name = name;       // required string name — "prod", "staging", etc.
    this.body = body;       // Array of deploy statements (config fields, env, db blocks)
    this.loc = loc;
  }
}

export class DeployConfigField {
  constructor(key, value, loc) {
    this.type = 'DeployConfigField';
    this.key = key;         // string — "server", "domain", "instances", "memory", etc.
    this.value = value;     // Expression (StringLiteral, NumberLiteral, BooleanLiteral)
    this.loc = loc;
  }
}

export class DeployEnvBlock {
  constructor(entries, loc) {
    this.type = 'DeployEnvBlock';
    this.entries = entries; // Array of { key: string, value: Expression }
    this.loc = loc;
  }
}

export class DeployDbBlock {
  constructor(engine, config, loc) {
    this.type = 'DeployDbBlock';
    this.engine = engine;   // string — "postgres", "redis", "sqlite"
    this.config = config;   // object — { name, port, maxmemory, ... } or null
    this.loc = loc;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-block.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser/deploy-ast.js tests/deploy-block.test.js
git commit -m "feat(deploy): add AST node definitions for deploy blocks"
```

---

### Task 2: Register Deploy in Main AST Exports

**Files:**
- Modify: `src/parser/ast.js` (after line 746, edge-ast re-exports)

**Step 1: Write the failing test**

Add to `tests/deploy-block.test.js`:

```javascript
test('DeployBlock is exported from main ast.js', () => {
  const AST = require('../src/parser/ast.js');
  expect(AST.DeployBlock).toBeDefined();
  expect(AST.DeployConfigField).toBeDefined();
  expect(AST.DeployEnvBlock).toBeDefined();
  expect(AST.DeployDbBlock).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-block.test.js`
Expected: FAIL — DeployBlock is undefined

**Step 3: Write the implementation**

In `src/parser/ast.js`, add after the edge-ast re-exports (after line 746):

```javascript
// ============================================================
// Deploy-specific nodes (lazy-loaded from deploy-ast.js, re-exported for backward compat)
// ============================================================

export {
  DeployBlock, DeployConfigField, DeployEnvBlock, DeployDbBlock,
} from './deploy-ast.js';
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-block.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser/ast.js tests/deploy-block.test.js
git commit -m "feat(deploy): re-export deploy AST nodes from main ast.js"
```

---

### Task 3: Deploy Parser

**Files:**
- Create: `src/parser/deploy-parser.js`

**Step 1: Write the failing test**

Add to `tests/deploy-block.test.js`:

```javascript
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(code) {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Deploy Block Parser', () => {
  test('parses minimal deploy block', () => {
    const ast = parse(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('DeployBlock');
    expect(ast.body[0].name).toBe('prod');
    expect(ast.body[0].body).toHaveLength(2);
    expect(ast.body[0].body[0].type).toBe('DeployConfigField');
    expect(ast.body[0].body[0].key).toBe('server');
    expect(ast.body[0].body[1].key).toBe('domain');
  });

  test('parses deploy block with numeric config', () => {
    const ast = parse(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
        instances: 2
        health_interval: 30
      }
    `);
    const block = ast.body[0];
    expect(block.body).toHaveLength(4);
    const instances = block.body.find(n => n.key === 'instances');
    expect(instances.value.value).toBe(2);
  });

  test('parses deploy block with env sub-block', () => {
    const ast = parse(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
        env {
          NODE_ENV: "production"
          PORT: "3000"
        }
      }
    `);
    const block = ast.body[0];
    const envBlock = block.body.find(n => n.type === 'DeployEnvBlock');
    expect(envBlock).toBeDefined();
    expect(envBlock.entries).toHaveLength(2);
    expect(envBlock.entries[0].key).toBe('NODE_ENV');
  });

  test('parses deploy block with db sub-block', () => {
    const ast = parse(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
        db {
          postgres { name: "myapp_db", port: 5433 }
          redis { maxmemory: "256mb" }
        }
      }
    `);
    const block = ast.body[0];
    const dbBlocks = block.body.filter(n => n.type === 'DeployDbBlock');
    expect(dbBlocks).toHaveLength(2);
    expect(dbBlocks[0].engine).toBe('postgres');
    expect(dbBlocks[0].config.name).toBe('myapp_db');
    expect(dbBlocks[1].engine).toBe('redis');
  });

  test('parses multiple deploy blocks', () => {
    const ast = parse(`
      deploy "prod" {
        server: "root@prod.example.com"
        domain: "myapp.com"
      }
      deploy "staging" {
        server: "root@staging.example.com"
        domain: "staging.myapp.com"
      }
    `);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].name).toBe('prod');
    expect(ast.body[1].name).toBe('staging');
  });

  test('deploy block requires a name', () => {
    expect(() => parse(`
      deploy {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `)).toThrow();
  });

  test('parses deploy block with boolean config', () => {
    const ast = parse(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
        restart_on_failure: true
      }
    `);
    const block = ast.body[0];
    const restart = block.body.find(n => n.key === 'restart_on_failure');
    expect(restart.value.value).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-block.test.js`
Expected: FAIL — deploy is not recognized as a block

**Step 3: Write the implementation**

Create `src/parser/deploy-parser.js`:

```javascript
// Deploy-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when deploy { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import {
  DeployBlock, DeployConfigField, DeployEnvBlock, DeployDbBlock,
} from './deploy-ast.js';

// Valid config keys inside deploy blocks
const DEPLOY_CONFIG_KEYS = new Set([
  'server', 'domain', 'instances', 'memory', 'branch',
  'health', 'health_interval', 'health_timeout',
  'restart_on_failure', 'keep_releases',
]);

// Valid database engines
const DEPLOY_DB_ENGINES = new Set(['postgres', 'redis', 'sqlite']);

export function installDeployParser(ParserClass) {
  if (ParserClass.prototype._deployParserInstalled) return;
  ParserClass.prototype._deployParserInstalled = true;

  ParserClass.prototype.parseDeployBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'deploy'

    // Deploy blocks require a name: deploy "prod" { }
    if (!this.check(TokenType.STRING)) {
      throw this.error("Deploy blocks require a name, e.g. deploy \"prod\" { }");
    }
    const name = this.advance().value;

    this.expect(TokenType.LBRACE, "Expected '{' after deploy block name");
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseDeployStatement();
        if (stmt) {
          if (Array.isArray(stmt)) {
            body.push(...stmt);
          } else {
            body.push(stmt);
          }
        }
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close deploy block");
    return new DeployBlock(body, l, name);
  };

  ParserClass.prototype.parseDeployStatement = function() {
    if (this.check(TokenType.IDENTIFIER)) {
      const val = this.current().value;

      // env { KEY: "value", ... }
      if (val === 'env') {
        return this.parseDeployEnvBlock();
      }

      // db { postgres { ... } redis { ... } }
      if (val === 'db') {
        return this.parseDeployDbBlock();
      }

      // Config fields: key: value
      if (DEPLOY_CONFIG_KEYS.has(val)) {
        return this.parseDeployConfigField();
      }
    }

    // Try as generic config field with any identifier key followed by colon
    if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
      return this.parseDeployConfigField();
    }

    throw this.error(`Unexpected token in deploy block: ${this.current().value || this.current().type}`);
  };

  ParserClass.prototype.parseDeployConfigField = function() {
    const l = this.loc();
    const key = this.advance().value; // consume identifier
    this.expect(TokenType.COLON, `Expected ':' after config key '${key}'`);
    const value = this.parseExpression();
    return new DeployConfigField(key, value, l);
  };

  ParserClass.prototype.parseDeployEnvBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'env'
    this.expect(TokenType.LBRACE, "Expected '{' after 'env'");

    const entries = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.advance().value;
      this.expect(TokenType.COLON, `Expected ':' after env key '${key}'`);
      const value = this.parseExpression();
      entries.push({ key, value });
      // optional comma
      if (this.check(TokenType.COMMA)) this.advance();
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close env block");
    return new DeployEnvBlock(entries, l);
  };

  ParserClass.prototype.parseDeployDbBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'db'
    this.expect(TokenType.LBRACE, "Expected '{' after 'db'");

    const dbBlocks = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENTIFIER)) {
        const engine = this.current().value;
        if (!DEPLOY_DB_ENGINES.has(engine)) {
          throw this.error(`Unknown database engine '${engine}'. Supported: ${[...DEPLOY_DB_ENGINES].join(', ')}`);
        }
        this.advance(); // consume engine name
        this.expect(TokenType.LBRACE, `Expected '{' after '${engine}'`);

        // Parse config object: key: value pairs
        const config = {};
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const key = this.advance().value;
          this.expect(TokenType.COLON, `Expected ':' after config key '${key}'`);
          const value = this.parseExpression();
          // Extract literal values for config
          if (value.type === 'StringLiteral') {
            config[key] = value.value;
          } else if (value.type === 'NumberLiteral') {
            config[key] = value.value;
          } else if (value.type === 'BooleanLiteral') {
            config[key] = value.value;
          }
          if (this.check(TokenType.COMMA)) this.advance();
        }

        this.expect(TokenType.RBRACE, `Expected '}' to close ${engine} config`);
        dbBlocks.push(new DeployDbBlock(engine, Object.keys(config).length > 0 ? config : null, l));
      } else {
        throw this.error(`Expected database engine name (postgres, redis, sqlite) in db block`);
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close db block");
    return dbBlocks; // returns array — caller spreads into body
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-block.test.js`
Expected: PASS (after plugin registration in Task 4)

**Step 5: Commit**

```bash
git add src/parser/deploy-parser.js tests/deploy-block.test.js
git commit -m "feat(deploy): add deploy block parser"
```

---

### Task 4: Deploy Plugin + Registry

**Files:**
- Create: `src/registry/plugins/deploy-plugin.js`
- Modify: `src/registry/register-all.js` (add import + register)
- Modify: `tests/block-registry.test.js` (update counts)

**Step 1: Write the failing test**

Update `tests/block-registry.test.js`:

- Line 5: Change `expect(all.length).toBe(10)` → `expect(all.length).toBe(11)`
- Line 9: Add `'deploy'` to the expected array
- Line 84: Change `expect(keywords.length).toBe(3)` → leave as-is (deploy uses identifier strategy)
- Line 92: Change `expect(ids.length).toBe(7)` → `expect(ids.length).toBe(8)`

Add new test:

```javascript
test('deploy plugin has correct structure', () => {
  const deploy = BlockRegistry.get('deploy');
  expect(deploy).not.toBeNull();
  expect(deploy.name).toBe('deploy');
  expect(deploy.astNodeType).toBe('DeployBlock');
  expect(deploy.detection.strategy).toBe('identifier');
  expect(deploy.detection.identifierValue).toBe('deploy');
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/block-registry.test.js`
Expected: FAIL — 10 plugins, not 11; deploy is null

**Step 3: Write the implementation**

Create `src/registry/plugins/deploy-plugin.js`:

```javascript
import { installDeployParser } from '../../parser/deploy-parser.js';
import { TokenType } from '../../lexer/tokens.js';

export const deployPlugin = {
  name: 'deploy',
  astNodeType: 'DeployBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'deploy',
    lookahead: (parser) => {
      const next = parser.peek(1);
      // deploy "name" { }
      return next.type === TokenType.STRING;
    },
  },
  parser: {
    install: installDeployParser,
    installedFlag: '_deployParserInstalled',
    method: 'parseDeployBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitDeployBlock(node),
    childNodeTypes: [],
    noopNodeTypes: [
      'DeployConfigField', 'DeployEnvBlock', 'DeployDbBlock',
    ],
  },
  codegen: {},
};
```

Modify `src/registry/register-all.js` — add after the concurrency import (line 14):

```javascript
import { deployPlugin } from './plugins/deploy-plugin.js';
```

Add after `BlockRegistry.register(concurrencyPlugin);` (line 25):

```javascript
BlockRegistry.register(deployPlugin);
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/block-registry.test.js && bun test tests/deploy-block.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/registry/plugins/deploy-plugin.js src/registry/register-all.js tests/block-registry.test.js
git commit -m "feat(deploy): register deploy plugin in BlockRegistry"
```

---

### Task 5: Deploy Analyzer

**Files:**
- Create: `src/analyzer/deploy-analyzer.js`

**Step 1: Write the failing test**

Add to `tests/deploy-block.test.js`:

```javascript
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(code) {
  const ast = parse(code);
  const analyzer = new Analyzer(ast);
  return analyzer.analyze();
}

describe('Deploy Block Analyzer', () => {
  test('accepts valid deploy block', () => {
    const errors = analyze(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const deployErrors = errors.filter(e => e.message?.includes('deploy'));
    expect(deployErrors).toHaveLength(0);
  });

  test('rejects deploy block missing server', () => {
    const errors = analyze(`
      deploy "prod" {
        domain: "myapp.com"
      }
    `);
    expect(errors.some(e => e.message?.includes('server'))).toBe(true);
  });

  test('rejects deploy block missing domain', () => {
    const errors = analyze(`
      deploy "prod" {
        server: "root@example.com"
      }
    `);
    expect(errors.some(e => e.message?.includes('domain'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-block.test.js`
Expected: FAIL — visitDeployBlock is not a function

**Step 3: Write the implementation**

Create `src/analyzer/deploy-analyzer.js`:

```javascript
// Deploy-specific analyzer methods for the Tova language
// Validates deploy block structure and config fields.

const REQUIRED_FIELDS = new Set(['server', 'domain']);

const VALID_FIELDS = new Set([
  'server', 'domain', 'instances', 'memory', 'branch',
  'health', 'health_interval', 'health_timeout',
  'restart_on_failure', 'keep_releases',
]);

export function installDeployAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._deployAnalyzerInstalled) return;
  AnalyzerClass.prototype._deployAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitDeployBlock = function(node) {
    // Deploy blocks are declarative config — no scope needed
    const foundFields = new Set();

    for (const stmt of node.body) {
      if (stmt.type === 'DeployConfigField') {
        foundFields.add(stmt.key);

        if (!VALID_FIELDS.has(stmt.key)) {
          this.errors.push({
            message: `Unknown deploy config field '${stmt.key}'. Valid fields: ${[...VALID_FIELDS].join(', ')}`,
            loc: stmt.loc,
          });
        }
      }
      // DeployEnvBlock and DeployDbBlock are valid sub-blocks — no further analysis needed
    }

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!foundFields.has(field)) {
        this.errors.push({
          message: `Deploy block '${node.name}' is missing required field '${field}'`,
          loc: node.loc,
        });
      }
    }
  };
}
```

Update `src/registry/plugins/deploy-plugin.js` to import and use the analyzer:

```javascript
import { installDeployAnalyzer } from '../../analyzer/deploy-analyzer.js';
```

Add to the analyzer section of the plugin:

```javascript
analyzer: {
  install: installDeployAnalyzer,
  visit: (analyzer, node) => analyzer.visitDeployBlock(node),
  childNodeTypes: [],
  noopNodeTypes: [
    'DeployConfigField', 'DeployEnvBlock', 'DeployDbBlock',
  ],
},
```

Note: Check if the analyzer framework calls `install` automatically. If not, the `visitDeployBlock` method installation may need to happen via the existing plugin mechanism. Look at how the edge plugin's analyzer is installed — it may be done lazily when `visitEdgeBlock` is first called. If the analyzer uses `plugin.analyzer.visit(analyzer, node)` directly, the `install` may need to be called in that wrapper:

```javascript
visit: (analyzer, node) => {
  installDeployAnalyzer(analyzer.constructor);
  analyzer.visitDeployBlock(node);
},
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-block.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/analyzer/deploy-analyzer.js src/registry/plugins/deploy-plugin.js tests/deploy-block.test.js
git commit -m "feat(deploy): add deploy block analyzer with validation"
```

---

### Task 6: Deploy Codegen — Infrastructure Manifest

**Files:**
- Create: `src/codegen/deploy-codegen.js`

This is the core of the deploy feature. The codegen doesn't produce JavaScript — it produces a deployment manifest (JSON) that the CLI command uses to generate provisioning scripts.

**Step 1: Write the failing test**

Create `tests/deploy-codegen.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';

describe('Deploy Codegen', () => {
  test('mergeDeployBlocks extracts config fields', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock',
      name: 'prod',
      body: [
        { type: 'DeployConfigField', key: 'server', value: { type: 'StringLiteral', value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { type: 'StringLiteral', value: 'myapp.com' } },
        { type: 'DeployConfigField', key: 'instances', value: { type: 'NumberLiteral', value: 2 } },
      ],
    }];

    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.server).toBe('root@example.com');
    expect(config.domain).toBe('myapp.com');
    expect(config.instances).toBe(2);
  });

  test('mergeDeployBlocks extracts env entries', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock',
      name: 'prod',
      body: [
        { type: 'DeployConfigField', key: 'server', value: { type: 'StringLiteral', value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { type: 'StringLiteral', value: 'myapp.com' } },
        {
          type: 'DeployEnvBlock',
          entries: [
            { key: 'NODE_ENV', value: { type: 'StringLiteral', value: 'production' } },
          ],
        },
      ],
    }];

    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.env).toEqual({ NODE_ENV: 'production' });
  });

  test('mergeDeployBlocks extracts db overrides', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock',
      name: 'prod',
      body: [
        { type: 'DeployConfigField', key: 'server', value: { type: 'StringLiteral', value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { type: 'StringLiteral', value: 'myapp.com' } },
        { type: 'DeployDbBlock', engine: 'postgres', config: { name: 'myapp_db' } },
        { type: 'DeployDbBlock', engine: 'redis', config: null },
      ],
    }];

    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.databases).toHaveLength(2);
    expect(config.databases[0].engine).toBe('postgres');
    expect(config.databases[0].config.name).toBe('myapp_db');
    expect(config.databases[1].engine).toBe('redis');
  });

  test('applies defaults for missing config', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock',
      name: 'prod',
      body: [
        { type: 'DeployConfigField', key: 'server', value: { type: 'StringLiteral', value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { type: 'StringLiteral', value: 'myapp.com' } },
      ],
    }];

    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.instances).toBe(1);
    expect(config.memory).toBe('512mb');
    expect(config.branch).toBe('main');
    expect(config.health).toBe('/healthz');
    expect(config.health_interval).toBe(30);
    expect(config.keep_releases).toBe(5);
    expect(config.restart_on_failure).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-codegen.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/codegen/deploy-codegen.js`:

```javascript
// Deploy-specific code generator for the Tova language
// Produces deployment manifests and provisioning scripts, not JavaScript.

const DEFAULTS = {
  instances: 1,
  memory: '512mb',
  branch: 'main',
  health: '/healthz',
  health_interval: 30,
  health_timeout: 5,
  restart_on_failure: true,
  keep_releases: 5,
};

export class DeployCodegen {
  /**
   * Merge one or more DeployBlock AST nodes into a flat config object.
   * Multiple deploy blocks with the same name are merged (last-write-wins for fields).
   */
  static mergeDeployBlocks(blocks) {
    const config = { ...DEFAULTS, env: {}, databases: [] };

    for (const block of blocks) {
      config.name = block.name;
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'DeployConfigField': {
            const val = stmt.value;
            config[stmt.key] = val.value !== undefined ? val.value : val;
            break;
          }
          case 'DeployEnvBlock': {
            for (const entry of stmt.entries) {
              config.env[entry.key] = entry.value.value !== undefined ? entry.value.value : entry.value;
            }
            break;
          }
          case 'DeployDbBlock': {
            config.databases.push({
              engine: stmt.engine,
              config: stmt.config || {},
            });
            break;
          }
        }
      }
    }

    return config;
  }

  /**
   * Generate the infrastructure manifest JSON from deploy config
   * and inferred requirements from other blocks.
   */
  static generateManifest(deployConfig, blockTypes) {
    const manifest = {
      app: deployConfig.name,
      server: deployConfig.server,
      domain: deployConfig.domain,
      instances: deployConfig.instances,
      memory: deployConfig.memory,
      branch: deployConfig.branch,
      health: deployConfig.health,
      health_interval: deployConfig.health_interval,
      health_timeout: deployConfig.health_timeout,
      restart_on_failure: deployConfig.restart_on_failure,
      keep_releases: deployConfig.keep_releases,
      env: deployConfig.env,
      // Infrastructure requirements (inferred + explicit)
      requires: {
        bun: true,
        caddy: true,
        ufw: true,
      },
      databases: deployConfig.databases,
      hasWebSocket: false,
      hasSSE: false,
      hasBrowser: false,
      requiredSecrets: [],
    };

    // Infer from block types present in the project
    if (blockTypes.has('server')) {
      manifest.requires.bun = true;
    }
    if (blockTypes.has('browser')) {
      manifest.hasBrowser = true;
    }

    return manifest;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-codegen.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/codegen/deploy-codegen.js tests/deploy-codegen.test.js
git commit -m "feat(deploy): add deploy codegen with manifest generation"
```

---

### Task 7: Infrastructure Inference Engine

**Files:**
- Create: `src/deploy/infer.js`

This module walks the AST to infer what infrastructure the app needs beyond what's declared in the deploy block.

**Step 1: Write the failing test**

Create `tests/deploy-infer.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(code) {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Infrastructure Inference', () => {
  test('infers Bun + Caddy from server block', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      server {
        route GET "/api/hello" => fn() { "hello" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.requires.bun).toBe(true);
    expect(infra.requires.caddy).toBe(true);
  });

  test('infers SQLite from server db declaration', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      server {
        db { path: "./data.db" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.databases.some(d => d.engine === 'sqlite')).toBe(true);
  });

  test('infers PostgreSQL from server db declaration', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      server {
        db { type: "postgres" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.databases.some(d => d.engine === 'postgres')).toBe(true);
  });

  test('infers WebSocket from server ws declaration', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      server {
        ws "/chat" {
          on message(data) { data }
        }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.hasWebSocket).toBe(true);
  });

  test('infers browser static serving from browser block', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      browser {
        state count = 0
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.hasBrowser).toBe(true);
  });

  test('infers required secrets from security block', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      security {
        auth jwt {
          secret: env("JWT_SECRET")
        }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.requiredSecrets).toContain('JWT_SECRET');
  });

  test('merges inferred and declared databases', () => {
    const { inferInfrastructure } = require('../src/deploy/infer.js');
    const ast = parse(`
      server {
        db { type: "postgres" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
        db {
          redis { maxmemory: "256mb" }
        }
      }
    `);
    const infra = inferInfrastructure(ast);
    expect(infra.databases.some(d => d.engine === 'postgres')).toBe(true);
    expect(infra.databases.some(d => d.engine === 'redis')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-infer.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/deploy/infer.js`:

```javascript
// Infrastructure inference engine for deploy blocks.
// Walks the AST to determine what infrastructure the app needs.

import { DeployCodegen } from '../codegen/deploy-codegen.js';

/**
 * Analyze the full AST and produce a complete infrastructure manifest
 * combining inferred requirements with explicit deploy block declarations.
 */
export function inferInfrastructure(ast) {
  const blockTypes = new Set();
  const inferredDatabases = [];
  const requiredSecrets = [];
  let hasWebSocket = false;
  let hasSSE = false;
  let hasBrowser = false;
  let deployConfig = null;

  for (const node of ast.body) {
    switch (node.type) {
      case 'ServerBlock':
        blockTypes.add('server');
        scanServerBlock(node, inferredDatabases, { hasWebSocket: (v) => hasWebSocket = v, hasSSE: (v) => hasSSE = v });
        break;
      case 'BrowserBlock':
        blockTypes.add('browser');
        hasBrowser = true;
        break;
      case 'SharedBlock':
        blockTypes.add('shared');
        break;
      case 'SecurityBlock':
        blockTypes.add('security');
        scanSecurityBlock(node, requiredSecrets);
        break;
      case 'DataBlock':
        blockTypes.add('data');
        break;
      case 'DeployBlock':
        blockTypes.add('deploy');
        deployConfig = DeployCodegen.mergeDeployBlocks([node]);
        break;
    }
  }

  if (!deployConfig) {
    throw new Error('No deploy block found in the project');
  }

  // Merge inferred databases with declared ones (avoid duplicates by engine)
  const declaredEngines = new Set(deployConfig.databases.map(d => d.engine));
  for (const db of inferredDatabases) {
    if (!declaredEngines.has(db.engine)) {
      deployConfig.databases.push(db);
    }
  }

  return {
    ...deployConfig,
    requires: {
      bun: blockTypes.has('server') || blockTypes.has('data'),
      caddy: true, // always need reverse proxy for domain + SSL
      ufw: true,
    },
    hasWebSocket,
    hasSSE,
    hasBrowser,
    requiredSecrets,
    blockTypes: [...blockTypes],
  };
}

function scanServerBlock(node, databases, setters) {
  for (const stmt of node.body) {
    if (stmt.type === 'DbDeclaration') {
      // Infer database type from db config
      if (stmt.config) {
        for (const field of stmt.config) {
          if (field.key === 'type' && field.value?.value) {
            databases.push({ engine: field.value.value, config: {}, inferred: true });
          } else if (field.key === 'path') {
            databases.push({ engine: 'sqlite', config: { path: field.value?.value }, inferred: true });
          }
        }
      }
    }
    if (stmt.type === 'WebSocketDeclaration') {
      setters.hasWebSocket(true);
    }
    if (stmt.type === 'SseDeclaration') {
      setters.hasSSE(true);
    }
  }
}

function scanSecurityBlock(node, requiredSecrets) {
  for (const stmt of node.body) {
    if (stmt.type === 'SecurityAuthDeclaration') {
      // Look for env() calls in auth config to find required secrets
      walkForEnvCalls(stmt, requiredSecrets);
    }
  }
}

function walkForEnvCalls(node, secrets) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'env' &&
      node.arguments?.[0]?.type === 'StringLiteral') {
    secrets.push(node.arguments[0].value);
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') walkForEnvCalls(item, secrets);
      }
    } else if (val && typeof val === 'object' && val.type) {
      walkForEnvCalls(val, secrets);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-infer.test.js`
Expected: PASS (some tests may need adjustment depending on how DbDeclaration is structured in the real parser — check the actual AST shape when implementing)

**Step 5: Commit**

```bash
git add src/deploy/infer.js tests/deploy-infer.test.js
git commit -m "feat(deploy): add infrastructure inference engine"
```

---

### Task 8: Provisioning Script Generator

**Files:**
- Create: `src/deploy/provision.js`

Generates the idempotent shell script from the infrastructure manifest.

**Step 1: Write the failing test**

Create `tests/deploy-provision.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';

describe('Provisioning Script Generator', () => {
  test('generates script with Bun installation', () => {
    const { generateProvisionScript } = require('../src/deploy/provision.js');
    const manifest = {
      app: 'myapp',
      server: 'root@example.com',
      domain: 'myapp.com',
      instances: 1,
      memory: '512mb',
      health: '/healthz',
      restart_on_failure: true,
      keep_releases: 5,
      env: {},
      requires: { bun: true, caddy: true, ufw: true },
      databases: [],
      hasWebSocket: false,
      hasBrowser: false,
      requiredSecrets: [],
    };

    const script = generateProvisionScript(manifest);
    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('bun');
    expect(script).toContain('caddy');
    expect(script).toContain('ufw');
  });

  test('includes PostgreSQL when declared', () => {
    const { generateProvisionScript } = require('../src/deploy/provision.js');
    const manifest = {
      app: 'myapp',
      domain: 'myapp.com',
      instances: 1,
      memory: '512mb',
      requires: { bun: true, caddy: true, ufw: true },
      databases: [{ engine: 'postgres', config: { name: 'myapp_db' } }],
      env: {},
      hasWebSocket: false,
      hasBrowser: false,
      requiredSecrets: [],
    };

    const script = generateProvisionScript(manifest);
    expect(script).toContain('postgresql');
    expect(script).toContain('myapp_db');
  });

  test('includes Redis when declared', () => {
    const { generateProvisionScript } = require('../src/deploy/provision.js');
    const manifest = {
      app: 'myapp',
      domain: 'myapp.com',
      instances: 1,
      memory: '512mb',
      requires: { bun: true, caddy: true, ufw: true },
      databases: [{ engine: 'redis', config: {} }],
      env: {},
      hasWebSocket: false,
      hasBrowser: false,
      requiredSecrets: [],
    };

    const script = generateProvisionScript(manifest);
    expect(script).toContain('redis');
  });

  test('generates systemd service template', () => {
    const { generateSystemdService } = require('../src/deploy/provision.js');
    const service = generateSystemdService('myapp', { instances: 2, memory: '512mb' });
    expect(service).toContain('[Unit]');
    expect(service).toContain('[Service]');
    expect(service).toContain('tova-myapp');
    expect(service).toContain('MemoryMax=512M');
    expect(service).toContain('%i');
  });

  test('generates Caddy config', () => {
    const { generateCaddyConfig } = require('../src/deploy/provision.js');
    const caddy = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 2,
      ports: [3000, 3001],
      health: '/healthz',
      hasWebSocket: true,
    });
    expect(caddy).toContain('myapp.com');
    expect(caddy).toContain('localhost:3000');
    expect(caddy).toContain('localhost:3001');
    expect(caddy).toContain('round_robin');
    expect(caddy).toContain('/healthz');
    // WebSocket support
    expect(caddy).toContain('@ws');
  });

  test('script is idempotent (uses conditional installs)', () => {
    const { generateProvisionScript } = require('../src/deploy/provision.js');
    const manifest = {
      app: 'myapp',
      domain: 'myapp.com',
      instances: 1,
      memory: '512mb',
      requires: { bun: true, caddy: true, ufw: true },
      databases: [],
      env: {},
      hasWebSocket: false,
      hasBrowser: false,
      requiredSecrets: [],
    };

    const script = generateProvisionScript(manifest);
    // Should check before installing
    expect(script).toContain('command -v bun');
    expect(script).toContain('command -v caddy');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-provision.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/deploy/provision.js`:

```javascript
// Provisioning script generator for deploy blocks.
// Generates idempotent bash scripts for server setup.

/**
 * Generate the main provisioning shell script from a manifest.
 */
export function generateProvisionScript(manifest) {
  const lines = [];
  lines.push('#!/bin/bash');
  lines.push('set -euo pipefail');
  lines.push('');
  lines.push(`# Tova provisioning script for: ${manifest.app}`);
  lines.push(`# Domain: ${manifest.domain}`);
  lines.push(`# Generated — do not edit manually`);
  lines.push('');

  // Layer 1: System
  lines.push('# ── Layer 1: System ──');
  lines.push('export DEBIAN_FRONTEND=noninteractive');
  lines.push('');

  if (manifest.requires.bun) {
    lines.push('if ! command -v bun &>/dev/null; then');
    lines.push('  echo "[tova] Installing Bun..."');
    lines.push('  curl -fsSL https://bun.sh/install | bash');
    lines.push('  export PATH="$HOME/.bun/bin:$PATH"');
    lines.push('fi');
    lines.push('');
  }

  if (manifest.requires.caddy) {
    lines.push('if ! command -v caddy &>/dev/null; then');
    lines.push('  echo "[tova] Installing Caddy..."');
    lines.push('  apt-get update -qq');
    lines.push('  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl');
    lines.push('  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg');
    lines.push('  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list');
    lines.push('  apt-get update -qq');
    lines.push('  apt-get install -y -qq caddy');
    lines.push('fi');
    lines.push('');
  }

  if (manifest.requires.ufw) {
    lines.push('if command -v ufw &>/dev/null; then');
    lines.push('  echo "[tova] Configuring firewall..."');
    lines.push('  ufw allow 22/tcp');
    lines.push('  ufw allow 80/tcp');
    lines.push('  ufw allow 443/tcp');
    lines.push('  ufw --force enable');
    lines.push('fi');
    lines.push('');
  }

  // Create tova user if not exists
  lines.push('if ! id -u tova &>/dev/null; then');
  lines.push('  echo "[tova] Creating tova user..."');
  lines.push('  useradd -r -m -s /bin/bash tova');
  lines.push('fi');
  lines.push('');

  // Create directory structure
  lines.push('# ── App directories ──');
  lines.push(`mkdir -p /opt/tova/apps/${manifest.app}/releases`);
  lines.push(`mkdir -p /opt/tova/apps/${manifest.app}/data`);
  lines.push('mkdir -p /opt/tova/caddy/apps');
  lines.push(`chown -R tova:tova /opt/tova/apps/${manifest.app}`);
  lines.push('');

  // Layer 2: Databases
  if (manifest.databases.length > 0) {
    lines.push('# ── Layer 2: Databases ──');
    for (const db of manifest.databases) {
      switch (db.engine) {
        case 'postgres':
          lines.push(generatePostgresSetup(manifest.app, db.config));
          break;
        case 'redis':
          lines.push(generateRedisSetup(manifest.app, db.config));
          break;
        case 'sqlite':
          lines.push(`# SQLite: data dir already created above`);
          break;
      }
    }
    lines.push('');
  }

  // Layer 5: Reverse proxy
  lines.push('# ── Layer 5: Reverse Proxy ──');
  const ports = [];
  for (let i = 0; i < manifest.instances; i++) {
    ports.push(3000 + i); // placeholder — real ports come from registry
  }
  lines.push(`cat > /opt/tova/caddy/apps/${manifest.app}.caddy << 'CADDY_EOF'`);
  lines.push(generateCaddyConfig(manifest.app, {
    domain: manifest.domain,
    instances: manifest.instances,
    ports,
    health: manifest.health,
    hasWebSocket: manifest.hasWebSocket,
  }));
  lines.push('CADDY_EOF');
  lines.push('');

  // Master Caddyfile
  lines.push('if [ ! -f /opt/tova/caddy/Caddyfile ]; then');
  lines.push('  echo "import /opt/tova/caddy/apps/*.caddy" > /opt/tova/caddy/Caddyfile');
  lines.push('fi');
  lines.push('');

  // Layer 6: systemd services
  lines.push('# ── Layer 6: Services ──');
  lines.push(`cat > /etc/systemd/system/tova-${manifest.app}@.service << 'SYSTEMD_EOF'`);
  lines.push(generateSystemdService(manifest.app, manifest));
  lines.push('SYSTEMD_EOF');
  lines.push('');
  lines.push('systemctl daemon-reload');
  for (let i = 0; i < manifest.instances; i++) {
    const port = 3000 + i;
    lines.push(`systemctl enable tova-${manifest.app}@${port}.service`);
  }
  lines.push('');

  // Caddy reload
  lines.push('systemctl reload caddy || systemctl start caddy');
  lines.push('');
  lines.push('echo "[tova] Provisioning complete"');

  return lines.join('\n');
}

function generatePostgresSetup(appName, config) {
  const dbName = config?.name || `${appName}_db`;
  const dbUser = `tova_${appName}`;
  const lines = [];
  lines.push('if ! command -v psql &>/dev/null; then');
  lines.push('  echo "[tova] Installing PostgreSQL..."');
  lines.push('  apt-get update -qq');
  lines.push('  apt-get install -y -qq postgresql postgresql-contrib');
  lines.push('  systemctl enable postgresql');
  lines.push('  systemctl start postgresql');
  lines.push('fi');
  lines.push(`su - postgres -c "psql -tc \\"SELECT 1 FROM pg_roles WHERE rolname='${dbUser}'\\" | grep -q 1 || createuser ${dbUser}"`);
  lines.push(`su - postgres -c "psql -tc \\"SELECT 1 FROM pg_database WHERE datname='${dbName}'\\" | grep -q 1 || createdb -O ${dbUser} ${dbName}"`);
  return lines.join('\n');
}

function generateRedisSetup(appName, config) {
  const lines = [];
  lines.push('if ! command -v redis-server &>/dev/null; then');
  lines.push('  echo "[tova] Installing Redis..."');
  lines.push('  apt-get update -qq');
  lines.push('  apt-get install -y -qq redis-server');
  lines.push('  systemctl enable redis-server');
  lines.push('  systemctl start redis-server');
  lines.push('fi');
  if (config?.maxmemory) {
    lines.push(`redis-cli CONFIG SET maxmemory ${config.maxmemory}`);
  }
  return lines.join('\n');
}

/**
 * Generate a systemd service template for the app.
 */
export function generateSystemdService(appName, config) {
  const memoryMax = (config.memory || '512mb').replace('mb', 'M').replace('gb', 'G');
  const lines = [];
  lines.push('[Unit]');
  lines.push(`Description=Tova app: ${appName} (instance %i)`);
  lines.push('After=network.target');
  lines.push('Wants=network.target');
  lines.push('');
  lines.push('[Service]');
  lines.push('Type=simple');
  lines.push('User=tova');
  lines.push(`WorkingDirectory=/opt/tova/apps/${appName}/current`);
  lines.push(`ExecStart=/usr/local/bin/bun run app.server.js --port %i`);
  lines.push(`EnvironmentFile=/opt/tova/apps/${appName}/.env.production`);
  if (config.restart_on_failure !== false) {
    lines.push('Restart=on-failure');
    lines.push('RestartSec=5');
    lines.push('StartLimitBurst=5');
    lines.push('StartLimitIntervalSec=300');
  }
  lines.push(`MemoryMax=${memoryMax}`);
  lines.push('');
  lines.push('[Install]');
  lines.push('WantedBy=multi-user.target');
  return lines.join('\n');
}

/**
 * Generate a Caddy site block for the app.
 */
export function generateCaddyConfig(appName, opts) {
  const { domain, instances, ports, health, hasWebSocket } = opts;
  const upstreams = ports.map(p => `localhost:${p}`).join(' ');

  const lines = [];
  lines.push(`${domain} {`);
  lines.push(`    reverse_proxy ${upstreams} {`);
  if (instances > 1) {
    lines.push('        lb_policy round_robin');
  }
  if (health) {
    lines.push(`        health_uri ${health}`);
    lines.push('        health_interval 30s');
  }
  lines.push('    }');

  if (hasWebSocket) {
    lines.push('');
    lines.push('    @ws path /ws');
    lines.push(`    reverse_proxy @ws ${upstreams} {`);
    lines.push('        transport http {');
    lines.push('            versions h2c 1.1');
    lines.push('        }');
    lines.push('    }');
  }

  lines.push('}');
  return lines.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-provision.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deploy/provision.js tests/deploy-provision.test.js
git commit -m "feat(deploy): add provisioning script generator"
```

---

### Task 9: CLI Deploy Command

**Files:**
- Modify: `bin/tova.js`
- Create: `src/deploy/deploy.js`

This is the main `tova deploy` command that orchestrates SSH, provisioning, and deployment.

**Step 1: Write the failing test**

Create `tests/deploy-cli.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';

describe('Deploy CLI', () => {
  test('parseDeployArgs parses environment name', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(false);
    expect(args.rollback).toBe(false);
  });

  test('parseDeployArgs parses --plan flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--plan']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(true);
  });

  test('parseDeployArgs parses --rollback flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--rollback']);
    expect(args.envName).toBe('prod');
    expect(args.rollback).toBe(true);
  });

  test('parseDeployArgs parses --logs flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--logs']);
    expect(args.envName).toBe('prod');
    expect(args.logs).toBe(true);
  });

  test('parseDeployArgs parses --status flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--status']);
    expect(args.envName).toBe('prod');
    expect(args.status).toBe(true);
  });

  test('parseDeployArgs parses --setup-git flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--setup-git']);
    expect(args.envName).toBe('prod');
    expect(args.setupGit).toBe(true);
  });

  test('parseDeployArgs parses --remove flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--remove']);
    expect(args.envName).toBe('prod');
    expect(args.remove).toBe(true);
  });

  test('parseDeployArgs parses --list --server flags', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['--list', '--server', 'root@example.com']);
    expect(args.list).toBe(true);
    expect(args.server).toBe('root@example.com');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-cli.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/deploy/deploy.js`:

```javascript
// Deploy command implementation for the Tova CLI.
// Orchestrates build, SSH, provisioning, and app deployment.

import { resolve, join, basename } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { inferInfrastructure } from './infer.js';
import { generateProvisionScript, generateSystemdService, generateCaddyConfig } from './provision.js';

/**
 * Parse deploy command arguments.
 */
export function parseDeployArgs(args) {
  const result = {
    envName: null,
    plan: false,
    rollback: false,
    logs: false,
    status: false,
    ssh: false,
    setupGit: false,
    remove: false,
    list: false,
    server: null,
    since: null,
    instance: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--plan': result.plan = true; break;
      case '--rollback': result.rollback = true; break;
      case '--logs': result.logs = true; break;
      case '--status': result.status = true; break;
      case '--ssh': result.ssh = true; break;
      case '--setup-git': result.setupGit = true; break;
      case '--remove': result.remove = true; break;
      case '--list': result.list = true; break;
      case '--server': result.server = args[++i]; break;
      case '--since': result.since = args[++i]; break;
      case '--instance': result.instance = parseInt(args[++i], 10); break;
      default:
        if (!arg.startsWith('--') && !result.envName) {
          result.envName = arg;
        }
        break;
    }
  }

  return result;
}

/**
 * Run a command on the remote server via SSH.
 */
export function sshExec(server, command) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ssh', ['-o', 'StrictHostKeyChecking=accept-new', server, command], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; process.stdout.write(d); });
    proc.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`SSH command failed (exit ${code}): ${stderr}`));
    });
  });
}

/**
 * Upload a file to the remote server via SCP.
 */
export function scpUpload(server, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('scp', ['-r', '-o', 'StrictHostKeyChecking=accept-new', localPath, `${server}:${remotePath}`], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`SCP upload failed (exit ${code})`));
    });
  });
}

/**
 * Main deploy orchestrator.
 * Called by the CLI when `tova deploy <env>` is run.
 */
export async function deploy(ast, buildResult, deployArgs, projectDir) {
  const infra = inferInfrastructure(ast);
  const { server, domain } = infra;
  const appName = infra.name || basename(projectDir);

  if (deployArgs.plan) {
    printPlan(infra);
    return;
  }

  if (deployArgs.logs) {
    await sshExec(server, `journalctl -u 'tova-${appName}@*' -f --no-pager${deployArgs.since ? ` --since "${deployArgs.since}"` : ''}`);
    return;
  }

  if (deployArgs.status) {
    await sshExec(server, `systemctl status 'tova-${appName}@*' --no-pager && echo "---" && cat /opt/tova/apps/${appName}/.tova-manifest.json 2>/dev/null || echo "No manifest"`);
    return;
  }

  if (deployArgs.ssh) {
    const proc = spawn('ssh', [server], { stdio: 'inherit' });
    await new Promise((resolve) => proc.on('close', resolve));
    return;
  }

  if (deployArgs.rollback) {
    await rollback(server, appName);
    return;
  }

  // Full deploy flow
  console.log(`\n  Connecting to ${server}...`);

  // 1. Generate provisioning script
  const provisionScript = generateProvisionScript(infra);

  // 2. Generate manifest for change detection
  const manifestJson = JSON.stringify(infra, null, 2);
  const manifestHash = createHash('sha256').update(manifestJson).digest('hex').slice(0, 16);

  // 3. Check if infrastructure changed
  let infraChanged = true;
  try {
    const remoteHash = await sshExec(server, `cat /opt/tova/apps/${appName}/current/.tova-manifest-hash 2>/dev/null || echo "none"`);
    infraChanged = remoteHash.trim() !== manifestHash;
  } catch {
    infraChanged = true;
  }

  if (infraChanged) {
    console.log('  Provisioning server...');
    // Upload and run provision script
    const tmpScript = `/tmp/tova-provision-${appName}.sh`;
    await scpUpload(server, '-', tmpScript); // TODO: write script to temp file first
    await sshExec(server, `bash ${tmpScript}`);
  } else {
    console.log('  Infrastructure: no changes');
  }

  // 4. Determine next version
  let version;
  try {
    const versions = await sshExec(server, `ls /opt/tova/apps/${appName}/releases/ 2>/dev/null || echo ""`);
    const existing = versions.trim().split('\n').filter(v => v.startsWith('v')).map(v => parseInt(v.slice(1)));
    version = existing.length > 0 ? `v${Math.max(...existing) + 1}` : 'v1';
  } catch {
    version = 'v1';
  }

  console.log(`  Deploying app (${version})...`);

  // 5. Upload bundle
  const releaseDir = `/opt/tova/apps/${appName}/releases/${version}`;
  await sshExec(server, `mkdir -p ${releaseDir}`);
  // Upload build output
  const buildDir = join(projectDir, '.tova-out');
  await scpUpload(server, buildDir + '/', releaseDir);
  // Write manifest
  await sshExec(server, `echo '${manifestHash}' > ${releaseDir}/.tova-manifest-hash`);
  await sshExec(server, `cat > ${releaseDir}/.tova-manifest.json << 'EOF'\n${manifestJson}\nEOF`);

  // 6. Flip symlink
  await sshExec(server, `ln -sfn ${releaseDir} /opt/tova/apps/${appName}/current`);

  // 7. Restart services
  console.log('  Restarting app...');
  for (let i = 0; i < infra.instances; i++) {
    const port = 3000 + i; // TODO: get from registry
    await sshExec(server, `systemctl restart tova-${appName}@${port}.service`);
  }

  // 8. Health check
  if (infra.health) {
    console.log('  Running health check...');
    try {
      await sshExec(server, `sleep 2 && curl -sf http://localhost:3000${infra.health} > /dev/null`);
      console.log(`\n  ✓ Live at https://${domain} (${version})\n`);
    } catch {
      console.log(`\n  ✗ Health check failed, rolling back...`);
      await rollback(server, appName);
    }
  } else {
    console.log(`\n  ✓ Live at https://${domain} (${version})\n`);
  }

  // 9. Prune old releases
  const keepReleases = infra.keep_releases || 5;
  await sshExec(server, `cd /opt/tova/apps/${appName}/releases && ls -1d v* | sort -V | head -n -${keepReleases} | xargs -r rm -rf`);
}

async function rollback(server, appName) {
  console.log(`  Rolling back ${appName}...`);
  const current = await sshExec(server, `readlink /opt/tova/apps/${appName}/current`);
  const currentVersion = basename(current.trim());
  const versions = await sshExec(server, `ls -1d /opt/tova/apps/${appName}/releases/v* | sort -V`);
  const versionList = versions.trim().split('\n');
  const currentIdx = versionList.findIndex(v => v.endsWith(currentVersion));

  if (currentIdx <= 0) {
    console.log('  No previous version to roll back to');
    return;
  }

  const previousRelease = versionList[currentIdx - 1];
  const previousVersion = basename(previousRelease);
  await sshExec(server, `ln -sfn ${previousRelease} /opt/tova/apps/${appName}/current`);
  await sshExec(server, `systemctl restart 'tova-${appName}@*'`);
  console.log(`  ✓ Rolled back to ${previousVersion}`);
}

function printPlan(infra) {
  console.log(`\n  Deploy plan for "${infra.name}" → ${infra.server}`);
  console.log('  ' + '─'.repeat(45));
  console.log(`\n  System:    ${infra.requires.bun ? 'Bun' : ''}${infra.requires.caddy ? ', Caddy' : ''}${infra.requires.ufw ? ', UFW' : ''}`);
  if (infra.databases.length > 0) {
    console.log(`  Database:  ${infra.databases.map(d => d.engine).join(', ')}`);
  }
  console.log(`  App:       ${infra.instances} instance${infra.instances > 1 ? 's' : ''}`);
  console.log(`  Domain:    ${infra.domain} (auto-SSL)`);
  if (infra.hasWebSocket) console.log('  WebSocket: enabled');
  if (infra.hasBrowser) console.log('  Static:    browser bundle served via Caddy');
  if (infra.requiredSecrets.length > 0) {
    console.log(`  Secrets:   ${infra.requiredSecrets.join(', ')}`);
  }
  if (Object.keys(infra.env).length > 0) {
    console.log(`  Env:       ${Object.entries(infra.env).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  console.log('');
}
```

Now wire into the CLI — modify `bin/tova.js`:

Add to the HELP string (after the `explain` command around line 73):

```
  deploy <env>     Deploy to a server (--plan, --rollback, --logs, --status, --ssh)
  env <env> <cmd>  Manage environment secrets (list, set KEY=value)
```

Add to the switch statement (around line 103, alongside other cases):

```javascript
case 'deploy':
  await deployProject(args.slice(1));
  break;
case 'env':
  await manageEnv(args.slice(1));
  break;
```

Add the `deployProject` function:

```javascript
async function deployProject(args) {
  const { parseDeployArgs, deploy: runDeploy } = await import('../src/deploy/deploy.js');
  const deployArgs = parseDeployArgs(args);

  // Build the project first
  const projectDir = process.cwd();
  const { ast, buildResult } = await buildForDeploy(projectDir, deployArgs.envName);

  await runDeploy(ast, buildResult, deployArgs, projectDir);
}

async function buildForDeploy(projectDir, envName) {
  // Compile the project to get the AST and build output
  const files = findTovaFiles(projectDir); // reuse existing file finder
  // ... parse + analyze + codegen (reuse buildProject logic)
  // Return { ast, buildResult }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-cli.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deploy/deploy.js tests/deploy-cli.test.js bin/tova.js
git commit -m "feat(deploy): add tova deploy CLI command"
```

---

### Task 10: Integrate Deploy Codegen into Main Codegen

**Files:**
- Modify: `src/codegen/codegen.js`

The main codegen needs to recognize deploy blocks but NOT generate JavaScript from them. Deploy blocks produce deployment artifacts, not runtime code. The codegen should collect them and pass them through in the output.

**Step 1: Write the failing test**

Add to `tests/deploy-codegen.test.js`:

```javascript
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function compile(code) {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return new CodeGenerator(ast).generate();
}

describe('Deploy Codegen Integration', () => {
  test('deploy blocks do not affect server/browser output', () => {
    const result = compile(`
      server {
        route GET "/hello" => fn() { "hello" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    expect(result.server).toContain('hello');
    // Deploy block should not produce JavaScript
    expect(result.server).not.toContain('root@example.com');
  });

  test('deploy blocks are available in output', () => {
    const result = compile(`
      server {
        route GET "/hello" => fn() { "hello" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    expect(result.deploy).toBeDefined();
    expect(result.deploy.prod.server).toBe('root@example.com');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/deploy-codegen.test.js`
Expected: FAIL — result.deploy is undefined

**Step 3: Write the implementation**

In `src/codegen/codegen.js`:

Add lazy loader at top (after line 36):

```javascript
let _DeployCodegen;
function getDeployCodegen() {
  if (!_DeployCodegen) _DeployCodegen = _require('./deploy-codegen.js').DeployCodegen;
  return _DeployCodegen;
}
```

In the `generate()` method, add after `const edgeBlocks = getBlocks('edge');` (around line 89):

```javascript
const deployBlocks = getBlocks('deploy');
```

Before the return statements (around lines 262-296), add deploy processing:

```javascript
// Generate deploy configs (one per named block)
const deploys = {};
if (deployBlocks.length > 0) {
  const Deploy = getDeployCodegen();
  const deployGroups = this._groupByName(deployBlocks);
  for (const [name, blocks] of deployGroups) {
    const key = name || 'default';
    deploys[key] = Deploy.mergeDeployBlocks(blocks);
  }
}
```

Add `deploy: Object.keys(deploys).length > 0 ? deploys : undefined,` to both return objects (the flat one around line 264 and the multi-block one around line 280).

**Step 4: Run test to verify it passes**

Run: `bun test tests/deploy-codegen.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/codegen/codegen.js tests/deploy-codegen.test.js
git commit -m "feat(deploy): integrate deploy codegen into main code generator"
```

---

### Task 11: End-to-End Parser Test

**Files:**
- Modify: `tests/deploy-block.test.js`

Full round-trip: source → parse → analyze → codegen → verify deploy config in output.

**Step 1: Write the test**

Add to `tests/deploy-block.test.js`:

```javascript
import { CodeGenerator } from '../src/codegen/codegen.js';

describe('Deploy Block E2E', () => {
  test('full round-trip: parse → analyze → codegen', () => {
    const code = `
      shared {
        type User {
          id: Int
          name: String
        }
      }

      server {
        route GET "/api/users" => fn() { [] }
      }

      browser {
        state users = []
      }

      deploy "prod" {
        server: "root@prod.example.com"
        domain: "myapp.com"
        instances: 2
        memory: "1gb"
        health: "/healthz"
      }

      deploy "staging" {
        server: "root@staging.example.com"
        domain: "staging.myapp.com"
      }
    `;

    const ast = parse(code);

    // Parser produced correct blocks
    const deployBlocks = ast.body.filter(n => n.type === 'DeployBlock');
    expect(deployBlocks).toHaveLength(2);

    // Analyzer passes (no errors for valid deploy blocks)
    const analyzer = new Analyzer(ast);
    const errors = analyzer.analyze();
    const deployErrors = errors.filter(e => e.message?.includes('deploy') || e.message?.includes('Deploy'));
    expect(deployErrors).toHaveLength(0);

    // Codegen includes deploy config
    const gen = new CodeGenerator(ast);
    const result = gen.generate();
    expect(result.deploy).toBeDefined();
    expect(result.deploy.prod.server).toBe('root@prod.example.com');
    expect(result.deploy.prod.domain).toBe('myapp.com');
    expect(result.deploy.prod.instances).toBe(2);
    expect(result.deploy.staging.server).toBe('root@staging.example.com');
    expect(result.deploy.staging.domain).toBe('staging.myapp.com');
    expect(result.deploy.staging.instances).toBe(1); // default

    // Server and browser output still work
    expect(result.server).toContain('/api/users');
    expect(result.browser).toBeTruthy();
  });
});
```

**Step 2: Run test**

Run: `bun test tests/deploy-block.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/deploy-block.test.js
git commit -m "test(deploy): add end-to-end deploy block test"
```

---

### Task 12: Run Full Test Suite

Verify nothing is broken across the entire codebase.

**Step 1: Run all tests**

```bash
bun test
```

Expected: All existing tests pass. New deploy tests pass. The block-registry test expects 11 plugins.

**Step 2: Fix any regressions**

If any existing tests fail, fix them. Common issues:
- `block-registry.test.js` expects 10 plugins → update to 11
- Snapshot tests that enumerate block types → add 'deploy'
- Parser tests that count top-level block types → update counts

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: update existing tests for deploy block integration"
```

---

### Summary of Implementation Files

**New files (8):**
- `src/parser/deploy-ast.js` — AST node definitions
- `src/parser/deploy-parser.js` — Parser for deploy block syntax
- `src/registry/plugins/deploy-plugin.js` — BlockRegistry plugin
- `src/analyzer/deploy-analyzer.js` — Validation
- `src/codegen/deploy-codegen.js` — Manifest generation
- `src/deploy/infer.js` — Infrastructure inference engine
- `src/deploy/provision.js` — Shell script generator
- `src/deploy/deploy.js` — CLI deploy command

**Modified files (4):**
- `src/parser/ast.js` — Re-export deploy AST nodes
- `src/registry/register-all.js` — Register deploy plugin
- `src/codegen/codegen.js` — Integrate deploy codegen
- `bin/tova.js` — Add `deploy` and `env` commands

**Test files (5):**
- `tests/deploy-block.test.js` — Parser + E2E tests
- `tests/deploy-codegen.test.js` — Codegen tests
- `tests/deploy-infer.test.js` — Infrastructure inference tests
- `tests/deploy-provision.test.js` — Provisioning script tests
- `tests/deploy-cli.test.js` — CLI argument parsing tests
- `tests/block-registry.test.js` — Updated for 11 plugins
