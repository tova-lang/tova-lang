import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { FontDeclaration } from '../src/parser/browser-ast.js';

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

describe('font loading', () => {

  // ─── AST Node ────────────────────────────────────────────
  describe('AST', () => {
    test('FontDeclaration has correct type and fields', () => {
      const node = new FontDeclaration('heading', 'https://fonts.example.com/inter.css', null, { line: 1 });
      expect(node.type).toBe('FontDeclaration');
      expect(node.name).toBe('heading');
      expect(node.source).toBe('https://fonts.example.com/inter.css');
      expect(node.config).toBeNull();
      expect(node.loc).toBeTruthy();
    });

    test('FontDeclaration with config', () => {
      const config = { weight: '400', style: 'normal', display: 'swap' };
      const node = new FontDeclaration('mono', './fonts/FiraCode.woff2', config, { line: 5 });
      expect(node.config.weight).toBe('400');
      expect(node.config.style).toBe('normal');
      expect(node.config.display).toBe('swap');
    });
  });

  // ─── Parser ──────────────────────────────────────────────
  describe('parser', () => {
    test('parses font declaration with remote URL', () => {
      const ast = parse(`
        browser {
          component Title() {
            font heading from "https://fonts.googleapis.com/css2?family=Inter"
            <h1>"Hello"</h1>
          }
        }
      `);
      const browser = ast.body.find(n => n.type === 'BrowserBlock');
      const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
      const fontDecl = comp.body.find(n => n.type === 'FontDeclaration');
      expect(fontDecl).toBeTruthy();
      expect(fontDecl.name).toBe('heading');
      expect(fontDecl.source).toContain('fonts.googleapis.com');
      expect(fontDecl.config).toBeNull();
    });

    test('parses font declaration with local path and config', () => {
      const ast = parse(`
        browser {
          component Title() {
            font mono from "./fonts/FiraCode.woff2" {
              weight: "400"
              style: "normal"
              display: "swap"
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      const browser = ast.body.find(n => n.type === 'BrowserBlock');
      const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
      const fontDecl = comp.body.find(n => n.type === 'FontDeclaration');
      expect(fontDecl).toBeTruthy();
      expect(fontDecl.name).toBe('mono');
      expect(fontDecl.source).toContain('FiraCode.woff2');
      expect(fontDecl.config).toBeTruthy();
      expect(fontDecl.config.weight).toBe('400');
      expect(fontDecl.config.style).toBe('normal');
      expect(fontDecl.config.display).toBe('swap');
    });

    test('parses multiple font declarations in one component', () => {
      const ast = parse(`
        browser {
          component App() {
            font heading from "https://fonts.googleapis.com/css2?family=Inter:wght@700"
            font mono from "./fonts/FiraCode.woff2" {
              weight: "400"
              display: "swap"
            }
            <div>"Hello"</div>
          }
        }
      `);
      const browser = ast.body.find(n => n.type === 'BrowserBlock');
      const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
      const fontDecls = comp.body.filter(n => n.type === 'FontDeclaration');
      expect(fontDecls.length).toBe(2);
      expect(fontDecls[0].name).toBe('heading');
      expect(fontDecls[1].name).toBe('mono');
    });

    test('font declaration coexists with style block', () => {
      const ast = parse(`
        browser {
          component Title() {
            font heading from "https://fonts.googleapis.com/css2?family=Inter"
            style {
              h1 { font-family: "Inter", sans-serif; }
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      const browser = ast.body.find(n => n.type === 'BrowserBlock');
      const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
      const fontDecl = comp.body.find(n => n.type === 'FontDeclaration');
      const styleBlock = comp.body.find(n => n.type === 'ComponentStyleBlock');
      expect(fontDecl).toBeTruthy();
      expect(styleBlock).toBeTruthy();
    });

    test('parses font config with only weight', () => {
      const ast = parse(`
        browser {
          component Title() {
            font bold from "./fonts/Bold.woff2" {
              weight: "700"
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      const browser = ast.body.find(n => n.type === 'BrowserBlock');
      const comp = browser.body.find(n => n.type === 'ComponentDeclaration');
      const fontDecl = comp.body.find(n => n.type === 'FontDeclaration');
      expect(fontDecl.config).toBeTruthy();
      expect(fontDecl.config.weight).toBe('700');
      expect(fontDecl.config.style).toBeUndefined();
      expect(fontDecl.config.display).toBeUndefined();
    });
  });

  // ─── Codegen ─────────────────────────────────────────────
  describe('codegen', () => {
    test('emits __tova_load_font for remote URL', () => {
      const code = compile(`
        browser {
          component Title() {
            font heading from "https://fonts.googleapis.com/css2?family=Inter"
            <h1>"Hello"</h1>
          }
        }
      `);
      expect(code).toContain('__tova_load_font');
      expect(code).toContain('fonts.googleapis.com');
    });

    test('emits @font-face for local font', () => {
      const code = compile(`
        browser {
          component Title() {
            font mono from "./fonts/FiraCode.woff2" {
              weight: "400"
              style: "normal"
              display: "swap"
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      expect(code).toContain('@font-face');
      expect(code).toContain('font-family');
      expect(code).toContain('mono');
      expect(code).toContain('font-display: swap');
    });

    test('emits @font-face with default font-display swap for local font without display config', () => {
      const code = compile(`
        browser {
          component Title() {
            font custom from "./fonts/Custom.woff2" {
              weight: "400"
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      expect(code).toContain('@font-face');
      expect(code).toContain('font-display: swap');
    });

    test('runtime import includes __tova_load_font when remote fonts are used', () => {
      const code = compile(`
        browser {
          component Title() {
            font heading from "https://fonts.googleapis.com/css2?family=Inter"
            <h1>"Hello"</h1>
          }
        }
      `);
      expect(code).toContain('__tova_load_font');
    });

    test('local fonts use tova_inject_css, not __tova_load_font', () => {
      const code = compile(`
        browser {
          component Title() {
            font mono from "./fonts/FiraCode.woff2" {
              weight: "400"
              display: "swap"
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      expect(code).toContain('tova_inject_css');
      expect(code).toContain('@font-face');
    });

    test('multiple fonts in one component', () => {
      const code = compile(`
        browser {
          component App() {
            font heading from "https://fonts.googleapis.com/css2?family=Inter:wght@700"
            font mono from "./fonts/FiraCode.woff2" {
              weight: "400"
              display: "swap"
            }
            <div>"Hello"</div>
          }
        }
      `);
      expect(code).toContain('__tova_load_font');
      expect(code).toContain('@font-face');
      expect(code).toContain('fonts.googleapis.com');
      expect(code).toContain('mono');
    });

    test('font-weight is emitted in @font-face when config has weight', () => {
      const code = compile(`
        browser {
          component Title() {
            font mono from "./fonts/FiraCode.woff2" {
              weight: "400"
              style: "italic"
            }
            <h1>"Hello"</h1>
          }
        }
      `);
      expect(code).toContain('font-weight: 400');
      expect(code).toContain('font-style: italic');
    });
  });
});
