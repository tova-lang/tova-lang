// Auth code generator for the Tova language
// Generates server-side auth endpoints, browser-side signals/components, and route guards.

export class AuthCodegen {

  /**
   * Merge all AuthBlock AST nodes into a single config object.
   * Called statically from codegen.js
   */
  static mergeAuthBlocks(authBlocks) {
    const config = {
      secret: null,          // Expression or null
      token_expires: 900,    // 15 min default
      refresh_expires: 604800, // 7 days default
      storage: 'cookie',     // 'cookie' or 'local'
      auto_link: true,
    };
    const providers = [];
    const hooks = {};          // event -> handler AST node
    const protectedRoutes = [];

    for (const block of authBlocks) {
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'AuthConfigField': {
            // Extract primitive values from AST nodes
            const val = stmt.value;
            if (val.type === 'NumberLiteral') config[stmt.key] = val.value;
            else if (val.type === 'StringLiteral') config[stmt.key] = val.value;
            else if (val.type === 'BooleanLiteral') config[stmt.key] = val.value;
            else config[stmt.key] = val; // keep AST node for complex expressions like env()
            break;
          }
          case 'AuthProviderDeclaration':
            providers.push(stmt);
            break;
          case 'AuthHookDeclaration':
            hooks[stmt.event] = stmt.handler;
            break;
          case 'AuthProtectedRoute':
            protectedRoutes.push(stmt);
            break;
        }
      }
    }

    return { config, providers, hooks, protectedRoutes };
  }

  /**
   * Generate server-side auth code.
   * Returns a string of JS code to inject into server output.
   */
  generateServerCode(authConfig, baseCodegen) {
    const lines = [];
    const { config, providers, hooks, protectedRoutes } = authConfig;

    // Get secret expression
    const secretExpr = this._resolveConfigValue(config.secret, baseCodegen) ||
      'process.env.AUTH_SECRET || "tova-dev-secret-change-me"';
    const tokenExpires = typeof config.token_expires === 'number' ? config.token_expires : 900;
    const refreshExpires = typeof config.refresh_expires === 'number' ? config.refresh_expires : 604800;
    const storageCookie = config.storage === 'cookie' || config.storage === undefined;

    // Determine which providers are active
    const hasEmail = providers.some(p => p.providerType === 'email');
    const oauthProviders = providers.filter(p =>
      ['google', 'github', 'apple', 'discord', 'custom'].includes(p.providerType));
    const hasMagicLink = providers.some(p => p.providerType === 'magic_link');

    lines.push('');
    lines.push('// ─── Auth Block ─────────────────────────────────────────────');
    lines.push('const __auth_crypto = require("crypto");');
    lines.push('');

    // Auth secret
    lines.push(`const __auth_secret = ${secretExpr};`);
    lines.push(`const __auth_token_expires = ${tokenExpires};`);
    lines.push(`const __auth_refresh_expires = ${refreshExpires};`);
    lines.push('');

    // User table DDL
    lines.push(...this._genUserTable());
    lines.push('');

    // Crypto helpers
    lines.push(...this._genCryptoHelpers());
    lines.push('');

    // Rate limiting
    lines.push(...this._genRateLimiting());
    lines.push('');

    // Hook wiring
    lines.push(...this._genHookWiring(hooks, baseCodegen));
    lines.push('');

    // Auth middleware (verify JWT)
    lines.push(...this._genAuthMiddleware(storageCookie));
    lines.push('');

    // Email/password endpoints
    if (hasEmail) {
      const emailProvider = providers.find(p => p.providerType === 'email');
      lines.push(...this._genSignupEndpoint(emailProvider, baseCodegen));
      lines.push(...this._genLoginEndpoint(emailProvider, baseCodegen));
      lines.push(...this._genForgotPasswordEndpoint(baseCodegen));
      lines.push(...this._genResetPasswordEndpoint(baseCodegen));

      // Email confirmation
      const confirmEmail = this._getProviderConfigBool(emailProvider, 'confirm_email', false);
      if (confirmEmail) {
        lines.push(...this._genConfirmEndpoint());
      }
    }

    // Core endpoints (always generated)
    lines.push(...this._genLogoutEndpoint(storageCookie));
    lines.push(...this._genRefreshEndpoint(storageCookie));
    lines.push(...this._genMeEndpoint(storageCookie));

    // OAuth endpoints
    for (const provider of oauthProviders) {
      lines.push(...this._genOAuthRedirect(provider, baseCodegen));
      lines.push(...this._genOAuthCallback(provider, storageCookie, baseCodegen));
    }

    // Magic link endpoints
    if (hasMagicLink) {
      const magicProvider = providers.find(p => p.providerType === 'magic_link');
      lines.push(...this._genMagicLinkEndpoint(magicProvider, baseCodegen));
      lines.push(...this._genMagicLinkVerify(magicProvider, storageCookie));
    }

    lines.push('// ─── End Auth Block ─────────────────────────────────────────');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate browser-side auth code.
   * Returns a string of JS code to inject into browser output.
   */
  generateBrowserCode(authConfig, baseCodegen) {
    const lines = [];
    const { config, providers, hooks, protectedRoutes } = authConfig;
    const storageCookie = config.storage === 'cookie' || config.storage === undefined;

    const hasEmail = providers.some(p => p.providerType === 'email');
    const oauthProviders = providers.filter(p =>
      ['google', 'github', 'apple', 'discord', 'custom'].includes(p.providerType));
    const hasMagicLink = providers.some(p => p.providerType === 'magic_link');

    lines.push('');
    lines.push('// ─── Auth Block (Browser) ───────────────────────────────');
    lines.push('');

    // $ signals
    lines.push('const [$currentUser, set$currentUser] = createSignal(null);');
    lines.push('const [$isAuthenticated, set$isAuthenticated] = createSignal(false);');
    lines.push('const [$authLoading, set$authLoading] = createSignal(true);');
    lines.push('');

    // Auth fetch helper
    lines.push('async function __auth_fetch(url, options = {}) {');
    if (storageCookie) {
      lines.push('  options.credentials = "include";');
    } else {
      lines.push('  const token = localStorage.getItem("__tova_auth_token");');
      lines.push('  if (token) { options.headers = { ...options.headers, "Authorization": "Bearer " + token }; }');
    }
    lines.push('  options.headers = { ...options.headers, "Content-Type": "application/json" };');
    lines.push('  return fetch(url, options);');
    lines.push('}');
    lines.push('');

    // Logout function
    lines.push('async function logout() {');
    lines.push('  await __auth_fetch("/auth/logout", { method: "POST" });');
    if (!storageCookie) {
      lines.push('  localStorage.removeItem("__tova_auth_token");');
    }
    lines.push('  set$currentUser(null);');
    lines.push('  set$isAuthenticated(false);');
    lines.push('  __auth_channel.postMessage({ type: "logout" });');
    lines.push('}');
    lines.push('');

    // Refresh auth on load
    lines.push('async function __auth_refresh() {');
    lines.push('  set$authLoading(true);');
    lines.push('  try {');
    lines.push('    const res = await __auth_fetch("/auth/me");');
    lines.push('    if (res.ok) {');
    lines.push('      const data = await res.json();');
    lines.push('      set$currentUser(data.user);');
    lines.push('      set$isAuthenticated(true);');
    lines.push('    } else {');
    lines.push('      set$currentUser(null);');
    lines.push('      set$isAuthenticated(false);');
    lines.push('    }');
    lines.push('  } catch {');
    lines.push('    set$currentUser(null);');
    lines.push('    set$isAuthenticated(false);');
    lines.push('  }');
    lines.push('  set$authLoading(false);');
    lines.push('}');
    lines.push('__auth_refresh();');
    lines.push('');

    // Cross-tab sync
    lines.push('const __auth_channel = new BroadcastChannel("__tova_auth");');
    lines.push('__auth_channel.onmessage = (e) => {');
    lines.push('  if (e.data.type === "logout") { set$currentUser(null); set$isAuthenticated(false); }');
    lines.push('  if (e.data.type === "login") { __auth_refresh(); }');
    lines.push('};');
    lines.push('');

    // LoginForm component
    if (hasEmail) {
      lines.push('function LoginForm(props) {');
      lines.push('  const [email, setEmail] = createSignal("");');
      lines.push('  const [password, setPassword] = createSignal("");');
      lines.push('  const [error, setError] = createSignal("");');
      lines.push('  const [loading, setLoading] = createSignal(false);');
      lines.push('  async function handleSubmit(e) {');
      lines.push('    e.preventDefault();');
      lines.push('    setLoading(true); setError("");');
      lines.push('    try {');
      lines.push('      const res = await __auth_fetch("/auth/login", { method: "POST", body: JSON.stringify({ email: email(), password: password() }) });');
      lines.push('      const data = await res.json();');
      lines.push('      if (!res.ok) { setError(data.error || "Login failed"); setLoading(false); return; }');
      if (!storageCookie) {
        lines.push('      if (data.token) localStorage.setItem("__tova_auth_token", data.token);');
      }
      lines.push('      set$currentUser(data.user);');
      lines.push('      set$isAuthenticated(true);');
      lines.push('      __auth_channel.postMessage({ type: "login" });');
      lines.push('      if (props?.onSuccess) props.onSuccess(data.user);');
      lines.push('      if (props?.redirect) window.location.href = props.redirect;');
      lines.push('    } catch(err) { setError("Network error"); }');
      lines.push('    setLoading(false);');
      lines.push('  }');
      lines.push('  return () => {');
      lines.push('    const form = tova_el("form", { onsubmit: handleSubmit });');
      lines.push('    const emailInput = tova_el("input", { type: "email", placeholder: "Email", oninput: (e) => setEmail(e.target.value) });');
      lines.push('    const passInput = tova_el("input", { type: "password", placeholder: "Password", oninput: (e) => setPassword(e.target.value) });');
      lines.push('    const btn = tova_el("button", { type: "submit" }); btn.textContent = "Log in";');
      lines.push('    form.append(emailInput, passInput, btn);');

      // OAuth buttons
      for (const op of oauthProviders) {
        const name = op.providerType === 'custom' ? op.name : op.providerType;
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        lines.push(`    const oauth_${name} = tova_el("a", { href: "/auth/oauth/${name}" }); oauth_${name}.textContent = "Continue with ${label}";`);
        lines.push(`    form.append(oauth_${name});`);
      }

      lines.push('    return form;');
      lines.push('  };');
      lines.push('}');
      lines.push('');

      // SignupForm component
      lines.push('function SignupForm(props) {');
      lines.push('  const [email, setEmail] = createSignal("");');
      lines.push('  const [password, setPassword] = createSignal("");');
      lines.push('  const [error, setError] = createSignal("");');
      lines.push('  const [loading, setLoading] = createSignal(false);');
      lines.push('  async function handleSubmit(e) {');
      lines.push('    e.preventDefault();');
      lines.push('    setLoading(true); setError("");');
      lines.push('    try {');
      lines.push('      const res = await __auth_fetch("/auth/signup", { method: "POST", body: JSON.stringify({ email: email(), password: password() }) });');
      lines.push('      const data = await res.json();');
      lines.push('      if (!res.ok) { setError(data.error || "Signup failed"); setLoading(false); return; }');
      lines.push('      if (data.user) { set$currentUser(data.user); set$isAuthenticated(true); }');
      lines.push('      if (props?.onSuccess) props.onSuccess(data);');
      lines.push('      if (props?.redirect) window.location.href = props.redirect;');
      lines.push('    } catch(err) { setError("Network error"); }');
      lines.push('    setLoading(false);');
      lines.push('  }');
      lines.push('  return () => {');
      lines.push('    const form = tova_el("form", { onsubmit: handleSubmit });');
      lines.push('    const emailInput = tova_el("input", { type: "email", placeholder: "Email", oninput: (e) => setEmail(e.target.value) });');
      lines.push('    const passInput = tova_el("input", { type: "password", placeholder: "Password", oninput: (e) => setPassword(e.target.value) });');
      lines.push('    const btn = tova_el("button", { type: "submit" }); btn.textContent = "Sign up";');
      lines.push('    form.append(emailInput, passInput, btn);');
      lines.push('    return form;');
      lines.push('  };');
      lines.push('}');
      lines.push('');

      // ForgotPasswordForm
      lines.push('function ForgotPasswordForm(props) {');
      lines.push('  const [email, setEmail] = createSignal("");');
      lines.push('  const [sent, setSent] = createSignal(false);');
      lines.push('  async function handleSubmit(e) {');
      lines.push('    e.preventDefault();');
      lines.push('    await __auth_fetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email() }) });');
      lines.push('    setSent(true);');
      lines.push('  }');
      lines.push('  return () => {');
      lines.push('    const form = tova_el("form", { onsubmit: handleSubmit });');
      lines.push('    const input = tova_el("input", { type: "email", placeholder: "Email", oninput: (e) => setEmail(e.target.value) });');
      lines.push('    const btn = tova_el("button", { type: "submit" }); btn.textContent = "Send Reset Link";');
      lines.push('    form.append(input, btn);');
      lines.push('    return form;');
      lines.push('  };');
      lines.push('}');
      lines.push('');

      // ResetPasswordForm
      lines.push('function ResetPasswordForm(props) {');
      lines.push('  const [password, setPassword] = createSignal("");');
      lines.push('  const [error, setError] = createSignal("");');
      lines.push('  async function handleSubmit(e) {');
      lines.push('    e.preventDefault();');
      lines.push('    const params = new URLSearchParams(window.location.search);');
      lines.push('    const res = await __auth_fetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: params.get("token"), password: password() }) });');
      lines.push('    if (!res.ok) { const d = await res.json(); setError(d.error || "Reset failed"); return; }');
      lines.push('    if (props?.redirect) window.location.href = props.redirect;');
      lines.push('  }');
      lines.push('  return () => {');
      lines.push('    const form = tova_el("form", { onsubmit: handleSubmit });');
      lines.push('    const input = tova_el("input", { type: "password", placeholder: "New Password", oninput: (e) => setPassword(e.target.value) });');
      lines.push('    const btn = tova_el("button", { type: "submit" }); btn.textContent = "Reset Password";');
      lines.push('    form.append(input, btn);');
      lines.push('    return form;');
      lines.push('  };');
      lines.push('}');
      lines.push('');
    }

    // AuthGuard component
    lines.push('function AuthGuard(props) {');
    lines.push('  return () => {');
    lines.push('    if ($authLoading()) return props?.loading || null;');
    lines.push('    if (!$isAuthenticated()) return props?.fallback || null;');
    lines.push('    if (props?.require) {');
    lines.push('      const user = $currentUser();');
    lines.push('      if (!user || user.role !== props.require) return props?.fallback || null;');
    lines.push('    }');
    lines.push('    return props?.children || null;');
    lines.push('  };');
    lines.push('}');
    lines.push('');

    // Route guards
    if (protectedRoutes.length > 0) {
      lines.push('const __auth_protected_routes = [');
      for (const route of protectedRoutes) {
        const pattern = route.pattern;
        const redirect = route.config.redirect;
        const redirectVal = redirect ? (redirect.type === 'StringLiteral' ? JSON.stringify(redirect.value) : (baseCodegen ? baseCodegen.genExpression(redirect) : '"/login"')) : '"/login"';
        const require_ = route.config.require;
        const requireVal = require_ ? (require_.type === 'Identifier' ? JSON.stringify(require_.name) : 'null') : 'null';
        lines.push(`  { pattern: ${JSON.stringify(pattern)}, redirect: ${redirectVal}, require: ${requireVal} },`);
      }
      lines.push('];');
      lines.push('');
      lines.push('function __auth_route_guard(pathname) {');
      lines.push('  for (const r of __auth_protected_routes) {');
      lines.push('    const regex = new RegExp("^" + r.pattern.replace(/\\*/g, ".*") + "$");');
      lines.push('    if (regex.test(pathname)) {');
      lines.push('      if (!$isAuthenticated()) return r.redirect;');
      lines.push('      if (r.require && $currentUser()?.role !== r.require) return r.redirect;');
      lines.push('    }');
      lines.push('  }');
      lines.push('  return null;');
      lines.push('}');
    }

    lines.push('');
    lines.push('// ─── End Auth Block (Browser) ───────────────────────────');
    lines.push('');

    return lines.join('\n');
  }

  // ─── Private Helpers ─────────────────────────────────────

  _resolveConfigValue(value, baseCodegen) {
    if (!value) return null;
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    // AST node — use baseCodegen to generate expression
    if (value.type && baseCodegen) return baseCodegen.genExpression(value);
    return null;
  }

  _genUserTable() {
    return [
      '// Auth tables (SQLite)',
      'const __auth_db = (typeof db !== "undefined" && db) || (() => {',
      '  const Database = require("bun:sqlite");',
      '  return new Database(":memory:");',
      '})();',
      '',
      '__auth_db.run(`CREATE TABLE IF NOT EXISTS __auth_users (',
      '  id TEXT PRIMARY KEY,',
      '  email TEXT UNIQUE NOT NULL,',
      '  password_hash TEXT,',
      '  email_confirmed INTEGER DEFAULT 0,',
      '  role TEXT DEFAULT \'user\',',
      '  provider TEXT,',
      '  provider_id TEXT,',
      '  locked_until INTEGER,',
      '  failed_attempts INTEGER DEFAULT 0,',
      '  created_at INTEGER NOT NULL,',
      '  updated_at INTEGER NOT NULL',
      ')`);',
      '',
      '__auth_db.run(`CREATE TABLE IF NOT EXISTS __auth_refresh_tokens (',
      '  id TEXT PRIMARY KEY,',
      '  user_id TEXT NOT NULL,',
      '  token_hash TEXT NOT NULL,',
      '  family TEXT NOT NULL,',
      '  expires_at INTEGER NOT NULL,',
      '  used INTEGER DEFAULT 0,',
      '  created_at INTEGER NOT NULL',
      ')`);',
      '',
      '__auth_db.run(`CREATE TABLE IF NOT EXISTS __auth_magic_tokens (',
      '  id TEXT PRIMARY KEY,',
      '  email TEXT NOT NULL,',
      '  token_hash TEXT NOT NULL,',
      '  expires_at INTEGER NOT NULL,',
      '  used INTEGER DEFAULT 0',
      ')`);',
      '',
      '__auth_db.run(`CREATE TABLE IF NOT EXISTS __auth_email_confirmations (',
      '  id TEXT PRIMARY KEY,',
      '  user_id TEXT NOT NULL,',
      '  token_hash TEXT NOT NULL,',
      '  expires_at INTEGER NOT NULL',
      ')`);',
      '',
      '__auth_db.run(`CREATE TABLE IF NOT EXISTS __auth_password_resets (',
      '  id TEXT PRIMARY KEY,',
      '  user_id TEXT NOT NULL,',
      '  token_hash TEXT NOT NULL,',
      '  expires_at INTEGER NOT NULL,',
      '  used INTEGER DEFAULT 0',
      ')`);',
    ];
  }

  _genCryptoHelpers() {
    return [
      '// JWT helpers',
      'function __auth_base64url(buf) { return Buffer.from(buf).toString("base64url"); }',
      'function __auth_sign_jwt(payload) {',
      '  const header = __auth_base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));',
      '  const now = Math.floor(Date.now() / 1000);',
      '  const body = __auth_base64url(JSON.stringify({ ...payload, iat: now, exp: now + __auth_token_expires }));',
      '  const sig = __auth_crypto.createHmac("sha256", __auth_secret).update(header + "." + body).digest("base64url");',
      '  return header + "." + body + "." + sig;',
      '}',
      '',
      'function __auth_verify_jwt(token) {',
      '  try {',
      '    const [header, body, sig] = token.split(".");',
      '    const expected = __auth_crypto.createHmac("sha256", __auth_secret).update(header + "." + body).digest("base64url");',
      '    const sigBuf = Buffer.from(sig, "base64url");',
      '    const expBuf = Buffer.from(expected, "base64url");',
      '    if (sigBuf.length !== expBuf.length || !__auth_crypto.timingSafeEqual(sigBuf, expBuf)) return null;',
      '    const payload = JSON.parse(Buffer.from(body, "base64url").toString());',
      '    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;',
      '    return payload;',
      '  } catch { return null; }',
      '}',
      '',
      '// Password helpers',
      'function __auth_hash_password(password) {',
      '  const salt = __auth_crypto.randomBytes(16).toString("hex");',
      '  const hash = __auth_crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");',
      '  return "pbkdf2:100000:" + salt + ":" + hash;',
      '}',
      '',
      'function __auth_verify_password(password, stored) {',
      '  const [, iterations, salt, hash] = stored.split(":");',
      '  const computed = __auth_crypto.pbkdf2Sync(password, salt, parseInt(iterations), 64, "sha512").toString("hex");',
      '  const a = Buffer.from(hash, "hex");',
      '  const b = Buffer.from(computed, "hex");',
      '  return a.length === b.length && __auth_crypto.timingSafeEqual(a, b);',
      '}',
      '',
      '// Token helpers',
      'function __auth_hash_token(token) {',
      '  return __auth_crypto.createHash("sha256").update(token).digest("hex");',
      '}',
    ];
  }

  _genRateLimiting() {
    return [
      '// Rate limiting (in-memory)',
      'const __auth_rate = new Map();',
      'function __auth_check_rate(ip, max = 5, windowSec = 900) {',
      '  const now = Date.now();',
      '  const entry = __auth_rate.get(ip);',
      '  if (!entry || entry.resetAt < now) {',
      '    __auth_rate.set(ip, { count: 1, resetAt: now + windowSec * 1000 });',
      '    return true;',
      '  }',
      '  entry.count++;',
      '  return entry.count <= max;',
      '}',
    ];
  }

  _genHookWiring(hooks, baseCodegen) {
    const lines = [];
    for (const event of ['signup', 'login', 'logout', 'oauth_link']) {
      if (hooks[event]) {
        const handlerCode = baseCodegen ? baseCodegen.genExpression(hooks[event]) : 'function(){}';
        lines.push(`const __auth_hook_${event} = ${handlerCode};`);
      } else {
        lines.push(`const __auth_hook_${event} = null;`);
      }
    }
    return lines;
  }

  _genAuthMiddleware(storageCookie) {
    const tokenExtract = storageCookie
      ? 'const token = (req.headers.get?.("authorization") || req.headers["authorization"] || "").replace("Bearer ", "") || __auth_get_cookie(req, "__tova_auth");'
      : 'const token = (req.headers.get?.("authorization") || req.headers["authorization"] || "").replace("Bearer ", "");';

    return [
      '// Auth middleware',
      'function __auth_get_cookie(req, name) {',
      '  const cookies = req.headers.get?.("cookie") || req.headers["cookie"] || "";',
      '  const match = cookies.match(new RegExp("(?:^|;)\\\\s*" + name + "=([^;]*)"));',
      '  return match ? decodeURIComponent(match[1]) : null;',
      '}',
      '',
      'function __auth_authenticate(req) {',
      `  ${tokenExtract}`,
      '  if (!token) return null;',
      '  return __auth_verify_jwt(token);',
      '}',
    ];
  }

  _genSignupEndpoint(emailProvider, baseCodegen) {
    const passwordMin = this._getProviderConfigNum(emailProvider, 'password_min', 8);
    const confirmEmail = this._getProviderConfigBool(emailProvider, 'confirm_email', false);

    const signupBody = confirmEmail ? [
      '  const confirmToken = __auth_crypto.randomBytes(32).toString("hex");',
      '  __auth_db.run("INSERT INTO __auth_email_confirmations (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)", [__auth_crypto.randomUUID(), id, __auth_hash_token(confirmToken), now + 86400]);',
      '  return new Response(JSON.stringify({ message: "Check your email to confirm", confirm_token: confirmToken }), { status: 201, headers: { "Content-Type": "application/json" } });',
    ].join('\n') : [
      '  const token = __auth_sign_jwt({ sub: id, email, role: "user" });',
      '  return new Response(JSON.stringify({ token, user }), { status: 201, headers: { "Content-Type": "application/json" } });',
    ].join('\n');

    return [
      '',
      '// POST /auth/signup',
      '__addRoute("POST", "/auth/signup", async (req) => {',
      '  const body = await req.json();',
      '  const { email, password } = body;',
      '  if (!email || !password) return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      `  if (password.length < ${passwordMin}) return new Response(JSON.stringify({ error: "Password must be at least ${passwordMin} characters" }), { status: 400, headers: { "Content-Type": "application/json" } });`,
      '  const existing = __auth_db.query("SELECT id FROM __auth_users WHERE email = ?").get(email);',
      '  if (existing) return new Response(JSON.stringify({ error: "Email already registered" }), { status: 409, headers: { "Content-Type": "application/json" } });',
      '  const id = __auth_crypto.randomUUID();',
      '  const now = Math.floor(Date.now() / 1000);',
      '  const passwordHash = __auth_hash_password(password);',
      `  __auth_db.run("INSERT INTO __auth_users (id, email, password_hash, email_confirmed, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, email, passwordHash, ${confirmEmail ? 0 : 1}, "email", now, now]);`,
      '  const user = { id, email, role: "user" };',
      '  if (__auth_hook_signup) await __auth_hook_signup(user);',
      signupBody,
      '});',
    ];
  }

  _genLoginEndpoint(emailProvider, baseCodegen) {
    const maxAttempts = this._getProviderConfigNum(emailProvider, 'max_attempts', 5);
    const lockoutDuration = this._getProviderConfigNum(emailProvider, 'lockout_duration', 900);

    return [
      '',
      '// POST /auth/login',
      '__addRoute("POST", "/auth/login", async (req) => {',
      '  const ip = req.headers.get?.("x-forwarded-for") || "unknown";',
      '  if (!__auth_check_rate(ip)) return new Response(JSON.stringify({ error: "Too many attempts" }), { status: 429, headers: { "Content-Type": "application/json" } });',
      '  const body = await req.json();',
      '  const { email, password } = body;',
      '  if (!email || !password) return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  const user = __auth_db.query("SELECT * FROM __auth_users WHERE email = ?").get(email);',
      '  if (!user || !user.password_hash) return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: { "Content-Type": "application/json" } });',
      '  if (user.locked_until && user.locked_until > Math.floor(Date.now() / 1000)) return new Response(JSON.stringify({ error: "Account locked" }), { status: 423, headers: { "Content-Type": "application/json" } });',
      '  if (!__auth_verify_password(password, user.password_hash)) {',
      '    const attempts = (user.failed_attempts || 0) + 1;',
      `    if (attempts >= ${maxAttempts}) {`,
      `      __auth_db.run("UPDATE __auth_users SET failed_attempts = ?, locked_until = ? WHERE id = ?", [attempts, Math.floor(Date.now() / 1000) + ${lockoutDuration}, user.id]);`,
      '    } else {',
      '      __auth_db.run("UPDATE __auth_users SET failed_attempts = ? WHERE id = ?", [attempts, user.id]);',
      '    }',
      '    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: { "Content-Type": "application/json" } });',
      '  }',
      '  __auth_db.run("UPDATE __auth_users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [user.id]);',
      '  const token = __auth_sign_jwt({ sub: user.id, email: user.email, role: user.role });',
      '  const family = __auth_crypto.randomUUID();',
      '  const refreshToken = __auth_crypto.randomBytes(32).toString("hex");',
      '  __auth_db.run("INSERT INTO __auth_refresh_tokens (id, user_id, token_hash, family, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", [__auth_crypto.randomUUID(), user.id, __auth_hash_token(refreshToken), family, Math.floor(Date.now() / 1000) + __auth_refresh_expires, Math.floor(Date.now() / 1000)]);',
      '  if (__auth_hook_login) await __auth_hook_login({ id: user.id, email: user.email, role: user.role });',
      '  return new Response(JSON.stringify({ token, refresh_token: refreshToken, user: { id: user.id, email: user.email, role: user.role } }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genLogoutEndpoint(storageCookie) {
    const cookieHeader = storageCookie
      ? ', "Set-Cookie": "__tova_auth=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/"'
      : '';
    return [
      '',
      '// POST /auth/logout',
      '__addRoute("POST", "/auth/logout", async (req) => {',
      '  const user = __auth_authenticate(req);',
      '  if (user && __auth_hook_logout) await __auth_hook_logout(user);',
      `  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json"${cookieHeader} } });`,
      '});',
    ];
  }

  _genRefreshEndpoint(storageCookie) {
    return [
      '',
      '// POST /auth/refresh',
      '__addRoute("POST", "/auth/refresh", async (req) => {',
      '  const body = await req.json();',
      '  const { refresh_token } = body;',
      '  if (!refresh_token) return new Response(JSON.stringify({ error: "Refresh token required" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  const tokenHash = __auth_hash_token(refresh_token);',
      '  const stored = __auth_db.query("SELECT * FROM __auth_refresh_tokens WHERE token_hash = ?").get(tokenHash);',
      '  if (!stored || stored.expires_at < Math.floor(Date.now() / 1000)) return new Response(JSON.stringify({ error: "Invalid refresh token" }), { status: 401, headers: { "Content-Type": "application/json" } });',
      '  if (stored.used) {',
      '    __auth_db.run("DELETE FROM __auth_refresh_tokens WHERE family = ?", [stored.family]);',
      '    return new Response(JSON.stringify({ error: "Token reuse detected" }), { status: 401, headers: { "Content-Type": "application/json" } });',
      '  }',
      '  __auth_db.run("UPDATE __auth_refresh_tokens SET used = 1 WHERE id = ?", [stored.id]);',
      '  const user = __auth_db.query("SELECT * FROM __auth_users WHERE id = ?").get(stored.user_id);',
      '  if (!user) return new Response(JSON.stringify({ error: "User not found" }), { status: 401, headers: { "Content-Type": "application/json" } });',
      '  const token = __auth_sign_jwt({ sub: user.id, email: user.email, role: user.role });',
      '  const newRefresh = __auth_crypto.randomBytes(32).toString("hex");',
      '  __auth_db.run("INSERT INTO __auth_refresh_tokens (id, user_id, token_hash, family, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", [__auth_crypto.randomUUID(), user.id, __auth_hash_token(newRefresh), stored.family, Math.floor(Date.now() / 1000) + __auth_refresh_expires, Math.floor(Date.now() / 1000)]);',
      '  return new Response(JSON.stringify({ token, refresh_token: newRefresh }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genMeEndpoint(storageCookie) {
    return [
      '',
      '// GET /auth/me',
      '__addRoute("GET", "/auth/me", async (req) => {',
      '  const payload = __auth_authenticate(req);',
      '  if (!payload) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });',
      '  const user = __auth_db.query("SELECT id, email, role, created_at FROM __auth_users WHERE id = ?").get(payload.sub);',
      '  if (!user) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { "Content-Type": "application/json" } });',
      '  return new Response(JSON.stringify({ user }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genConfirmEndpoint() {
    return [
      '',
      '// POST /auth/confirm',
      '__addRoute("POST", "/auth/confirm", async (req) => {',
      '  const body = await req.json();',
      '  const confirmToken = body.token;',
      '  if (!confirmToken) return new Response(JSON.stringify({ error: "Token required" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  const tokenHash = __auth_hash_token(confirmToken);',
      '  const stored = __auth_db.query("SELECT * FROM __auth_email_confirmations WHERE token_hash = ? AND expires_at > ?").get(tokenHash, Math.floor(Date.now() / 1000));',
      '  if (!stored) return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  __auth_db.run("UPDATE __auth_users SET email_confirmed = 1 WHERE id = ?", [stored.user_id]);',
      '  __auth_db.run("DELETE FROM __auth_email_confirmations WHERE id = ?", [stored.id]);',
      '  return new Response(JSON.stringify({ ok: true, message: "Email confirmed" }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genForgotPasswordEndpoint(baseCodegen) {
    return [
      '',
      '// POST /auth/forgot-password',
      '__addRoute("POST", "/auth/forgot-password", async (req) => {',
      '  const body = await req.json();',
      '  const { email } = body;',
      '  const user = __auth_db.query("SELECT id FROM __auth_users WHERE email = ?").get(email);',
      '  if (!user) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '  const resetToken = __auth_crypto.randomBytes(32).toString("hex");',
      '  __auth_db.run("INSERT INTO __auth_password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)", [__auth_crypto.randomUUID(), user.id, __auth_hash_token(resetToken), Math.floor(Date.now() / 1000) + 3600]);',
      '  return new Response(JSON.stringify({ ok: true, reset_token: resetToken }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genResetPasswordEndpoint(baseCodegen) {
    return [
      '',
      '// POST /auth/reset-password',
      '__addRoute("POST", "/auth/reset-password", async (req) => {',
      '  const body = await req.json();',
      '  const { token, password } = body;',
      '  if (!token || !password) return new Response(JSON.stringify({ error: "Token and password required" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  const tokenHash = __auth_hash_token(token);',
      '  const stored = __auth_db.query("SELECT * FROM __auth_password_resets WHERE token_hash = ? AND expires_at > ? AND used = 0").get(tokenHash, Math.floor(Date.now() / 1000));',
      '  if (!stored) return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  __auth_db.run("UPDATE __auth_password_resets SET used = 1 WHERE id = ?", [stored.id]);',
      '  __auth_db.run("UPDATE __auth_users SET password_hash = ?, updated_at = ? WHERE id = ?", [__auth_hash_password(password), Math.floor(Date.now() / 1000), stored.user_id]);',
      '  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genOAuthRedirect(provider, baseCodegen) {
    const name = provider.providerType === 'custom' ? provider.name : provider.providerType;
    const clientId = this._resolveProviderConfig(provider, 'client_id', baseCodegen);
    const authUrl = this._getOAuthAuthUrl(provider, baseCodegen);
    const scopes = this._resolveProviderConfig(provider, 'scopes', baseCodegen) || '["email"]';

    return [
      '',
      `// GET /auth/oauth/${name}`,
      `__addRoute("GET", "/auth/oauth/${name}", async (req) => {`,
      '  const code_verifier = __auth_crypto.randomBytes(32).toString("hex");',
      '  const code_challenge = __auth_crypto.createHash("sha256").update(code_verifier).digest("base64url");',
      '  const state = __auth_crypto.randomBytes(16).toString("hex");',
      `  const authUrl = ${authUrl}`,
      `    + "?client_id=" + encodeURIComponent(${clientId})`,
      `    + "&redirect_uri=" + encodeURIComponent(new URL("/auth/oauth/${name}/callback", req.url).href)`,
      '    + "&response_type=code"',
      `    + "&scope=" + encodeURIComponent((${scopes}).join(" "))`,
      '    + "&state=" + state',
      '    + "&code_challenge=" + code_challenge',
      '    + "&code_challenge_method=S256";',
      '  return new Response(null, {',
      '    status: 302,',
      '    headers: {',
      '      "Location": authUrl,',
      `      "Set-Cookie": "__tova_oauth_state=" + state + ":" + code_verifier + "; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/auth/oauth/${name}/callback"`,
      '    }',
      '  });',
      '});',
    ];
  }

  _genOAuthCallback(provider, storageCookie, baseCodegen) {
    const name = provider.providerType === 'custom' ? provider.name : provider.providerType;
    const clientId = this._resolveProviderConfig(provider, 'client_id', baseCodegen);
    const clientSecret = this._resolveProviderConfig(provider, 'client_secret', baseCodegen);
    const tokenUrl = this._getOAuthTokenUrl(provider, baseCodegen);
    const profileUrl = this._getOAuthProfileUrl(provider, baseCodegen);

    const cookieLine = storageCookie
      ? `  headers["Set-Cookie"] = "__tova_auth=" + jwt + "; HttpOnly; Secure; SameSite=Lax; Max-Age=" + __auth_token_expires + "; Path=/";`
      : '';

    const callbackLines = [
      '',
      `// GET /auth/oauth/${name}/callback`,
      `__addRoute("GET", "/auth/oauth/${name}/callback", async (req) => {`,
      '  const url = new URL(req.url);',
      '  const code = url.searchParams.get("code");',
      '  const state = url.searchParams.get("state");',
      '  const stored = __auth_get_cookie(req, "__tova_oauth_state");',
      '  if (!stored || !stored.startsWith(state + ":")) return new Response("Invalid state", { status: 400 });',
      '  const code_verifier = stored.split(":").slice(1).join(":");',
      `  const tokenRes = await fetch(${tokenUrl}, {`,
      '    method: "POST",',
      '    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },',
      `    body: "grant_type=authorization_code&code=" + code + "&client_id=" + encodeURIComponent(${clientId}) + "&client_secret=" + encodeURIComponent(${clientSecret}) + "&code_verifier=" + code_verifier + "&redirect_uri=" + encodeURIComponent(new URL("/auth/oauth/${name}/callback", req.url).href)`,
      '  });',
      '  const tokenData = await tokenRes.json();',
      '  if (!tokenData.access_token) return new Response("OAuth failed", { status: 400 });',
    ];

    // Apple: profile data is in the id_token JWT (no profile URL)
    // Other providers: fetch the profile URL
    if (profileUrl === 'null') {
      callbackLines.push(
        '  let profile;',
        '  const idToken = tokenData.id_token;',
        '  if (idToken) {',
        '    try { profile = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()); }',
        '    catch { profile = {}; }',
        '  } else { profile = {}; }',
      );
    } else {
      callbackLines.push(
        `  const profileRes = await fetch(${profileUrl}, { headers: { "Authorization": "Bearer " + tokenData.access_token, "Accept": "application/json" } });`,
        '  const profile = await profileRes.json();',
      );
    }

    callbackLines.push(
      '  const profileEmail = profile.email;',
      '  const profileId = String(profile.id || profile.sub || "");',
      '  if (!profileEmail) return new Response("No email from provider", { status: 400 });',
      '  let user = __auth_db.query("SELECT * FROM __auth_users WHERE email = ?").get(profileEmail);',
      '  const now = Math.floor(Date.now() / 1000);',
      '  if (!user) {',
      '    const id = __auth_crypto.randomUUID();',
      `    __auth_db.run("INSERT INTO __auth_users (id, email, email_confirmed, provider, provider_id, role, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)", [id, profileEmail, "${name}", profileId, "user", now, now]);`,
      '    user = { id, email: profileEmail, role: "user" };',
      '    if (__auth_hook_signup) await __auth_hook_signup(user);',
      '  } else {',
      `    __auth_db.run("UPDATE __auth_users SET provider = ?, provider_id = ?, updated_at = ? WHERE id = ?", ["${name}", profileId, now, user.id]);`,
      `    if (__auth_hook_oauth_link) await __auth_hook_oauth_link(user, "${name}", profile);`,
      '  }',
      '  const jwt = __auth_sign_jwt({ sub: user.id, email: user.email || profileEmail, role: user.role || "user" });',
      '  if (__auth_hook_login) await __auth_hook_login({ id: user.id, email: user.email || profileEmail, role: user.role || "user" });',
      `  const headers = { "Location": ${storageCookie ? '"/"' : '"/?token=" + jwt'} };`,
    );

    if (cookieLine) callbackLines.push(cookieLine);

    callbackLines.push(
      '  return new Response(null, { status: 302, headers });',
      '});',
    );

    return callbackLines;
  }

  _genMagicLinkEndpoint(provider, baseCodegen) {
    const expires = this._getProviderConfigNum(provider, 'expires', 600);
    const sendFn = provider.config.send ? (baseCodegen ? baseCodegen.genExpression(provider.config.send) : 'null') : 'null';

    return [
      '',
      '// POST /auth/magic-link',
      `const __auth_magic_send = ${sendFn};`,
      '__addRoute("POST", "/auth/magic-link", async (req) => {',
      '  const body = await req.json();',
      '  const { email } = body;',
      '  if (!email) return new Response(JSON.stringify({ error: "Email required" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  const token = __auth_crypto.randomBytes(32).toString("hex");',
      `  __auth_db.run("INSERT INTO __auth_magic_tokens (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)", [__auth_crypto.randomUUID(), email, __auth_hash_token(token), Math.floor(Date.now() / 1000) + ${expires}]);`,
      '  const link = new URL("/auth/magic-link/verify/" + token, req.url).href;',
      '  if (__auth_magic_send) await __auth_magic_send(email, link);',
      '  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });',
      '});',
    ];
  }

  _genMagicLinkVerify(provider, storageCookie) {
    const cookieLine = storageCookie
      ? '  headers["Set-Cookie"] = "__tova_auth=" + jwt + "; HttpOnly; Secure; SameSite=Lax; Max-Age=" + __auth_token_expires + "; Path=/";'
      : '';

    const verifyLines = [
      '',
      '// GET /auth/magic-link/verify/:token',
      '__addRoute("GET", "/auth/magic-link/verify/:token", async (req, params) => {',
      '  const verifyToken = params.token;',
      '  const tokenHash = __auth_hash_token(verifyToken);',
      '  const stored = __auth_db.query("SELECT * FROM __auth_magic_tokens WHERE token_hash = ? AND expires_at > ? AND used = 0").get(tokenHash, Math.floor(Date.now() / 1000));',
      '  if (!stored) return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400, headers: { "Content-Type": "application/json" } });',
      '  __auth_db.run("UPDATE __auth_magic_tokens SET used = 1 WHERE id = ?", [stored.id]);',
      '  let user = __auth_db.query("SELECT * FROM __auth_users WHERE email = ?").get(stored.email);',
      '  const now = Math.floor(Date.now() / 1000);',
      '  if (!user) {',
      '    const id = __auth_crypto.randomUUID();',
      '    __auth_db.run("INSERT INTO __auth_users (id, email, email_confirmed, provider, role, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?)", [id, stored.email, "magic_link", "user", now, now]);',
      '    user = { id, email: stored.email, role: "user" };',
      '    if (__auth_hook_signup) await __auth_hook_signup(user);',
      '  }',
      '  const jwt = __auth_sign_jwt({ sub: user.id, email: user.email, role: user.role });',
      '  if (__auth_hook_login) await __auth_hook_login({ id: user.id, email: user.email, role: user.role });',
      '  const headers = { "Location": "/?token=" + jwt, "Content-Type": "application/json" };',
    ];

    if (cookieLine) verifyLines.push(cookieLine);

    verifyLines.push(
      '  return new Response(null, { status: 302, headers });',
      '});',
    );

    return verifyLines;
  }

  // ─── OAuth URL Helpers ─────────────────────────────────────

  _getOAuthAuthUrl(provider, baseCodegen) {
    const urls = {
      google: '"https://accounts.google.com/o/oauth2/v2/auth"',
      github: '"https://github.com/login/oauth/authorize"',
      apple: '"https://appleid.apple.com/auth/authorize"',
      discord: '"https://discord.com/oauth2/authorize"',
    };
    if (provider.providerType === 'custom') {
      return this._resolveProviderConfig(provider, 'auth_url', baseCodegen) || '""';
    }
    return urls[provider.providerType] || '""';
  }

  _getOAuthTokenUrl(provider, baseCodegen) {
    const urls = {
      google: '"https://oauth2.googleapis.com/token"',
      github: '"https://github.com/login/oauth/access_token"',
      apple: '"https://appleid.apple.com/auth/token"',
      discord: '"https://discord.com/api/oauth2/token"',
    };
    if (provider.providerType === 'custom') {
      return this._resolveProviderConfig(provider, 'token_url', baseCodegen) || '""';
    }
    return urls[provider.providerType] || '""';
  }

  _getOAuthProfileUrl(provider, baseCodegen) {
    const urls = {
      google: '"https://www.googleapis.com/oauth2/v2/userinfo"',
      github: '"https://api.github.com/user"',
      apple: 'null',
      discord: '"https://discord.com/api/users/@me"',
    };
    if (provider.providerType === 'custom') {
      return this._resolveProviderConfig(provider, 'profile_url', baseCodegen) || '""';
    }
    return urls[provider.providerType] || '""';
  }

  // ─── Config Helpers ─────────────────────────────────────

  _resolveProviderConfig(provider, key, baseCodegen) {
    const val = provider.config[key];
    if (!val) return null;
    return this._resolveConfigValue(val, baseCodegen);
  }

  _getProviderConfigNum(provider, key, defaultVal) {
    const val = provider.config[key];
    if (!val) return defaultVal;
    if (val.type === 'NumberLiteral') return val.value;
    return defaultVal;
  }

  _getProviderConfigBool(provider, key, defaultVal) {
    const val = provider.config[key];
    if (!val) return defaultVal;
    if (val.type === 'BooleanLiteral') return val.value;
    if (val.value === true || val.value === 'true') return true;
    return defaultVal;
  }
}
