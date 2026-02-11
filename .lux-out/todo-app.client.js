import { createSignal, createEffect, createComputed, mount, lux_el, lux_fragment } from './runtime/reactivity.js';
import { rpc } from './runtime/rpc.js';

// ── Shared ──
function Todo(id, title, completed) { return { id, title, completed }; }

// ── Server RPC Proxy ──
const server = new Proxy({}, {
  get(_, name) {
    return (...args) => rpc(name, args);
  }
});

// ── Reactive State ──
const [todos, setTodos] = createSignal([]);
const [new_title, setNew_title] = createSignal("");

// ── Computed Values ──
const remaining = createComputed(() => len(todos.filter((t) => (!t.completed)).map((t) => t)));
const total = createComputed(() => len(todos));

function handle_add() {
  if ((new_title != "")) {
    server.add_todo(new_title);
    setNew_title("");
    setTodos(server.get_todos());
  }
}
function handle_toggle(id) {
  server.toggle_todo(id);
  setTodos(server.get_todos());
}
function handle_delete(id) {
  server.delete_todo(id);
  setTodos(server.get_todos());
}
// ── Components ──
function TodoItem({ todo }) {
  return lux_el("li", {className: "todo-item"}, [lux_el("input", {type: "checkbox", checked: todo.completed, onChange: () => handle_toggle(todo.id)}), lux_el("span", {className: "todo-text"}, [`${todo.title}`]), lux_el("button", {onClick: () => handle_delete(todo.id)}, ["×"])]);
}

function App() {
  return lux_el("div", {className: "todo-app"}, [lux_el("h1", {}, ["Lux Todo"]), lux_el("div", {className: "input-row"}, [lux_el("input", {type: "text", placeholder: "What needs to be done?", value: new_title, onInput: (e) => { setNew_title(e.target.value); }}), lux_el("button", {onClick: handle_add}, ["Add"])]), lux_el("ul", {className: "todo-list"}, [...todos.map((todo) => lux_el("TodoItem", {todo: todo}))]), lux_el("p", {className: "status"}, [`${remaining} of ${total} remaining`])]);
}

// ── Effects ──
createEffect(() => {
  setTodos(server.get_todos());
});

// ── Mount ──
document.addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app") || document.body);
});