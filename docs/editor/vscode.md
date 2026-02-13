---
title: VS Code Extension
---

# VS Code Extension

The Tova VS Code extension provides full language support for `.tova` files, including syntax highlighting, real-time diagnostics, code completion, and navigation.

## Installation

### From the Marketplace

Search for "Tova Language" in the VS Code Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`) and click Install.

### Local Installation

To install from the source repository:

```bash
# From the tova-lang repository root
cd editors/vscode
npm install
code --install-extension .
```

Or package it as a `.vsix` file:

```bash
cd editors/vscode
npx vsce package
code --install-extension tova-lang-0.1.0.vsix
```

## Features

### Syntax Highlighting

The extension uses a TextMate grammar (`syntaxes/tova.tmLanguage.json`) to provide syntax highlighting for all Tova constructs:

- Keywords (`fn`, `let`, `if`, `elif`, `else`, `match`, `for`, `while`, `return`, etc.)
- Block keywords (`shared`, `server`, `client`)
- Types and type annotations
- String literals with interpolation
- Comments
- Operators and punctuation
- JSX elements

### LSP Integration

The extension automatically starts the Tova Language Server when you open a `.tova` file. This provides:

- **Diagnostics** -- Real-time error and warning markers as you type. Syntax errors, type warnings, and unused variable warnings appear inline with squiggly underlines and in the Problems panel.

- **Completion** -- Context-aware suggestions for keywords, built-in functions (`print`, `len`, `range`, `sorted`, etc.), Result/Option constructors (`Ok`, `Err`, `Some`, `None`), and identifiers defined in the current file.

- **Go to Definition** -- `Ctrl+Click` or `F12` on any identifier to jump to its definition within the file.

- **Hover** -- Hover over any identifier to see type information and documentation. Built-in functions display their signature and description.

- **Signature Help** -- When typing a function call, a popup shows the function's parameter list and highlights the current parameter.

- **Document Formatting** -- Format the current file via `Shift+Alt+F` (Windows/Linux) or `Shift+Option+F` (macOS), or enable format-on-save in VS Code settings.

- **Rename** -- Rename symbols across the document with `F2`.

- **Find References** -- Find all references to a symbol with `Shift+F12`.

- **Workspace Symbols** -- Search for symbols across the workspace with `Ctrl+T`.

## File Association

The extension automatically associates `.tova` files with the Tova language. Files with the `.tova` extension will use Tova syntax highlighting and LSP features.

The language configuration (`language-configuration.json`) defines:

- Comment toggling (`//` for line comments)
- Bracket matching and auto-closing
- Auto-closing pairs for strings and brackets
- Indentation rules

## Configuration

The extension works with default settings out of the box. The LSP server is located relative to the extension at `src/lsp/server.js` and is started automatically using Bun.

### Requirements

- **Bun** must be installed and available on your PATH. The LSP server runs as a Bun process.
- **VS Code** 1.75.0 or later.

### Troubleshooting

If the language server fails to start:

1. Verify Bun is installed: `bun --version`
2. Check the Output panel in VS Code (select "Tova Language Server" from the dropdown)
3. Ensure the `tova-lang` package is properly installed

The LSP server includes crash recovery -- uncaught exceptions are logged rather than crashing the server process, so the extension should remain responsive even when processing files with errors.

## Architecture

The extension consists of:

| File | Purpose |
|------|---------|
| `package.json` | Extension manifest, language contribution points |
| `extension.js` | LSP client that spawns the Tova language server |
| `language-configuration.json` | Bracket matching, comment toggling, indentation |
| `syntaxes/tova.tmLanguage.json` | TextMate grammar for syntax highlighting |

The LSP client communicates with the server via stdio using the standard Language Server Protocol.
