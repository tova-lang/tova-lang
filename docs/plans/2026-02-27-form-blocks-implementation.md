# Form Blocks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-class `form` blocks to Tova's browser compiler with field/group/array/steps, built-in validators, bind:form directive, FormField/ErrorMessage built-in components, and full-stack type-level validation.

**Architecture:** Form blocks are parsed into rich AST nodes (`FormDeclaration`, `FormFieldDeclaration`, `FormGroupDeclaration`, `FormArrayDeclaration`, `FormStepsDeclaration`). The browser codegen compiles them to revealing-module IIFEs backed by direct `createSignal`/`createComputed` calls (same pattern as `store`). Server codegen extracts type-level validators for RPC middleware. The analyzer validates scope, field references, validator args, cross-field deps, and form-to-RPC shape matching.

**Tech Stack:** Bun test runner, ES6 modules, Tova compiler pipeline (lexer → parser → analyzer → codegen)

**Design Doc:** `docs/plans/2026-02-27-form-blocks-design.md`

---

## Task 1: Tokens & Keywords

**Files:**
- Modify: `src/lexer/tokens.js:92-97` (token types), `src/lexer/tokens.js:219-223` (keyword mappings)
- Test: `tests/form-block.test.js` (new file)

**Step 1: Write the failing test**

Create `tests/form-block.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js`
Expected: FAIL — `TokenType.FORM` is undefined

**Step 3: Add token types and keywords**

In `src/lexer/tokens.js`, after line 96 (`STORE: 'STORE',`), add:

```javascript
  FORM: 'FORM',
  FIELD: 'FIELD',
  GROUP: 'GROUP',
  STEPS: 'STEPS',
```

In keyword mappings, after line 223 (`'store': TokenType.STORE,`), add:

```javascript
  'form': TokenType.FORM,
  'field': TokenType.FIELD,
  'group': TokenType.GROUP,
  'steps': TokenType.STEPS,
```

Note: `array` is already a keyword/identifier in Tova — we'll use contextual parsing for `array` inside form blocks (check for IDENTIFIER with value "array") rather than adding a token. Same for `on` (already an identifier pattern in Tova).

**Step 4: Run test to verify it passes**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/lexer/tokens.js tests/form-block.test.js
git commit -m "feat(forms): add FORM, FIELD, GROUP, STEPS token types and keywords"
```

---

## Task 2: AST Nodes

**Files:**
- Create: `src/parser/form-ast.js`
- Modify: `src/parser/ast.js:691-696` (re-exports)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

Add to `tests/form-block.test.js`:

```javascript
import {
  FormDeclaration, FormFieldDeclaration, FormGroupDeclaration,
  FormArrayDeclaration, FormValidator, FormStepsDeclaration, FormStep
} from '../src/parser/form-ast.js';

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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js`
Expected: FAIL — cannot find module `form-ast.js`

**Step 3: Create `src/parser/form-ast.js`**

```javascript
export class FormDeclaration {
  constructor(name, typeAnnotation, fields, groups, arrays, computeds, steps, onSubmit, loc) {
    this.type = 'FormDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.fields = fields;
    this.groups = groups;
    this.arrays = arrays;
    this.computeds = computeds;
    this.steps = steps;
    this.onSubmit = onSubmit;
    this.loc = loc;
  }
}

export class FormFieldDeclaration {
  constructor(name, typeAnnotation, initialValue, validators, loc) {
    this.type = 'FormFieldDeclaration';
    this.name = name;
    this.typeAnnotation = typeAnnotation;
    this.initialValue = initialValue;
    this.validators = validators;
    this.loc = loc;
  }
}

export class FormGroupDeclaration {
  constructor(name, condition, fields, groups, loc) {
    this.type = 'FormGroupDeclaration';
    this.name = name;
    this.condition = condition;
    this.fields = fields;
    this.groups = groups;
    this.loc = loc;
  }
}

export class FormArrayDeclaration {
  constructor(name, fields, validators, loc) {
    this.type = 'FormArrayDeclaration';
    this.name = name;
    this.fields = fields;
    this.validators = validators;
    this.loc = loc;
  }
}

export class FormValidator {
  constructor(name, args, isAsync, loc) {
    this.type = 'FormValidator';
    this.name = name;
    this.args = args;
    this.isAsync = isAsync;
    this.loc = loc;
  }
}

export class FormStepsDeclaration {
  constructor(steps, loc) {
    this.type = 'FormStepsDeclaration';
    this.steps = steps;
    this.loc = loc;
  }
}

export class FormStep {
  constructor(label, members, loc) {
    this.type = 'FormStep';
    this.label = label;
    this.members = members;
    this.loc = loc;
  }
}
```

**Step 4: Add re-exports to `src/parser/ast.js`**

After the existing browser-ast.js re-export block (line 696), add:

```javascript
export {
  FormDeclaration, FormFieldDeclaration, FormGroupDeclaration,
  FormArrayDeclaration, FormValidator, FormStepsDeclaration, FormStep,
} from './form-ast.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js`
Expected: PASS (all tests)

