// Security code generator for the Tova language
// Produces code fragments consumed by server-codegen and browser-codegen.

import { BaseCodegen } from './base-codegen.js';

export class SecurityCodegen extends BaseCodegen {

  /**
   * Merge all SecurityBlock nodes into a single config object.
   * Multiple security blocks are merged (last wins on conflicts).
   */
  static mergeSecurityBlocks(securityBlocks) {
    const config = {
      auth: null,        // SecurityAuthDeclaration
      roles: [],         // Array of SecurityRoleDeclaration
      protects: [],      // Array of SecurityProtectDeclaration
      sensitives: [],    // Array of SecuritySensitiveDeclaration
      cors: null,        // SecurityCorsDeclaration
      csp: null,         // SecurityCspDeclaration
      rateLimit: null,   // SecurityRateLimitDeclaration
      csrf: null,        // SecurityCsrfDeclaration
      audit: null,       // SecurityAuditDeclaration
      trustProxy: null,  // SecurityTrustProxyDeclaration
      hsts: null,        // SecurityHstsDeclaration
    };

    for (const block of securityBlocks) {
      for (const node of block.body) {
        switch (node.type) {
          case 'SecurityAuthDeclaration':
            config.auth = node;
            break;
          case 'SecurityRoleDeclaration':
            config.roles.push(node);
            break;
          case 'SecurityProtectDeclaration':
            config.protects.push(node);
            break;
          case 'SecuritySensitiveDeclaration':
            config.sensitives.push(node);
            break;
          case 'SecurityCorsDeclaration':
            config.cors = node;
            break;
          case 'SecurityCspDeclaration':
            config.csp = node;
            break;
          case 'SecurityRateLimitDeclaration':
            config.rateLimit = node;
            break;
          case 'SecurityCsrfDeclaration':
            config.csrf = node;
            break;
          case 'SecurityAuditDeclaration':
            config.audit = node;
            break;
          case 'SecurityTrustProxyDeclaration':
            config.trustProxy = node;
            break;
          case 'SecurityHstsDeclaration':
            config.hsts = node;
            break;
        }
      }
    }

    return config;
  }

