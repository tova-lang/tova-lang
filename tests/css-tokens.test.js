import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  analyzer.analyze();
  return analyzer.warnings;
}

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

describe('$token — analyzer validation', () => {
  test('warns on unknown token reference', () => {
    const warnings = analyze(`theme {
      colors { primary: "#3b82f6" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: $color.primry; } }
      }
    }`);
    expect(warnings.some(w => w.code === 'W_UNKNOWN_THEME_TOKEN')).toBe(true);
    expect(warnings.some(w => w.message.includes('primry'))).toBe(true);
  });

  test('suggests closest match for typo', () => {
    const warnings = analyze(`theme {
      colors { primary: "#3b82f6" secondary: "#8b5cf6" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: $color.primay; } }
      }
    }`);
    const w = warnings.find(w => w.code === 'W_UNKNOWN_THEME_TOKEN');
    expect(w).toBeTruthy();
    expect(w.message).toContain('primary');
  });

  test('warns on unknown category', () => {
    const warnings = analyze(`theme {
      colors { primary: "#3b82f6" }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: $clr.primary; } }
      }
    }`);
    expect(warnings.some(w => w.code === 'W_UNKNOWN_THEME_CATEGORY')).toBe(true);
  });

  test('no warning for valid token references', () => {
    const warnings = analyze(`theme {
      colors { primary: "#3b82f6" }
      spacing { md: 16 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: $color.primary; padding: $spacing.md; } }
      }
    }`);
    const tokenWarnings = warnings.filter(w => w.code && w.code.startsWith('W_UNKNOWN_THEME'));
    expect(tokenWarnings.length).toBe(0);
  });

  test('no warning when no theme block (tokens pass through)', () => {
    const warnings = analyze(`browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: $color.primary; } }
      }
    }`);
    const tokenWarnings = warnings.filter(w => w.code && w.code.startsWith('W_UNKNOWN_THEME'));
    expect(tokenWarnings.length).toBe(0);
  });
});
