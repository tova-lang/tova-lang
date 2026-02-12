import { createSignal, createEffect, createComputed, mount, hydrate, lux_el, lux_fragment, lux_keyed, lux_inject_css, batch, onMount, onUnmount, onCleanup, createRef, createContext, provide, inject, createErrorBoundary, ErrorBoundary, createRoot, watch, untrack, Dynamic, Portal, lazy } from './runtime/reactivity.js';
import { rpc } from './runtime/rpc.js';

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

// ── Stdlib ──
function print(...args) { console.log(...args); }
function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }
function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }
function enumerate(a) { return a.map((v, i) => [i, v]); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }
function reversed(a) { return [...a].reverse(); }
function zip(...as) { const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }
function min(a) { return Math.min(...a); }
function max(a) { return Math.max(...a); }

// ── Server RPC Proxy ──
const server = new Proxy({}, {
  get(_, name) {
    return (...args) => rpc(name, args);
  }
});

// ── Reactive State ──
const [seconds, setSeconds] = createSignal(0);
const [running, setRunning] = createSignal(false);
const [timer_id, setTimer_id] = createSignal(null);
const [tasks, setTasks] = createSignal([]);
const [next_id, setNext_id] = createSignal(1);
const [new_task, setNew_task] = createSignal("");
const [active_task, setActive_task] = createSignal(null);

// ── Computed Values ──
const minutes_display = createComputed(() => `${Math.floor((seconds() / 60))}`.padStart(2, "0"));
const seconds_display = createComputed(() => `${(seconds() % 60)}`.padStart(2, "0"));
const time_display = createComputed(() => `${minutes_display()}:${seconds_display()}`);
const total_tasks = createComputed(() => len(tasks()));
const done_count = createComputed(() => len(tasks().filter((t) => t.done).map((t) => t)));
const progress = createComputed(() => (((total_tasks() > 0)) ? (Math.round(((done_count() * 100) / total_tasks()))) : (0)));

function start_timer() {
  if ((!running())) {
    setRunning(true);
    setTimer_id(setInterval(() => {
      setSeconds(__lux_p => __lux_p + 1);
    }, 1000));
  }
}
function pause_timer() {
  if (running()) {
    setRunning(false);
    clearInterval(timer_id());
    setTimer_id(null);
  }
}
function reset_timer() {
  pause_timer();
  setSeconds(0);
}
function add_task() {
  if ((new_task() != "")) {
    setTasks([...tasks(), { id: next_id(), text: new_task(), done: false }]);
    setNext_id(__lux_p => __lux_p + 1);
    setNew_task("");
  }
}
function toggle_task(id) {
  setTasks(tasks().map((t) => (((t.id == id)) ? ({ id: t.id, text: t.text, done: (!t.done) }) : (t))));
}
function delete_task(id) {
  setTasks(tasks().filter((t) => (t.id != id)).map((t) => t));
}
function set_active(id) {
  setActive_task((((active_task() == id)) ? (null) : (id)));
}
// ── Components ──
function TaskItem(__props) {
  const task = () => __props.task;
  return lux_el("li", {className: () => `task-item${(((task().id == active_task())) ? (" active") : (""))}`}, [lux_el("div", {className: "task-content"}, [lux_el("button", {className: "check-btn", onClick: () => toggle_task(task().id)}, [`${((task().done) ? ("✅") : ("⬜"))}`]), lux_el("span", {className: () => `task-title${((task().done) ? (" done") : (""))}`, onClick: () => set_active(task().id)}, [`${task().text}`])]), lux_el("button", {className: "delete-btn", onClick: () => delete_task(task().id)}, ["×"])]);
}

function App() {
  return lux_el("div", {className: "app"}, [lux_el("header", {}, [lux_el("h1", {}, ["Lux Pomodoro"]), lux_el("p", {className: "subtitle"}, ["Focus Timer & Tasks"])]), lux_el("div", {className: "timer-section"}, [lux_el("div", {className: "timer-label"}, ["Timer"]), lux_el("div", {className: "timer-display"}, [`${time_display()}`]), lux_el("div", {className: "timer-controls"}, [() => ((!running())) ? lux_el("button", {className: "btn-start", onClick: start_timer}, ["Start"]) : lux_el("button", {className: "btn-pause", onClick: pause_timer}, ["Pause"]), lux_el("button", {onClick: reset_timer}, ["Reset"])])]), lux_el("div", {className: "task-section"}, [lux_el("h2", {}, [`Tasks (${done_count()}/${total_tasks()})`]), lux_el("div", {className: "input-row"}, [lux_el("input", {type: "text", placeholder: "Add a task...", value: () => new_task(), onInput: (e) => { setNew_task(e.target.value); }, onKeydown: (e) => {
    if ((e.key == "Enter")) {
      add_task();
    }
  }}), lux_el("button", {className: "btn-add", onClick: add_task}, ["Add"])]), lux_el("ul", {className: "task-list"}, [() => tasks().map((task) => TaskItem({task: task}))]), () => ((total_tasks() > 0)) ? lux_el("div", {className: "stats"}, [`${progress()}% complete`]) : null])]);
}

// ── Mount ──
document.addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app") || document.body);
});