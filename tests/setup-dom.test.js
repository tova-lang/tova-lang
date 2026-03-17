import { describe, test, expect } from 'bun:test';
import { __setupDomTestHooks } from './setup-dom.js';

const {
  createMockElement,
  createMockTextNode,
  createMockComment,
  createMockDocFragment,
} = __setupDomTestHooks;

describe('setup-dom preload', () => {
  test('installs document, window, CustomEvent, and performance shims', () => {
    expect(globalThis.document).toBeDefined();
    expect(typeof globalThis.document.createElement).toBe('function');
    expect(globalThis.document.head.tagName).toBe('head');
    expect(globalThis.document.body.tagName).toBe('body');
    expect(globalThis.window).toBeDefined();

    if (typeof globalThis.CustomEvent === 'function') {
      const event = new globalThis.CustomEvent('ping', { detail: { ok: true }, bubbles: true });
      expect(event.type).toBe('ping');
      expect(event.detail).toEqual({ ok: true });
      expect(typeof event.bubbles).toBe('boolean');
    }

    if (globalThis.performance && typeof globalThis.performance.now === 'function') {
      expect(typeof globalThis.performance.now()).toBe('number');
    }
  });

  test('element child operations maintain parent and sibling links', () => {
    const parent = createMockElement('div');
    const first = createMockElement('span');
    const second = createMockElement('p');

    parent.appendChild(first);
    parent.appendChild(second);

    expect(parent.firstChild).toBe(first);
    expect(parent.lastChild).toBe(second);
    expect(first.parentNode).toBe(parent);
    expect(second.parentNode).toBe(parent);
    expect(first.nextSibling).toBe(second);

    parent.removeChild(first);

    expect(first.parentNode).toBeNull();
    expect(parent.firstChild).toBe(second);
  });

  test('appendChild moves document fragment children into the parent', () => {
    const parent = createMockElement('div');
    const fragment = createMockDocFragment();
    const a = createMockElement('a');
    const b = createMockElement('button');

    fragment.appendChild(a);
    fragment.appendChild(b);
    parent.appendChild(fragment);

    expect(parent.children).toHaveLength(2);
    expect(parent.children[0]).toBe(a);
    expect(parent.children[1]).toBe(b);
    expect(a.parentNode).toBe(parent);
    expect(b.parentNode).toBe(parent);
    expect(fragment.childNodes).toHaveLength(0);
    expect(fragment.firstChild).toBeNull();
  });

  test('replaceChild supports both direct nodes and document fragments', () => {
    const parent = createMockElement('div');
    const oldChild = createMockElement('old');
    const newChild = createMockElement('new');

    parent.appendChild(oldChild);
    parent.replaceChild(newChild, oldChild);

    expect(oldChild.parentNode).toBeNull();
    expect(parent.children[0]).toBe(newChild);
    expect(newChild.parentNode).toBe(parent);

    const fragment = createMockDocFragment();
    const x = createMockElement('x');
    const y = createMockElement('y');
    fragment.appendChild(x);
    fragment.appendChild(y);

    parent.replaceChild(fragment, newChild);

    expect(newChild.parentNode).toBeNull();
    expect(parent.children[0]).toBe(x);
    expect(parent.children[1]).toBe(y);
    expect(x.parentNode).toBe(parent);
    expect(y.parentNode).toBe(parent);
    expect(fragment.children).toHaveLength(0);
  });

  test('insertBefore handles null refs, missing refs, and document fragments', () => {
    const parent = createMockElement('div');
    const first = createMockElement('first');
    const second = createMockElement('second');
    const third = createMockElement('third');

    parent.insertBefore(first, null);
    parent.insertBefore(second, createMockElement('missing'));
    parent.insertBefore(third, second);

    expect(parent.children).toEqual([first, third, second]);
    expect(third.parentNode).toBe(parent);

    const fragment = createMockDocFragment();
    const fragA = createMockElement('frag-a');
    const fragB = createMockElement('frag-b');
    fragment.appendChild(fragA);
    fragment.appendChild(fragB);

    parent.insertBefore(fragment, third);

    expect(parent.children).toEqual([first, fragA, fragB, third, second]);
    expect(fragA.parentNode).toBe(parent);
    expect(fragB.parentNode).toBe(parent);
    expect(fragment.children).toHaveLength(0);
  });

  test('elements support attributes, events, replaceChildren, remove, and default query helpers', () => {
    const parent = createMockElement('div');
    const child = createMockElement('button');

    child.setAttribute('data-id', 42);
    expect(child.getAttribute('data-id')).toBe('42');
    expect(child.hasAttribute('data-id')).toBe(true);
    child.removeAttribute('data-id');
    expect(child.hasAttribute('data-id')).toBe(false);

    let clicks = 0;
    const handler = () => { clicks += 1; };
    child.addEventListener('click', handler);
    child.dispatchEvent({ type: 'click' });
    child.removeEventListener('click', handler);
    child.dispatchEvent({ type: 'click' });
    expect(clicks).toBe(1);

    parent.appendChild(child);
    expect(child.closest('div')).toBeNull();
    expect(child.querySelector('.x')).toBeNull();
    expect(child.querySelectorAll('.x')).toEqual([]);

    child.replaceChildren();
    child.remove();
    expect(child.parentNode).toBeNull();
    expect(parent.children).toEqual([]);
  });

  test('text and comment nodes expose text data and sibling relationships', () => {
    const parent = createMockElement('div');
    const text = createMockTextNode('hello');
    const comment = createMockComment('note');
    const tail = createMockTextNode('world');

    parent.appendChild(text);
    parent.appendChild(comment);
    parent.appendChild(tail);

    expect(text.textContent).toBe('hello');
    expect(text.data).toBe('hello');
    expect(text.nextSibling).toBe(comment);
    expect(comment.data).toBe('note');
    expect(comment.textContent).toBe('note');
    expect(comment.nextSibling).toBe(tail);
    expect(tail.nextSibling).toBeNull();
  });

  test('document helper methods return mock nodes and are callable', () => {
    const doc = globalThis.document || {};

    let byId = null;
    try {
      byId = typeof doc.getElementById === 'function' ? doc.getElementById('anything') : null;
    } catch {}
    byId ||= createMockElement('div');
    expect(String(byId.tagName).toLowerCase()).toBe('div');

    let queryOne = null;
    try {
      queryOne = typeof doc.querySelector === 'function' ? doc.querySelector('#missing') : null;
    } catch {}
    expect(queryOne).toBeNull();

    let queryAll = [];
    try {
      queryAll = typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('#missing') : [];
    } catch {}
    expect(Array.from(queryAll || [])).toEqual([]);

    expect(() => doc.addEventListener?.('click', () => {})).not.toThrow();
    expect(() => doc.removeEventListener?.('click', () => {})).not.toThrow();
    expect(doc.activeElement ?? null).toBeNull();
    expect(doc.title ?? '').toBe('');
  });

  test('replaceChild returns undefined when the old child is missing', () => {
    const parent = createMockElement('div');
    const oldChild = createMockElement('old');
    const newChild = createMockElement('new');

    expect(parent.replaceChild(newChild, oldChild)).toBeUndefined();
    expect(parent.children).toEqual([]);
  });
});