**Step 6: Commit**

```bash
git add src/parser/form-ast.js src/parser/ast.js tests/form-block.test.js
git commit -m "feat(forms): add form AST node classes and re-exports"
```

---

## Task 3: Parser — Simple Form with Fields

**Files:**
- Create: `src/parser/form-parser.js`
- Modify: `src/parser/browser-parser.js:43-50` (dispatch), `src/parser/browser-parser.js:121-139` (component body)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

Add to `tests/form-block.test.js`:

```javascript
import { compile } from '../src/compiler.js';

function parse(src) {
  // Use compile to get the AST through the full pipeline
  // We'll test parsing via codegen output
  return compile(src);
}

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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js --filter "Parser"`
Expected: FAIL — parser does not recognize `form` keyword

**Step 3: Create `src/parser/form-parser.js`**

```javascript
import {
  FormDeclaration, FormFieldDeclaration, FormGroupDeclaration,
  FormArrayDeclaration, FormValidator, FormStepsDeclaration, FormStep,
} from './form-ast.js';
import { ComputedDeclaration } from './browser-ast.js';
import { TokenType } from '../lexer/tokens.js';

export function installFormParser(ParserClass) {
  if (ParserClass.prototype._formParserInstalled) return;
  ParserClass.prototype._formParserInstalled = true;

  ParserClass.prototype.parseFormDeclaration = function() {
    const l = this.loc();
    this.expect(TokenType.FORM);
    const name = this.expect(TokenType.IDENTIFIER, "Expected form name").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.expect(TokenType.LBRACE, "Expected '{' after form name");

    const fields = [];
    const groups = [];
    const arrays = [];
    const computeds = [];
    let steps = null;
    let onSubmit = null;

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FIELD)) {
        fields.push(this.parseFormField());
      } else if (this.check(TokenType.GROUP)) {
        groups.push(this.parseFormGroup());
      } else if (this._checkContextual('array')) {
        arrays.push(this.parseFormArray());
      } else if (this.check(TokenType.COMPUTED)) {
        computeds.push(this.parseComputed());
      } else if (this.check(TokenType.STEPS)) {
        steps = this.parseFormSteps();
      } else if (this._checkContextual('on') && this._peekContextual(1, 'submit')) {
        onSubmit = this.parseFormOnSubmit();
      } else {
        this.error("Expected 'field', 'group', 'array', 'computed', 'steps', or 'on submit' inside form block");
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close form block");
    return new FormDeclaration(name, typeAnnotation, fields, groups, arrays, computeds, steps, onSubmit, l);
  };

  ParserClass.prototype.parseFormField = function() {
    const l = this.loc();
    this.expect(TokenType.FIELD);
    const name = this.expect(TokenType.IDENTIFIER, "Expected field name").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    let initialValue = null;
    if (this.match(TokenType.ASSIGN)) {
      initialValue = this.parseExpression();
    }

    const validators = [];
    if (this.check(TokenType.LBRACE)) {
      this.advance(); // consume {
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        validators.push(this.parseFormValidator());
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close validator block");
    }

    return new FormFieldDeclaration(name, typeAnnotation, initialValue, validators, l);
  };

  ParserClass.prototype.parseFormValidator = function() {
    const l = this.loc();
    let isAsync = false;
    if (this.check(TokenType.ASYNC)) {
      isAsync = true;
      this.advance();
    }
    const name = this.expect(TokenType.IDENTIFIER, "Expected validator name").value;

    const args = [];
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        args.push(this.parseExpression());
        while (this.match(TokenType.COMMA)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(TokenType.RPAREN, "Expected ')' after validator arguments");
    }

    return new FormValidator(name, args, isAsync, l);
  };

  ParserClass.prototype.parseFormGroup = function() {
    const l = this.loc();
    this.expect(TokenType.GROUP);
    const name = this.expect(TokenType.IDENTIFIER, "Expected group name").value;

    let condition = null;
    if (this._checkContextual('when')) {
      this.advance(); // consume 'when'
      condition = this.parseExpression();
    }

    this.expect(TokenType.LBRACE, "Expected '{' after group name");

    const fields = [];
    const groups = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FIELD)) {
        fields.push(this.parseFormField());
      } else if (this.check(TokenType.GROUP)) {
        groups.push(this.parseFormGroup());
      } else {
        this.error("Expected 'field' or 'group' inside form group");
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close group block");
    return new FormGroupDeclaration(name, condition, fields, groups, l);
  };

  ParserClass.prototype.parseFormArray = function() {
    const l = this.loc();
    this.advance(); // consume 'array' (contextual)
    const name = this.expect(TokenType.IDENTIFIER, "Expected array name").value;

    this.expect(TokenType.LBRACE, "Expected '{' after array name");

    const fields = [];
    const validators = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FIELD)) {
        fields.push(this.parseFormField());
      } else {
        this.error("Expected 'field' inside form array");
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close array block");
    return new FormArrayDeclaration(name, fields, validators, l);
  };

  ParserClass.prototype.parseFormSteps = function() {
    const l = this.loc();
    this.expect(TokenType.STEPS);
    this.expect(TokenType.LBRACE, "Expected '{' after steps");

    const stepsArr = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      stepsArr.push(this.parseFormStep());
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close steps block");
    return new FormStepsDeclaration(stepsArr, l);
  };

  ParserClass.prototype.parseFormStep = function() {
    const l = this.loc();
    // expect 'step' as contextual keyword
    if (!this._checkContextual('step')) {
      this.error("Expected 'step' inside steps block");
    }
    this.advance(); // consume 'step'
    const label = this.expect(TokenType.STRING, "Expected step label string").value;
    this.expect(TokenType.LBRACE, "Expected '{' after step label");

    const members = [];
    members.push(this.expect(TokenType.IDENTIFIER, "Expected field/group/array name").value);
    while (this.match(TokenType.COMMA)) {
      members.push(this.expect(TokenType.IDENTIFIER, "Expected field/group/array name").value);
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close step");
    return new FormStep(label, members, l);
  };

  ParserClass.prototype.parseFormOnSubmit = function() {
    this.advance(); // consume 'on'
    this.advance(); // consume 'submit'
    return this.parseBlockStatement();
  };

  // Helper: check if current token is an identifier with a specific value
  ParserClass.prototype._checkContextual = ParserClass.prototype._checkContextual || function(name) {
    return this.check(TokenType.IDENTIFIER) && this.current().value === name;
  };

  ParserClass.prototype._peekContextual = ParserClass.prototype._peekContextual || function(offset, name) {
    const token = this.peek(offset);
    return token && token.type === TokenType.IDENTIFIER && token.value === name;
  };
}
```

