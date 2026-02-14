// Server-Side Rendering for Tova
// Renders vnodes to HTML strings for initial page load

// Self-closing HTML tags
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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
  if (vnode === null || vnode === undefined) {
    return '';
  }

  // Reactive function — evaluate it
  if (typeof vnode === 'function') {
    return renderToString(vnode());
  }

  // Primitives
  if (typeof vnode === 'string') return escapeHtml(vnode);
  if (typeof vnode === 'number' || typeof vnode === 'boolean') return escapeHtml(String(vnode));

  // Arrays
  if (Array.isArray(vnode)) {
    return vnode.map(renderToString).join('');
  }

  // Non-tova object
  if (!vnode.__tova) {
    return escapeHtml(String(vnode));
  }

  // Fragment
  if (vnode.tag === '__fragment') {
    return flattenSSR(vnode.children).map(renderToString).join('');
  }

  // Dynamic node (ErrorBoundary etc.)
  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {
    const id = nextSSRId();
    try {
      const inner = vnode.compute();
      const content = renderToString(inner);
      return `<!--tova-s:${id}-->${content}<!--/tova-s:${id}-->`;
    } catch (e) {
      // If this is an ErrorBoundary with a fallback, render fallback
      if (vnode._fallback) {
        try {
          const fallbackContent = typeof vnode._fallback === 'function'
            ? vnode._fallback({ error: e, reset: () => {} })
            : vnode._fallback;
          return `<!--tova-s:${id}-->${renderToString(fallbackContent)}<!--/tova-s:${id}-->`;
        } catch (fallbackError) {
          // Fallback also threw — re-throw
          throw fallbackError;
        }
      }
      throw e;
    }
  }

  // Element
  const tag = vnode.tag;
  let html = `<${tag}`;

  html += renderPropsToString(vnode.props, vnode);

  // Self-closing
  if (VOID_ELEMENTS.has(tag)) {
    return html + ' />';
  }

  html += '>';

  // Children
  const children = flattenSSR(vnode.children || []);
  for (const child of children) {
    html += renderToString(child);
  }

  html += `</${tag}>`;
  return html;
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
  const { onError } = options;

  return new ReadableStream({
    start(controller) {
      try {
        streamVNode(vnode, controller);
      } catch (e) {
        if (onError) onError(e);
        controller.enqueue(`<!--tova-ssr-error-->`);
      }
      controller.close();
    },
  });
}

// Render a full HTML page as a stream
export function renderPageToStream(component, options = {}) {
  const { title = 'Tova App', head = '', scriptSrc = '/client.js', onError } = options;

  return new ReadableStream({
    start(controller) {
      // Flush head immediately so CSS/JS start downloading
      controller.enqueue(`<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escapeHtml(title)}</title>\n  ${head}\n</head>\n<body>\n  <div id="app">`);

      try {
        const vnode = typeof component === 'function' ? component() : component;
        streamVNode(vnode, controller);
      } catch (e) {
        if (onError) onError(e);
        controller.enqueue(`<!--tova-ssr-error-->`);
      }

      controller.enqueue(`</div>\n  <script type="module" src="${escapeAttr(scriptSrc)}"></script>\n</body>\n</html>`);
      controller.close();
    },
  });
}
