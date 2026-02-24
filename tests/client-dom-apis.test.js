// Tests that all DOM APIs and window globals are accessible in client blocks
// without triggering false "undefined identifier" analyzer warnings.

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function analyzeSource(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function compileClient(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().client || '';
}

// Filter out snake_case warnings — only check for "is not defined" warnings
function undefinedWarnings(warnings) {
  return warnings.filter(w => w.message && w.message.includes('is not defined'));
}

// ─── Core Browser Globals ────────────────────────────────────

describe('Client DOM APIs — Core globals', () => {
  test('document is accessible', () => {
    const { warnings } = analyzeSource('el = document.getElementById("app")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('window is accessible', () => {
    const { warnings } = analyzeSource('w = window.innerWidth');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('globalThis is accessible', () => {
    const { warnings } = analyzeSource('g = globalThis.document');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('self is accessible', () => {
    const { warnings } = analyzeSource('s = self.location');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('console is accessible', () => {
    const { warnings } = analyzeSource('console.log("hello")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('navigator is accessible', () => {
    const { warnings } = analyzeSource('ua = navigator.userAgent');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('location is accessible', () => {
    const { warnings } = analyzeSource('path = location.pathname');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('history is accessible', () => {
    const { warnings } = analyzeSource('history.pushState({}, "", "/new")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('screen is accessible', () => {
    const { warnings } = analyzeSource('w = screen.width');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Timers & Scheduling ─────────────────────────────────────

describe('Client DOM APIs — Timers & scheduling', () => {
  test('setTimeout / clearTimeout', () => {
    const { warnings } = analyzeSource('id = setTimeout(fn() { print("hi") }, 100)\nclearTimeout(id)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('setInterval / clearInterval', () => {
    const { warnings } = analyzeSource('id = setInterval(fn() { print("tick") }, 1000)\nclearInterval(id)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('requestAnimationFrame / cancelAnimationFrame', () => {
    const { warnings } = analyzeSource('id = requestAnimationFrame(fn() { print("frame") })\ncancelAnimationFrame(id)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('requestIdleCallback / cancelIdleCallback', () => {
    const { warnings } = analyzeSource('id = requestIdleCallback(fn() { print("idle") })\ncancelIdleCallback(id)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('queueMicrotask', () => {
    const { warnings } = analyzeSource('queueMicrotask(fn() { print("micro") })');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Fetch & Network ─────────────────────────────────────────

describe('Client DOM APIs — Fetch & network', () => {
  test('fetch is accessible', () => {
    const { warnings } = analyzeSource('resp = fetch("/api/data")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('URL and URLSearchParams', () => {
    const { warnings } = analyzeSource('u = URL.new("https://example.com")\nparams = URLSearchParams.new("a=1")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Headers, Request, Response', () => {
    const { warnings } = analyzeSource('h = Headers.new()\nr = Request.new("/api")\nresp = Response.new("ok")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('FormData', () => {
    const { warnings } = analyzeSource('fd = FormData.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('AbortController / AbortSignal', () => {
    const { warnings } = analyzeSource('ctrl = AbortController.new()\nsig = ctrl.signal');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('WebSocket', () => {
    const { warnings } = analyzeSource('ws = WebSocket.new("ws://localhost:8080")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('EventSource', () => {
    const { warnings } = analyzeSource('es = EventSource.new("/events")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('XMLHttpRequest', () => {
    const { warnings } = analyzeSource('xhr = XMLHttpRequest.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Storage ─────────────────────────────────────────────────

describe('Client DOM APIs — Storage', () => {
  test('localStorage', () => {
    const { warnings } = analyzeSource('localStorage.setItem("key", "val")\nv = localStorage.getItem("key")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('sessionStorage', () => {
    const { warnings } = analyzeSource('sessionStorage.setItem("key", "val")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── DOM & Events ────────────────────────────────────────────

describe('Client DOM APIs — DOM constructors & events', () => {
  test('Event', () => {
    const { warnings } = analyzeSource('e = Event.new("click")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('CustomEvent', () => {
    const { warnings } = analyzeSource('opts = {detail: "data"}\ne = CustomEvent.new("my-event", opts)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('MouseEvent', () => {
    const { warnings } = analyzeSource('e = MouseEvent.new("click")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('KeyboardEvent', () => {
    const { warnings } = analyzeSource('e = KeyboardEvent.new("keydown")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('FocusEvent', () => {
    const { warnings } = analyzeSource('e = FocusEvent.new("focus")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('InputEvent', () => {
    const { warnings } = analyzeSource('e = InputEvent.new("input")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('TouchEvent', () => {
    const { warnings } = analyzeSource('e = TouchEvent.new("touchstart")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('PointerEvent', () => {
    const { warnings } = analyzeSource('e = PointerEvent.new("pointerdown")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('DragEvent', () => {
    const { warnings } = analyzeSource('e = DragEvent.new("dragstart")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('ClipboardEvent', () => {
    const { warnings } = analyzeSource('e = ClipboardEvent.new("copy")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('AnimationEvent', () => {
    const { warnings } = analyzeSource('e = AnimationEvent.new("animationend")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('TransitionEvent', () => {
    const { warnings } = analyzeSource('e = TransitionEvent.new("transitionend")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('HTMLElement', () => {
    const { warnings } = analyzeSource('proto = HTMLElement.prototype');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Element', () => {
    const { warnings } = analyzeSource('proto = Element.prototype');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Node', () => {
    const { warnings } = analyzeSource('t = Node.TEXT_NODE');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('DocumentFragment', () => {
    const { warnings } = analyzeSource('frag = DocumentFragment.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('DOMParser', () => {
    const { warnings } = analyzeSource('parser = DOMParser.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Image', () => {
    const { warnings } = analyzeSource('img = Image.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Audio', () => {
    const { warnings } = analyzeSource('snd = Audio.new("beep.mp3")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Observers ───────────────────────────────────────────────

describe('Client DOM APIs — Observers', () => {
  test('IntersectionObserver', () => {
    const { warnings } = analyzeSource('obs = IntersectionObserver.new(fn(entries) { print(entries) })');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('MutationObserver', () => {
    const { warnings } = analyzeSource('obs = MutationObserver.new(fn(mutations) { print(mutations) })');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('ResizeObserver', () => {
    const { warnings } = analyzeSource('obs = ResizeObserver.new(fn(entries) { print(entries) })');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Browser Utility APIs ────────────────────────────────────

describe('Client DOM APIs — Browser utilities', () => {
  test('getComputedStyle', () => {
    const { warnings } = analyzeSource('el = document.body\nstyles = getComputedStyle(el)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('matchMedia', () => {
    const { warnings } = analyzeSource('mq = matchMedia("(prefers-color-scheme: dark)")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('getSelection', () => {
    const { warnings } = analyzeSource('sel = getSelection()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('scrollTo / scrollBy', () => {
    const { warnings } = analyzeSource('scrollTo(0, 0)\nscrollBy(0, 100)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('alert / confirm / prompt', () => {
    const { warnings } = analyzeSource('alert("hi")\nok = confirm("sure?")\nname = prompt("name?")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('structuredClone', () => {
    const { warnings } = analyzeSource('copy = structuredClone({a: 1})');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Encoding ────────────────────────────────────────────────

describe('Client DOM APIs — Encoding', () => {
  test('TextEncoder / TextDecoder', () => {
    const { warnings } = analyzeSource('enc = TextEncoder.new()\ndec = TextDecoder.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('atob / btoa', () => {
    const { warnings } = analyzeSource('encoded = btoa("hello")\ndecoded = atob(encoded)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('encodeURIComponent / decodeURIComponent', () => {
    const { warnings } = analyzeSource('e = encodeURIComponent("hello world")\nd = decodeURIComponent(e)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('encodeURI / decodeURI', () => {
    const { warnings } = analyzeSource('e = encodeURI("http://example.com/a b")\nd = decodeURI(e)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Workers & Channels ──────────────────────────────────────

describe('Client DOM APIs — Workers & channels', () => {
  test('Worker', () => {
    const { warnings } = analyzeSource('w = Worker.new("worker.js")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('SharedWorker', () => {
    const { warnings } = analyzeSource('w = SharedWorker.new("shared.js")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('BroadcastChannel', () => {
    const { warnings } = analyzeSource('bc = BroadcastChannel.new("updates")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('MessageChannel', () => {
    const { warnings } = analyzeSource('ch = MessageChannel.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Media & Graphics ────────────────────────────────────────

describe('Client DOM APIs — Media & graphics', () => {
  test('AudioContext', () => {
    const { warnings } = analyzeSource('ctx = AudioContext.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Notification', () => {
    const { warnings } = analyzeSource('n = Notification.new("Hello!")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Typed Arrays ────────────────────────────────────────────

describe('Client DOM APIs — Typed arrays', () => {
  test('ArrayBuffer', () => {
    const { warnings } = analyzeSource('buf = ArrayBuffer.new(16)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('DataView', () => {
    const { warnings } = analyzeSource('buf = ArrayBuffer.new(16)\nview = DataView.new(buf)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Int8Array / Uint8Array / Uint8ClampedArray', () => {
    const { warnings } = analyzeSource('a = Int8Array.new(8)\nb = Uint8Array.new(8)\nc = Uint8ClampedArray.new(8)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Int16Array / Uint16Array', () => {
    const { warnings } = analyzeSource('a = Int16Array.new(8)\nb = Uint16Array.new(8)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Int32Array / Uint32Array', () => {
    const { warnings } = analyzeSource('a = Int32Array.new(8)\nb = Uint32Array.new(8)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Float32Array / Float64Array', () => {
    const { warnings } = analyzeSource('a = Float32Array.new(8)\nb = Float64Array.new(8)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('BigInt64Array / BigUint64Array', () => {
    const { warnings } = analyzeSource('a = BigInt64Array.new(8)\nb = BigUint64Array.new(8)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Streams ─────────────────────────────────────────────────

describe('Client DOM APIs — Streams', () => {
  test('ReadableStream', () => {
    const { warnings } = analyzeSource('s = ReadableStream.new({})');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('WritableStream', () => {
    const { warnings } = analyzeSource('s = WritableStream.new({})');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('TransformStream', () => {
    const { warnings } = analyzeSource('s = TransformStream.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── JS Built-ins ────────────────────────────────────────────

describe('Client DOM APIs — JS built-ins', () => {
  test('Promise', () => {
    const { warnings } = analyzeSource('p = Promise.resolve(42)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Proxy / Reflect', () => {
    const { warnings } = analyzeSource('p = Proxy.new({}, {})\nv = Reflect.get({}, "a")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('BigInt', () => {
    const { warnings } = analyzeSource('n = BigInt(42)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('WeakRef', () => {
    const { warnings } = analyzeSource('obj = {a: 1}\nref = WeakRef.new(obj)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('Error types: SyntaxError, ReferenceError, URIError, EvalError', () => {
    const { warnings } = analyzeSource('a = SyntaxError.new("bad")\nb = ReferenceError.new("bad")\nc = URIError.new("bad")\nd = EvalError.new("bad")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('AggregateError', () => {
    const { warnings } = analyzeSource('e = AggregateError.new([], "fail")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Client Block Compilation — DOM Access ───────────────────

describe('Client block compilation — DOM access', () => {
  test('document.getElementById compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    el = document.getElementById("main")
    <div>Hello</div>
  }
}`);
    expect(code).toContain('document.getElementById');
  });

  test('window.addEventListener compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    window.addEventListener("resize", fn() { print("resized") })
    <div>App</div>
  }
}`);
    expect(code).toContain('window.addEventListener');
  });

  test('localStorage access compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    theme = localStorage.getItem("theme")
    <div>{theme}</div>
  }
}`);
    expect(code).toContain('localStorage.getItem');
  });

  test('fetch call compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    async fn load_data() {
      resp = await fetch("/api/data")
      resp
    }
    <div>App</div>
  }
}`);
    expect(code).toContain('fetch(');
  });

  test('setTimeout compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    setTimeout(fn() { print("delayed") }, 1000)
    <div>App</div>
  }
}`);
    expect(code).toContain('setTimeout(');
  });

  test('WebSocket usage compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    ws = WebSocket.new("ws://localhost:8080")
    <div>Chat</div>
  }
}`);
    expect(code).toContain('new WebSocket(');
  });

  test('IntersectionObserver compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    obs = IntersectionObserver.new(fn(entries) { print(entries) })
    <div>App</div>
  }
}`);
    expect(code).toContain('new IntersectionObserver(');
  });

  test('matchMedia compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    mq = matchMedia("(prefers-color-scheme: dark)")
    <div>App</div>
  }
}`);
    expect(code).toContain('matchMedia(');
  });

  test('requestAnimationFrame compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    requestAnimationFrame(fn() { print("frame") })
    <div>App</div>
  }
}`);
    expect(code).toContain('requestAnimationFrame(');
  });

  test('navigator.clipboard compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    cb = navigator.clipboard
    <div>App</div>
  }
}`);
    expect(code).toContain('navigator.clipboard');
  });

  test('history.pushState compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    history.pushState({}, "", "/new")
    <div>App</div>
  }
}`);
    expect(code).toContain('history.pushState');
  });

  test('CustomEvent constructor compiles to JS', () => {
    const code = compileClient(`client {
  component App() {
    opts = {detail: "hello"}
    evt = CustomEvent.new("notify", opts)
    <div>App</div>
  }
}`);
    expect(code).toContain('new CustomEvent(');
  });
});

// ─── Window Properties ───────────────────────────────────────

describe('Client DOM APIs — Window properties', () => {
  test('innerWidth / innerHeight', () => {
    const { warnings } = analyzeSource('w = innerWidth\nh = innerHeight');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('outerWidth / outerHeight', () => {
    const { warnings } = analyzeSource('w = outerWidth\nh = outerHeight');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('scrollX / scrollY', () => {
    const { warnings } = analyzeSource('x = scrollX\ny = scrollY');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('devicePixelRatio', () => {
    const { warnings } = analyzeSource('dpr = devicePixelRatio');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('performance', () => {
    const { warnings } = analyzeSource('t = performance.now()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('crypto', () => {
    const { warnings } = analyzeSource('id = crypto.randomUUID()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});

// ─── Blob & File APIs ────────────────────────────────────────

describe('Client DOM APIs — Blob & File', () => {
  test('Blob', () => {
    const { warnings } = analyzeSource('opts = {"type": "text/plain"}\nb = Blob.new(["hello"], opts)');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('File', () => {
    const { warnings } = analyzeSource('f = File.new(["data"], "test.txt")');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('FileReader', () => {
    const { warnings } = analyzeSource('reader = FileReader.new()');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });

  test('ClipboardItem', () => {
    const { warnings } = analyzeSource('item = ClipboardItem.new({})');
    expect(undefinedWarnings(warnings)).toEqual([]);
  });
});
