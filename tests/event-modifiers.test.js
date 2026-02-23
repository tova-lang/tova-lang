import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  return new Parser(tokens, '<test>').parse();
}

function genClient(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().client || '';
}

// ═══════════════════════════════════════════════════════════════
// 1. Parser — Event modifier parsing
// ═══════════════════════════════════════════════════════════════

describe('Parser — Event modifier parsing', () => {
  test('on:click.stop produces correct attribute name', () => {
    const ast = parse('client { component Foo() { <button on:click.stop={fn(e) handleClick(e)}>"Click"</button> } }');
    const comp = ast.body[0].body[0];
    const btn = comp.body[0];
    const attr = btn.attributes[0];
    expect(attr.name).toBe('on:click.stop');
  });

  test('on:click.stop.prevent produces attribute name with multiple modifiers', () => {
    const ast = parse('client { component Foo() { <button on:click.stop.prevent={fn(e) handleClick(e)}>"Click"</button> } }');
    const comp = ast.body[0].body[0];
    const btn = comp.body[0];
    const attr = btn.attributes[0];
    expect(attr.name).toBe('on:click.stop.prevent');
  });

  test('on:keydown.enter produces attribute name with key modifier', () => {
    const ast = parse('client { component Foo() { <input on:keydown.enter={fn(e) handleSubmit(e)} /> } }');
    const comp = ast.body[0].body[0];
    const input = comp.body[0];
    const attr = input.attributes[0];
    expect(attr.name).toBe('on:keydown.enter');
  });

  test('on:click without modifiers produces plain attribute name', () => {
    const ast = parse('client { component Foo() { <button on:click={fn(e) handleClick(e)}>"Click"</button> } }');
    const comp = ast.body[0].body[0];
    const btn = comp.body[0];
    const attr = btn.attributes[0];
    expect(attr.name).toBe('on:click');
  });

  test('on:keydown.enter.prevent produces attribute name with key and guard modifiers', () => {
    const ast = parse('client { component Foo() { <input on:keydown.enter.prevent={fn(e) handleSubmit(e)} /> } }');
    const comp = ast.body[0].body[0];
    const input = comp.body[0];
    const attr = input.attributes[0];
    expect(attr.name).toBe('on:keydown.enter.prevent');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Codegen — Event modifier guard wrapping
// ═══════════════════════════════════════════════════════════════

describe('Codegen — Event modifier guards', () => {
  test('on:click.stop wraps handler with e.stopPropagation()', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.stop={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('e.stopPropagation()');
    expect(code).toContain('onClick:');
  });

  test('on:click.prevent wraps handler with e.preventDefault()', () => {
    const code = genClient(`client {
      component Foo() {
        <form on:submit.prevent={fn(e) handleSubmit(e)}>"Submit"</form>
      }
    }`);
    expect(code).toContain('e.preventDefault()');
    expect(code).toContain('onSubmit:');
  });

  test('on:click.self wraps handler with target check', () => {
    const code = genClient(`client {
      component Foo() {
        <div on:click.self={fn(e) handleClick(e)}>"Click"</div>
      }
    }`);
    expect(code).toContain('e.target !== e.currentTarget');
    expect(code).toContain('onClick:');
  });

  test('on:click.stop.prevent applies both guards', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.stop.prevent={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('e.stopPropagation()');
    expect(code).toContain('e.preventDefault()');
    expect(code).toContain('onClick:');
  });

  test('on:click without modifiers does not add guards', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).not.toContain('e.stopPropagation()');
    expect(code).not.toContain('e.preventDefault()');
    expect(code).toContain('onClick:');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Codegen — Event handler options (once, capture)
// ═══════════════════════════════════════════════════════════════

describe('Codegen — Event handler options (once, capture)', () => {
  test('on:click.once produces { handler:, options: { once: true } }', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.once={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('handler:');
    expect(code).toContain('once: true');
    expect(code).toContain('onClick:');
  });

  test('on:click.capture produces { handler:, options: { capture: true } }', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.capture={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('handler:');
    expect(code).toContain('capture: true');
    expect(code).toContain('onClick:');
  });

  test('on:click.once.capture produces both options', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.once.capture={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('handler:');
    expect(code).toContain('once: true');
    expect(code).toContain('capture: true');
    expect(code).toContain('onClick:');
  });

  test('on:click.stop.once combines guard and options', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.stop.once={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('e.stopPropagation()');
    expect(code).toContain('handler:');
    expect(code).toContain('once: true');
    expect(code).toContain('onClick:');
  });

  test('on:click.prevent.capture combines guard and capture option', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.prevent.capture={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('e.preventDefault()');
    expect(code).toContain('handler:');
    expect(code).toContain('capture: true');
    expect(code).toContain('onClick:');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Codegen — Key modifiers
// ═══════════════════════════════════════════════════════════════

describe('Codegen — Key modifiers', () => {
  test('on:keydown.enter wraps with key check for "Enter"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.enter={fn(e) handleSubmit(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "Enter"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.escape wraps with key check for "Escape"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.escape={fn(e) handleCancel(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "Escape"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.space wraps with key check for " "', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.space={fn(e) handleSpace(e)} />
      }
    }`);
    expect(code).toContain('e.key !== " "');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.up wraps with key check for "ArrowUp"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.up={fn(e) handleUp(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "ArrowUp"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.down wraps with key check for "ArrowDown"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.down={fn(e) handleDown(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "ArrowDown"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.left wraps with key check for "ArrowLeft"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.left={fn(e) handleLeft(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "ArrowLeft"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.right wraps with key check for "ArrowRight"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.right={fn(e) handleRight(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "ArrowRight"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.tab wraps with key check for "Tab"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.tab={fn(e) handleTab(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "Tab"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.delete wraps with key check for "Delete"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.delete={fn(e) handleDelete(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "Delete"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.backspace wraps with key check for "Backspace"', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.backspace={fn(e) handleBackspace(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "Backspace"');
    expect(code).toContain('onKeydown:');
  });

  test('on:keydown.enter.prevent combines key check and guard', () => {
    const code = genClient(`client {
      component Foo() {
        <input on:keydown.enter.prevent={fn(e) handleSubmit(e)} />
      }
    }`);
    expect(code).toContain('e.key !== "Enter"');
    expect(code).toContain('e.preventDefault()');
    expect(code).toContain('onKeydown:');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Codegen — bind:this generates ref
// ═══════════════════════════════════════════════════════════════

describe('Codegen — bind:this generates ref', () => {
  test('bind:this={myRef} generates ref: myRef', () => {
    const code = genClient(`client {
      component Foo() {
        <div bind:this={myRef}>"Content"</div>
      }
    }`);
    expect(code).toContain('ref: myRef');
  });

  test('bind:this={canvasRef} generates ref: canvasRef', () => {
    const code = genClient(`client {
      component Foo() {
        <canvas bind:this={canvasRef} />
      }
    }`);
    expect(code).toContain('ref: canvasRef');
  });

  test('bind:this does not interfere with other attributes', () => {
    const code = genClient(`client {
      component Foo() {
        <div bind:this={myRef} class="wrapper">"Content"</div>
      }
    }`);
    expect(code).toContain('ref: myRef');
    expect(code).toContain('className: "wrapper"');
  });

  test('bind:this does not interfere with event handlers', () => {
    const code = genClient(`client {
      component Foo() {
        <button bind:this={btnRef} on:click={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('ref: btnRef');
    expect(code).toContain('onClick:');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Runtime — Event handler options object pattern
// ═══════════════════════════════════════════════════════════════

describe('Runtime — Event handler options object pattern', () => {
  test('options object has handler and options keys', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.once={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    // The generated code should contain the { handler: ..., options: { once: true } } pattern
    expect(code).toMatch(/handler:\s/);
    expect(code).toMatch(/options:\s*\{/);
    expect(code).toContain('once: true');
  });

  test('options object with capture has correct structure', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.capture={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toMatch(/handler:\s/);
    expect(code).toMatch(/options:\s*\{/);
    expect(code).toContain('capture: true');
  });

  test('options object with once and capture has both keys', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.once.capture={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toMatch(/handler:\s/);
    expect(code).toMatch(/options:\s*\{/);
    expect(code).toContain('capture: true');
    expect(code).toContain('once: true');
  });

  test('guard-only modifiers do not produce options object', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.stop={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('e.stopPropagation()');
    expect(code).not.toContain('handler:');
    expect(code).not.toContain('options:');
  });

  test('self modifier alone does not produce options object', () => {
    const code = genClient(`client {
      component Foo() {
        <div on:click.self={fn(e) handleClick(e)}>"Click"</div>
      }
    }`);
    expect(code).toContain('e.target !== e.currentTarget');
    expect(code).not.toContain('handler:');
    expect(code).not.toContain('options:');
  });

  test('stop.prevent.once produces both guards and options', () => {
    const code = genClient(`client {
      component Foo() {
        <button on:click.stop.prevent.once={fn(e) handleClick(e)}>"Click"</button>
      }
    }`);
    expect(code).toContain('e.stopPropagation()');
    expect(code).toContain('e.preventDefault()');
    expect(code).toContain('handler:');
    expect(code).toContain('once: true');
  });
});
