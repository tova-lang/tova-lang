import { BaseCodegen } from './base-codegen.js';

export class ServerCodegen extends BaseCodegen {
  generate(serverBlocks, sharedCode, blockName = null) {
    const lines = [];

    // Shared code
    if (sharedCode.trim()) {
      lines.push('// ── Shared ──');
      lines.push(sharedCode);
      lines.push('');
    }

    // Lightweight router
    lines.push('// ── Router ──');
    lines.push('const __routes = [];');
    lines.push('function __addRoute(method, path, handler) {');
    lines.push('  const pattern = path.replace(/:([^/]+)/g, "(?<$1>[^/]+)");');
    lines.push('  __routes.push({ method, regex: new RegExp(`^${pattern}$`), handler });');
    lines.push('}');
    lines.push('');

    // CORS helper
    lines.push('const __corsHeaders = {');
    lines.push('  "Access-Control-Allow-Origin": "*",');
    lines.push('  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",');
    lines.push('  "Access-Control-Allow-Headers": "Content-Type, Authorization",');
    lines.push('};');
    lines.push('');

    // Collect functions and routes from blocks
    const routes = [];
    const functions = [];

    for (const block of serverBlocks) {
      for (const stmt of block.body) {
        if (stmt.type === 'RouteDeclaration') {
          routes.push(stmt);
        } else if (stmt.type === 'FunctionDeclaration') {
          functions.push(stmt);
        } else {
          lines.push(this.generateStatement(stmt));
        }
      }
    }

    // Generate functions
    if (functions.length > 0) {
      lines.push('// ── Server Functions ──');
      for (const fn of functions) {
        lines.push(this.generateStatement(fn));
        lines.push('');
      }
    }

    // Generate RPC endpoints for each server function (auto-wired)
    if (functions.length > 0) {
      lines.push('// ── RPC Endpoints ──');
      for (const fn of functions) {
        const name = fn.name;
        const paramNames = fn.params.map(p => p.name);
        lines.push(`__addRoute("POST", "/rpc/${name}", async (req) => {`);
        lines.push(`  const body = await req.json();`);
        if (paramNames.length > 0) {
          // Support both positional ({__args: [...]}) and named ({key: val}) arg formats
          for (let pi = 0; pi < paramNames.length; pi++) {
            lines.push(`  const ${paramNames[pi]} = body.__args ? body.__args[${pi}] : body.${paramNames[pi]};`);
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

    // Generate explicit routes
    if (routes.length > 0) {
      lines.push('// ── Routes ──');
      for (const route of routes) {
        const method = route.method.toUpperCase();
        const path = route.path;
        const handler = this.genExpression(route.handler);

        lines.push(`__addRoute(${JSON.stringify(method)}, ${JSON.stringify(path)}, async (req, params) => {`);
        lines.push(`  const result = await ${handler}(req, params);`);
        lines.push(`  return Response.json(result);`);
        lines.push(`});`);
        lines.push('');
      }
    }

    // Include __contains helper if needed
    if (this._needsContainsHelper) {
      lines.push('// ── Runtime Helpers ──');
      lines.push(this.getContainsHelper());
      lines.push('');
    }

    // Bun.serve() request handler
    lines.push('// ── Request Handler ──');
    lines.push('async function __handleRequest(req) {');
    lines.push('  const url = new URL(req.url);');
    lines.push('  if (req.method === "OPTIONS") {');
    lines.push('    return new Response(null, { status: 204, headers: __corsHeaders });');
    lines.push('  }');
    lines.push('  for (const route of __routes) {');
    lines.push('    if (req.method === route.method) {');
    lines.push('      const match = url.pathname.match(route.regex);');
    lines.push('      if (match) {');
    lines.push('        try {');
    lines.push('          const res = await route.handler(req, match.groups || {});');
    lines.push('          // Attach CORS headers to response');
    lines.push('          const headers = new Headers(res.headers);');
    lines.push('          for (const [k, v] of Object.entries(__corsHeaders)) headers.set(k, v);');
    lines.push('          return new Response(res.body, { status: res.status, headers });');
    lines.push('        } catch (err) {');
    lines.push('          return Response.json({ error: err.message }, { status: 500, headers: __corsHeaders });');
    lines.push('        }');
    lines.push('      }');
    lines.push('    }');
    lines.push('  }');
    // Serve client HTML at root if available
    lines.push('  // Serve client HTML at root');
    lines.push('  if (url.pathname === "/" && typeof __clientHTML !== "undefined") {');
    lines.push('    return new Response(__clientHTML, { status: 200, headers: { "Content-Type": "text/html", ...(__corsHeaders) } });');
    lines.push('  }');
    lines.push('  return Response.json({ error: "Not Found" }, { status: 404, headers: __corsHeaders });');
    lines.push('}');
    lines.push('');

    // Start server with Bun.serve()
    const label = blockName ? ` [${blockName}]` : '';
    const portVar = blockName ? `PORT_${blockName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : 'PORT';
    lines.push('// ── Start Server ──');
    lines.push(`const __port = process.env.${portVar} || process.env.PORT || 3000;`);
    lines.push(`const __server = Bun.serve({`);
    lines.push(`  port: __port,`);
    lines.push(`  fetch: __handleRequest,`);
    lines.push(`});`);
    lines.push(`console.log(\`Lux server${label} running on \${__server.url}\`);`);

    return lines.join('\n');
  }
}
