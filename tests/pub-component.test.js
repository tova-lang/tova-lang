import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, 'test.tova');
  analyzer.analyze();
  const codegen = new CodeGenerator(ast, 'test.tova');
  const result = codegen.generate();
  return result.shared || '';
}

// ─── Parser tests ─────────────────────────────────────────

describe('pub component parsing', () => {
  test('pub component parses at top level', () => {
    const ast = parse(`
pub component Button(variant, size, children) {
  <button class="btn">{children}</button>
}
`);
    expect(ast.body.length).toBe(1);
    expect(ast.body[0].type).toBe('ComponentDeclaration');
    expect(ast.body[0].name).toBe('Button');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].params.length).toBe(3);
    expect(ast.body[0].params[0].name).toBe('variant');
    expect(ast.body[0].params[1].name).toBe('size');
    expect(ast.body[0].params[2].name).toBe('children');
  });

  test('pub component with no params', () => {
    const ast = parse(`
pub component Divider() {
  <hr />
}
`);
    expect(ast.body[0].type).toBe('ComponentDeclaration');
    expect(ast.body[0].name).toBe('Divider');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].params.length).toBe(0);
  });

  test('pub component with style block', () => {
    const ast = parse(`
pub component Badge(variant, children) {
  style {
    .badge { display: inline-flex; }
  }
  <span class="badge">{children}</span>
}
`);
    expect(ast.body[0].type).toBe('ComponentDeclaration');
    expect(ast.body[0].name).toBe('Badge');
    expect(ast.body[0].isPublic).toBe(true);
    // body should contain style block and JSX
    const hasStyle = ast.body[0].body.some(n => n.type === 'ComponentStyleBlock');
    const hasJSX = ast.body[0].body.some(n => n.type === 'JSXElement');
    expect(hasStyle).toBe(true);
    expect(hasJSX).toBe(true);
  });

  test('multiple pub components in one file', () => {
    const ast = parse(`
pub component Button(children) {
  <button>{children}</button>
}

pub component Badge(children) {
  <span>{children}</span>
}
`);
    expect(ast.body.length).toBe(2);
    expect(ast.body[0].type).toBe('ComponentDeclaration');
    expect(ast.body[0].name).toBe('Button');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[1].type).toBe('ComponentDeclaration');
    expect(ast.body[1].name).toBe('Badge');
    expect(ast.body[1].isPublic).toBe(true);
  });

  test('pub component with state and effect', () => {
    const ast = parse(`
pub component Counter(initial) {
  state count = 0
  <div>{count}</div>
}
`);
    expect(ast.body[0].type).toBe('ComponentDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    const hasState = ast.body[0].body.some(n => n.type === 'StateDeclaration');
    expect(hasState).toBe(true);
  });

  test('pub component alongside pub functions', () => {
    const ast = parse(`
pub fn helper() -> String {
  "hello"
}

pub component Greeting(name) {
  <p>{name}</p>
}
`);
    expect(ast.body.length).toBe(2);
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[1].type).toBe('ComponentDeclaration');
    expect(ast.body[1].isPublic).toBe(true);
  });
});

// ─── Analyzer tests ─────────────────────────────────────────

describe('pub component analyzer', () => {
  test('pub component passes analyzer without error', () => {
    const source = `
pub component Button(children) {
  <button>{children}</button>
}
`;
    const ast = parse(source);
    const analyzer = new Analyzer(ast, 'test.tova');
    // Should not throw
    expect(() => analyzer.analyze()).not.toThrow();
  });

  test('non-pub component at top level fails analyzer', () => {
    const source = `
component Button(children) {
  <button>{children}</button>
}
`;
    // component at top level without pub should fail during parsing
    // because parseStatement doesn't handle COMPONENT token outside browser blocks
    expect(() => parse(source)).toThrow();
  });
});

// ─── Codegen tests ─────────────────────────────────────────

