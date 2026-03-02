// Tests for auto prefers-reduced-motion injection.
// Validates: transition detection, animation detection, no-op when neither present,
// style(motion: full) opt-out, single block for both, 0.01ms duration.

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

// ─── Auto prefers-reduced-motion ────────────────────────────

describe('Reduced Motion — transition detection', () => {
  test('adds reduced-motion query when CSS has transition property', () => {
    const result = compileBrowser(`
      browser {
        component Button() {
          style {
            .btn { transition: all 0.3s ease; }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    expect(result).toContain('prefers-reduced-motion: reduce');
    expect(result).toContain('transition-duration: 0.01ms !important');
  });

  test('adds reduced-motion query when CSS has transition-property', () => {
    const result = compileBrowser(`
      browser {
        component Fade() {
          style {
            .fade { transition-property: opacity; transition-duration: 0.5s; }
          }
          <div class="fade">"Fade"</div>
        }
      }
    `);
    expect(result).toContain('prefers-reduced-motion: reduce');
  });
});

describe('Reduced Motion — animation detection', () => {
  test('adds reduced-motion query when CSS has animation property', () => {
    const result = compileBrowser(`
      browser {
        component Spinner() {
          style {
            .spin { animation: rotate 1s infinite linear; }
          }
          <div class="spin">"Loading"</div>
        }
      }
    `);
    expect(result).toContain('prefers-reduced-motion: reduce');
    expect(result).toContain('animation-duration: 0.01ms !important');
    expect(result).toContain('animation-iteration-count: 1 !important');
  });

  test('adds reduced-motion query when CSS has animation-name', () => {
    const result = compileBrowser(`
      browser {
        component Pulse() {
          style {
            .pulse { animation-name: pulse; animation-duration: 2s; }
          }
          <div class="pulse">"Pulse"</div>
        }
      }
    `);
    expect(result).toContain('prefers-reduced-motion: reduce');
  });
});

describe('Reduced Motion — no animation/transition', () => {
  test('no reduced-motion query when CSS has no animation or transition', () => {
    const result = compileBrowser(`
      browser {
        component Card() {
          style {
            .card { background: white; padding: 16px; border-radius: 8px; }
          }
          <div class="card">"Content"</div>
        }
      }
    `);
    expect(result).not.toContain('prefers-reduced-motion');
  });
});

describe('Reduced Motion — opt-out with style(motion: full)', () => {
  test('style(motion: full) disables auto reduced-motion injection', () => {
    const result = compileBrowser(`
      browser {
        component Spinner() {
          style(motion: full) {
            .spin { animation: rotate 1s infinite linear; }
          }
          <div class="spin">"Loading"</div>
        }
      }
    `);
    expect(result).not.toContain('prefers-reduced-motion');
    // Still has the animation CSS itself
    expect(result).toContain('animation');
  });

  test('style(motion: full) with transition also skips injection', () => {
    const result = compileBrowser(`
      browser {
        component Button() {
          style(motion: full) {
            .btn { transition: all 0.3s ease; }
          }
          <button class="btn">"Click"</button>
        }
      }
    `);
    expect(result).not.toContain('prefers-reduced-motion');
    expect(result).toContain('transition');
  });
});

describe('Reduced Motion — both transition and animation', () => {
  test('CSS with both transition and animation gets single reduced-motion block', () => {
    const result = compileBrowser(`
      browser {
        component Fancy() {
          style {
            .box { transition: opacity 0.3s; animation: slide 1s ease; }
          }
          <div class="box">"Fancy"</div>
        }
      }
    `);
    // Should have exactly one prefers-reduced-motion block
    const matches = result.match(/prefers-reduced-motion/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(1);
    // Should contain both transition and animation overrides
    expect(result).toContain('transition-duration: 0.01ms !important');
    expect(result).toContain('animation-duration: 0.01ms !important');
    expect(result).toContain('animation-iteration-count: 1 !important');
  });
});

describe('Reduced Motion — uses 0.01ms not 0ms', () => {
  test('reduced-motion uses 0.01ms to prevent skipped transitionend events', () => {
    const result = compileBrowser(`
      browser {
        component Slide() {
          style {
            .slide { transition: transform 0.5s ease-out; }
          }
          <div class="slide">"Slide"</div>
        }
      }
    `);
    expect(result).toContain('0.01ms');
    expect(result).not.toContain('duration: 0ms');
    expect(result).not.toContain('duration: 0s');
  });
});

describe('Reduced Motion — scope attribute in media query', () => {
  test('reduced-motion block uses the component scope attribute', () => {
    const result = compileBrowser(`
      browser {
        component Animated() {
          style {
            .anim { transition: all 0.3s; }
          }
          <div class="anim">"Animated"</div>
        }
      }
    `);
    // The reduced-motion block should contain data-tova scope attribute
    expect(result).toContain('prefers-reduced-motion: reduce');
    expect(result).toMatch(/data-tova-[a-z0-9]+/);
    // The scope attr should appear inside the media query
    const mediaMatch = result.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+\{[^}]+\})\s*\}/);
    expect(mediaMatch).not.toBeNull();
    expect(mediaMatch[1]).toMatch(/data-tova-[a-z0-9]+/);
  });
});
