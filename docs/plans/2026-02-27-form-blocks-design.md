# Tova Form Blocks Design

## Overview

First-class `form` blocks inside `browser {}` and `component` scopes. Declarative field/group/array/steps syntax with built-in validators. Compiler generates optimized reactive code (direct signals) wrapped in a form controller IIFE. Full-stack validation via type-level inline validators shared between browser and server codegen.

## Syntax

### Form Declaration

```tova
browser {
  component Checkout() {
    form checkout {
      field email: String = "" {
        required("Email is required")
        email("Must be a valid email")
      }

      field age: Int = 0 {
        required("Age is required")
        min(18, "Must be 18+")
      }

      group shipping {
        field street: String = "" { required("Required") }
        field city: String = ""   { required("Required") }
        field zip: String = ""    { pattern(/^\d{5}$/, "Invalid zip") }
      }

      group billing {
        field sameAsShipping: Bool = true
        group address when !sameAsShipping {
          field street: String = "" { required("Required") }
        }
      }

      array lineItems {
        field description: String = "" { required("Required") }
        field quantity: Int = 1        { min(1, "At least 1") }
        field unitPrice: Float = 0.0   { min(0, "Must be positive") }
      }

      computed total = lineItems
        |> map(fn(item) item.quantity * item.unitPrice)
        |> sum()

      steps {
        step "Shipping" { shipping }
        step "Billing"  { billing }
        step "Review"   { lineItems, email }
      }

      on submit {
        result = server.placeOrder(checkout.values)
        match result {
          Ok(order) => navigate("/order/{order.id}")
          Err(e) => checkout.setError(e.message)
        }
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
}
```

### Type-Level Validation (Full-Stack)

```tova
type OrderRequest {
  email: String { required, email }
  age: Int { required, min(18) }
  items: [LineItem] { required, minLength(1, "Need at least one item") }
}

server {
  fn placeOrder(order: OrderRequest) -> Result<Order, String> {
    // Validation auto-generated from OrderRequest field rules
  }
}

browser {
  component OrderForm() {
    form order: OrderRequest {
      field email {
        async validate(fn(v) server.checkEmail(v))
      }
      on submit { server.placeOrder(order.values) }
    }
  }
}
```

## Built-in Validators

| Validator | Applies to | Meaning |
|-----------|-----------|---------|
| `required(msg)` | All | Not empty/null/undefined |
| `minLength(n, msg)` | String | `len(value) >= n` |
| `maxLength(n, msg)` | String | `len(value) <= n` |
| `min(n, msg)` | Int, Float | `value >= n` |
| `max(n, msg)` | Int, Float | `value <= n` |
| `pattern(regex, msg)` | String | `regex.test(value)` |
| `email(msg)` | String | Built-in email regex |
| `matches(otherField, msg)` | Any | Cross-field equality |
| `oneOf(values, msg)` | Any | `values.includes(value)` |
| `validate(fn)` | Any | Custom sync: `fn(value) -> String?` |
| `async validate(fn)` | Any | Custom async, debounced |

## Form API

```
form.fieldName             -- field accessor (.value, .error, .touched, .set, .blur, .validate)
form.groupName             -- group accessor (.values, .isValid, .isDirty, .errors, .reset)
form.arrayName             -- array accessor (.items, .add, .remove, .move, .length)
form.values                -- computed: full nested values object
form.isValid               -- computed: all fields valid
form.isDirty               -- computed: any field dirty
form.errors                -- computed: flat list of all errors
form.submit(e?)            -- trigger submit
form.reset()               -- reset all to initial
form.submitting            -- signal: true during async submit
form.submitError           -- signal: last submit error
form.submitCount           -- signal: number of submits
form.setError(msg)         -- set form-level error
form.currentStep           -- signal (wizard): current step index
form.next()                -- wizard: validate + advance
form.prev()                -- wizard: go back
form.canNext               -- computed (wizard): current step valid
form.canPrev               -- computed (wizard): not first step
form.progress              -- computed (wizard): 0.0 to 1.0
```

## AST Nodes

```
FormDeclaration {
  type: 'FormDeclaration'
  name: string
  typeAnnotation: TypeAnnotation?
  fields: FormFieldDeclaration[]
  groups: FormGroupDeclaration[]
  arrays: FormArrayDeclaration[]
  computeds: ComputedDeclaration[]
  steps: FormStepsDeclaration?
  onSubmit: BlockStatement?
  loc
}

FormFieldDeclaration {
  type: 'FormFieldDeclaration'
  name: string
  typeAnnotation: TypeAnnotation?
  initialValue: Expression?
  validators: FormValidator[]
  loc
}

FormGroupDeclaration {
  type: 'FormGroupDeclaration'
  name: string
  condition: Expression?
  fields: FormFieldDeclaration[]
  groups: FormGroupDeclaration[]
  loc
}

FormArrayDeclaration {
  type: 'FormArrayDeclaration'
  name: string
  fields: FormFieldDeclaration[]
  validators: FormValidator[]
  loc
}

FormValidator {
  type: 'FormValidator'
  name: string
  args: Expression[]
  isAsync: boolean
  loc
}

FormStepsDeclaration {
  type: 'FormStepsDeclaration'
  steps: FormStep[]
  loc
}

FormStep {
  type: 'FormStep'
  label: string
  members: string[]
  loc
}
```

## Parser Grammar

