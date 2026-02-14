---
title: LSP Server
---

# LSP Server

Tova includes a built-in Language Server Protocol (LSP) server that provides rich editor support. The server communicates via JSON-RPC over stdio and works with any LSP-compatible editor.

## Starting the Server

The LSP server is typically started by your editor automatically. You can also start it manually:

```bash
tova lsp
```

Or directly:

```bash
bun run src/lsp/server.js
```

## Capabilities

### Diagnostics

The server analyzes `.tova` files on every change and reports errors and warnings in real time. The LSP always runs with strict type checking enabled, so you see the full range of type issues as you edit.

- **Syntax errors** -- Invalid tokens, unexpected characters, malformed expressions
- **Parse errors** -- Missing braces, incorrect block structure, invalid patterns
- **Type errors** -- Type mismatches in assignments, operators, and function calls
- **Exhaustive match warnings** -- Uncovered Result/Option/custom type variants
- **Trait conformance** -- Missing methods in `impl` blocks
- **Unused variables** -- Shown as faded/dimmed text (hint severity)
- **Variable shadowing** -- Informational diagnostics for shadowed bindings

Diagnostics are categorized by severity:

| Finding | Severity |
|---------|----------|
| Parse errors | Error |
| Type mismatches | Error |
| Non-exhaustive match | Warning |
| Variable shadowing | Information |
| Unused variables | Hint (with "unnecessary" tag) |

Diagnostics use Tova's rich error message system with precise source locations. The server supports parser error recovery, providing diagnostics for multiple errors in a single file rather than stopping at the first one.

### Completion

Triggered by typing or by pressing `Ctrl+Space`, completion is context-aware and provides different suggestions depending on what you're typing:

#### Dot completion

Type a variable name followed by `.` to see its fields and methods:

```tova
type User {
  Create(name: String, age: Int)
}

impl User {
  fn greet(self) -> String { "Hi, {self.name}" }
}

u = Create("Alice", 30)
u.   // suggests: name (field), age (field), greet (method)
```

Fields are listed first, followed by methods from `impl` blocks.

#### Type annotation completion

After a `:` in a type position, the server suggests type names:

```tova
fn process(input:   // suggests: Int, Float, String, Bool, Result, Option, and user-defined types
```

#### Match variant completion

Inside a `match` block, the server suggests the variants of the matched type:

```tova
match shape {
  // suggests: Circle, Rectangle, Triangle (variants of Shape)
}
```

#### General completion

In all other contexts, completion provides:

- **Keywords** -- `fn`, `let`, `if`, `elif`, `else`, `for`, `while`, `match`, `type`, `import`, `server`, `client`, `shared`, `pub`, `mut`, `async`, `await`, `guard`, `interface`, `derive`, `route`, `model`, `db`, and more
- **Built-in functions** -- `print`, `len`, `range`, `enumerate`, `sum`, `sorted`, `reversed`, `zip`, `min`, `max`, `type_of`, `filter`, `map`
- **Result/Option constructors** -- `Ok`, `Err`, `Some`, `None`
- **User-defined symbols** -- Functions, types, and variables defined in the current file

Trigger characters: `.`, `"`, `'`, `/`, `<`, `:`

Results are limited to 50 items for performance.

### Go to Definition

Jump to the definition of any identifier in the current file. The server looks up symbols in the analyzer's scope chain, resolving through nested scopes to find the original declaration.

Supported for:
- Function definitions
- Variable bindings
- Type declarations
- Function parameters

### Hover

Hover over any identifier to see information about it:

- **Built-in functions** show their signature and a brief description:
  ```
  fn len(value) -- Get length of string, array, or object
  ```

- **Variables** show their inferred type:
  ```
  count (variable) — Type: Int
  ```

- **Functions** show their full signature with parameter types and return type:
  ```
  fn add(a: Int, b: Int) -> Int
  ```

- **Type declarations** show their full structure with variants and fields:
  ```tova
  type Shape {
    Circle(radius: Float)
    Rectangle(width: Float, height: Float)
  }
  ```

### Signature Help

When typing inside a function call's parentheses, a popup displays the function signature with the current parameter highlighted.

Trigger characters: `(`, `,`

Built-in functions include full parameter documentation. User-defined functions show parameter names extracted from their definition.

### Document Formatting

Format the entire document using the Tova formatter. This is the same formatter available via `tova fmt` on the command line.

### Rename

Rename a symbol across the document. The server finds all references to the symbol and returns the appropriate text edits.

### Find References

Find all locations where a symbol is used within the current document.

### Workspace Symbols

Search for symbols (functions, types, variables) across all open documents in the workspace.

## Protocol Details

| Property | Value |
|----------|-------|
| Transport | stdio (JSON-RPC) |
| Text sync | Full document sync (change mode 1) |
| Encoding | UTF-8 |

The server handles the standard LSP lifecycle:

1. `initialize` -- Server reports capabilities
2. `initialized` -- Client confirms
3. `textDocument/didOpen` -- Document opened, initial validation
4. `textDocument/didChange` -- Document changed, re-validation
5. `textDocument/didSave` -- Document saved, re-validation
6. `shutdown` / `exit` -- Graceful termination

## Multi-Editor Support

The LSP server works with any editor that supports the Language Server Protocol:

### VS Code

See the [VS Code Extension](./vscode.md) page -- the extension handles starting and connecting to the LSP server automatically.

### Neovim

Using [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig):

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

configs.tova = {
  default_config = {
    cmd = { 'bun', 'run', '/path/to/tova-lang/src/lsp/server.js' },
    filetypes = { 'tova' },
    root_dir = lspconfig.util.root_pattern('package.json', '.git'),
  },
}

lspconfig.tova.setup({})
```

Add a file type detection autocmd:

```lua
vim.filetype.add({
  extension = {
    tova = 'tova',
  },
})
```

### Emacs

Using [lsp-mode](https://github.com/emacs-lsp/lsp-mode):

```elisp
(with-eval-after-load 'lsp-mode
  (add-to-list 'lsp-language-id-configuration '(tova-mode . "tova"))
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection '("bun" "run" "/path/to/tova-lang/src/lsp/server.js"))
    :major-modes '(tova-mode)
    :server-id 'tova-ls)))
```

### Helix

In `languages.toml`:

```toml
[[language]]
name = "tova"
scope = "source.tova"
file-types = ["tova"]
language-servers = ["tova-ls"]

[language-server.tova-ls]
command = "bun"
args = ["run", "/path/to/tova-lang/src/lsp/server.js"]
```

## Error Recovery

The LSP server is designed for resilience:

- **Parser error recovery** -- When a file has syntax errors, the server uses the partial AST to still provide completions, hover, and go-to-definition for the valid portions of the file.
- **Crash recovery** -- Uncaught exceptions and unhandled promise rejections are caught and logged rather than crashing the server process.
- **Cache management** -- The server caches up to 100 document analyses with LRU eviction, preferring to keep open documents in cache.
