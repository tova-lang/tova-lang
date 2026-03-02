// CSS Design System Integration Tests
// Validates that all CSS features work together in a single component:
// theme {}, $token, responsive {}, variant(), animate {}, font, prefers-reduced-motion,
// and that existing styling features still work (regression check).

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

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

// ─── Test 1: Theme + $token + responsive + variant in one component ──────

describe('CSS Integration — Theme + $token + responsive + variant', () => {
  const source = `
    theme {
      colors {
        primary: "#3b82f6"
        secondary: "#64748b"
      }
      spacing {
        md: 16
      }
      breakpoints {
        tablet: 768
        desktop: 1024
      }
    }

    browser {
      component Button(variant: String) {
        style {
          .btn {
            padding: $spacing.md;
            color: $color.primary;
          }
          variant(variant) {
            primary { background: $color.primary; }
            secondary { background: $color.secondary; }
          }
          responsive {
            tablet { .btn { padding: 12px; } }
            desktop { .btn { padding: 8px; } }
          }
        }
        <button class="btn">"Click"</button>
      }
    }
  `;

  test('compiles without errors', () => {
    expect(() => compileBrowser(source)).not.toThrow();
  });

  test('generates CSS custom properties from theme', () => {
    const result = compile(source);
    const browser = result.browser;
    expect(browser).toContain('--tova-color-primary');
    expect(browser).toContain('--tova-color-secondary');
    expect(browser).toContain('--tova-spacing-md');
  });

  test('$token references resolve to var()', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('var(--tova-spacing-md)');
    expect(browser).toContain('var(--tova-color-primary)');
    expect(browser).toContain('var(--tova-color-secondary)');
  });

  test('variant CSS classes are generated', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--variant-primary');
    expect(browser).toContain('--variant-secondary');
  });

  test('responsive media queries are present', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@media (min-width: 768px)');
    expect(browser).toContain('@media (min-width: 1024px)');
  });

  test('tablet breakpoint appears before desktop breakpoint', () => {
    const browser = compileBrowser(source);
    const tabletIdx = browser.indexOf('min-width: 768px');
    const desktopIdx = browser.indexOf('min-width: 1024px');
    expect(tabletIdx).toBeGreaterThan(-1);
    expect(desktopIdx).toBeGreaterThan(-1);
    expect(tabletIdx).toBeLessThan(desktopIdx);
  });

  test('scoped CSS with data-tova attribute is present', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('data-tova-');
    expect(browser).toContain('tova_inject_css');
  });

  test('all features coexist — var(), variant, and media queries in same output', () => {
    const browser = compileBrowser(source);
    // All three feature markers should be in the same compiled output
    const hasVar = browser.includes('var(--tova-');
    const hasVariant = browser.includes('--variant-');
    const hasMedia = browser.includes('@media (min-width:');
    expect(hasVar).toBe(true);
    expect(hasVariant).toBe(true);
    expect(hasMedia).toBe(true);
  });
});

// ─── Test 2: Theme + animate + font in one component ─────────────────────

describe('CSS Integration — Theme + animate + font', () => {
  const source = `
    theme {
      colors {
        primary: "#3b82f6"
      }
    }

    browser {
      component Card() {
        font heading from "https://fonts.googleapis.com/css2?family=Inter"

        animate fadeIn {
          enter: fade(from: 0, to: 1)
          duration: 300
        }

        style {
          .card { color: $color.primary; }
        }

        <div class="card" animate:fadeIn>"Hello"</div>
      }
    }
  `;

  test('compiles without errors', () => {
    expect(() => compileBrowser(source)).not.toThrow();
  });

  test('theme CSS custom property is generated', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--tova-color-primary');
  });

  test('$token resolves in style block', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('var(--tova-color-primary)');
  });

  test('@keyframes are generated for animate block', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@keyframes');
    expect(browser).toContain('fadeIn');
    expect(browser).toContain('opacity');
  });

  test('font loading call is present', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('__tova_load_font');
    expect(browser).toContain('fonts.googleapis.com');
  });

  test('animation duration is specified', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('300ms');
  });

  test('all features coexist — theme, animate, and font in same output', () => {
    const browser = compileBrowser(source);
    const hasTheme = browser.includes('--tova-color-primary');
    const hasKeyframes = browser.includes('@keyframes');
    const hasFont = browser.includes('__tova_load_font');
    expect(hasTheme).toBe(true);
    expect(hasKeyframes).toBe(true);
    expect(hasFont).toBe(true);
  });
});

