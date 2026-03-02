import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

describe('Theme block — parsing', () => {
  test('parses empty theme block', () => {
    const ast = parse('theme {}');
    expect(ast.body.length).toBe(1);
    expect(ast.body[0].type).toBe('ThemeBlock');
    expect(ast.body[0].sections).toEqual([]);
  });

  test('parses colors section with simple tokens', () => {
    const ast = parse(`theme {
      colors {
        primary: "#3b82f6"
        text: "#1e293b"
      }
    }`);
    const theme = ast.body[0];
    expect(theme.sections.length).toBe(1);
    expect(theme.sections[0].name).toBe('colors');
    expect(theme.sections[0].tokens.length).toBe(2);
    expect(theme.sections[0].tokens[0].name).toBe('primary');
    expect(theme.sections[0].tokens[0].value).toBe('#3b82f6');
  });

  test('parses dot-notation token names', () => {
    const ast = parse(`theme {
      colors {
        primary.hover: "#2563eb"
        text.muted: "#64748b"
      }
    }`);
    const tokens = ast.body[0].sections[0].tokens;
    expect(tokens[0].name).toBe('primary.hover');
    expect(tokens[1].name).toBe('text.muted');
  });

  test('parses numeric values (spacing, radius)', () => {
    const ast = parse(`theme {
      spacing {
        sm: 8
        md: 16
      }
      radius {
        md: 8
        full: 9999
      }
    }`);
    const theme = ast.body[0];
    expect(theme.sections.length).toBe(2);
    expect(theme.sections[0].tokens[0].value).toBe(8);
    expect(theme.sections[1].tokens[1].value).toBe(9999);
  });

  test('parses font section with string and numeric values', () => {
    const ast = parse(`theme {
      font {
        sans: "Inter, system-ui, sans-serif"
        size.base: 16
        size.lg: 20
      }
    }`);
    const tokens = ast.body[0].sections[0].tokens;
    expect(tokens[0].name).toBe('sans');
    expect(tokens[0].value).toBe('Inter, system-ui, sans-serif');
    expect(tokens[1].name).toBe('size.base');
    expect(tokens[1].value).toBe(16);
  });

  test('parses breakpoints section', () => {
    const ast = parse(`theme {
      breakpoints {
        mobile: 0
        tablet: 768
        desktop: 1024
      }
    }`);
    const tokens = ast.body[0].sections[0].tokens;
    expect(tokens.length).toBe(3);
    expect(tokens[1].name).toBe('tablet');
    expect(tokens[1].value).toBe(768);
  });

  test('parses transition section', () => {
    const ast = parse(`theme {
      transition {
        fast: "150ms ease"
        normal: "200ms ease"
      }
    }`);
    const tokens = ast.body[0].sections[0].tokens;
    expect(tokens[0].name).toBe('fast');
    expect(tokens[0].value).toBe('150ms ease');
  });

  test('parses dark section as flat overrides', () => {
    const ast = parse(`theme {
      colors {
        surface: "#ffffff"
        text: "#1e293b"
      }
      dark {
        colors.surface: "#0f172a"
        colors.text: "#e2e8f0"
      }
    }`);
    const theme = ast.body[0];
    expect(theme.darkOverrides.length).toBe(2);
    expect(theme.darkOverrides[0].name).toBe('colors.surface');
    expect(theme.darkOverrides[0].value).toBe('#0f172a');
  });

  test('parses shadow section with complex string values', () => {
    const ast = parse(`theme {
      shadow {
        sm: "0 1px 2px rgba(0,0,0,0.05)"
        md: "0 4px 6px rgba(0,0,0,0.1)"
      }
    }`);
    const tokens = ast.body[0].sections[0].tokens;
    expect(tokens[0].value).toBe('0 1px 2px rgba(0,0,0,0.05)');
  });

  test('parses full theme block with all sections', () => {
    const ast = parse(`theme {
      colors {
        primary: "#3b82f6"
        primary.hover: "#2563eb"
      }
      spacing {
        sm: 8
        md: 16
      }
      radius {
        md: 8
      }
      shadow {
        sm: "0 1px 2px rgba(0,0,0,0.05)"
      }
      font {
        sans: "Inter, system-ui, sans-serif"
        size.base: 16
      }
      breakpoints {
        mobile: 0
        tablet: 768
      }
      transition {
        normal: "200ms ease"
      }
      dark {
        colors.primary: "#60a5fa"
      }
    }`);
    const theme = ast.body[0];
    expect(theme.sections.length).toBe(7);
    expect(theme.darkOverrides.length).toBe(1);
  });

  test('theme coexists with browser block', () => {
    const ast = parse(`theme {
      colors {
        primary: "#3b82f6"
      }
    }
    browser {
      component App {
        <div>"Hello"</div>
      }
    }`);
    expect(ast.body.length).toBe(2);
    expect(ast.body[0].type).toBe('ThemeBlock');
    expect(ast.body[1].type).toBe('BrowserBlock');
  });
});

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  analyzer.analyze();
  return analyzer.warnings;
}

describe('Theme block — analyzer', () => {
  test('warns on unknown section name', () => {
    const warnings = analyze('theme { foo { bar: 42 } }');
    expect(warnings.some(w => w.code === 'W_UNKNOWN_THEME_SECTION')).toBe(true);
  });

  test('warns on duplicate section', () => {
    const warnings = analyze('theme { colors { a: "#f00" } colors { b: "#0f0" } }');
    expect(warnings.some(w => w.code === 'W_DUPLICATE_THEME_SECTION')).toBe(true);
  });

  test('warns on duplicate token within section', () => {
    const warnings = analyze('theme { colors { primary: "#f00" primary: "#0f0" } }');
    expect(warnings.some(w => w.code === 'W_DUPLICATE_THEME_TOKEN')).toBe(true);
  });

  test('warns on multiple theme blocks', () => {
    const warnings = analyze('theme { colors { a: "#f00" } } theme { spacing { b: 8 } }');
    expect(warnings.some(w => w.code === 'W_MULTIPLE_THEME_BLOCKS')).toBe(true);
  });

  test('no warnings on valid theme', () => {
    const warnings = analyze(`theme {
      colors { primary: "#f00" secondary: "#0f0" }
      spacing { sm: 8 md: 16 }
      dark { colors.primary: "#f88" }
    }`);
    const themeWarnings = warnings.filter(w => w.code && w.code.startsWith('W_') && w.code.includes('THEME'));
    expect(themeWarnings.length).toBe(0);
  });

  test('warns on dark override referencing unknown section', () => {
    const warnings = analyze(`theme {
      colors { primary: "#f00" }
      dark { bogus.thing: "#fff" }
    }`);
    expect(warnings.some(w => w.code === 'W_DARK_OVERRIDE_UNKNOWN_SECTION')).toBe(true);
  });
});
