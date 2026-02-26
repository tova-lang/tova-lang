# Shared Block

The `shared` block defines types, validation functions, and constants that are available to **both** the client and the server. It acts as the contract between the two sides of your application, ensuring that the same data structures and validation rules are used everywhere.

## Purpose

In a traditional web application, you would define your types in a schema file, then manually keep your server-side types and client-side types in sync. In Tova, the shared block eliminates this problem entirely. You define your types once, and the compiler makes them available to both runtimes.

Common uses:
- **Type definitions** -- the shape of your data
- **Validation functions** -- rules that must be enforced on both sides
- **Constants and enums** -- values that both client and server reference
- **Pure utility functions** -- string formatting, date helpers, etc.

## Basic Syntax

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
  }
}
```

The `shared` keyword opens a block. Everything inside it is compiled to a standalone JavaScript module that both the server and client import.

## Type Definitions

Shared types define the data contracts for your application. They are the single source of truth for what a "User" or "ApiError" looks like:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
    role: String
    created_at: String
  }

  type ApiError {
    code: Int
    message: String
  }

  type PaginatedResponse {
    items: [User]
    total: Int
    page: Int
    per_page: Int
  }
}
```

Both the server and client can use these types for parameter annotations, return types, and runtime validation.

## Validation Functions

One of the most important uses of the shared block is validation. By putting validation logic in `shared {}`, the same function runs on the client (for instant feedback) and the server (for security):

```tova
shared {
  fn validate_email(email: String) -> Bool {
    email.contains("@") and email.contains(".") and email.length() > 5
  }

  fn validate_password(password: String) -> Bool {
    password.length() >= 8
  }

  fn validate_username(name: String) -> Bool {
    name.length() >= 2 and name.length() <= 50
  }
}
```

The client can use these for form validation before the request is sent:

```tova
browser {
  fn handle_signup() {
    guard validate_email(email) else {
      error_message = "Please enter a valid email"
      return ()
    }
    guard validate_password(password) else {
      error_message = "Password must be at least 8 characters"
      return ()
    }

    result = server.signup(email, password)
  }
}
```

The server re-validates to guard against tampered requests:

```tova
server {
  fn signup(email: String, password: String) -> User {
    guard validate_email(email) else {
      return error("Invalid email")
    }
    guard validate_password(password) else {
      return error("Password too weak")
    }

    UserModel.create({ email, password: hash(password) })
  }
}
```

## Constants and Enums

Shared constants ensure that magic numbers and configuration values are consistent:

```tova
shared {
  MAX_USERNAME_LENGTH = 50
  MIN_PASSWORD_LENGTH = 8
  ALLOWED_ROLES = ["admin", "editor", "viewer"]

  type Role {
    Admin
    Editor
    Viewer
  }
}
```

Both client and server can reference `MAX_USERNAME_LENGTH` or pattern-match on `Role` variants.

## Pure Utility Functions

Any function that does not depend on server or client APIs belongs in shared:

```tova
shared {
  fn format_currency(amount: Float) -> String {
    "$" + amount.toFixed(2)
  }

  fn truncate(text: String, max_length: Int) -> String {
    if text.length() <= max_length {
      text
    } else {
      text.slice(0, max_length) + "..."
    }
  }

  fn capitalize(word: String) -> String {
    word.charAt(0).toUpperCase() + word.slice(1)
  }
}
```

## Compilation Output

The shared block compiles to its own JavaScript file. For a file named `app.tova`, the output is:

```
.tova-out/
  app.shared.js    <-- shared block output
  app.server.js    <-- imports app.shared.js
  app.client.js    <-- imports app.shared.js
```

The generated `app.shared.js` contains plain JavaScript functions and class definitions. Both `app.server.js` and `app.client.js` import from it, ensuring a single source of truth.

### Example Output

Given this Tova code:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
  }

  fn validate_email(email: String) -> Bool {
    email.contains("@")
  }
}
```

The compiler generates something like:

```javascript
// app.shared.js
function User(id, name, email) {
  return { id, name, email };
}

function validate_email(email) {
  return email.includes("@");
}
```

The server and client outputs both import these definitions so there is zero duplication.

## Multiple Shared Blocks

You can have multiple `shared` blocks in the same file. They are merged during compilation:

```tova
shared {
  type User { id: Int, name: String }
}

// ... other blocks ...

shared {
  type Post { id: Int, title: String, author_id: Int }
  fn validate_title(title: String) -> Bool {
    title.length() > 0 and title.length() <= 200
  }
}
```

Both types and the validation function end up in the same `app.shared.js` output.

## Best Practices

### Keep It Pure

Shared code should be **pure** -- no side effects, no database calls, no DOM access, no network requests. If it touches the database, it belongs in `server {}`. If it touches the DOM, it belongs in `browser {}`.

```tova
// Good: pure validation
shared {
  fn is_valid_age(age: Int) -> Bool {
    age >= 0 and age <= 150
  }
}

// Bad: side effects don't belong in shared
shared {
  fn log_event(event: String) {
    print(event)  // Side effect -- put in server or client
  }
}
```

### Define Complete Data Contracts

Put all your application types in shared so both sides always agree on data shapes:

```tova
shared {
  type CreateUserRequest {
    name: String
    email: String
    password: String
  }

  type CreateUserResponse {
    user: User
    token: String
  }

  type ApiError {
    code: Int
    message: String
    field: String
  }
}
```

### Pair Types With Validation

For each type, consider writing a validation function right next to it:

```tova
shared {
  type ContactForm {
    name: String
    email: String
    message: String
  }

  fn validate_contact_form(form: ContactForm) -> [String] {
    var errors = []
    if form.name.length() < 2 { errors = [...errors, "Name is too short"] }
    if not form.email.contains("@") { errors = [...errors, "Invalid email"] }
    if form.message.length() < 10 { errors = [...errors, "Message is too short"] }
    errors
  }
}
```

This way, the same validation runs client-side for instant UX feedback and server-side for security.

### Avoid Large Dependencies

Since shared code is included in the client bundle, keep it lightweight. Heavy computation or large data structures that only the server needs should go in `server {}` instead.

## Related Pages

- [Architecture Overview](./architecture) -- how the three-block model works
- [Server Block](./server-block) -- server-side routes, database, and functions
- [Browser Block](./browser-block) -- reactive UI and components
- [Compilation](./compilation) -- how shared code is compiled and bundled