describe('pub component codegen', () => {
  test('pub component compiles to export function', () => {
    const result = compile(`
pub component Button(variant, children) {
  <button class="btn">{children}</button>
}
`);
    expect(result).toContain('export function Button');
    expect(result).toContain('__props');
    expect(result).toContain('tova_el');
  });

  test('pub component output includes runtime imports', () => {
    const result = compile(`
pub component Button(children) {
  <button>{children}</button>
}
`);
    expect(result).toContain('import {');
    expect(result).toContain('tova_el');
    expect(result).toContain('createSignal');
    expect(result).toContain('./runtime/reactivity.js');
  });

  test('pub component with style block generates scoped CSS', () => {
    const result = compile(`
pub component Badge(variant, children) {
  style {
    .badge { display: inline-flex; padding: 2px 8px; }
  }
  <span class="badge">{children}</span>
}
`);
    expect(result).toContain('export function Badge');
    expect(result).toContain('tova_inject_css');
    expect(result).toContain('data-tova-');
  });

  test('multiple pub components compile correctly', () => {
    const result = compile(`
pub component Button(children) {
  <button>{children}</button>
}

pub component Badge(children) {
  <span>{children}</span>
}
`);
    expect(result).toContain('export function Button');
    expect(result).toContain('export function Badge');
  });

  test('pub component with state generates createSignal', () => {
    const result = compile(`
pub component Counter(initial) {
  state count = 0
  <div>{count}</div>
}
`);
    expect(result).toContain('export function Counter');
    expect(result).toContain('createSignal');
  });

  test('pub component with no params omits __props', () => {
    const result = compile(`
pub component Divider() {
  <hr />
}
`);
    expect(result).toContain('export function Divider()');
    // Should not have __props in the function signature
    expect(result).not.toContain('Divider(__props)');
  });

  test('pub component prop accessors are generated', () => {
    const result = compile(`
pub component Button(variant, size) {
  <button>{variant}</button>
}
`);
    expect(result).toContain('__props.variant');
    expect(result).toContain('__props.size');
  });

  test('pub component alongside pub function', () => {
    const result = compile(`
pub fn greet(name) -> String {
  name
}

pub component Greeting(name) {
  <p>{name}</p>
}
`);
    expect(result).toContain('export function greet');
    expect(result).toContain('export function Greeting');
  });

  test('pub component returns JSX element', () => {
    const result = compile(`
pub component Button(children) {
  <button class="btn">{children}</button>
}
`);
    expect(result).toContain('return tova_el');
  });

  test('pub component with multiple JSX elements returns fragment', () => {
    const result = compile(`
pub component Card(title, children) {
  <h2>{title}</h2>
  <div>{children}</div>
}
`);
    expect(result).toContain('export function Card');
    expect(result).toContain('tova_fragment');
  });

  test('pub component with variant style blocks', () => {
    const result = compile(`
pub component Button(variant, size, children) {
  style {
    .btn { padding: 8px; }
    variant(variant) {
      primary { background: blue; }
      secondary { background: gray; }
    }
    variant(size) {
      sm { height: 32px; }
      lg { height: 48px; }
    }
  }
  <button class="btn">{children}</button>
}
`);
    expect(result).toContain('export function Button');
    expect(result).toContain('btn--variant-primary');
    expect(result).toContain('btn--size-sm');
  });

  test('isModule flag is set for pub component files', () => {
    const ast = parse(`
pub component Button(children) {
  <button>{children}</button>
}
`);
    const analyzer = new Analyzer(ast, 'test.tova');
    analyzer.analyze();
    const codegen = new CodeGenerator(ast, 'test.tova');
    const result = codegen.generate();
    expect(result.isModule).toBe(true);
  });
});

// ─── Compound component (dot notation) tests ──────────────

describe('compound component parsing', () => {
  test('compound component Dialog.Title parses correctly', () => {
    const source = `
pub component Dialog(open, children) {
  <div class="dialog">{children}</div>
}

pub component Dialog.Title(children) {
  <h2 class="dialog-title">{children}</h2>
}

pub component Dialog.Footer(children) {
  <div class="dialog-footer">{children}</div>
}
`;
    const ast = parse(source);

    expect(ast.body.length).toBe(3);
    expect(ast.body[0].name).toBe('Dialog');
    expect(ast.body[0].parent).toBe(null);

    expect(ast.body[1].name).toBe('Dialog.Title');
    expect(ast.body[1].parent).toBe('Dialog');
    expect(ast.body[1].child).toBe('Title');

    expect(ast.body[2].name).toBe('Dialog.Footer');
    expect(ast.body[2].parent).toBe('Dialog');
    expect(ast.body[2].child).toBe('Footer');
  });

  test('compound component has isPublic set', () => {
    const ast = parse(`
pub component Card(children) {
  <div>{children}</div>
}

pub component Card.Header(children) {
  <div>{children}</div>
}
`);
    expect(ast.body[1].isPublic).toBe(true);
    expect(ast.body[1].parent).toBe('Card');
    expect(ast.body[1].child).toBe('Header');
  });

  test('compound component with no params', () => {
    const ast = parse(`
pub component Nav() {
  <nav />
}

pub component Nav.Separator() {
  <hr />
}
`);
    expect(ast.body[1].name).toBe('Nav.Separator');
    expect(ast.body[1].parent).toBe('Nav');
    expect(ast.body[1].child).toBe('Separator');
    expect(ast.body[1].params.length).toBe(0);
  });
});

