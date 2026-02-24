// Tests that JSX elements render as their equivalent HTML elements.
// Uses both SSR (renderToString) for exact HTML output verification
// and DOM render() for runtime property verification.

import { describe, test, expect } from 'bun:test';
import { tova_el, tova_fragment } from '../src/runtime/reactivity.js';
import { renderToString } from '../src/runtime/ssr.js';

// ─── Block-level Elements ───────────────────────────────────

describe('HTML Elements — Block-level', () => {
  test('div renders as <div>', () => {
    expect(renderToString(tova_el('div', {}, ['content']))).toBe('<div>content</div>');
  });

  test('p renders as <p>', () => {
    expect(renderToString(tova_el('p', {}, ['paragraph']))).toBe('<p>paragraph</p>');
  });

  test('h1 renders as <h1>', () => {
    expect(renderToString(tova_el('h1', {}, ['Title']))).toBe('<h1>Title</h1>');
  });

  test('h2 renders as <h2>', () => {
    expect(renderToString(tova_el('h2', {}, ['Subtitle']))).toBe('<h2>Subtitle</h2>');
  });

  test('h3 renders as <h3>', () => {
    expect(renderToString(tova_el('h3', {}, ['Section']))).toBe('<h3>Section</h3>');
  });

  test('h4 renders as <h4>', () => {
    expect(renderToString(tova_el('h4', {}, ['Sub']))).toBe('<h4>Sub</h4>');
  });

  test('h5 renders as <h5>', () => {
    expect(renderToString(tova_el('h5', {}, ['Minor']))).toBe('<h5>Minor</h5>');
  });

  test('h6 renders as <h6>', () => {
    expect(renderToString(tova_el('h6', {}, ['Smallest']))).toBe('<h6>Smallest</h6>');
  });

  test('blockquote renders as <blockquote>', () => {
    expect(renderToString(tova_el('blockquote', {}, ['Quote']))).toBe('<blockquote>Quote</blockquote>');
  });

  test('pre renders as <pre>', () => {
    expect(renderToString(tova_el('pre', {}, ['code here']))).toBe('<pre>code here</pre>');
  });
});

// ─── Semantic / Sectioning Elements ─────────────────────────

describe('HTML Elements — Semantic / Sectioning', () => {
  test('nav renders as <nav>', () => {
    expect(renderToString(tova_el('nav', {}, ['links']))).toBe('<nav>links</nav>');
  });

  test('main renders as <main>', () => {
    expect(renderToString(tova_el('main', {}, ['content']))).toBe('<main>content</main>');
  });

  test('section renders as <section>', () => {
    expect(renderToString(tova_el('section', {}, ['sect']))).toBe('<section>sect</section>');
  });

  test('header renders as <header>', () => {
    expect(renderToString(tova_el('header', {}, ['top']))).toBe('<header>top</header>');
  });

  test('footer renders as <footer>', () => {
    expect(renderToString(tova_el('footer', {}, ['bottom']))).toBe('<footer>bottom</footer>');
  });

  test('article renders as <article>', () => {
    expect(renderToString(tova_el('article', {}, ['post']))).toBe('<article>post</article>');
  });

  test('aside renders as <aside>', () => {
    expect(renderToString(tova_el('aside', {}, ['side']))).toBe('<aside>side</aside>');
  });
});

// ─── Inline Elements ────────────────────────────────────────

