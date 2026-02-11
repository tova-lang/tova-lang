import { createSignal, createEffect, createComputed, mount, lux_el, lux_fragment } from './runtime/reactivity.js';
import { rpc } from './runtime/rpc.js';

// ── Shared ──
function User(id, name, email) { return { id, name, email }; }
function Event(kind, data, timestamp) { return { kind, data, timestamp }; }

// ── Server RPC Proxy ──
const server = new Proxy({}, {
  get(_, name) {
    return (...args) => rpc(name, args);
  }
});

// ── Reactive State ──
const [users, setUsers] = createSignal([]);
const [events, setEvents] = createSignal([]);

// ── Components ──
function App() {
  return lux_el("div", {className: "app"}, [lux_el("h1", {}, ["Multi-Server Demo"]), lux_el("section", {}, [lux_el("h2", {}, ["Users (from api server)"]), lux_el("ul", {}, [...users.map((user) => lux_el("li", {}, [`${user.name} (${user.email})`]))])]), lux_el("section", {}, [lux_el("h2", {}, ["Events (from events server)"]), lux_el("ul", {}, [...events.map((event) => lux_el("li", {}, [`[${event.kind}] ${event.data}`]))])])]);
}

// ── Effects ──
createEffect(() => {
  setUsers(server.get_users());
});

// ── Mount ──
document.addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app") || document.body);
});