# Form Block

The `form` block is a first-class language construct inside `browser {}` and `component` scopes that gives you declarative, signal-backed forms with built-in validation, field groups, dynamic arrays, wizard steps, and full-stack type-level validation. The compiler generates all reactive wiring, validators, and submit handling directly -- no form library needed.

## Why a Dedicated Form Block?

Forms are the most complex UI pattern in web development. Without compiler support, you wire up state for every field, write validation logic by hand, manage touched/dirty tracking, handle async validators, build multi-step wizards, and then duplicate all that validation on the server. One missed field, one forgotten validator, and your form has a bug.

The `form` block solves this:

- **Declarative fields** -- each field gets reactive value, error, and touched signals automatically
- **Built-in validators** -- `required`, `email`, `min`, `max`, `pattern`, `matches`, and more, with zero boilerplate
- **Field groups** -- organize related fields with shared validation and conditional visibility
- **Dynamic arrays** -- add/remove/reorder repeating field sets with signal-backed reactivity
- **Wizard steps** -- multi-step forms with per-step validation and navigation
- **Full-stack validation** -- type-level validators shared between browser and server, validated at compile time
- **Compiler-time transforms** -- `FormField` and `ErrorMessage` auto-wire inputs and display errors with no runtime components
- **Zero dependencies** -- the compiler generates all code directly from your declarations

## Syntax Overview

```tova
browser {
  component Signup() {
    form signup {
      field email: String = "" {
        required("Email is required")
        email("Must be a valid email")
      }

      field password: String = "" {
        required("Password is required")
        minLength(8, "At least 8 characters")
      }

      field confirmPassword: String = "" {
        required("Please confirm your password")
        matches(password, "Passwords don't match")
      }

      group address {
        field street: String = "" { required("Required") }
        field city: String = "" { required("Required") }
        field zip: String = "" { pattern(/^\d{5}$/, "Invalid zip code") }
      }

      on submit {
        result = server.createAccount(signup.values)
        match result {
          Ok(user) => navigate("/welcome")
          Err(e) => signup.setError(e.message)
        }
      }
    }

    <form bind:form={signup}>
      <FormField field={signup.email}>
        <label>"Email"</label>
        <input type="email" />
        <ErrorMessage />
      </FormField>

      <FormField field={signup.password}>
        <label>"Password"</label>
        <input type="password" />
        <ErrorMessage />
      </FormField>

      <FormField field={signup.confirmPassword}>
        <label>"Confirm Password"</label>
        <input type="password" />
        <ErrorMessage />
      </FormField>

      <button type="submit" disabled={!signup.isValid}>
        "Create Account"
      </button>
    </form>
  }
}
```

## Fields

Every `field` declaration creates a reactive triple: value signal, error signal, and touched signal. The compiler generates all three and wires them into a field accessor object.

```tova
form login {
  field email: String = ""
  field age: Int = 0
  field agreed: Bool = false
}
```

Each field exposes:

| Property | Type | Description |
|---|---|---|
| `field.value` | Signal read | Current field value |
| `field.error` | Signal read | Current validation error (or null) |
| `field.touched` | Signal read | Whether the field has been blurred |
| `field.set(v)` | Function | Set the field value |
| `field.blur()` | Function | Mark as touched and run validation |
| `field.validate()` | Function | Run validation immediately |
| `field.reset()` | Function | Reset to initial value, clear error and touched |

Access fields through the form controller:

```tova
// Read the email value
signup.email.value

// Set a value programmatically
signup.email.set("user@example.com")

// Check if touched
if signup.email.touched {
  // Show error
}
```

## Validators

Validators are declared inside field blocks. They run on blur (when the field loses focus) and on submit. Each validator returns an error string or null.

```tova
field email: String = "" {
  required("Email is required")
  email("Must be a valid email")
}

field age: Int = 0 {
  required("Age is required")
  min(18, "Must be 18 or older")
  max(120, "Invalid age")
}

field username: String = "" {
  required("Required")
  minLength(3, "Too short")
  maxLength(20, "Too long")
  pattern(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only")
}
```

