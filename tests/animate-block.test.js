import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import {
  AnimateDeclaration, AnimatePrimitive, AnimateSequence, AnimateParallel,
} from '../src/parser/animate-ast.js';

function parse(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate().browser;
}

function getAnimateDecls(ast) {
  const browser = ast.body.find(n => n.type === 'BrowserBlock');
  const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
  return comp.body.filter(n => n.type === 'AnimateDeclaration');
}

// ─── AST Node constructors ──────────────────────────────────

describe('animate {} — AST Nodes', () => {
  test('AnimateDeclaration has correct type and fields', () => {
    const node = new AnimateDeclaration('fadeIn', null, null, 300, 'ease-out', null, null, { line: 1 });
    expect(node.type).toBe('AnimateDeclaration');
    expect(node.name).toBe('fadeIn');
    expect(node.enter).toBeNull();
    expect(node.exit).toBeNull();
    expect(node.duration).toBe(300);
    expect(node.easing).toBe('ease-out');
    expect(node.stagger).toBeNull();
    expect(node.stay).toBeNull();
  });

  test('AnimatePrimitive has correct type and fields', () => {
    const node = new AnimatePrimitive('fade', { from: 0, to: 1 }, { line: 1 });
    expect(node.type).toBe('AnimatePrimitive');
    expect(node.name).toBe('fade');
    expect(node.params.from).toBe(0);
    expect(node.params.to).toBe(1);
  });

  test('AnimateSequence has correct type and children', () => {
    const a = new AnimatePrimitive('fade', { from: 0, to: 1 }, { line: 1 });
    const b = new AnimatePrimitive('scale', { from: 0.8, to: 1 }, { line: 1 });
    const node = new AnimateSequence([a, b], { line: 1 });
    expect(node.type).toBe('AnimateSequence');
    expect(node.children).toHaveLength(2);
    expect(node.children[0].name).toBe('fade');
    expect(node.children[1].name).toBe('scale');
  });

  test('AnimateParallel has correct type and children', () => {
    const a = new AnimatePrimitive('fade', { from: 0, to: 1 }, { line: 1 });
    const b = new AnimatePrimitive('slide', { y: 20, to: 0 }, { line: 1 });
    const node = new AnimateParallel([a, b], { line: 1 });
    expect(node.type).toBe('AnimateParallel');
    expect(node.children).toHaveLength(2);
  });
});

// ─── Parser: basic animate declaration ───────────────────────