  /**
   * Generate server-side security code fragments.
   * Returns an object with code strings for each security feature.
   */
  generateServerSecurity(securityConfig) {
    const result = {
      roleDefinitions: '',
      authCode: '',
      corsConfig: null,    // config object for server-codegen to use
      cspCode: '',
      rateLimitConfig: null, // config object
      csrfConfig: null,     // config object
      protectCode: '',
      sensitiveCode: '',
      auditCode: '',
      trustProxyConfig: null, // trust_proxy value
      hstsConfig: null,       // hsts config object
      hasAutoSanitize: false, // whether __autoSanitize was generated
    };

    // Role definitions
    if (securityConfig.roles.length > 0) {
      const lines = [];
      lines.push('// ── Security Roles ──');
      lines.push('const __securityRoles = {');
      for (const role of securityConfig.roles) {
        const perms = role.permissions.map(p => JSON.stringify(p)).join(', ');
        lines.push(`  ${JSON.stringify(role.name)}: [${perms}],`);
      }
      lines.push('};');
      lines.push('function __getUserRoles(user) {');
      lines.push('  if (!user) return [];');
      lines.push('  if (Array.isArray(user.roles)) return user.roles;');
      lines.push('  if (user.role) return [user.role];');
      lines.push('  return [];');
      lines.push('}');
      lines.push('function __hasRole(user, roleName) {');
      lines.push('  return __getUserRoles(user).includes(roleName);');
      lines.push('}');
      lines.push('function __hasPermission(user, permission) {');
      lines.push('  const userRoles = __getUserRoles(user);');
      lines.push('  for (const r of userRoles) {');
      lines.push('    const perms = __securityRoles[r];');
      lines.push('    if (perms && perms.includes(permission)) return true;');
      lines.push('  }');
      lines.push('  return false;');
      lines.push('}');
      result.roleDefinitions = lines.join('\n');
    }

    // Auth config — pass through to server codegen
    if (securityConfig.auth) {
      const authNode = securityConfig.auth;
      // Convert security auth config to the format server-codegen expects
      const config = { ...authNode.config };
      // Set the auth type as a value property (server-codegen checks .type.value)
      config.type = { value: authNode.authType, type: 'StringLiteral' };
      result.authConfig = config;
    }

    // CORS config — pass through to server codegen
    if (securityConfig.cors) {
      result.corsConfig = securityConfig.cors.config;
    }

    // CSP header generation
    if (securityConfig.csp) {
      const lines = [];
      lines.push('// ── Content Security Policy ──');
      const directives = [];
      for (const [key, valueNode] of Object.entries(securityConfig.csp.config)) {
        const directive = key.replace(/_/g, '-');
        directives.push({ directive, valueNode });
      }
      lines.push('function __getCspHeader() {');
      lines.push('  const parts = [];');
      for (const { directive, valueNode } of directives) {
        lines.push(`  parts.push("${directive} " + ${this.genExpression(valueNode)}.map(v => v === "self" ? "'self'" : v === "unsafe-inline" ? "'unsafe-inline'" : v === "unsafe-eval" ? "'unsafe-eval'" : v).join(" "));`);
      }
      lines.push('  return parts.join("; ");');
      lines.push('}');
      result.cspCode = lines.join('\n');
    }

    // Rate limit config — pass through to server codegen
    if (securityConfig.rateLimit) {
      result.rateLimitConfig = securityConfig.rateLimit.config;
    }

    // CSRF config
    if (securityConfig.csrf) {
      result.csrfConfig = securityConfig.csrf.config;
    }

    // Trust proxy config
    if (securityConfig.trustProxy) {
      result.trustProxyConfig = securityConfig.trustProxy.value;
    }

    // HSTS config
    if (securityConfig.hsts) {
      result.hstsConfig = securityConfig.hsts.config;
    } else if (securityConfig.auth) {
      // Auto-enable HSTS when auth is configured (default policy)
      result.hstsConfig = { __autoEnabled: true };
    }

    // Route protection middleware
    if (securityConfig.protects.length > 0) {
      const lines = [];
      lines.push('// ── Route Protection ──');
      lines.push('const __protectRules = [');
      for (const protect of securityConfig.protects) {
        const pattern = protect.pattern;
        const requireExpr = protect.config.require;
        let requireStr = '"authenticated"';
        if (requireExpr) {
          if (requireExpr.type === 'Identifier') {
            requireStr = JSON.stringify(requireExpr.name);
          } else {
            requireStr = this.genExpression(requireExpr);
          }
        }
        // Convert glob-style pattern to regex
        // 1. Replace ** with placeholder, 2. Replace * with placeholder
        // 3. Escape all regex-special chars (including /), 4. Restore glob placeholders
        const regexPattern = pattern
          .replace(/\*\*/g, '\x00GLOBSTAR\x00')
          .replace(/\*/g, '\x00STAR\x00')
          .replace(/[.+?^${}()|[\]\\/]/g, '\\$&')   // escape all regex specials including /
          .replace(/\x00STAR\x00/g, '[^/]*')         // * matches within one path segment
          .replace(/\x00GLOBSTAR\x00/g, '.*');        // ** matches across segments

        let rlMax = 'null';
        let rlWindow = 'null';
        if (protect.config.rate_limit) {
          if (protect.config.rate_limit.max) {
            rlMax = this.genExpression(protect.config.rate_limit.max);
          }
          if (protect.config.rate_limit.window) {
            rlWindow = this.genExpression(protect.config.rate_limit.window);
          }
        }

        lines.push(`  { pattern: /^${regexPattern}$/, require: ${requireStr}, rateLimit: { max: ${rlMax}, window: ${rlWindow} } },`);
      }
      lines.push('];');
      lines.push('function __checkProtection(path, user) {');
      lines.push('  for (const rule of __protectRules) {');
      lines.push('    if (rule.pattern.test(path)) {');
      lines.push('      if (rule.require === "authenticated") {');
      lines.push('        if (!user) return { allowed: false, reason: "Authentication required" };');
      lines.push('      } else {');
      lines.push('        if (!user) return { allowed: false, reason: "Authentication required" };');
      lines.push('        if (!__hasRole(user, rule.require)) return { allowed: false, reason: "Insufficient permissions" };');
      lines.push('      }');
      lines.push('      return { allowed: true, rateLimit: rule.rateLimit };');
      lines.push('    }');
      lines.push('  }');
      lines.push('  return { allowed: true, rateLimit: null };');
      lines.push('}');
      result.protectCode = lines.join('\n');
    }

    // Sensitive field sanitization
    if (securityConfig.sensitives.length > 0) {
      const lines = [];
      lines.push('// ── Sensitive Field Sanitization ──');

      // Identity comparison helper for visible_to: ["self"]
      // Checks multiple common identity fields instead of hardcoded user.id === obj.id
      const hasVisibleTo = securityConfig.sensitives.some(s => s.config.visible_to);
      if (hasVisibleTo) {
        lines.push('function __isSameIdentity(user, obj) {');
        lines.push('  const __idFields = ["id", "_id", "userId", "user_id", "uuid"];');
        lines.push('  for (const f of __idFields) {');
        lines.push('    if (user[f] != null && obj[f] != null && user[f] === obj[f]) return true;');
        lines.push('  }');
        lines.push('  return false;');
        lines.push('}');
      }

      // Group by type
      const byType = {};
      for (const s of securityConfig.sensitives) {
        if (!byType[s.typeName]) byType[s.typeName] = [];
        byType[s.typeName].push(s);
      }

      for (const [typeName, fields] of Object.entries(byType)) {
        const fnName = `__sanitize${typeName}`;
        lines.push(`function ${fnName}(obj, user) {`);
        lines.push('  if (!obj) return obj;');
        lines.push('  const result = { ...obj };');
        for (const field of fields) {
          if (field.config.never_expose) {
            lines.push(`  delete result.${field.fieldName};`);
          } else if (field.config.visible_to) {
            const visibleExpr = this.genExpression(field.config.visible_to);
            lines.push(`  const __visibleTo = ${visibleExpr};`);
            lines.push(`  const __canSee = __visibleTo.some(v => v === "self" ? (user && __isSameIdentity(user, obj)) : __hasRole(user, v));`);
            lines.push(`  if (!__canSee) delete result.${field.fieldName};`);
          }
        }
        lines.push('  return result;');
        lines.push('}');
      }

      // Fix 6a: Auto-sanitize dispatcher
      const typeNames = Object.keys(byType);
      lines.push('function __autoSanitize(data, user) {');
      lines.push('  if (data == null) return data;');
      lines.push('  if (Array.isArray(data)) return data.map(item => __autoSanitize(item, user));');
      lines.push('  if (typeof data !== "object") return data;');
      lines.push('  const __typeName = data.__type || data.__tag || (data.constructor && data.constructor.name !== "Object" ? data.constructor.name : null);');
      for (const typeName of typeNames) {
        lines.push(`  if (__typeName === ${JSON.stringify(typeName)}) return __sanitize${typeName}(data, user);`);
      }
      // Recurse into nested objects
      lines.push('  const __out = {};');
      lines.push('  for (const [k, v] of Object.entries(data)) {');
      lines.push('    __out[k] = __autoSanitize(v, user);');
      lines.push('  }');
      lines.push('  return __out;');
      lines.push('}');

      result.sensitiveCode = lines.join('\n');
      result.hasAutoSanitize = true;
    }

    // Audit logging
    if (securityConfig.audit) {
      const lines = [];
      lines.push('// ── Audit Logging ──');
      const storeExpr = securityConfig.audit.config.store
        ? this.genExpression(securityConfig.audit.config.store)
        : '"audit_log"';
      const retainExpr = securityConfig.audit.config.retain
        ? this.genExpression(securityConfig.audit.config.retain)
        : '90';
      lines.push(`const __auditStore = ${storeExpr};`);
      lines.push('if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(__auditStore)) throw new Error("Invalid audit store table name: " + __auditStore);');
      lines.push(`const __auditRetainDays = ${retainExpr};`);

      if (securityConfig.audit.config.events) {
        lines.push(`const __auditEvents = ${this.genExpression(securityConfig.audit.config.events)};`);
      } else {
        lines.push('const __auditEvents = [];');
      }

      lines.push('async function __auditLog(event, details, user) {');
      lines.push('  const entry = {');
      lines.push('    event,');
      lines.push('    timestamp: new Date().toISOString(),');
      lines.push('    user: user ? { id: user.id, roles: __getUserRoles ? __getUserRoles(user) : (user.roles || [user.role].filter(Boolean)) } : null,');
      lines.push('    details,');
      lines.push('  };');
      lines.push('  if (typeof db !== "undefined" && db.run) {');
      lines.push(`    try { await db.run("INSERT INTO " + __auditStore + " (event, timestamp, user_id, details) VALUES (?, ?, ?, ?)", entry.event, entry.timestamp, entry.user ? entry.user.id : null, JSON.stringify(entry.details)); } catch (__auditErr) { console.error("[tova:audit] Failed to write audit log:", __auditErr.message || __auditErr); }`);
      lines.push('  }');
      lines.push('}');
      result.auditCode = lines.join('\n');
    }

    return result;
  }