### Built-in Validators

| Validator | Applies To | Description |
|---|---|---|
| `required(msg)` | All types | Value is not empty, null, or undefined |
| `email(msg)` | String | Valid email format |
| `minLength(n, msg)` | String | Length >= n |
| `maxLength(n, msg)` | String | Length <= n |
| `min(n, msg)` | Int, Float | Value >= n |
| `max(n, msg)` | Int, Float | Value <= n |
| `pattern(regex, msg)` | String | Matches regular expression |
| `matches(field, msg)` | Any | Equal to another field's value |
| `oneOf(values, msg)` | Any | Value is in the list |
| `validate(fn)` | Any | Custom sync validator function |
| `async validate(fn)` | Any | Custom async validator (debounced) |

### Custom Validators

Use `validate` for custom synchronous validation:

```tova
field username: String = "" {
  required("Required")
  validate(fn(v) {
    if contains(v, " ") {
      "No spaces allowed"
    } else {
      None
    }
  })
}
```

### Async Validators

Use `async validate` for server-side validation. The validator is automatically debounced (300ms) with a version counter to prevent stale results:

```tova
field email: String = "" {
  required("Required")
  email("Invalid email")
  async validate(fn(v) server.checkEmailAvailable(v))
}
```

The generated code:
1. Waits 300ms after the last keystroke before calling the server
2. Tracks a version counter so earlier responses don't overwrite newer ones
3. Sets the error signal with the result

### Cross-Field Validation

The `matches` validator compares a field against a sibling field. When the source field changes, the dependent field is automatically re-validated:

```tova
form register {
  field password: String = "" {
    required("Required")
    minLength(8, "At least 8 characters")
  }
  field confirmPassword: String = "" {
    required("Required")
    matches(password, "Passwords don't match")
  }
}
```

The compiler generates a `createEffect` that watches the source field and re-validates the dependent field whenever it changes.

## Groups

Groups organize related fields under a namespace. Each group has prefixed signals and a group accessor:

```tova
form checkout {
  group shipping {
    field street: String = "" { required("Required") }
    field city: String = "" { required("Required") }
    field state: String = "" { required("Required") }
    field zip: String = "" { pattern(/^\d{5}$/, "Invalid zip") }
  }
}
```

Access group fields and properties:

```tova
checkout.shipping.street.value   // Field accessor
checkout.shipping.values         // All group field values as an object
checkout.shipping.isValid        // All group fields valid
checkout.shipping.isDirty        // Any group field changed from initial
checkout.shipping.reset()        // Reset all group fields
```

### Conditional Groups

Groups can have a `when` condition. When the condition is false, the group's validators are skipped and its fields are not required:

```tova
form checkout {
  group billing {
    field sameAsShipping: Bool = true

    group address when !sameAsShipping {
      field street: String = "" { required("Required") }
      field city: String = "" { required("Required") }
    }
  }
}
```

When `sameAsShipping` is true, the billing address fields are not validated. When the user unchecks it, the validators activate.

### Nested Groups

Groups can be nested:

```tova
form checkout {
  group billing {
    field method: String = "card"

    group card when method == "card" {
      field number: String = "" { required("Required") }
      field expiry: String = "" { required("Required") }
    }

    group bank when method == "bank" {
      field routing: String = "" { required("Required") }
      field account: String = "" { required("Required") }
    }
  }
}
```

## Arrays

Arrays define repeating field sets. Each item is a factory-produced signal group that can be added, removed, and reordered:

```tova
form invoice {
  array lineItems {
    field description: String = "" { required("Required") }
    field quantity: Int = 1 { min(1, "At least 1") }
    field unitPrice: Float = 0.0 { min(0, "Must be positive") }
  }
}
```

The array accessor:

| Property | Type | Description |
|---|---|---|
| `array.items` | Signal read | Array of item accessors |
| `array.length` | Computed | Number of items |
| `array.add(defaults?)` | Function | Add a new item (optional default values) |
| `array.remove(item)` | Function | Remove an item |
| `array.move(from, to)` | Function | Reorder items |

```tova
// Add a new line item
invoice.lineItems.add()

// Add with defaults
invoice.lineItems.add({ description: "Consulting", unitPrice: 150.0 })

// Remove an item
invoice.lineItems.remove(item)

// Iterate
for item in invoice.lineItems.items {
  <div>
    <input bind:value={item.description.value} />
    <span>{item.quantity.value * item.unitPrice.value}</span>
  </div>
}
```

## Wizard Steps

Steps define a multi-step form wizard with per-step validation:

```tova
form checkout {
  field email: String = "" { required("Required") }

  group shipping {
    field street: String = "" { required("Required") }
    field city: String = "" { required("Required") }
  }

  group payment {
    field cardNumber: String = "" { required("Required") }
  }

  steps {
    step "Account" { email }
    step "Shipping" { shipping }
    step "Payment" { payment }
  }
}
```

The wizard provides:

| Property | Type | Description |
|---|---|---|
| `form.currentStep` | Signal | Current step index (0-based) |
| `form.canNext` | Computed | Current step's fields are all valid |
| `form.canPrev` | Computed | Not on the first step |
| `form.progress` | Computed | 0.0 to 1.0 completion ratio |
| `form.next()` | Function | Validate current step and advance |
| `form.prev()` | Function | Go back one step |

```tova
<div class="wizard">
  <div class="progress" style={"width: " ++ str(checkout.progress * 100) ++ "%"} />

  // Show current step content based on checkout.currentStep
  if checkout.currentStep == 0 {
    <FormField field={checkout.email}>
      <input type="email" />
      <ErrorMessage />
    </FormField>
  }

  <div class="nav">
    <button on:click={fn() checkout.prev()} disabled={!checkout.canPrev}>
      "Back"
    </button>
    <button on:click={fn() checkout.next()} disabled={!checkout.canNext}>
      "Next"
    </button>
  </div>
</div>
```

## Form API

The form controller object exposes:

| Property | Type | Description |
|---|---|---|
| `form.fieldName` | Accessor | Field accessor (value, error, touched, set, blur, validate, reset) |
| `form.groupName` | Accessor | Group accessor (values, isValid, isDirty, reset, field accessors) |
| `form.arrayName` | Accessor | Array accessor (items, length, add, remove, move) |
| `form.values` | Computed | Full nested values object |
| `form.isValid` | Computed | All fields valid |
| `form.isDirty` | Computed | Any field changed from initial |
| `form.errors` | Computed | Flat list of all errors |
| `form.submit(e?)` | Function | Trigger validation and submit handler |
| `form.reset()` | Function | Reset all fields to initial values |
| `form.submitting` | Signal | True during async submit |
| `form.submitError` | Signal | Last submit error message |
| `form.submitCount` | Signal | Number of submit attempts |
| `form.setError(msg)` | Function | Set a form-level error |

## `bind:form` Directive

The `bind:form` directive wires a `<form>` element's submit event to the form controller:

```tova
<form bind:form={signup}>
  // children...
</form>
```

This compiles to `onSubmit: (e) => signup.submit(e)`, which calls `e.preventDefault()` and runs the form's submit handler.

## `FormField` Component

`FormField` is a compiler-time transform (not a runtime component). It auto-wires a child input element to a field's signals:

```tova
<FormField field={signup.email}>
  <label>"Email"</label>
  <input type="email" />
  <ErrorMessage />
</FormField>
```

The compiler:
1. Wraps children in a `<div class="form-field">`
2. Finds the child `<input>`, `<select>`, or `<textarea>` and injects:
   - `value` binding to `field.value`
   - `onInput` handler calling `field.set(e.target.value)`
   - `onBlur` handler calling `field.blur()`
3. Replaces `<ErrorMessage />` with a conditional error span