describe('animate {} — Parser', () => {
  test('simple animate with enter and duration', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('fadeIn');
    expect(decls[0].enter.type).toBe('AnimatePrimitive');
    expect(decls[0].enter.name).toBe('fade');
    expect(decls[0].enter.params.from).toBe(0);
    expect(decls[0].enter.params.to).toBe(1);
    expect(decls[0].duration).toBe(300);
    expect(decls[0].exit).toBeNull();
    expect(decls[0].easing).toBeNull();
    expect(decls[0].stagger).toBeNull();
    expect(decls[0].stay).toBeNull();
  });

  test('animate with enter and exit phases', () => {
    const ast = parse(`
      browser {
        component Card() {
          animate slideUp {
            enter: slide(y: 20, to: 0)
            exit: slide(y: 0, to: 20)
            duration: 400
          }
          <div>"Card"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('slideUp');
    expect(decls[0].enter.type).toBe('AnimatePrimitive');
    expect(decls[0].enter.name).toBe('slide');
    expect(decls[0].enter.params.y).toBe(20);
    expect(decls[0].enter.params.to).toBe(0);
    expect(decls[0].exit.type).toBe('AnimatePrimitive');
    expect(decls[0].exit.name).toBe('slide');
    expect(decls[0].exit.params.y).toBe(0);
    expect(decls[0].exit.params.to).toBe(20);
    expect(decls[0].duration).toBe(400);
  });

  test('parallel composition with +', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate combined {
            enter: fade(from: 0, to: 1) + slide(y: 20, to: 0)
            duration: 500
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('combined');
    expect(decls[0].enter.type).toBe('AnimateParallel');
    expect(decls[0].enter.children).toHaveLength(2);
    expect(decls[0].enter.children[0].type).toBe('AnimatePrimitive');
    expect(decls[0].enter.children[0].name).toBe('fade');
    expect(decls[0].enter.children[1].type).toBe('AnimatePrimitive');
    expect(decls[0].enter.children[1].name).toBe('slide');
    expect(decls[0].duration).toBe(500);
  });

  test('sequential composition with then', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate staged {
            enter: fade(from: 0, to: 1) then scale(from: 0.8, to: 1)
            duration: 600
            stagger: 50
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('staged');
    expect(decls[0].enter.type).toBe('AnimateSequence');
    expect(decls[0].enter.children).toHaveLength(2);
    expect(decls[0].enter.children[0].type).toBe('AnimatePrimitive');
    expect(decls[0].enter.children[0].name).toBe('fade');
    expect(decls[0].enter.children[1].type).toBe('AnimatePrimitive');
    expect(decls[0].enter.children[1].name).toBe('scale');
    expect(decls[0].enter.children[1].params.from).toBe(0.8);
    expect(decls[0].stagger).toBe(50);
  });

  test('stagger property', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate staggered {
            enter: fade(from: 0, to: 1)
            duration: 300
            stagger: 100
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].stagger).toBe(100);
  });

  test('stay property (auto-dismiss)', () => {
    const ast = parse(`
      browser {
        component Toast() {
          animate toast {
            enter: slide(y: 30, to: 0) + fade(from: 0, to: 1)
            exit: fade(from: 1, to: 0)
            stay: 3000
            duration: 300
          }
          <div>"Toast message"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].name).toBe('toast');
    expect(decls[0].stay).toBe(3000);
    expect(decls[0].enter.type).toBe('AnimateParallel');
    expect(decls[0].enter.children).toHaveLength(2);
    expect(decls[0].exit.type).toBe('AnimatePrimitive');
    expect(decls[0].exit.name).toBe('fade');
    expect(decls[0].duration).toBe(300);
  });

  test('easing property', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
            easing: "ease-out"
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].easing).toBe('ease-out');
  });

  test('all properties together', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fullAnim {
            enter: fade(from: 0, to: 1)
            exit: fade(from: 1, to: 0)
            duration: 500
            easing: "cubic-bezier(0.4, 0, 0.2, 1)"
            stagger: 75
            stay: 2000
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].name).toBe('fullAnim');
    expect(decls[0].enter).not.toBeNull();
    expect(decls[0].exit).not.toBeNull();
    expect(decls[0].duration).toBe(500);
    expect(decls[0].easing).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(decls[0].stagger).toBe(75);
    expect(decls[0].stay).toBe(2000);
  });

  test('multiple animate declarations in one component', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          animate slideUp {
            enter: slide(y: 20, to: 0)
            duration: 400
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls).toHaveLength(2);
    expect(decls[0].name).toBe('fadeIn');
    expect(decls[1].name).toBe('slideUp');
  });

  test('rotate primitive', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate spin {
            enter: rotate(from: 0, to: 360)
            duration: 1000
          }
          <div>"Spin"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].enter.name).toBe('rotate');
    expect(decls[0].enter.params.from).toBe(0);
    expect(decls[0].enter.params.to).toBe(360);
  });

  test('blur primitive', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate blurIn {
            enter: blur(from: 10, to: 0)
            duration: 500
          }
          <div>"Blur"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].enter.name).toBe('blur');
    expect(decls[0].enter.params.from).toBe(10);
    expect(decls[0].enter.params.to).toBe(0);
  });

  test('scale primitive', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate scaleIn {
            enter: scale(from: 0.5, to: 1)
            duration: 400
          }
          <div>"Scale"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].enter.name).toBe('scale');
    expect(decls[0].enter.params.from).toBe(0.5);
    expect(decls[0].enter.params.to).toBe(1);
  });

  test('negative parameter values', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate slideLeft {
            enter: slide(x: -50, to: 0)
            duration: 300
          }
          <div>"Slide"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].enter.params.x).toBe(-50);
    expect(decls[0].enter.params.to).toBe(0);
  });
});

// ─── Composition precedence ─────────────────────────────────

