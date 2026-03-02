import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function compileBrowser(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate().browser;
}

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  analyzer.analyze();
  return analyzer.warnings;
}

describe('responsive {} in style blocks', () => {
  test('mobile breakpoint (0) emits without media query', () => {
    const result = compileBrowser(`theme {
      breakpoints { mobile: 0 tablet: 768 }
    }
    browser {
      component App {
        <div class="nav">"Hello"</div>
        style {
          .nav { display: flex; }
          responsive {
            mobile { .nav { flex-direction: column; } }
          }
        }
      }
    }`);
    expect(result).toContain('flex-direction: column');
    expect(result).not.toContain('@media (min-width: 0');
  });

  test('tablet breakpoint emits @media (min-width: 768px)', () => {
    const result = compileBrowser(`theme {
      breakpoints { mobile: 0 tablet: 768 }
    }
    browser {
      component App {
        <div class="nav">"Hello"</div>
        style {
          .nav { display: flex; }
          responsive {
            tablet { .nav { flex-direction: row; } }
          }
        }
      }
    }`);
    expect(result).toContain('@media (min-width: 768px)');
    expect(result).toContain('flex-direction: row');
  });

  test('multiple breakpoints emit in ascending order', () => {
    const result = compileBrowser(`theme {
      breakpoints { mobile: 0 tablet: 768 desktop: 1024 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          .box { padding: 8px; }
          responsive {
            tablet { .box { padding: 16px; } }
            desktop { .box { padding: 24px; } }
          }
        }
      }
    }`);
    expect(result).toContain('@media (min-width: 768px)');
    expect(result).toContain('@media (min-width: 1024px)');
    const tabletIdx = result.indexOf('min-width: 768px');
    const desktopIdx = result.indexOf('min-width: 1024px');
    expect(tabletIdx).toBeLessThan(desktopIdx);
  });

  test('selectors inside responsive are scoped', () => {
    const result = compileBrowser(`theme {
      breakpoints { mobile: 0 tablet: 768 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          .box { color: red; }
          responsive {
            tablet { .box { color: blue; } }
          }
        }
      }
    }`);
    // The .box inside responsive should be scoped with [data-tova-*]
    expect(result).toContain('data-tova-');
    // Check the media query section contains scoped selectors
    const mediaStart = result.indexOf('@media (min-width: 768px)');
    expect(mediaStart).toBeGreaterThan(-1);
    const afterMedia = result.slice(mediaStart);
    expect(afterMedia).toContain('data-tova-');
  });

  test('works with default breakpoints when no theme block', () => {
    const result = compileBrowser(`browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          .box { padding: 8px; }
          responsive {
            tablet { .box { padding: 16px; } }
          }
        }
      }
    }`);
    expect(result).toContain('@media (min-width: 768px)');
  });

  test('responsive works with $token references', () => {
    const result = compileBrowser(`theme {
      spacing { md: 16 lg: 24 }
      breakpoints { mobile: 0 tablet: 768 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          .box { padding: $spacing.md; }
          responsive {
            tablet { .box { padding: $spacing.lg; } }
          }
        }
      }
    }`);
    expect(result).toContain('var(--tova-spacing-lg)');
    expect(result).toContain('@media (min-width: 768px)');
  });

  test('component without responsive block works unchanged', () => {
    const result = compileBrowser(`browser {
      component App {
        <div class="box">"Hello"</div>
        style { .box { color: red; } }
      }
    }`);
    expect(result).toContain('color: red');
    expect(result).not.toContain('responsive');
    expect(result).not.toContain('@media (min-width');
  });
});

describe('responsive {} — analyzer', () => {
  test('warns on unknown breakpoint name', () => {
    const warnings = analyze(`theme {
      breakpoints { mobile: 0 tablet: 768 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          responsive { widescreen { .box { color: red; } } }
        }
      }
    }`);
    expect(warnings.some(w => w.code === 'W_UNKNOWN_BREAKPOINT')).toBe(true);
    expect(warnings.some(w => w.message.includes('widescreen'))).toBe(true);
  });

  test('no warning for valid breakpoint names', () => {
    const warnings = analyze(`theme {
      breakpoints { mobile: 0 tablet: 768 desktop: 1024 }
    }
    browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          responsive { tablet { .box { color: blue; } } }
        }
      }
    }`);
    const bpWarnings = warnings.filter(w => w.code === 'W_UNKNOWN_BREAKPOINT');
    expect(bpWarnings.length).toBe(0);
  });

  test('no warning when no theme block (uses defaults)', () => {
    const warnings = analyze(`browser {
      component App {
        <div class="box">"Hello"</div>
        style {
          responsive { tablet { .box { color: blue; } } }
        }
      }
    }`);
    const bpWarnings = warnings.filter(w => w.code === 'W_UNKNOWN_BREAKPOINT');
    expect(bpWarnings.length).toBe(0);
  });
});