**Step 4: Integrate into browser-parser.js**

At the top of `src/parser/browser-parser.js`, add import:

```javascript
import { installFormParser } from './form-parser.js';
```

Inside `installBrowserParser()`, after the guard check (line 9), add:

```javascript
  installFormParser(ParserClass);
```

In `parseBrowserStatement()` (line 48), before the `return this.parseStatement();` fallthrough, add:

```javascript
    if (this.check(TokenType.FORM)) return this.parseFormDeclaration();
```

In `parseComponent()` body loop (line 136), before the `else` fallthrough, add:

```javascript
      } else if (this.check(TokenType.FORM)) {
        body.push(this.parseFormDeclaration());
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js --filter "Parser"`
Expected: PASS (4 tests). If `_checkContextual` or `_peekContextual` already exist on the parser prototype, the `||` guard prevents overwriting.

**Step 6: Run full test suite to check for regressions**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All existing tests pass. The new `form`, `field`, `group`, `steps` keywords should not conflict with existing code since they're new tokens and the lexer only produces them when those exact words appear.

**Step 7: Commit**

```bash
git add src/parser/form-parser.js src/parser/browser-parser.js tests/form-block.test.js
git commit -m "feat(forms): add form parser with field, group, array, steps, on submit"
```

---

## Task 4: Parser — Groups, Arrays, Steps, Cross-Field Validators

**Files:**
- Test: `tests/form-block.test.js` (extend)
- Parser already handles these from Task 3; this task adds targeted parse tests

**Step 1: Write tests for complex form parsing**

Add to `tests/form-block.test.js`:

```javascript
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
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
    expect(() => parse(src)).not.toThrow();
  });
});
```