// ─── Test 3: Variant + responsive + reduced-motion together ──────────────

describe('CSS Integration — Variant + responsive + reduced-motion', () => {
  const source = `
    theme {
      breakpoints {
        desktop: 1024
      }
    }

    browser {
      component Nav(size: String) {
        style {
          .nav { transition: all 0.3s ease; }
          variant(size) {
            sm { font-size: 14px; }
            lg { font-size: 20px; }
          }
          responsive {
            desktop { .nav { padding: 20px; } }
          }
        }
        <nav class="nav">"Menu"</nav>
      }
    }
  `;

  test('compiles without errors', () => {
    expect(() => compileBrowser(source)).not.toThrow();
  });

  test('variant CSS classes are generated', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--size-sm');
    expect(browser).toContain('--size-lg');
    expect(browser).toContain('font-size: 14px');
    expect(browser).toContain('font-size: 20px');
  });

  test('responsive media query is generated', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@media (min-width: 1024px)');
    expect(browser).toContain('padding: 20px');
  });

  test('prefers-reduced-motion is auto-injected due to transition', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('prefers-reduced-motion: reduce');
    expect(browser).toContain('transition-duration: 0.01ms !important');
  });

  test('transition property is present in base CSS', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('transition: all 0.3s ease');
  });

  test('all three features coexist in output', () => {
    const browser = compileBrowser(source);
    const hasVariant = browser.includes('--size-');
    const hasMedia = browser.includes('@media (min-width:');
    const hasReducedMotion = browser.includes('prefers-reduced-motion');
    expect(hasVariant).toBe(true);
    expect(hasMedia).toBe(true);
    expect(hasReducedMotion).toBe(true);
  });
});

// ─── Test 4: Existing styling features regression check ──────────────────

describe('CSS Integration — Regression: basic styling features', () => {
  test('static class attribute compiles to className', () => {
    const result = compileBrowser('browser { component App { <div class="text-lg font-bold" /> } }');
    expect(result).toContain('className: "text-lg font-bold"');
  });

  test('dynamic class binding works', () => {
    const result = compileBrowser('browser { state active = true\ncomponent App { <div class={if active { "bg-blue-500" } else { "bg-gray-500" }} /> } }');
    expect(result).toContain('className');
    expect(result).toContain('bg-blue-500');
    expect(result).toContain('bg-gray-500');
  });

  test('class:active={flag} directive works', () => {
    const result = compileBrowser('browser { state active = true\ncomponent App { <div class:active={active} /> } }');
    expect(result).toContain('"active"');
    expect(result).toContain('filter(Boolean)');
    expect(result).toContain('join(" ")');
  });

  test('show={visible} directive works', () => {
    const result = compileBrowser('browser { state visible = true\ncomponent App { <div show={visible}>Hello</div> } }');
    expect(result).toContain('display');
    expect(result).toContain('none');
  });

  test('inline style string passes through', () => {
    const result = compileBrowser('browser { component App { <div style="color: red; font-size: 14px" /> } }');
    expect(result).toContain('style');
    expect(result).toContain('color: red');
  });

  test('inline style object compiles', () => {
    const result = compileBrowser('browser { component App { <div style={{ color: "red", fontSize: "14px" }} /> } }');
    expect(result).toContain('style');
    expect(result).toContain('color');
    expect(result).toContain('red');
  });

  test('scoped CSS injects via tova_inject_css', () => {
    const result = compileBrowser(`browser {
      component Card {
        <div class="card">Hello</div>
        style {
          .card { padding: 16px; border-radius: 8px; }
        }
      }
    }`);
    expect(result).toContain('tova_inject_css');
    expect(result).toContain('data-tova-');
    expect(result).toContain('.card');
  });

  test('class: directive + static class merge correctly', () => {
    const result = compileBrowser('browser { state bold = true\ncomponent App { <div class="btn" class:bold={bold} /> } }');
    expect(result).toContain('"btn"');
    expect(result).toContain('"bold"');
    expect(result).toContain('filter(Boolean)');
  });

  test('show + static class on same element', () => {
    const result = compileBrowser('browser { state v = true\ncomponent App { <div class="card" show={v}>Content</div> } }');
    expect(result).toContain('display');
    expect(result).toContain('card');
  });
});

