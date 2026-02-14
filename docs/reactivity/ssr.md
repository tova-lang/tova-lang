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
| `head` | `''` | Extra HTML injected into `<head>` (stylesheets, meta tags) |
| `scriptSrc` | `'/client.js'` | Path to the client-side JavaScript bundle |

The output is a complete HTML document with the app rendered inside `<div id="app">`.

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
| `head` | `''` | Extra HTML for `<head>` |
| `scriptSrc` | `'/client.js'` | Client bundle path |
| `onError` | `undefined` | Error callback for unhandled stream errors |

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

## Summary

| API | Description |
|-----|-------------|
| `renderToString(vnode)` | Synchronous render to HTML string |
| `renderPage(component, opts?)` | Full HTML page string |
| `renderToReadableStream(vnode, opts?)` | Streaming render to `ReadableStream` |
| `renderPageToStream(component, opts?)` | Full HTML page as `ReadableStream` |
| `resetSSRIdCounter()` | Reset the hydration marker ID counter (useful in tests) |