**Step 2: Run tests**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js`
Expected: All PASS (parser already handles these from Task 3). If any fail, fix the parser.

**Step 3: Commit**

```bash
git add tests/form-block.test.js
git commit -m "test(forms): add comprehensive parser tests for groups, arrays, steps, async validators"
```

---

## Task 5: Analyzer — Form Validation

**Files:**
- Create: `src/analyzer/form-analyzer.js`
- Modify: `src/analyzer/browser-analyzer.js` (import + install call)
- Modify: `src/registry/plugins/browser-plugin.js:24-27` (childNodeTypes)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

Add to `tests/form-block.test.js`:

```javascript
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
    expect(result.browser).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js --filter "Analyzer"`
Expected: FAIL — `visitFormDeclaration` is not defined (analyzer doesn't know about form nodes)

**Step 3: Create `src/analyzer/form-analyzer.js`**

```javascript
export function installFormAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._formAnalyzerInstalled) return;
  AnalyzerClass.prototype._formAnalyzerInstalled = true;

  const KNOWN_VALIDATORS = new Set([
    'required', 'minLength', 'maxLength', 'min', 'max',
    'pattern', 'email', 'matches', 'oneOf', 'validate',
  ]);

  AnalyzerClass.prototype.visitFormDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'browser') {
      this.error(`'form' can only be used inside a browser block or component`, node.loc,
        "move this inside a browser { } block", { code: 'E310' });
    }

    try {
      const Symbol = this.currentScope.constructor.prototype.constructor === undefined
        ? this._getSymbolClass()
        : this._getSymbolClass();
      this.currentScope.define(node.name, { name: node.name, kind: 'form', type: node.typeAnnotation, mutable: false, loc: node.loc });
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('form');
    try {
      for (const field of node.fields) { this._visitFormField(field); }
      for (const group of node.groups) { this._visitFormGroup(group); }
      for (const arr of node.arrays) { this._visitFormArray(arr); }
      for (const comp of node.computeds) { this.visitNode(comp); }
      if (node.steps) { this._visitFormSteps(node, node.steps); }
      if (node.onSubmit) { this.visitNode(node.onSubmit); }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitFormField = function(node) {
    try {
      this.currentScope.define(node.name, { name: node.name, kind: 'formField', type: node.typeAnnotation, mutable: false, loc: node.loc });
    } catch (e) {
      this.error(e.message);
    }
    if (node.initialValue) {
      this.visitExpression(node.initialValue);
    }
    for (const v of node.validators) {
      if (!KNOWN_VALIDATORS.has(v.name)) {
        this.warn(`Unknown validator '${v.name}'`, v.loc, { code: 'W_UNKNOWN_VALIDATOR' });
      }
      for (const arg of v.args) {
        this.visitExpression(arg);
      }
    }
  };

  AnalyzerClass.prototype._visitFormGroup = function(node) {
    try {
      this.currentScope.define(node.name, { name: node.name, kind: 'formGroup', type: null, mutable: false, loc: node.loc });
    } catch (e) {
      this.error(e.message);
    }
    if (node.condition) {
      this.visitExpression(node.condition);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const field of node.fields) { this._visitFormField(field); }
      for (const group of node.groups) { this._visitFormGroup(group); }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitFormArray = function(node) {
    try {
      this.currentScope.define(node.name, { name: node.name, kind: 'formArray', type: null, mutable: false, loc: node.loc });
    } catch (e) {
      this.error(e.message);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const field of node.fields) { this._visitFormField(field); }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype._visitFormSteps = function(formNode, stepsNode) {
    const knownMembers = new Set();
    for (const f of formNode.fields) knownMembers.add(f.name);
    for (const g of formNode.groups) knownMembers.add(g.name);
    for (const a of formNode.arrays) knownMembers.add(a.name);

    for (const step of stepsNode.steps) {
      for (const member of step.members) {
        if (!knownMembers.has(member)) {
          this.warn(`Step '${step.label}' references unknown member '${member}'`, step.loc, { code: 'W_STEP_UNKNOWN_MEMBER' });
        }
      }
    }
  };
}
```

**Step 4: Integrate into browser-analyzer.js**

At the top of `src/analyzer/browser-analyzer.js`, add import:

```javascript
import { installFormAnalyzer } from './form-analyzer.js';
```

Inside `installBrowserAnalyzer()`, after the guard check, add:

```javascript
  installFormAnalyzer(AnalyzerClass);
```

**Step 5: Add to browser plugin childNodeTypes**

In `src/registry/plugins/browser-plugin.js`, add `'FormDeclaration'` to the `childNodeTypes` array:

```javascript
    childNodeTypes: [
      'StateDeclaration', 'ComputedDeclaration', 'EffectDeclaration',
      'ComponentDeclaration', 'StoreDeclaration', 'FormDeclaration',
    ],
```

**Step 6: Run test to verify it passes**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js --filter "Analyzer"`
Expected: PASS

**Step 7: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All existing tests pass.

**Step 8: Commit**

```bash
git add src/analyzer/form-analyzer.js src/analyzer/browser-analyzer.js src/registry/plugins/browser-plugin.js tests/form-block.test.js
git commit -m "feat(forms): add form analyzer with scope, validator, and steps validation"
```

---

## Task 6: Browser Codegen — Simple Form Fields

**Files:**
- Modify: `src/codegen/browser-codegen.js:6-15` (constructor), `src/codegen/browser-codegen.js:260-274` (classification), `src/codegen/browser-codegen.js:588-604` (component body)
- Create: `src/codegen/form-codegen.js` (form generation helpers)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

Add to `tests/form-block.test.js`:

```javascript
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('createSignal("")');
    expect(b).toContain('createSignal(null)'); // error signals
    expect(b).toContain('createSignal(false)'); // touched signals
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('return {');
    expect(b).toContain('email');
    expect(b).toContain('password');
    expect(b).toContain('submit');
    expect(b).toContain('reset');
    expect(b).toContain('submitting');
    expect(b).toContain('submitError');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js --filter "Codegen"`
Expected: FAIL — FormDeclaration not handled in codegen

**Step 3: Create `src/codegen/form-codegen.js`**

This is a helper module with pure functions for generating form-related JavaScript. The browser-codegen calls into these.

```javascript
const EMAIL_REGEX = '/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/';

export function generateValidatorFn(fieldName, validators, genExpression, prefix = '') {
  const fullName = prefix ? `${prefix}_${fieldName}` : fieldName;
  const checks = [];
  for (const v of validators) {
    const args = v.args.map(a => genExpression(a));
    switch (v.name) {
      case 'required':
        checks.push(`  if (v === undefined || v === null || v === "") return ${args[0] || '"This field is required"'};`);
        break;
      case 'minLength':
        checks.push(`  if (typeof v === "string" && v.length < ${args[0]}) return ${args[1] || '"Too short"'};`);
        break;
      case 'maxLength':
        checks.push(`  if (typeof v === "string" && v.length > ${args[0]}) return ${args[1] || '"Too long"'};`);
        break;
      case 'min':
        checks.push(`  if (typeof v === "number" && v < ${args[0]}) return ${args[1] || '"Value too small"'};`);
        break;
      case 'max':
        checks.push(`  if (typeof v === "number" && v > ${args[0]}) return ${args[1] || '"Value too large"'};`);
        break;
      case 'pattern':
        checks.push(`  if (typeof v === "string" && !${args[0]}.test(v)) return ${args[1] || '"Invalid format"'};`);
        break;
      case 'email':
        checks.push(`  if (typeof v === "string" && !${EMAIL_REGEX}.test(v)) return ${args[0] || '"Invalid email"'};`);
        break;
      case 'matches':
        // args[0] is the other field signal getter expression
        checks.push(`  if (v !== ${args[0]}) return ${args[1] || '"Fields do not match"'};`);
        break;
      case 'oneOf':
        checks.push(`  if (!${args[0]}.includes(v)) return ${args[1] || '"Invalid selection"'};`);
        break;
      case 'validate':
        if (v.isAsync) {
          // async validators are handled separately
          break;
        }
        checks.push(`  { const __e = (${args[0]})(v); if (__e) return __e; }`);
        break;
    }
  }
  if (checks.length === 0) {
    return { fnName: `__validate_${fullName}`, code: `function __validate_${fullName}(v) { return null; }` };
  }
  return {
    fnName: `__validate_${fullName}`,
    code: `function __validate_${fullName}(v) {\n${checks.join('\n')}\n  return null;\n}`,
  };
}

export function generateFieldSignals(fieldName, initialValue, indent) {
  const I = ' '.repeat(indent);
  const cap = fieldName[0].toUpperCase() + fieldName.slice(1);
  return [
    `${I}const [__${fieldName}_value, __set_${fieldName}_value] = createSignal(${initialValue});`,
    `${I}const [__${fieldName}_error, __set_${fieldName}_error] = createSignal(null);`,
    `${I}const [__${fieldName}_touched, __set_${fieldName}_touched] = createSignal(false);`,
  ].join('\n');
}

export function generateFieldAccessor(fieldName, validatorFnName, indent) {
  const I = ' '.repeat(indent);
  const I2 = ' '.repeat(indent + 2);
  return [
    `${I}const ${fieldName} = {`,
    `${I2}get value() { return __${fieldName}_value(); },`,
    `${I2}get error() { return __${fieldName}_error(); },`,
    `${I2}get touched() { return __${fieldName}_touched(); },`,
    `${I2}set(v) { __set_${fieldName}_value(v); if (__${fieldName}_touched()) __set_${fieldName}_error(${validatorFnName}(v)); },`,
    `${I2}blur() { __set_${fieldName}_touched(true); __set_${fieldName}_error(${validatorFnName}(__${fieldName}_value())); },`,
    `${I2}validate() { const e = ${validatorFnName}(__${fieldName}_value()); __set_${fieldName}_error(e); return e === null; },`,
    `${I2}reset() { __set_${fieldName}_value(${`__${fieldName}_initial`}); __set_${fieldName}_error(null); __set_${fieldName}_touched(false); },`,
    `${I}};`,
  ].join('\n');
}
```

**Step 4: Add form generation to `browser-codegen.js`**

In constructor (after line 11), add:
```javascript
    this.formNames = new Set();
```

In `generate()` classification switch (after line 267), add:
```javascript
          case 'FormDeclaration': forms.push(stmt); break;
```

Add `const forms = [];` with the other arrays near line 255.

After the store generation loop, add form generation:
```javascript
    for (const f of forms) {
      lines.push(this.generateForm(f));
    }
```

In component body generation (after line 601, before the else), add:
```javascript
      } else if (node.type === 'FormDeclaration') {
        this.formNames.add(node.name);
        p.push(this.generateForm(node) + '\n');
```

Add the `generateForm(form)` method. This is the core method — it follows the `generateStore` IIFE pattern. See the design doc for the full output structure. The method:

1. Saves `stateNames`/`computedNames` (like store does)
2. Opens IIFE: `const formName = (() => {`
3. For each field: emits signal triples, initial value const, validator fn, field accessor
4. For each group: recursively emits nested field signals + group accessor
5. For each array: emits signal + item factory + array accessor
6. Emits form-level computeds: `isValid`, `isDirty`, `values`
7. Emits submit machinery: `submitting`/`submitError`/`submitCount` signals + `submit(e)` function
8. If steps: emits wizard state
9. Emits `return { ... }` with all accessors
10. Closes IIFE: `})();`
11. Restores saved name sets

The implementation is large (~200 lines) — the executing agent should implement it following the `generateStore` pattern at lines 627-698, using helper functions from `form-codegen.js`.

**Step 5: Run test to verify it passes**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/form-block.test.js --filter "Codegen"`
Expected: PASS

**Step 6: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All existing tests pass.

**Step 7: Commit**

```bash
git add src/codegen/form-codegen.js src/codegen/browser-codegen.js tests/form-block.test.js
git commit -m "feat(forms): add browser codegen for form fields with validators and IIFE generation"
```

---

## Task 7: Browser Codegen — Groups & Conditional Groups

**Files:**
- Modify: `src/codegen/form-codegen.js` (add group generation helpers)
- Modify: `src/codegen/browser-codegen.js` (extend `generateForm`)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('__shipping_street_value');
    expect(b).toContain('__shipping_city_value');
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
    const result = parse(src);
    const b = result.browser;
    // Validator should check the condition before validating
    expect(b).toContain('__sameAsShipping_value()');
    expect(b).toContain('return null'); // skip validation when condition false
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('__billing_method_value');
    expect(b).toContain('__billing_address_street_value');
  });
});
```

**Step 2-5: Implement, test, commit**

Follow same cycle. Group codegen emits prefixed signal names (`__groupName_fieldName_value`), a group accessor object with `values`, `isValid`, `isDirty`, `reset`. Conditional groups wrap their validators in `if (conditionSignal()) return null;`.

```bash
git commit -m "feat(forms): add group and conditional group codegen"
```

---

## Task 8: Browser Codegen — Form Arrays

**Files:**
- Modify: `src/codegen/form-codegen.js` (add array generation)
- Modify: `src/codegen/browser-codegen.js` (extend `generateForm`)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
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
    const result = parse(src);
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('__createLineItemsItem');
    expect(b).toContain('__id');
  });
});
```

**Step 2-5: Implement, test, commit**

Array codegen generates:
- A `createSignal([])` for the items list
- A `__nextId` counter
- A `__createXxxItem(defaults)` factory function that creates signal triples for each template field + a field accessor object + a `values` getter
- An array accessor with `items`, `length`, `add(defaults)`, `remove(item)`, `move(from, to)`

```bash
git commit -m "feat(forms): add form array codegen with signal-backed items"
```

---

## Task 9: Browser Codegen — Wizard Steps

**Files:**
- Modify: `src/codegen/browser-codegen.js` (extend `generateForm` for steps)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
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
    const result = parse(src);
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
});
```

