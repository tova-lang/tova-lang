// ── Shared ──
// Lux string methods
(function() {
  const m = {
    upper() { return this.toUpperCase(); },
    lower() { return this.toLowerCase(); },
    contains(s) { return this.includes(s); },
    starts_with(s) { return this.startsWith(s); },
    ends_with(s) { return this.endsWith(s); },
    chars() { return [...this]; },
    words() { return this.split(/\s+/).filter(Boolean); },
    lines() { return this.split('\n'); },
    capitalize() { return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this; },
    title_case() { return this.replace(/\b\w/g, c => c.toUpperCase()); },
    snake_case() { return this.replace(/[-\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },
    camel_case() { return this.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },
  };
  for (const [n, fn] of Object.entries(m)) {
    if (!String.prototype[n]) Object.defineProperty(String.prototype, n, { value: fn, writable: true, configurable: true });
  }
})();
const Low = Object.freeze({ __tag: "Low" });
const Medium = Object.freeze({ __tag: "Medium" });
const High = Object.freeze({ __tag: "High" });

// ── Distributed Tracing ──
import { AsyncLocalStorage } from "node:async_hooks";
const __requestContext = new AsyncLocalStorage();
function __getRequestId() {
  const store = __requestContext.getStore();
  return store ? store.rid : null;
}
function __getLocals() {
  const store = __requestContext.getStore();
  return store ? store.locals : {};
}

// ── Runtime Helpers ──
function respond(status, body, headers = {}) {
  const __hasContentType = Object.keys(headers).some(k => k.toLowerCase() === "content-type");
  if (__hasContentType) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(data, { status, headers });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function __parseQuery(searchParams) {
  const q = {};
  for (const [k, v] of searchParams) {
    if (q[k] !== undefined) {
      if (!Array.isArray(q[k])) q[k] = [q[k]];
      q[k].push(v);
    } else { q[k] = v; }
  }
  return q;
}
function __parseCookies(str) {
  const c = {};
  if (!str) return c;
  for (const pair of str.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) c[k.trim()] = v.join("=").trim();
  }
  return c;
}

async function __readBodyBytes(req) {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > __maxBodySize) throw new Error("__BODY_TOO_LARGE__");
    chunks.push(value);
  }
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function __parseBody(req) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const obj = {};
      for (const [k, v] of fd) {
        if (obj[k] !== undefined) {
          if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
          obj[k].push(v);
        } else { obj[k] = v; }
      }
      return obj;
    } catch { return null; }
  }
  const raw = await __readBodyBytes(req);
  const text = new TextDecoder().decode(raw);
  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const sp = new URLSearchParams(text);
      const obj = {};
      for (const [k, v] of sp) {
        if (obj[k] !== undefined) {
          if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
          obj[k].push(v);
        } else { obj[k] = v; }
      }
      return obj;
    } catch { return null; }
  }
  try { return JSON.parse(text); } catch { return null; }
}
// ── Response Helpers ──
function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}
function set_cookie(name, value, options = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
  if (options.path) cookie += `; Path=${options.path}`;
  if (options.domain) cookie += `; Domain=${options.domain}`;
  if (options.httpOnly) cookie += "; HttpOnly";
  if (options.secure) cookie += "; Secure";
  if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
  return cookie;
}
function stream(fn) {
  const readable = new ReadableStream({
    start(controller) {
      const send = (data) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      const close = () => controller.close();
      fn(send, close);
    }
  });
  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
function sse(fn) {
  let cancelled = false;
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data, event) => {
        if (cancelled) return;
        let msg = "";
        if (event) msg += `event: ${event}\n`;
        msg += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(msg));
      };
      const close = () => { cancelled = true; controller.close(); };
      await fn(send, close);
    },
    cancel() { cancelled = true; }
  });
  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/html", ...headers } });
}
function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain", ...headers } });
}
function with_headers(response, headers) {
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Response(response.body, { status: response.status, headers: h });
}