// ─── Test 5: Complex multi-feature component ─────────────────────────────

describe('CSS Integration — Full design system component', () => {
  const source = `
    theme {
      colors {
        primary: "#3b82f6"
        secondary: "#64748b"
        surface: "#ffffff"
      }
      spacing {
        sm: 8
        md: 16
        lg: 24
      }
      radius {
        md: 8
      }
      breakpoints {
        tablet: 768
        desktop: 1024
      }
    }

    browser {
      component Card(variant: String) {
        font heading from "https://fonts.googleapis.com/css2?family=Inter"

        animate slideIn {
          enter: fade(from: 0, to: 1) + slide(y: 20, to: 0)
          duration: 400
        }

        style {
          .card {
            padding: $spacing.md;
            border-radius: $radius.md;
            background: $color.surface;
            transition: box-shadow 0.2s ease;
          }
          .card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          variant(variant) {
            primary { border-left: 3px solid $color.primary; }
            secondary { border-left: 3px solid $color.secondary; }
          }
          responsive {
            tablet { .card { padding: $spacing.lg; } }
            desktop { .card { padding: $spacing.sm $spacing.lg; } }
          }
        }

        <div class="card" animate:slideIn>"Content"</div>
      }
    }
  `;

  test('compiles without errors', () => {
    expect(() => compileBrowser(source)).not.toThrow();
  });

  test('all theme tokens are generated as CSS custom properties', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--tova-color-primary');
    expect(browser).toContain('--tova-color-secondary');
    expect(browser).toContain('--tova-color-surface');
    expect(browser).toContain('--tova-spacing-sm');
    expect(browser).toContain('--tova-spacing-md');
    expect(browser).toContain('--tova-spacing-lg');
    expect(browser).toContain('--tova-radius-md');
  });

  test('all $token references resolve to var()', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('var(--tova-spacing-md)');
    expect(browser).toContain('var(--tova-radius-md)');
    expect(browser).toContain('var(--tova-color-surface)');
    expect(browser).toContain('var(--tova-color-primary)');
    expect(browser).toContain('var(--tova-color-secondary)');
  });

  test('variant classes are generated with token references', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--variant-primary');
    expect(browser).toContain('--variant-secondary');
    // Variant CSS should contain the resolved token vars
    expect(browser).toContain('var(--tova-color-primary)');
    expect(browser).toContain('var(--tova-color-secondary)');
  });

  test('responsive breakpoints generate media queries', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@media (min-width: 768px)');
    expect(browser).toContain('@media (min-width: 1024px)');
  });

  test('responsive blocks contain resolved tokens', () => {
    const browser = compileBrowser(source);
    // tablet responsive should use $spacing.lg -> var(--tova-spacing-lg)
    expect(browser).toContain('var(--tova-spacing-lg)');
  });

  test('@keyframes for animate block is generated', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@keyframes');
    expect(browser).toContain('slideIn');
  });

  test('font loading is wired up', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('__tova_load_font');
    expect(browser).toContain('fonts.googleapis.com');
  });

  test('prefers-reduced-motion is injected due to transition', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('prefers-reduced-motion: reduce');
  });

  test('scoped CSS is applied', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('data-tova-');
    expect(browser).toContain('tova_inject_css');
  });

  test(':hover pseudo-class is preserved', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain(':hover');
    expect(browser).toContain('box-shadow');
  });

  test('all six features present in a single compiled output', () => {
    const browser = compileBrowser(source);
    // Theme custom properties
    expect(browser).toContain('--tova-');
    // Token var() references
    expect(browser).toContain('var(--tova-');
    // Variant classes
    expect(browser).toContain('--variant-');
    // Responsive media queries
    expect(browser).toContain('@media (min-width:');
    // Animate @keyframes
    expect(browser).toContain('@keyframes');
    // Font loading
    expect(browser).toContain('__tova_load_font');
    // Reduced motion
    expect(browser).toContain('prefers-reduced-motion');
    // Scoped CSS
    expect(browser).toContain('data-tova-');
  });
});