**Step 2-5: Implement, test, commit**

Steps codegen generates `__currentStep` signal, `__steps` array with per-step validate functions, `canNext`/`canPrev`/`progress` computeds, `next()`/`prev()` functions.

```bash
git commit -m "feat(forms): add wizard steps codegen"
```

---

## Task 10: bind:form Directive

**Files:**
- Modify: `src/codegen/browser-codegen.js` (genJSXElement bind:form handling)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('onSubmit');
    expect(b).toContain('login.submit');
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `bind:form` not handled

**Step 3: Add bind:form handling**

In `browser-codegen.js`, in the `genJSXElement` method's attribute processing (near line 815 where `bind:value` is handled), add a new branch:

```javascript
      } else if (attr.name === 'bind:form') {
        const formName = this.genExpression(attr.value);
        events.submit = `(e) => ${formName}.submit(e)`;
```

**Step 4-5: Test and commit**

```bash
git commit -m "feat(forms): add bind:form directive codegen"
```

---

## Task 11: FormField & ErrorMessage Built-in Components

**Files:**
- Modify: `src/codegen/browser-codegen.js` (genJSXElement for FormField/ErrorMessage)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
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
    const result = parse(src);
    const b = result.browser;
    // FormField should inject binding on the input
    expect(b).toContain('login.email.value');
    expect(b).toContain('login.email.set');
    expect(b).toContain('login.email.blur');
    // ErrorMessage should generate conditional error display
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('login.submitError');
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement FormField/ErrorMessage transforms**

