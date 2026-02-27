# Forms & Validation

Tova provides two ways to handle forms in the browser: manual form handling with signals and the declarative `form` block. This page covers both approaches and explains when to use each.

## Manual Forms with Signals

For simple forms, you can use signals and event handlers directly:

```tova
browser {
  state name = ""
  state email = ""
  state error = ""

  fn handleSubmit() {
    if name == "" {
      error = "Name is required"
      return ()
    }
    result = server.createUser(name, email)
    match result {
      Ok(_) => navigate("/success")
      Err(e) => error = e.message
    }
  }

  component ContactForm() {
    <form on:submit={handleSubmit}>
      <input bind:value={name} placeholder="Name" />
      <input bind:value={email} placeholder="Email" />
      if error != "" {
        <p class="error">{error}</p>
      }
      <button type="submit">"Send"</button>
    </form>
  }
}
```

This works for simple cases, but as forms grow in complexity -- validation rules, touched state, error display, field groups, dynamic arrays -- the manual approach becomes unwieldy.

## Declarative Forms with `form` Block

The `form` block gives you compiler-generated reactive forms with built-in validation:

```tova
browser {
  component ContactForm() {
    form contact {
      field name: String = "" { required("Name is required") }
      field email: String = "" {
        required("Email is required")
        email("Invalid email format")
      }
      field message: String = "" {
        required("Message is required")
        minLength(10, "At least 10 characters")
      }

      on submit {
        server.sendMessage(contact.values)
      }
    }

    <form bind:form={contact}>
      <FormField field={contact.name}>
        <label>"Name"</label>
        <input />
        <ErrorMessage />
      </FormField>

      <FormField field={contact.email}>
        <label>"Email"</label>
        <input type="email" />
        <ErrorMessage />
      </FormField>

      <FormField field={contact.message}>
        <label>"Message"</label>
        <textarea />
        <ErrorMessage />
      </FormField>

      <button type="submit" disabled={!contact.isValid}>
        "Send"
      </button>
    </form>
  }
}
```

For full `form` block documentation, see [Form Block](/fullstack/form-block).

## `bind:form` Directive

The `bind:form` directive connects a `<form>` HTML element to a form controller. It wires the element's `onSubmit` event to the controller's `submit()` method:

```tova
<form bind:form={myForm}>
  // form children
</form>
```

This is equivalent to:

```tova
<form on:submit={fn(e) myForm.submit(e)}>
  // form children
</form>
```

The form controller's `submit()` method calls `e.preventDefault()`, validates all fields, marks them all as touched, and then runs the `on submit` block if validation passes.

## `FormField` Compiler Transform

`FormField` is not a runtime component -- the compiler transforms it at compile time. It wraps its children in a `<div class="form-field">` and auto-wires any child `<input>`, `<select>`, or `<textarea>` to the field's signals:

```tova
<FormField field={form.email}>
  <label>"Email"</label>
  <input type="email" />
  <ErrorMessage />
</FormField>
```

The compiler generates code that:
- Binds the input's `value` to `field.value` (reactive read)
- Binds `onInput` to `field.set(e.target.value)`
- Binds `onBlur` to `field.blur()` (marks as touched and validates)
- Replaces `<ErrorMessage />` with a conditional error display

### Supported Input Elements

`FormField` auto-wires these elements:

| Element | Binding |
|---|---|
| `<input>` | `value`, `onInput`, `onBlur` |
| `<input type="email">` | Same as above |
| `<input type="password">` | Same as above |
| `<input type="number">` | Same as above |
| `<select>` | `value`, `onInput`, `onBlur` |
| `<textarea>` | `value`, `onInput`, `onBlur` |

Other children (labels, spans, divs) pass through unchanged.

## `ErrorMessage` Compiler Transform

`ErrorMessage` renders a conditional `<span class="form-error">` that shows validation errors. It has three modes:

### Inside FormField

When nested inside `<FormField>`, it inherits the parent field automatically:

```tova
<FormField field={form.email}>
  <input type="email" />
  <ErrorMessage />
</FormField>
```

Shows `field.error` when `field.touched && field.error` is truthy.

### Standalone with Field

Attach to any field explicitly:

```tova
<ErrorMessage field={form.email} />
```

Shows `field.error` when `field.touched && field.error` is truthy.

### Form-Level Error

Display the form's submit error:

```tova
<ErrorMessage form={myForm} />
```

Shows `form.submitError` when truthy. Use this for server errors returned during submit.

### Styling Error Messages

All error messages render as `<span class="form-error">`. Style them with CSS:

```tova
css {
  .form-error {
    color: #dc2626;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .form-field {
    margin-bottom: 1rem;
  }
}
```

## Two-Way Binding with `bind:value`

For forms that don't use the `form` block, standard two-way binding works with signals:

```tova
browser {
  state searchQuery = ""

  <input bind:value={searchQuery} placeholder="Search..." />
  <p>"Searching for: {searchQuery}"</p>
}
```

### Checkbox Binding

```tova
state agreed = false
<input type="checkbox" bind:checked={agreed} />
```

### Radio Group Binding

```tova
state color = "red"
<input type="radio" name="color" value="red" bind:group={color} />
<input type="radio" name="color" value="blue" bind:group={color} />
<input type="radio" name="color" value="green" bind:group={color} />
```

### Select Binding

```tova
state country = ""
<select bind:value={country}>
  <option value="">"Select..."</option>
  <option value="us">"United States"</option>
  <option value="uk">"United Kingdom"</option>
</select>
```

See [Directives](/reactivity/directives) for the full `bind:` reference.

## Validation Patterns

### Inline Validation Feedback

Show validation state with CSS classes:

```tova
form login {
  field email: String = "" { required("Required"), email("Invalid") }
}

<div class={"field " ++ if login.email.touched && login.email.error { "invalid" } else { "" }}>
  <input
    bind:value={login.email.value}
    on:blur={fn() login.email.blur()}
    class:error={login.email.touched && login.email.error != None}
  />
  if login.email.touched && login.email.error {
    <span class="error">{login.email.error}</span>
  }
</div>
```

### Submit Button State

Disable the submit button while the form is invalid or submitting:

```tova
<button
  type="submit"
  disabled={!form.isValid || form.submitting}
>
  if form.submitting {
    "Submitting..."
  } else {
    "Submit"
  }
</button>
```

### Server Error Display

Show server errors after a failed submit:

```tova
form login {
  field email: String = "" { required("Required") }
  field password: String = "" { required("Required") }

  on submit {
    result = server.login(login.values)
    match result {
      Ok(token) => navigate("/dashboard")
      Err(e) => login.setError(e.message)
    }
  }
}

<form bind:form={login}>
  // fields...
  <ErrorMessage form={login} />
  <button type="submit">"Log In"</button>
</form>
```

### Reset Form

```tova
<button on:click={fn() myForm.reset()}>
  "Clear Form"
</button>
```

## When to Use What

| Scenario | Approach |
|---|---|
| Simple 1-2 field form | Manual signals + `bind:value` |
| Form with validation | `form` block |
| Multi-step wizard | `form` block with `steps` |
| Dynamic repeating fields | `form` block with `array` |
| Full-stack validation | `form` block with typed type |
| Search/filter inputs | Manual signals + `bind:value` |

## Related Pages

- [Form Block](/fullstack/form-block) -- full form block syntax and features
- [Directives](/reactivity/directives) -- `bind:value`, `bind:checked`, `bind:group`, `bind:form`
- [Signals](/reactivity/signals) -- reactive state for manual forms
- [Components](/reactivity/components) -- building form components
- [RPC Bridge](/fullstack/rpc) -- server calls in submit handlers