// ─── Test 6: Multiple components sharing theme ───────────────────────────

describe('CSS Integration — Multiple components with shared theme', () => {
  const source = `
    theme {
      colors {
        primary: "#3b82f6"
        danger: "#ef4444"
      }
      spacing {
        sm: 8
        md: 16
      }
      breakpoints {
        tablet: 768
      }
    }

    browser {
      component Button(variant: String) {
        style {
          .btn { padding: $spacing.sm; color: $color.primary; }
          variant(variant) {
            primary { background: $color.primary; }
            danger { background: $color.danger; }
          }
        }
        <button class="btn">"Click"</button>
      }

      component Card() {
        style {
          .card {
            padding: $spacing.md;
            border: 1px solid $color.primary;
            transition: transform 0.2s ease;
          }
          responsive {
            tablet { .card { padding: $spacing.sm; } }
          }
        }
        <div class="card">"Card"</div>
      }
    }
  `;

  test('compiles without errors', () => {
    expect(() => compileBrowser(source)).not.toThrow();
  });

  test('both components share theme custom properties', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--tova-color-primary');
    expect(browser).toContain('--tova-color-danger');
    expect(browser).toContain('--tova-spacing-sm');
    expect(browser).toContain('--tova-spacing-md');
  });

  test('Button has variant classes', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--variant-primary');
    expect(browser).toContain('--variant-danger');
  });

  test('Card has responsive media query', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@media (min-width: 768px)');
  });

  test('Card gets reduced-motion injection from transition', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('prefers-reduced-motion: reduce');
  });

  test('both components get scoped CSS independently', () => {
    const browser = compileBrowser(source);
    // Should have tova_inject_css called for both components
    const cssInjectCount = (browser.match(/tova_inject_css/g) || []).length;
    expect(cssInjectCount).toBeGreaterThanOrEqual(2);
  });
});

// ─── Test 7: Animate with style block and variants ───────────────────────

describe('CSS Integration — Animate + style block + variant', () => {
  const source = `
    browser {
      component Alert(severity: String) {
        animate slideDown {
          enter: slide(y: -20, to: 0) + fade(from: 0, to: 1)
          duration: 250
          easing: "ease-out"
        }

        style {
          .alert {
            padding: 12px 16px;
            border-radius: 6px;
            animation: all 0.3s ease;
          }
          variant(severity) {
            info { background: #e0f2fe; color: #0369a1; }
            warning { background: #fef3c7; color: #92400e; }
            error { background: #fee2e2; color: #991b1b; }
          }
        }

        <div class="alert" animate:slideDown>"Alert message"</div>
      }
    }
  `;

  test('compiles without errors', () => {
    expect(() => compileBrowser(source)).not.toThrow();
  });

  test('@keyframes generated for slideDown', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('@keyframes');
    expect(browser).toContain('slideDown');
  });

  test('three severity variants generated', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('--severity-info');
    expect(browser).toContain('--severity-warning');
    expect(browser).toContain('--severity-error');
  });

  test('custom easing is applied', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('ease-out');
  });

  test('animation properties trigger reduced-motion injection', () => {
    const browser = compileBrowser(source);
    expect(browser).toContain('prefers-reduced-motion: reduce');
  });
});