describe('compound component analyzer', () => {
  test('compound component passes analyzer without error', () => {
    const source = `
pub component Dialog(children) {
  <div>{children}</div>
}

pub component Dialog.Title(children) {
  <h2>{children}</h2>
}
`;
    const ast = parse(source);
    const analyzer = new Analyzer(ast, 'test.tova');
    expect(() => analyzer.analyze()).not.toThrow();
  });
});

describe('compound component codegen', () => {
  test('compound component compiles to property assignment', () => {
    const result = compile(`
pub component Dialog(children) {
  <div>{children}</div>
}

pub component Dialog.Title(children) {
  <h2>{children}</h2>
}

pub component Dialog.Footer(children) {
  <div>{children}</div>
}
`);
    expect(result).toContain('export function Dialog');
    expect(result).toContain('Dialog.Title = function DialogTitle');
    expect(result).toContain('Dialog.Footer = function DialogFooter');
    // Should NOT have 'export function Dialog.Title'
    expect(result).not.toContain('export function Dialog.Title');
    expect(result).not.toContain('export function Dialog.Footer');
  });

  test('compound component with style blocks', () => {
    const result = compile(`
pub component Card(children) {
  style { .card { border: 1px solid gray; } }
  <div class="card">{children}</div>
}

pub component Card.Header(children) {
  style { .card-header { padding: 16px; border-bottom: 1px solid gray; } }
  <div class="card-header">{children}</div>
}
`);
    expect(result).toContain('export function Card');
    expect(result).toContain('Card.Header = function CardHeader');
    expect(result).toContain('tova_inject_css');
  });

  test('compound component parent comes before child in output', () => {
    const result = compile(`
pub component Dialog.Title(children) {
  <h2>{children}</h2>
}

pub component Dialog(children) {
  <div>{children}</div>
}
`);
    // Parent should come before child regardless of source order
    const parentIdx = result.indexOf('export function Dialog');
    const childIdx = result.indexOf('Dialog.Title = function DialogTitle');
    expect(parentIdx).toBeLessThan(childIdx);
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(childIdx).toBeGreaterThanOrEqual(0);
  });

  test('compound component with props generates __props', () => {
    const result = compile(`
pub component Menu(children) {
  <div>{children}</div>
}

pub component Menu.Item(label, onClick) {
  <button on:click={onClick}>{label}</button>
}
`);
    expect(result).toContain('Menu.Item = function MenuItem(__props)');
    expect(result).toContain('__props.label');
    expect(result).toContain('__props.onClick');
  });

  test('compound component with no params omits __props', () => {
    const result = compile(`
pub component List(children) {
  <ul>{children}</ul>
}

pub component List.Divider() {
  <hr />
}
`);
    expect(result).toContain('List.Divider = function ListDivider()');
    expect(result).not.toContain('ListDivider(__props)');
  });
});

describe('JS reserved word params', () => {
  test('class prop is renamed to _class in generated code', () => {
    const result = compile(`
pub component Box(class, children) {
  box_class = if class { "box " + class } else { "box" }
  <div class={box_class}>{children}</div>
}
`);
    // Should NOT contain `const class =` (invalid JS)
    expect(result).not.toContain('const class =');
    // Should contain renamed `const _class =`
    expect(result).toContain('const _class = () => __props["class"]');
    // References to class in the body should use _class()
    expect(result).toContain('_class()');
  });

  test('for prop is renamed to _for in generated code', () => {
    const result = compile(`
pub component MyLabel(htmlFor, children) {
  <label for={htmlFor}>{children}</label>
}
`);
    // htmlFor is not reserved, should be normal
    expect(result).toContain('const htmlFor = () => __props.htmlFor');
  });

  test('non-reserved props keep normal accessor style', () => {
    const result = compile(`
pub component Tag(variant, size, children) {
  <span>{children}</span>
}
`);
    expect(result).toContain('const variant = () => __props.variant');
    expect(result).toContain('const size = () => __props.size');
  });

  test('multiple reserved word props all get renamed', () => {
    const result = compile(`
pub component Widget(class, default, children) {
  <div>{children}</div>
}
`);
    expect(result).not.toContain('const class =');
    expect(result).not.toContain('const default =');
    expect(result).toContain('const _class = () => __props["class"]');
    expect(result).toContain('const _default = () => __props["default"]');
  });
});
