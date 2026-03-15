// Security-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when security { } blocks are encountered.

export function installSecurityAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._securityAnalyzerInstalled) return;
  AnalyzerClass.prototype._securityAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitSecurityBlock = function(node) {
    // Per-block: only check for duplicate role names within this block
    const localRoles = new Set();
    for (const stmt of node.body) {
      if (stmt.type === 'SecurityRoleDeclaration') {
        if (localRoles.has(stmt.name)) {
          this.warnings.push({
            message: `Duplicate role definition: '${stmt.name}'`,
            loc: stmt.loc,
            code: 'W_DUPLICATE_ROLE',
            category: 'security',
          });
        }
        localRoles.add(stmt.name);
      }
    }
  };

  AnalyzerClass.prototype._validateSecurityCrossBlock = function() {
    // W_NO_SECURITY_BLOCK: server/edge block without security block
    const hasServerOrEdge = this.ast.body.some(n => n.type === 'ServerBlock' || n.type === 'EdgeBlock');
    const hasSecurityBlock = this.ast.body.some(n => n.type === 'SecurityBlock');
    if (hasServerOrEdge && !hasSecurityBlock) {
      const block = this.ast.body.find(n => n.type === 'ServerBlock' || n.type === 'EdgeBlock');
      this.warnings.push({
        message: 'Server/edge block defined without a security block — consider adding security { ... } for auth, CORS, and CSRF protection',
        loc: block.loc,
        code: 'W_NO_SECURITY_BLOCK',
        category: 'security',
      });
    }

    // Collect ALL security declarations across ALL security blocks in the AST
    const allRoles = new Set();
    const allProtects = [];
    const allSensitives = [];
    let hasAuth = false;
    let hasProtect = false;
    let authDecl = null;
    let corsDecl = null;
    let rateLimitDecl = null;
    let csrfDecl = null;

    // Check for top-level AuthBlock (independent auth block, not security sub-block)
    for (const node of this.ast.body) {
      if (node.type === 'AuthBlock') { hasAuth = true; authDecl = node; break; }
    }

    const roleDecls = []; // track all role declarations for cross-block duplicate detection
    for (const node of this.ast.body) {
      if (node.type !== 'SecurityBlock') continue;
      for (const stmt of node.body) {
        if (stmt.type === 'SecurityRoleDeclaration') {
          roleDecls.push(stmt);
          allRoles.add(stmt.name);
        } else if (stmt.type === 'SecurityProtectDeclaration') {
          allProtects.push(stmt);
          hasProtect = true;
        } else if (stmt.type === 'SecuritySensitiveDeclaration') {
          allSensitives.push(stmt);
        } else if (stmt.type === 'SecurityAuthDeclaration') {
          hasAuth = true;
          authDecl = stmt;
        } else if (stmt.type === 'SecurityCorsDeclaration') {
          corsDecl = stmt;
        } else if (stmt.type === 'SecurityRateLimitDeclaration') {
          rateLimitDecl = stmt;
        } else if (stmt.type === 'SecurityCsrfDeclaration') {
          csrfDecl = stmt;
        }
      }
    }

    // W_DUPLICATE_ROLE across blocks: detect roles with same name in different security blocks
    const seenRoleNames = new Map(); // name -> first declaration
    for (const decl of roleDecls) {
      const prev = seenRoleNames.get(decl.name);
      if (prev && prev.loc !== decl.loc) {
        // Only warn if this is from a different block (same-block dupes handled by visitSecurityBlock)
        const prevInSameBlock = this.ast.body.some(b =>
          b.type === 'SecurityBlock' && b.body.includes(prev) && b.body.includes(decl)
        );
        if (!prevInSameBlock) {
          this.warnings.push({
            message: `Role '${decl.name}' is defined in multiple security blocks — later definition overwrites earlier one`,
            loc: decl.loc,
            code: 'W_DUPLICATE_ROLE',
            category: 'security',
          });
        }
      }
      seenRoleNames.set(decl.name, decl);
    }

    // W_UNKNOWN_AUTH_TYPE — validate auth type is a known value
    if (authDecl && authDecl.authType) {
      const validAuthTypes = ['jwt', 'api_key'];
      if (!validAuthTypes.includes(authDecl.authType)) {
        this.warnings.push({
          message: `Unknown auth type '${authDecl.authType}' — supported types are: ${validAuthTypes.join(', ')}`,
          loc: authDecl.loc,
          code: 'W_UNKNOWN_AUTH_TYPE',
          category: 'security',
        });
      }
    }

    // Fix 2: W_HARDCODED_SECRET — warn if auth secret is a string literal
    // Only check SecurityAuthDeclaration (which has .config), not top-level AuthBlock
    if (authDecl && authDecl.config && authDecl.config.secret) {
      const secretNode = authDecl.config.secret;
      if (secretNode.type === 'StringLiteral') {
        this.warnings.push({
          message: 'Auth secret is hardcoded as a string literal — use env("SECRET_NAME") instead',
          loc: authDecl.loc,
          code: 'W_HARDCODED_SECRET',
          category: 'security',
        });
      }
    }

    // Fix 7: W_CORS_WILDCARD — warn if cors origins contains "*"
    if (corsDecl && corsDecl.config.origins) {
      const originsNode = corsDecl.config.origins;
      if (originsNode.elements) {
        for (const elem of originsNode.elements) {
          if (elem.type === 'StringLiteral' && elem.value === '*') {
            this.warnings.push({
              message: 'CORS origins contains wildcard "*" — consider restricting to specific origins',
              loc: corsDecl.loc,
              code: 'W_CORS_WILDCARD',
              category: 'security',
            });
            break;
          }
        }
      }
    }

    // W_INVALID_RATE_LIMIT — validate rate limit max/window are positive numbers
    const _rlNumericValue = (node) => {
      if (!node) return null;
      if (node.type === 'NumberLiteral') return node.value;
      if (node.type === 'UnaryExpression' && node.operator === '-' && node.operand && node.operand.type === 'NumberLiteral') return -node.operand.value;
      return null;
    };
    if (rateLimitDecl && rateLimitDecl.config) {
      const rlMaxVal = _rlNumericValue(rateLimitDecl.config.max);
      const rlWindowVal = _rlNumericValue(rateLimitDecl.config.window);
      if (rlMaxVal !== null && rlMaxVal <= 0) {
        this.warnings.push({
          message: `Rate limit max must be a positive number, got ${rlMaxVal}`,
          loc: rateLimitDecl.loc,
          code: 'W_INVALID_RATE_LIMIT',
          category: 'security',
        });
      }
      if (rlWindowVal !== null && rlWindowVal <= 0) {
        this.warnings.push({
          message: `Rate limit window must be a positive number, got ${rlWindowVal}`,
          loc: rateLimitDecl.loc,
          code: 'W_INVALID_RATE_LIMIT',
          category: 'security',
        });
      }
    }

    // W_CSRF_DISABLED — warn when CSRF is explicitly disabled
    if (csrfDecl && csrfDecl.config && csrfDecl.config.enabled) {
      const enabledNode = csrfDecl.config.enabled;
      if ((enabledNode.type === 'BooleanLiteral' && enabledNode.value === false) ||
          (enabledNode.type === 'Identifier' && enabledNode.name === 'false')) {
        this.warnings.push({
          message: 'CSRF protection is explicitly disabled — this increases vulnerability to cross-site request forgery attacks',
          loc: csrfDecl.loc,
          code: 'W_CSRF_DISABLED',
          category: 'security',
        });
      }
    }

    // W_LOCALSTORAGE_TOKEN — warn when auth uses default localStorage storage (XSS-vulnerable)
    if (authDecl && authDecl.authType === 'jwt' && authDecl.config) {
      const storageNode = authDecl.config.storage;
      const isCookieAuth = storageNode && storageNode.type === 'StringLiteral' && storageNode.value === 'cookie';
      if (!isCookieAuth) {
        this.warnings.push({
          message: 'Auth tokens stored in localStorage are vulnerable to XSS attacks — consider using storage: "cookie" for HttpOnly cookie storage',
          loc: authDecl.loc,
          code: 'W_LOCALSTORAGE_TOKEN',
          category: 'security',
        });
      }
    }

    // Fix 5: W_INMEMORY_RATELIMIT — warn that rate limiting is in-memory only
    if (rateLimitDecl) {
      this.warnings.push({
        message: 'Rate limiting uses in-memory storage — not shared across server instances. Consider an external store for production multi-instance deployments',
        loc: rateLimitDecl.loc,
        code: 'W_INMEMORY_RATELIMIT',
        category: 'security',
      });
    }

    // Fix 6: W_NO_AUTH_RATELIMIT — warn when auth exists but no rate limiting protects against brute-force
    if (hasAuth && !rateLimitDecl) {
      const hasAuthRateLimit = allProtects.some(p => p.config && p.config.rate_limit);
      if (!hasAuthRateLimit) {
        this.warnings.push({
          message: 'Auth is configured without rate limiting — consider adding rate_limit to protect against brute-force attacks',
          loc: authDecl.loc,
          code: 'W_NO_AUTH_RATELIMIT',
          category: 'security',
        });
      }
    }

    // Fix 7: W_HASH_NOT_ENFORCED — warn when sensitive declares hash but it's not auto-enforced
    for (const s of allSensitives) {
      if (s.config && s.config.hash) {
        const hashVal = s.config.hash.value || s.config.hash;
        this.warnings.push({
          message: `sensitive ${s.typeName}.${s.fieldName} declares hash: "${hashVal}" but hashing is not automatically enforced — use hash_password() in your write handlers`,
          loc: s.loc,
          code: 'W_HASH_NOT_ENFORCED',
          category: 'security',
        });
      }
    }

    // No security blocks → nothing to validate (but allow auth/cors checks above)
    if (!hasProtect && allSensitives.length === 0) return;

    // W_PROTECT_WITHOUT_AUTH: protect rules exist but no auth configured
    if (hasProtect && !hasAuth) {
      // Find first protect for location
      this.warnings.push({
        message: 'Route protection rules exist but no auth is configured — all protected routes will be inaccessible',
        loc: allProtects[0].loc,
        code: 'W_PROTECT_WITHOUT_AUTH',
        category: 'security',
      });
    }

    // W_UNDEFINED_ROLE: protect rules reference roles not defined anywhere
    for (const protect of allProtects) {
      const requireExpr = protect.config.require;
      if (!requireExpr) {
        // W_PROTECT_NO_REQUIRE: protect rule has no require key
        this.warnings.push({
          message: `Protect rule for "${protect.pattern}" has no 'require' — route is unprotected`,
          loc: protect.loc,
          code: 'W_PROTECT_NO_REQUIRE',
          category: 'security',
        });
        continue;
      }
      if (requireExpr.type === 'Identifier' && requireExpr.name !== 'authenticated') {
        if (!allRoles.has(requireExpr.name)) {
          this.warnings.push({
            message: `Protect rule references undefined role '${requireExpr.name}'`,
            loc: protect.loc,
            code: 'W_UNDEFINED_ROLE',
            category: 'security',
          });
        }
      }
    }

    // W_UNDEFINED_ROLE: sensitive visible_to references roles not defined anywhere
    for (const sensitive of allSensitives) {
      const visibleTo = sensitive.config.visible_to;
      if (visibleTo && (visibleTo.type === 'ArrayExpression' || visibleTo.type === 'ArrayLiteral')) {
        for (const elem of visibleTo.elements) {
          if (elem.type === 'Identifier' && elem.name !== 'self') {
            if (!allRoles.has(elem.name)) {
              this.warnings.push({
                message: `Sensitive field '${sensitive.typeName}.${sensitive.fieldName}' visible_to references undefined role '${elem.name}'`,
                loc: sensitive.loc,
                code: 'W_UNDEFINED_ROLE',
                category: 'security',
              });
            }
          }
        }
      }
    }
  };
}