describe('HTML Elements — Inline', () => {
  test('span renders as <span>', () => {
    expect(renderToString(tova_el('span', {}, ['text']))).toBe('<span>text</span>');
  });

  test('a with href renders as <a href="...">', () => {
    expect(renderToString(tova_el('a', { href: '/about' }, ['About']))).toBe('<a href="/about">About</a>');
  });

  test('strong renders as <strong>', () => {
    expect(renderToString(tova_el('strong', {}, ['bold']))).toBe('<strong>bold</strong>');
  });

  test('em renders as <em>', () => {
    expect(renderToString(tova_el('em', {}, ['italic']))).toBe('<em>italic</em>');
  });

  test('b renders as <b>', () => {
    expect(renderToString(tova_el('b', {}, ['bold']))).toBe('<b>bold</b>');
  });

  test('i renders as <i>', () => {
    expect(renderToString(tova_el('i', {}, ['italic']))).toBe('<i>italic</i>');
  });

  test('code renders as <code>', () => {
    expect(renderToString(tova_el('code', {}, ['x = 1']))).toBe('<code>x = 1</code>');
  });

  test('small renders as <small>', () => {
    expect(renderToString(tova_el('small', {}, ['fine print']))).toBe('<small>fine print</small>');
  });

  test('mark renders as <mark>', () => {
    expect(renderToString(tova_el('mark', {}, ['highlighted']))).toBe('<mark>highlighted</mark>');
  });

  test('abbr with title renders correctly', () => {
    expect(renderToString(tova_el('abbr', { title: 'HyperText Markup Language' }, ['HTML']))).toBe('<abbr title="HyperText Markup Language">HTML</abbr>');
  });

  test('time renders as <time>', () => {
    expect(renderToString(tova_el('time', { datetime: '2026-01-01' }, ['Jan 1']))).toBe('<time datetime="2026-01-01">Jan 1</time>');
  });
});

// ─── List Elements ──────────────────────────────────────────

describe('HTML Elements — Lists', () => {
  test('ul with li children', () => {
    const vnode = tova_el('ul', {}, [
      tova_el('li', {}, ['Item 1']),
      tova_el('li', {}, ['Item 2']),
    ]);
    expect(renderToString(vnode)).toBe('<ul><li>Item 1</li><li>Item 2</li></ul>');
  });

  test('ol with li children', () => {
    const vnode = tova_el('ol', {}, [
      tova_el('li', {}, ['First']),
      tova_el('li', {}, ['Second']),
    ]);
    expect(renderToString(vnode)).toBe('<ol><li>First</li><li>Second</li></ol>');
  });

  test('dl with dt and dd', () => {
    const vnode = tova_el('dl', {}, [
      tova_el('dt', {}, ['Term']),
      tova_el('dd', {}, ['Definition']),
    ]);
    expect(renderToString(vnode)).toBe('<dl><dt>Term</dt><dd>Definition</dd></dl>');
  });
});

// ─── Table Elements ─────────────────────────────────────────

describe('HTML Elements — Tables', () => {
  test('table with thead, tbody, tr, th, td', () => {
    const vnode = tova_el('table', {}, [
      tova_el('thead', {}, [
        tova_el('tr', {}, [
          tova_el('th', {}, ['Name']),
          tova_el('th', {}, ['Age']),
        ]),
      ]),
      tova_el('tbody', {}, [
        tova_el('tr', {}, [
          tova_el('td', {}, ['Alice']),
          tova_el('td', {}, ['30']),
        ]),
      ]),
    ]);
    expect(renderToString(vnode)).toBe(
      '<table><thead><tr><th>Name</th><th>Age</th></tr></thead><tbody><tr><td>Alice</td><td>30</td></tr></tbody></table>'
    );
  });

  test('table with caption', () => {
    const vnode = tova_el('table', {}, [
      tova_el('caption', {}, ['Results']),
      tova_el('tr', {}, [tova_el('td', {}, ['data'])]),
    ]);
    expect(renderToString(vnode)).toBe('<table><caption>Results</caption><tr><td>data</td></tr></table>');
  });

  test('th with colspan', () => {
    const vnode = tova_el('th', { colspan: '2' }, ['Merged']);
    expect(renderToString(vnode)).toBe('<th colspan="2">Merged</th>');
  });
});

// ─── Form Elements ──────────────────────────────────────────

