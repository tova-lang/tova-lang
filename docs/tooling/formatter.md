---
title: Formatter
---

# Formatter

The Tova formatter (`tova fmt`) automatically formats `.tova` source files for consistent code style across your project.

## Usage

Format one or more files:

```bash
tova fmt src/app.tova
tova fmt src/app.tova src/utils.tova src/models.tova
```

## Check Mode

Use `--check` to verify formatting without modifying files. This is useful in CI pipelines:

```bash
tova fmt src/app.tova --check
```

If the file is already formatted, you will see:

```
Already formatted: src/app.tova
```

If the file needs formatting, you will see:

```
Would reformat: src/app.tova
```

In check mode, the command exits with code 1 if any files need formatting, making it easy to integrate into CI:

```bash
# In CI pipeline
tova fmt src/*.tova --check || (echo "Run 'tova fmt' to fix formatting" && exit 1)
```

## What It Formats

The formatter parses the source file into an AST and re-prints it with consistent style. This normalizes:

- **Indentation** -- Consistent indentation levels using spaces
- **Spacing** -- Uniform spacing around operators, after commas, and around braces
- **Line breaks** -- Consistent placement of opening and closing braces
- **Trailing commas** -- Normalized comma placement in lists and parameters
- **Block structure** -- Consistent formatting of `shared`, `server`, and `browser` blocks

## Example

Before formatting:

```tova
server{
fn get_users( )  {
users=db.query("SELECT * FROM users")
    users |>map( fn(u) u.name )
}
  route GET "/api/users"=> get_users
}
```

After `tova fmt`:

```tova
server {
  fn get_users() {
    users = db.query("SELECT * FROM users")
    users |> map(fn(u) u.name)
  }

  route GET "/api/users" => get_users
}
```

## Editor Integration

When using the [VS Code extension](../editor/vscode.md), the formatter is available through the LSP as document formatting. You can format on save or on demand with the standard VS Code formatting shortcut (`Shift+Alt+F` on Windows/Linux, `Shift+Option+F` on macOS).
