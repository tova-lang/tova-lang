import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function genClient(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().client || '';
}

// ═══════════════════════════════════════════════════════════
// use: action directive codegen tests
// ═══════════════════════════════════════════════════════════

describe('use: action directives', () => {

  // ─── Boolean (no param) ──────────────────────────────────
  test('use:tooltip (boolean) generates __tova_action with undefined param', () => {
    const code = genClient(`
      client {
        component App() {
          <div use:tooltip />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    expect(code).toContain('tooltip');
    expect(code).toContain('undefined');
    // Should contain: __tova_action(tova_el("div", {}), tooltip, undefined)
    expect(code).toContain('__tova_action(tova_el("div", {}), tooltip, undefined)');
  });

  // ─── With non-reactive param (plain variable) ───────────
  test('use:tooltip={text} with plain var generates __tova_action with identifier param', () => {
    const code = genClient(`
      client {
        component App() {
          text = "hello"
          <div use:tooltip={text} />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    expect(code).toContain('tooltip');
    // text is a plain variable (not state), so param is just text (no arrow wrapper)
    expect(code).toContain(', tooltip, text)');
    // Should NOT wrap in () => since text is not reactive
    expect(code).not.toContain('() => text');
  });

  // ─── Runtime import includes __tova_action ──────────────
  test('__tova_action appears in runtime import line', () => {
    const code = genClient(`
      client {
        component App() {
          <div use:tooltip />
        }
      }
    `);
    // The import line from runtime/reactivity.js should include __tova_action
    const importLine = code.split('\n').find(line => line.includes('from') && line.includes('reactivity'));
    expect(importLine).toBeDefined();
    expect(importLine).toContain('__tova_action');
  });

  // ─── Multiple use: directives on same element ───────────
  test('multiple use: directives on same element wrap nested', () => {
    const code = genClient(`
      client {
        component App() {
          <div use:tooltip use:draggable />
        }
      }
    `);
    // Both actions should appear
    expect(code).toContain('__tova_action');
    expect(code).toContain('tooltip');
    expect(code).toContain('draggable');
    // Should be nested: __tova_action(__tova_action(<vnode>, tooltip, undefined), draggable, undefined)
    // Count occurrences of __tova_action — should be at least 2 (one per directive)
    const actionCount = (code.match(/__tova_action\(/g) || []).length;
    expect(actionCount).toBeGreaterThanOrEqual(2);
  });

  // ─── Reactive param wraps in () => ──────────────────────
  test('use:action with reactive param (state) wraps param in () =>', () => {
    const code = genClient(`
      client {
        component App() {
          state text = "hello"
          <div use:tooltip={text} />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    // text is a state variable, so genExpression yields text() and it gets wrapped in () =>
    // Result: __tova_action(<vnode>, tooltip, () => text())
    expect(code).toContain(', tooltip, () => text())');
  });

  // ─── Reactive param with expression ─────────────────────
  test('use:action with reactive expression wraps in () =>', () => {
    const code = genClient(`
      client {
        component App() {
          state count = 0
          <div use:highlight={count + 1} />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    expect(code).toContain('highlight');
    // count is state, so count + 1 is reactive and should be wrapped in () =>
    expect(code).toContain('() => (count() + 1)');
  });

  // ─── Non-reactive expression param ──────────────────────
  test('use:action with non-reactive expression does not wrap in () =>', () => {
    const code = genClient(`
      client {
        component App() {
          config = { duration: 300 }
          <div use:tooltip={config} />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    expect(code).toContain(', tooltip, config)');
    expect(code).not.toContain('() => config');
  });

  // ─── String literal param ──────────────────────────────
  test('use:action with string literal param', () => {
    const code = genClient(`
      client {
        component App() {
          <div use:tooltip={"Click me"} />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    expect(code).toContain('tooltip');
    expect(code).toContain('Click me');
    // String literal is not reactive
    expect(code).not.toContain('() => "Click me"');
  });

  // ─── use: directive with other attributes ───────────────
  test('use: directive works alongside regular attributes', () => {
    const code = genClient(`
      client {
        component App() {
          <div class="container" use:tooltip id="main" />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    expect(code).toContain('tooltip');
    expect(code).toContain('container');
    expect(code).toContain('main');
  });

  // ─── Multiple directives with mixed params ─────────────
  test('multiple use: directives with different param types', () => {
    const code = genClient(`
      client {
        component App() {
          state visible = true
          <div use:tooltip={"info"} use:toggle={visible} />
        }
      }
    `);
    expect(code).toContain('__tova_action(');
    // tooltip with string — not reactive
    expect(code).toContain('tooltip');
    // toggle with state variable — reactive, should have () =>
    expect(code).toContain('toggle');
    expect(code).toContain('() => visible()');
    // Should have two __tova_action calls
    const actionCount = (code.match(/__tova_action\(/g) || []).length;
    expect(actionCount).toBe(2);
  });

});
