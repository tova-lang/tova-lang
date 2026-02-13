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

let connections = [];
let event_log = [];
// ── Server Functions ──
function get_events() {
  return event_log;
}

function push_event(kind, data) {
  const event = Event(kind, data, 0);
  const event_log = [...event_log, event];
  return event;
}

// ── RPC Endpoints ──
__addRoute("POST", "/rpc/get_events", async (req) => {
  const body = await req.json();
  const result = await get_events();
  return Response.json({ result });
});

__addRoute("POST", "/rpc/push_event", async (req) => {
  const body = await req.json();
  const { kind, data } = body;
  const result = await push_event(kind, data);
  return Response.json({ result });
});

// ── Routes ──
__addRoute("GET", "/events", async (req, params) => {
  const result = await get_events(req, params);
  return Response.json(result);
});

__addRoute("POST", "/events", async (req, params) => {
  const result = await push_event(req, params);
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
const __port = process.env.PORT_EVENTS || process.env.PORT || 3000;
const __server = Bun.serve({
  port: __port,
  fetch: __handleRequest,
});
console.log(`Lux server [events] running on ${__server.url}`);