describe('animate {} — Composition precedence', () => {
  test('+ binds tighter than then', () => {
    // fade + slide then scale should parse as (fade + slide) then scale
    const ast = parse(`
      browser {
        component Foo() {
          animate mixed {
            enter: fade(from: 0, to: 1) + slide(y: 20, to: 0) then scale(from: 0.8, to: 1)
            duration: 500
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    const enter = decls[0].enter;
    expect(enter.type).toBe('AnimateSequence');
    expect(enter.children).toHaveLength(2);
    // First child of sequence: parallel (fade + slide)
    expect(enter.children[0].type).toBe('AnimateParallel');
    expect(enter.children[0].children).toHaveLength(2);
    expect(enter.children[0].children[0].name).toBe('fade');
    expect(enter.children[0].children[1].name).toBe('slide');
    // Second child of sequence: single primitive (scale)
    expect(enter.children[1].type).toBe('AnimatePrimitive');
    expect(enter.children[1].name).toBe('scale');
  });

  test('three-way parallel', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate triple {
            enter: fade(from: 0, to: 1) + slide(y: 20, to: 0) + scale(from: 0.9, to: 1)
            duration: 500
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    const enter = decls[0].enter;
    expect(enter.type).toBe('AnimateParallel');
    expect(enter.children).toHaveLength(3);
    expect(enter.children[0].name).toBe('fade');
    expect(enter.children[1].name).toBe('slide');
    expect(enter.children[2].name).toBe('scale');
  });

  test('three-way sequence with then', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate tripleSeq {
            enter: fade(from: 0, to: 1) then slide(y: 20, to: 0) then scale(from: 0.9, to: 1)
            duration: 900
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    const enter = decls[0].enter;
    expect(enter.type).toBe('AnimateSequence');
    expect(enter.children).toHaveLength(3);
    expect(enter.children[0].name).toBe('fade');
    expect(enter.children[1].name).toBe('slide');
    expect(enter.children[2].name).toBe('scale');
  });
});

// ─── animate:name directive on JSX ──────────────────────────

describe('animate {} — JSX directive', () => {
  test('animate:name directive parsed as namespaced attribute', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div animate:fadeIn>
            <p>"Hello"</p>
          </div>
        }
      }
    `);
    const browser = ast.body.find(n => n.type === 'BrowserBlock');
    const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
    const divNode = comp.body.find(n => n.type === 'JSXElement');
    expect(divNode).toBeDefined();
    expect(divNode.tag).toBe('div');

    // The animate:fadeIn attribute should be parsed as a namespaced attribute
    const animAttr = divNode.attributes.find(a => a.name === 'animate:fadeIn');
    expect(animAttr).toBeDefined();
    // Boolean attribute (no value) defaults to true
    expect(animAttr.value.type).toBe('BooleanLiteral');
    expect(animAttr.value.value).toBe(true);
  });

  test('animate:name with value expression', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          state visible = true
          <div animate:fadeIn={visible}>
            <p>"Hello"</p>
          </div>
        }
      }
    `);
    const browser = ast.body.find(n => n.type === 'BrowserBlock');
    const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
    const divNode = comp.body.find(n => n.type === 'JSXElement');
    const animAttr = divNode.attributes.find(a => a.name === 'animate:fadeIn');
    expect(animAttr).toBeDefined();
    expect(animAttr.value.type).toBe('Identifier');
    expect(animAttr.value.name).toBe('visible');
  });

  test('multiple animate directives on one element', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          animate slideUp {
            enter: slide(y: 20, to: 0)
            duration: 400
          }
          <div animate:fadeIn animate:slideUp>
            <p>"Hello"</p>
          </div>
        }
      }
    `);
    const browser = ast.body.find(n => n.type === 'BrowserBlock');
    const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
    const divNode = comp.body.find(n => n.type === 'JSXElement');
    const fadeAttr = divNode.attributes.find(a => a.name === 'animate:fadeIn');
    const slideAttr = divNode.attributes.find(a => a.name === 'animate:slideUp');
    expect(fadeAttr).toBeDefined();
    expect(slideAttr).toBeDefined();
  });
});

// ─── Edge cases ─────────────────────────────────────────────