In `genJSXElement`, when the tag is `FormField`:
1. Find the `field` attribute → extract the field expression (e.g., `login.email`)
2. Find child `<input>`/`<select>`/`<textarea>` → inject `value: () => field.value`, `onInput: (e) => field.set(e.target.value)`, `onBlur: () => field.blur()`
3. Find child `<ErrorMessage />` → replace with `() => field.touched && field.error ? tova_el("span", { className: "form-error" }, [() => field.error]) : null`
4. Emit a wrapping div with `className: "form-field"`

When the tag is `ErrorMessage`:
1. If `field` attr → show `field.error` when `field.touched`
2. If `form` attr → show `form.submitError`

**Step 4-5: Test and commit**

```bash
git commit -m "feat(forms): add FormField and ErrorMessage built-in component transforms"
```

---

## Task 12: Cross-Field Validation

**Files:**
- Modify: `src/codegen/form-codegen.js` (matches validator)
- Modify: `src/codegen/browser-codegen.js` (cross-field effect)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('Form Block — Cross-field validation', () => {
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain("Passwords don't match");
    expect(b).toContain('__password_value()');
    // Should generate a re-validation effect
    expect(b).toContain('createEffect');
  });
});
```

**Step 2-5: Implement, test, commit**

The `matches` validator in `generateValidatorFn` emits code reading the sibling field's signal. After generating field accessors, the form codegen detects cross-field deps and emits `createEffect` blocks to re-validate dependent fields when source fields change.

```bash
git commit -m "feat(forms): add cross-field validation with matches() and re-validation effects"
```

---

## Task 13: Async Validators

**Files:**
- Modify: `src/codegen/form-codegen.js` (async validate)
- Modify: `src/codegen/browser-codegen.js` (async validator effects)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('Form Block — Async validators', () => {
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('setTimeout'); // debounced
    expect(b).toContain('async');
  });
});
```

