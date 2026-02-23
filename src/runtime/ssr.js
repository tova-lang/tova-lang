// Server-Side Rendering for Tova
// Renders vnodes to HTML strings for initial page load

// Self-closing HTML tags
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const _ESC_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const _RE_HTML = /[&<>"]/;
const _RE_HTML_G = /[&<>"]/g;

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  if (!_RE_HTML.test(str)) return str; // fast path: no special chars
  return str.replace(_RE_HTML_G, ch => _ESC_HTML[ch]);
}

const _ESC_ATTR = { '&': '&amp;', '"': '&quot;' };
const _RE_ATTR = /[&"]/;
const _RE_ATTR_G = /[&"]/g;

function escapeAttr(str) {
  if (typeof str !== 'string') return String(str);
  if (!_RE_ATTR.test(str)) return str; // fast path
  return str.replace(_RE_ATTR_G, ch => _ESC_ATTR[ch]);
}

// ─── SSR ID Counter for hydration markers ─────────────────
let ssrIdCounter = 0;

function nextSSRId() {
  return ++ssrIdCounter;
}

export function resetSSRIdCounter() {
  ssrIdCounter = 0;
}

// ─── Render props to attribute string ─────────────────────
function renderPropsToString(props, vnode) {
  let html = '';
  for (const [key, value] of Object.entries(props || {})) {
    if (key === 'key' || key === 'ref') continue;
    if (key.startsWith('on')) continue; // skip event handlers in SSR

    const val = typeof value === 'function' ? value() : value;
    if (val === false || val == null) continue;

    if (key === 'className') {
      html += ` class="${escapeAttr(val)}"`;
    } else if (key === 'style' && typeof val === 'object') {
      const styleStr = Object.entries(val)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`)
        .join(';');
      html += ` style="${escapeAttr(styleStr)}"`;
    } else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'readonly') {
      if (val) html += ` ${key}`;
    } else if (key === 'value') {
      html += ` value="${escapeAttr(val)}"`;
    } else {
      html += ` ${key}="${escapeAttr(val)}"`;
    }
  }

  // Add data-tova-component attribute for named components
  if (vnode && vnode._componentName) {
    html += ` data-tova-component="${escapeAttr(vnode._componentName)}"`;
  }

  return html;
}

// Render a vnode tree to an HTML string
export function renderToString(vnode) {
  const parts = [];
  _renderParts(vnode, parts);
  return parts.join('');
}

function _renderParts(vnode, parts) {
  if (vnode === null || vnode === undefined) {
    return;
  }

  // Reactive function — evaluate it
  if (typeof vnode === 'function') {
    _renderParts(vnode(), parts);
    return;
  }

  // Primitives
  if (typeof vnode === 'string') { parts.push(escapeHtml(vnode)); return; }
  if (typeof vnode === 'number' || typeof vnode === 'boolean') { parts.push(escapeHtml(String(vnode))); return; }

  // Arrays
  if (Array.isArray(vnode)) {
    for (const child of vnode) _renderParts(child, parts);
    return;
  }

  // Non-tova object
  if (!vnode.__tova) {
    parts.push(escapeHtml(String(vnode)));
    return;
  }

  // Fragment
  if (vnode.tag === '__fragment') {
    const children = flattenSSR(vnode.children);
    for (const child of children) _renderParts(child, parts);
    return;
  }

  // Dynamic node (ErrorBoundary, Suspense, etc.)
  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {
    const id = nextSSRId();
    try {
      const inner = vnode.compute();
      // If inner is a Promise (async Suspense children), render fallback
      if (inner && typeof inner.then === 'function') {
        if (vnode._fallback) {
          const fallbackContent = typeof vnode._fallback === 'function'
            ? vnode._fallback()
            : vnode._fallback;
          parts.push(`<!--tova-s:${id}-->`);
          _renderParts(fallbackContent, parts);
          parts.push(`<!--/tova-s:${id}-->`);
          return;
        }
        parts.push(`<!--tova-s:${id}--><!--/tova-s:${id}-->`);
        return;
      }
      parts.push(`<!--tova-s:${id}-->`);
      _renderParts(inner, parts);
      parts.push(`<!--/tova-s:${id}-->`);
      return;
    } catch (e) {
      // If this is an ErrorBoundary with a fallback, render fallback
      if (vnode._fallback) {
        try {
          const fallbackContent = typeof vnode._fallback === 'function'
            ? vnode._fallback({ error: e, reset: () => {} })
            : vnode._fallback;
          parts.push(`<!--tova-s:${id}-->`);
          _renderParts(fallbackContent, parts);
          parts.push(`<!--/tova-s:${id}-->`);
          return;
        } catch (fallbackError) {
          throw fallbackError;
        }
      }
      throw e;
    }
  }

  // Element
  const tag = vnode.tag;
  parts.push(`<${tag}`);
  parts.push(renderPropsToString(vnode.props, vnode));

  // Self-closing
  if (VOID_ELEMENTS.has(tag)) {
    parts.push(' />');
    return;
  }

  parts.push('>');

  // Children
  const children = flattenSSR(vnode.children || []);
  for (const child of children) {
    _renderParts(child, parts);
  }

  parts.push(`</${tag}>`);
}

function flattenSSR(children) {
  const result = [];
  for (const child of children) {
    if (child === null || child === undefined) continue;
    if (Array.isArray(child)) {
      result.push(...flattenSSR(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

// Render a full HTML page with the app component for SSR
export function renderPage(component, { title = 'Tova App', head = '', scriptSrc = '/client.js' } = {}) {
  const appHtml = renderToString(typeof component === 'function' ? component() : component);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${head}
</head>
<body>
  <div id="app">${appHtml}</div>
  <script type="module" src="${escapeAttr(scriptSrc)}"></script>
</body>
</html>`;
}

// ─── Streaming SSR ─────────────────────────────────────────

// Buffered controller wrapper — batches small enqueue() calls into larger chunks
// to reduce the number of stream operations (N4 optimization)
class BufferedController {
  constructor(controller, bufferSize = 4096) {
    this._inner = controller;
    this._buffer = '';
    this._bufferSize = bufferSize;
  }

  enqueue(chunk) {
    this._buffer += chunk;
    if (this._buffer.length >= this._bufferSize) {
      this._inner.enqueue(this._buffer);
      this._buffer = '';
    }
  }

  flush() {
    if (this._buffer.length > 0) {
      this._inner.enqueue(this._buffer);
      this._buffer = '';
    }
  }

  close() {
    this.flush();
    this._inner.close();
  }
}

// Stream a single vnode, writing chunks to the controller
function streamVNode(vnode, controller) {
  if (vnode === null || vnode === undefined) {
    return;
  }

  if (typeof vnode === 'function') {
    streamVNode(vnode(), controller);
    return;
  }

  if (typeof vnode === 'string') {
    controller.enqueue(escapeHtml(vnode));
    return;
  }

  if (typeof vnode === 'number' || typeof vnode === 'boolean') {
    controller.enqueue(escapeHtml(String(vnode)));
    return;
  }

  if (Array.isArray(vnode)) {
    for (const child of vnode) {
      streamVNode(child, controller);
    }
    return;
  }

  if (!vnode.__tova) {
    controller.enqueue(escapeHtml(String(vnode)));
    return;
  }

  // Fragment
  if (vnode.tag === '__fragment') {
    for (const child of flattenSSR(vnode.children)) {
      streamVNode(child, controller);
    }
    return;
  }

  // Dynamic node (ErrorBoundary etc.)
  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {
    const id = nextSSRId();
    controller.enqueue(`<!--tova-s:${id}-->`);
    try {
      const inner = vnode.compute();
      streamVNode(inner, controller);
    } catch (e) {
      if (vnode._fallback) {
        try {
          const fallbackContent = typeof vnode._fallback === 'function'
            ? vnode._fallback({ error: e, reset: () => {} })
            : vnode._fallback;
          streamVNode(fallbackContent, controller);
        } catch (fallbackError) {
          controller.enqueue(`<!--tova-ssr-error-->`);
        }
      } else {
        // No boundary — re-throw for outer error handling
        controller.enqueue(`<!--/tova-s:${id}-->`);
        throw e;
      }
    }
    controller.enqueue(`<!--/tova-s:${id}-->`);
    return;
  }

  // Element
  const tag = vnode.tag;
  let openTag = `<${tag}`;
  openTag += renderPropsToString(vnode.props, vnode);

  if (VOID_ELEMENTS.has(tag)) {
    controller.enqueue(openTag + ' />');
    return;
  }

  controller.enqueue(openTag + '>');

  const children = flattenSSR(vnode.children || []);
  for (const child of children) {
    streamVNode(child, controller);
  }

  controller.enqueue(`</${tag}>`);
}

// Render a vnode tree to a Web ReadableStream
export function renderToReadableStream(vnode, options = {}) {
  const { onError, bufferSize } = options;

  return new ReadableStream({
    start(controller) {
      const buf = new BufferedController(controller, bufferSize);
      try {
        streamVNode(vnode, buf);
      } catch (e) {
        if (onError) onError(e);
        buf.enqueue(`<!--tova-ssr-error-->`);
      }
      buf.close();
    },
  });
}

// Render a full HTML page as a stream
export function renderPageToStream(component, options = {}) {
  const { title = 'Tova App', head = '', scriptSrc = '/client.js', onError, bufferSize } = options;

  return new ReadableStream({
    start(controller) {
      // Flush head immediately so CSS/JS start downloading (bypass buffer)
      controller.enqueue(`<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escapeHtml(title)}</title>\n  ${head}\n</head>\n<body>\n  <div id="app">`);

      const buf = new BufferedController(controller, bufferSize);
      try {
        const vnode = typeof component === 'function' ? component() : component;
        streamVNode(vnode, buf);
      } catch (e) {
        if (onError) onError(e);
        buf.enqueue(`<!--tova-ssr-error-->`);
      }

      buf.flush();
      controller.enqueue(`</div>\n  <script type="module" src="${escapeAttr(scriptSrc)}"></script>\n</body>\n</html>`);
      controller.close();
    },
  });
}
