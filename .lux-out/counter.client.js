import { createSignal, createEffect, createComputed, mount, lux_el, lux_fragment } from './runtime/reactivity.js';
import { rpc } from './runtime/rpc.js';

// ── Server RPC Proxy ──
const server = new Proxy({}, {
  get(_, name) {
    return (...args) => rpc(name, args);
  }
});

// ── Reactive State ──
const [count, setCount] = createSignal(0);

// ── Computed Values ──
const doubled = createComputed(() => (count * 2));
const message = createComputed(() => ((__match) => {
  if (__match === 0) {
    return "Click the button!";
  }
  else if (__match >= 1 && __match < 5) {
    return "Keep going...";
  }
  else if (((n) => (n >= 10))(__match)) {
    const n = __match;
    return "You're on fire! 🔥";
  }
  return "Nice!";
})(count));

// ── Components ──
function App() {
  return lux_el("div", {className: "counter-app"}, [lux_el("h1", {}, ["Lux Counter"]), lux_el("p", {className: "count"}, [`${count}`]), lux_el("p", {className: "doubled"}, [`Doubled: ${doubled}`]), lux_el("p", {className: "message"}, [`${message}`]), lux_el("div", {className: "buttons"}, [lux_el("button", {onClick: () => { setCount(__prev => __prev - 1); }}, ["-"]), lux_el("button", {onClick: () => { setCount(__prev => __prev + 1); }}, ["+"]), lux_el("button", {onClick: () => { setCount(0); }}, ["Reset"])])]);
}

// ── Mount ──
document.addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app") || document.body);
});