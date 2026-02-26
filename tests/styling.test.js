// Tests for all documented styling approaches.
// Validates: Tailwind classes, scoped CSS, class: directive, dynamic classes,
// show directive, inline styles, @font-face, @layer, @supports, :global(),
// string interpolation in classes, and style objects.

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BrowserCodegen } from '../src/codegen/browser-codegen.js';

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileBrowser(source) {
  return compile(source).browser;
}

// ─── Static Class Attribute ─────────────────────────────────

describe('Styling — Static class attribute', () => {
  test('static class compiles to className', () => {
    const result = compileBrowser('browser { component App { <div class="text-lg font-bold" /> } }');
    expect(result).toContain('className: "text-lg font-bold"');
  });

  test('Tailwind utility classes pass through', () => {
    const result = compileBrowser('browser { component App { <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all" /> } }');
    expect(result).toContain('bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all');
  });
});

// ─── Dynamic Class Expressions ──────────────────────────────

describe('Styling — Dynamic class={expr}', () => {
  test('dynamic class with signal wraps in reactive closure', () => {
    const result = compileBrowser('browser { state active = true\ncomponent App { <div class={if active { "bg-blue-500" } else { "bg-gray-500" }} /> } }');
    expect(result).toContain('className');
    expect(result).toContain('bg-blue-500');
    expect(result).toContain('bg-gray-500');
  });

  test('dynamic class with variable expression', () => {
    const result = compileBrowser('browser { component App {\ncls = "container"\n<div class={cls} /> } }');
    expect(result).toContain('className');
  });
});

// ─── String Interpolation in Class ──────────────────────────

describe('Styling — String interpolation in class', () => {
  test('template string in class attribute compiles to template literal', () => {
    const result = compileBrowser('browser { state size = "lg"\ncomponent App { <div class="text-{size} font-bold" /> } }');
    expect(result).toContain('className');
    expect(result).toContain('font-bold');
  });

  test('interpolation with variable in class', () => {
    const result = compileBrowser('browser { state color = "blue"\ncomponent App { <span class="px-2 py-1 text-{color}-500" /> } }');
    expect(result).toContain('className');
    expect(result).toContain('px-2 py-1');
  });
});

// ─── class: Directive ───────────────────────────────────────

describe('Styling — class: directive', () => {
  test('class:name generates conditional className', () => {
    const result = compileBrowser('browser { state active = true\ncomponent App { <div class:active={active} /> } }');
    expect(result).toContain('active()');
    expect(result).toContain('"active"');
    expect(result).toContain('filter(Boolean)');
    expect(result).toContain('join(" ")');
  });

  test('class:name merges with static class', () => {
    const result = compileBrowser('browser { state bold = true\ncomponent App { <div class="btn" class:bold={bold} /> } }');
    expect(result).toContain('"btn"');
    expect(result).toContain('"bold"');
    expect(result).toContain('filter(Boolean)');
  });

  test('multiple class: directives merge', () => {
    const result = compileBrowser('browser { state a = true\nstate b = false\ncomponent App { <div class:active={a} class:error={b} /> } }');
    expect(result).toContain('"active"');
    expect(result).toContain('"error"');
    expect(result).toContain('filter(Boolean)');
  });

  test('class: with static class and multiple conditions', () => {
    const result = compileBrowser('browser { state x = true\nstate y = false\ncomponent App { <div class="base" class:primary={x} class:disabled={y} /> } }');
    expect(result).toContain('"base"');
    expect(result).toContain('"primary"');
    expect(result).toContain('"disabled"');
  });
});

// ─── show Directive ─────────────────────────────────────────

describe('Styling — show directive', () => {
  test('show={expr} compiles to display toggle', () => {
    const result = compileBrowser('browser { state visible = true\ncomponent App { <div show={visible}>Hello</div> } }');
    expect(result).toContain('display');
    expect(result).toContain('none');
  });

  test('show with non-reactive expression', () => {
    const result = compileBrowser('browser { component App { <div show={true}>Always</div> } }');
    expect(result).toContain('display');
  });

  test('show with negated expression', () => {
    const result = compileBrowser('browser { state hidden = false\ncomponent App { <div show={not hidden}>Has items</div> } }');
    expect(result).toContain('display');
    expect(result).toContain('none');
  });
});