describe('HTML Elements — Forms', () => {
  test('form with action and method', () => {
    expect(renderToString(tova_el('form', { action: '/submit', method: 'post' }, []))).toBe('<form action="/submit" method="post"></form>');
  });

  test('input type text with placeholder', () => {
    expect(renderToString(tova_el('input', { type: 'text', placeholder: 'Enter name' }, []))).toBe('<input type="text" placeholder="Enter name" />');
  });

  test('input type email', () => {
    expect(renderToString(tova_el('input', { type: 'email', name: 'email' }, []))).toBe('<input type="email" name="email" />');
  });

  test('input type password', () => {
    expect(renderToString(tova_el('input', { type: 'password' }, []))).toBe('<input type="password" />');
  });

  test('input type number with min/max', () => {
    expect(renderToString(tova_el('input', { type: 'number', min: '0', max: '100' }, []))).toBe('<input type="number" min="0" max="100" />');
  });

  test('input type checkbox (checked)', () => {
    expect(renderToString(tova_el('input', { type: 'checkbox', checked: true }, []))).toBe('<input type="checkbox" checked />');
  });

  test('input type checkbox (unchecked)', () => {
    expect(renderToString(tova_el('input', { type: 'checkbox', checked: false }, []))).toBe('<input type="checkbox" />');
  });

  test('input type radio with name and value', () => {
    expect(renderToString(tova_el('input', { type: 'radio', name: 'color', value: 'red' }, []))).toBe('<input type="radio" name="color" value="red" />');
  });

  test('input with value attribute', () => {
    expect(renderToString(tova_el('input', { type: 'text', value: 'hello' }, []))).toBe('<input type="text" value="hello" />');
  });

  test('textarea renders as <textarea>', () => {
    expect(renderToString(tova_el('textarea', { rows: '4', cols: '50' }, ['Default text']))).toBe('<textarea rows="4" cols="50">Default text</textarea>');
  });

  test('select with options', () => {
    const vnode = tova_el('select', { name: 'fruit' }, [
      tova_el('option', { value: 'apple' }, ['Apple']),
      tova_el('option', { value: 'banana', selected: true }, ['Banana']),
    ]);
    expect(renderToString(vnode)).toBe('<select name="fruit"><option value="apple">Apple</option><option value="banana" selected>Banana</option></select>');
  });

  test('label with for attribute', () => {
    expect(renderToString(tova_el('label', { for: 'name' }, ['Name:']))).toBe('<label for="name">Name:</label>');
  });

  test('button with type submit', () => {
    expect(renderToString(tova_el('button', { type: 'submit' }, ['Submit']))).toBe('<button type="submit">Submit</button>');
  });

  test('fieldset and legend', () => {
    const vnode = tova_el('fieldset', {}, [
      tova_el('legend', {}, ['Settings']),
      tova_el('input', { type: 'text' }, []),
    ]);
    expect(renderToString(vnode)).toBe('<fieldset><legend>Settings</legend><input type="text" /></fieldset>');
  });
});

// ─── Self-Closing (Void) Elements ───────────────────────────

describe('HTML Elements — Void / Self-closing', () => {
  test('br renders as <br />', () => {
    expect(renderToString(tova_el('br', {}, []))).toBe('<br />');
  });

  test('hr renders as <hr />', () => {
    expect(renderToString(tova_el('hr', {}, []))).toBe('<hr />');
  });

  test('img with src and alt renders as <img />', () => {
    expect(renderToString(tova_el('img', { src: '/logo.png', alt: 'Logo' }, []))).toBe('<img src="/logo.png" alt="Logo" />');
  });

  test('input renders as <input />', () => {
    expect(renderToString(tova_el('input', { type: 'text' }, []))).toBe('<input type="text" />');
  });

  test('meta renders as <meta />', () => {
    expect(renderToString(tova_el('meta', { charset: 'utf-8' }, []))).toBe('<meta charset="utf-8" />');
  });

  test('link renders as <link />', () => {
    expect(renderToString(tova_el('link', { rel: 'stylesheet', href: '/style.css' }, []))).toBe('<link rel="stylesheet" href="/style.css" />');
  });

  test('source renders as <source />', () => {
    expect(renderToString(tova_el('source', { src: '/video.mp4', type: 'video/mp4' }, []))).toBe('<source src="/video.mp4" type="video/mp4" />');
  });

  test('embed renders as <embed />', () => {
    expect(renderToString(tova_el('embed', { src: '/widget.html' }, []))).toBe('<embed src="/widget.html" />');
  });

  test('wbr renders as <wbr />', () => {
    expect(renderToString(tova_el('wbr', {}, []))).toBe('<wbr />');
  });

  test('col renders as <col />', () => {
    expect(renderToString(tova_el('col', { span: '2' }, []))).toBe('<col span="2" />');
  });
});

// ─── Media Elements ─────────────────────────────────────────

