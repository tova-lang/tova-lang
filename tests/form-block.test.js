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

describe('Form Block — Parser (groups, arrays, steps)', () => {
  test('form with group parses without error', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = "" { required("Required") }
            field city: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with conditional group parses without error', () => {
    const src = `browser {
      component App() {
        form checkout {
          field sameAsShipping: Bool = true
          group billing when !sameAsShipping {
            field street: String = "" { required("Required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with nested groups parses without error', () => {
    const src = `browser {
      component App() {
        form checkout {
          group billing {
            field sameAsShipping: Bool = true
            group address when !sameAsShipping {
              field street: String = ""
            }
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with array parses without error', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = "" { required("Required") }
            field quantity: Int = 1 { min(1, "At least 1") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with steps parses without error', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = ""
          group profile {
            field name: String = ""
          }
          steps {
            step "Account" { email }
            step "Profile" { profile }
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with all features combined', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = "" {
            required("Email required")
            email("Invalid")
          }
          group shipping {
            field street: String = "" { required("Required") }
            field city: String = "" { required("Required") }
          }
          array lineItems {
            field description: String = ""
            field qty: Int = 1
          }
          steps {
            step "Info" { email }
            step "Shipping" { shipping }
            step "Items" { lineItems }
          }
          on submit {
            print("submitted")
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with async validator parses without error', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = "" {
            required("Required")
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });

  test('form with type annotation parses without error', () => {
    const src = `browser {
      component App() {
        form order: OrderRequest {
          field email: String = ""
          on submit {
            print("ok")
          }
        }
        <div>"hello"</div>
      }
    }`;
    expect(() => compile(src)).not.toThrow();
  });
});

describe('Form Block — Analyzer', () => {
  test('form compiles without analyzer errors', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          field password: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form with validators compiles without errors', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = "" {
            required("Email required")
          }
          field password: String = "" {
            required("Password required")
            minLength(8, "Too short")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form with groups compiles without errors', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form with arrays compiles without errors', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = "" { required("Required") }
            field quantity: Int = 1 { min(1, "At least 1") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form with steps compiles without errors', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = ""
          group profile {
            field name: String = ""
          }
          steps {
            step "Account" { email }
            step "Profile" { profile }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form with on submit compiles without errors', () => {
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
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form with all features combined compiles without errors', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = "" {
            required("Email required")
            email("Invalid")
          }
          group shipping {
            field street: String = "" { required("Required") }
            field city: String = "" { required("Required") }
          }
          array lineItems {
            field description: String = ""
            field qty: Int = 1
          }
          steps {
            step "Info" { email }
            step "Shipping" { shipping }
            step "Items" { lineItems }
          }
          on submit {
            print("submitted")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });

  test('form at browser top-level compiles without errors', () => {
    const src = `browser {
      form settings {
        field theme: String = "light"
      }
      component App() {
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toBeDefined();
  });
});

describe('Form Block — Codegen (simple fields)', () => {
  test('form generates createSignal for each field', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          field password: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('createSignal("")');
    expect(b).toContain('createSignal(null)');
    expect(b).toContain('createSignal(false)');
  });

  test('form generates field accessors with value/error/touched/set/blur', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('get value()');
    expect(b).toContain('get error()');
    expect(b).toContain('get touched()');
    expect(b).toContain('set(v)');
    expect(b).toContain('blur()');
  });

  test('form generates revealing-module IIFE', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('const login = (() => {');
    expect(b).toContain('})();');
  });

  test('form generates isValid and isDirty computeds', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('isValid');
    expect(b).toContain('isDirty');
  });

  test('form generates submit function', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          on submit {
            print("submitted")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('async function submit');
    expect(b).toContain('preventDefault');
  });

  test('form generates validator function for required', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = "" {
            required("Email is required")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Email is required');
    expect(b).toContain('__validate_email');
  });

  test('form generates validator for min/max', () => {
    const src = `browser {
      component App() {
        form signup {
          field age: Int = 0 {
            min(18, "Must be 18+")
            max(120, "Invalid age")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Must be 18+');
    expect(b).toContain('Invalid age');
    expect(b).toContain('< 18');
    expect(b).toContain('> 120');
  });

  test('form generates validator for pattern', () => {
    const src = `browser {
      component App() {
        form signup {
          field zip: String = "" {
            pattern(/^\\d{5}$/, "Invalid zip")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Invalid zip');
    expect(b).toContain('.test(v)');
  });

  test('form generates validator for email', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = "" {
            email("Invalid email")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Invalid email');
    expect(b).toContain('.test(v)');
  });

  test('form generates validator for minLength/maxLength', () => {
    const src = `browser {
      component App() {
        form login {
          field password: String = "" {
            minLength(8, "Too short")
            maxLength(100, "Too long")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Too short');
    expect(b).toContain('Too long');
    expect(b).toContain('.length');
  });

  test('form returns controller with field accessors', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          field password: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('return {');
    expect(b).toContain('email');
    expect(b).toContain('password');
    expect(b).toContain('submit');
    expect(b).toContain('reset');
    expect(b).toContain('submitting');
    expect(b).toContain('submitError');
  });

  test('form generates reset function that resets all fields', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          field password: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('function reset()');
    expect(b).toContain('email.reset()');
    expect(b).toContain('password.reset()');
  });

  test('form generates field initial value references', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          field count: Int = 0
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__email_initial');
    expect(b).toContain('__count_initial');
  });

  test('form generates submitCount signal', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__submitCount');
    expect(b).toContain('submitCount');
  });

  test('form generates setError helper', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('setError');
    expect(b).toContain('__set_submitError');
  });

  test('form generates values getter', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          field password: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('get values()');
    expect(b).toContain('email: __email_value()');
    expect(b).toContain('password: __password_value()');
  });

  test('form at browser top-level generates IIFE', () => {
    const src = `browser {
      form settings {
        field theme: String = "light"
      }
      component App() {
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('const settings = (() => {');
    expect(b).toContain('__theme_value');
    expect(b).toContain('})();');
  });

  test('form submit body generates user code inside try block', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
          on submit {
            print("done")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('try {');
    expect(b).toContain('print(');
    expect(b).toContain('} catch (err) {');
    expect(b).toContain('} finally {');
  });

  test('form with multiple validators chains them in order', () => {
    const src = `browser {
      component App() {
        form login {
          field password: String = "" {
            required("Password required")
            minLength(8, "Too short")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Both validators should be present in the validator function
    expect(b).toContain('Password required');
    expect(b).toContain('Too short');
    // The required check should come before minLength
    const reqIdx = b.indexOf('Password required');
    const minIdx = b.indexOf('Too short');
    expect(reqIdx).toBeLessThan(minIdx);
  });
});

describe('Form Block — Codegen (groups)', () => {
  test('form group generates nested field signals', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = "" { required("Required") }
            field city: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__shipping_street');
    expect(b).toContain('__shipping_city');
    expect(b).toContain('const shipping = {');
    expect(b).toContain('get values()');
  });

  test('conditional group wraps validation in guard', () => {
    const src = `browser {
      component App() {
        form checkout {
          field sameAsShipping: Bool = true
          group billing when !sameAsShipping {
            field street: String = "" { required("Required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__sameAsShipping_value()');
    expect(b).toContain('return null');
  });

  test('nested groups generate correct prefixed signals', () => {
    const src = `browser {
      component App() {
        form checkout {
          group billing {
            field method: String = "card"
            group address {
              field street: String = ""
            }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__billing_method');
    expect(b).toContain('__billing_address_street');
  });

  test('group accessor has isValid and isDirty', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = ""
            field city: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('get isValid()');
    expect(b).toContain('get isDirty()');
    expect(b).toContain('reset()');
  });

  test('form-level isValid includes group fields', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = "" { required("Required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // isValid should check both email and shipping.street errors
    expect(b).toContain('__email_error()');
    expect(b).toContain('__shipping_street_error()');
  });

  test('group generates prefixed validator functions', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = "" { required("Street required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__validate_shipping_street');
    expect(b).toContain('Street required');
  });

  test('group fields included in form-level reset', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('email.reset()');
    expect(b).toContain('shipping_street.reset()');
  });

  test('group accessor exposed in form return object', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // The return object should include the group accessor
    const returnIdx = b.lastIndexOf('return {');
    const afterReturn = b.slice(returnIdx);
    expect(afterReturn).toContain('shipping');
  });

  test('group fields included in form-level isDirty', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__shipping_street_value() !== __shipping_street_initial');
  });

  test('conditional group validator includes guard expression', () => {
    const src = `browser {
      component App() {
        form checkout {
          field sameAsShipping: Bool = true
          group billing when !sameAsShipping {
            field street: String = "" { required("Required") }
            field city: String = "" { required("City required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Both fields should have the guard
    expect(b).toContain('__validate_billing_street');
    expect(b).toContain('__validate_billing_city');
    // The guard should skip validation when condition is false (i.e., when sameAsShipping is true)
    // Condition is !sameAsShipping, so guard is !((!__sameAsShipping_value()))
    expect(b).toContain('!((!__sameAsShipping_value()))');
  });

  test('group accessor maps field names to prefixed accessors', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = ""
            field city: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Group accessor should reference prefixed accessors
    expect(b).toContain('street: shipping_street');
    expect(b).toContain('city: shipping_city');
  });

  test('group values getter returns unprefixed names', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = "123 Main"
            field city: String = "Anytown"
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // values getter should use field names as keys, not prefixed names
    expect(b).toContain('street: __shipping_street_value()');
    expect(b).toContain('city: __shipping_city_value()');
  });

  test('form-level values includes group values', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Form-level values getter should include group values
    expect(b).toContain('shipping: shipping.values');
  });

  test('multiple groups generate separate accessors', () => {
    const src = `browser {
      component App() {
        form checkout {
          group shipping {
            field street: String = ""
          }
          group billing {
            field street: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__shipping_street');
    expect(b).toContain('__billing_street');
    expect(b).toContain('const shipping = {');
    expect(b).toContain('const billing = {');
  });
});

describe('Form Block — Codegen (arrays)', () => {
  test('form array generates signal-backed list', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('createSignal([])');
    expect(b).toContain('const lineItems = {');
    expect(b).toContain('get items()');
    expect(b).toContain('get length()');
    expect(b).toContain('add(');
    expect(b).toContain('remove(');
  });

  test('form array item factory creates signal-backed items', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__createLineItemsItem');
    expect(b).toContain('__id');
  });

  test('form array included in form-level isValid', () => {
    const src = `browser {
      component App() {
        form invoice {
          field clientName: String = ""
          array lineItems {
            field description: String = "" { required("Required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('.every(');
    expect(b).toContain('isValid');
  });

  test('form array included in form values', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('lineItems:');
    expect(b).toContain('.map(');
    expect(b).toContain('.values');
  });

  test('form array has move function', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('move(');
    expect(b).toContain('splice');
  });

  test('form array generates nextId counter', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__lineItems_nextId');
  });

  test('form array item factory uses defaults parameter', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('defaults && defaults.description !== undefined');
    expect(b).toContain('defaults && defaults.quantity !== undefined');
  });

  test('form array validators inside item factory', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = "" { required("Required") }
            field quantity: Int = 1 { min(1, "At least 1") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__validate_description');
    expect(b).toContain('__validate_quantity');
    expect(b).toContain('Required');
    expect(b).toContain('At least 1');
  });

  test('form array included in form-level isDirty', () => {
    const src = `browser {
      component App() {
        form invoice {
          field clientName: String = ""
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__lineItems().length > 0');
  });

  test('form array reset clears items and resets nextId', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__set_lineItems([])');
    expect(b).toContain('__lineItems_nextId = 0');
  });

  test('form submit blurs array item fields', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('__lineItems().forEach');
    expect(b).toContain('i.description.blur()');
    expect(b).toContain('i.quantity.blur()');
  });

  test('form array accessor in return object', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // The return object should include the array accessor
    const returnIdx = b.lastIndexOf('return {');
    const afterReturn = b.slice(returnIdx);
    expect(afterReturn).toContain('lineItems');
  });

  test('form with fields, groups, and arrays combined', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
          array lineItems {
            field description: String = ""
            field qty: Int = 1
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // All three features should be present
    expect(b).toContain('__email_value');
    expect(b).toContain('__shipping_street');
    expect(b).toContain('const lineItems = {');
    expect(b).toContain('__createLineItemsItem');
    // Values should include all three
    expect(b).toContain('email: __email_value()');
    expect(b).toContain('shipping: shipping.values');
    expect(b).toContain('lineItems: __lineItems().map(i => i.values)');
  });

  test('form array item has isValid getter', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = "" { required("Required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // The factory return should include item-level isValid
    expect(b).toContain('get isValid()');
    // The form-level isValid should include array check
    expect(b).toContain('__lineItems().every(i => i.isValid)');
  });

  test('form array item has values getter', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('get values()');
    expect(b).toContain('description: __description_value()');
    expect(b).toContain('quantity: __quantity_value()');
  });

  test('form array item field accessors have all methods', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Inside the factory function, field accessors should have value/error/touched/set/blur/validate/reset
    expect(b).toContain('get value()');
    expect(b).toContain('get error()');
    expect(b).toContain('get touched()');
    expect(b).toContain('set(v)');
    expect(b).toContain('blur()');
    expect(b).toContain('validate()');
    expect(b).toContain('reset()');
  });

  test('form array remove uses filter by __id', () => {
    const src = `browser {
      component App() {
        form invoice {
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('prev.filter(i => i.__id !== item.__id)');
  });
});

describe('Form Block — Codegen (wizard steps)', () => {
  test('form with steps generates step state', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = ""
          group profile {
            field name: String = ""
          }
          steps {
            step "Account" { email }
            step "Profile" { profile }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('currentStep');
    expect(b).toContain('createSignal(0)');
    expect(b).toContain('canNext');
    expect(b).toContain('canPrev');
    expect(b).toContain('progress');
    expect(b).toContain('next()');
    expect(b).toContain('prev()');
    expect(b).toContain('"Account"');
    expect(b).toContain('"Profile"');
  });

  test('step validate references field validate', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = "" { required("Required") }
          steps {
            step "Account" { email }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('email.validate()');
  });

  test('step validate references group isValid', () => {
    const src = `browser {
      component App() {
        form wizard {
          group profile {
            field name: String = ""
          }
          steps {
            step "Profile" { profile }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('profile.isValid');
  });

  test('steps included in return object', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = ""
          steps {
            step "Account" { email }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Return object should have steps-related properties
    expect(b).toContain('currentStep');
    expect(b).toContain('canNext');
    expect(b).toContain('canPrev');
    expect(b).toContain('progress');
    expect(b).toContain('steps');
  });

  test('step with multiple members', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = ""
          field name: String = ""
          steps {
            step "Info" { email, name }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('email.validate()');
    expect(b).toContain('name.validate()');
  });

  test('form without steps does not generate step code', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).not.toContain('__currentStep');
    expect(b).not.toContain('canNext');
    expect(b).not.toContain('canPrev');
  });
});

describe('Form Block — bind:form directive', () => {
  test('bind:form generates onSubmit wiring', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <form bind:form={login}>
          <div>"hello"</div>
        </form>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('onSubmit');
    expect(b).toContain('login.submit');
  });
});