// ─── Inline Styles ──────────────────────────────────────────

describe('Styling — Inline styles', () => {
  test('static style string passes through', () => {
    const result = compileBrowser('browser { component App { <div style="color: red; font-size: 14px" /> } }');
    expect(result).toContain('style');
    expect(result).toContain('color: red');
  });

  test('style object expression compiles', () => {
    const result = compileBrowser('browser { component App { <div style={{ color: "red", fontSize: "14px" }} /> } }');
    expect(result).toContain('style');
    expect(result).toContain('color');
    expect(result).toContain('red');
  });

  test('reactive style object wraps in closure', () => {
    const result = compileBrowser('browser { state c = "red"\ncomponent App { <div style={{ color: c }} /> } }');
    expect(result).toContain('style');
    expect(result).toContain('color');
  });
});

// ─── Scoped CSS (style blocks) ──────────────────────────────

describe('Styling — Scoped CSS', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('basic selector is scoped', () => {
    const result = codegen._scopeCSS('.btn { background: blue; }', scope);
    expect(result).toContain('.btn[data-tova-test]');
    expect(result).toContain('background: blue;');
  });

  test(':hover pseudo-class is scoped correctly', () => {
    const result = codegen._scopeCSS('.btn:hover { background: darkblue; }', scope);
    expect(result).toContain('.btn[data-tova-test]:hover');
  });

  test(':focus pseudo-class is scoped correctly', () => {
    const result = codegen._scopeCSS('.input:focus { border-color: indigo; }', scope);
    expect(result).toContain('.input[data-tova-test]:focus');
  });

  test(':focus-visible is scoped correctly', () => {
    const result = codegen._scopeCSS('.btn:focus-visible { outline: 2px solid blue; }', scope);
    expect(result).toContain('.btn[data-tova-test]:focus-visible');
  });

  test('::before pseudo-element is scoped correctly', () => {
    const result = codegen._scopeCSS('.icon::before { content: "→"; }', scope);
    expect(result).toContain('.icon[data-tova-test]::before');
  });

  test('::after pseudo-element is scoped correctly', () => {
    const result = codegen._scopeCSS('.icon::after { content: ""; }', scope);
    expect(result).toContain('.icon[data-tova-test]::after');
  });

  test('::placeholder is scoped correctly', () => {
    const result = codegen._scopeCSS('.input::placeholder { color: #9ca3af; }', scope);
    expect(result).toContain('.input[data-tova-test]::placeholder');
  });

  test(':first-child pseudo-class is scoped', () => {
    const result = codegen._scopeCSS('li:first-child { border-top: none; }', scope);
    expect(result).toContain('li[data-tova-test]:first-child');
  });

  test(':nth-child() pseudo-function is handled', () => {
    const result = codegen._scopeCSS('tr:nth-child(2n) { background: #f9fafb; }', scope);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':nth-child(2n)');
  });

  test(':is() pseudo-function preserves inner selectors', () => {
    const result = codegen._scopeCSS('.card:is(.featured) { border-color: gold; }', scope);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':is(.featured)');
  });

  test(':where() pseudo-function preserves inner selectors', () => {
    const result = codegen._scopeCSS('.card:where(.featured) { border: 1px; }', scope);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':where(.featured)');
  });

  test(':has() pseudo-function preserves inner selectors', () => {
    const result = codegen._scopeCSS('.card:has(.image) { padding: 0; }', scope);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':has(.image)');
  });

  test(':not() pseudo-function preserves inner selectors', () => {
    const result = codegen._scopeCSS('.item:not(.disabled) { cursor: pointer; }', scope);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':not(.disabled)');
  });

  test('chained pseudo-classes are handled', () => {
    const result = codegen._scopeCSS('.btn:first-child:hover { opacity: 0.8; }', scope);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':first-child');
    expect(result).toContain(':hover');
  });

  test('comma-separated selectors are both scoped', () => {
    const result = codegen._scopeCSS('.a, .b { color: red; }', scope);
    expect(result).toContain('.a[data-tova-test]');
    expect(result).toContain('.b[data-tova-test]');
  });

  test('descendant selectors are scoped', () => {
    const result = codegen._scopeCSS('.parent .child { color: red; }', scope);
    expect(result).toContain('[data-tova-test]');
  });

  test('element selectors are scoped', () => {
    const result = codegen._scopeCSS('h1 { font-size: 2em; }', scope);
    expect(result).toContain('h1[data-tova-test]');
  });

  test('scope ID is deterministic', () => {
    const id1 = codegen._genScopeId('Card', '.card { padding: 16px; }');
    const id2 = codegen._genScopeId('Card', '.card { padding: 16px; }');
    expect(id1).toBe(id2);
  });

  test('different content produces different scope IDs', () => {
    const id1 = codegen._genScopeId('Card', '.card { padding: 16px; }');
    const id2 = codegen._genScopeId('Card', '.card { padding: 24px; }');
    expect(id1).not.toBe(id2);
  });
});