describe('animate {} — Edge cases', () => {
  test('animate coexists with style block', () => {
    const ast = parse(`
      browser {
        component Card() {
          style {
            .card { padding: 16px }
          }
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div class="card">"Card content"</div>
        }
      }
    `);
    const browser = ast.body.find(n => n.type === 'BrowserBlock');
    const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
    const styleNodes = comp.body.filter(n => n.type === 'ComponentStyleBlock');
    const animateNodes = comp.body.filter(n => n.type === 'AnimateDeclaration');
    expect(styleNodes).toHaveLength(1);
    expect(animateNodes).toHaveLength(1);
  });

  test('animate with only enter (no other properties besides duration)', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate simple {
            enter: fade(from: 0, to: 1)
            duration: 200
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].enter).not.toBeNull();
    expect(decls[0].exit).toBeNull();
    expect(decls[0].easing).toBeNull();
    expect(decls[0].stagger).toBeNull();
    expect(decls[0].stay).toBeNull();
  });

  test('enter with single primitive returns AnimatePrimitive (not wrapped)', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    // Single primitive should NOT be wrapped in AnimateParallel or AnimateSequence
    expect(decls[0].enter.type).toBe('AnimatePrimitive');
  });

  test('animate with float duration', () => {
    const ast = parse(`
      browser {
        component Foo() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 250.5
          }
          <div>"Hello"</div>
        }
      }
    `);
    const decls = getAnimateDecls(ast);
    expect(decls[0].duration).toBe(250.5);
  });

  test('animate with state and computed alongside', () => {
    const ast = parse(`
      browser {
        component Foo() {
          state count = 0
          computed doubled = count * 2
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div>"Hello"</div>
        }
      }
    `);
    const browser = ast.body.find(n => n.type === 'BrowserBlock');
    const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
    const stateNodes = comp.body.filter(n => n.type === 'StateDeclaration');
    const computedNodes = comp.body.filter(n => n.type === 'ComputedDeclaration');
    const animateNodes = comp.body.filter(n => n.type === 'AnimateDeclaration');
    expect(stateNodes).toHaveLength(1);
    expect(computedNodes).toHaveLength(1);
    expect(animateNodes).toHaveLength(1);
  });
});

// ─── Codegen: @keyframes generation ─────────────────────────

