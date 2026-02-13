import { BaseCodegen } from './base-codegen.js';

export class ServerCodegen extends BaseCodegen {
  _astUsesIdentifier(blocks, name) {
    const search = (node) => {
      if (!node || typeof node !== 'object') return false;
      if (node.type === 'Identifier' && node.name === name) return true;
      if (node.type === 'MemberExpression' && node.object && node.object.type === 'Identifier' && node.object.name === name) return true;
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'type') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (search(item)) return true;
          }
        } else if (val && typeof val === 'object' && val.type) {
          if (search(val)) return true;
        }
      }
      return false;
    };
    for (const block of blocks) {
      if (search(block)) return true;
    }
    return false;
  }

  _genValidationCode(params, indent = '  ') {
    const checks = [];
    for (const p of params) {
      const name = p.name;
      const ta = p.typeAnnotation;
      if (!ta) continue;
      const hasRequiredCheck = !p.defaultValue;
      if (hasRequiredCheck) {
        checks.push(`${indent}if (${name} === undefined || ${name} === null) __validationErrors.push("${name} is required");`);
      }
      const typeCheckPrefix = hasRequiredCheck ? 'else if' : 'if';
      if (ta.type === 'TypeAnnotation') {
        switch (ta.name) {
          case 'String':
            checks.push(`${indent}${typeCheckPrefix} (typeof ${name} !== "string") __validationErrors.push("${name} must be a string");`);
            break;
          case 'Int':
            checks.push(`${indent}${typeCheckPrefix} (!Number.isInteger(${name})) __validationErrors.push("${name} must be an integer");`);
            break;
          case 'Float':
            checks.push(`${indent}${typeCheckPrefix} (typeof ${name} !== "number") __validationErrors.push("${name} must be a number");`);
            break;
          case 'Bool':
            checks.push(`${indent}${typeCheckPrefix} (typeof ${name} !== "boolean") __validationErrors.push("${name} must be a boolean");`);
            break;
        }
      } else if (ta.type === 'ArrayTypeAnnotation') {
        checks.push(`${indent}${typeCheckPrefix} (!Array.isArray(${name})) __validationErrors.push("${name} must be an array");`);
      }
    }
    return checks;
  }

  _genAdvancedValidationCode(schemaExpr, indent = '  ') {
    const checks = [];
    if (schemaExpr.type !== 'ObjectLiteral') return checks;
    for (const prop of schemaExpr.properties) {
      const fieldName = prop.key.type === 'Identifier' ? prop.key.name : (prop.key.type === 'StringLiteral' ? prop.key.value : null);
      if (!fieldName) continue;
      const rules = prop.value;
      if (rules.type !== 'ObjectLiteral') continue;
      for (const rule of rules.properties) {
        const ruleKey = rule.key.type === 'Identifier' ? rule.key.name : (rule.key.type === 'StringLiteral' ? rule.key.value : null);
        if (!ruleKey) continue;
        const ruleVal = this.genExpression(rule.value);
        switch (ruleKey) {
          case 'required':
            checks.push(`${indent}if (${ruleVal} && (__body.${fieldName} === undefined || __body.${fieldName} === null || __body.${fieldName} === "")) __validationErrors.push("${fieldName} is required");`);
            break;
          case 'min_length':
            checks.push(`${indent}if (__body.${fieldName} !== undefined && __body.${fieldName} !== null && String(__body.${fieldName}).length < ${ruleVal}) __validationErrors.push("${fieldName} must be at least ${ruleVal} characters");`);
            break;
          case 'max_length':
            checks.push(`${indent}if (__body.${fieldName} !== undefined && __body.${fieldName} !== null && String(__body.${fieldName}).length > ${ruleVal}) __validationErrors.push("${fieldName} must be at most ${ruleVal} characters");`);
            break;
          case 'min':
            checks.push(`${indent}if (__body.${fieldName} !== undefined && __body.${fieldName} !== null && Number(__body.${fieldName}) < ${ruleVal}) __validationErrors.push("${fieldName} must be at least ${ruleVal}");`);
            break;
          case 'max':
            checks.push(`${indent}if (__body.${fieldName} !== undefined && __body.${fieldName} !== null && Number(__body.${fieldName}) > ${ruleVal}) __validationErrors.push("${fieldName} must be at most ${ruleVal}");`);
            break;
          case 'pattern':
            checks.push(`${indent}if (__body.${fieldName} !== undefined && __body.${fieldName} !== null && !new RegExp(${ruleVal}).test(String(__body.${fieldName}))) __validationErrors.push("${fieldName} does not match required pattern");`);
            break;
          case 'one_of':
            checks.push(`${indent}if (__body.${fieldName} !== undefined && __body.${fieldName} !== null && !${ruleVal}.includes(__body.${fieldName})) __validationErrors.push("${fieldName} must be one of: " + ${ruleVal}.join(", "));`);
            break;
        }
      }
    }
    return checks;
  }

  // Emit handler call, optionally wrapped in Promise.race for timeout
  _emitHandlerCall(lines, callExpr, timeoutMs) {
    if (timeoutMs) {
      lines.push(`  let __result;`);
      lines.push(`  try {`);
      lines.push(`    __result = await Promise.race([`);
      lines.push(`      ${callExpr},`);
      lines.push(`      new Promise((_, rej) => setTimeout(() => rej(new Error("__timeout__")), ${timeoutMs}))`);
      lines.push(`    ]);`);
      lines.push(`  } catch (__err) {`);
      lines.push(`    if (__err.message === "__timeout__") return Response.json({ error: "Gateway Timeout" }, { status: 504 });`);
      lines.push(`    throw __err;`);
      lines.push(`  }`);
    } else {
      lines.push(`  const __result = await ${callExpr};`);
    }
  }

  generate(serverBlocks, sharedCode, blockName = null, peerBlocks = null, sharedBlocks = []) {
    const lines = [];

    // Shared code
    if (sharedCode.trim()) {
      lines.push('// ── Shared ──');
      lines.push(sharedCode);
      lines.push('');
    }

    // Collect all declarations from blocks (including route group flattening)
    const routes = [];
    const functions = [];
    const middlewares = [];
    const otherStatements = [];
    let healthPath = null;
    let corsConfig = null;
    let errorHandler = null;
    let wsDecl = null;
    let staticDecl = null;
    let authConfig = null;
    let maxBodyLimit = null;
    const discoverMap = new Map();
    let rateLimitConfig = null;
    const onStartHooks = [];
    const onStopHooks = [];
    const subscriptions = [];
    const envDecls = [];
    const schedules = [];
    let uploadConfig = null;
    let sessionConfig = null;
    let dbConfig = null;
    let tlsConfig = null;
    let compressionConfig = null;
    const backgroundJobs = [];
    let cacheConfig = null;
    const sseDecls = [];
    const modelDecls = [];

    const collectFromBody = (stmts, groupPrefix = null, groupMiddlewares = []) => {
      for (const stmt of stmts) {
        if (stmt.type === 'RouteDeclaration') {
          const route = stmt;
          if (groupPrefix) {
            const prefixedRoute = {
              ...route,
              path: groupPrefix + route.path,
              _groupMiddlewares: groupMiddlewares.length > 0 ? [...groupMiddlewares] : undefined,
            };
            routes.push(prefixedRoute);
          } else {
            routes.push(route);
          }
        } else if (stmt.type === 'FunctionDeclaration') {
          functions.push(stmt);
        } else if (stmt.type === 'MiddlewareDeclaration') {
          if (groupPrefix !== null) {
            groupMiddlewares.push(stmt.name);
          }
          middlewares.push(stmt);
        } else if (stmt.type === 'HealthCheckDeclaration') {
          healthPath = stmt.path;
        } else if (stmt.type === 'CorsDeclaration') {
          corsConfig = stmt.config;
        } else if (stmt.type === 'ErrorHandlerDeclaration') {
          errorHandler = stmt;
        } else if (stmt.type === 'WebSocketDeclaration') {
          wsDecl = stmt;
        } else if (stmt.type === 'StaticDeclaration') {
          staticDecl = stmt;
        } else if (stmt.type === 'AuthDeclaration') {
          authConfig = stmt.config;
        } else if (stmt.type === 'MaxBodyDeclaration') {
          maxBodyLimit = stmt.limit;
        } else if (stmt.type === 'DiscoverDeclaration') {
          discoverMap.set(stmt.peerName, stmt);
        } else if (stmt.type === 'RouteGroupDeclaration') {
          const prefix = groupPrefix ? groupPrefix + stmt.prefix : stmt.prefix;
          const grpMw = [...groupMiddlewares]; // inherit parent group middlewares
          collectFromBody(stmt.body, prefix, grpMw);
        } else if (stmt.type === 'RateLimitDeclaration') {
          rateLimitConfig = stmt.config;
        } else if (stmt.type === 'LifecycleHookDeclaration') {
          if (stmt.hook === 'start') onStartHooks.push(stmt);
          else if (stmt.hook === 'stop') onStopHooks.push(stmt);
        } else if (stmt.type === 'SubscribeDeclaration') {
          subscriptions.push(stmt);
        } else if (stmt.type === 'EnvDeclaration') {
          envDecls.push(stmt);
        } else if (stmt.type === 'ScheduleDeclaration') {
          schedules.push(stmt);
        } else if (stmt.type === 'UploadDeclaration') {
          uploadConfig = stmt.config;
        } else if (stmt.type === 'SessionDeclaration') {
          sessionConfig = stmt.config;
        } else if (stmt.type === 'DbDeclaration') {
          dbConfig = stmt.config;
        } else if (stmt.type === 'TlsDeclaration') {
          tlsConfig = stmt.config;
        } else if (stmt.type === 'CompressionDeclaration') {
          compressionConfig = stmt.config;
        } else if (stmt.type === 'BackgroundJobDeclaration') {
          backgroundJobs.push(stmt);
        } else if (stmt.type === 'CacheDeclaration') {
          cacheConfig = stmt.config;
        } else if (stmt.type === 'SseDeclaration') {
          sseDecls.push(stmt);
        } else if (stmt.type === 'ModelDeclaration') {
          modelDecls.push(stmt);
        } else {
          otherStatements.push(stmt);
        }
      }
    };

    for (const block of serverBlocks) {
      collectFromBody(block.body);
    }

    // Collect type declarations from shared blocks for model/ORM generation
    const sharedTypes = new Map(); // typeName -> { fields: [{ name, type }] }
    for (const sb of sharedBlocks) {
      for (const stmt of sb.body) {
        if (stmt.type === 'TypeDeclaration' && stmt.variants) {
          const fields = [];
          for (const v of stmt.variants) {
            if (v.type === 'TypeField' && v.typeAnnotation) {
              fields.push({ name: v.name, type: v.typeAnnotation.name || (v.typeAnnotation.type === 'ArrayTypeAnnotation' ? 'Array' : 'Any') });
            }
          }
          if (fields.length > 0) {
            sharedTypes.set(stmt.name, { fields });
          }
        }
      }
    }

    // Separate group-only middlewares from global middlewares
    const globalMiddlewares = [];
    const allMiddlewareNames = new Set();
    for (const block of serverBlocks) {
      for (const stmt of block.body) {
        if (stmt.type === 'MiddlewareDeclaration') {
          globalMiddlewares.push(stmt);
        }
      }
    }
    for (const mw of middlewares) {
      allMiddlewareNames.add(mw.name);
    }

    // Build function param lookup map
    const fnParamMap = new Map();
    const fnDeclMap = new Map();
    for (const fn of functions) {
      fnParamMap.set(fn.name, fn.params.map(p => p.name));
      fnDeclMap.set(fn.name, fn);
    }

    // Check if 'db' is used
    const usesDb = this._astUsesIdentifier(serverBlocks, 'db');

    // Check if rate limiting is needed
    const needsRateLimitStore = !!rateLimitConfig || routes.some(r => (r.decorators || []).some(d => d.name === 'rate_limit'));

    // ════════════════════════════════════════════════════════════
    // 1. Distributed Tracing
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Distributed Tracing ──');
    lines.push('import { AsyncLocalStorage } from "node:async_hooks";');
    lines.push('const __requestContext = new AsyncLocalStorage();');
    lines.push('function __getRequestId() {');
    lines.push('  const store = __requestContext.getStore();');
    lines.push('  return store ? store.rid : null;');
    lines.push('}');
    lines.push('function __getLocals() {');
    lines.push('  const store = __requestContext.getStore();');
    lines.push('  return store ? store.locals : {};');
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 2. Env Validation (F6) — fail fast
    // ════════════════════════════════════════════════════════════
    if (envDecls.length > 0) {
      lines.push('// ── Env Validation ──');
      for (const decl of envDecls) {
        const envName = decl.name;
        const ta = decl.typeAnnotation;
        const typeName = ta ? ta.name : 'String';
        lines.push(`const ${envName} = (() => {`);
        lines.push(`  const __raw = process.env.${envName};`);
        if (decl.defaultValue) {
          const defaultExpr = this.genExpression(decl.defaultValue);
          lines.push(`  if (__raw === undefined || __raw === "") return ${defaultExpr};`);
        } else {
          lines.push(`  if (__raw === undefined || __raw === "") { console.error("Required env var ${envName} is not set"); process.exit(1); }`);
        }
        switch (typeName) {
          case 'Int':
            lines.push(`  const __val = parseInt(__raw, 10);`);
            lines.push(`  if (isNaN(__val)) { console.error("env ${envName}: expected Int, got " + __raw); process.exit(1); }`);
            lines.push(`  return __val;`);
            break;
          case 'Float':
            lines.push(`  const __val = parseFloat(__raw);`);
            lines.push(`  if (isNaN(__val)) { console.error("env ${envName}: expected Float, got " + __raw); process.exit(1); }`);
            lines.push(`  return __val;`);
            break;
          case 'Bool':
            lines.push(`  return __raw === "true" || __raw === "1";`);
            break;
          default:
            lines.push(`  return __raw;`);
            break;
        }
        lines.push(`})();`);
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 3. Database (multi-driver: sqlite, postgres, mysql)
    // ════════════════════════════════════════════════════════════
    const dbDriver = dbConfig && dbConfig.driver ? (dbConfig.driver.value || 'sqlite') : 'sqlite';
    if (dbConfig || usesDb) {
      lines.push('// ── Database ──');
      if (dbDriver === 'postgres') {
        lines.push('import postgres from "postgres";');
        const urlExpr = dbConfig && dbConfig.url ? this.genExpression(dbConfig.url) : 'process.env.DATABASE_URL || "postgres://localhost:5432/app"';
        lines.push(`const __pg = postgres(${urlExpr});`);
        lines.push('const db = {');
        lines.push('  async query(sql, ...params) {');
        lines.push('    if (params.length > 0) { return __pg.unsafe(sql, params); }');
        lines.push('    return __pg.unsafe(sql);');
        lines.push('  },');
        lines.push('  async run(sql, ...params) {');
        lines.push('    if (params.length > 0) { return __pg.unsafe(sql, params); }');
        lines.push('    return __pg.unsafe(sql);');
        lines.push('  },');
        lines.push('  async get(sql, ...params) {');
        lines.push('    const rows = params.length > 0 ? await __pg.unsafe(sql, params) : await __pg.unsafe(sql);');
        lines.push('    return rows[0] || null;');
        lines.push('  },');
        lines.push('  async exec(sql) { return __pg.unsafe(sql); },');
        lines.push('  async transaction(fn) {');
        lines.push('    return __pg.begin(sql => fn({ query: (s, ...p) => sql.unsafe(s, p), run: (s, ...p) => sql.unsafe(s, p), get: async (s, ...p) => { const r = await sql.unsafe(s, p); return r[0] || null; }, exec: (s) => sql.unsafe(s) }));');
        lines.push('  },');
        lines.push('  async migrate(migrations) {');
        lines.push('    await __pg.unsafe(`CREATE TABLE IF NOT EXISTS __migrations (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ DEFAULT NOW())`);');
        lines.push('    const applied = new Set((await __pg.unsafe("SELECT name FROM __migrations")).map(r => r.name));');
        lines.push('    for (const m of migrations) {');
        lines.push('      if (!applied.has(m.name)) {');
        lines.push('        await __pg.unsafe(m.up);');
        lines.push('        await __pg.unsafe("INSERT INTO __migrations (name) VALUES ($1)", [m.name]);');
        lines.push('        console.log(`Migration applied: ${m.name}`);');
        lines.push('      }');
        lines.push('    }');
        lines.push('  },');
        lines.push('  async close() { await __pg.end(); },');
        lines.push('};');
      } else if (dbDriver === 'mysql') {
        lines.push('import mysql from "mysql2/promise";');
        const urlExpr = dbConfig && dbConfig.url ? this.genExpression(dbConfig.url) : 'process.env.DATABASE_URL || "mysql://localhost:3306/app"';
        lines.push(`const __mysqlPool = mysql.createPool(${urlExpr});`);
        lines.push('const db = {');
        lines.push('  async query(sql, ...params) {');
        lines.push('    const [rows] = await __mysqlPool.execute(sql, params);');
        lines.push('    return rows;');
        lines.push('  },');
        lines.push('  async run(sql, ...params) {');
        lines.push('    const [result] = await __mysqlPool.execute(sql, params);');
        lines.push('    return result;');
        lines.push('  },');
        lines.push('  async get(sql, ...params) {');
        lines.push('    const [rows] = await __mysqlPool.execute(sql, params);');
        lines.push('    return rows[0] || null;');
        lines.push('  },');
        lines.push('  async exec(sql) { const [r] = await __mysqlPool.query(sql); return r; },');
        lines.push('  async transaction(fn) {');
        lines.push('    const conn = await __mysqlPool.getConnection();');
        lines.push('    await conn.beginTransaction();');
        lines.push('    try {');
        lines.push('      const result = await fn({ query: async (s, ...p) => { const [r] = await conn.execute(s, p); return r; }, run: async (s, ...p) => { const [r] = await conn.execute(s, p); return r; }, get: async (s, ...p) => { const [r] = await conn.execute(s, p); return r[0] || null; }, exec: async (s) => { const [r] = await conn.query(s); return r; } });');
        lines.push('      await conn.commit();');
        lines.push('      return result;');
        lines.push('    } catch (e) { await conn.rollback(); throw e; }');
        lines.push('    finally { conn.release(); }');
        lines.push('  },');
        lines.push('  async migrate(migrations) {');
        lines.push('    await __mysqlPool.query(`CREATE TABLE IF NOT EXISTS __migrations (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);');
        lines.push('    const [applied] = await __mysqlPool.query("SELECT name FROM __migrations");');
        lines.push('    const appliedSet = new Set(applied.map(r => r.name));');
        lines.push('    for (const m of migrations) {');
        lines.push('      if (!appliedSet.has(m.name)) {');
        lines.push('        await __mysqlPool.query(m.up);');
        lines.push('        await __mysqlPool.execute("INSERT INTO __migrations (name) VALUES (?)", [m.name]);');
        lines.push('        console.log(`Migration applied: ${m.name}`);');
        lines.push('      }');
        lines.push('    }');
        lines.push('  },');
        lines.push('  async close() { await __mysqlPool.end(); },');
        lines.push('};');
      } else {
        // Default: SQLite
        lines.push('import { Database } from "bun:sqlite";');
        const pathExpr = dbConfig && dbConfig.path ? this.genExpression(dbConfig.path) : '":memory:"';
        lines.push(`const __db = new Database(${pathExpr});`);
        const walEnabled = dbConfig && dbConfig.wal ? this.genExpression(dbConfig.wal) : 'true';
        lines.push(`if (${walEnabled}) __db.exec("PRAGMA journal_mode=WAL");`);
        lines.push('__db.exec("PRAGMA foreign_keys=ON");');
        lines.push('const db = {');
        lines.push('  query(sql, ...params) {');
        lines.push('    const stmt = __db.prepare(sql);');
        lines.push('    return stmt.all(...params);');
        lines.push('  },');
        lines.push('  run(sql, ...params) {');
        lines.push('    const stmt = __db.prepare(sql);');
        lines.push('    return stmt.run(...params);');
        lines.push('  },');
        lines.push('  get(sql, ...params) {');
        lines.push('    const stmt = __db.prepare(sql);');
        lines.push('    return stmt.get(...params);');
        lines.push('  },');
        lines.push('  exec(sql) { return __db.exec(sql); },');
        lines.push('  transaction(fn) {');
        lines.push('    return __db.transaction(fn)();');
        lines.push('  },');
        lines.push('  migrate(migrations) {');
        lines.push('    __db.exec(`CREATE TABLE IF NOT EXISTS __migrations (');
        lines.push('      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT DEFAULT (datetime(\'now\'))');
        lines.push('    )`);');
        lines.push('    const applied = new Set(__db.prepare("SELECT name FROM __migrations").all().map(r => r.name));');
        lines.push('    for (const m of migrations) {');
        lines.push('      if (!applied.has(m.name)) {');
        lines.push('        __db.exec(m.up);');
        lines.push('        __db.prepare("INSERT INTO __migrations (name) VALUES (?)").run(m.name);');
        lines.push('        console.log(`Migration applied: ${m.name}`);');
        lines.push('      }');
        lines.push('    }');
        lines.push('  },');
        lines.push('  close() { __db.close(); },');
        lines.push('};');
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 4. Peer Server RPC Proxies (with circuit breaker + retry)
    // ════════════════════════════════════════════════════════════
    if (peerBlocks && peerBlocks.size > 0) {
      lines.push('// ── Circuit Breaker + Retry ──');
      lines.push('class __CircuitBreaker {');
      lines.push('  constructor(name, threshold = 5, resetTimeout = 30000) {');
      lines.push('    this.name = name;');
      lines.push('    this.state = "CLOSED";');
      lines.push('    this.failures = 0;');
      lines.push('    this.threshold = threshold;');
      lines.push('    this.resetTimeout = resetTimeout;');
      lines.push('    this.nextAttempt = 0;');
      lines.push('  }');
      lines.push('  async call(fn) {');
      lines.push('    if (this.state === "OPEN") {');
      lines.push('      if (Date.now() < this.nextAttempt) {');
      lines.push('        throw new Error(`Circuit breaker OPEN for ${this.name}`);');
      lines.push('      }');
      lines.push('      this.state = "HALF_OPEN";');
      lines.push('    }');
      lines.push('    try {');
      lines.push('      const result = await fn();');
      lines.push('      this.failures = 0;');
      lines.push('      this.state = "CLOSED";');
      lines.push('      return result;');
      lines.push('    } catch (err) {');
      lines.push('      this.failures++;');
      lines.push('      if (this.failures >= this.threshold) {');
      lines.push('        this.state = "OPEN";');
      lines.push('        this.nextAttempt = Date.now() + this.resetTimeout;');
      lines.push('      }');
      lines.push('      throw err;');
      lines.push('    }');
      lines.push('  }');
      lines.push('}');
      lines.push('');
      lines.push('async function __retryWithBackoff(fn, retries = 2, baseDelay = 100) {');
      lines.push('  for (let i = 0; i <= retries; i++) {');
      lines.push('    try { return await fn(); } catch (err) {');
      lines.push('      if (i === retries) throw err;');
      lines.push('      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));');
      lines.push('    }');
      lines.push('  }');
      lines.push('}');
      lines.push('');

      lines.push('// ── Peer Server RPC Proxies ──');
      for (const [peerName, peerFunctions] of peerBlocks) {
        const portVar = `PORT_${peerName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const disc = discoverMap.get(peerName);
        const cbThreshold = disc && disc.config && disc.config.threshold ? this.genExpression(disc.config.threshold) : '5';
        const cbReset = disc && disc.config && disc.config.reset_timeout ? this.genExpression(disc.config.reset_timeout) : '30000';
        const rpcTimeout = disc && disc.config && disc.config.timeout ? this.genExpression(disc.config.timeout) : '10000';
        lines.push(`const __cb_${peerName} = new __CircuitBreaker("${peerName}", ${cbThreshold}, ${cbReset});`);

        let baseUrlExpr;
        if (disc) {
          baseUrlExpr = this.genExpression(disc.urlExpression);
        } else {
          baseUrlExpr = `(process.env.${portVar} ? \`http://localhost:\${process.env.${portVar}}\` : "http://localhost:3000")`;
        }

        lines.push(`const ${peerName} = {`);
        lines.push(`  __baseUrl: ${baseUrlExpr},`);
        for (const fnName of peerFunctions) {
          lines.push(`  async ${fnName}(...args) {`);
          lines.push(`    return __cb_${peerName}.call(() => __retryWithBackoff(async () => {`);
          lines.push(`      const __controller = new AbortController();`);
          lines.push(`      const __timeout = setTimeout(() => __controller.abort(), ${rpcTimeout});`);
          lines.push(`      try {`);
          lines.push(`        const __res = await fetch(\`\${${peerName}.__baseUrl}/rpc/${fnName}\`, {`);
          lines.push(`          method: 'POST',`);
          lines.push(`          headers: { 'Content-Type': 'application/json', 'X-Request-Id': __getRequestId() || '' },`);
          lines.push(`          body: JSON.stringify({ __args: args }),`);
          lines.push(`          signal: __controller.signal,`);
          lines.push(`        });`);
          lines.push(`        if (!__res.ok) throw new Error(\`RPC ${peerName}.${fnName} failed: \${__res.status}\`);`);
          lines.push(`        return (await __res.json()).result;`);
          lines.push(`      } catch (__err) {`);
          lines.push(`        if (__err.name === 'AbortError') throw new Error(\`RPC ${peerName}.${fnName} timed out\`);`);
          lines.push(`        throw __err;`);
          lines.push(`      } finally {`);
          lines.push(`        clearTimeout(__timeout);`);
          lines.push(`      }`);
          lines.push(`    }));`);
          lines.push(`  },`);
        }
        lines.push(`};`);
        lines.push('');
      }
    }

    // ════════════════════════════════════════════════════════════
    // 5. Runtime Helpers (respond, cookies)
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Runtime Helpers ──');
    lines.push('function respond(status, body, headers = {}) {');
    lines.push('  const __hasContentType = Object.keys(headers).some(k => k.toLowerCase() === "content-type");');
    lines.push('  if (__hasContentType) {');
    lines.push('    const data = typeof body === "string" ? body : JSON.stringify(body);');
    lines.push('    return new Response(data, { status, headers });');
    lines.push('  }');
    lines.push('  return new Response(JSON.stringify(body), {');
    lines.push('    status,');
    lines.push('    headers: { "Content-Type": "application/json", ...headers },');
    lines.push('  });');
    lines.push('}');
    lines.push('');

    lines.push('function __parseQuery(searchParams) {');
    lines.push('  const q = {};');
    lines.push('  for (const [k, v] of searchParams) {');
    lines.push('    if (q[k] !== undefined) {');
    lines.push('      if (!Array.isArray(q[k])) q[k] = [q[k]];');
    lines.push('      q[k].push(v);');
    lines.push('    } else { q[k] = v; }');
    lines.push('  }');
    lines.push('  return q;');
    lines.push('}');
    lines.push('function __parseCookies(str) {');
    lines.push('  const c = {};');
    lines.push('  if (!str) return c;');
    lines.push('  for (const pair of str.split(";")) {');
    lines.push('    const [k, ...v] = pair.trim().split("=");');
    lines.push('    if (k) c[k.trim()] = v.join("=").trim();');
    lines.push('  }');
    lines.push('  return c;');
    lines.push('}');
    lines.push('');
    lines.push('async function __readBodyBytes(req) {');
    lines.push('  if (!req.body) return new Uint8Array(0);');
    lines.push('  const reader = req.body.getReader();');
    lines.push('  const chunks = [];');
    lines.push('  let totalBytes = 0;');
    lines.push('  while (true) {');
    lines.push('    const { done, value } = await reader.read();');
    lines.push('    if (done) break;');
    lines.push('    totalBytes += value.byteLength;');
    lines.push('    if (totalBytes > __maxBodySize) throw new Error("__BODY_TOO_LARGE__");');
    lines.push('    chunks.push(value);');
    lines.push('  }');
    lines.push('  const result = new Uint8Array(totalBytes);');
    lines.push('  let offset = 0;');
    lines.push('  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }');
    lines.push('  return result;');
    lines.push('}');
    lines.push('async function __parseBody(req) {');
    lines.push('  const ct = (req.headers.get("content-type") || "").toLowerCase();');
    lines.push('  if (ct.includes("multipart/form-data")) {');
    lines.push('    try {');
    lines.push('      const fd = await req.formData();');
    lines.push('      const obj = {};');
    lines.push('      for (const [k, v] of fd) {');
    lines.push('        if (obj[k] !== undefined) {');
    lines.push('          if (!Array.isArray(obj[k])) obj[k] = [obj[k]];');
    lines.push('          obj[k].push(v);');
    lines.push('        } else { obj[k] = v; }');
    lines.push('      }');
    lines.push('      return obj;');
    lines.push('    } catch { return null; }');
    lines.push('  }');
    lines.push('  const raw = await __readBodyBytes(req);');
    lines.push('  const text = new TextDecoder().decode(raw);');
    lines.push('  if (ct.includes("application/x-www-form-urlencoded")) {');
    lines.push('    try {');
    lines.push('      const sp = new URLSearchParams(text);');
    lines.push('      const obj = {};');
    lines.push('      for (const [k, v] of sp) {');
    lines.push('        if (obj[k] !== undefined) {');
    lines.push('          if (!Array.isArray(obj[k])) obj[k] = [obj[k]];');
    lines.push('          obj[k].push(v);');
    lines.push('        } else { obj[k] = v; }');
    lines.push('      }');
    lines.push('      return obj;');
    lines.push('    } catch { return null; }');
    lines.push('  }');
    lines.push('  try { return JSON.parse(text); } catch { return null; }');
    lines.push('}');

    // ════════════════════════════════════════════════════════════
    // 6. Response Helpers (F4) — redirect, set_cookie, stream
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Response Helpers ──');
    lines.push('function redirect(url, status = 302) {');
    lines.push('  return new Response(null, { status, headers: { Location: url } });');
    lines.push('}');
    lines.push('function set_cookie(name, value, options = {}) {');
    lines.push('  let cookie = `${name}=${encodeURIComponent(value)}`;');
    lines.push('  if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;');
    lines.push('  if (options.path) cookie += `; Path=${options.path}`;');
    lines.push('  if (options.domain) cookie += `; Domain=${options.domain}`;');
    lines.push('  if (options.httpOnly) cookie += "; HttpOnly";');
    lines.push('  if (options.secure) cookie += "; Secure";');
    lines.push('  if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;');
    lines.push('  return cookie;');
    lines.push('}');
    lines.push('function stream(fn) {');
    lines.push('  const readable = new ReadableStream({');
    lines.push('    start(controller) {');
    lines.push('      const send = (data) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\\n\\n`));');
    lines.push('      const close = () => controller.close();');
    lines.push('      fn(send, close);');
    lines.push('    }');
    lines.push('  });');
    lines.push('  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });');
    lines.push('}');
    lines.push('function sse(fn) {');
    lines.push('  let cancelled = false;');
    lines.push('  const readable = new ReadableStream({');
    lines.push('    async start(controller) {');
    lines.push('      const send = (data, event) => {');
    lines.push('        if (cancelled) return;');
    lines.push('        let msg = "";');
    lines.push('        if (event) msg += `event: ${event}\\n`;');
    lines.push('        msg += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\\n\\n`;');
    lines.push('        controller.enqueue(new TextEncoder().encode(msg));');
    lines.push('      };');
    lines.push('      const close = () => { cancelled = true; controller.close(); };');
    lines.push('      await fn(send, close);');
    lines.push('    },');
    lines.push('    cancel() { cancelled = true; }');
    lines.push('  });');
    lines.push('  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });');
    lines.push('}');
    lines.push('function html(body, status = 200, headers = {}) {');
    lines.push('  return new Response(body, { status, headers: { "Content-Type": "text/html", ...headers } });');
    lines.push('}');
    lines.push('function text(body, status = 200, headers = {}) {');
    lines.push('  return new Response(body, { status, headers: { "Content-Type": "text/plain", ...headers } });');
    lines.push('}');
    lines.push('function with_headers(response, headers) {');
    lines.push('  const h = new Headers(response.headers);');
    lines.push('  for (const [k, v] of Object.entries(headers)) h.set(k, v);');
    lines.push('  return new Response(response.body, { status: response.status, headers: h });');
    lines.push('}');
    lines.push('');

    // ── Auth Builtins: sign_jwt, hash_password, verify_password ──
    lines.push('// ── Auth Builtins ──');
    lines.push('let __jwtSignKey = null;');
    lines.push('async function sign_jwt(payload, secret, options = {}) {');
    lines.push('  const __secret = secret || (typeof __authSecret !== "undefined" ? __authSecret : "secret");');
    lines.push('  if (!__jwtSignKey || __secret !== (typeof __authSecret !== "undefined" ? __authSecret : "")) {');
    lines.push('    __jwtSignKey = await crypto.subtle.importKey(');
    lines.push('      "raw", new TextEncoder().encode(__secret),');
    lines.push('      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]');
    lines.push('    );');
    lines.push('  }');
    lines.push('  const header = { alg: "HS256", typ: "JWT" };');
    lines.push('  const now = Math.floor(Date.now() / 1000);');
    lines.push('  const claims = { ...payload, iat: now };');
    lines.push('  if (options.expires_in) claims.exp = now + options.expires_in;');
    lines.push('  if (options.exp) claims.exp = options.exp;');
    lines.push('  const __b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");');
    lines.push('  const __headerB64 = __b64url(header);');
    lines.push('  const __payloadB64 = __b64url(claims);');
    lines.push('  const __sigData = __headerB64 + "." + __payloadB64;');
    lines.push('  const __sig = await crypto.subtle.sign("HMAC", __jwtSignKey, new TextEncoder().encode(__sigData));');
    lines.push('  const __sigB64 = btoa(String.fromCharCode(...new Uint8Array(__sig))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");');
    lines.push('  return __sigData + "." + __sigB64;');
    lines.push('}');
    lines.push('');
    lines.push('async function hash_password(password) {');
    lines.push('  const salt = crypto.getRandomValues(new Uint8Array(16));');
    lines.push('  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);');
    lines.push('  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);');
    lines.push('  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");');
    lines.push('  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");');
    lines.push('  return `pbkdf2:100000:${saltHex}:${hashHex}`;');
    lines.push('}');
    lines.push('');
    lines.push('async function verify_password(password, stored) {');
    lines.push('  const parts = stored.split(":");');
    lines.push('  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;');
    lines.push('  const iterations = parseInt(parts[1], 10);');
    lines.push('  const salt = new Uint8Array(parts[2].match(/.{2}/g).map(b => parseInt(b, 16)));');
    lines.push('  const expectedHash = parts[3];');
    lines.push('  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);');
    lines.push('  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);');
    lines.push('  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");');
    lines.push('  return hashHex === expectedHash;');
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 7. Router
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Router ──');
    lines.push('const __routes = [];');
    lines.push('function __addRoute(method, path, handler) {');
    lines.push('  let pattern = path');
    lines.push('    .replace(/\\*([a-zA-Z_][a-zA-Z0-9_]*)/g, "(?<$1>.+)")');
    lines.push('    .replace(/\\*$/g, "(.*)")');
    lines.push('    .replace(/:([^/]+)/g, "(?<$1>[^/]+)");');
    lines.push('  __routes.push({ method, regex: new RegExp(`^${pattern}$`), handler, _path: path });');
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 8. CORS
    // ════════════════════════════════════════════════════════════
    if (corsConfig) {
      const origins = corsConfig.origins ? this.genExpression(corsConfig.origins) : '["*"]';
      const methods = corsConfig.methods ? this.genExpression(corsConfig.methods) : '["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]';
      const headers = corsConfig.headers ? this.genExpression(corsConfig.headers) : '["Content-Type", "Authorization"]';
      const credentials = corsConfig.credentials ? this.genExpression(corsConfig.credentials) : 'false';
      lines.push('// ── CORS ──');
      lines.push(`const __corsOrigins = ${origins};`);
      lines.push(`const __corsCredentials = ${credentials};`);
      lines.push('function __getCorsHeaders(req) {');
      lines.push('  const origin = req.headers.get("Origin") || "*";');
      lines.push('  const allowed = __corsOrigins.includes("*") || __corsOrigins.includes(origin);');
      lines.push('  const h = {');
      lines.push(`    "Access-Control-Allow-Origin": allowed ? (__corsCredentials ? origin : (origin === "*" ? "*" : origin)) : "",`);
      lines.push(`    "Access-Control-Allow-Methods": ${methods}.join(", "),`);
      lines.push(`    "Access-Control-Allow-Headers": ${headers}.join(", "),`);
      lines.push('  };');
      lines.push('  if (__corsCredentials) h["Access-Control-Allow-Credentials"] = "true";');
      lines.push('  return h;');
      lines.push('}');
    } else {
      lines.push('// ── CORS ──');
      lines.push('function __getCorsHeaders() {');
      lines.push('  return {');
      lines.push('    "Access-Control-Allow-Origin": "*",');
      lines.push('    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",');
      lines.push('    "Access-Control-Allow-Headers": "Content-Type, Authorization",');
      lines.push('  };');
      lines.push('}');
    }
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 9. Auth (F1) — fixed JWT / API key
    // ════════════════════════════════════════════════════════════
    if (authConfig) {
      lines.push('// ── Auth ──');
      const authType = authConfig.type ? authConfig.type.value : 'jwt';

      if (authType === 'api_key') {
        const keysExpr = authConfig.keys ? this.genExpression(authConfig.keys) : '[]';
        const headerExpr = authConfig.header ? this.genExpression(authConfig.header) : '"X-API-Key"';
        lines.push(`const __validApiKeys = new Set(${keysExpr});`);
        lines.push(`const __apiKeyHeader = ${headerExpr};`);
        lines.push('function __authenticate(req) {');
        lines.push('  const key = req.headers.get(__apiKeyHeader);');
        lines.push('  if (!key || !__validApiKeys.has(key)) return null;');
        lines.push('  return { authenticated: true };');
        lines.push('}');
      } else {
        // JWT auth (default)
        const secretExpr = authConfig.secret ? this.genExpression(authConfig.secret) : '"secret"';
        lines.push(`const __authSecret = ${secretExpr};`);
        lines.push('let __authKey = null;');
        lines.push('async function __authenticate(req) {');
        lines.push('  const authHeader = req.headers.get("Authorization");');
        lines.push('  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;');
        lines.push('  const token = authHeader.slice(7);');
        lines.push('  try {');
        lines.push('    const parts = token.split(".");');
        lines.push('    if (parts.length !== 3) return null;');
        lines.push('    if (!__authKey) {');
        lines.push('      __authKey = await crypto.subtle.importKey(');
        lines.push('        "raw", new TextEncoder().encode(__authSecret),');
        lines.push('        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]');
        lines.push('      );');
        lines.push('    }');
        lines.push('    const __sigData = parts[0] + "." + parts[1];');
        lines.push('    const __sig = await crypto.subtle.sign("HMAC", __authKey, new TextEncoder().encode(__sigData));');
        lines.push('    const __expectedSig = btoa(String.fromCharCode(...new Uint8Array(__sig)))');
        lines.push('      .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");');
        lines.push('    const __sigBuf = new TextEncoder().encode(__expectedSig);');
        lines.push('    const __tokBuf = new TextEncoder().encode(parts[2]);');
        lines.push('    if (__sigBuf.length !== __tokBuf.length) return null;');
        lines.push('    let __mismatch = 0;');
        lines.push('    for (let i = 0; i < __sigBuf.length; i++) __mismatch |= __sigBuf[i] ^ __tokBuf[i];');
        lines.push('    if (__mismatch !== 0) return null;');
        lines.push('    const __payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));');
        lines.push('    if (__payload.exp && __payload.exp < Math.floor(Date.now() / 1000)) return null;');
        lines.push('    return __payload;');
        lines.push('  } catch { return null; }');
        lines.push('}');
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 10. Max Body Size
    // ════════════════════════════════════════════════════════════
    if (maxBodyLimit) {
      lines.push('// ── Max Body Size ──');
      lines.push(`const __maxBodySize = ${this.genExpression(maxBodyLimit)};`);
      lines.push('');
    } else {
      lines.push('// ── Max Body Size ──');
      lines.push('const __maxBodySize = 1048576;');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 11. Rate Limiting (F2) — store + checker
    // ════════════════════════════════════════════════════════════
    if (needsRateLimitStore) {
      lines.push('// ── Rate Limiting ──');
      if (rateLimitConfig) {
        const maxExpr = rateLimitConfig.max ? this.genExpression(rateLimitConfig.max) : '100';
        const windowExpr = rateLimitConfig.window ? this.genExpression(rateLimitConfig.window) : '60';
        lines.push(`const __rateLimitMax = ${maxExpr};`);
        lines.push(`const __rateLimitWindow = ${windowExpr};`);
      }
      lines.push('const __rateLimitStore = new Map();');
      lines.push('function __checkRateLimit(key, max, windowSec) {');
      lines.push('  const now = Date.now();');
      lines.push('  const windowMs = windowSec * 1000;');
      lines.push('  let entry = __rateLimitStore.get(key);');
      lines.push('  if (!entry) { entry = { timestamps: [] }; __rateLimitStore.set(key, entry); }');
      lines.push('  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);');
      lines.push('  if (entry.timestamps.length >= max) {');
      lines.push('    const retryAfter = Math.ceil((entry.timestamps[0] + windowMs - now) / 1000);');
      lines.push('    return { limited: true, retryAfter };');
      lines.push('  }');
      lines.push('  entry.timestamps.push(now);');
      lines.push('  return { limited: false };');
      lines.push('}');
      lines.push('setInterval(() => {');
      lines.push('  const now = Date.now();');
      lines.push('  for (const [key, entry] of __rateLimitStore) {');
      lines.push('    if (entry.timestamps.length === 0 || now - entry.timestamps[entry.timestamps.length - 1] > 60000) {');
      lines.push('      __rateLimitStore.delete(key);');
      lines.push('    }');
      lines.push('  }');
      lines.push('}, 60000);');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 11b. File Upload Helpers
    // ════════════════════════════════════════════════════════════
    if (uploadConfig || routes.some(r => (r.decorators || []).some(d => d.name === 'upload'))) {
      lines.push('// ── File Upload Helpers ──');
      const maxSizeExpr = uploadConfig && uploadConfig.max_size ? this.genExpression(uploadConfig.max_size) : '10485760';
      const allowedTypesExpr = uploadConfig && uploadConfig.allowed_types ? this.genExpression(uploadConfig.allowed_types) : '[]';
      lines.push(`const __uploadMaxSize = ${maxSizeExpr};`);
      lines.push(`const __uploadAllowedTypes = ${allowedTypesExpr};`);
      lines.push('function __validateFile(file, fieldName) {');
      lines.push('  if (!file || (typeof file !== "object") || typeof file.size !== "number") {');
      lines.push('    return { valid: false, error: `${fieldName}: not a valid file` };');
      lines.push('  }');
      lines.push('  if (file.size > __uploadMaxSize) {');
      lines.push('    return { valid: false, error: `${fieldName}: file too large (max ${__uploadMaxSize} bytes)` };');
      lines.push('  }');
      lines.push('  if (__uploadAllowedTypes.length > 0 && !__uploadAllowedTypes.includes(file.type)) {');
      lines.push('    return { valid: false, error: `${fieldName}: file type ${file.type} not allowed` };');
      lines.push('  }');
      lines.push('  return { valid: true };');
      lines.push('}');
      lines.push('async function save_file(file, dir) {');
      lines.push('  const fs = await import("node:fs/promises");');
      lines.push('  await fs.mkdir(dir, { recursive: true });');
      lines.push('  const name = file.name || "upload_" + Date.now();');
      lines.push('  const dest = dir + "/" + name;');
      lines.push('  await Bun.write(dest, file);');
      lines.push('  return dest;');
      lines.push('}');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 11c. Session Management
    // ════════════════════════════════════════════════════════════
    if (sessionConfig) {
      lines.push('// ── Session Management ──');
      const secretExpr = sessionConfig.secret ? this.genExpression(sessionConfig.secret) : '"tova-session-secret"';
      const maxAgeExpr = sessionConfig.max_age ? this.genExpression(sessionConfig.max_age) : '3600';
      const cookieNameExpr = sessionConfig.cookie_name ? this.genExpression(sessionConfig.cookie_name) : '"__sid"';
      lines.push(`const __sessionSecret = ${secretExpr};`);
      lines.push(`const __sessionMaxAge = ${maxAgeExpr};`);
      lines.push(`const __sessionCookieName = ${cookieNameExpr};`);
      lines.push('let __sessionKey = null;');
      lines.push('async function __getSessionKey() {');
      lines.push('  if (!__sessionKey) {');
      lines.push('    __sessionKey = await crypto.subtle.importKey(');
      lines.push('      "raw", new TextEncoder().encode(__sessionSecret),');
      lines.push('      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]');
      lines.push('    );');
      lines.push('  }');
      lines.push('  return __sessionKey;');
      lines.push('}');
      lines.push('async function __signSessionId(id) {');
      lines.push('  const key = await __getSessionKey();');
      lines.push('  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));');
      lines.push('  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");');
      lines.push('  return id + "." + b64;');
      lines.push('}');
      lines.push('async function __verifySessionId(signed) {');
      lines.push('  const dot = signed.lastIndexOf(".");');
      lines.push('  if (dot === -1) return null;');
      lines.push('  const id = signed.slice(0, dot);');
      lines.push('  const expected = await __signSessionId(id);');
      lines.push('  const __eBuf = new TextEncoder().encode(expected);');
      lines.push('  const __sBuf = new TextEncoder().encode(signed);');
      lines.push('  if (__eBuf.length !== __sBuf.length) return null;');
      lines.push('  let __m = 0;');
      lines.push('  for (let i = 0; i < __eBuf.length; i++) __m |= __eBuf[i] ^ __sBuf[i];');
      lines.push('  return __m === 0 ? id : null;');
      lines.push('}');

      // Use SQLite-backed sessions when db is available
      if (dbConfig || usesDb) {
        lines.push('// SQLite-backed session store');
        lines.push('__db.exec(`CREATE TABLE IF NOT EXISTS __sessions (');
        lines.push("  id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL");
        lines.push(')`);');
        lines.push('const __sessionStmts = {');
        lines.push('  get: __db.prepare("SELECT data, created_at FROM __sessions WHERE id = ? AND created_at > ?"),');
        lines.push('  upsert: __db.prepare("INSERT INTO __sessions (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"),');
        lines.push('  del: __db.prepare("DELETE FROM __sessions WHERE id = ?"),');
        lines.push('  cleanup: __db.prepare("DELETE FROM __sessions WHERE created_at <= ?"),');
        lines.push('};');
        lines.push('function __createSession(id) {');
        lines.push('  const cutoff = Date.now() - __sessionMaxAge * 1000;');
        lines.push('  const row = __sessionStmts.get.get(id, cutoff);');
        lines.push('  let __data = row ? JSON.parse(row.data) : {};');
        lines.push('  let __dirty = !row;');
        lines.push('  return {');
        lines.push('    get(key) { return __data[key]; },');
        lines.push('    set(key, value) { __data[key] = value; __dirty = true; },');
        lines.push('    delete(key) { delete __data[key]; __dirty = true; },');
        lines.push('    destroy() { __sessionStmts.del.run(id); __data = {}; },');
        lines.push('    get data() { return { ...__data }; },');
        lines.push('    __flush() { if (__dirty) { const now = Date.now(); __sessionStmts.upsert.run(id, JSON.stringify(__data), now, now); __dirty = false; } },');
        lines.push('  };');
        lines.push('}');
        lines.push('setInterval(() => {');
        lines.push('  const cutoff = Date.now() - __sessionMaxAge * 1000;');
        lines.push('  __sessionStmts.cleanup.run(cutoff);');
        lines.push('}, 60000);');
      } else {
        lines.push('// In-memory session store');
        lines.push('const __sessionStore = new Map();');
        lines.push('function __createSession(id) {');
        lines.push('  if (!__sessionStore.has(id)) {');
        lines.push('    __sessionStore.set(id, { data: {}, createdAt: Date.now() });');
        lines.push('  }');
        lines.push('  const entry = __sessionStore.get(id);');
        lines.push('  return {');
        lines.push('    get(key) { return entry.data[key]; },');
        lines.push('    set(key, value) { entry.data[key] = value; },');
        lines.push('    delete(key) { delete entry.data[key]; },');
        lines.push('    destroy() { __sessionStore.delete(id); },');
        lines.push('    get data() { return { ...entry.data }; },');
        lines.push('    __flush() {},');
        lines.push('  };');
        lines.push('}');
        lines.push('setInterval(() => {');
        lines.push('  const now = Date.now();');
        lines.push('  for (const [id, entry] of __sessionStore) {');
        lines.push('    if (now - entry.createdAt > __sessionMaxAge * 1000) __sessionStore.delete(id);');
        lines.push('  }');
        lines.push('}, 60000);');
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 12. Event Bus (F5) — if subscriptions exist
    // ════════════════════════════════════════════════════════════
    if (subscriptions.length > 0) {
      lines.push('// ── Event Bus ──');
      lines.push('const __eventBus = new Map();');
      lines.push('function __subscribe(event, handler) {');
      lines.push('  if (!__eventBus.has(event)) __eventBus.set(event, []);');
      lines.push('  __eventBus.get(event).push(handler);');
      lines.push('}');
      lines.push('async function publish(event, data) {');
      lines.push('  const handlers = __eventBus.get(event) || [];');
      lines.push('  await Promise.all(handlers.map(h => h(data)));');
      if (peerBlocks && peerBlocks.size > 0) {
        lines.push('  const __peerUrls = [');
        for (const [peerName] of peerBlocks) {
          lines.push(`    ${peerName}.__baseUrl,`);
        }
        lines.push('  ];');
        lines.push('  for (const __peerUrl of __peerUrls) {');
        lines.push('    try {');
        lines.push('      await fetch(`${__peerUrl}/rpc/__event`, {');
        lines.push('        method: "POST",');
        lines.push('        headers: { "Content-Type": "application/json" },');
        lines.push('        body: JSON.stringify({ event, data }),');
        lines.push('      });');
        lines.push('    } catch {}');
        lines.push('  }');
      }
      lines.push('}');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 12b. Background Jobs
    // ════════════════════════════════════════════════════════════
    if (backgroundJobs.length > 0) {
      lines.push('// ── Background Jobs ──');
      lines.push('const __jobQueue = [];');
      lines.push('let __jobProcessing = false;');
      lines.push('async function __processJobQueue() {');
      lines.push('  if (__jobProcessing) return;');
      lines.push('  __jobProcessing = true;');
      lines.push('  while (__jobQueue.length > 0) {');
      lines.push('    const job = __jobQueue.shift();');
      lines.push('    try { await job.fn(...job.args); } catch (err) {');
      lines.push('      __log("error", `Background job ${job.name} failed`, { error: err.message });');
      lines.push('      if (job.retries > 0) {');
      lines.push('        job.retries--;');
      lines.push('        __jobQueue.push(job);');
      lines.push('      }');
      lines.push('    }');
      lines.push('  }');
      lines.push('  __jobProcessing = false;');
      lines.push('}');
      for (const job of backgroundJobs) {
        const fnName = job.name;
        const params = job.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of job.params) this.declareVar(p.name);
        const body = this.genBlockBody(job.body);
        this.popScope();
        lines.push(`async function __bg_${fnName}(${params}) {`);
        lines.push(body);
        lines.push('}');
      }
      lines.push('function spawn_job(name, ...args) {');
      lines.push('  const __jobFns = {');
      for (const job of backgroundJobs) {
        lines.push(`    "${job.name}": __bg_${job.name},`);
      }
      lines.push('  };');
      lines.push('  const fn = __jobFns[name];');
      lines.push('  if (!fn) throw new Error(`Unknown background job: ${name}`);');
      lines.push('  __jobQueue.push({ name, fn, args, retries: 2 });');
      lines.push('  setTimeout(__processJobQueue, 0);');
      lines.push('}');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 12c. Response Compression
    // ════════════════════════════════════════════════════════════
    if (compressionConfig) {
      const minSizeExpr = compressionConfig.min_size ? this.genExpression(compressionConfig.min_size) : '1024';
      lines.push('// ── Compression ──');
      lines.push(`const __compressionMinSize = ${minSizeExpr};`);
      lines.push('async function __compressResponse(req, res) {');
      lines.push('  const accept = req.headers.get("Accept-Encoding") || "";');
      lines.push('  const ct = res.headers.get("Content-Type") || "";');
      lines.push('  if (!ct.match(/text|json|javascript|xml|svg/)) return res;');
      lines.push('  const body = await res.arrayBuffer();');
      lines.push('  if (body.byteLength < __compressionMinSize) {');
      lines.push('    return new Response(body, { status: res.status, headers: res.headers });');
      lines.push('  }');
      lines.push('  const h = new Headers(res.headers);');
      lines.push('  if (accept.includes("gzip")) {');
      lines.push('    const compressed = Bun.gzipSync(new Uint8Array(body));');
      lines.push('    h.set("Content-Encoding", "gzip");');
      lines.push('    h.set("Content-Length", String(compressed.length));');
      lines.push('    return new Response(compressed, { status: res.status, headers: h });');
      lines.push('  }');
      lines.push('  if (accept.includes("deflate")) {');
      lines.push('    const compressed = Bun.deflateSync(new Uint8Array(body));');
      lines.push('    h.set("Content-Encoding", "deflate");');
      lines.push('    h.set("Content-Length", String(compressed.length));');
      lines.push('    return new Response(compressed, { status: res.status, headers: h });');
      lines.push('  }');
      lines.push('  return new Response(body, { status: res.status, headers: res.headers });');
      lines.push('}');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 12d. Response Caching Helpers
    // ════════════════════════════════════════════════════════════
    if (cacheConfig) {
      const maxAgeExpr = cacheConfig.max_age ? this.genExpression(cacheConfig.max_age) : '0';
      const staleExpr = cacheConfig.stale_while_revalidate ? this.genExpression(cacheConfig.stale_while_revalidate) : '0';
      lines.push('// ── Cache Helpers ──');
      lines.push(`const __cacheMaxAge = ${maxAgeExpr};`);
      lines.push(`const __cacheStale = ${staleExpr};`);
      lines.push('');
    }
    // Always emit cache helpers
    lines.push('function cache_control(res, maxAge, options = {}) {');
    lines.push('  const h = new Headers(res.headers);');
    lines.push('  let directive = options.private ? "private" : "public";');
    lines.push('  directive += `, max-age=${maxAge}`;');
    lines.push('  if (options.stale_while_revalidate) directive += `, stale-while-revalidate=${options.stale_while_revalidate}`;');
    lines.push('  if (options.no_cache) directive = "no-cache";');
    lines.push('  if (options.no_store) directive = "no-store";');
    lines.push('  h.set("Cache-Control", directive);');
    lines.push('  return new Response(res.body, { status: res.status, headers: h });');
    lines.push('}');
    lines.push('function etag(res, tag) {');
    lines.push('  const h = new Headers(res.headers);');
    lines.push('  h.set("ETag", `"${tag}"`);');
    lines.push('  return new Response(res.body, { status: res.status, headers: h });');
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 12e. Model / ORM Layer — auto-generate CRUD from shared types
    // ════════════════════════════════════════════════════════════
    if (modelDecls.length > 0 && (dbConfig || usesDb)) {
      lines.push('// ── Model / ORM Layer ──');
      const isAsync = dbDriver !== 'sqlite';
      const aw = isAsync ? 'await ' : '';
      for (const modelDecl of modelDecls) {
        const typeName = modelDecl.name;
        const typeInfo = sharedTypes.get(typeName);
        if (!typeInfo) continue;
        const tableName = modelDecl.config && modelDecl.config.table
          ? this.genExpression(modelDecl.config.table).replace(/"/g, '')
          : typeName.toLowerCase() + 's';
        const hasTimestamps = modelDecl.config && modelDecl.config.timestamps;
        const fields = typeInfo.fields;
        const fieldNames = fields.map(f => f.name);
        const hasId = fieldNames.includes('id');

        // Extract relations from config
        const belongsToNames = [];
        const hasManyNames = [];
        if (modelDecl.config) {
          const extractRelNames = (val) => {
            if (!val) return [];
            if (val.type === 'Identifier') return [val.name];
            if (val.type === 'ArrayLiteral') return val.elements.filter(e => e.type === 'Identifier').map(e => e.name);
            return [];
          };
          belongsToNames.push(...extractRelNames(modelDecl.config.belongs_to));
          hasManyNames.push(...extractRelNames(modelDecl.config.has_many));
        }

        // Map Tova types to SQL types
        const sqlType = (tovaType) => {
          if (dbDriver === 'postgres') {
            switch (tovaType) {
              case 'Int': return 'INTEGER';
              case 'Float': return 'DOUBLE PRECISION';
              case 'Bool': return 'BOOLEAN';
              case 'String': return 'TEXT';
              default: return 'TEXT';
            }
          }
          switch (tovaType) {
            case 'Int': return 'INTEGER';
            case 'Float': return 'REAL';
            case 'Bool': return 'INTEGER';
            case 'String': return 'TEXT';
            default: return 'TEXT';
          }
        };

        // Generate CREATE TABLE
        const colDefs = [];
        for (const f of fields) {
          if (f.name === 'id') {
            if (dbDriver === 'postgres') {
              colDefs.push('id SERIAL PRIMARY KEY');
            } else {
              colDefs.push('id INTEGER PRIMARY KEY AUTOINCREMENT');
            }
          } else {
            colDefs.push(`${f.name} ${sqlType(f.type)}`);
          }
        }
        // Add FK columns for belongs_to relations
        for (const parentName of belongsToNames) {
          const fkCol = parentName.toLowerCase() + '_id';
          if (!fieldNames.includes(fkCol)) {
            const parentTable = parentName.toLowerCase() + 's';
            colDefs.push(`${fkCol} INTEGER REFERENCES ${parentTable}(id)`);
          }
        }
        if (hasTimestamps) {
          colDefs.push('created_at TEXT DEFAULT (datetime(\'now\'))');
          colDefs.push('updated_at TEXT DEFAULT (datetime(\'now\'))');
        }

        const placeholder = dbDriver === 'postgres' ? (i) => `$${i}` : () => '?';
        const insertFields = fields.filter(f => f.name !== 'id');
        const insertCols = insertFields.map(f => f.name).join(', ');
        const insertPlaceholders = insertFields.map((_, i) => placeholder(i + 1)).join(', ');
        const updateSets = insertFields.map((f, i) => `${f.name} = ${placeholder(i + 1)}`).join(', ');
        const returningClause = dbDriver === 'postgres' ? ' RETURNING *' : '';

        lines.push(`// Model: ${typeName} -> ${tableName}`);
        lines.push(`${aw}db.exec(\`CREATE TABLE IF NOT EXISTS ${tableName} (${colDefs.join(', ')})\`);`);
        lines.push('');

        // Embed valid column whitelist for SQL injection prevention
        const allColNames = [...fieldNames];
        for (const parentName of belongsToNames) {
          const fkCol = parentName.toLowerCase() + '_id';
          if (!allColNames.includes(fkCol)) allColNames.push(fkCol);
        }
        if (hasTimestamps) {
          allColNames.push('created_at', 'updated_at');
        }
        const colWhitelistJson = JSON.stringify(allColNames);

        // Generate the model object
        lines.push(`const ${typeName}Model = {`);
        lines.push(`  __validCols: new Set(${colWhitelistJson}),`);
        lines.push(`  __assertCols(keys) {`);
        lines.push(`    for (const k of keys) {`);
        lines.push(`      if (!this.__validCols.has(k)) throw new Error(\`Invalid column: \${k}\`);`);
        lines.push(`    }`);
        lines.push(`  },`);

        // find(id)
        lines.push(`  ${isAsync ? 'async ' : ''}find(id) {`);
        lines.push(`    return ${aw}db.get("SELECT * FROM ${tableName} WHERE id = ${placeholder(1)}", id);`);
        lines.push('  },');

        // all()
        lines.push(`  ${isAsync ? 'async ' : ''}all() {`);
        lines.push(`    return ${aw}db.query("SELECT * FROM ${tableName}");`);
        lines.push('  },');

        // where(conditions)
        lines.push(`  ${isAsync ? 'async ' : ''}where(conditions) {`);
        lines.push('    const keys = Object.keys(conditions);');
        lines.push('    this.__assertCols(keys);');
        lines.push('    const vals = Object.values(conditions);');
        if (dbDriver === 'postgres') {
          lines.push('    const clauses = keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ");');
        } else {
          lines.push('    const clauses = keys.map(k => `${k} = ?`).join(" AND ");');
        }
        lines.push(`    return ${aw}db.query(\`SELECT * FROM ${tableName} WHERE \${clauses}\`, ...vals);`);
        lines.push('  },');

        // create(data)
        lines.push(`  ${isAsync ? 'async ' : ''}create(data) {`);
        lines.push(`    const cols = Object.keys(data).filter(k => k !== 'id');`);
        lines.push('    this.__assertCols(cols);');
        lines.push(`    const vals = cols.map(k => data[k]);`);
        if (dbDriver === 'postgres') {
          lines.push('    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");');
          lines.push(`    const rows = ${aw}db.query(\`INSERT INTO ${tableName} (\${cols.join(", ")}) VALUES (\${placeholders}) RETURNING *\`, ...vals);`);
          lines.push('    return rows[0];');
        } else {
          lines.push('    const placeholders = cols.map(() => "?").join(", ");');
          lines.push(`    const result = ${aw}db.run(\`INSERT INTO ${tableName} (\${cols.join(", ")}) VALUES (\${placeholders})\`, ...vals);`);
          lines.push(`    return ${aw}db.get("SELECT * FROM ${tableName} WHERE id = ?", result.lastInsertRowid);`);
        }
        lines.push('  },');

        // update(id, data)
        lines.push(`  ${isAsync ? 'async ' : ''}update(id, data) {`);
        lines.push(`    const cols = Object.keys(data).filter(k => k !== 'id');`);
        lines.push('    this.__assertCols(cols);');
        lines.push(`    const vals = cols.map(k => data[k]);`);
        if (dbDriver === 'postgres') {
          lines.push('    const sets = cols.map((k, i) => `${k} = $${i + 1}`).join(", ");');
          lines.push(`    const rows = ${aw}db.query(\`UPDATE ${tableName} SET \${sets} WHERE id = $\${cols.length + 1} RETURNING *\`, ...vals, id);`);
          lines.push('    return rows[0];');
        } else {
          lines.push('    const sets = cols.map(k => `${k} = ?`).join(", ");');
          lines.push(`    ${aw}db.run(\`UPDATE ${tableName} SET \${sets} WHERE id = ?\`, ...vals, id);`);
          lines.push(`    return ${aw}db.get("SELECT * FROM ${tableName} WHERE id = ?", id);`);
        }
        lines.push('  },');

        // delete(id)
        lines.push(`  ${isAsync ? 'async ' : ''}delete(id) {`);
        lines.push(`    return ${aw}db.run("DELETE FROM ${tableName} WHERE id = ${placeholder(1)}", id);`);
        lines.push('  },');

        // count()
        lines.push(`  ${isAsync ? 'async ' : ''}count(conditions) {`);
        lines.push('    if (!conditions) {');
        lines.push(`      const row = ${aw}db.get("SELECT COUNT(*) as count FROM ${tableName}");`);
        lines.push('      return row ? row.count : 0;');
        lines.push('    }');
        lines.push('    const keys = Object.keys(conditions);');
        lines.push('    this.__assertCols(keys);');
        lines.push('    const vals = Object.values(conditions);');
        if (dbDriver === 'postgres') {
          lines.push('    const clauses = keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ");');
        } else {
          lines.push('    const clauses = keys.map(k => `${k} = ?`).join(" AND ");');
        }
        lines.push(`    const row = ${aw}db.get(\`SELECT COUNT(*) as count FROM ${tableName} WHERE \${clauses}\`, ...vals);`);
        lines.push('    return row ? row.count : 0;');
        lines.push('  },');

        // belongs_to accessors: PostModel.user(user_id) → single parent record
        for (const parentName of belongsToNames) {
          const parentTable = parentName.toLowerCase() + 's';
          const accessorName = parentName.toLowerCase();
          lines.push(`  ${isAsync ? 'async ' : ''}${accessorName}(${accessorName}_id) {`);
          lines.push(`    return ${aw}db.get("SELECT * FROM ${parentTable} WHERE id = ${placeholder(1)}", ${accessorName}_id);`);
          lines.push('  },');
        }

        // has_many accessors: UserModel.posts(id) → array of child records
        for (const childName of hasManyNames) {
          const childTable = childName.toLowerCase() + 's';
          const accessorName = childName.toLowerCase() + 's';
          const fkCol = typeName.toLowerCase() + '_id';
          lines.push(`  ${isAsync ? 'async ' : ''}${accessorName}(id) {`);
          lines.push(`    return ${aw}db.query("SELECT * FROM ${childTable} WHERE ${fkCol} = ${placeholder(1)}", id);`);
          lines.push('  },');
        }

        lines.push('};');
        lines.push('');
      }
    }

    // ════════════════════════════════════════════════════════════
    // 12f. SSE (Server-Sent Events) Support
    // ════════════════════════════════════════════════════════════
    if (sseDecls.length > 0) {
      lines.push('// ── SSE (Server-Sent Events) ──');
      lines.push('class __SSEChannel {');
      lines.push('  constructor() { this.clients = new Set(); }');
      lines.push('  subscribe(controller) { this.clients.add(controller); }');
      lines.push('  unsubscribe(controller) { this.clients.delete(controller); }');
      lines.push('  send(data, event = null) {');
      lines.push('    let msg = "";');
      lines.push('    if (event) msg += `event: ${event}\\n`;');
      lines.push('    msg += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\\n\\n`;');
      lines.push('    const encoded = new TextEncoder().encode(msg);');
      lines.push('    for (const c of this.clients) { try { c.enqueue(encoded); } catch { this.clients.delete(c); } }');
      lines.push('  }');
      lines.push('  get count() { return this.clients.size; }');
      lines.push('}');
      lines.push('const __sseChannels = new Map();');
      lines.push('function sse_channel(name) {');
      lines.push('  if (!__sseChannels.has(name)) __sseChannels.set(name, new __SSEChannel());');
      lines.push('  return __sseChannels.get(name);');
      lines.push('}');
      lines.push('');

      for (const sse of sseDecls) {
        const params = sse.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of sse.params) this.declareVar(p.name);
        const body = this.genBlockBody(sse.body);
        this.popScope();

        lines.push(`__addRoute("GET", ${JSON.stringify(sse.path)}, async (req) => {`);
        lines.push('  const stream = new ReadableStream({');
        lines.push(`    start(controller) {`);
        lines.push('      const send = (data, event) => {');
        lines.push('        let msg = "";');
        lines.push('        if (event) msg += `event: ${event}\\n`;');
        lines.push('        msg += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\\n\\n`;');
        lines.push('        controller.enqueue(new TextEncoder().encode(msg));');
        lines.push('      };');
        lines.push('      const close = () => controller.close();');
        lines.push(`      (async (${params || 'send, close'}) => {`);
        lines.push(body);
        lines.push(`      })(${params || 'send, close'});`);
        lines.push('    }');
        lines.push('  });');
        lines.push('  return new Response(stream, {');
        lines.push('    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" }');
        lines.push('  });');
        lines.push('});');
        lines.push('');
      }
    }

    // ════════════════════════════════════════════════════════════
    // 12g. Content Negotiation Helper
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Content Negotiation ──');
    lines.push('function negotiate(req, data, options = {}) {');
    lines.push('  const accept = (req.headers.get("Accept") || "application/json").toLowerCase();');
    lines.push('  if (accept.includes("text/html") && options.html) {');
    lines.push('    const body = typeof options.html === "function" ? options.html(data) : options.html;');
    lines.push('    return new Response(body, { status: options.status || 200, headers: { "Content-Type": "text/html" } });');
    lines.push('  }');
    lines.push('  if (accept.includes("text/xml") || accept.includes("application/xml")) {');
    lines.push('    if (options.xml) {');
    lines.push('      const body = typeof options.xml === "function" ? options.xml(data) : options.xml;');
    lines.push('      return new Response(body, { status: options.status || 200, headers: { "Content-Type": "application/xml" } });');
    lines.push('    }');
    lines.push('  }');
    lines.push('  if (accept.includes("text/plain")) {');
    lines.push('    const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);');
    lines.push('    return new Response(body, { status: options.status || 200, headers: { "Content-Type": "text/plain" } });');
    lines.push('  }');
    lines.push('  return Response.json(data, { status: options.status || 200 });');
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 12h. Race Condition Protection — Async Mutex for shared state
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Async Mutex ──');
    lines.push('class __Mutex {');
    lines.push('  constructor() { this._queue = []; this._locked = false; }');
    lines.push('  async acquire() {');
    lines.push('    if (!this._locked) { this._locked = true; return; }');
    lines.push('    return new Promise(resolve => this._queue.push(resolve));');
    lines.push('  }');
    lines.push('  release() {');
    lines.push('    if (this._queue.length > 0) { this._queue.shift()(); }');
    lines.push('    else { this._locked = false; }');
    lines.push('  }');
    lines.push('}');
    lines.push('const __mutex = new __Mutex();');
    lines.push('async function withLock(fn) {');
    lines.push('  await __mutex.acquire();');
    lines.push('  try { return await fn(); } finally { __mutex.release(); }');
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 13. Other statements + Server Functions
    // ════════════════════════════════════════════════════════════
    for (const stmt of otherStatements) {
      lines.push(this.generateStatement(stmt));
    }

    if (functions.length > 0) {
      lines.push('// ── Server Functions ──');
      for (const fn of functions) {
        lines.push(this.generateStatement(fn));
        lines.push('');
      }
    }

    // ════════════════════════════════════════════════════════════
    // 14. Subscribe registrations (F5)
    // ════════════════════════════════════════════════════════════
    if (subscriptions.length > 0) {
      lines.push('// ── Event Subscriptions ──');
      for (const sub of subscriptions) {
        const params = sub.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of sub.params) this.declareVar(p.name);
        const body = this.genBlockBody(sub.body);
        this.popScope();
        lines.push(`__subscribe(${JSON.stringify(sub.event)}, async (${params}) => {`);
        lines.push(body);
        lines.push('});');
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 15. Middleware, Error handler, Health check, RPC endpoints
    // ════════════════════════════════════════════════════════════
    if (middlewares.length > 0) {
      lines.push('// ── Middleware ──');
      for (const mw of middlewares) {
        const params = mw.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of mw.params) this.declareVar(p.name);
        const body = this.genBlockBody(mw.body);
        this.popScope();
        lines.push(`async function ${mw.name}(${params}) {`);
        lines.push(body);
        lines.push('}');
        lines.push('');
      }
    }

    if (errorHandler) {
      const params = errorHandler.params.map(p => p.name).join(', ');
      this.pushScope();
      for (const p of errorHandler.params) this.declareVar(p.name);
      const body = this.genBlockBody(errorHandler.body);
      this.popScope();
      lines.push('// ── Error Handler ──');
      lines.push(`async function __errorHandler(${params}) {`);
      lines.push(body);
      lines.push('}');
      lines.push('');
    }

    if (healthPath) {
      lines.push('// ── Health Check ──');
      lines.push(`__addRoute("GET", ${JSON.stringify(healthPath)}, async () => {`);
      lines.push('  return Response.json({ status: "ok", uptime: process.uptime() });');
      lines.push('});');
      lines.push('');
    }

    // RPC Endpoints (auto-wired)
    if (functions.length > 0) {
      lines.push('// ── RPC Endpoints ──');
      for (const fn of functions) {
        const name = fn.name;
        const paramNames = fn.params.map(p => p.name);
        lines.push(`__addRoute("POST", "/rpc/${name}", async (req) => {`);
        lines.push(`  const body = await req.json();`);
        if (paramNames.length > 0) {
          for (let pi = 0; pi < paramNames.length; pi++) {
            lines.push(`  const ${paramNames[pi]} = body.__args ? body.__args[${pi}] : body.${paramNames[pi]};`);
          }
          const validationChecks = this._genValidationCode(fn.params);
          if (validationChecks.length > 0) {
            lines.push(`  const __validationErrors = [];`);
            for (const check of validationChecks) {
              lines.push(check);
            }
            lines.push(`  if (__validationErrors.length > 0) return Response.json({ error: "Validation failed", details: __validationErrors }, { status: 400 });`);
          }
          lines.push(`  const result = await ${name}(${paramNames.join(', ')});`);
        } else {
          lines.push(`  const result = await ${name}();`);
        }
        lines.push(`  return Response.json({ result });`);
        lines.push(`});`);
        lines.push('');
      }
    }

    // ════════════════════════════════════════════════════════════
    // 16. Event RPC endpoint (F5) — if multi-server + subscriptions
    // ════════════════════════════════════════════════════════════
    if (subscriptions.length > 0 && peerBlocks && peerBlocks.size > 0) {
      lines.push('// ── Event RPC Endpoint ──');
      lines.push('__addRoute("POST", "/rpc/__event", async (req) => {');
      lines.push('  const { event, data } = await req.json();');
      lines.push('  const handlers = __eventBus.get(event) || [];');
      lines.push('  await Promise.all(handlers.map(h => h(data)));');
      lines.push('  return Response.json({ ok: true });');
      lines.push('});');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 17. Explicit Routes — with timeout (F7) + per-route rate_limit (F2)
    // ════════════════════════════════════════════════════════════
    if (routes.length > 0) {
      // Sort routes by specificity: static > :param > *wildcard, longer paths first
      const segWeight = (seg) => {
        if (seg.startsWith('*')) return 2; // wildcard — least specific
        if (seg.startsWith(':')) return 1; // param
        return 0; // static — most specific
      };
      routes.sort((a, b) => {
        const segsA = a.path.split('/').filter(Boolean);
        const segsB = b.path.split('/').filter(Boolean);
        // More segments = more specific (but wildcards are inherently less specific)
        const aHasWild = segsA.some(s => s.startsWith('*'));
        const bHasWild = segsB.some(s => s.startsWith('*'));
        if (aHasWild !== bHasWild) return aHasWild ? 1 : -1;
        if (segsA.length !== segsB.length) return segsB.length - segsA.length;
        // Compare segment by segment: static beats dynamic beats wildcard
        for (let i = 0; i < Math.min(segsA.length, segsB.length); i++) {
          const wa = segWeight(segsA[i]);
          const wb = segWeight(segsB[i]);
          if (wa !== wb) return wa - wb;
        }
        // Stable sort: same path, order by method (deterministic)
        const methodOrder = { HEAD: 0, GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5, OPTIONS: 6 };
        return (methodOrder[a.method.toUpperCase()] || 9) - (methodOrder[b.method.toUpperCase()] || 9);
      });
      lines.push('// ── Routes ──');
      for (const route of routes) {
        const method = route.method.toUpperCase();
        const path = route.path;
        const handlerRaw = this.genExpression(route.handler);
        // Wrap inline lambda handlers in parens so they can be called as IIFEs
        const handlerIsInline = route.handler.type !== 'Identifier';
        const handler = handlerIsInline ? `(${handlerRaw})` : handlerRaw;

        const handlerName = route.handler.type === 'Identifier' ? route.handler.name : null;
        const handlerParams = handlerName ? fnParamMap.get(handlerName) : null;
        const handlerDecl = handlerName ? fnDeclMap.get(handlerName) : null;

        const decorators = route.decorators || [];
        const groupMws = route._groupMiddlewares || [];
        const hasAuth = decorators.some(d => d.name === 'auth');
        const roleDecorator = decorators.find(d => d.name === 'role');
        const rateLimitDec = decorators.find(d => d.name === 'rate_limit');
        const timeoutDec = decorators.find(d => d.name === 'timeout');
        const timeoutMs = timeoutDec && timeoutDec.args[0] ? this.genExpression(timeoutDec.args[0]) : null;
        const validateDec = decorators.find(d => d.name === 'validate');
        const uploadDec = decorators.find(d => d.name === 'upload');

        lines.push(`__addRoute(${JSON.stringify(method)}, ${JSON.stringify(path)}, async (req, params) => {`);

        // Auth decorator check
        if (hasAuth && authConfig) {
          lines.push(`  const __user = await __authenticate(req);`);
          lines.push(`  if (!__user) return Response.json({ error: "Unauthorized" }, { status: 401 });`);
          if (roleDecorator && roleDecorator.args.length > 0) {
            const roleExpr = this.genExpression(roleDecorator.args[0]);
            lines.push(`  if (__user.role !== ${roleExpr}) return Response.json({ error: "Forbidden" }, { status: 403 });`);
          }
        }

        // Per-route rate limit check
        if (rateLimitDec && needsRateLimitStore) {
          const rlMax = rateLimitDec.args[0] ? this.genExpression(rateLimitDec.args[0]) : '100';
          const rlWindow = rateLimitDec.args[1] ? this.genExpression(rateLimitDec.args[1]) : '60';
          lines.push(`  const __rlIp = req.headers.get("x-forwarded-for") || "unknown";`);
          lines.push(`  const __rlRoute = __checkRateLimit(\`route:${path}:\${__rlIp}\`, ${rlMax}, ${rlWindow});`);
          lines.push(`  if (__rlRoute.limited) return Response.json({ error: "Too Many Requests" }, { status: 429, headers: { "Retry-After": String(__rlRoute.retryAfter) } });`);
        }

        // Upload decorator — parse multipart body, validate file field
        if (uploadDec) {
          const fieldExpr = uploadDec.args[0] ? this.genExpression(uploadDec.args[0]) : '"file"';
          lines.push(`  const __body = (await __parseBody(req)) || {};`);
          lines.push(`  const __uploadField = ${fieldExpr};`);
          lines.push(`  const __uploadFile = __body[__uploadField];`);
          lines.push(`  const __uploadCheck = __validateFile(__uploadFile, __uploadField);`);
          lines.push(`  if (!__uploadCheck.valid) return Response.json({ error: __uploadCheck.error }, { status: 400 });`);
        }

        // Validate decorator — advanced field validation on body
        if (validateDec && validateDec.args[0]) {
          if (!uploadDec) {
            lines.push(`  const __body = (await __parseBody(req)) || {};`);
          }
          lines.push(`  const __validationErrors = [];`);
          const advChecks = this._genAdvancedValidationCode(validateDec.args[0]);
          for (const check of advChecks) lines.push(check);
          lines.push(`  if (__validationErrors.length > 0) return Response.json({ error: "Validation failed", details: __validationErrors }, { status: 400 });`);
        }

        // Type-safe body deserialization: if a param has a shared type annotation, auto-validate
        if (handlerDecl && ['POST', 'PUT', 'PATCH'].includes(method)) {
          for (const p of handlerDecl.params) {
            if (p.typeAnnotation && p.typeAnnotation.type === 'TypeAnnotation' && sharedTypes.has(p.typeAnnotation.name) && p.name !== 'req') {
              const typeInfo = sharedTypes.get(p.typeAnnotation.name);
              if (!uploadDec && !validateDec) {
                lines.push(`  if (!__body) { var __body = (await __parseBody(req)) || {}; }`);
              }
              lines.push(`  // Type-safe validation for ${p.name}: ${p.typeAnnotation.name}`);
              lines.push(`  const __tsErrors_${p.name} = [];`);
              for (const f of typeInfo.fields) {
                if (f.name === 'id') continue;
                switch (f.type) {
                  case 'String':
                    lines.push(`  if (__body.${f.name} !== undefined && typeof __body.${f.name} !== "string") __tsErrors_${p.name}.push("${f.name} must be a string");`);
                    break;
                  case 'Int':
                    lines.push(`  if (__body.${f.name} !== undefined && !Number.isInteger(__body.${f.name})) __tsErrors_${p.name}.push("${f.name} must be an integer");`);
                    break;
                  case 'Float':
                    lines.push(`  if (__body.${f.name} !== undefined && typeof __body.${f.name} !== "number") __tsErrors_${p.name}.push("${f.name} must be a number");`);
                    break;
                  case 'Bool':
                    lines.push(`  if (__body.${f.name} !== undefined && typeof __body.${f.name} !== "boolean") __tsErrors_${p.name}.push("${f.name} must be a boolean");`);
                    break;
                }
              }
              lines.push(`  if (__tsErrors_${p.name}.length > 0) return Response.json({ error: "Validation failed", details: __tsErrors_${p.name} }, { status: 400 });`);
            }
          }
        }

        if (handlerParams !== null && handlerParams !== undefined) {
          if (handlerParams.length === 0) {
            if (groupMws.length > 0) {
              this._emitGroupMiddlewareChain(lines, groupMws, handler, '()', timeoutMs);
            } else {
              this._emitHandlerCall(lines, `${handler}()`, timeoutMs);
            }
          } else if (handlerParams[0] === 'req') {
            lines.push(`  const __url = new URL(req.url);`);
            lines.push(`  const __ctx = {`);
            lines.push(`    method: req.method, path: __url.pathname, params,`);
            lines.push(`    query: __parseQuery(__url.searchParams),`);
            lines.push(`    headers: Object.fromEntries(req.headers),`);
            lines.push(`    cookies: __parseCookies(req.headers.get("cookie")),`);
            lines.push(`    body: null, raw: req, locals: __getLocals(),`);
            lines.push(`  };`);
            if (sessionConfig) {
              lines.push(`  if (req.__session) __ctx.session = req.__session;`);
            }
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
              lines.push(`  __ctx.body = await __parseBody(req);`);
            }
            const remainingParams = handlerParams.slice(1);
            if (remainingParams.length > 0) {
              if (['POST', 'PUT', 'PATCH'].includes(method)) {
                lines.push(`  const __body = __ctx.body || {};`);
                for (const pn of remainingParams) {
                  lines.push(`  const ${pn} = params.${pn} ?? __body.${pn};`);
                }
              } else {
                for (const pn of remainingParams) {
                  lines.push(`  const ${pn} = params.${pn} ?? __ctx.query.${pn};`);
                }
              }
              if (handlerDecl) {
                const validationChecks = this._genValidationCode(handlerDecl.params.slice(1));
                if (validationChecks.length > 0) {
                  lines.push(`  const __validationErrors = [];`);
                  for (const check of validationChecks) lines.push(check);
                  lines.push(`  if (__validationErrors.length > 0) return Response.json({ error: "Validation failed", details: __validationErrors }, { status: 400 });`);
                }
              }
              if (groupMws.length > 0) {
                this._emitGroupMiddlewareChain(lines, groupMws, handler, `(__ctx, ${remainingParams.join(', ')})`, timeoutMs);
              } else {
                this._emitHandlerCall(lines, `${handler}(__ctx, ${remainingParams.join(', ')})`, timeoutMs);
              }
            } else {
              if (groupMws.length > 0) {
                this._emitGroupMiddlewareChain(lines, groupMws, handler, '(__ctx)', timeoutMs);
              } else {
                this._emitHandlerCall(lines, `${handler}(__ctx)`, timeoutMs);
              }
            }
          } else {
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
              lines.push(`  const __body = (await __parseBody(req)) || {};`);
              for (const pn of handlerParams) {
                lines.push(`  const ${pn} = params.${pn} ?? __body.${pn};`);
              }
            } else {
              lines.push(`  const __url = new URL(req.url);`);
              for (const pn of handlerParams) {
                lines.push(`  const ${pn} = params.${pn} ?? __url.searchParams.get(${JSON.stringify(pn)});`);
              }
            }
            if (handlerDecl) {
              const validationChecks = this._genValidationCode(handlerDecl.params);
              if (validationChecks.length > 0) {
                lines.push(`  const __validationErrors = [];`);
                for (const check of validationChecks) lines.push(check);
                lines.push(`  if (__validationErrors.length > 0) return Response.json({ error: "Validation failed", details: __validationErrors }, { status: 400 });`);
              }
            }
            if (groupMws.length > 0) {
              this._emitGroupMiddlewareChain(lines, groupMws, handler, `(${handlerParams.join(', ')})`, timeoutMs);
            } else {
              this._emitHandlerCall(lines, `${handler}(${handlerParams.join(', ')})`, timeoutMs);
            }
          }
        } else {
          this._emitHandlerCall(lines, `${handler}(req, params)`, timeoutMs);
        }

        lines.push(`  if (__result instanceof Response) return __result;`);
        lines.push(`  return Response.json(__result);`);
        lines.push(`});`);
        lines.push('');
      }
    }

    // ════════════════════════════════════════════════════════════
    // 17b. OpenAPI Spec Generation — auto-generate from routes + types
    // ════════════════════════════════════════════════════════════
    if (routes.length > 0) {
      const tovaTypeToJsonSchema = (typeName) => {
        switch (typeName) {
          case 'Int': return '{ "type": "integer" }';
          case 'Float': return '{ "type": "number" }';
          case 'Bool': return '{ "type": "boolean" }';
          case 'String': return '{ "type": "string" }';
          default: return `{ "$ref": "#/components/schemas/${typeName}" }`;
        }
      };

      lines.push('// ── OpenAPI Spec ──');
      lines.push('const __openApiSpec = {');
      lines.push('  openapi: "3.0.3",');
      lines.push(`  info: { title: ${JSON.stringify(blockName || 'Tova API')}, version: "1.0.0" },`);
      lines.push('  paths: {},');
      lines.push('  components: { schemas: {} },');
      lines.push('};');

      // Generate schemas from shared types
      for (const [typeName, typeInfo] of sharedTypes) {
        const props = typeInfo.fields.map(f => {
          let jsonType;
          switch (f.type) {
            case 'Int': jsonType = '"integer"'; break;
            case 'Float': jsonType = '"number"'; break;
            case 'Bool': jsonType = '"boolean"'; break;
            case 'String': jsonType = '"string"'; break;
            case 'Array': jsonType = '"array"'; break;
            default: jsonType = '"string"'; break;
          }
          return `${f.name}: { type: ${jsonType} }`;
        }).join(', ');
        lines.push(`__openApiSpec.components.schemas[${JSON.stringify(typeName)}] = { type: "object", properties: { ${props} } };`);
      }

      // Generate paths from routes
      for (const route of routes) {
        const method = route.method.toLowerCase();
        const path = route.path.replace(/:([^/]+)/g, '{$1}');
        const handlerName = route.handler.type === 'Identifier' ? route.handler.name : null;
        const handlerDecl = handlerName ? fnDeclMap.get(handlerName) : null;

        lines.push(`if (!__openApiSpec.paths[${JSON.stringify(path)}]) __openApiSpec.paths[${JSON.stringify(path)}] = {};`);
        lines.push(`__openApiSpec.paths[${JSON.stringify(path)}][${JSON.stringify(method)}] = {`);

        // Summary from handler name
        if (handlerName) {
          lines.push(`  summary: ${JSON.stringify(handlerName.replace(/_/g, ' '))},`);
        }

        // Parameters from path params and handler params
        const pathParams = (route.path.match(/:([^/]+)/g) || []).map(p => p.slice(1));
        if (pathParams.length > 0) {
          lines.push('  parameters: [');
          for (const pp of pathParams) {
            lines.push(`    { name: ${JSON.stringify(pp)}, in: "path", required: true, schema: { type: "string" } },`);
          }
          lines.push('  ],');
        }

        // Request body schema for POST/PUT/PATCH
        if (['post', 'put', 'patch'].includes(method) && handlerDecl) {
          const bodyParams = handlerDecl.params.filter(p => p.name !== 'req' && !pathParams.includes(p.name));
          if (bodyParams.length > 0) {
            lines.push('  requestBody: {');
            lines.push('    content: { "application/json": { schema: { type: "object", properties: {');
            for (const bp of bodyParams) {
              const ta = bp.typeAnnotation;
              if (ta && ta.name && sharedTypes.has(ta.name)) {
                lines.push(`      ${bp.name}: { "$ref": "#/components/schemas/${ta.name}" },`);
              } else if (ta) {
                let jsonType;
                switch (ta.name) {
                  case 'Int': jsonType = '"integer"'; break;
                  case 'Float': jsonType = '"number"'; break;
                  case 'Bool': jsonType = '"boolean"'; break;
                  default: jsonType = '"string"'; break;
                }
                lines.push(`      ${bp.name}: { type: ${jsonType} },`);
              } else {
                lines.push(`      ${bp.name}: { type: "string" },`);
              }
            }
            lines.push('    } } } },');
            lines.push('  },');
          }
        }

        // Response schema from return type
        if (handlerDecl && handlerDecl.returnType) {
          const rt = handlerDecl.returnType;
          if (rt.type === 'ArrayTypeAnnotation' && rt.elementType) {
            const elName = rt.elementType.name;
            if (sharedTypes.has(elName)) {
              lines.push(`  responses: { "200": { description: "Success", content: { "application/json": { schema: { type: "array", items: { "$ref": "#/components/schemas/${elName}" } } } } } },`);
            } else {
              lines.push('  responses: { "200": { description: "Success" } },');
            }
          } else if (rt.type === 'TypeAnnotation' && sharedTypes.has(rt.name)) {
            lines.push(`  responses: { "200": { description: "Success", content: { "application/json": { schema: { "$ref": "#/components/schemas/${rt.name}" } } } } },`);
          } else {
            lines.push('  responses: { "200": { description: "Success" } },');
          }
        } else {
          lines.push('  responses: { "200": { description: "Success" } },');
        }

        lines.push('};');
      }

      // Add the /docs endpoint
      lines.push('__addRoute("GET", "/openapi.json", async () => {');
      lines.push('  return Response.json(__openApiSpec);');
      lines.push('});');
      lines.push('__addRoute("GET", "/docs", async () => {');
      lines.push('  const html = `<!DOCTYPE html><html><head><title>API Docs</title>');
      lines.push('    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>');
      lines.push('    <body><div id="swagger-ui"></div>');
      lines.push('    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>');
      lines.push('    <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });</script>');
      lines.push('    </body></html>`;');
      lines.push('  return new Response(html, { headers: { "Content-Type": "text/html" } });');
      lines.push('});');
      lines.push('');
    }

    // Include __contains helper if needed
    if (this._needsContainsHelper) {
      lines.push(this.getContainsHelper());
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 18. Logging, Static files, WebSocket
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Structured Logging ──');
    lines.push('let __reqCounter = 0;');
    lines.push('function __genRequestId() {');
    lines.push('  return `${Date.now().toString(36)}-${(++__reqCounter).toString(36)}`;');
    lines.push('}');
    lines.push('const __logLevels = { debug: 0, info: 1, warn: 2, error: 3 };');
    lines.push('const __logMinLevel = __logLevels[process.env.LOG_LEVEL || "info"] || 1;');
    lines.push('let __logFile = null;');
    lines.push('if (process.env.LOG_FILE) {');
    lines.push('  const __fs = await import("node:fs");');
    lines.push('  __logFile = __fs.createWriteStream(process.env.LOG_FILE, { flags: "a" });');
    lines.push('}');
    lines.push('function __log(level, msg, meta = {}) {');
    lines.push('  if ((__logLevels[level] || 0) < __logMinLevel) return;');
    lines.push('  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, msg, ...meta });');
    lines.push('  console.log(entry);');
    lines.push('  if (__logFile) __logFile.write(entry + "\\n");');
    lines.push('}');
    lines.push('');

    if (staticDecl) {
      lines.push('// ── Static File Serving ──');
      lines.push(`const __staticPrefix = ${JSON.stringify(staticDecl.path)};`);
      lines.push(`const __staticDir = ${JSON.stringify(staticDecl.dir)};`);
      if (staticDecl.fallback) {
        lines.push(`const __staticFallback = ${JSON.stringify(staticDecl.fallback)};`);
      }
      lines.push('async function __serveStatic(pathname, req) {');
      lines.push('  const filePath = __staticDir + pathname.slice(__staticPrefix.length);');
      lines.push('  try {');
      lines.push('    const file = Bun.file(filePath);');
      lines.push('    if (await file.exists()) {');
      lines.push('      const stat = { size: file.size, lastModified: file.lastModified };');
      lines.push('      const etagVal = `"${stat.size.toString(36)}-${stat.lastModified.toString(36)}"`;');
      lines.push('      if (req && req.headers.get("If-None-Match") === etagVal) {');
      lines.push('        return new Response(null, { status: 304 });');
      lines.push('      }');
      const staticCacheAge = cacheConfig && cacheConfig.max_age ? this.genExpression(cacheConfig.max_age) : '3600';
      lines.push(`      return new Response(file, { headers: { ETag: etagVal, "Cache-Control": "public, max-age=${staticCacheAge}" } });`);
      lines.push('    }');
      lines.push('  } catch {}');
      if (staticDecl.fallback) {
        lines.push('  try {');
        lines.push('    const fb = Bun.file(__staticDir + "/" + __staticFallback);');
        lines.push('    if (await fb.exists()) return new Response(fb, { headers: { "Content-Type": "text/html" } });');
        lines.push('  } catch {}');
      }
      lines.push('  return null;');
      lines.push('}');
      lines.push('');
    }

    if (wsDecl) {
      lines.push('// ── WebSocket Handlers ──');
      lines.push('const __wsClients = new Set();');
      lines.push('const __wsRooms = new Map();');
      lines.push('function broadcast(data, exclude = null) {');
      lines.push('  const msg = typeof data === "string" ? data : JSON.stringify(data);');
      lines.push('  for (const c of __wsClients) { if (c !== exclude) c.send(msg); }');
      lines.push('}');
      lines.push('function join(ws, room) {');
      lines.push('  if (!__wsRooms.has(room)) __wsRooms.set(room, new Set());');
      lines.push('  __wsRooms.get(room).add(ws);');
      lines.push('}');
      lines.push('function leave(ws, room) {');
      lines.push('  const r = __wsRooms.get(room);');
      lines.push('  if (r) { r.delete(ws); if (r.size === 0) __wsRooms.delete(room); }');
      lines.push('}');
      lines.push('function broadcast_to(room, data, exclude = null) {');
      lines.push('  const r = __wsRooms.get(room);');
      lines.push('  if (!r) return;');
      lines.push('  const msg = typeof data === "string" ? data : JSON.stringify(data);');
      lines.push('  for (const c of r) { if (c !== exclude) c.send(msg); }');
      lines.push('}');
      lines.push('const __wsHandlers = {};');
      for (const [event, handler] of Object.entries(wsDecl.handlers)) {
        if (!handler) continue;
        const params = handler.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of handler.params) this.declareVar(p.name);
        const body = this.genBlockBody(handler.body);
        this.popScope();
        lines.push(`__wsHandlers.${event} = function(${params}) {`);
        lines.push(body);
        lines.push('};');
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 19. Schedule helpers (F8) — interval/cron parser
    // ════════════════════════════════════════════════════════════
    if (schedules.length > 0) {
      lines.push('// ── Schedule Helpers ──');
      lines.push('function __parseInterval(pattern) {');
      lines.push('  const m = pattern.match(/^(\\d+)(s|m|h)$/);');
      lines.push('  if (!m) return null;');
      lines.push('  const val = parseInt(m[1], 10);');
      lines.push('  switch (m[2]) {');
      lines.push('    case "s": return val * 1000;');
      lines.push('    case "m": return val * 60 * 1000;');
      lines.push('    case "h": return val * 60 * 60 * 1000;');
      lines.push('  }');
      lines.push('}');
      lines.push('function __cronFieldMatches(field, value) {');
      lines.push('  if (field === "*") return true;');
      lines.push('  for (const part of field.split(",")) {');
      lines.push('    if (part.includes("/")) {');
      lines.push('      const [range, stepStr] = part.split("/");');
      lines.push('      const step = parseInt(stepStr, 10);');
      lines.push('      if (range === "*") { if (value % step === 0) return true; }');
      lines.push('      else if (range.includes("-")) {');
      lines.push('        const [lo, hi] = range.split("-").map(Number);');
      lines.push('        if (value >= lo && value <= hi && (value - lo) % step === 0) return true;');
      lines.push('      }');
      lines.push('    } else if (part.includes("-")) {');
      lines.push('      const [lo, hi] = part.split("-").map(Number);');
      lines.push('      if (value >= lo && value <= hi) return true;');
      lines.push('    } else { if (parseInt(part, 10) === value) return true; }');
      lines.push('  }');
      lines.push('  return false;');
      lines.push('}');
      lines.push('function __cronMatches(parts, date) {');
      lines.push('  const fields = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];');
      lines.push('  for (let i = 0; i < 5; i++) {');
      lines.push('    if (!__cronFieldMatches(parts[i], fields[i])) return false;');
      lines.push('  }');
      lines.push('  return true;');
      lines.push('}');
      lines.push('const __scheduleIntervals = [];');

      for (let si = 0; si < schedules.length; si++) {
        const sched = schedules[si];
        const fnName = sched.name || `__scheduled_${si}`;
        const params = sched.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of sched.params) this.declareVar(p.name);
        const body = this.genBlockBody(sched.body);
        this.popScope();
        lines.push(`async function ${fnName}(${params}) {`);
        lines.push(body);
        lines.push('}');
        const pattern = sched.pattern;
        // Check if it's a simple interval (no spaces) or cron (has spaces)
        if (pattern.includes(' ')) {
          // Cron expression
          const cronParts = JSON.stringify(pattern.split(/\s+/));
          lines.push(`__scheduleIntervals.push(setInterval(() => {`);
          lines.push(`  if (__cronMatches(${cronParts}, new Date())) ${fnName}();`);
          lines.push(`}, 60000));`);
        } else {
          // Simple interval
          lines.push(`__scheduleIntervals.push(setInterval(${fnName}, __parseInterval(${JSON.stringify(pattern)})));`);
        }
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 20. Middleware chain, Graceful Drain
    // ════════════════════════════════════════════════════════════
    if (globalMiddlewares.length > 0) {
      lines.push('// ── Middleware Chain ──');
      const mwNames = globalMiddlewares.map(m => m.name);
      lines.push(`const __middlewares = [${mwNames.join(', ')}];`);
      lines.push('');
    }

    lines.push('// ── Graceful Drain ──');
    lines.push('let __activeRequests = 0;');
    lines.push('let __shuttingDown = false;');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 21. Request Handler — with global rate limit check (F2)
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Request Handler ──');
    lines.push('async function __handleRequest(req) {');

    lines.push('  if (__shuttingDown) {');
    lines.push('    return new Response("Service Unavailable", { status: 503 });');
    lines.push('  }');
    lines.push('  __activeRequests++;');

    lines.push('  const url = new URL(req.url);');
    lines.push('  const __rid = req.headers.get("X-Request-Id") || __genRequestId();');
    lines.push('  const __startTime = Date.now();');
    lines.push('  const __cors = __getCorsHeaders(req);');

    lines.push('  return __requestContext.run({ rid: __rid, locals: {} }, async () => {');
    lines.push('  try {');

    // WebSocket upgrade
    if (wsDecl) {
      // Determine if WS auth is needed:
      // - If ws has auth: false, skip auth even if authConfig exists
      // - If ws has auth: true or authConfig exists (and ws doesn't disable), require auth
      const wsAuthExplicitlyDisabled = wsDecl.config && wsDecl.config.auth &&
        wsDecl.config.auth.type === 'BooleanLiteral' && wsDecl.config.auth.value === false;
      const wsNeedsAuth = !wsAuthExplicitlyDisabled && (authConfig || (wsDecl.config && wsDecl.config.auth &&
        !(wsDecl.config.auth.type === 'BooleanLiteral' && wsDecl.config.auth.value === false)));

      lines.push('  if (req.headers.get("upgrade") === "websocket") {');
      if (wsNeedsAuth) {
        lines.push('    try {');
        lines.push('      const __wsUser = await __authenticate(req);');
        lines.push('      const upgraded = __server.upgrade(req, { data: { rid: __rid, user: __wsUser } });');
        lines.push('      if (upgraded) return undefined;');
        lines.push('      return new Response("WebSocket upgrade failed", { status: 400 });');
        lines.push('    } catch (__authErr) {');
        lines.push('      return Response.json({ error: "Unauthorized" }, { status: 401 });');
        lines.push('    }');
      } else {
        lines.push('    const upgraded = __server.upgrade(req, { data: { rid: __rid } });');
        lines.push('    if (upgraded) return undefined;');
        lines.push('    return new Response("WebSocket upgrade failed", { status: 400 });');
      }
      lines.push('  }');
    }

    lines.push('  if (req.method === "OPTIONS") {');
    lines.push('    return new Response(null, { status: 204, headers: __cors });');
    lines.push('  }');

    // Max body size check
    lines.push('  const __contentLength = parseInt(req.headers.get("Content-Length") || "0", 10);');
    lines.push('  if (__contentLength > __maxBodySize) {');
    lines.push('    return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });');
    lines.push('  }');

    // Global rate limit check (F2)
    if (rateLimitConfig) {
      lines.push('  const __clientIp = req.headers.get("x-forwarded-for") || "unknown";');
      lines.push('  const __rl = __checkRateLimit(__clientIp, __rateLimitMax, __rateLimitWindow);');
      lines.push('  if (__rl.limited) {');
      lines.push('    return Response.json({ error: "Too Many Requests" }, { status: 429, headers: { ...__cors, "Retry-After": String(__rl.retryAfter) } });');
      lines.push('  }');
    }

    // Session loading
    if (sessionConfig) {
      lines.push('  let __sessionId = null;');
      lines.push('  let __sessionIsNew = false;');
      lines.push('  const __cookies = __parseCookies(req.headers.get("cookie"));');
      lines.push('  const __signedSid = __cookies[__sessionCookieName];');
      lines.push('  if (__signedSid) {');
      lines.push('    __sessionId = await __verifySessionId(__signedSid);');
      lines.push('  }');
      lines.push('  if (!__sessionId) {');
      lines.push('    __sessionId = crypto.randomUUID();');
      lines.push('    __sessionIsNew = true;');
      lines.push('  }');
      lines.push('  req.__session = __createSession(__sessionId);');
    }

    // Static file serving
    if (staticDecl) {
      lines.push(`  if (url.pathname.startsWith(__staticPrefix)) {`);
      lines.push('    const __staticRes = await __serveStatic(url.pathname, req);');
      lines.push('    if (__staticRes) return __staticRes;');
      lines.push('  }');
    }

    // Route matching
    lines.push('  for (const route of __routes) {');
    lines.push('    if (req.method === route.method || (route.method === "GET" && req.method === "HEAD" && !__routes.some(r => r.method === "HEAD" && r.regex.source === route.regex.source))) {');
    lines.push('      const match = url.pathname.match(route.regex);');
    lines.push('      if (match) {');

    if (globalMiddlewares.length > 0) {
      lines.push('        const __handler = async (__req) => route.handler(__req, match.groups || {});');
      lines.push('        const __chain = __middlewares.reduceRight(');
      lines.push('          (next, mw) => async (__req) => mw(__req, next),');
      lines.push('          __handler');
      lines.push('        );');
      lines.push('        try {');
      lines.push('          const res = await __chain(req);');
      lines.push('          __log("info", `${req.method} ${url.pathname}`, { rid: __rid, status: res.status, ms: Date.now() - __startTime });');
      lines.push('          const headers = new Headers(res.headers);');
      lines.push('          for (const [k, v] of Object.entries(__cors)) headers.set(k, v);');
      lines.push('          return new Response(res.body, { status: res.status, headers });');
      lines.push('        } catch (err) {');
      lines.push('          if (err.message === "__BODY_TOO_LARGE__") return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });');
      if (errorHandler) {
        lines.push('          try {');
        lines.push('            const errRes = await __errorHandler(err, req);');
        lines.push('            if (errRes instanceof Response) {');
        lines.push('              const headers = new Headers(errRes.headers);');
        lines.push('              for (const [k, v] of Object.entries(__cors)) headers.set(k, v);');
        lines.push('              return new Response(errRes.body, { status: errRes.status, headers });');
        lines.push('            }');
        lines.push('            return Response.json(errRes, { status: 500, headers: __cors });');
        lines.push('          } catch { /**/ }');
      }
      lines.push('          __log("error", `Unhandled error: ${err.message}`, { error: err.stack || err.message });');
      lines.push('          return Response.json({ error: "Internal Server Error" }, { status: 500, headers: __cors });');
      lines.push('        }');
    } else {
      lines.push('        try {');
      lines.push('          const res = await route.handler(req, match.groups || {});');
      lines.push('          __log("info", `${req.method} ${url.pathname}`, { rid: __rid, status: res.status, ms: Date.now() - __startTime });');
      lines.push('          const headers = new Headers(res.headers);');
      lines.push('          for (const [k, v] of Object.entries(__cors)) headers.set(k, v);');
      lines.push('          return new Response(res.body, { status: res.status, headers });');
      lines.push('        } catch (err) {');
      lines.push('          if (err.message === "__BODY_TOO_LARGE__") return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });');
      if (errorHandler) {
        lines.push('          try {');
        lines.push('            const errRes = await __errorHandler(err, req);');
        lines.push('            if (errRes instanceof Response) {');
        lines.push('              const headers = new Headers(errRes.headers);');
        lines.push('              for (const [k, v] of Object.entries(__cors)) headers.set(k, v);');
        lines.push('              return new Response(errRes.body, { status: errRes.status, headers });');
        lines.push('            }');
        lines.push('            return Response.json(errRes, { status: 500, headers: __cors });');
        lines.push('          } catch { /**/ }');
      }
      lines.push('          __log("error", `Unhandled error: ${err.message}`, { error: err.stack || err.message });');
      lines.push('          return Response.json({ error: "Internal Server Error" }, { status: 500, headers: __cors });');
      lines.push('        }');
    }

    lines.push('      }');
    lines.push('    }');
    lines.push('  }');

    // Serve client HTML at root
    lines.push('  if (url.pathname === "/" && typeof __clientHTML !== "undefined") {');
    lines.push('    return new Response(__clientHTML, { status: 200, headers: { "Content-Type": "text/html", ...(__cors) } });');
    lines.push('  }');
    lines.push('  const __notFound = Response.json({ error: "Not Found" }, { status: 404, headers: __cors });');
    lines.push('  __log("warn", "Not Found", { rid: __rid, method: req.method, path: url.pathname, status: 404, ms: Date.now() - __startTime });');
    lines.push('  return __notFound;');

    if (sessionConfig) {
      lines.push('  } catch (__e) { throw __e; }');
      lines.push('  }).then(async (__res) => {');
      lines.push('    if (req.__session && req.__session.__flush) await req.__session.__flush();');
      lines.push('    if (__res && __sessionIsNew) {');
      lines.push('      const __signed = await __signSessionId(__sessionId);');
      lines.push('      const __h = new Headers(__res.headers);');
      lines.push('      __h.set("Set-Cookie", `${__sessionCookieName}=${__signed}; Path=/; HttpOnly; Max-Age=${__sessionMaxAge}`);');
      lines.push('      return new Response(__res.body, { status: __res.status, headers: __h });');
      lines.push('    }');
      lines.push('    return __res;');
      lines.push('  }, async (__e) => {');
      lines.push('    if (req.__session && req.__session.__flush) await req.__session.__flush();');
      lines.push('    throw __e;');
      lines.push('  }).finally(() => { __activeRequests--; });');
    } else {
      lines.push('  } finally {');
      lines.push('    __activeRequests--;');
      lines.push('  }');
      lines.push('  });');
    }
    lines.push('}');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 22. Bun.serve()
    // ════════════════════════════════════════════════════════════
    const label = blockName ? ` [${blockName}]` : '';
    const portVar = blockName ? `PORT_${blockName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : 'PORT';
    lines.push('// ── Start Server ──');
    lines.push(`const __port = process.env.${portVar} || process.env.PORT || 3000;`);
    // Compression wrapper
    if (compressionConfig) {
      lines.push('const __fetchHandler = async (req) => {');
      lines.push('  const res = await __handleRequest(req);');
      lines.push('  if (!res) return res;');
      lines.push('  return __compressResponse(req, res);');
      lines.push('};');
    }
    lines.push(`const __server = Bun.serve({`);
    lines.push(`  port: __port,`);
    lines.push(`  maxRequestBodySize: __maxBodySize,`);
    lines.push(`  fetch: ${compressionConfig ? '__fetchHandler' : '__handleRequest'},`);
    if (tlsConfig) {
      const certExpr = tlsConfig.cert ? this.genExpression(tlsConfig.cert) : 'undefined';
      const keyExpr = tlsConfig.key ? this.genExpression(tlsConfig.key) : 'undefined';
      lines.push(`  tls: {`);
      lines.push(`    cert: Bun.file(${certExpr}),`);
      lines.push(`    key: Bun.file(${keyExpr}),`);
      if (tlsConfig.ca) {
        lines.push(`    ca: Bun.file(${this.genExpression(tlsConfig.ca)}),`);
      }
      lines.push(`  },`);
    }
    if (wsDecl) {
      lines.push(`  websocket: {`);
      if (wsDecl.handlers.on_open) {
        lines.push(`    open(ws) { __wsClients.add(ws); __wsHandlers.on_open(ws); },`);
      } else {
        lines.push(`    open(ws) { __wsClients.add(ws); },`);
      }
      if (wsDecl.handlers.on_message) {
        lines.push(`    message(ws, message) { __wsHandlers.on_message(ws, message); },`);
      }
      if (wsDecl.handlers.on_close) {
        lines.push(`    close(ws, code, reason) { __wsClients.delete(ws); for (const [,r] of __wsRooms) r.delete(ws); __wsHandlers.on_close(ws, code, reason); },`);
      } else {
        lines.push(`    close(ws) { __wsClients.delete(ws); for (const [,r] of __wsRooms) r.delete(ws); },`);
      }
      if (wsDecl.handlers.on_error) {
        lines.push(`    error(ws, error) { __wsHandlers.on_error(ws, error); },`);
      }
      lines.push(`  },`);
    }
    lines.push(`});`);
    lines.push(`console.log(\`Tova server${label} running on \${__server.url}\`);`);
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // 23. on_start hooks (F3) + schedule intervals (F8)
    // ════════════════════════════════════════════════════════════
    if (onStartHooks.length > 0) {
      lines.push('// ── Lifecycle: on_start ──');
      for (let hi = 0; hi < onStartHooks.length; hi++) {
        const hook = onStartHooks[hi];
        const params = hook.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of hook.params) this.declareVar(p.name);
        const body = this.genBlockBody(hook.body);
        this.popScope();
        lines.push(`(async (${params}) => {`);
        lines.push(body);
        lines.push('})();');
      }
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // 24. Graceful Shutdown — on_stop hooks (F3) + clearInterval (F8)
    // ════════════════════════════════════════════════════════════
    lines.push('// ── Graceful Shutdown ──');
    lines.push('async function __shutdown() {');
    lines.push(`  console.log(\`Tova server${label} shutting down...\`);`);
    lines.push('  __shuttingDown = true;');
    lines.push('  __server.stop();');
    lines.push('  const __drainStart = Date.now();');
    lines.push('  while (__activeRequests > 0 && Date.now() - __drainStart < 10000) {');
    lines.push('    await new Promise(r => setTimeout(r, 50));');
    lines.push('  }');

    // on_stop hooks
    if (onStopHooks.length > 0) {
      for (let hi = 0; hi < onStopHooks.length; hi++) {
        const hook = onStopHooks[hi];
        const params = hook.params.map(p => p.name).join(', ');
        this.pushScope();
        for (const p of hook.params) this.declareVar(p.name);
        const body = this.genBlockBody(hook.body);
        this.popScope();
        lines.push(`  await (async (${params}) => {`);
        lines.push(body);
        lines.push('  })();');
      }
    }

    // Schedule cleanup
    if (schedules.length > 0) {
      lines.push('  for (const __iv of __scheduleIntervals) clearInterval(__iv);');
    }

    if (dbConfig || usesDb) {
      if (dbDriver !== 'sqlite') {
        lines.push('  await db.close();');
      } else {
        lines.push('  db.close();');
      }
    }
    if (backgroundJobs.length > 0) {
      lines.push('  // Wait for in-flight background jobs');
      lines.push('  const __bgDrainStart = Date.now();');
      lines.push('  while (__jobProcessing && Date.now() - __bgDrainStart < 5000) {');
      lines.push('    await new Promise(r => setTimeout(r, 50));');
      lines.push('  }');
    }
    lines.push('  if (__logFile) __logFile.end();');
    lines.push('  process.exit(0);');
    lines.push('}');
    lines.push('process.on("SIGINT", __shutdown);');
    lines.push('process.on("SIGTERM", __shutdown);');

    return lines.join('\n');
  }

  // Helper: emit group middleware chain wrapping a handler call
  _emitGroupMiddlewareChain(lines, groupMws, handler, callArgs, timeoutMs) {
    lines.push(`  const __grpHandler = async (__req) => ${handler}${callArgs};`);
    lines.push(`  const __grpChain = [${groupMws.join(', ')}].reduceRight(`);
    lines.push(`    (next, mw) => async (__req) => mw(__req, next),`);
    lines.push(`    __grpHandler`);
    lines.push(`  );`);
    this._emitHandlerCall(lines, `__grpChain(req)`, timeoutMs);
  }

  generateTests(testBlocks) {
    const lines = [];
    lines.push('import { describe, test, expect } from "bun:test";');
    lines.push('');
    lines.push('// ── Test Helpers ──');
    lines.push('async function request(method, path, options = {}) {');
    lines.push('  const url = new URL(path, "http://localhost");');
    lines.push('  const init = { method };');
    lines.push('  if (options.headers) init.headers = new Headers(options.headers);');
    lines.push('  else init.headers = new Headers();');
    lines.push('  if (options.body) {');
    lines.push('    init.headers.set("Content-Type", "application/json");');
    lines.push('    init.body = JSON.stringify(options.body);');
    lines.push('  }');
    lines.push('  const req = new Request(url.toString(), init);');
    lines.push('  const res = await __handleRequest(req);');
    lines.push('  let data = null;');
    lines.push('  try { data = await res.clone().json(); } catch {}');
    lines.push('  return { status: res.status, headers: Object.fromEntries(res.headers), data, raw: res };');
    lines.push('}');
    lines.push('function assert(condition, message) {');
    lines.push('  if (!condition) throw new Error(message || "Assertion failed");');
    lines.push('}');
    lines.push('');

    for (const block of testBlocks) {
      const name = block.name || 'Tests';
      lines.push(`describe(${JSON.stringify(name)}, () => {`);
      for (const stmt of block.body) {
        if (stmt.type === 'FunctionDeclaration') {
          const fnName = stmt.name;
          const displayName = fnName.replace(/_/g, ' ');
          this.pushScope();
          for (const p of (stmt.params || [])) {
            const pName = typeof p === 'string' ? p : (p.name || p.identifier);
            if (pName) this.declareVar(pName);
          }
          const body = this.genBlockBody(stmt.body);
          this.popScope();
          lines.push(`  test(${JSON.stringify(displayName)}, async () => {`);
          lines.push(body);
          lines.push('  });');
        } else {
          lines.push('  ' + this.generateStatement(stmt));
        }
      }
      lines.push('});');
      lines.push('');
    }

    return lines.join('\n');
  }
}
