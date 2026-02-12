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
const Low = Object.freeze({ __tag: "Low" });
const Medium = Object.freeze({ __tag: "Medium" });
const High = Object.freeze({ __tag: "High" });

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
const [count, setCount] = createSignal(0);
const [step, setStep] = createSignal(1);
const [notes, setNotes] = createSignal([]);
const [note_input, setNote_input] = createSignal("");
const [note_count_id, setNote_count_id] = createSignal(0);
const [selected_priority, setSelected_priority] = createSignal("Medium");

// ── Computed Values ──
const doubled = createComputed(() => (count() * 2));
const is_even = createComputed(() => ((count() % 2) == 0));
const parity_text = createComputed(() => ((is_even()) ? ("even") : ("odd")));
const total_notes = createComputed(() => len(notes()));
const high_count = createComputed(() => len(notes().filter((n) => (n.priority == "High"))));

function increment() {
  setCount(__lux_p => __lux_p + step());
}
function decrement() {
  setCount(__lux_p => __lux_p - step());
}
function reset() {
  setCount(0);
}
function add_note() {
  if ((note_input() != "")) {
    setNote_count_id(__lux_p => __lux_p + 1);
    setNotes([...notes(), { id: note_count_id(), text: note_input(), priority: selected_priority(), created_at: count() }]);
    setNote_input("");
  }
}
function remove_note(id) {
  setNotes(notes().filter((n) => (n.id != id)));
}
function priority_color(p) {
  if ((p == "High")) {
    return "#e74c3c";
  } else if ((p == "Medium")) {
    return "#f39c12";
  } else {
    return "#27ae60";
  }
}
// ── Components ──
function Badge(__props) {
  const text = () => __props.text;
  const color = () => __props.color;
  return lux_el("span", {style: () => `background: ${color()}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;`}, [() => `${text()}`]);
}

function NoteItem(__props) {
  const note = () => __props.note;
  return lux_el("div", {style: () => `display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; margin-bottom: 0.5rem; background: #f8f9fa; border-radius: 8px; border-left: 3px solid ${priority_color(note().priority)};`}, [lux_el("div", {style: "flex: 1;"}, [lux_el("div", {style: "display: flex; align-items: center; gap: 0.5rem;"}, [Badge({get text() { return note().priority; }, get color() { return priority_color(note().priority); }}), lux_el("span", {}, [() => `${note().text}`])]), lux_el("div", {style: "font-size: 0.75rem; color: #888; margin-top: 0.25rem;"}, [() => `Added at count: ${note().created_at}`])]), lux_el("button", {style: "background: none; border: none; color: #ccc; cursor: pointer; font-size: 1.2rem; padding: 0.25rem;", onClick: () => remove_note(note().id)}, ["x"])]);
}

function App() {
  return lux_el("div", {style: "max-width: 520px; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, -apple-system, sans-serif;"}, [lux_el("div", {style: "background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 60px rgba(0,0,0,0.1);"}, [lux_el("header", {style: "text-align: center; margin-bottom: 1.5rem;"}, [lux_el("h1", {style: "margin: 0; font-size: 1.8rem; color: #333;"}, ["Lux Counter"]), lux_el("p", {style: "margin: 0.25rem 0 0; color: #888; font-size: 0.85rem;"}, ["Reactivity Test App"])]), lux_el("div", {id: "counter-display", style: "text-align: center; padding: 1.5rem; background: #f0f4ff; border-radius: 12px; margin-bottom: 1.5rem;"}, [lux_el("div", {style: "font-size: 3.5rem; font-weight: 700; color: #333; font-variant-numeric: tabular-nums;"}, [() => `${count()}`]), lux_el("div", {style: "font-size: 0.85rem; color: #667eea; margin-top: 0.25rem;"}, [() => `doubled: ${doubled()} | ${parity_text()}`])]), lux_el("div", {style: "display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 1rem;"}, [lux_el("button", {id: "btn-dec", style: "padding: 0.5rem 1.25rem; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; font-size: 1rem;", onClick: decrement}, ["-"]), lux_el("button", {id: "btn-reset", style: "padding: 0.5rem 1.25rem; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; font-size: 0.9rem;", onClick: reset}, ["Reset"]), lux_el("button", {id: "btn-inc", style: "padding: 0.5rem 1.25rem; border: 1px solid #667eea; border-radius: 8px; background: #667eea; color: white; cursor: pointer; font-size: 1rem;", onClick: increment}, ["+"])]), lux_el("div", {style: "display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem;"}, [lux_el("label", {style: "font-size: 0.85rem; color: #666;"}, ["Step:"]), lux_el("input", {id: "step-input", type: "text", value: () => step(), style: "width: 50px; padding: 0.4rem; border: 2px solid #e0e0e0; border-radius: 6px; text-align: center; font-size: 0.9rem;", onInput: (e) => { setStep(((__lux_v) => __lux_v != null && __lux_v === __lux_v ? __lux_v : 1)(parseInt(e.target.value))); }})]), lux_el("div", {style: "border-top: 1px solid #eee; padding-top: 1.5rem;"}, [lux_el("h2", {style: "margin: 0 0 0.75rem; font-size: 1.1rem; color: #333;"}, [() => `Notes (${total_notes()})`, () => ((high_count() > 0)) ? lux_el("span", {style: "color: #e74c3c; font-size: 0.8rem; margin-left: 0.5rem;"}, [() => `${high_count()} high priority`]) : null]), lux_el("div", {style: "display: flex; gap: 0.5rem; margin-bottom: 1rem;"}, [lux_el("input", {id: "note-input", type: "text", placeholder: "Add a note...", value: () => note_input(), style: "flex: 1; padding: 0.6rem 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.9rem; outline: none;", onInput: (e) => { setNote_input(e.target.value); }, onKeydown: (e) => {
    if ((e.key == "Enter")) {
      add_note();
    }
  }}), lux_el("select", {id: "priority-select", value: () => selected_priority(), style: "padding: 0.5rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.85rem;", onChange: (e) => { setSelected_priority(e.target.value); }}, [lux_el("option", {value: "Low"}, ["Low"]), lux_el("option", {value: "Medium"}, ["Medium"]), lux_el("option", {value: "High"}, ["High"])]), lux_el("button", {id: "btn-add-note", style: "padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.9rem; white-space: nowrap;", onClick: add_note}, ["Add"])]), lux_el("div", {id: "notes-list"}, [() => notes().map((note) => NoteItem({note: note}))]), () => ((total_notes() == 0)) ? lux_el("div", {style: "text-align: center; color: #ccc; padding: 1.5rem; font-size: 0.9rem;"}, ["No notes yet. Add one above!"]) : null])])]);
}

// ── Mount ──
document.addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app") || document.body);
});