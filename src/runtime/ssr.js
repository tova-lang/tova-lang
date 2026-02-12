// Server-Side Rendering for Lux
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

  // Non-lux object
  if (!vnode.__lux) {
    return escapeHtml(String(vnode));
  }

  // Fragment
  if (vnode.tag === '__fragment') {
    return flattenSSR(vnode.children).map(renderToString).join('');
  }

  // Dynamic node (ErrorBoundary etc.)
  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {
    return renderToString(vnode.compute());
  }

  // Element
  const tag = vnode.tag;
  let html = `<${tag}`;

  // Render props as attributes
  for (const [key, value] of Object.entries(vnode.props || {})) {
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
export function renderPage(component, { title = 'Lux App', head = '', scriptSrc = '/client.js' } = {}) {
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