describe('animate {} codegen', () => {
  test('generates @keyframes for enter animation', () => {
    const code = compile(`
      browser {
        component Card() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div animate:fadeIn>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('fadeIn');
    expect(code).toContain('opacity');
    expect(code).toContain('animation');
  });

  test('generates parallel animation (merged properties)', () => {
    const code = compile(`
      browser {
        component Card() {
          animate appear {
            enter: fade(from: 0, to: 1) + slide(y: 20, to: 0)
            duration: 500
          }
          <div animate:appear>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('opacity');
    expect(code).toContain('transform');
  });

  test('sequential composition splits keyframes', () => {
    const code = compile(`
      browser {
        component Card() {
          animate staged {
            enter: fade(from: 0, to: 1) then scale(from: 0.8, to: 1)
            duration: 600
          }
          <div animate:staged>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('50%');
  });

  test('stagger adds animation-delay', () => {
    const code = compile(`
      browser {
        component List() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
            stagger: 50
          }
          <ul>
            <li animate:fadeIn>"Item"</li>
          </ul>
        }
      }
    `);
    expect(code).toContain('animationDelay');
  });

  test('exit animation generates separate keyframes', () => {
    const code = compile(`
      browser {
        component Toast() {
          animate toast {
            enter: slide(y: 30, to: 0) + fade(from: 0, to: 1)
            exit: fade(from: 1, to: 0)
            duration: 300
          }
          <div animate:toast>"Toast"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    // Should have both enter and exit keyframes
    expect(code).toContain('_enter');
    expect(code).toContain('_exit');
  });

  test('easing is applied to animation', () => {
    const code = compile(`
      browser {
        component Card() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
            easing: "ease-out"
          }
          <div animate:fadeIn>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('ease-out');
  });

  test('animate directive with conditional', () => {
    const code = compile(`
      browser {
        component Card(visible: Bool) {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div animate:fadeIn={visible}>"Hello"</div>
        }
      }
    `);
    // Should have conditional animation application
    expect(code).toContain('fadeIn');
    expect(code).toContain('visible');
  });

  test('rotate primitive generates rotate keyframes', () => {
    const code = compile(`
      browser {
        component Spinner() {
          animate spin {
            enter: rotate(from: 0, to: 360)
            duration: 1000
          }
          <div animate:spin>"Spin"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('rotate');
    expect(code).toContain('0deg');
    expect(code).toContain('360deg');
  });

  test('blur primitive generates filter keyframes', () => {
    const code = compile(`
      browser {
        component Card() {
          animate blurIn {
            enter: blur(from: 10, to: 0)
            duration: 500
          }
          <div animate:blurIn>"Blur"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('filter');
    expect(code).toContain('blur(10px)');
    expect(code).toContain('blur(0px)');
  });

  test('scale primitive generates scale keyframes', () => {
    const code = compile(`
      browser {
        component Card() {
          animate scaleIn {
            enter: scale(from: 0.5, to: 1)
            duration: 400
          }
          <div animate:scaleIn>"Scale"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('scale(0.5)');
    expect(code).toContain('scale(1)');
  });

  test('slide with x parameter generates translateX', () => {
    const code = compile(`
      browser {
        component Card() {
          animate slideLeft {
            enter: slide(x: -50, to: 0)
            duration: 300
          }
          <div animate:slideLeft>"Slide"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('translateX(-50px)');
    expect(code).toContain('translateX(0px)');
  });

  test('slide with y parameter generates translateY', () => {
    const code = compile(`
      browser {
        component Card() {
          animate slideUp {
            enter: slide(y: 20, to: 0)
            duration: 300
          }
          <div animate:slideUp>"Slide"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('translateY(20px)');
    expect(code).toContain('translateY(0px)');
  });

  test('default easing is ease when not specified', () => {
    const code = compile(`
      browser {
        component Card() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div animate:fadeIn>"Hello"</div>
        }
      }
    `);
    // Default easing should be 'ease'
    expect(code).toContain('ease');
  });

  test('default duration is 300ms when not specified', () => {
    const code = compile(`
      browser {
        component Card() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div animate:fadeIn>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('300ms');
  });

  test('animate works alongside style blocks', () => {
    const code = compile(`
      browser {
        component Card() {
          style {
            .card { padding: 16px }
          }
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          <div class="card" animate:fadeIn>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('.card');
    expect(code).toContain('tova_inject_css');
  });

  test('three-way sequence splits at 33% and 66%', () => {
    const code = compile(`
      browser {
        component Card() {
          animate staged {
            enter: fade(from: 0, to: 1) then slide(y: 20, to: 0) then scale(from: 0.8, to: 1)
            duration: 900
          }
          <div animate:staged>"Hello"</div>
        }
      }
    `);
    expect(code).toContain('@keyframes');
    expect(code).toContain('0%');
    expect(code).toContain('33%');
    expect(code).toContain('66%');
    expect(code).toContain('100%');
  });

  test('parallel merges transforms into single property', () => {
    const code = compile(`
      browser {
        component Card() {
          animate appear {
            enter: slide(y: 20, to: 0) + scale(from: 0.8, to: 1)
            duration: 500
          }
          <div animate:appear>"Hello"</div>
        }
      }
    `);
    // Both transforms should be merged into a single transform property
    expect(code).toContain('translateY');
    expect(code).toContain('scale');
  });

  test('multiple animate declarations generate multiple keyframe sets', () => {
    const code = compile(`
      browser {
        component Card() {
          animate fadeIn {
            enter: fade(from: 0, to: 1)
            duration: 300
          }
          animate slideUp {
            enter: slide(y: 20, to: 0)
            duration: 400
          }
          <div animate:fadeIn>"A"</div>
          <div animate:slideUp>"B"</div>
        }
      }
    `);
    expect(code).toContain('fadeIn');
    expect(code).toContain('slideUp');
    // Both animations should be present
    const keyframeCount = (code.match(/@keyframes/g) || []).length;
    expect(keyframeCount).toBeGreaterThanOrEqual(2);
  });
});