describe('HTML Elements — Media', () => {
  test('video with attributes', () => {
    const html = renderToString(tova_el('video', { src: '/vid.mp4' }, []));
    expect(html).toBe('<video src="/vid.mp4"></video>');
  });

  test('audio with attributes', () => {
    const html = renderToString(tova_el('audio', { src: '/audio.mp3' }, []));
    expect(html).toBe('<audio src="/audio.mp3"></audio>');
  });

  test('canvas with dimensions', () => {
    expect(renderToString(tova_el('canvas', { width: '400', height: '300' }, []))).toBe('<canvas width="400" height="300"></canvas>');
  });

  test('iframe with src', () => {
    expect(renderToString(tova_el('iframe', { src: 'https://example.com', width: '600', height: '400' }, []))).toBe('<iframe src="https://example.com" width="600" height="400"></iframe>');
  });
});

// ─── Interactive / Disclosure Elements ───────────────────────

describe('HTML Elements — Interactive', () => {
  test('details and summary', () => {
    const vnode = tova_el('details', {}, [
      tova_el('summary', {}, ['Click to expand']),
      tova_el('p', {}, ['Hidden content']),
    ]);
    expect(renderToString(vnode)).toBe('<details><summary>Click to expand</summary><p>Hidden content</p></details>');
  });

  test('dialog renders as <dialog>', () => {
    expect(renderToString(tova_el('dialog', {}, ['Modal content']))).toBe('<dialog>Modal content</dialog>');
  });

  test('progress with value and max', () => {
    expect(renderToString(tova_el('progress', { value: '70', max: '100' }, []))).toBe('<progress value="70" max="100"></progress>');
  });

  test('meter with value, min, max', () => {
    expect(renderToString(tova_el('meter', { value: '0.6', min: '0', max: '1' }, []))).toBe('<meter value="0.6" min="0" max="1"></meter>');
  });
});

// ─── Attributes ─────────────────────────────────────────────

describe('HTML Attributes — class/className', () => {
  test('className renders as class attribute', () => {
    expect(renderToString(tova_el('div', { className: 'container' }, []))).toBe('<div class="container"></div>');
  });

  test('multiple classes in className', () => {
    expect(renderToString(tova_el('div', { className: 'flex items-center gap-2' }, []))).toBe('<div class="flex items-center gap-2"></div>');
  });

  test('reactive className evaluates function', () => {
    expect(renderToString(tova_el('div', { className: () => 'dynamic-class' }, []))).toBe('<div class="dynamic-class"></div>');
  });
});

describe('HTML Attributes — Boolean attributes', () => {
  test('disabled=true renders as disabled', () => {
    expect(renderToString(tova_el('button', { disabled: true }, ['No']))).toBe('<button disabled>No</button>');
  });

  test('disabled=false omits the attribute', () => {
    expect(renderToString(tova_el('button', { disabled: false }, ['Yes']))).toBe('<button>Yes</button>');
  });

  test('checked=true renders as checked', () => {
    expect(renderToString(tova_el('input', { type: 'checkbox', checked: true }, []))).toBe('<input type="checkbox" checked />');
  });

  test('readonly=true renders as readonly', () => {
    expect(renderToString(tova_el('input', { readonly: true, value: 'fixed' }, []))).toBe('<input readonly value="fixed" />');
  });

  test('selected=true renders as selected', () => {
    expect(renderToString(tova_el('option', { value: 'a', selected: true }, ['A']))).toBe('<option value="a" selected>A</option>');
  });
});

describe('HTML Attributes — style', () => {
  test('style object renders as CSS string', () => {
    expect(renderToString(tova_el('div', { style: { color: 'red', fontSize: '16px' } }, []))).toBe('<div style="color:red;font-size:16px"></div>');
  });

  test('style with camelCase converts to kebab-case', () => {
    expect(renderToString(tova_el('div', { style: { backgroundColor: '#fff', borderRadius: '8px' } }, []))).toBe('<div style="background-color:#fff;border-radius:8px"></div>');
  });

  test('style with multiple properties', () => {
    const result = renderToString(tova_el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, []));
    expect(result).toContain('display:flex');
    expect(result).toContain('align-items:center');
    expect(result).toContain('gap:8px');
  });
});