// ── Auth Builtins ──
let __jwtSignKey = null;
async function sign_jwt(payload, secret, options = {}) {
  const __secret = secret || (typeof __authSecret !== "undefined" ? __authSecret : "secret");
  if (!__jwtSignKey || __secret !== (typeof __authSecret !== "undefined" ? __authSecret : "")) {
    __jwtSignKey = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(__secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
  }
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now };
  if (options.expires_in) claims.exp = now + options.expires_in;
  if (options.exp) claims.exp = options.exp;
  const __b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const __headerB64 = __b64url(header);
  const __payloadB64 = __b64url(claims);
  const __sigData = __headerB64 + "." + __payloadB64;
  const __sig = await crypto.subtle.sign("HMAC", __jwtSignKey, new TextEncoder().encode(__sigData));
  const __sigB64 = btoa(String.fromCharCode(...new Uint8Array(__sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return __sigData + "." + __sigB64;
}

async function hash_password(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

async function verify_password(password, stored) {
  const parts = stored.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = new Uint8Array(parts[2].match(/.{2}/g).map(b => parseInt(b, 16)));
  const expectedHash = parts[3];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex === expectedHash;
}

// ── Router ──
const __routes = [];
function __addRoute(method, path, handler) {
  let pattern = path
    .replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)/g, "(?<$1>.+)")
    .replace(/\*$/g, "(.*)")
    .replace(/:([^/]+)/g, "(?<$1>[^/]+)");
  __routes.push({ method, regex: new RegExp(`^${pattern}$`), handler, _path: path });
}

// ── CORS ──
function __getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ── Max Body Size ──
const __maxBodySize = 1048576;

function cache_control(res, maxAge, options = {}) {
  const h = new Headers(res.headers);
  let directive = options.private ? "private" : "public";
  directive += `, max-age=${maxAge}`;
  if (options.stale_while_revalidate) directive += `, stale-while-revalidate=${options.stale_while_revalidate}`;
  if (options.no_cache) directive = "no-cache";
  if (options.no_store) directive = "no-store";
  h.set("Cache-Control", directive);
  return new Response(res.body, { status: res.status, headers: h });
}
function etag(res, tag) {
  const h = new Headers(res.headers);
  h.set("ETag", `"${tag}"`);
  return new Response(res.body, { status: res.status, headers: h });
}

// ── Content Negotiation ──
function negotiate(req, data, options = {}) {
  const accept = (req.headers.get("Accept") || "application/json").toLowerCase();
  if (accept.includes("text/html") && options.html) {
    const body = typeof options.html === "function" ? options.html(data) : options.html;
    return new Response(body, { status: options.status || 200, headers: { "Content-Type": "text/html" } });
  }
  if (accept.includes("text/xml") || accept.includes("application/xml")) {
    if (options.xml) {
      const body = typeof options.xml === "function" ? options.xml(data) : options.xml;
      return new Response(body, { status: options.status || 200, headers: { "Content-Type": "application/xml" } });
    }
  }
  if (accept.includes("text/plain")) {
    const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new Response(body, { status: options.status || 200, headers: { "Content-Type": "text/plain" } });
  }
  return Response.json(data, { status: options.status || 200 });
}

// ── Async Mutex ──
class __Mutex {
  constructor() { this._queue = []; this._locked = false; }
  async acquire() {
    if (!this._locked) { this._locked = true; return; }
    return new Promise(resolve => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length > 0) { this._queue.shift()(); }
    else { this._locked = false; }
  }
}
const __mutex = new __Mutex();
async function withLock(fn) {
  await __mutex.acquire();
  try { return await fn(); } finally { __mutex.release(); }
}

// ── Routes ──
__addRoute("GET", "/", async (req, params) => {
  const __result = await ((req) => {
  return new Response(__clientHTML, { headers: { "Content-Type": "text/html" } });
})(req, params);
  if (__result instanceof Response) return __result;
  return Response.json(__result);
});

// ── OpenAPI Spec ──
const __openApiSpec = {
  openapi: "3.0.3",
  info: { title: "Lux API", version: "1.0.0" },
  paths: {},
  components: { schemas: {} },
};
if (!__openApiSpec.paths["/"]) __openApiSpec.paths["/"] = {};
__openApiSpec.paths["/"]["get"] = {
  responses: { "200": { description: "Success" } },
};
__addRoute("GET", "/openapi.json", async () => {
  return Response.json(__openApiSpec);
});
__addRoute("GET", "/docs", async () => {
  const html = `<!DOCTYPE html><html><head><title>API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
    <body><div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });</script>
    </body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
});

// ── Structured Logging ──
let __reqCounter = 0;
function __genRequestId() {
  return `${Date.now().toString(36)}-${(++__reqCounter).toString(36)}`;
}
const __logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
const __logMinLevel = __logLevels[process.env.LOG_LEVEL || "info"] || 1;
let __logFile = null;
if (process.env.LOG_FILE) {
  const __fs = await import("node:fs");
  __logFile = __fs.createWriteStream(process.env.LOG_FILE, { flags: "a" });
}
function __log(level, msg, meta = {}) {
  if ((__logLevels[level] || 0) < __logMinLevel) return;
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, msg, ...meta });
  console.log(entry);
  if (__logFile) __logFile.write(entry + "\n");
}

// ── Graceful Drain ──
let __activeRequests = 0;
let __shuttingDown = false;

// ── Request Handler ──
async function __handleRequest(req) {
  if (__shuttingDown) {
    return new Response("Service Unavailable", { status: 503 });
  }
  __activeRequests++;
  const url = new URL(req.url);
  const __rid = req.headers.get("X-Request-Id") || __genRequestId();
  const __startTime = Date.now();
  const __cors = __getCorsHeaders(req);
  return __requestContext.run({ rid: __rid, locals: {} }, async () => {
  try {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: __cors });
  }
  const __contentLength = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (__contentLength > __maxBodySize) {
    return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });
  }
  for (const route of __routes) {
    if (req.method === route.method || (route.method === "GET" && req.method === "HEAD" && !__routes.some(r => r.method === "HEAD" && r.regex.source === route.regex.source))) {
      const match = url.pathname.match(route.regex);
      if (match) {
        try {
          const res = await route.handler(req, match.groups || {});
          __log("info", `${req.method} ${url.pathname}`, { rid: __rid, status: res.status, ms: Date.now() - __startTime });
          const headers = new Headers(res.headers);
          for (const [k, v] of Object.entries(__cors)) headers.set(k, v);
          return new Response(res.body, { status: res.status, headers });
        } catch (err) {
          if (err.message === "__BODY_TOO_LARGE__") return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });
          return Response.json({ error: err.message }, { status: 500, headers: __cors });
        }
      }
    }
  }
  if (url.pathname === "/" && typeof __clientHTML !== "undefined") {
    return new Response(__clientHTML, { status: 200, headers: { "Content-Type": "text/html", ...(__cors) } });
  }
  const __notFound = Response.json({ error: "Not Found" }, { status: 404, headers: __cors });
  __log("warn", "Not Found", { rid: __rid, method: req.method, path: url.pathname, status: 404, ms: Date.now() - __startTime });
  return __notFound;
  } finally {
    __activeRequests--;
  }
  });
}

// ── Start Server ──
const __port = process.env.PORT || process.env.PORT || 3000;
const __server = Bun.serve({
  port: __port,
  maxRequestBodySize: __maxBodySize,
  fetch: __handleRequest,
});
console.log(`Lux server running on ${__server.url}`);

// ── Graceful Shutdown ──
async function __shutdown() {
  console.log(`Lux server shutting down...`);
  __shuttingDown = true;
  __server.stop();
  const __drainStart = Date.now();
  while (__activeRequests > 0 && Date.now() - __drainStart < 10000) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (__logFile) __logFile.end();
  process.exit(0);
}
process.on("SIGINT", __shutdown);
process.on("SIGTERM", __shutdown);