**Step 2-5: Implement, test, commit**

Async validators generate a `createEffect` that debounces (300ms default), runs the async function, and sets the error signal on completion. A version counter prevents stale responses from overwriting newer results.

```bash
git commit -m "feat(forms): add async validator codegen with debounced effects"
```

---

## Task 14: Full-Stack Validation — Type-Level Validators (Phase 3)

**Files:**
- Modify: `src/parser/parser.js` (extend type field parsing to accept `{ validators }`)
- Modify: `src/parser/ast.js` (extend `TypeField` node)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
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
    expect(() => parse(src)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — parser chokes on `{ required, email }` after type annotation in a type field

**Step 3: Extend type field parsing**

In the parser's `parseTypeField` method (or equivalent — the method that parses fields inside `type Foo { ... }`), after parsing the type annotation, check for an optional `{ ... }` validator block:

```javascript
let validators = [];
if (this.check(TokenType.LBRACE)) {
  this.advance();
  while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
    validators.push(this.parseFormValidator());
  }
  this.expect(TokenType.RBRACE);
}
```

Add a `validators` field to the `TypeField` AST node (default `[]`).

**Important:** The `parseFormValidator` method is already installed by `installFormParser`. Ensure `installFormParser` is called before type parsing might encounter validators. If form-parser is lazy-loaded, move the validator parsing logic to a shared location or ensure it's available.

**Step 4-5: Test and commit**

```bash
git commit -m "feat(forms): add type-level inline validators on type fields (Phase 3)"
```

---

## Task 15: Full-Stack Validation — Server Codegen

**Files:**
- Modify: `src/codegen/server-codegen.js` (extract type validators for RPC middleware)
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('Form Block — Server validation from types (Phase 3)', () => {
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
    const result = parse(src);
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
    const result = parse(src);
    const s = result.server;
    // Should still have basic type validation but not form validators
    expect(s).not.toContain('Email required');
  });
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — server codegen does not read type-level validators

**Step 3: Extend server codegen**

In `server-codegen.js`, extend the `sharedTypes` collection (lines 306-329) to also capture validators from `TypeField` nodes:

```javascript
if (v.validators && v.validators.length > 0) {
  fields.push({ name: v.name, type: v.typeAnnotation?.name, validators: v.validators });
}
```

Create a new method `_genTypeValidatorCode(paramName, typeInfo, indent)` that generates validation code from the type's field validators (same logic as `form-codegen.js`'s `generateValidatorFn` but emitting inline checks instead of functions):

```javascript
_genTypeValidatorCode(paramName, typeInfo, indent = '  ') {
  const checks = [];
  for (const field of typeInfo.fields) {
    if (!field.validators || field.validators.length === 0) continue;
    const accessor = `${paramName}.${field.name}`;
    for (const v of field.validators) {
      // Generate inline validation check similar to _genAdvancedValidationCode
      switch (v.name) {
        case 'required':
          checks.push(`${indent}if (${accessor} === undefined || ${accessor} === null || ${accessor} === "") __validationErrors.push({ field: "${field.name}", message: ${this.genExpression(v.args[0]) || `"${field.name} is required"`} });`);
          break;
        case 'email':
          checks.push(`${indent}if (${accessor} && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(${accessor})) __validationErrors.push({ field: "${field.name}", message: ${this.genExpression(v.args[0]) || '"Invalid email"'} });`);
          break;
        case 'min':
          checks.push(`${indent}if (typeof ${accessor} === "number" && ${accessor} < ${this.genExpression(v.args[0])}) __validationErrors.push({ field: "${field.name}", message: ${this.genExpression(v.args[1]) || '"Value too small"'} });`);
          break;
        // ... same for minLength, maxLength, max, pattern, oneOf
      }
    }
  }
  return checks;
}
```