## `ErrorMessage` Component

`ErrorMessage` is also a compiler-time transform. It renders a conditional `<span class="form-error">` based on the field or form state:

```tova
// Inside FormField -- shows field error when touched
<FormField field={signup.email}>
  <input type="email" />
  <ErrorMessage />
</FormField>

// Standalone with field attribute
<ErrorMessage field={signup.email} />

// Form-level error (e.g., server error on submit)
<ErrorMessage form={signup} />
```

When `field.touched && field.error` is truthy, the error span is rendered. Otherwise, nothing is shown.

## Full-Stack Type-Level Validation

Tova's form system supports sharing validators between browser and server through type-level inline validators. Define validators on type fields, and both the browser form codegen and server RPC codegen use them.

### Type-Level Validators

Add validators directly to type field declarations:

```tova
type OrderRequest {
  email: String { required("Email required"), email("Invalid email") }
  amount: Int { required("Amount required"), min(1, "Must be positive") }
  notes: String
}
```

### Server-Side Validation

When a server function takes a typed parameter whose type has validators, the compiler generates validation middleware automatically:

```tova
server {
  fn placeOrder(order: OrderRequest) -> Result<Order, String> {
    // Validation runs automatically before this code executes
    // If validation fails, returns 400 with structured errors
    OrderModel.create(order)
  }
}
```

The generated server code checks each field's validators and returns a structured error response:

```javascript
// Auto-generated by compiler
const __validationErrors = [];
if (order.email === undefined || order.email === null || order.email === "")
  __validationErrors.push({ field: "email", message: "Email required" });
if (order.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email))
  __validationErrors.push({ field: "email", message: "Invalid email" });
// ... more checks ...
if (__validationErrors.length > 0)
  return __errorResponse(400, "VALIDATION_FAILED", "Validation failed", __validationErrors);
```

### Form Type Inheritance

A form can reference a type to inherit its validators. Form-level validators override type-level for the same validator name; additional form validators append:

```tova
type LoginRequest {
  email: String { required("Email required"), email("Invalid email") }
  password: String { required("Password required"), minLength(8, "Too short") }
}

browser {
  component LoginForm() {
    form login: LoginRequest {
      field email: String = ""
      field password: String = "" {
        // This appends to the inherited validators
        validate(fn(v) {
          if v == "password" { "Too common" } else { None }
        })
      }
    }

    <form bind:form={login}>
      <FormField field={login.email}>
        <input type="email" />
        <ErrorMessage />
      </FormField>
      <FormField field={login.password}>
        <input type="password" />
        <ErrorMessage />
      </FormField>
      <button type="submit">"Log In"</button>
    </form>
  }
}

server {
  fn login(creds: LoginRequest) -> Result<Token, String> {
    // Both browser and server validate against LoginRequest's rules
    AuthService.authenticate(creds.email, creds.password)
  }
}
```

Both the browser form and the server RPC endpoint validate against the same `LoginRequest` rules. Write your validators once, enforce them everywhere.

## Submit Handling

The `on submit` block runs when the form is submitted. All fields are validated first. If validation passes, the block executes:

```tova
form contact {
  field name: String = "" { required("Required") }
  field email: String = "" { required("Required"), email("Invalid") }
  field message: String = "" { required("Required") }

  on submit {
    result = server.sendMessage(contact.values)
    match result {
      Ok(_) => {
        contact.reset()
        showSuccess = true
      }
      Err(e) => contact.setError(e.message)
    }
  }
}
```

During submission:
- `form.submitting` is `true`
- All fields are marked as touched (so errors display)
- If all validators pass, the `on submit` block runs
- `form.submitCount` increments
- On error, `form.submitError` is set

## Compile-Time Warnings

The analyzer validates form declarations at compile time:

| Warning | Description |
|---|---|
| `W_UNKNOWN_VALIDATOR` | Validator name is not recognized |
| `W_STEP_UNKNOWN_MEMBER` | Step references a field, group, or array that doesn't exist |