describe('HTML Attributes — data-* and aria-*', () => {
  test('data-* attributes render correctly', () => {
    expect(renderToString(tova_el('div', { 'data-id': '42', 'data-role': 'item' }, []))).toBe('<div data-id="42" data-role="item"></div>');
  });

  test('aria-* attributes render correctly', () => {
    expect(renderToString(tova_el('button', { 'aria-label': 'Close', 'aria-hidden': 'false' }, ['X']))).toBe('<button aria-label="Close" aria-hidden="false">X</button>');
  });

  test('role attribute renders correctly', () => {
    expect(renderToString(tova_el('div', { role: 'navigation' }, []))).toBe('<div role="navigation"></div>');
  });
});

describe('HTML Attributes — Common', () => {
  test('id attribute', () => {
    expect(renderToString(tova_el('div', { id: 'main' }, []))).toBe('<div id="main"></div>');
  });

  test('title attribute', () => {
    expect(renderToString(tova_el('span', { title: 'Tooltip text' }, ['Hover me']))).toBe('<span title="Tooltip text">Hover me</span>');
  });

  test('href on anchor', () => {
    expect(renderToString(tova_el('a', { href: 'https://example.com', target: '_blank' }, ['Link']))).toBe('<a href="https://example.com" target="_blank">Link</a>');
  });

  test('src and alt on img', () => {
    expect(renderToString(tova_el('img', { src: '/photo.jpg', alt: 'A photo' }, []))).toBe('<img src="/photo.jpg" alt="A photo" />');
  });

  test('tabindex attribute', () => {
    expect(renderToString(tova_el('div', { tabindex: '0' }, []))).toBe('<div tabindex="0"></div>');
  });
});

describe('HTML Attributes — Event handlers are omitted in SSR', () => {
  test('onClick is not rendered', () => {
    expect(renderToString(tova_el('button', { onClick: () => {} }, ['Click']))).toBe('<button>Click</button>');
  });

  test('onInput is not rendered', () => {
    expect(renderToString(tova_el('input', { type: 'text', onInput: () => {} }, []))).toBe('<input type="text" />');
  });

  test('onSubmit is not rendered', () => {
    expect(renderToString(tova_el('form', { onSubmit: () => {} }, []))).toBe('<form></form>');
  });
});

describe('HTML Attributes — key and ref are omitted', () => {
  test('key is not rendered', () => {
    expect(renderToString(tova_el('div', { key: 'item-1' }, ['hi']))).toBe('<div>hi</div>');
  });

  test('ref is not rendered', () => {
    expect(renderToString(tova_el('div', { ref: {} }, ['hi']))).toBe('<div>hi</div>');
  });
});

// ─── Nesting and Children ───────────────────────────────────

describe('HTML Rendering — Nesting', () => {
  test('deeply nested elements', () => {
    const vnode = tova_el('div', {}, [
      tova_el('header', {}, [
        tova_el('h1', {}, ['Title']),
      ]),
      tova_el('main', {}, [
        tova_el('p', {}, ['Hello']),
      ]),
    ]);
    expect(renderToString(vnode)).toBe('<div><header><h1>Title</h1></header><main><p>Hello</p></main></div>');
  });

  test('mixed text and element children', () => {
    const vnode = tova_el('p', {}, ['Hello ', tova_el('strong', {}, ['world']), '!']);
    expect(renderToString(vnode)).toBe('<p>Hello <strong>world</strong>!</p>');
  });

  test('empty element renders open and close tags', () => {
    expect(renderToString(tova_el('div', {}, []))).toBe('<div></div>');
  });

  test('fragment children render inline without wrapper', () => {
    const frag = tova_fragment([
      tova_el('span', {}, ['a']),
      tova_el('span', {}, ['b']),
    ]);
    expect(renderToString(frag)).toBe('<span>a</span><span>b</span>');
  });

  test('number children convert to string', () => {
    expect(renderToString(tova_el('span', {}, [42]))).toBe('<span>42</span>');
  });

  test('null/undefined children are empty', () => {
    expect(renderToString(tova_el('div', {}, [null, undefined, 'text']))).toBe('<div>text</div>');
  });

  test('boolean children render as text in Tova', () => {
    // Unlike React, Tova renders boolean children as their string representation
    expect(renderToString(tova_el('div', {}, [true, false, 'text']))).toBe('<div>truefalsetext</div>');
  });
});