In the RPC route generation, after existing `_genValidationCode`, check if the parameter type has validators in `sharedTypes` and call `_genTypeValidatorCode`.

**Step 4-5: Test and commit**

```bash
git commit -m "feat(forms): generate server-side validation from type-level validators (Phase 3)"
```

---

## Task 16: Full-Stack Validation — Form Type Inheritance

**Files:**
- Modify: `src/codegen/browser-codegen.js` (form with type annotation inherits validators)
- Modify: `src/codegen/form-codegen.js`
- Test: `tests/form-block.test.js` (extend)

**Step 1: Write the failing test**

```javascript
describe('Form Block — Type inheritance (Phase 3)', () => {
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
    const result = parse(src);
    const b = result.browser;
    expect(b).toContain('Email required');
    expect(b).toContain('Invalid');
    expect(b).toContain('Password required');
    expect(b).toContain('Too short');
  });
});
```

**Step 2-5: Implement, test, commit**

When `generateForm` encounters a form with `typeAnnotation`, it resolves the type from the shared types registry, extracts field validators, and merges them with any explicitly declared validators on the form's fields (form-level validators override type-level for the same validator name, additional form validators append).

```bash
git commit -m "feat(forms): form type annotation inherits validators from type definition (Phase 3)"
```

---

## Task 17: Integration Tests & Full Test Suite

**Files:**
- Test: `tests/form-block.test.js` (comprehensive integration tests)

**Step 1: Write comprehensive integration tests**

```javascript
describe('Form Block — Integration', () => {
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
    const result = parse(src);
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

    // Conditional group
    expect(b).toContain('__sameAsShipping_value()');

    // Array
    expect(b).toContain('const lineItems = {');
    expect(b).toContain('add(');

    // Steps
    expect(b).toContain('currentStep');
    expect(b).toContain('canNext');

    // Validators
    expect(b).toContain('Email is required');
    expect(b).toContain('Must be 18+');

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

  test('form does not break existing browser tests', () => {
    // Simple browser block without form still works
    const src = `browser {
      state count = 0
      component App() {
        <button on:click={fn() count += 1}>"{count}"</button>
      }
    }`;
    const result = parse(src);
    expect(result.browser).toContain('createSignal(0)');
    expect(result.browser).toContain('setCount');
  });
});
```

**Step 2: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All tests pass including all new form tests and all existing tests.

**Step 3: Commit**

```bash
git add tests/form-block.test.js
git commit -m "test(forms): add comprehensive integration tests for form blocks"
```

---

## Task 18: Full Regression Test

**Step 1: Run the entire test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All ~7000+ tests pass.

**Step 2: If any failures, fix them**

Likely issues:
- `field`, `group`, `form`, `steps` becoming keywords might conflict with existing variable names in test code. If so, the tokens should only be recognized in browser/form context (contextual keywords) rather than global keywords.
- Fix: If `field` or `group` conflict, make them contextual (parse as IDENTIFIER and check value) instead of dedicated token types. `form` and `steps` are less likely to conflict.

**Step 3: Commit any fixes**

```bash
git commit -m "fix(forms): resolve keyword conflicts with existing code"
```

---

## Summary

| Task | Description | Files | Tests |
|------|------------|-------|-------|
| 1 | Tokens & keywords | tokens.js | 4 |
| 2 | AST nodes | form-ast.js, ast.js | 7 |
| 3 | Parser — simple form | form-parser.js, browser-parser.js | 4 |
| 4 | Parser — groups/arrays/steps | tests only (parser done in T3) | 8 |
| 5 | Analyzer | form-analyzer.js, browser-analyzer.js, browser-plugin.js | 3 |
| 6 | Codegen — simple fields | form-codegen.js, browser-codegen.js | 10 |
| 7 | Codegen — groups | form-codegen.js, browser-codegen.js | 3 |
| 8 | Codegen — arrays | form-codegen.js, browser-codegen.js | 2 |
| 9 | Codegen — wizard steps | browser-codegen.js | 1 |
| 10 | bind:form directive | browser-codegen.js | 1 |
| 11 | FormField/ErrorMessage | browser-codegen.js | 2 |
| 12 | Cross-field validation | form-codegen.js, browser-codegen.js | 1 |
| 13 | Async validators | form-codegen.js, browser-codegen.js | 1 |
| 14 | Phase 3: Type-level validators | parser.js, ast.js | 1 |
| 15 | Phase 3: Server codegen | server-codegen.js | 2 |
| 16 | Phase 3: Form type inheritance | browser-codegen.js | 1 |
| 17 | Integration tests | tests only | ~2 |
| 18 | Full regression | fix-only | 0 |