## Complete Example

```tova
type CheckoutRequest {
  email: String { required("Email required"), email("Invalid email") }
  total: Float { min(0, "Invalid total") }
}

server {
  fn submitOrder(order: CheckoutRequest) -> Result<Order, String> {
    OrderModel.create(order)
  }
}

browser {
  component Checkout() {
    form checkout: CheckoutRequest {
      field email: String = ""

      group shipping {
        field street: String = "" { required("Street required") }
        field city: String = "" { required("City required") }
        field zip: String = "" {
          required("Zip required")
          pattern(/^\d{5}$/, "Must be 5 digits")
        }
      }

      group billing {
        field sameAsShipping: Bool = true
        group address when !sameAsShipping {
          field street: String = "" { required("Required") }
          field city: String = "" { required("Required") }
          field zip: String = "" { pattern(/^\d{5}$/, "Invalid") }
        }
      }

      array lineItems {
        field description: String = "" { required("Required") }
        field quantity: Int = 1 { min(1, "At least 1") }
        field unitPrice: Float = 0.0 { min(0, "Must be positive") }
      }

      steps {
        step "Contact" { email }
        step "Shipping" { shipping }
        step "Billing" { billing }
        step "Items" { lineItems }
      }

      on submit {
        total = checkout.lineItems.items
          |> map(fn(i) i.quantity.value * i.unitPrice.value)
          |> sum()
        result = server.submitOrder({
          email: checkout.email.value,
          total: total
        })
        match result {
          Ok(order) => navigate("/order/" ++ str(order.id))
          Err(e) => checkout.setError(e.message)
        }
      }
    }

    <form bind:form={checkout}>
      <div class="progress-bar">
        <div style={"width:" ++ str(checkout.progress * 100) ++ "%"} />
      </div>

      if checkout.currentStep == 0 {
        <FormField field={checkout.email}>
          <label>"Email"</label>
          <input type="email" />
          <ErrorMessage />
        </FormField>
      }

      if checkout.currentStep == 1 {
        <FormField field={checkout.shipping.street}>
          <label>"Street"</label>
          <input />
          <ErrorMessage />
        </FormField>
        <FormField field={checkout.shipping.city}>
          <label>"City"</label>
          <input />
          <ErrorMessage />
        </FormField>
        <FormField field={checkout.shipping.zip}>
          <label>"Zip"</label>
          <input />
          <ErrorMessage />
        </FormField>
      }

      if checkout.currentStep == 3 {
        for item in checkout.lineItems.items {
          <div class="line-item">
            <input bind:value={item.description.value} />
            <input type="number" bind:value={item.quantity.value} />
            <input type="number" bind:value={item.unitPrice.value} />
            <button on:click={fn() checkout.lineItems.remove(item)}>
              "Remove"
            </button>
          </div>
        }
        <button on:click={fn() checkout.lineItems.add()}>
          "Add Item"
        </button>
      }

      <div class="wizard-nav">
        <button on:click={fn() checkout.prev()} disabled={!checkout.canPrev}>
          "Back"
        </button>
        if checkout.currentStep < 3 {
          <button on:click={fn() checkout.next()} disabled={!checkout.canNext}>
            "Next"
          </button>
        } else {
          <button type="submit" disabled={!checkout.isValid}>
            "Place Order"
          </button>
        }
      </div>

      <ErrorMessage form={checkout} />
    </form>
  }
}
```

## Related Pages

- [Browser Block](./browser-block) -- the browser scope where forms live
- [RPC Bridge](./rpc) -- how `server.fn()` calls work in submit handlers
- [Shared Block](./shared-block) -- shared types for full-stack validation
- [Security Block](./security-block) -- CSRF and rate limiting for form submissions
- [Forms & Validation](/reactivity/forms) -- reactive forms reference
- [Directives](/reactivity/directives) -- `bind:form` and other directives
- [Components](/reactivity/components) -- component patterns with forms
