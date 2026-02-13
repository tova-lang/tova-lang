// ── Shared ──
function Todo(id, title, completed) { return { id, title, completed }; }

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

let todos = [];
let next_id = 1;
// ── Server Functions ──
function get_todos() {
  return todos;
}

function add_todo(title) {
  const todo = Todo(next_id, title, false);
  next_id += 1;
  const todos = [...todos, todo];
  return todo;
}

function toggle_todo(id) {
  for (const t of todos) {
    if ((t.id == id)) {
      return Todo(t.id, t.title, (!t.completed));
    }
  }
  return null;
}

function delete_todo(id) {
  const todos = todos.filter((t) => (t.id != id)).map((t) => t);
}

// ── RPC Endpoints ──
__addRoute("POST", "/rpc/get_todos", async (req) => {
  const body = await req.json();
  const result = await get_todos();
  return Response.json({ result });
});

__addRoute("POST", "/rpc/add_todo", async (req) => {
  const body = await req.json();
  const { title } = body;
  const result = await add_todo(title);
  return Response.json({ result });
});

__addRoute("POST", "/rpc/toggle_todo", async (req) => {
  const body = await req.json();
  const { id } = body;
  const result = await toggle_todo(id);
  return Response.json({ result });
});

__addRoute("POST", "/rpc/delete_todo", async (req) => {
  const body = await req.json();
  const { id } = body;
  const result = await delete_todo(id);
  return Response.json({ result });
});

// ── Routes ──
__addRoute("GET", "/api/todos", async (req, params) => {
  const result = await get_todos(req, params);
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
const __port = process.env.PORT || process.env.PORT || 3000;
const __server = Bun.serve({
  port: __port,
  fetch: __handleRequest,
});
console.log(`Lux server running on ${__server.url}`);