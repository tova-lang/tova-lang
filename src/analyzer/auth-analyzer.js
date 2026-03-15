// Auth-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when auth { } blocks are encountered.

export function installAuthAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._authAnalyzerInstalled) return;
  AnalyzerClass.prototype._authAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitAuthBlock = function(node) {
    const validHookEvents = new Set(['signup', 'login', 'logout', 'oauth_link']);
    const providerTypes = new Set();
    let hasProvider = false;

    for (const stmt of node.body) {
      if (stmt.type === 'AuthConfigField') {
        if (stmt.key === 'secret' && stmt.value.type === 'StringLiteral') {
          this.warnings.push({
            message: 'Auth secret should use env() — hardcoded secrets are insecure',
            loc: stmt.loc, code: 'W_AUTH_HARDCODED_SECRET', category: 'auth',
          });
        }
        if (stmt.key === 'token_expires' && stmt.value.type === 'NumberLiteral' && stmt.value.value < 300) {
          this.warnings.push({
            message: 'Access token expires too quickly (< 5 minutes) — may cause frequent logouts',
            loc: stmt.loc, code: 'W_AUTH_SHORT_TOKEN', category: 'auth',
          });
        }
        if (stmt.key === 'refresh_expires' && stmt.value.type === 'NumberLiteral' && stmt.value.value > 2592000) {
          this.warnings.push({
            message: 'Refresh token lives longer than 30 days — consider shorter lifetime',
            loc: stmt.loc, code: 'W_AUTH_LONG_REFRESH', category: 'auth',
          });
        }
        if (stmt.key === 'storage' && stmt.value.type === 'StringLiteral' && stmt.value.value === 'local') {
          this.warnings.push({
            message: 'localStorage tokens are vulnerable to XSS — prefer storage: "cookie"',
            loc: stmt.loc, code: 'W_AUTH_LOCAL_STORAGE', category: 'auth',
          });
        }
      }

      if (stmt.type === 'AuthProviderDeclaration') {
        hasProvider = true;
        const key = stmt.providerType + (stmt.name ? ':' + stmt.name : '');
        if (providerTypes.has(key)) {
          this.warnings.push({
            message: `Duplicate auth provider '${key}'`,
            loc: stmt.loc, code: 'W_AUTH_DUPLICATE_PROVIDER', category: 'auth',
          });
        }
        providerTypes.add(key);

        if (stmt.providerType === 'email') {
          if (!stmt.config.confirm_email) {
            this.warnings.push({
              message: 'Email provider without confirm_email — consider requiring email verification',
              loc: stmt.loc, code: 'W_AUTH_NO_CONFIRM', category: 'auth',
            });
          }
          if (stmt.config.password_min && stmt.config.password_min.type === 'NumberLiteral' && stmt.config.password_min.value < 8) {
            this.warnings.push({
              message: 'Minimum password length less than 8 — weak passwords allowed',
              loc: stmt.loc, code: 'W_AUTH_WEAK_PASSWORD', category: 'auth',
            });
          }
        }
      }

      if (stmt.type === 'AuthHookDeclaration') {
        if (!validHookEvents.has(stmt.event)) {
          this.warnings.push({
            message: `Unknown auth hook event '${stmt.event}' — valid: ${[...validHookEvents].join(', ')}`,
            loc: stmt.loc, code: 'W_AUTH_UNKNOWN_HOOK', category: 'auth',
          });
        }
      }

      if (stmt.type === 'AuthProtectedRoute') {
        if (!stmt.config.redirect) {
          this.warnings.push({
            message: `Protected route '${stmt.pattern}' has no redirect`,
            loc: stmt.loc, code: 'W_AUTH_PROTECTED_NO_REDIRECT', category: 'auth',
          });
        }
      }
    }

    if (!hasProvider) {
      this.warnings.push({
        message: 'Auth block has no providers — add at least one',
        loc: node.loc, code: 'W_AUTH_MISSING_PROVIDER', category: 'auth',
      });
    }
  };

  AnalyzerClass.prototype._validateAuthCrossBlock = function() {
    const securityRoles = new Set();
    for (const node of this.ast.body) {
      if (node.type === 'SecurityBlock') {
        for (const stmt of node.body) {
          if (stmt.type === 'SecurityRoleDeclaration') {
            securityRoles.add(stmt.name);
          }
        }
      }
    }

    for (const node of this.ast.body) {
      if (node.type === 'AuthBlock') {
        for (const stmt of node.body) {
          if (stmt.type === 'AuthProtectedRoute' && stmt.config.require) {
            const roleName = stmt.config.require.type === 'Identifier' ? stmt.config.require.name : null;
            if (roleName && securityRoles.size > 0 && !securityRoles.has(roleName)) {
              this.warnings.push({
                message: `Protected route requires role '${roleName}' not defined in security block`,
                loc: stmt.loc, code: 'W_AUTH_UNKNOWN_ROLE', category: 'auth',
              });
            }
          }
        }
      }
    }
  };
}
