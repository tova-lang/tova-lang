import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-adapter';

// ── Shared ──
function Todo(id, title, completed) { return { id, title, completed }; }

const app = new Hono();
app.use("/*", cors());

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
app.post("/rpc/get_todos", async (c) => {
  const body = await c.req.json();
  const result = await get_todos();
  return c.json({ result });
});

app.post("/rpc/add_todo", async (c) => {
  const body = await c.req.json();
  const { title } = body;
  const result = await add_todo(title);
  return c.json({ result });
});

app.post("/rpc/toggle_todo", async (c) => {
  const body = await c.req.json();
  const { id } = body;
  const result = await toggle_todo(id);
  return c.json({ result });
});

app.post("/rpc/delete_todo", async (c) => {
  const body = await c.req.json();
  const { id } = body;
  const result = await delete_todo(id);
  return c.json({ result });
});

// ── Routes ──
app.get("/api/todos", async (c) => {
  const result = await get_todos(c);
  return c.json(result);
});

// ── Start Server ──
const port = process.env.PORT || 3000;
console.log(`Lux server running on http://localhost:${port}`);
export default { port, fetch: app.fetch };