```
FormDeclaration  = 'form' IDENTIFIER (':' TypeAnnotation)? '{' FormBody '}'
FormBody         = (FormField | FormGroup | FormArray | FormComputed | FormSteps | FormOnSubmit)*
FormField        = 'field' IDENTIFIER (':' TypeAnnotation)? ('=' Expression)? ('{' ValidatorList '}')?
FormGroup        = 'group' IDENTIFIER ('when' Expression)? '{' (FormField | FormGroup)* '}'
FormArray        = 'array' IDENTIFIER '{' FormField* '}'
FormComputed     = 'computed' IDENTIFIER '=' Expression
FormSteps        = 'steps' '{' FormStep* '}'
FormStep         = 'step' STRING '{' IdentifierList '}'
FormOnSubmit     = 'on' 'submit' BlockStatement
ValidatorList    = Validator*
Validator        = ('async')? IDENTIFIER '(' ExpressionList ')'
```

## Analyzer Rules

- `visitFormDeclaration`: Validate browser/component context. Resolve type annotation. Define symbol kind='form'. Create child scope. Visit children. Validate steps coverage.
- `visitFormFieldDeclaration`: Define symbol kind='formField'. Validate type matches initial value. Validate known validators. Check validator arg types.
- `visitFormGroupDeclaration`: Define symbol kind='formGroup'. Visit `when` condition. Create child scope for nested fields.
- `visitFormArrayDeclaration`: Define symbol kind='formArray'. Create child scope for template fields.
- `visitFormStepsDeclaration`: Verify members reference existing fields/groups/arrays. Warn on uncovered fields.
- Cross-field: `matches(otherField)` resolves sibling field references.
- Full-stack: When `on submit` calls typed RPC, verify form values shape matches parameter type.

## Browser Codegen

Form compiles to a revealing-module IIFE (same pattern as `store`):

1. Per-field signal triples: `[value, setValue]`, `[error, setError]`, `[touched, setTouched]`
2. Validator functions: `__validate_fieldName(v)` — returns error string or null
3. Field accessors: `{ get value(), get error(), get touched(), set(v), blur(), validate(), reset() }`
4. Group accessors: `{ fieldName, get values(), get isValid(), get isDirty(), reset() }`
5. Array accessor: `{ get items(), get length(), add(defaults), remove(item), move(from, to) }`
6. Form-level computeds: `isValid`, `isDirty`, `values`
7. Submit machinery: `submitting`, `submitError`, `submitCount` signals + `submit(e)` function
8. Steps (wizard): `currentStep`, `canNext`, `canPrev`, `progress`, `next()`, `prev()`
9. Return controller object with getters/methods

### bind:form Directive

`<form bind:form={checkout}>` compiles to `tova_el("form", { onSubmit: (e) => checkout.submit(e) }, children)`.

### FormField Built-in Component

Compiler-time transform (no runtime component):
- Finds child `<input>` → injects `bind:value` + `on:blur` wired to the field
- Replaces `<ErrorMessage />` → conditional error span shown when touched && error

### Conditional Groups

`when` condition wraps the group's validators in a guard: `if (condition()) return null;`. The `isValid` computed also respects the condition.

### Cross-Field Validators

`matches(password)` generates a validator reading the sibling field signal. An effect re-validates the dependent field when the source field changes.

## Server Codegen (Full-Stack Validation)

### Type-Level Validators

Type fields with `{ required, min(18) }` blocks store validators on the TypeField AST node.

### RPC Middleware Generation

When a server function has a typed parameter whose type has validators, the server codegen generates validation code before the function body:

```javascript
const __validationErrors = [];
if (order.email === undefined || order.email === null || order.email === "")
  __validationErrors.push({ field: "email", message: "email is required" });
// ... more checks ...
if (__validationErrors.length > 0)
  return __errorResponse(400, "VALIDATION_FAILED", "Validation failed", __validationErrors);
```

### Compile-Time Shape Verification

When a form typed as `form order: OrderRequest` calls `server.placeOrder(order.values)` where `placeOrder` takes `OrderRequest`, the analyzer verifies the shapes match.

## Phases

### Phase 2: Compiler Integration
- Token: `FORM`, `FIELD`, `GROUP`, `ARRAY`, `STEPS`
- AST: All form nodes in `form-ast.js`, re-exported from `ast.js`
- Parser: `form-parser.js` with `installFormParser()`, integrated into browser parser
- Analyzer: `form-analyzer.js` with `installFormAnalyzer()`
- Browser codegen: Form IIFE generation, `bind:form`, `FormField`, `ErrorMessage`
- All built-in validators
- Wizard steps

### Phase 3: Full-Stack Validation
- Type-level inline validators (extend type field AST + parser)
- Server codegen: Extract type validators → RPC middleware
- Analyzer: Compile-time form ↔ RPC shape verification

## Files Touched

**New files:**
- `src/parser/form-ast.js` — AST node classes
- `src/parser/form-parser.js` — parser plugin
- `src/analyzer/form-analyzer.js` — analyzer plugin
- `src/codegen/form-codegen.js` — form-specific codegen helpers
- `tests/form-block.test.js` — comprehensive test suite

**Modified files:**
- `src/lexer/tokens.js` — new token types + keywords
- `src/parser/ast.js` — re-export form AST nodes
- `src/parser/browser-parser.js` — dispatch to form parser
- `src/codegen/browser-codegen.js` — form IIFE generation, bind:form, FormField, ErrorMessage
- `src/registry/plugins/browser-plugin.js` — add form childNodeTypes
- `src/codegen/server-codegen.js` — type-level validation extraction (Phase 3)
- `src/parser/parser.js` — type field validators (Phase 3)
