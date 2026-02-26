// Edge/serverless code generator for the Tova language
// Produces deployment-ready code for Cloudflare Workers, Deno Deploy, Vercel Edge, AWS Lambda, or Bun.

import { BaseCodegen } from './base-codegen.js';

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
    const miscStatements = []; // health, cors, on_error, other statements

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
          default:
            miscStatements.push(stmt);
            break;
        }
      }
    }

    return { target, routes, functions, middlewares, bindings, envVars, secrets, schedules, consumers, miscStatements };
  }

  /**
   * Generate edge function code for the given target.
   * @param {Object} config — merged config from mergeEdgeBlocks
   * @param {string} sharedCode — shared/top-level compiled code
   * @returns {string} — complete edge function JS
   */
  generate(config, sharedCode) {
    const { target } = config;
    switch (target) {
      case 'cloudflare': return this._generateCloudflare(config, sharedCode);
      case 'deno': return this._generateDeno(config, sharedCode);
      case 'vercel': return this._generateVercel(config, sharedCode);
      case 'lambda': return this._generateLambda(config, sharedCode);
      case 'bun': return this._generateBun(config, sharedCode);
      default: return this._generateCloudflare(config, sharedCode);
    }
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

  _generateCloudflare(config, sharedCode) {
    const lines = [];
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

    // Middleware chain
    this._emitMiddlewareFunctions(lines, config.middlewares);

    // Route matching helper
    this._emitRouteMatchHelper(lines);

    // Build route table
    lines.push('// ── Route Table ──');
    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);
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
      lines.push(`    return (${chain})(request);`);
    } else {
      lines.push('    const __match = __matchRoute(method, pathname, __routes);');
      lines.push('    if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('');
      lines.push('    try {');
      lines.push('      const __result = await __match.handler(request, __match.params, env);');
      lines.push('      if (__result instanceof Response) return __result;');
      lines.push('      return Response.json(__result);');
      lines.push('    } catch (e) {');
      lines.push('      return new Response(JSON.stringify({ error: e.message }), {');
      lines.push('        status: 500,');
      lines.push('        headers: { "Content-Type": "application/json" }');
      lines.push('      });');
      lines.push('    }');
    }
    lines.push('  },');

    // Scheduled handler
    if (config.schedules.length > 0) {
      lines.push('');
      lines.push('  async scheduled(event, env, ctx) {');
      // Init bindings in scheduled handler too
      for (const l of fetchInitLines) lines.push(l);
      for (const sched of config.schedules) {
        lines.push(`    if (event.cron === ${JSON.stringify(sched.cron)}) {`);
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

  _generateDeno(config, sharedCode) {
    const lines = [];
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

    // Middleware
    this._emitMiddlewareFunctions(lines, config.middlewares);

    // Route matching helper
    this._emitRouteMatchHelper(lines);

    // Build route table
    lines.push('// ── Route Table ──');
    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);
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
      lines.push(`  return (${chain})(request);`);
    } else {
      lines.push('  const __match = __matchRoute(method, pathname, __routes);');
      lines.push('  if (!__match) return new Response("Not Found", { status: 404 });');
      lines.push('');
      lines.push('  try {');
      lines.push('    const __result = await __match.handler(request, __match.params);');
      lines.push('    if (__result instanceof Response) return __result;');
      lines.push('    return Response.json(__result);');
      lines.push('  } catch (e) {');
      lines.push('    return new Response(JSON.stringify({ error: e.message }), {');
      lines.push('      status: 500,');
      lines.push('      headers: { "Content-Type": "application/json" }');
      lines.push('    });');
      lines.push('  }');
    }
    lines.push('});');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // Vercel Edge target
  // ════════════════════════════════════════════════════════════

  _generateVercel(config, sharedCode) {
    const lines = [];
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
    this._emitMiddlewareFunctions(lines, config.middlewares);

    this._emitRouteMatchHelper(lines);

    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);
    lines.push('');

    lines.push('export default async function handler(request) {');
    lines.push('  const url = new URL(request.url);');
    lines.push('  const __match = __matchRoute(request.method, url.pathname, __routes);');
    lines.push('  if (!__match) return new Response("Not Found", { status: 404 });');
    lines.push('  try {');
    lines.push('    const __result = await __match.handler(request, __match.params);');
    lines.push('    if (__result instanceof Response) return __result;');
    lines.push('    return Response.json(__result);');
    lines.push('  } catch (e) {');
    lines.push('    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });');
    lines.push('  }');
    lines.push('}');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // AWS Lambda target
  // ════════════════════════════════════════════════════════════

  _generateLambda(config, sharedCode) {
    const lines = [];
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

    this._emitRouteMatchHelper(lines);

    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);
    lines.push('');

    // Lambda handler — translate API Gateway event to Request-like object
    lines.push('export const handler = async (event, context) => {');
    lines.push('  const method = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || "GET";');
    lines.push('  const path = event.path || event.rawPath || "/";');
    lines.push('  const headers = event.headers || {};');
    lines.push('  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : null;');
    lines.push('  const request = { method, path, headers, body, json: () => JSON.parse(body || "{}"), url: "https://lambda.local" + path };');
    lines.push('');
    lines.push('  const __match = __matchRoute(method, path, __routes);');
    lines.push('  if (!__match) return { statusCode: 404, body: "Not Found" };');
    lines.push('');
    lines.push('  try {');
    lines.push('    const __result = await __match.handler(request, __match.params);');
    lines.push('    if (__result && __result.statusCode) return __result;');
    lines.push('    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(__result) };');
    lines.push('  } catch (e) {');
    lines.push('    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message }) };');
    lines.push('  }');
    lines.push('};');

    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════
  // Bun target (similar to existing server but edge-optimized)
  // ════════════════════════════════════════════════════════════

  _generateBun(config, sharedCode) {
    const lines = [];
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
    this._emitMiddlewareFunctions(lines, config.middlewares);

    this._emitRouteMatchHelper(lines);

    lines.push('const __routes = [];');
    this._emitRouteRegistrations(lines, config.routes);
    lines.push('');

    lines.push('Bun.serve({');
    lines.push('  port: process.env.PORT || 3000,');
    lines.push('  async fetch(request) {');
    lines.push('    const url = new URL(request.url);');
    lines.push('    const __match = __matchRoute(request.method, url.pathname, __routes);');
    lines.push('    if (!__match) return new Response("Not Found", { status: 404 });');
    lines.push('    try {');
    lines.push('      const __result = await __match.handler(request, __match.params);');
    lines.push('      if (__result instanceof Response) return __result;');
    lines.push('      return Response.json(__result);');
    lines.push('    } catch (e) {');
    lines.push('      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });');
    lines.push('    }');
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
  static generateWranglerToml(config, name) {
    const appName = name || 'app';
    const today = new Date().toISOString().slice(0, 10);
    const lines = [];
    lines.push('name = "' + appName + '"');
    lines.push('main = ".tova-out/' + appName + '.edge.js"');
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

    // Queues
    for (const q of config.bindings.queue) {
      lines.push('[[queues.producers]]');
      lines.push('binding = "' + q.name + '"');
      lines.push('queue = "' + q.name.toLowerCase() + '"');
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
