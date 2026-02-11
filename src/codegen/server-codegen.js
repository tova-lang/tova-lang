import { BaseCodegen } from './base-codegen.js';

export class ServerCodegen extends BaseCodegen {
  generate(serverBlocks, sharedCode) {
    const lines = [];

    // Imports
    lines.push(`import { Hono } from 'hono';`);
    lines.push(`import { cors } from 'hono/cors';`);
    lines.push(`import { serve } from '@hono/node-adapter';`);
    lines.push('');

    // Shared code
    if (sharedCode.trim()) {
      lines.push('// ── Shared ──');
      lines.push(sharedCode);
      lines.push('');
    }

    // App setup
    lines.push('const app = new Hono();');
    lines.push('app.use("/*", cors());');
    lines.push('');

    // Server functions and routes
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
    lines.push('// ── Server Functions ──');
    for (const fn of functions) {
      lines.push(this.generateStatement(fn));
      lines.push('');
    }

    // Generate RPC endpoints for each server function (auto-wired)
    lines.push('// ── RPC Endpoints ──');
    for (const fn of functions) {
      const name = fn.name;
      const paramNames = fn.params.map(p => p.name);
      lines.push(`app.post("/rpc/${name}", async (c) => {`);
      lines.push(`  const body = await c.req.json();`);
      if (paramNames.length > 0) {
        lines.push(`  const { ${paramNames.join(', ')} } = body;`);
        lines.push(`  const result = await ${name}(${paramNames.join(', ')});`);
      } else {
        lines.push(`  const result = await ${name}();`);
      }
      lines.push(`  return c.json({ result });`);
      lines.push(`});`);
      lines.push('');
    }

    // Generate explicit routes
    lines.push('// ── Routes ──');
    for (const route of routes) {
      const method = route.method.toLowerCase();
      const path = route.path;
      const handler = this.genExpression(route.handler);

      lines.push(`app.${method}(${JSON.stringify(path)}, async (c) => {`);
      lines.push(`  const result = await ${handler}(c);`);
      lines.push(`  return c.json(result);`);
      lines.push(`});`);
      lines.push('');
    }

    // Start server
    lines.push('// ── Start Server ──');
    lines.push('const port = process.env.PORT || 3000;');
    lines.push('console.log(`Lux server running on http://localhost:${port}`);');
    lines.push('export default { port, fetch: app.fetch };');

    return lines.join('\n');
  }
}
