# Server-Side Rendering

Tova includes a built-in SSR system that renders components to HTML on the server for faster initial page loads. The client then hydrates the server-rendered HTML to make it interactive.

## renderToString

`renderToString(vnode)` renders a vnode tree to an HTML string synchronously. This is the simplest SSR approach:

```js
import { renderToString } from './runtime/ssr.js';
import { tova_el } from './runtime/reactivity.js';

const vnode = App();
const html = renderToString(vnode);
// => '<div class="app"><h1>Hello</h1></div>'
```

Dynamic vnodes (error boundaries, conditionals, lazy components) are evaluated and their output is wrapped in hydration markers:

```html
<!--tova-s:1--><div>dynamic content</div><!--/tova-s:1-->
```

These markers are consumed during [hydration](/reactivity/advanced#hydrate) to correctly re-attach reactivity to the server-rendered content.

### Error Boundaries in SSR

When a dynamic vnode has an error boundary (a `_fallback` property), `renderToString` catches errors and renders the fallback HTML instead:

```js
const boundary = ErrorBoundary({
  fallback: ({ error }) => tova_el('div', { className: 'error' }, [error.message]),
  children: [RiskyComponent()],
});

const html = renderToString(boundary);
// If RiskyComponent throws, renders the fallback
```

If there is no error boundary, the error re-throws so you can handle it at the server level.

## renderPage

`renderPage(component, options?)` renders a full HTML page with the component wrapped in a standard HTML shell:

```js
import { renderPage } from './runtime/ssr.js';

const html = renderPage(App, {
  title: 'My Tova App',
  head: '<link rel="stylesheet" href="/styles.css">',
  scriptSrc: '/client.js',
});
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `'Tova App'` | Page `<title>` |
| `head` | `''` | Extra HTML for `<head>` — string or array of tag descriptors (see [Safe Head Tags](#safe-head-tags)) |
| `scriptSrc` | `'/client.js'` | Path to the client-side JavaScript bundle |
| `cspNonce` | `undefined` | CSP nonce value added to the `<script>` tag |

The output is a complete HTML document with the app rendered inside `<div id="app">`.

### CSP Nonce

If your server uses Content Security Policy with nonces, pass the nonce to include it on the client script tag:

```js
const html = renderPage(App, {
  title: 'My App',
  scriptSrc: '/client.js',
  cspNonce: request.cspNonce,
});
// Produces: <script type="module" src="/client.js" nonce="abc123"></script>
```

## renderToReadableStream

`renderToReadableStream(vnode, options?)` renders a vnode tree to a Web `ReadableStream`. This enables streaming SSR -- the server starts sending HTML to the client before the entire page is rendered:

```js
import { renderToReadableStream } from './runtime/ssr.js';

const stream = renderToReadableStream(App());

// With Bun's HTTP server:
return new Response(stream, {
  headers: { 'Content-Type': 'text/html' },
});
```

Options:

| Option | Type | Description |
|--------|------|-------------|
| `onError` | function | Called with the error when an unhandled error occurs during streaming |
| `bufferSize` | number | Buffer size in bytes before flushing chunks to the stream (default: 4096) |

### Error Handling

Errors inside error boundaries render the fallback HTML inline in the stream. Errors without a boundary call the `onError` callback:

```js
const stream = renderToReadableStream(App(), {
  onError: (error) => {
    console.error('SSR stream error:', error);
  },
});
```

## renderPageToStream

`renderPageToStream(component, options?)` combines `renderToReadableStream` with the HTML page shell. It flushes the `<head>` immediately so CSS and JavaScript start downloading while the body streams:

```js
import { renderPageToStream } from './runtime/ssr.js';

const stream = renderPageToStream(App, {
  title: 'My App',
  head: '<link rel="stylesheet" href="/styles.css">',
  scriptSrc: '/bundle.js',
  onError: (error) => console.error('Page stream error:', error),
});

return new Response(stream, {
  headers: { 'Content-Type': 'text/html' },
});
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `'Tova App'` | Page `<title>` |
| `head` | `''` | Extra HTML for `<head>` — string or array of tag descriptors (see [Safe Head Tags](#safe-head-tags)) |
| `scriptSrc` | `'/client.js'` | Client bundle path |
| `onError` | `undefined` | Error callback for unhandled stream errors |
| `bufferSize` | `4096` | Buffer size in bytes before flushing to the stream |
| `cspNonce` | `undefined` | CSP nonce value added to the `<script>` tag |

## Hydration Markers

SSR output includes comment-based hydration markers around dynamic content:

```html
<!--tova-s:1-->
<div>conditionally rendered content</div>
<!--/tova-s:1-->
```

These markers:
- Are generated automatically by `renderToString` and `renderToReadableStream` for `__dynamic` vnodes
- Are consumed during client-side hydration to correctly identify and replace SSR content with reactive markers
- Have unique numeric IDs to handle nested dynamic regions

Components with a `_componentName` also receive a `data-tova-component` attribute in the SSR output, which is used by [DevTools](/reactivity/devtools) for component identification.

## Concurrent SSR Contexts

By default, SSR uses a global ID counter for hydration markers. This is fine for single-request rendering, but in concurrent environments (e.g., a server handling multiple requests simultaneously) the shared counter can produce non-deterministic output.

Use `withSSRContext()` to isolate each request:

```js
import { withSSRContext, renderToString } from './runtime/ssr.js';

// Each request gets its own ID counter
server.get('/', (req, res) => {
  const html = withSSRContext(() => {
    return renderToString(App());
  });
  res.send(html);
});
```

`withSSRContext` creates an isolated context where hydration marker IDs start from 1. Nested calls are safe — the previous context is restored when the function returns.

For manual control, you can also use `createSSRContext()` directly, though `withSSRContext()` is recommended for most cases.

## Safe Head Tags {#safe-head-tags}

When the `head` option contains user-controlled content (e.g., page titles from a CMS), use the array form instead of a raw HTML string to prevent XSS:

```js
import { renderPage, renderHeadTags } from './runtime/ssr.js';

// SAFE: structured tag descriptors — all values are escaped
const html = renderPage(App, {
  title: userTitle,
  head: [
    { tag: 'meta', attrs: { name: 'description', content: userDescription } },
    { tag: 'meta', attrs: { property: 'og:title', content: userTitle } },
    { tag: 'link', attrs: { rel: 'stylesheet', href: '/styles.css' } },
  ],
});

// You can also use renderHeadTags() directly:
const headHtml = renderHeadTags([
  { tag: 'meta', attrs: { name: 'author', content: userName } },
  { tag: 'title', content: pageTitle },
]);
```

Each tag descriptor has the shape `{ tag, attrs?, content? }`:

| Field | Type | Description |
|-------|------|-------------|
| `tag` | String | HTML tag name (`meta`, `link`, `title`, `script`, etc.) |
| `attrs` | Object | Key-value pairs for HTML attributes. All values are escaped |
| `content` | String | Text content for non-void elements (e.g., `<title>`). Escaped automatically |

Void elements (`meta`, `link`, `br`, etc.) are self-closed. Non-void elements include the `content` as text.

::: warning
The raw HTML string form of `head` should only contain developer-authored content — never user input. Use the array form or `renderHeadTags()` for any dynamic content.
:::

## Summary

| API | Description |
|-----|-------------|
| `renderToString(vnode)` | Synchronous render to HTML string |
| `renderPage(component, opts?)` | Full HTML page string |
| `renderToReadableStream(vnode, opts?)` | Streaming render to `ReadableStream` |
| `renderPageToStream(component, opts?)` | Full HTML page as `ReadableStream` |
| `withSSRContext(fn)` | Run SSR render in an isolated context for concurrent safety |
| `createSSRContext()` | Create a manual SSR context object |
| `renderHeadTags(tags)` | Render structured tag descriptors to safe HTML |
| `resetSSRIdCounter()` | Reset the global hydration marker ID counter (useful in tests) |
