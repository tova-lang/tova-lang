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

describe('Form Block — FormField and ErrorMessage', () => {
  test('FormField auto-wires child input to field', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <form bind:form={login}>
          <FormField field={login.email}>
            <label>"Email"</label>
            <input type="email" />
            <ErrorMessage />
          </FormField>
        </form>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // FormField should generate a wrapper div with class form-field
    expect(b).toContain('form-field');
    // FormField should inject binding on the input
    expect(b).toContain('login.email.value');
    expect(b).toContain('login.email.set');
    expect(b).toContain('login.email.blur');
    // ErrorMessage should generate conditional error display
    expect(b).toContain('login.email.touched');
    expect(b).toContain('login.email.error');
    expect(b).toContain('form-error');
  });

  test('FormField wraps children in a div with form-field class', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <FormField field={login.email}>
          <input type="text" />
        </FormField>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('tova_el("div"');
    expect(b).toContain('form-field');
  });

  test('FormField wires select element', () => {
    const src = `browser {
      component App() {
        form signup {
          field country: String = ""
        }
        <FormField field={signup.country}>
          <select>
            <option value="us">"US"</option>
          </select>
        </FormField>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('signup.country.value');
    expect(b).toContain('signup.country.set');
    expect(b).toContain('signup.country.blur');
  });

  test('FormField wires textarea element', () => {
    const src = `browser {
      component App() {
        form feedback {
          field message: String = ""
        }
        <FormField field={feedback.message}>
          <textarea />
        </FormField>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('feedback.message.value');
    expect(b).toContain('feedback.message.set');
    expect(b).toContain('feedback.message.blur');
  });

  test('FormField passes through non-input children', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <FormField field={login.email}>
          <label>"Email"</label>
          <input type="email" />
          <span>"helper text"</span>
        </FormField>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // label and span should be generated normally
    expect(b).toContain('tova_el("label"');
    expect(b).toContain('tova_el("span"');
  });

  test('standalone ErrorMessage with field attribute', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <ErrorMessage field={login.email} />
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('login.email.touched');
    expect(b).toContain('login.email.error');
    expect(b).toContain('form-error');
  });

  test('standalone ErrorMessage for form-level error', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <ErrorMessage form={login} />
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('login.submitError');
    expect(b).toContain('form-error');
  });

  test('ErrorMessage renders null when no error', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = ""
        }
        <ErrorMessage field={login.email} />
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Should use ternary with null fallback
    expect(b).toContain('null');
  });

  test('FormField with ErrorMessage generates conditional span', () => {
    const src = `browser {
      component App() {
        form login {
          field password: String = ""
        }
        <FormField field={login.password}>
          <input type="password" />
          <ErrorMessage />
        </FormField>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // ErrorMessage inside FormField should use the parent field
    expect(b).toContain('login.password.touched');
    expect(b).toContain('login.password.error');
    expect(b).toContain('form-error');
  });
});

describe('Form Block -- Cross-field validation', () => {
  test('matches validator reads sibling field signal', () => {
    const src = `browser {
      component App() {
        form register {
          field password: String = ""
          field confirmPassword: String = "" {
            matches(password, "Passwords don't match")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain("Passwords don't match");
    expect(b).toContain('__password_value()');
    // Should generate a re-validation effect
    expect(b).toContain('createEffect');
  });

  test('matches validator generates comparison in validator function', () => {
    const src = `browser {
      component App() {
        form register {
          field password: String = ""
          field confirmPassword: String = "" {
            matches(password, "Passwords don't match")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Validator should compare v against the sibling signal
    expect(b).toContain('__validate_confirmPassword');
    expect(b).toContain('v !== __password_value()');
  });

  test('matches generates createEffect for re-validation', () => {
    const src = `browser {
      component App() {
        form register {
          field password: String = ""
          field confirmPassword: String = "" {
            matches(password, "Passwords don't match")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // createEffect should track password signal and re-validate confirmPassword
    expect(b).toContain('createEffect(() => {');
    expect(b).toContain('__password_value()');
    expect(b).toContain('__confirmPassword_touched()');
    expect(b).toContain('__validate_confirmPassword(__confirmPassword_value())');
    expect(b).toContain('__set_confirmPassword_error');
  });

  test('matches with default error message', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = ""
          field confirmEmail: String = "" {
            matches(email)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Fields do not match');
    expect(b).toContain('v !== __email_value()');
  });

  test('matches with other validators chains correctly', () => {
    const src = `browser {
      component App() {
        form register {
          field password: String = "" {
            required("Password required")
            minLength(8, "Too short")
          }
          field confirmPassword: String = "" {
            required("Confirm required")
            matches(password, "Passwords don't match")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Both validators should be present
    expect(b).toContain('Confirm required');
    expect(b).toContain("Passwords don't match");
    // Required should come before matches
    const reqIdx = b.indexOf('Confirm required');
    const matchIdx = b.indexOf("Passwords don't match");
    expect(reqIdx).toBeLessThan(matchIdx);
  });
});

describe('Form Block -- Async validators', () => {
  test('async validate generates debounced effect', () => {
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
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('setTimeout'); // debounced
    expect(b).toContain('async'); // async callback
    expect(b).toContain('clearTimeout'); // cancels previous
    expect(b).toContain('__email_asyncVersion'); // version counter
  });

  test('async validate uses version counter for stale prevention', () => {
    const src = `browser {
      component App() {
        form register {
          field username: String = "" {
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Version counter should be declared and incremented
    expect(b).toContain('let __username_asyncVersion = 0');
    expect(b).toContain('++__username_asyncVersion');
    // Should check version before setting error
    expect(b).toContain('version === __username_asyncVersion');
    expect(b).toContain('__set_username_error');
  });

  test('async validate reads field value signal in effect', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = "" {
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Effect should read the field signal to track reactivity
    expect(b).toContain('createEffect');
    expect(b).toContain('__email_value()');
  });

  test('async validate has error catch handler', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = "" {
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Should handle errors from async validation
    expect(b).toContain('catch(e)');
    expect(b).toContain('Validation error');
  });

  test('async validate timer variable for debounce cancel', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = "" {
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Timer should be declared and used for cancellation
    expect(b).toContain('let __email_asyncTimer = null');
    expect(b).toContain('__email_asyncTimer');
  });

  test('sync validators still work alongside async', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = "" {
            required("Email required")
            email("Invalid email")
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Sync validators should still be in __validate_email
    expect(b).toContain('Email required');
    expect(b).toContain('Invalid email');
    // Async validator should generate its own effect
    expect(b).toContain('__email_asyncVersion');
    expect(b).toContain('setTimeout');
  });

  test('async validate placeholder comment in sync validator fn', () => {
    const src = `browser {
      component App() {
        form register {
          field email: String = "" {
            async validate(fn(v) v)
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Sync validator function should have a comment placeholder for the async validator
    expect(b).toContain('async validate');
    expect(b).toContain('deferred to async validation');
  });
});

// ============================================================
// Phase 3 — Type-level validators
// ============================================================

function parseAST(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

describe('Form Block — Type-level validators (Phase 3)', () => {
  test('type field with validators parses without error', () => {
    const src = `
      type UserRequest {
        email: String { required, email }
        age: Int { required, min(18) }
      }
      browser {
        component App() {
          <div>"hello"</div>
        }
      }
    `;
    expect(() => compile(src)).not.toThrow();
  });

  test('type field validators are preserved on AST node', () => {
    const src = `
      type UserRequest {
        email: String { required, email }
        age: Int { min(18, "Must be 18+") }
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'UserRequest');
    expect(typeDecl).toBeDefined();

    // email field has 2 validators: required, email
    const emailField = typeDecl.variants.find(v => v.name === 'email');
    expect(emailField.type).toBe('TypeField');
    expect(emailField.validators).toHaveLength(2);
    expect(emailField.validators[0].name).toBe('required');
    expect(emailField.validators[0].args).toHaveLength(0);
    expect(emailField.validators[1].name).toBe('email');
    expect(emailField.validators[1].args).toHaveLength(0);

    // age field has 1 validator: min(18, "Must be 18+")
    const ageField = typeDecl.variants.find(v => v.name === 'age');
    expect(ageField.type).toBe('TypeField');
    expect(ageField.validators).toHaveLength(1);
    expect(ageField.validators[0].name).toBe('min');
    expect(ageField.validators[0].args).toHaveLength(2);
  });

  test('type field without validators has empty validators array', () => {
    const src = `
      type Simple {
        name: String
        count: Int
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'Simple');
    expect(typeDecl).toBeDefined();
    const nameField = typeDecl.variants.find(v => v.name === 'name');
    expect(nameField.validators).toEqual([]);
  });

  test('type field validators use FormValidator AST nodes', () => {
    const src = `
      type LoginForm {
        email: String { required, email }
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'LoginForm');
    const emailField = typeDecl.variants.find(v => v.name === 'email');
    expect(emailField.validators[0]).toBeInstanceOf(FormValidator);
    expect(emailField.validators[0].type).toBe('FormValidator');
  });

  test('type field validators with complex args', () => {
    const src = `
      type Registration {
        password: String { required, minLength(8), maxLength(100) }
        age: Int { min(0), max(150) }
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'Registration');

    const pwField = typeDecl.variants.find(v => v.name === 'password');
    expect(pwField.validators).toHaveLength(3);
    expect(pwField.validators[0].name).toBe('required');
    expect(pwField.validators[1].name).toBe('minLength');
    expect(pwField.validators[1].args).toHaveLength(1);
    expect(pwField.validators[2].name).toBe('maxLength');
    expect(pwField.validators[2].args).toHaveLength(1);

    const ageField = typeDecl.variants.find(v => v.name === 'age');
    expect(ageField.validators).toHaveLength(2);
    expect(ageField.validators[0].name).toBe('min');
    expect(ageField.validators[1].name).toBe('max');
  });

  test('type field validators without commas (newline-separated)', () => {
    const src = `
      type UserForm {
        email: String {
          required
          email
        }
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'UserForm');
    const emailField = typeDecl.variants.find(v => v.name === 'email');
    expect(emailField.validators).toHaveLength(2);
    expect(emailField.validators[0].name).toBe('required');
    expect(emailField.validators[1].name).toBe('email');
  });

  test('type field with async validator', () => {
    const src = `
      type UserForm {
        username: String { required, async uniqueUsername }
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'UserForm');
    const usernameField = typeDecl.variants.find(v => v.name === 'username');
    expect(usernameField.validators).toHaveLength(2);
    expect(usernameField.validators[0].name).toBe('required');
    expect(usernameField.validators[0].isAsync).toBe(false);
    expect(usernameField.validators[1].name).toBe('uniqueUsername');
    expect(usernameField.validators[1].isAsync).toBe(true);
  });

  test('mixed fields: some with validators, some without', () => {
    const src = `
      type MixedType {
        name: String
        email: String { required, email }
        bio: String
        age: Int { min(0) }
      }
    `;
    const ast = parseAST(src);
    const typeDecl = ast.body.find(n => n.type === 'TypeDeclaration' && n.name === 'MixedType');
    expect(typeDecl.variants).toHaveLength(4);

    expect(typeDecl.variants[0].name).toBe('name');
    expect(typeDecl.variants[0].validators).toEqual([]);

    expect(typeDecl.variants[1].name).toBe('email');
    expect(typeDecl.variants[1].validators).toHaveLength(2);

    expect(typeDecl.variants[2].name).toBe('bio');
    expect(typeDecl.variants[2].validators).toEqual([]);

    expect(typeDecl.variants[3].name).toBe('age');
    expect(typeDecl.variants[3].validators).toHaveLength(1);
  });

  test('type with validators compiles with browser block', () => {
    const src = `
      type ContactForm {
        name: String { required, minLength(2) }
        email: String { required, email }
        message: String { required, maxLength(500) }
      }
      browser {
        component App() {
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    expect(result).toBeDefined();
    expect(result.browser).toBeDefined();
  });
});

// ============================================================
// Phase 3 — Server validation from type-level validators
// ============================================================

describe('Form Block -- Server validation from types (Phase 3)', () => {
  test('server RPC with typed param generates validation from type validators', () => {
    const src = `
      type UserRequest {
        email: String { required("Email required"), email("Invalid email") }
        age: Int { required("Age required"), min(18, "Must be 18+") }
      }
      server {
        fn register(user: UserRequest) -> String {
          "ok"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    expect(s).toContain('__validationErrors');
    expect(s).toContain('Email required');
    expect(s).toContain('Invalid email');
    expect(s).toContain('Must be 18+');
    expect(s).toContain('VALIDATION_FAILED');
  });

  test('type without validators does not generate extra validation', () => {
    const src = `
      type SimpleRequest {
        name: String
      }
      server {
        fn greet(req: SimpleRequest) -> String {
          "hello"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    expect(s).not.toContain('Email required');
    // Should still have basic type validation but no custom validator messages
    expect(s).not.toContain('Invalid email');
  });

  test('server validation includes all validator types', () => {
    const src = `
      type FullRequest {
        email: String { required("Email required"), email("Invalid email") }
        age: Int { min(18, "Too young"), max(120, "Too old") }
        name: String { minLength(2, "Too short"), maxLength(50, "Too long") }
      }
      server {
        fn submit(data: FullRequest) -> String {
          "ok"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    expect(s).toContain('Email required');
    expect(s).toContain('Invalid email');
    expect(s).toContain('Too young');
    expect(s).toContain('Too old');
    expect(s).toContain('Too short');
    expect(s).toContain('Too long');
  });

  test('server validation with pattern and oneOf validators', () => {
    const src = `
      type ConfigRequest {
        zip: String { pattern(/^\\d{5}$/, "Invalid zip") }
        role: String { oneOf(["admin", "user"], "Invalid role") }
      }
      server {
        fn configure(cfg: ConfigRequest) -> String {
          "ok"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    expect(s).toContain('Invalid zip');
    expect(s).toContain('Invalid role');
  });

  test('server validation runs before function call in RPC handler', () => {
    const src = `
      type LoginRequest {
        email: String { required("Email required") }
      }
      server {
        fn login(creds: LoginRequest) -> String {
          "logged in"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    // Within the RPC handler, validation should appear before the function call
    const rpcStart = s.indexOf('__addRoute("POST", "/rpc/login"');
    expect(rpcStart).toBeGreaterThan(-1);
    const rpcSection = s.slice(rpcStart);
    const validationIdx = rpcSection.indexOf('__validationErrors');
    const callIdx = rpcSection.indexOf('await login(');
    expect(validationIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    expect(validationIdx).toBeLessThan(callIdx);
  });

  test('server validation generates structured error objects', () => {
    const src = `
      type UserRequest {
        email: String { required("Email required") }
      }
      server {
        fn register(user: UserRequest) -> String {
          "ok"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    // Should push objects with field and message keys
    expect(s).toContain('field:');
    expect(s).toContain('message:');
    expect(s).toContain('"email"');
  });

  test('type in shared block also generates server validation', () => {
    const src = `
      shared {
        type ContactData {
          email: String { required("Email required"), email("Invalid email") }
          message: String { required("Message required") }
        }
      }
      server {
        fn contact(data: ContactData) -> String {
          "sent"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    expect(s).toContain('Email required');
    expect(s).toContain('Invalid email');
    expect(s).toContain('Message required');
  });

  test('multiple RPC functions each get their own validation', () => {
    const src = `
      type LoginRequest {
        email: String { required("Email required") }
      }
      type RegisterRequest {
        name: String { required("Name required") }
        email: String { required("Email required"), email("Invalid email") }
      }
      server {
        fn login(creds: LoginRequest) -> String {
          "ok"
        }
        fn register(data: RegisterRequest) -> String {
          "ok"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    // Both should have validation
    expect(s).toContain('Email required');
    expect(s).toContain('Name required');
    expect(s).toContain('Invalid email');
  });

  test('RPC function with untyped param does not generate type validation', () => {
    const src = `
      server {
        fn greet(name: String) -> String {
          "hello"
        }
      }
    `;
    const result = compile(src);
    const s = result.server;
    // Basic validation (required/type check) should exist, but no custom validator messages
    expect(s).not.toContain('Email required');
  });
});

// ============================================================
// Phase 3 — Form Type Inheritance
// ============================================================
describe('Form Block — Type Inheritance (Phase 3)', () => {
  test('form typed with validated type inherits field validators', () => {
    const src = `
      type LoginRequest {
        email: String { required("Email required"), email("Invalid") }
        password: String { required("Password required"), minLength(8, "Too short") }
      }
      browser {
        component App() {
          form login: LoginRequest {
            field email: String = ""
            field password: String = ""
          }
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Email required');
    expect(b).toContain('Invalid');
    expect(b).toContain('Password required');
    expect(b).toContain('Too short');
  });

  test('form-level validators override type-level for same name', () => {
    const src = `
      type LoginRequest {
        email: String { required("Type required") }
      }
      browser {
        component App() {
          form login: LoginRequest {
            field email: String = "" {
              required("Form required")
            }
          }
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Form required');
    expect(b).not.toContain('Type required');
  });

  test('form-level validators append to type-level for different names', () => {
    const src = `
      type LoginRequest {
        email: String { required("Required") }
      }
      browser {
        component App() {
          form login: LoginRequest {
            field email: String = "" {
              email("Invalid email")
            }
          }
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Required');
    expect(b).toContain('Invalid email');
  });

  test('form without type annotation does not inherit validators', () => {
    const src = `
      type LoginRequest {
        email: String { required("Email required") }
      }
      browser {
        component App() {
          form login {
            field email: String = ""
          }
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    expect(b).not.toContain('Email required');
  });

  test('form typed with non-existent type does not crash', () => {
    const src = `
      browser {
        component App() {
          form login: NonExistent {
            field email: String = ""
          }
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    // Should compile without errors; no inherited validators
    expect(b).toContain('login');
  });

  test('type in shared block is inherited by form', () => {
    const src = `
      shared {
        type RegisterForm {
          username: String { required("Username needed"), minLength(3, "Too short") }
        }
      }
      browser {
        component App() {
          form register: RegisterForm {
            field username: String = ""
          }
          <div>"hello"</div>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    expect(b).toContain('Username needed');
    expect(b).toContain('Too short');
  });
});

// ============================================================
// Integration Tests — all features combined
// ============================================================

describe('Form Block -- Integration', () => {
  test('complete form with all features compiles', () => {
    const src = `browser {
      component Checkout() {
        form checkout {
          field email: String = "" {
            required("Email is required")
            email("Invalid email")
          }
          field age: Int = 18 {
            min(18, "Must be 18+")
          }
          group shipping {
            field street: String = "" { required("Required") }
            field city: String = "" { required("Required") }
            field zip: String = "" { pattern(/^\\d{5}$/, "Invalid zip") }
          }
          group billing {
            field sameAsShipping: Bool = true
            group address when !sameAsShipping {
              field street: String = "" { required("Required") }
            }
          }
          array lineItems {
            field description: String = "" { required("Required") }
            field quantity: Int = 1 { min(1, "At least 1") }
            field unitPrice: Float = 0.0 { min(0, "Positive") }
          }
          steps {
            step "Info" { email, age }
            step "Shipping" { shipping }
            step "Billing" { billing }
            step "Items" { lineItems }
          }
          on submit {
            print("done")
          }
        }
        <form bind:form={checkout}>
          <FormField field={checkout.email}>
            <label>"Email"</label>
            <input type="email" />
            <ErrorMessage />
          </FormField>
        </form>
      }
    }`;
    const result = compile(src);
    const b = result.browser;

    // Form controller exists
    expect(b).toContain('const checkout = (() => {');
    expect(b).toContain('})();');

    // Fields
    expect(b).toContain('__email_value');
    expect(b).toContain('__age_value');

    // Groups
    expect(b).toContain('__shipping_street_value');
    expect(b).toContain('const shipping = {');

    // Nested conditional group (billing > address)
    expect(b).toContain('__billing_address_street_value');
    expect(b).toContain('const address = {');
    expect(b).toContain('const billing = {');

    // Array
    expect(b).toContain('const lineItems = {');
    expect(b).toContain('add(');

    // Steps
    expect(b).toContain('currentStep');
    expect(b).toContain('canNext');

    // Validators
    expect(b).toContain('Email is required');
    expect(b).toContain('Must be 18+');
    expect(b).toContain('Invalid zip');
    expect(b).toContain('At least 1');
    expect(b).toContain('Positive');

    // Submit
    expect(b).toContain('async function submit');

    // bind:form
    expect(b).toContain('checkout.submit');

    // FormField
    expect(b).toContain('checkout.email.value');
    expect(b).toContain('checkout.email.set');

    // ErrorMessage
    expect(b).toContain('checkout.email.error');
    expect(b).toContain('form-error');
  });

  test('form does not break existing browser features', () => {
    // Simple browser block without form still works
    const src = `browser {
      state total = 0
      component App() {
        <button on:click={fn() total += 1}>"{total}"</button>
      }
    }`;
    const result = compile(src);
    expect(result.browser).toContain('createSignal(0)');
    expect(result.browser).toContain('setTotal');
  });

  test('full-stack form with type validation compiles both browser and server', () => {
    const src = `
      type OrderRequest {
        email: String { required("Email required"), email("Invalid email") }
        amount: Int { required("Amount required"), min(1, "Must be positive") }
      }
      server {
        fn placeOrder(order: OrderRequest) -> String {
          "ok"
        }
      }
      browser {
        component OrderForm() {
          form order: OrderRequest {
            field email: String = ""
            field amount: Int = 0
          }
          <form bind:form={order}>
            <FormField field={order.email}>
              <input type="email" />
              <ErrorMessage />
            </FormField>
            <button type="submit">"Place Order"</button>
          </form>
        }
      }
    `;
    const result = compile(src);
    const b = result.browser;
    const s = result.server;

    // Browser form inherits type validators
    expect(b).toContain('Email required');
    expect(b).toContain('Invalid email');
    expect(b).toContain('Must be positive');

    // Server generates validation from same type
    expect(s).toContain('__validationErrors');
    expect(s).toContain('Email required');
    expect(s).toContain('VALIDATION_FAILED');

    // bind:form wired
    expect(b).toContain('order.submit');

    // FormField wired
    expect(b).toContain('order.email.value');
    expect(b).toContain('order.email.set');
  });

  test('complete form generates correct values getter with all sections', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Form-level values includes all sections
    expect(b).toContain('email: __email_value()');
    expect(b).toContain('shipping: shipping.values');
    expect(b).toContain('lineItems: __lineItems().map(i => i.values)');
  });

  test('complete form submit blurs all field types', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
          on submit {
            print("ok")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Submit blurs top-level fields
    expect(b).toContain('email.blur()');
    // Submit blurs group fields
    expect(b).toContain('shipping_street.blur()');
    // Submit blurs array item fields
    expect(b).toContain('__lineItems().forEach');
    expect(b).toContain('i.description.blur()');
    expect(b).toContain('i.quantity.blur()');
  });

  test('complete form isValid checks all field types', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = "" { required("Required") }
          group shipping {
            field street: String = "" { required("Required") }
          }
          array lineItems {
            field description: String = "" { required("Required") }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // isValid checks top-level, group, and array fields
    expect(b).toContain('__email_error() === null');
    expect(b).toContain('__shipping_street_error() === null');
    expect(b).toContain('__lineItems().every(i => i.isValid)');
  });

  test('complete form reset resets all field types', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
          array lineItems {
            field description: String = ""
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Reset resets top-level fields
    expect(b).toContain('email.reset()');
    // Reset resets group fields
    expect(b).toContain('shipping_street.reset()');
    // Reset clears array
    expect(b).toContain('__set_lineItems([])');
    expect(b).toContain('__lineItems_nextId = 0');
  });

  test('form with steps references correct field and group validators', () => {
    const src = `browser {
      component App() {
        form wizard {
          field email: String = "" { required("Required") }
          field age: Int = 0 { min(18, "Too young") }
          group profile {
            field name: String = "" { required("Required") }
          }
          steps {
            step "Account" { email, age }
            step "Profile" { profile }
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Step validates individual fields
    expect(b).toContain('email.validate()');
    expect(b).toContain('age.validate()');
    // Step validates group via isValid
    expect(b).toContain('profile.isValid');
    // Step labels present
    expect(b).toContain('"Account"');
    expect(b).toContain('"Profile"');
    // Progress/navigation
    expect(b).toContain('progress');
    expect(b).toContain('next()');
    expect(b).toContain('prev()');
  });

  test('form return object exposes all sections and helpers', () => {
    const src = `browser {
      component App() {
        form checkout {
          field email: String = ""
          group shipping {
            field street: String = ""
          }
          array lineItems {
            field description: String = ""
          }
          steps {
            step "Info" { email }
            step "Shipping" { shipping }
          }
          on submit {
            print("ok")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Get the return object block
    const returnIdx = b.lastIndexOf('return {');
    const afterReturn = b.slice(returnIdx);
    // Fields
    expect(afterReturn).toContain('email');
    // Groups
    expect(afterReturn).toContain('shipping');
    // Arrays
    expect(afterReturn).toContain('lineItems');
    // Helpers
    expect(afterReturn).toContain('submit');
    expect(afterReturn).toContain('reset');
    expect(afterReturn).toContain('isValid');
    expect(afterReturn).toContain('isDirty');
    expect(afterReturn).toContain('submitting');
    expect(afterReturn).toContain('submitError');
    expect(afterReturn).toContain('submitCount');
    expect(afterReturn).toContain('setError');
    // Steps
    expect(afterReturn).toContain('currentStep');
    expect(afterReturn).toContain('canNext');
    expect(afterReturn).toContain('canPrev');
    expect(afterReturn).toContain('progress');
    expect(afterReturn).toContain('steps');
  });

  test('multiple forms in same component do not conflict', () => {
    const src = `browser {
      component App() {
        form login {
          field email: String = "" { required("Login email required") }
        }
        form register {
          field email: String = "" { required("Register email required") }
          field name: String = ""
        }
        <div>
          <form bind:form={login}>
            <FormField field={login.email}>
              <input type="email" />
            </FormField>
          </form>
          <form bind:form={register}>
            <FormField field={register.email}>
              <input type="email" />
            </FormField>
          </form>
        </div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Both forms exist as separate IIFEs
    expect(b).toContain('const login = (() => {');
    expect(b).toContain('const register = (() => {');
    // Both have their own validators
    expect(b).toContain('Login email required');
    expect(b).toContain('Register email required');
    // Both bind:form directives are wired
    expect(b).toContain('login.submit');
    expect(b).toContain('register.submit');
  });

  test('form with cross-field validation and steps compiles', () => {
    const src = `browser {
      component App() {
        form register {
          field password: String = "" {
            required("Password required")
            minLength(8, "Too short")
          }
          field confirmPassword: String = "" {
            required("Confirm required")
            matches(password, "Passwords don't match")
          }
          steps {
            step "Credentials" { password, confirmPassword }
          }
          on submit {
            print("registered")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // Cross-field validation
    expect(b).toContain('v !== __password_value()');
    expect(b).toContain("Passwords don't match");
    // Re-validation effect
    expect(b).toContain('createEffect');
    // Steps reference both fields
    expect(b).toContain('password.validate()');
    expect(b).toContain('confirmPassword.validate()');
    // Submit handler
    expect(b).toContain('async function submit');
    expect(b).toContain('print("registered")');
  });

  test('form with all validator types compiles correctly', () => {
    const src = `browser {
      component App() {
        form full {
          field email: String = "" {
            required("Required")
            email("Invalid email")
          }
          field age: Int = 0 {
            min(18, "Too young")
            max(120, "Too old")
          }
          field name: String = "" {
            minLength(2, "Too short")
            maxLength(50, "Too long")
          }
          field zip: String = "" {
            pattern(/^\\d{5}$/, "Invalid zip")
          }
        }
        <div>"hello"</div>
      }
    }`;
    const result = compile(src);
    const b = result.browser;
    // required
    expect(b).toContain('v === undefined || v === null || v === ""');
    expect(b).toContain('Required');
    // email
    expect(b).toContain('.test(v)');
    expect(b).toContain('Invalid email');
    // min/max
    expect(b).toContain('< 18');
    expect(b).toContain('> 120');
    // minLength/maxLength
    expect(b).toContain('.length');
    expect(b).toContain('Too short');
    expect(b).toContain('Too long');
    // pattern
    expect(b).toContain('Invalid zip');
  });
});
