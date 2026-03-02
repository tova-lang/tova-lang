import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function compileBrowser(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate().browser;
}

describe('variant() styles', () => {
  test('generates CSS class per variant value', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; }
            variant(variant) {
              primary { background: blue; color: white; }
              secondary { background: gray; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    expect(code).toContain('--variant-primary');
    expect(code).toContain('background: blue');
    expect(code).toContain('color: white');
    expect(code).toContain('--variant-secondary');
    expect(code).toContain('background: gray');
  });

  test('variant CSS classes are scoped with data-tova attribute', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; }
            variant(variant) {
              primary { background: blue; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // Variant classes should be scoped
    expect(code).toMatch(/--variant-primary\[data-tova-/);
  });

  test('generates reactive className from variant prop', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; }
            variant(variant) {
              primary { background: blue; }
              secondary { background: gray; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // Should have a reactive className that includes variant class computation
    expect(code).toContain('--variant-');
    // The button should have a dynamic class that references the variant prop
    expect(code).toMatch(/btn--variant-/);
  });

  test('multiple variant() blocks (variant + size)', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String, size: String) {
          style {
            .btn { padding: 8px 16px; }
            variant(variant) {
              primary { background: blue; color: white; }
              secondary { background: gray; }
            }
            variant(size) {
              sm { font-size: 12px; padding: 4px 8px; }
              lg { font-size: 18px; padding: 12px 24px; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // variant classes
    expect(code).toContain('--variant-primary');
    expect(code).toContain('--variant-secondary');
    // size classes
    expect(code).toContain('--size-sm');
    expect(code).toContain('--size-lg');
    expect(code).toContain('font-size: 12px');
    expect(code).toContain('font-size: 18px');
  });

  test('variant with pseudo-selectors (primary:hover)', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; }
            variant(variant) {
              primary { background: blue; }
              primary:hover { background: darkblue; }
              primary:focus { outline: 2px solid blue; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    expect(code).toContain('--variant-primary');
    expect(code).toContain('background: blue');
    // Pseudo-selectors should be appended after the scoping attribute
    expect(code).toContain('background: darkblue');
    expect(code).toMatch(/:hover/);
    expect(code).toMatch(/:focus/);
  });

  test('variant with Bool prop (true/false keys)', () => {
    const code = compileBrowser(`
      browser {
        component Button(disabled: Bool) {
          style {
            .btn { padding: 8px; }
            variant(disabled) {
              true { opacity: 0.5; cursor: not-allowed; }
              false { opacity: 1; cursor: pointer; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    expect(code).toContain('--disabled-true');
    expect(code).toContain('--disabled-false');
    expect(code).toContain('opacity: 0.5');
    expect(code).toContain('cursor: pointer');
  });

  test('compound variant with + separator', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String, size: String) {
          style {
            .btn { padding: 8px; }
            variant(variant + size) {
              primary + lg { font-weight: bold; border: 2px solid blue; }
              secondary + sm { font-weight: normal; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // Compound variants should generate combined selectors
    expect(code).toContain('--variant-primary');
    expect(code).toContain('--size-lg');
    expect(code).toContain('font-weight: bold');
    expect(code).toContain('font-weight: normal');
  });

  test('variant works with $token references (tokens resolved before extraction)', () => {
    const code = compileBrowser(`
      theme {
        colors { primary: "#3b82f6" accent: "#ef4444" }
      }
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; }
            variant(variant) {
              primary { background: $color.primary; }
              danger { background: $color.accent; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // Tokens should be resolved to CSS custom properties
    expect(code).toContain('var(--tova-color-primary)');
    expect(code).toContain('var(--tova-color-accent)');
    expect(code).toContain('--variant-primary');
    expect(code).toContain('--variant-danger');
  });

  test('base CSS remains intact after variant extraction', () => {
    const code = compileBrowser(`
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; display: inline-flex; }
            .btn-icon { margin-right: 4px; }
            variant(variant) {
              primary { background: blue; }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // Base CSS should still be present
    expect(code).toContain('padding: 8px');
    expect(code).toContain('display: inline-flex');
    expect(code).toContain('margin-right: 4px');
    // Variant should not appear as raw text in base CSS
    expect(code).not.toMatch(/variant\s*\(\s*variant\s*\)\s*\{/);
  });

  test('variant with responsive blocks (both coexist)', () => {
    const code = compileBrowser(`
      theme {
        breakpoints { mobile: 0 tablet: 768 }
      }
      browser {
        component Button(variant: String) {
          style {
            .btn { padding: 8px; }
            variant(variant) {
              primary { background: blue; }
            }
            responsive {
              tablet { .btn { padding: 16px; } }
            }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    // Both variant and responsive should work
    expect(code).toContain('--variant-primary');
    expect(code).toContain('@media (min-width: 768px)');
  });

  test('variant entry with multiple CSS properties', () => {
    const code = compileBrowser(`
      browser {
        component Card(variant: String) {
          style {
            .card { padding: 16px; }
            variant(variant) {
              elevated {
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                border: none;
                border-radius: 8px;
              }
              outlined {
                box-shadow: none;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
              }
            }
          }
          <div class="card">"Content"</div>
        }
      }
    `);
    expect(code).toContain('--variant-elevated');
    expect(code).toContain('--variant-outlined');
    expect(code).toContain('border-radius: 8px');
    expect(code).toContain('border: 1px solid #e0e0e0');
  });
});
