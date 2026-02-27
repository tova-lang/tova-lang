import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { TokenType } from '../src/lexer/tokens.js';
import {
  FormDeclaration, FormFieldDeclaration, FormGroupDeclaration,
  FormArrayDeclaration, FormValidator, FormStepsDeclaration, FormStep
} from '../src/parser/form-ast.js';

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

describe('Form Block — Lexer', () => {
  test('form keyword produces FORM token', () => {
    const lexer = new Lexer('form');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.FORM);
  });

  test('field keyword produces FIELD token', () => {
    const lexer = new Lexer('field');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.FIELD);
  });

  test('group keyword produces GROUP token', () => {
    const lexer = new Lexer('group');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.GROUP);
  });

  test('steps keyword produces STEPS token', () => {
    const lexer = new Lexer('steps');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.STEPS);
  });
});

describe('Form Block — AST Nodes', () => {
  test('FormDeclaration has correct type and fields', () => {
    const node = new FormDeclaration('checkout', null, [], [], [], [], null, null, { line: 1 });
    expect(node.type).toBe('FormDeclaration');
    expect(node.name).toBe('checkout');
  });

  test('FormFieldDeclaration has correct type and fields', () => {
    const node = new FormFieldDeclaration('email', null, null, [], { line: 1 });
    expect(node.type).toBe('FormFieldDeclaration');
    expect(node.name).toBe('email');
    expect(node.validators).toEqual([]);
  });

  test('FormGroupDeclaration with condition', () => {
    const cond = { type: 'UnaryExpression', operator: '!' };
    const node = new FormGroupDeclaration('billing', cond, [], [], { line: 1 });
    expect(node.type).toBe('FormGroupDeclaration');
    expect(node.condition).toBe(cond);
  });

  test('FormArrayDeclaration has correct type', () => {
    const node = new FormArrayDeclaration('lineItems', [], [], { line: 1 });
    expect(node.type).toBe('FormArrayDeclaration');
  });

  test('FormValidator has async flag', () => {
    const v = new FormValidator('validate', [{ type: 'Identifier' }], true, { line: 1 });
    expect(v.type).toBe('FormValidator');
    expect(v.isAsync).toBe(true);
  });

  test('FormStepsDeclaration with steps', () => {
    const s = new FormStep('Shipping', ['shipping'], { line: 1 });
    const steps = new FormStepsDeclaration([s], { line: 1 });
    expect(steps.type).toBe('FormStepsDeclaration');
    expect(steps.steps[0].label).toBe('Shipping');
    expect(steps.steps[0].members).toEqual(['shipping']);
  });

  test('AST nodes re-exported from ast.js', async () => {
    const ast = await import('../src/parser/ast.js');
    expect(ast.FormDeclaration).toBeDefined();
    expect(ast.FormFieldDeclaration).toBeDefined();
    expect(ast.FormGroupDeclaration).toBeDefined();
    expect(ast.FormArrayDeclaration).toBeDefined();
    expect(ast.FormValidator).toBeDefined();
    expect(ast.FormStepsDeclaration).toBeDefined();
    expect(ast.FormStep).toBeDefined();
  });
});

describe('Form Block — Parser (simple form)', () => {
  test('form with a single field parses without error', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with field and validators parses without error', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = "" {
            required("Email is required")
            email("Invalid email")
          }
          field password: String = "" {
            required("Password is required")
            minLength(8, "Too short")
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form at browser block top-level parses without error', () => {
    const src = `browser {
      form settings {
        field theme: String = "light"
      }
      component App() {
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with on submit parses without error', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          on submit {
            print(login.values)
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });
});