// ─── :global() Escape Hatch ─────────────────────────────────

describe('Styling — :global() escape hatch', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test(':global() selector is not scoped', () => {
    const result = codegen._scopeCSS(':global(body.modal-open) { overflow: hidden; }', scope);
    expect(result).toContain('body.modal-open');
    expect(result).not.toContain(':global');
    expect(result).not.toContain('body.modal-open[data-tova-test]');
  });

  test('inline :global() in compound selector', () => {
    const result = codegen._scopeCSS('.widget :global(.third-party) { color: red; }', scope);
    expect(result).toContain('.widget');
    expect(result).toContain('.third-party');
    expect(result).not.toContain(':global');
  });

  test(':global(html) is not scoped', () => {
    const result = codegen._scopeCSS(':global(html) { scroll-behavior: smooth; }', scope);
    expect(result).toContain('html');
    expect(result).not.toContain('html[data-tova-test]');
  });
});

// ─── @media Rules ───────────────────────────────────────────

describe('Styling — @media rules', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('selectors inside @media are scoped', () => {
    const result = codegen._scopeCSS('@media (max-width: 768px) { .sidebar { width: 100%; } }', scope);
    expect(result).toContain('@media (max-width: 768px)');
    expect(result).toContain('.sidebar[data-tova-test]');
  });

  test('multiple selectors inside @media are all scoped', () => {
    const result = codegen._scopeCSS('@media (min-width: 640px) { .a { color: red; } .b { color: blue; } }', scope);
    expect(result).toContain('.a[data-tova-test]');
    expect(result).toContain('.b[data-tova-test]');
  });
});

// ─── @keyframes Rules ───────────────────────────────────────

describe('Styling — @keyframes rules', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('from/to selectors inside @keyframes are NOT scoped', () => {
    const input = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('@keyframes spin');
    expect(result).not.toContain('from[data-tova-test]');
    expect(result).not.toContain('to[data-tova-test]');
    expect(result).toContain('from');
    expect(result).toContain('to');
  });

  test('percentage selectors inside @keyframes are NOT scoped', () => {
    const input = '@keyframes grow { 0% { width: 0; } 50% { width: 50%; } 100% { width: 100%; } }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).not.toContain('0%[data-tova-test]');
    expect(result).not.toContain('50%[data-tova-test]');
    expect(result).not.toContain('100%[data-tova-test]');
  });

  test('selector using the animation is scoped', () => {
    const input = '.spinner { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('.spinner[data-tova-test]');
    expect(result).not.toContain('from[data-tova-test]');
  });
});

// ─── @font-face Rules ───────────────────────────────────────

describe('Styling — @font-face rules', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('@font-face internals are NOT scoped', () => {
    const input = '@font-face { font-family: "CustomFont"; src: url("font.woff2") format("woff2"); }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('@font-face');
    expect(result).toContain('font-family: "CustomFont"');
    expect(result).not.toContain('[data-tova-test]');
  });

  test('@font-face followed by selector that uses font is scoped', () => {
    const input = '@font-face { font-family: "MyFont"; src: url("font.woff2"); } .heading { font-family: "MyFont", sans-serif; }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('@font-face');
    expect(result).toContain('.heading[data-tova-test]');
  });
});

