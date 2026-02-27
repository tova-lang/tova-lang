// Edge/serverless code generator for the Tova language
// Produces deployment-ready code for Cloudflare Workers, Deno Deploy, Vercel Edge, AWS Lambda, or Bun.

import { createRequire } from 'module';
import { BaseCodegen } from './base-codegen.js';

const _require = createRequire(import.meta.url);
let _SecurityCodegen;

const DEFAULT_TARGET = 'cloudflare';

export class EdgeCodegen extends BaseCodegen {

  /**
   * Merge all EdgeBlock nodes with the same name into a single config.
   */
  static mergeEdgeBlocks(edgeBlocks) {
    let target = DEFAULT_TARGET;
    const routes = [];
    const functions = [];
    const middlewares = [];
    const bindings = { kv: [], sql: [], storage: [], queue: [] };
    const envVars = [];
    const secrets = [];
    const schedules = [];
    const consumers = [];
    const miscStatements = [];
    let healthPath = null;
    let healthChecks = null;
    let corsConfig = null;
    let errorHandler = null;

    for (const block of edgeBlocks) {
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'EdgeConfigField':
            if (stmt.key === 'target' && stmt.value.type === 'StringLiteral') {
              target = stmt.value.value;
            }
            break;
          case 'EdgeKVDeclaration':
            bindings.kv.push(stmt);
            break;
          case 'EdgeSQLDeclaration':
            bindings.sql.push(stmt);
            break;
          case 'EdgeStorageDeclaration':
            bindings.storage.push(stmt);
            break;
          case 'EdgeQueueDeclaration':
            bindings.queue.push(stmt);
            break;
          case 'EdgeEnvDeclaration':
            envVars.push(stmt);
            break;
          case 'EdgeSecretDeclaration':
            secrets.push(stmt);
            break;
          case 'EdgeScheduleDeclaration':
            schedules.push(stmt);
            break;
          case 'EdgeConsumeDeclaration':
            consumers.push(stmt);
            break;
          case 'RouteDeclaration':
            routes.push(stmt);
            break;
          case 'MiddlewareDeclaration':
            middlewares.push(stmt);
            break;
          case 'FunctionDeclaration':
            functions.push(stmt);
            break;
          case 'HealthCheckDeclaration':
            healthPath = stmt.path;
            if (stmt.checks && stmt.checks.length > 0) {
              if (!healthChecks) healthChecks = [];
              healthChecks.push(...stmt.checks);
            }
            break;
          case 'CorsDeclaration':
            corsConfig = stmt.config;
            break;
          case 'ErrorHandlerDeclaration':
            errorHandler = stmt;
            break;
          default:
            miscStatements.push(stmt);
            break;
        }
      }
    }

    return { target, routes, functions, middlewares, bindings, envVars, secrets, schedules, consumers, miscStatements, healthPath, healthChecks, corsConfig, errorHandler };
  }

  /**
   * Generate edge function code for the given target.
   * @param {Object} config — merged config from mergeEdgeBlocks
   * @param {string} sharedCode — shared/top-level compiled code
   * @returns {string} — complete edge function JS
   */
  generate(config, sharedCode, securityConfig = null) {
    const { target } = config;
    switch (target) {
      case 'cloudflare': return this._generateCloudflare(config, sharedCode, securityConfig);
      case 'deno': return this._generateDeno(config, sharedCode, securityConfig);
      case 'vercel': return this._generateVercel(config, sharedCode, securityConfig);
      case 'lambda': return this._generateLambda(config, sharedCode, securityConfig);
      case 'bun': return this._generateBun(config, sharedCode, securityConfig);
      default: return this._generateCloudflare(config, sharedCode, securityConfig);
    }
  }

  // ════════════════════════════════════════════════════════════
  // CORS, Health Check, Error Handler helpers
  // ════════════════════════════════════════════════════════════

  /**
   * Emit CORS helper function. Two modes:
   * - With explicit config: origin-checking __getCorsHeaders(req)
   * - Without config (empty cors {}): wildcard __getCorsHeaders()
   */
  _emitEdgeCors(lines, corsConfig) {
    if (!corsConfig) return;

    lines.push('// ── CORS ──');

    // Check if config has any meaningful keys
    const hasOrigins = corsConfig.origins;
    const hasCredentials = corsConfig.credentials;
    const hasMethods = corsConfig.methods;
    const hasHeaders = corsConfig.headers;
    const hasMaxAge = corsConfig.max_age;
    const hasExplicitConfig = hasOrigins || hasCredentials || hasMethods || hasHeaders || hasMaxAge;

    if (hasExplicitConfig) {
      const origins = hasOrigins ? this.genExpression(corsConfig.origins) : '["*"]';
      const methods = hasMethods ? this.genExpression(corsConfig.methods) + '.join(", ")' : '"GET, POST, PUT, DELETE, PATCH, OPTIONS"';
      const headers = hasHeaders ? this.genExpression(corsConfig.headers) + '.join(", ")' : '"Content-Type, Authorization"';
      const credentials = hasCredentials ? this.genExpression(corsConfig.credentials) : 'false';
      const maxAge = hasMaxAge ? 'String(' + this.genExpression(corsConfig.max_age) + ')' : '"86400"';

      lines.push(`const __corsOrigins = ${origins};`);
      lines.push('function __getCorsHeaders(req) {');
      lines.push('  const origin = (req && req.headers && req.headers.get) ? req.headers.get("Origin") : "*";');
      lines.push('  const allowed = __corsOrigins.includes("*") || __corsOrigins.includes(origin);');
      lines.push('  return {');
      lines.push(`    "Access-Control-Allow-Origin": allowed ? origin : "",`);
      lines.push(`    "Access-Control-Allow-Methods": ${methods},`);
      lines.push(`    "Access-Control-Allow-Headers": ${headers},`);
      lines.push(`    "Access-Control-Allow-Credentials": String(${credentials}),`);
      lines.push(`    "Access-Control-Max-Age": ${maxAge},`);
      lines.push('  };');
      lines.push('}');
    } else {
      // Empty cors {} — open wildcard
      lines.push('const __corsHeaders = {');
      lines.push('  "Access-Control-Allow-Origin": "*",');
      lines.push('  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",');
      lines.push('  "Access-Control-Allow-Headers": "Content-Type, Authorization",');
      lines.push('  "Access-Control-Max-Age": "86400",');
      lines.push('};');
      lines.push('function __getCorsHeaders() { return __corsHeaders; }');
    }
    lines.push('');
  }

  /**
   * Emit health check route registration.
   * @param {string[]} lines — output lines
   * @param {Object} config — merged edge config (needs healthPath, healthChecks)
   * @param {string} format — 'response' or 'lambda'
   */
  _emitEdgeHealthCheck(lines, config, format) {
    if (!config.healthPath) return;

    lines.push('// ── Health Check ──');
    const path = config.healthPath;
    const regexStr = '^' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';

    lines.push(`__routes.push({ method: "GET", pattern: new RegExp(${JSON.stringify(regexStr)}), paramNames: [], handler: async () => {`);

    if (config.healthChecks && config.healthChecks.length > 0) {
      lines.push('  const checks = {};');
      lines.push('  let status = "healthy";');
      if (config.healthChecks.includes('check_memory')) {
        lines.push('  const mem = process.memoryUsage ? process.memoryUsage() : { heapUsed: 0, heapTotal: 1 };');
        lines.push('  const heapPct = mem.heapUsed / mem.heapTotal;');
        lines.push('  checks.memory = { status: heapPct > 0.9 ? "degraded" : "healthy", heapUsed: mem.heapUsed, heapTotal: mem.heapTotal };');
        lines.push('  if (heapPct > 0.9) status = "degraded";');
      }
      if (format === 'lambda') {
        lines.push('  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, checks, timestamp: new Date().toISOString() }) };');
      } else {
        lines.push('  return Response.json({ status, checks, timestamp: new Date().toISOString() });');
      }
    } else {
      if (format === 'lambda') {
        lines.push('  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok" }) };');
      } else {
        lines.push('  return Response.json({ status: "ok" });');
      }
    }

    lines.push('}});');
    lines.push('');
  }

  /**
   * Emit error handler function from ErrorHandlerDeclaration.
   */
  _emitEdgeErrorHandler(lines, errorHandler) {
    if (!errorHandler) return;

    const params = errorHandler.params.map(p => p.name || this.genExpression(p)).join(', ');
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

  /**
   * Generate catch block with optional error handler.
   * @param {string[]} lines — output lines
   * @param {boolean} hasErrorHandler — whether __errorHandler is defined
   * @param {boolean} hasCors — whether CORS headers should be merged
   * @param {string} format — 'response' or 'lambda'
   * @param {string} indent — indentation prefix
   * @param {string} reqVar — name of the request variable
   */
  _emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, format, indent, reqVar) {
    lines.push(`${indent}} catch (e) {`);

    if (hasErrorHandler) {
      lines.push(`${indent}  if (typeof __errorHandler === "function") {`);
      lines.push(`${indent}    try {`);
      lines.push(`${indent}      const __errResult = await __errorHandler(e, ${reqVar});`);

      if (format === 'lambda') {
        lines.push(`${indent}      if (__errResult && __errResult.statusCode) return __errResult;`);
        const lambdaHeaders = hasCors
          ? `{ "Content-Type": "application/json", ...__getCorsHeaders(${reqVar}) }`
          : '{ "Content-Type": "application/json" }';
        lines.push(`${indent}      return { statusCode: 500, headers: ${lambdaHeaders}, body: JSON.stringify(__errResult) };`);
      } else {
        lines.push(`${indent}      if (__errResult instanceof Response) return __errResult;`);
        const respHeaders = hasCors
          ? `{ "Content-Type": "application/json", ...__getCorsHeaders(${reqVar}) }`
          : '{ "Content-Type": "application/json" }';
        lines.push(`${indent}      return new Response(JSON.stringify(__errResult), { status: 500, headers: ${respHeaders} });`);
      }
      lines.push(`${indent}    } catch (_) {}`);
      lines.push(`${indent}  }`);
    }

    if (format === 'lambda') {
      const fallbackHeaders = hasCors
        ? `{ "Content-Type": "application/json", ...__getCorsHeaders(${reqVar}) }`
        : '{ "Content-Type": "application/json" }';
      lines.push(`${indent}  return { statusCode: 500, headers: ${fallbackHeaders}, body: JSON.stringify({ error: e.message }) };`);
    } else {
      if (hasCors) {
        lines.push(`${indent}  return new Response(JSON.stringify({ error: e.message }), {`);
        lines.push(`${indent}    status: 500,`);
        lines.push(`${indent}    headers: { "Content-Type": "application/json", ...__getCorsHeaders(${reqVar}) }`);
        lines.push(`${indent}  });`);
      } else {
        lines.push(`${indent}  return new Response(JSON.stringify({ error: e.message }), {`);
        lines.push(`${indent}    status: 500,`);
        lines.push(`${indent}    headers: { "Content-Type": "application/json" }`);
        lines.push(`${indent}  });`);
      }
    }
    lines.push(`${indent}}`);
  }

  // ════════════════════════════════════════════════════════════
  // Security helpers
  // ════════════════════════════════════════════════════════════

  /**
   * Emit security code (roles, auth, protection, sanitization) from security block config.
   * Returns { hasAuth, hasProtect, hasAutoSanitize } flags.
   */
  _emitEdgeSecurity(lines, securityConfig) {
    const noSec = { hasAuth: false, hasProtect: false, hasAutoSanitize: false };
    if (!securityConfig) return noSec;

    if (!_SecurityCodegen) _SecurityCodegen = _require('./security-codegen.js').SecurityCodegen;
    const secGen = new _SecurityCodegen();
    const fragments = secGen.generateServerSecurity(securityConfig);

    if (fragments.roleDefinitions) {
      lines.push(fragments.roleDefinitions);
      lines.push('');
    }
    if (fragments.protectCode) {
      lines.push(fragments.protectCode);
      lines.push('');
    }
    if (fragments.sensitiveCode) {
      lines.push(fragments.sensitiveCode);
      lines.push('');
    }
    if (fragments.cspCode) {
      lines.push(fragments.cspCode);
      lines.push('');
    }
    if (fragments.auditCode) {
      lines.push(fragments.auditCode);
      lines.push('');
    }

    const hasAuth = this._emitEdgeAuth(lines, securityConfig);

    return {
      hasAuth,
      hasProtect: !!fragments.protectCode,
      hasAutoSanitize: fragments.hasAutoSanitize,
    };
  }

  /**
   * Emit JWT auth verification function for edge runtimes.
   * Uses Web Crypto API (available on all edge targets).
   */
  _emitEdgeAuth(lines, securityConfig) {
    if (!securityConfig.auth) return false;

    const authType = securityConfig.auth.authType;
    if (authType !== 'jwt') return false;

    const secret = securityConfig.auth.config.secret
      ? this.genExpression(securityConfig.auth.config.secret)
      : 'undefined';

    lines.push('// ── Edge Auth (JWT) ──');
    lines.push(`const __authSecret = ${secret};`);
    lines.push('async function __authenticate(request) {');
    lines.push('  const __authHdr = (request.headers && request.headers.get) ? request.headers.get("authorization") : (request.headers && (request.headers["Authorization"] || request.headers["authorization"]));');
    lines.push('  if (!__authHdr || !__authHdr.startsWith("Bearer ")) return null;');
    lines.push('  const __token = __authHdr.slice(7);');
    lines.push('  try {');
    lines.push('    const [__hB64, __pB64, __sB64] = __token.split(".");');
    lines.push('    if (!__hB64 || !__pB64 || !__sB64) return null;');
    lines.push('    const __b64d = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));');
    lines.push('    const __hdr = JSON.parse(__b64d(__hB64));');
    lines.push('    if (__hdr.alg !== "HS256") return null;');
    lines.push('    const __payload = JSON.parse(__b64d(__pB64));');
    lines.push('    if (__payload.exp && __payload.exp < Date.now() / 1000) return null;');
    lines.push('    const __enc = new TextEncoder();');
    lines.push('    const __key = await crypto.subtle.importKey("raw", __enc.encode(__authSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);');
    lines.push('    const __sigBytes = Uint8Array.from(__b64d(__sB64), c => c.charCodeAt(0));');
    lines.push('    const __valid = await crypto.subtle.verify("HMAC", __key, __sigBytes, __enc.encode(__hB64 + "." + __pB64));');
    lines.push('    if (!__valid) return null;');
    lines.push('    return __payload;');
    lines.push('  } catch (_) { return null; }');
    lines.push('}');
    lines.push('');
    return true;
  }

  /**
   * Emit inline security check (auth + protection) in request handler.
   * @returns {string} The user variable name ('__user' or 'null')
   */
  _emitEdgeSecurityCheck(lines, secFlags, format, indent, reqVar, hasCors) {
    if (!secFlags.hasAuth && !secFlags.hasProtect) return 'null';

    const userVar = secFlags.hasAuth ? '__user' : 'null';

    if (secFlags.hasAuth) {
      lines.push(`${indent}const __user = await __authenticate(${reqVar});`);
    }

    if (secFlags.hasProtect) {
      lines.push(`${indent}const __prot = __checkProtection(pathname, ${userVar});`);
      lines.push(`${indent}if (!__prot.allowed) {`);
      if (format === 'lambda') {
        const hdr = hasCors
          ? `{ "Content-Type": "application/json", ...__getCorsHeaders(${reqVar}) }`
          : '{ "Content-Type": "application/json" }';
        lines.push(`${indent}  return { statusCode: ${secFlags.hasAuth ? '(__user ? 403 : 401)' : '403'}, headers: ${hdr}, body: JSON.stringify({ error: __prot.reason }) };`);
      } else {
        const hdr = hasCors
          ? `{ "Content-Type": "application/json", ...__getCorsHeaders(${reqVar}) }`
          : '{ "Content-Type": "application/json" }';
        lines.push(`${indent}  return new Response(JSON.stringify({ error: __prot.reason }), { status: ${secFlags.hasAuth ? '(__user ? 403 : 401)' : '403'}, headers: ${hdr} });`);
      }
      lines.push(`${indent}}`);
      lines.push('');
    }

    return userVar;
  }

  // ════════════════════════════════════════════════════════════
  // Binding helpers
  // ════════════════════════════════════════════════════════════

  /**
   * Generate the ` ?? defaultExpr` suffix for an env declaration.
   */
  _genDefaultSuffix(envDecl) {
    if (envDecl.defaultValue) {
      return ' ?? ' + this.genExpression(envDecl.defaultValue);
    }
    return '';
  }

  /**
   * Cloudflare bindings: module-level `let` declarations + init lines for fetch/scheduled/queue.
   * Returns { moduleLines: string[], fetchInitLines: string[] }
   */
  _emitCloudflareBindings(config) {
    const moduleLines = [];
    const fetchInitLines = [];
    const allBindings = [
      ...config.bindings.kv,
      ...config.bindings.sql,
      ...config.bindings.storage,
      ...config.bindings.queue,
    ];
    const allEnvSecrets = [...config.envVars, ...config.secrets];

    if (allBindings.length === 0 && allEnvSecrets.length === 0) {
      return { moduleLines, fetchInitLines };
    }

    // Module-level let declarations
    const names = [
      ...allBindings.map(b => b.name),
      ...allEnvSecrets.map(b => b.name),
    ];
    moduleLines.push('// ── Bindings ──');
    moduleLines.push('let ' + names.join(', ') + ';');
    moduleLines.push('');

    // Fetch init lines (inside fetch/scheduled/queue handlers)
    for (const b of allBindings) {
      fetchInitLines.push(`    ${b.name} = env.${b.name};`);
    }
    for (const e of config.envVars) {
      fetchInitLines.push(`    ${e.name} = env.${e.name}${this._genDefaultSuffix(e)};`);
    }
    for (const s of config.secrets) {
      fetchInitLines.push(`    ${s.name} = env.${s.name};`);
    }

    return { moduleLines, fetchInitLines };
  }

  /**
   * Deno bindings: top-level const declarations.
   */
  _emitDenoBindings(lines, config) {
    const hasKv = config.bindings.kv.length > 0;
    const hasAnything = hasKv || config.bindings.sql.length > 0 ||
      config.bindings.storage.length > 0 || config.bindings.queue.length > 0 ||
      config.envVars.length > 0 || config.secrets.length > 0;

    if (!hasAnything) return;

    lines.push('// ── Bindings ──');

    // KV — first one opens the store, rest share
    if (hasKv) {
      lines.push(`const ${config.bindings.kv[0].name} = await Deno.openKv();`);
      for (let i = 1; i < config.bindings.kv.length; i++) {
        lines.push(`const ${config.bindings.kv[i].name} = ${config.bindings.kv[0].name}; // shared Deno KV store`);
      }
    }

    // Unsupported stubs
    for (const b of config.bindings.sql) {
      lines.push(`const ${b.name} = null; // SQL not natively supported on Deno Deploy — use a third-party driver`);
    }
    for (const b of config.bindings.storage) {
      lines.push(`const ${b.name} = null; // Object storage not natively supported on Deno Deploy`);
    }
    for (const b of config.bindings.queue) {
      lines.push(`const ${b.name} = null; // Queues not natively supported on Deno Deploy`);
    }

    // Env/Secret
    for (const e of config.envVars) {
      lines.push(`const ${e.name} = Deno.env.get(${JSON.stringify(e.name)})${this._genDefaultSuffix(e)};`);
    }
    for (const s of config.secrets) {
      lines.push(`const ${s.name} = Deno.env.get(${JSON.stringify(s.name)});`);
    }

    lines.push('');
  }

  /**
   * Process.env-based bindings (Vercel, Lambda).
   * Only env/secret are supported; others become stubs.
   */
  _emitProcessEnvBindings(lines, config, targetName) {
    const hasAnything = config.bindings.kv.length > 0 || config.bindings.sql.length > 0 ||
      config.bindings.storage.length > 0 || config.bindings.queue.length > 0 ||
      config.envVars.length > 0 || config.secrets.length > 0;

    if (!hasAnything) return;

    lines.push('// ── Bindings ──');

    // Unsupported stubs
    for (const b of config.bindings.kv) {
      lines.push(`const ${b.name} = null; // KV not supported on ${targetName}`);
    }
    for (const b of config.bindings.sql) {
      lines.push(`const ${b.name} = null; // SQL not supported on ${targetName}`);
    }
    for (const b of config.bindings.storage) {
      lines.push(`const ${b.name} = null; // Object storage not supported on ${targetName}`);
    }
    for (const b of config.bindings.queue) {
      lines.push(`const ${b.name} = null; // Queues not supported on ${targetName}`);
    }

    // Env/Secret via process.env
    for (const e of config.envVars) {
      lines.push(`const ${e.name} = process.env.${e.name}${this._genDefaultSuffix(e)};`);
    }
    for (const s of config.secrets) {
      lines.push(`const ${s.name} = process.env.${s.name};`);
    }

    lines.push('');
  }

  /**
   * Bun bindings: SQL via bun:sqlite, env via process.env, others stub.
   * Returns { imports: string[], bindings: string[] }
   */
  _emitBunBindings(config) {
    const imports = [];
    const bindings = [];
    const hasAnything = config.bindings.kv.length > 0 || config.bindings.sql.length > 0 ||
      config.bindings.storage.length > 0 || config.bindings.queue.length > 0 ||
      config.envVars.length > 0 || config.secrets.length > 0;

    if (!hasAnything) return { imports, bindings };

    bindings.push('// ── Bindings ──');

    // KV stub
    for (const b of config.bindings.kv) {
      bindings.push(`const ${b.name} = null; // KV not natively supported on Bun — use a third-party store`);
    }

    // SQL via bun:sqlite
    if (config.bindings.sql.length > 0) {
      imports.push('import { Database } from "bun:sqlite";');
      for (const b of config.bindings.sql) {
        bindings.push(`const ${b.name} = new Database("${b.name}.sqlite");`);
      }
    }

    // Storage/Queue stubs
    for (const b of config.bindings.storage) {
      bindings.push(`const ${b.name} = null; // Object storage not natively supported on Bun`);
    }
    for (const b of config.bindings.queue) {
      bindings.push(`const ${b.name} = null; // Queues not natively supported on Bun`);
    }

    // Env/Secret via process.env
    for (const e of config.envVars) {
      bindings.push(`const ${e.name} = process.env.${e.name}${this._genDefaultSuffix(e)};`);
    }
    for (const s of config.secrets) {
      bindings.push(`const ${s.name} = process.env.${s.name};`);
    }

    bindings.push('');
    return { imports, bindings };
  }

  // ════════════════════════════════════════════════════════════
  // Cloudflare Workers target
  // ════════════════════════════════════════════════════════════

  _generateCloudflare(config, sharedCode, securityConfig) {
    const lines = [];
    const hasCors = !!config.corsConfig;
    const hasErrorHandler = !!config.errorHandler;

    lines.push('// Generated by Tova — Cloudflare Workers target');
    lines.push('');

    // Shared code
    if (sharedCode && sharedCode.trim()) {
      lines.push(sharedCode);
      lines.push('');
    }

    // Binding declarations (module-level let + fetch init lines)
    const { moduleLines, fetchInitLines } = this._emitCloudflareBindings(config);
    for (const l of moduleLines) lines.push(l);

    // User functions
    this._emitFunctions(lines, config.functions);

    // Misc statements (assignments, etc.)
    this._emitMiscStatements(lines, config.miscStatements);

    // CORS
    this._emitEdgeCors(lines, config.corsConfig);

    // Error handler
    this._emitEdgeErrorHandler(lines, config.errorHandler);

    // Security (roles, auth, protection, sanitization)
    const secFlags = this._emitEdgeSecurity(lines, securityConfig);

    // Middleware chain
    this._emitMiddlewareFunctions(lines, config.middlewares);

    // Route matching helper
    this._emitRouteMatchHelper(lines);

    // Build route table
    lines.push('// ── Route Table ──');
    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);

    // Health check route
    this._emitEdgeHealthCheck(lines, config, 'response');
    lines.push('');

    // Fetch handler
    lines.push('export default {');
    lines.push('  async fetch(request, env, ctx) {');

    // Init bindings from env
    for (const l of fetchInitLines) lines.push(l);

    lines.push('    const url = new URL(request.url);');
    lines.push('    const method = request.method;');
    lines.push('    const pathname = url.pathname;');
    lines.push('');

    // OPTIONS preflight
    if (hasCors) {
      lines.push('    if (request.method === "OPTIONS") {');
      lines.push('      return new Response(null, { status: 204, headers: __getCorsHeaders(request) });');
      lines.push('    }');
      lines.push('');
    }

    // Security check (auth + protection)
    const userVar = this._emitEdgeSecurityCheck(lines, secFlags, 'response', '    ', 'request', hasCors);
    const sanitize = secFlags.hasAutoSanitize;

    // Middleware wrapping
    if (config.middlewares.length > 0) {
      lines.push('    // Apply middleware chain');
      lines.push('    const __handler = async (req) => {');
      lines.push('      const __match = __matchRoute(method, pathname, __routes);');
      lines.push('      if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('      return __match.handler(req, __match.params, env);');
      lines.push('    };');
      let chain = '__handler';
      for (let i = config.middlewares.length - 1; i >= 0; i--) {
        const mw = config.middlewares[i];
        chain = `(req) => __mw_${mw.name}(req, ${chain})`;
      }
      lines.push('    try {');
      lines.push(`      const __result = await (${chain})(request);`);
      lines.push('      if (__result instanceof Response) return __result;');
      const mwVal = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`      return new Response(JSON.stringify(${mwVal}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`      return Response.json(${mwVal});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '    ', 'request');
    } else {
      lines.push('    const __match = __matchRoute(method, pathname, __routes);');
      lines.push('    if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('');
      lines.push('    try {');
      lines.push('      const __result = await __match.handler(request, __match.params, env);');
      lines.push('      if (__result instanceof Response) return __result;');
      const val = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`      return new Response(JSON.stringify(${val}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`      return Response.json(${val});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '    ', 'request');
    }
    lines.push('  },');

    // Scheduled handler
    if (config.schedules.length > 0) {
      lines.push('');
      lines.push('  async scheduled(event, env, ctx) {');
      // Init bindings in scheduled handler too
      for (const l of fetchInitLines) lines.push(l);
      for (let si = 0; si < config.schedules.length; si++) {
        const sched = config.schedules[si];
        const kw = si === 0 ? 'if' : 'else if';
        lines.push(`    ${kw} (event.cron === ${JSON.stringify(sched.cron)}) {`);
        lines.push(`      // ${sched.name}`);
        const body = this.genBlockStatements(sched.body);
        for (const line of body.split('\n')) {
          lines.push('      ' + line);
        }
        lines.push('    }');
      }
      lines.push('  },');
    }

    // Queue consumer
    if (config.consumers.length > 0) {
      lines.push('');
      lines.push('  async queue(batch, env, ctx) {');
      // Init bindings in queue handler too
      for (const l of fetchInitLines) lines.push(l);
      for (const consumer of config.consumers) {
        lines.push(`    // consume ${consumer.queue}`);
        const handlerCode = this.genExpression(consumer.handler);
        lines.push(`    await (${handlerCode})(batch.messages);`);
      }
      lines.push('  },');
    }

    lines.push('};');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // Deno Deploy target
  // ════════════════════════════════════════════════════════════

  _generateDeno(config, sharedCode, securityConfig) {
    const lines = [];
    const hasCors = !!config.corsConfig;
    const hasErrorHandler = !!config.errorHandler;

    lines.push('// Generated by Tova — Deno Deploy target');
    lines.push('');

    // Shared code
    if (sharedCode && sharedCode.trim()) {
      lines.push(sharedCode);
      lines.push('');
    }

    // Bindings
    this._emitDenoBindings(lines, config);

    // User functions
    this._emitFunctions(lines, config.functions);

    // Misc statements
    this._emitMiscStatements(lines, config.miscStatements);

    // CORS
    this._emitEdgeCors(lines, config.corsConfig);

    // Error handler
    this._emitEdgeErrorHandler(lines, config.errorHandler);

    // Security
    const secFlags = this._emitEdgeSecurity(lines, securityConfig);

    // Middleware
    this._emitMiddlewareFunctions(lines, config.middlewares);

    // Route matching helper
    this._emitRouteMatchHelper(lines);

    // Build route table
    lines.push('// ── Route Table ──');
    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);

    // Health check route
    this._emitEdgeHealthCheck(lines, config, 'response');
    lines.push('');

    // Cron schedules
    for (const sched of config.schedules) {
      lines.push(`Deno.cron(${JSON.stringify(sched.name)}, ${JSON.stringify(sched.cron)}, async () => {`);
      const body = this.genBlockStatements(sched.body);
      for (const line of body.split('\n')) {
        lines.push('  ' + line);
      }
      lines.push('});');
      lines.push('');
    }

    // Server
    lines.push('Deno.serve(async (request) => {');
    lines.push('  const url = new URL(request.url);');
    lines.push('  const method = request.method;');
    lines.push('  const pathname = url.pathname;');
    lines.push('');

    // OPTIONS preflight
    if (hasCors) {
      lines.push('  if (request.method === "OPTIONS") {');
      lines.push('    return new Response(null, { status: 204, headers: __getCorsHeaders(request) });');
      lines.push('  }');
      lines.push('');
    }

    // Security check
    const userVar = this._emitEdgeSecurityCheck(lines, secFlags, 'response', '  ', 'request', hasCors);
    const sanitize = secFlags.hasAutoSanitize;

    if (config.middlewares.length > 0) {
      lines.push('  const __handler = async (req) => {');
      lines.push('    const __match = __matchRoute(method, pathname, __routes);');
      lines.push('    if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('    return __match.handler(req, __match.params);');
      lines.push('  };');
      let chain = '__handler';
      for (let i = config.middlewares.length - 1; i >= 0; i--) {
        const mw = config.middlewares[i];
        chain = `(req) => __mw_${mw.name}(req, ${chain})`;
      }
      lines.push('  try {');
      lines.push(`    const __result = await (${chain})(request);`);
      lines.push('    if (__result instanceof Response) return __result;');
      const mwVal = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`    return new Response(JSON.stringify(${mwVal}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`    return Response.json(${mwVal});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '  ', 'request');
    } else {
      lines.push('  const __match = __matchRoute(method, pathname, __routes);');
      lines.push('  if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('');
      lines.push('  try {');
      lines.push('    const __result = await __match.handler(request, __match.params);');
      lines.push('    if (__result instanceof Response) return __result;');
      const val = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`    return new Response(JSON.stringify(${val}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`    return Response.json(${val});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '  ', 'request');
    }
    lines.push('});');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // Vercel Edge target
  // ════════════════════════════════════════════════════════════

  _generateVercel(config, sharedCode, securityConfig) {
    const lines = [];
    const hasCors = !!config.corsConfig;
    const hasErrorHandler = !!config.errorHandler;

    lines.push('// Generated by Tova — Vercel Edge target');
    lines.push('');
    lines.push('export const config = { runtime: "edge" };');
    lines.push('');

    if (sharedCode && sharedCode.trim()) {
      lines.push(sharedCode);
      lines.push('');
    }

    // Bindings
    this._emitProcessEnvBindings(lines, config, 'Vercel Edge');

    this._emitFunctions(lines, config.functions);
    this._emitMiscStatements(lines, config.miscStatements);

    // CORS
    this._emitEdgeCors(lines, config.corsConfig);

    // Error handler
    this._emitEdgeErrorHandler(lines, config.errorHandler);

    // Security
    const secFlags = this._emitEdgeSecurity(lines, securityConfig);

    this._emitMiddlewareFunctions(lines, config.middlewares);

    this._emitRouteMatchHelper(lines);

    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);

    // Health check route
    this._emitEdgeHealthCheck(lines, config, 'response');
    lines.push('');

    lines.push('export default async function handler(request) {');
    lines.push('  const url = new URL(request.url);');
    lines.push('  const method = request.method;');
    lines.push('  const pathname = url.pathname;');

    // OPTIONS preflight
    if (hasCors) {
      lines.push('  if (request.method === "OPTIONS") {');
      lines.push('    return new Response(null, { status: 204, headers: __getCorsHeaders(request) });');
      lines.push('  }');
    }

    // Security check
    const userVar = this._emitEdgeSecurityCheck(lines, secFlags, 'response', '  ', 'request', hasCors);
    const sanitize = secFlags.hasAutoSanitize;

    if (config.middlewares.length > 0) {
      lines.push('  // Apply middleware chain');
      lines.push('  const __handler = async (req) => {');
      lines.push('    const __match = __matchRoute(method, pathname, __routes);');
      lines.push('    if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('    return __match.handler(req, __match.params);');
      lines.push('  };');
      let chain = '__handler';
      for (let i = config.middlewares.length - 1; i >= 0; i--) {
        const mw = config.middlewares[i];
        chain = `(req) => __mw_${mw.name}(req, ${chain})`;
      }
      lines.push('  try {');
      lines.push(`    const __result = await (${chain})(request);`);
      lines.push('    if (__result instanceof Response) return __result;');
      const mwVal = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`    return new Response(JSON.stringify(${mwVal}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`    return Response.json(${mwVal});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '  ', 'request');
    } else {
      lines.push('  const __match = __matchRoute(method, pathname, __routes);');
      lines.push('  if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('  try {');
      lines.push('    const __result = await __match.handler(request, __match.params);');
      lines.push('    if (__result instanceof Response) return __result;');
      const val = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`    return new Response(JSON.stringify(${val}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`    return Response.json(${val});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '  ', 'request');
    }
    lines.push('}');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // AWS Lambda target
  // ════════════════════════════════════════════════════════════

  _generateLambda(config, sharedCode, securityConfig) {
    const lines = [];
    const hasCors = !!config.corsConfig;
    const hasErrorHandler = !!config.errorHandler;

    lines.push('// Generated by Tova — AWS Lambda target');
    lines.push('');

    if (sharedCode && sharedCode.trim()) {
      lines.push(sharedCode);
      lines.push('');
    }

    // Bindings
    this._emitProcessEnvBindings(lines, config, 'AWS Lambda');

    this._emitFunctions(lines, config.functions);
    this._emitMiscStatements(lines, config.miscStatements);

    // CORS
    this._emitEdgeCors(lines, config.corsConfig);

    // Error handler
    this._emitEdgeErrorHandler(lines, config.errorHandler);

    // Security
    const secFlags = this._emitEdgeSecurity(lines, securityConfig);

    this._emitMiddlewareFunctions(lines, config.middlewares);

    this._emitRouteMatchHelper(lines);

    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);

    // Health check route
    this._emitEdgeHealthCheck(lines, config, 'lambda');
    lines.push('');

    // Lambda handler — translate API Gateway event to Request-like object
    lines.push('export const handler = async (event, context) => {');
    lines.push('  const method = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || "GET";');
    lines.push('  const pathname = event.path || event.rawPath || "/";');
    lines.push('  const __rawHeaders = event.headers || {};');
    lines.push('  const headers = { ...__rawHeaders, get: (k) => __rawHeaders[k] || __rawHeaders[k.toLowerCase()] || __rawHeaders[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()] || null };');
    lines.push('  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : null;');
    lines.push('  const request = { method, path: pathname, headers, body, json: () => JSON.parse(body || "{}"), url: "https://lambda.local" + pathname };');
    lines.push('');

    // OPTIONS preflight
    if (hasCors) {
      lines.push('  if (method === "OPTIONS") {');
      lines.push('    return { statusCode: 204, headers: __getCorsHeaders(request) };');
      lines.push('  }');
      lines.push('');
    }

    // Security check
    const userVar = this._emitEdgeSecurityCheck(lines, secFlags, 'lambda', '  ', 'request', hasCors);
    const sanitize = secFlags.hasAutoSanitize;

    if (config.middlewares.length > 0) {
      lines.push('  // Apply middleware chain');
      lines.push('  const __handler = async (req) => {');
      lines.push('    const __match = __matchRoute(method, pathname, __routes);');
      lines.push('    if (!__match) return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Not Found" }) };');
      lines.push('    const __r = await __match.handler(req, __match.params);');
      lines.push('    if (__r && __r.statusCode) return __r;');
      const mwValInner = sanitize ? `__autoSanitize(__r, ${userVar})` : '__r';
      if (hasCors) {
        lines.push(`    return { statusCode: 200, headers: { "Content-Type": "application/json", ...__getCorsHeaders(req) }, body: JSON.stringify(${mwValInner}) };`);
      } else {
        lines.push(`    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(${mwValInner}) };`);
      }
      lines.push('  };');
      let chain = '__handler';
      for (let i = config.middlewares.length - 1; i >= 0; i--) {
        const mw = config.middlewares[i];
        chain = `(req) => __mw_${mw.name}(req, ${chain})`;
      }
      lines.push('  try {');
      lines.push(`    const __result = await (${chain})(request);`);
      lines.push('    if (__result && __result.statusCode) return __result;');
      const mwVal = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`    return { statusCode: 200, headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) }, body: JSON.stringify(${mwVal}) };`);
      } else {
        lines.push(`    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(${mwVal}) };`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'lambda', '  ', 'request');
    } else {
      lines.push('  const __match = __matchRoute(method, pathname, __routes);');
      lines.push('  if (!__match) return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Not Found" }) };');
      lines.push('');
      lines.push('  try {');
      lines.push('    const __result = await __match.handler(request, __match.params);');
      lines.push('    if (__result && __result.statusCode) return __result;');
      const val = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`    return { statusCode: 200, headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) }, body: JSON.stringify(${val}) };`);
      } else {
        lines.push(`    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(${val}) };`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'lambda', '  ', 'request');
    }
    lines.push('};');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // Bun target (similar to existing server but edge-optimized)
  // ════════════════════════════════════════════════════════════

  _generateBun(config, sharedCode, securityConfig) {
    const lines = [];
    const hasCors = !!config.corsConfig;
    const hasErrorHandler = !!config.errorHandler;

    lines.push('// Generated by Tova — Bun edge target');
    lines.push('');

    // Bun bindings (imports go first)
    const { imports: bunImports, bindings: bunBindings } = this._emitBunBindings(config);
    for (const imp of bunImports) lines.push(imp);
    if (bunImports.length > 0) lines.push('');

    if (sharedCode && sharedCode.trim()) {
      lines.push(sharedCode);
      lines.push('');
    }

    // Binding declarations
    for (const l of bunBindings) lines.push(l);

    this._emitFunctions(lines, config.functions);
    this._emitMiscStatements(lines, config.miscStatements);

    // CORS
    this._emitEdgeCors(lines, config.corsConfig);

    // Error handler
    this._emitEdgeErrorHandler(lines, config.errorHandler);

    // Security
    const secFlags = this._emitEdgeSecurity(lines, securityConfig);

    this._emitMiddlewareFunctions(lines, config.middlewares);

    this._emitRouteMatchHelper(lines);

    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);

    // Health check route
    this._emitEdgeHealthCheck(lines, config, 'response');
    lines.push('');

    lines.push('Bun.serve({');
    lines.push('  port: process.env.PORT || 3000,');
    lines.push('  async fetch(request) {');
    lines.push('    const url = new URL(request.url);');
    lines.push('    const method = request.method;');
    lines.push('    const pathname = url.pathname;');

    // OPTIONS preflight
    if (hasCors) {
      lines.push('    if (request.method === "OPTIONS") {');
      lines.push('      return new Response(null, { status: 204, headers: __getCorsHeaders(request) });');
      lines.push('    }');
    }

    // Security check
    const userVar = this._emitEdgeSecurityCheck(lines, secFlags, 'response', '    ', 'request', hasCors);
    const sanitize = secFlags.hasAutoSanitize;

    if (config.middlewares.length > 0) {
      lines.push('    const __handler = async (req) => {');
      lines.push('      const __match = __matchRoute(method, pathname, __routes);');
      lines.push('      if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('      return __match.handler(req, __match.params);');
      lines.push('    };');
      let chain = '__handler';
      for (let i = config.middlewares.length - 1; i >= 0; i--) {
        const mw = config.middlewares[i];
        chain = `(req) => __mw_${mw.name}(req, ${chain})`;
      }
      lines.push('    try {');
      lines.push(`      const __result = await (${chain})(request);`);
      lines.push('      if (__result instanceof Response) return __result;');
      const mwVal = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`      return new Response(JSON.stringify(${mwVal}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`      return Response.json(${mwVal});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '    ', 'request');
    } else {
      lines.push('    const __match = __matchRoute(method, pathname, __routes);');
      lines.push('    if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('    try {');
      lines.push('      const __result = await __match.handler(request, __match.params);');
      lines.push('      if (__result instanceof Response) return __result;');
      const val = sanitize ? `__autoSanitize(__result, ${userVar})` : '__result';
      if (hasCors) {
        lines.push(`      return new Response(JSON.stringify(${val}), { headers: { "Content-Type": "application/json", ...__getCorsHeaders(request) } });`);
      } else {
        lines.push(`      return Response.json(${val});`);
      }
      this._emitEdgeCatchBlock(lines, hasErrorHandler, hasCors, 'response', '    ', 'request');
    }
    lines.push('  }');
    lines.push('});');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // Shared helpers
  // ════════════════════════════════════════════════════════════

  _emitRouteMatchHelper(lines) {
    lines.push('// ── Route Matching ──');
    lines.push('function __matchRoute(method, pathname, routes) {');
    lines.push('  for (const route of routes) {');
    lines.push('    if (route.method !== method && route.method !== "*") continue;');
    lines.push('    const match = route.pattern.exec(pathname);');
    lines.push('    if (match) {');
    lines.push('      const params = {};');
    lines.push('      for (let i = 0; i < route.paramNames.length; i++) {');
    lines.push('        params[route.paramNames[i]] = match[i + 1];');
    lines.push('      }');
    lines.push('      return { handler: route.handler, params };');
    lines.push('    }');
    lines.push('  }');
    lines.push('  return null;');
    lines.push('}');
    lines.push('');
  }

  _emitFunctions(lines, functions) {
    if (functions.length === 0) return;
    lines.push('// ── Functions ──');
    for (const fn of functions) {
      const code = this.generateStatement(fn);
      lines.push(code);
      lines.push('');
    }
  }

  _emitMiscStatements(lines, stmts) {
    for (const stmt of stmts) {
      const code = this.generateStatement(stmt);
      if (code && code.trim()) {
        lines.push(code);
      }
    }
  }

  _emitMiddlewareFunctions(lines, middlewares) {
    if (middlewares.length === 0) return;
    lines.push('// ── Middleware ──');
    for (const mw of middlewares) {
      const params = mw.params.map(p => p.name || this.genExpression(p)).join(', ');
      const body = this.genBlockStatements(mw.body);
      lines.push(`async function __mw_${mw.name}(${params}) {`);
      lines.push(body);
      lines.push('}');
      lines.push('');
    }
  }

  /**
   * Convert route path pattern (e.g., "/api/users/:id") to a regex
   * and emit __routes.push({ method, pattern, paramNames, handler })
   */
  _emitRouteRegistrations(lines, routes) {
    for (const route of routes) {
      const method = route.method.toUpperCase();
      const path = route.path;

      // Extract param names and build regex
      const paramNames = [];
      const regexParts = path.split('/').map(seg => {
        if (seg.startsWith(':')) {
          paramNames.push(seg.slice(1));
          return '([^/]+)';
        }
        if (seg.startsWith('*')) {
          paramNames.push(seg.slice(1) || 'wild');
          return '(.*)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      const regexStr = '^' + regexParts.join('/') + '$';

      const handler = this.genExpression(route.handler);
      lines.push(`__routes.push({ method: ${JSON.stringify(method)}, pattern: new RegExp(${JSON.stringify(regexStr)}), paramNames: ${JSON.stringify(paramNames)}, handler: ${handler} });`);
    }
  }

  /**
   * Generate a wrangler.toml config string for Cloudflare deployments.
   */
  static generateWranglerToml(config, name, blockName) {
    const appName = name || 'app';
    const today = new Date().toISOString().slice(0, 10);
    const mainFile = blockName
      ? '.tova-out/' + appName + '.edge.' + blockName + '.js'
      : '.tova-out/' + appName + '.edge.js';
    const lines = [];
    lines.push('name = "' + appName + '"');
    lines.push('main = "' + mainFile + '"');
    lines.push('compatibility_date = "' + today + '"');
    lines.push('');

    // KV namespaces
    for (const kv of config.bindings.kv) {
      lines.push('[[kv_namespaces]]');
      lines.push('binding = "' + kv.name + '"');
      lines.push('id = "TODO_' + kv.name + '_ID"');
      lines.push('');
    }

    // D1 databases
    for (const db of config.bindings.sql) {
      lines.push('[[d1_databases]]');
      lines.push('binding = "' + db.name + '"');
      lines.push('database_name = "' + db.name.toLowerCase() + '"');
      lines.push('database_id = "TODO_' + db.name + '_ID"');
      lines.push('');
    }

    // R2 buckets
    for (const bucket of config.bindings.storage) {
      lines.push('[[r2_buckets]]');
      lines.push('binding = "' + bucket.name + '"');
      lines.push('bucket_name = "' + bucket.name.toLowerCase() + '"');
      lines.push('');
    }

    // Queue producers
    for (const q of config.bindings.queue) {
      lines.push('[[queues.producers]]');
      lines.push('binding = "' + q.name + '"');
      lines.push('queue = "' + q.name.toLowerCase() + '"');
      lines.push('');
    }

    // Queue consumers
    for (const c of config.consumers) {
      lines.push('[[queues.consumers]]');
      lines.push('queue = "' + c.queue.toLowerCase() + '"');
      lines.push('max_batch_size = 10');
      lines.push('max_batch_timeout = 30');
      lines.push('');
    }

    // Cron triggers
    if (config.schedules.length > 0) {
      lines.push('[triggers]');
      const crons = config.schedules.map(s => '"' + s.cron + '"').join(', ');
      lines.push('crons = [' + crons + ']');
      lines.push('');
    }

    // Env vars
    if (config.envVars.length > 0) {
      lines.push('[vars]');
      for (const env of config.envVars) {
        if (env.defaultValue && env.defaultValue.type === 'StringLiteral') {
          lines.push(env.name + ' = "' + env.defaultValue.value + '"');
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