// ─── HTML Escaping ──────────────────────────────────────────

describe('HTML Rendering — Escaping', () => {
  test('text content is escaped', () => {
    expect(renderToString('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('attribute values are escaped', () => {
    expect(renderToString(tova_el('div', { title: 'a"b&c' }, []))).toBe('<div title="a&quot;b&amp;c"></div>');
  });

  test('className with special characters is escaped', () => {
    expect(renderToString(tova_el('div', { className: 'a"b' }, []))).toBe('<div class="a&quot;b"></div>');
  });
});

// Note: DOM render() tests are covered by runtime.test.js which has a proper DOM mock.

// ─── Realistic Component Structures ─────────────────────────

describe('HTML Rendering — Realistic layouts', () => {
  test('navigation bar', () => {
    const vnode = tova_el('nav', { className: 'bg-white border-b' }, [
      tova_el('div', { className: 'max-w-5xl mx-auto flex items-center' }, [
        tova_el('a', { href: '/', className: 'font-bold' }, ['Home']),
        tova_el('a', { href: '/about' }, ['About']),
      ]),
    ]);
    const html = renderToString(vnode);
    expect(html).toContain('<nav class="bg-white border-b">');
    expect(html).toContain('<a href="/" class="font-bold">Home</a>');
    expect(html).toContain('<a href="/about">About</a>');
  });

  test('card component structure', () => {
    const vnode = tova_el('div', { className: 'bg-white rounded-xl p-6 shadow-sm' }, [
      tova_el('h3', { className: 'text-lg font-semibold' }, ['Card Title']),
      tova_el('p', { className: 'text-gray-500' }, ['Card description']),
      tova_el('button', { className: 'mt-4 px-4 py-2 bg-indigo-600 text-white rounded' }, ['Action']),
    ]);
    const html = renderToString(vnode);
    expect(html).toContain('<div class="bg-white rounded-xl p-6 shadow-sm">');
    expect(html).toContain('<h3 class="text-lg font-semibold">Card Title</h3>');
    expect(html).toContain('<button class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded">Action</button>');
  });

  test('form with inputs and labels', () => {
    const vnode = tova_el('form', { action: '/login', method: 'post' }, [
      tova_el('div', {}, [
        tova_el('label', { for: 'email' }, ['Email']),
        tova_el('input', { type: 'email', id: 'email', name: 'email', placeholder: 'you@example.com' }, []),
      ]),
      tova_el('div', {}, [
        tova_el('label', { for: 'password' }, ['Password']),
        tova_el('input', { type: 'password', id: 'password', name: 'password' }, []),
      ]),
      tova_el('button', { type: 'submit', disabled: false }, ['Log in']),
    ]);
    const html = renderToString(vnode);
    expect(html).toContain('<form action="/login" method="post">');
    expect(html).toContain('<label for="email">Email</label>');
    expect(html).toContain('<input type="email" id="email" name="email" placeholder="you@example.com" />');
    expect(html).toContain('<input type="password" id="password" name="password" />');
    expect(html).toContain('<button type="submit">Log in</button>');
  });

  test('table with data rows', () => {
    const vnode = tova_el('table', { className: 'min-w-full' }, [
      tova_el('thead', {}, [
        tova_el('tr', {}, [
          tova_el('th', {}, ['ID']),
          tova_el('th', {}, ['Name']),
          tova_el('th', {}, ['Status']),
        ]),
      ]),
      tova_el('tbody', {}, [
        tova_el('tr', {}, [
          tova_el('td', {}, ['1']),
          tova_el('td', {}, ['Alice']),
          tova_el('td', {}, [tova_el('span', { className: 'text-green-600' }, ['Active'])]),
        ]),
        tova_el('tr', {}, [
          tova_el('td', {}, ['2']),
          tova_el('td', {}, ['Bob']),
          tova_el('td', {}, [tova_el('span', { className: 'text-red-600' }, ['Inactive'])]),
        ]),
      ]),
    ]);
    const html = renderToString(vnode);
    expect(html).toContain('<table class="min-w-full">');
    expect(html).toContain('<th>ID</th><th>Name</th><th>Status</th>');
    expect(html).toContain('<td>1</td><td>Alice</td><td><span class="text-green-600">Active</span></td>');
  });
});