// ─── @layer Rules ───────────────────────────────────────────

describe('Styling — @layer rules', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('selectors inside @layer are scoped', () => {
    const input = '@layer components { .card { border-radius: 12px; padding: 16px; } }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('@layer components');
    expect(result).toContain('.card[data-tova-test]');
  });

  test('multiple selectors inside @layer are scoped', () => {
    const input = '@layer base { .a { color: red; } .b { color: blue; } }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('.a[data-tova-test]');
    expect(result).toContain('.b[data-tova-test]');
  });
});

// ─── @supports Rules ────────────────────────────────────────

describe('Styling — @supports rules', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('selectors inside @supports are scoped', () => {
    const input = '@supports (backdrop-filter: blur(8px)) { .glass { backdrop-filter: blur(8px); background: rgba(255,255,255,0.8); } }';
    const result = codegen._scopeCSS(input, scope);
    expect(result).toContain('@supports');
    expect(result).toContain('.glass[data-tova-test]');
  });
});

// ─── CSS Comments ───────────────────────────────────────────

describe('Styling — CSS comments', () => {
  const codegen = new BrowserCodegen();
  const scope = '[data-tova-test]';

  test('comments are preserved through scoping', () => {
    const result = codegen._scopeCSS('/* Header styles */ .header { padding: 16px; }', scope);
    expect(result).toContain('/* Header styles */');
    expect(result).toContain('.header[data-tova-test]');
  });
});

// ─── Full Component Style Block (end-to-end) ────────────────

describe('Styling — Full component with style block (e2e)', () => {
  test('component with style block generates tova_inject_css', () => {
    const result = compileBrowser(`browser {
      component Card {
        <div class="card">Hello</div>
        style {
          .card { padding: 16px; border-radius: 8px; }
          .card:hover { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        }
      }
    }`);
    expect(result).toContain('tova_inject_css');
    expect(result).toContain('data-tova-');
    expect(result).toContain('.card');
    expect(result).toContain(':hover');
  });

  test('component with Tailwind classes and scoped style block', () => {
    const result = compileBrowser(`browser {
      component AnimatedCard(title) {
        <div class="bg-white rounded-2xl p-6 shadow-sm card">
          <h3 class="text-lg font-semibold">{title}</h3>
        </div>
        style {
          .card { animation: slideUp 0.3s ease-out; }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        }
      }
    }`);
    expect(result).toContain('tova_inject_css');
    expect(result).toContain('bg-white rounded-2xl p-6 shadow-sm');
    expect(result).toContain('text-lg font-semibold');
    expect(result).toContain('@keyframes slideUp');
  });

  test('component with class: directive and style block', () => {
    const result = compileBrowser(`browser {
      state active = false
      component Tab {
        <div class="tab" class:active={active}>Tab</div>
        style {
          .tab { padding: 8px 16px; cursor: pointer; }
          .active { background: blue; color: white; }
        }
      }
    }`);
    expect(result).toContain('tova_inject_css');
    expect(result).toContain('"tab"');
    expect(result).toContain('"active"');
    expect(result).toContain('filter(Boolean)');
  });
});

// ─── Combined Approaches ────────────────────────────────────

describe('Styling — Combined approaches', () => {
  test('show + static class on same element', () => {
    const result = compileBrowser('browser { state v = true\ncomponent App { <div class="card" show={v}>Content</div> } }');
    expect(result).toContain('display');
    expect(result).toContain('card');
  });

  test('class: directive + show on same element', () => {
    const result = compileBrowser('browser { state a = true\nstate v = true\ncomponent App { <div class:active={a} show={v}>X</div> } }');
    expect(result).toContain('"active"');
    expect(result).toContain('display');
  });

  test('static class + class: directive compile together', () => {
    const result = compileBrowser('browser { state on = true\ncomponent App { <button class="px-4 py-2 rounded" class:highlighted={on}>Go</button> } }');
    expect(result).toContain('"px-4 py-2 rounded"');
    expect(result).toContain('"highlighted"');
    expect(result).toContain('filter(Boolean)');
  });
});
