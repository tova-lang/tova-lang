import { describe, test, expect } from 'bun:test';
import {
  renderToString, renderPage, renderToReadableStream, renderPageToStream, resetSSRIdCounter,
} from '../src/runtime/ssr.js';
import {
  tova_el, tova_fragment, ErrorBoundary, createSignal,
} from '../src/runtime/reactivity.js';

// Helper to read a ReadableStream to string
async function streamToString(stream) {
  const reader = stream.getReader();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += value;
  }
  return result;
}

describe('SSR — renderToString', () => {
  test('renders null to empty string', () => {
    expect(renderToString(null)).toBe('');
  });

  test('renders string with escaping', () => {
    expect(renderToString('<b>hi</b>')).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });

  test('renders element', () => {
    const vnode = tova_el('div', { className: 'test' }, ['hello']);
    const html = renderToString(vnode);
    expect(html).toContain('<div');
    expect(html).toContain('class="test"');
    expect(html).toContain('hello');
    expect(html).toContain('</div>');
  });

  test('renders fragment', () => {
    const frag = tova_fragment([tova_el('span', {}, ['a']), tova_el('span', {}, ['b'])]);
    const html = renderToString(frag);
    expect(html).toContain('<span>a</span>');
    expect(html).toContain('<span>b</span>');
  });

  test('renders void elements self-closing', () => {
    const vnode = tova_el('br', {});
    expect(renderToString(vnode)).toBe('<br />');
  });

  test('renders reactive function values', () => {
    const vnode = tova_el('div', {}, [() => 'dynamic']);
    const html = renderToString(vnode);
    expect(html).toContain('dynamic');
  });
});

describe('SSR — hydration markers', () => {
  test('dynamic vnodes get SSR markers', () => {
    resetSSRIdCounter();
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => tova_el('span', {}, ['content']),
    };
    const html = renderToString(vnode);
    expect(html).toMatch(/<!--tova-s:\d+-->/);
    expect(html).toMatch(/<!--\/tova-s:\d+-->/);
    expect(html).toContain('<span>content</span>');
  });

  test('component name appears as data-tova-component', () => {
    resetSSRIdCounter();
    const vnode = tova_el('div', { className: 'wrapper' }, ['test']);
    vnode._componentName = 'MyComponent';
    const html = renderToString(vnode);
    expect(html).toContain('data-tova-component="MyComponent"');
  });
});

describe('SSR — error boundaries in renderToString', () => {
  test('error with _fallback renders fallback', () => {
    resetSSRIdCounter();
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      _fallback: ({ error }) => tova_el('div', { className: 'error' }, [error.message]),
      compute: () => { throw new Error('render failed'); },
    };
    const html = renderToString(vnode);
    expect(html).toContain('render failed');
    expect(html).toContain('class="error"');
  });

  test('error without boundary re-throws', () => {
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => { throw new Error('no boundary'); },
    };
    expect(() => renderToString(vnode)).toThrow('no boundary');
  });
});

describe('SSR — renderToReadableStream', () => {
  test('returns a ReadableStream', () => {
    const vnode = tova_el('div', {}, ['hello']);
    const stream = renderToReadableStream(vnode);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  test('sync vnodes produce same output as renderToString', async () => {
    resetSSRIdCounter();
    const vnode = tova_el('div', { className: 'test' }, [
      tova_el('span', {}, ['child']),
    ]);
    const stringResult = renderToString(vnode);

    resetSSRIdCounter();
    const stream = renderToReadableStream(tova_el('div', { className: 'test' }, [
      tova_el('span', {}, ['child']),
    ]));
    const streamResult = await streamToString(stream);

    expect(streamResult).toBe(stringResult);
  });

  test('error with boundary renders fallback in stream', async () => {
    resetSSRIdCounter();
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      _fallback: ({ error }) => tova_el('div', {}, ['fallback: ' + error.message]),
      compute: () => { throw new Error('stream error'); },
    };

    const stream = renderToReadableStream(vnode);
    const html = await streamToString(stream);
    expect(html).toContain('fallback: stream error');
  });

  test('error without boundary calls onError', async () => {
    let errorCaught = null;
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => { throw new Error('unhandled'); },
    };

    const stream = renderToReadableStream(vnode, {
      onError: (e) => { errorCaught = e; },
    });
    await streamToString(stream);
    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toBe('unhandled');
  });

  test('SSR markers present in stream output', async () => {
    resetSSRIdCounter();
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => tova_el('p', {}, ['dynamic']),
    };

    const stream = renderToReadableStream(vnode);
    const html = await streamToString(stream);
    expect(html).toMatch(/<!--tova-s:\d+-->/);
    expect(html).toMatch(/<!--\/tova-s:\d+-->/);
  });
});

describe('SSR — renderPageToStream', () => {
  test('produces valid HTML document', async () => {
    resetSSRIdCounter();
    const App = () => tova_el('h1', {}, ['Hello']);
    const stream = renderPageToStream(App, { title: 'Test Page' });
    const html = await streamToString(stream);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('<title>Test Page</title>');
    expect(html).toContain('<div id="app">');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('</div>');
    expect(html).toContain('</body>');
    expect(html).toContain('</html>');
  });

  test('includes script tag with custom src', async () => {
    resetSSRIdCounter();
    const App = () => tova_el('div', {}, ['app']);
    const stream = renderPageToStream(App, { scriptSrc: '/bundle.js' });
    const html = await streamToString(stream);
    expect(html).toContain('src="/bundle.js"');
  });

  test('onError called on stream error', async () => {
    let caught = null;
    const BadApp = () => { throw new Error('page error'); };
    const stream = renderPageToStream(BadApp, {
      onError: (e) => { caught = e; },
    });
    const html = await streamToString(stream);
    expect(caught).not.toBeNull();
    expect(caught.message).toBe('page error');
    // Should still produce valid wrapping HTML
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });
});
