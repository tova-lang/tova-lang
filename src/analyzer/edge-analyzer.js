// Edge-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when edge { } blocks are encountered.

export function installEdgeAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._edgeAnalyzerInstalled) return;
  AnalyzerClass.prototype._edgeAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitEdgeBlock = function(node) {
    const validTargets = new Set(['cloudflare', 'deno', 'vercel', 'lambda', 'bun']);
    const validConfigKeys = new Set(['target']);
    const bindingNames = new Set();

    // Binding support matrix per target
    const BINDING_SUPPORT = {
      cloudflare: { kv: true, sql: true, storage: true, queue: true },
      deno:       { kv: true, sql: false, storage: false, queue: false },
      vercel:     { kv: false, sql: false, storage: false, queue: false },
      lambda:     { kv: false, sql: false, storage: false, queue: false },
      bun:        { kv: false, sql: true, storage: false, queue: false },
    };

    // Targets that support schedule/consume/middleware
    const SCHEDULE_TARGETS = new Set(['cloudflare', 'deno']);
    const CONSUME_TARGETS = new Set(['cloudflare']);

    // Determine target from config fields
    let target = 'cloudflare';
    for (const stmt of node.body) {
      if (stmt.type === 'EdgeConfigField' && stmt.key === 'target' && stmt.value.type === 'StringLiteral') {
        target = stmt.value.value;
      }
    }

    this.pushScope('edge');

    let kvCount = 0;
    const queueNames = new Set();
    const consumers = [];

    for (const stmt of node.body) {
      // Validate config fields
      if (stmt.type === 'EdgeConfigField') {
        if (!validConfigKeys.has(stmt.key)) {
          this.warnings.push({
            message: `Unknown edge config key '${stmt.key}' — valid keys are: ${[...validConfigKeys].join(', ')}`,
            loc: stmt.loc,
            code: 'W_UNKNOWN_EDGE_CONFIG',
          });
        }
        if (stmt.key === 'target' && stmt.value.type === 'StringLiteral') {
          if (!validTargets.has(stmt.value.value)) {
            this.warnings.push({
              message: `Unknown edge target '${stmt.value.value}' — valid targets are: ${[...validTargets].join(', ')}`,
              loc: stmt.loc,
              code: 'W_UNKNOWN_EDGE_TARGET',
            });
          }
        }
        continue;
      }

      // Check for duplicate binding names
      if (stmt.type === 'EdgeKVDeclaration' || stmt.type === 'EdgeSQLDeclaration' ||
          stmt.type === 'EdgeStorageDeclaration' || stmt.type === 'EdgeQueueDeclaration') {
        if (bindingNames.has(stmt.name)) {
          this.warnings.push({
            message: `Duplicate edge binding '${stmt.name}'`,
            loc: stmt.loc,
            code: 'W_DUPLICATE_EDGE_BINDING',
          });
        }
        bindingNames.add(stmt.name);
      }

      // Track queue names for consume validation
      if (stmt.type === 'EdgeQueueDeclaration') {
        queueNames.add(stmt.name);
      }

      // Check for duplicate env/secret names
      if (stmt.type === 'EdgeEnvDeclaration' || stmt.type === 'EdgeSecretDeclaration') {
        if (bindingNames.has(stmt.name)) {
          this.warnings.push({
            message: `Duplicate edge binding '${stmt.name}'`,
            loc: stmt.loc,
            code: 'W_DUPLICATE_EDGE_BINDING',
          });
        }
        bindingNames.add(stmt.name);
      }

      // Unsupported binding warnings (per target)
      const support = BINDING_SUPPORT[target] || BINDING_SUPPORT.cloudflare;
      if (stmt.type === 'EdgeKVDeclaration' && !support.kv) {
        this.warnings.push({
          message: `KV binding '${stmt.name}' is not supported on target '${target}' — it will be stubbed as null`,
          loc: stmt.loc,
          code: 'W_UNSUPPORTED_KV',
        });
      }
      if (stmt.type === 'EdgeSQLDeclaration' && !support.sql) {
        this.warnings.push({
          message: `SQL binding '${stmt.name}' is not supported on target '${target}' — it will be stubbed as null`,
          loc: stmt.loc,
          code: 'W_UNSUPPORTED_SQL',
        });
      }
      if (stmt.type === 'EdgeStorageDeclaration' && !support.storage) {
        this.warnings.push({
          message: `Storage binding '${stmt.name}' is not supported on target '${target}' — it will be stubbed as null`,
          loc: stmt.loc,
          code: 'W_UNSUPPORTED_STORAGE',
        });
      }
      if (stmt.type === 'EdgeQueueDeclaration' && !support.queue) {
        this.warnings.push({
          message: `Queue binding '${stmt.name}' is not supported on target '${target}' — it will be stubbed as null`,
          loc: stmt.loc,
          code: 'W_UNSUPPORTED_QUEUE',
        });
      }

      // Deno multi-KV warning
      if (stmt.type === 'EdgeKVDeclaration') {
        kvCount++;
        if (kvCount > 1 && target === 'deno') {
          this.warnings.push({
            message: `Deno Deploy supports only one KV store — '${stmt.name}' will share the same store as the first KV binding`,
            loc: stmt.loc,
            code: 'W_DENO_MULTI_KV',
          });
        }
      }

      // Validate schedule cron expressions + target support
      if (stmt.type === 'EdgeScheduleDeclaration') {
        const parts = stmt.cron.split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          this.warnings.push({
            message: `Invalid cron expression '${stmt.cron}' — expected 5 or 6 space-separated fields`,
            loc: stmt.loc,
            code: 'W_INVALID_CRON',
          });
        }
        if (!SCHEDULE_TARGETS.has(target)) {
          this.warnings.push({
            message: `Scheduled tasks are not supported on target '${target}' — schedule '${stmt.name}' will be ignored. Supported targets: ${[...SCHEDULE_TARGETS].join(', ')}`,
            loc: stmt.loc,
            code: 'W_UNSUPPORTED_SCHEDULE',
          });
        }
      }

      // Collect consume declarations for post-loop validation
      if (stmt.type === 'EdgeConsumeDeclaration') {
        consumers.push(stmt);
        if (!CONSUME_TARGETS.has(target)) {
          this.warnings.push({
            message: `Queue consumers are not supported on target '${target}' — consume '${stmt.queue}' will be ignored. Supported targets: ${[...CONSUME_TARGETS].join(', ')}`,
            loc: stmt.loc,
            code: 'W_UNSUPPORTED_CONSUME',
          });
        }
      }

      // Visit child nodes — edge-specific types are noop in the registry,
      // so explicitly visit bodies that contain statements
      if (stmt.type === 'EdgeScheduleDeclaration' && stmt.body) {
        for (const s of stmt.body.body || []) this.visitNode(s);
      } else if (stmt.type === 'FunctionDeclaration' || stmt.type === 'RouteDeclaration') {
        this.visitNode(stmt);
      }
    }

    // Post-loop: validate consume references a declared queue
    for (const consumer of consumers) {
      if (!queueNames.has(consumer.queue)) {
        this.warnings.push({
          message: `consume '${consumer.queue}' references undeclared queue binding — add 'queue ${consumer.queue}' to the edge block`,
          loc: consumer.loc,
          code: 'W_CONSUME_UNKNOWN_QUEUE',
        });
      }
    }

    // Warn if edge block has no route or schedule handlers
    const hasRoutes = node.body.some(s => s.type === 'RouteDeclaration');
    const hasSchedules = node.body.some(s => s.type === 'EdgeScheduleDeclaration');
    const hasConsumers = consumers.length > 0;
    if (!hasRoutes && !hasSchedules && !hasConsumers) {
      this.warnings.push({
        message: 'edge block has no routes, schedules, or consumers — it will produce no handlers',
        loc: node.loc,
        code: 'W_EDGE_NO_HANDLERS',
      });
    }

    this.popScope();
  };

  AnalyzerClass.prototype._validateEdgeCrossBlock = function() {
    const edgeBlocks = this.ast.body.filter(n => n.type === 'EdgeBlock');
    if (edgeBlocks.length === 0) return;

    // Warn if edge + cli coexist (cli takes over with earlyReturn)
    const hasCli = this.ast.body.some(n => n.type === 'CliBlock');
    if (hasCli) {
      this.warnings.push({
        message: 'edge {} and cli {} blocks in the same file — cli produces a standalone executable, edge block will be ignored',
        loc: edgeBlocks[0].loc,
        code: 'W_EDGE_WITH_CLI',
      });
    }
  };
}
