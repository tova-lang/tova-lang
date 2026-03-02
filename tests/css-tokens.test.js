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

describe('$token syntax', () => {
  test('$color.primary resolves to var(--tova-color-primary)', () => {
    const result = compileBrowser(`theme {
      colors { primary: "#3b82f6" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { background: $color.primary; } }
      }
    }`);
    expect(result).toContain('var(--tova-color-primary)');
    expect(result).not.toContain('$color.primary');
  });

  test('$spacing.md resolves to var(--tova-spacing-md)', () => {
    const result = compileBrowser(`theme {
      spacing { md: 16 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { padding: $spacing.md; } }
      }
    }`);
    expect(result).toContain('var(--tova-spacing-md)');
  });

  test('$font.size.lg resolves with dots-to-dashes', () => {
    const result = compileBrowser(`theme {
      font { size.lg: 20 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { font-size: $font.size.lg; } }
      }
    }`);
    expect(result).toContain('var(--tova-font-size-lg)');
  });

  test('$shadow.md resolves correctly', () => {
    const result = compileBrowser(`theme {
      shadow { md: "0 4px 6px rgba(0,0,0,0.1)" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { box-shadow: $shadow.md; } }
      }
    }`);
    expect(result).toContain('var(--tova-shadow-md)');
  });

  test('$radius.full resolves correctly', () => {
    const result = compileBrowser(`theme {
      radius { full: 9999 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { border-radius: $radius.full; } }
      }
    }`);
    expect(result).toContain('var(--tova-radius-full)');
  });

  test('$transition.normal resolves correctly', () => {
    const result = compileBrowser(`theme {
      transition { normal: "200ms ease" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { transition: all $transition.normal; } }
      }
    }`);
    expect(result).toContain('var(--tova-transition-normal)');
  });

  test('multiple tokens in one property', () => {
    const result = compileBrowser(`theme {
      spacing { sm: 8 md: 16 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { padding: $spacing.sm $spacing.md; } }
      }
    }`);
    expect(result).toContain('var(--tova-spacing-sm)');
    expect(result).toContain('var(--tova-spacing-md)');
  });

  test('token mixed with regular CSS values', () => {
    const result = compileBrowser(`theme {
      colors { primary: "#3b82f6" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { border: 1px solid $color.primary; } }
      }
    }`);
    expect(result).toContain('1px solid var(--tova-color-primary)');
  });

  test('tokens work without theme block (emits var anyway)', () => {
    const result = compileBrowser(`browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: $color.primary; } }
      }
    }`);
    expect(result).toContain('var(--tova-color-primary)');
  });
});
