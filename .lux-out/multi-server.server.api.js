// ── Shared ──
function User(id, name, email) { return { id, name, email }; }
function Event(kind, data, timestamp) { return { kind, data, timestamp }; }

// ── Router ──
const __routes = [];
function __addRoute(method, path, handler) {
  const pattern = path.replace(/:([^/]+)/g, "(?<$1>[^/]+)");
  __routes.push({ method, regex: new RegExp(`^${pattern}$`), handler });
}

const __corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

let users = [];
// ── Server Functions ──
function get_users() {
  return users;
}

function create_user(name, email) {
  const user = User((len(users) + 1), name, email);
  const users = [...users, user];
  return user;
}

// ── RPC Endpoints ──
__addRoute("POST", "/rpc/get_users", async (req) => {
  const body = await req.json();
  const result = await get_users();
  return Response.json({ result });
});

__addRoute("POST", "/rpc/create_user", async (req) => {
  const body = await req.json();
  const { name, email } = body;
  const result = await create_user(name, email);
  return Response.json({ result });
});

// ── Routes ──
__addRoute("GET", "/api/users", async (req, params) => {
  const result = await get_users(req, params);
  return Response.json(result);
});

__addRoute("POST", "/api/users", async (req, params) => {
  const result = await create_user(req, params);
  return Response.json(result);
});

// ── Request Handler ──
async function __handleRequest(req) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: __corsHeaders });
  }
  for (const route of __routes) {
    if (req.method === route.method) {
      const match = url.pathname.match(route.regex);
      if (match) {
        try {
          const res = await route.handler(req, match.groups || {});
          // Attach CORS headers to response
          const headers = new Headers(res.headers);
          for (const [k, v] of Object.entries(__corsHeaders)) headers.set(k, v);
          return new Response(res.body, { status: res.status, headers });
        } catch (err) {
          return Response.json({ error: err.message }, { status: 500, headers: __corsHeaders });
        }
      }
    }
  }
  return Response.json({ error: "Not Found" }, { status: 404, headers: __corsHeaders });
}

// ── Start Server ──
const __port = process.env.PORT_API || process.env.PORT || 3000;
const __server = Bun.serve({
  port: __port,
  fetch: __handleRequest,
});
console.log(`Lux server [api] running on ${__server.url}`);