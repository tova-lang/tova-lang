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
  return gen.generate().browser || '';
}

// ═══════════════════════════════════════════════════════════════
// Directional Transitions (in: / out:)
// ═══════════════════════════════════════════════════════════════

describe('Directional transitions — in:', () => {
  test('in:fade generates enter-only transition with empty config', () => {
    const code = genClient(`browser {
  component App() {
    <div in:fade />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('in: { name: "fade", config: {} }');
  });

  test('in:slide generates enter-only slide transition', () => {
    const code = genClient(`browser {
  component App() {
    <div in:slide />
  }
}`);
    expect(code).toContain('in: { name: "slide", config: {} }');
  });
});

describe('Directional transitions — out:', () => {
  test('out:slide generates leave-only transition with empty config', () => {
    const code = genClient(`browser {
  component App() {
    <div out:slide />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('out: { name: "slide", config: {} }');
  });

  test('out:fade generates leave-only fade transition', () => {
    const code = genClient(`browser {
  component App() {
    <div out:fade />
  }
}`);
    expect(code).toContain('out: { name: "fade", config: {} }');
  });
});

describe('Directional transitions — combined in: and out:', () => {
  test('in:fade and out:slide together generate both directions', () => {
    const code = genClient(`browser {
  component App() {
    <div in:fade out:slide />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('in: { name: "fade", config: {} }');
    expect(code).toContain('out: { name: "slide", config: {} }');
  });

  test('out:scale and in:fly together generate both directions', () => {
    const code = genClient(`browser {
  component App() {
    <div out:scale in:fly />
  }
}`);
    expect(code).toContain('in: { name: "fly", config: {} }');
    expect(code).toContain('out: { name: "scale", config: {} }');
  });
});

describe('Directional transitions — with config', () => {
  test('in:fade with config passes duration correctly', () => {
    const code = genClient(`browser {
  component App() {
    <div in:fade={{duration: 500}} />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('in: { name: "fade"');
    expect(code).toContain('duration: 500');
  });

  test('out:slide with config passes parameters correctly', () => {
    const code = genClient(`browser {
  component App() {
    <div out:slide={{duration: 300, delay: 100}} />
  }
}`);
    expect(code).toContain('out: { name: "slide"');
    expect(code).toContain('duration: 300');
    expect(code).toContain('delay: 100');
  });
});

// ═══════════════════════════════════════════════════════════════
// Custom Transitions (transition: with non-builtin names)
// ═══════════════════════════════════════════════════════════════

describe('Custom transitions — variable reference for non-builtin names', () => {
  test('transition:myCustom generates variable reference, not string', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:myCustom />
  }
}`);
    expect(code).toContain('tova_transition(');
    // Custom transitions use the variable name directly (no quotes)
    expect(code).toContain('myCustom, {}');
    // Should NOT have the name as a string
    expect(code).not.toContain('"myCustom"');
  });

  test('transition:customAnim with config generates variable ref with config', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:customAnim={{duration: 300}} />
  }
}`);
    expect(code).toContain('tova_transition(');
    // Custom name is a variable reference
    expect(code).toContain('customAnim');
    expect(code).not.toContain('"customAnim"');
    expect(code).toContain('duration: 300');
  });

  test('transition:wobble generates variable reference', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:wobble />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('wobble, {}');
    expect(code).not.toContain('"wobble"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Builtin Transitions (transition: with builtin names)
// ═══════════════════════════════════════════════════════════════

describe('Builtin transitions — string reference for known names', () => {
  test('transition:fade generates string-based call', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:fade />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"fade"');
    expect(code).toContain('"fade", {}');
  });

  test('transition:slide generates string-based call', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:slide />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"slide"');
    expect(code).toContain('"slide", {}');
  });

  test('transition:scale generates string-based call', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:scale />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"scale"');
  });

  test('transition:fly generates string-based call', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:fly />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"fly"');
  });
});

describe('Builtin transitions — with config', () => {
  test('transition:scale with duration config', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:scale={{duration: 200}} />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"scale"');
    expect(code).toContain('duration: 200');
  });

  test('transition:fade with duration and easing config', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:fade={{duration: 400, easing: "ease-in"}} />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"fade"');
    expect(code).toContain('duration: 400');
  });

  test('transition:slide with delay config', () => {
    const code = genClient(`browser {
  component App() {
    <div transition:slide={{delay: 50}} />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"slide"');
    expect(code).toContain('delay: 50');
  });
});

// ═══════════════════════════════════════════════════════════════
// Transitions on elements with other attributes
// ═══════════════════════════════════════════════════════════════

describe('Transitions combined with other attributes', () => {
  test('transition:fade on element with class and id', () => {
    const code = genClient(`browser {
  component App() {
    <div class="box" id="main" transition:fade />
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('"fade"');
    expect(code).toContain('className: "box"');
  });

  test('in:fade on element with children', () => {
    const code = genClient(`browser {
  component App() {
    <div in:fade><span>"Hello"</span></div>
  }
}`);
    expect(code).toContain('tova_transition(');
    expect(code).toContain('in: { name: "fade", config: {} }');
    expect(code).toContain('tova_el("span"');
  });

  test('directional and regular transitions are independent', () => {
    // Directional (in:/out:) and regular (transition:) are stored separately
    const code = genClient(`browser {
  component App() {
    <div in:fade />
  }
}`);
    // Should use the directional format
    expect(code).toContain('in: { name: "fade"');
    // Should NOT use the regular format (string or variable as second arg)
    expect(code).not.toContain('"fade", {}');
  });
});