  /**
   * Generate browser-side security code fragments.
   */
  generateBrowserSecurity(securityConfig) {
    const lines = [];

    // Auth token injection for RPC proxy
    if (securityConfig.auth) {
      // Check if auth storage is "cookie" (HttpOnly cookie mode)
      const storageNode = securityConfig.auth.config.storage;
      const isCookieAuth = storageNode && storageNode.type === 'StringLiteral' && storageNode.value === 'cookie';

      if (isCookieAuth) {
        // HttpOnly cookie mode: server manages tokens via Set-Cookie
        // Client just ensures credentials are included in fetch
        lines.push('// ── Security: Auth Token (HttpOnly Cookie) ──');
        lines.push('function getAuthToken() { return null; /* managed by HttpOnly cookie */ }');
        lines.push('function setAuthToken(_token) { /* no-op: server sets HttpOnly cookie */ }');
        lines.push('function clearAuthToken() {');
        lines.push('  fetch("/rpc/__logout", { method: "POST", credentials: "include" }).catch(() => {});');
        lines.push('}');
        lines.push('configureRPC({ credentials: "include" });');
        lines.push('');
      } else {
        // localStorage mode (default)
        lines.push('// ── Security: Auth Token ──');
        lines.push('function getAuthToken() {');
        lines.push('  return localStorage.getItem("__tova_auth_token");');
        lines.push('}');
        lines.push('function setAuthToken(token) {');
        lines.push('  localStorage.setItem("__tova_auth_token", token);');
        lines.push('}');
        lines.push('function clearAuthToken() {');
        lines.push('  localStorage.removeItem("__tova_auth_token");');
        lines.push('}');
        lines.push('addRPCInterceptor({');
        lines.push('  request({ options }) {');
        lines.push('    const token = getAuthToken();');
        lines.push('    if (token) options.headers["Authorization"] = "Bearer " + token;');
        lines.push('    return options;');
        lines.push('  }');
        lines.push('});');
        lines.push('');
      }
    }

    // Role definitions and can() helper (Fix 8: advisory comment)
    if (securityConfig.roles.length > 0) {
      lines.push('// ── Security: Roles ──');
      lines.push('// NOTE: Client-side role checking is for UI purposes only. All authorization is enforced server-side.');
      lines.push('const __browserRoles = {');
      for (const role of securityConfig.roles) {
        const perms = role.permissions.map(p => JSON.stringify(p)).join(', ');
        lines.push(`  ${JSON.stringify(role.name)}: [${perms}],`);
      }
      lines.push('};');
      lines.push('let __currentUserRoles = [];');
      lines.push('function setUserRole(role) { __currentUserRoles = Array.isArray(role) ? role : [role]; }');
      lines.push('function getUserRole() { return __currentUserRoles; }');
      lines.push('function can(permission) {');
      lines.push('  for (const r of __currentUserRoles) {');
      lines.push('    const perms = __browserRoles[r];');
      lines.push('    if (perms && perms.includes(permission)) return true;');
      lines.push('  }');
      lines.push('  return false;');
      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }
}
