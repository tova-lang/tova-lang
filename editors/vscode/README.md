# Tova Language for Visual Studio Code

Full-stack language support for [Tova](https://github.com/tova-lang/tova-lang) — a modern language that transpiles to JavaScript.

## Features

- **Syntax Highlighting** — TextMate grammar with support for all Tova syntax including JSX, match expressions, pipes, and more
- **Language Server** — Real-time diagnostics, completions, hover docs, go-to-definition, and signature help
- **Code Actions** — Quick fixes for unused variables, undefined identifiers, and type mismatches
- **20+ Snippets** — Common patterns: `fn`, `match`, `for`, `comp`, `state`, `effect`, `route`, `type`, `pipe`, and more
- **Format on Save** — Integrated with `tova fmt` for consistent code style
- **Debug Support** — Compile .tova to JS with source maps and debug via Node.js
- **Tova Dark Theme** — Catppuccin Mocha-inspired color theme optimized for Tova
- **File Icon** — Custom `.tova` file icon

## Requirements

- [Bun](https://bun.sh) runtime installed
- Tova language toolchain (`npm install -g tova-lang` or clone the repo)

## Quick Start

1. Install this extension
2. Open a `.tova` file
3. The language server starts automatically

## Configuration

The extension works out of the box. Format on save is enabled by default for `.tova` files.

## Snippets

| Prefix | Description |
|--------|-------------|
| `fn` | Function declaration |
| `afn` | Async function |
| `match` | Match expression |
| `for` | For loop |
| `comp` | Component |
| `state` | State declaration |
| `effect` | Effect block |
| `route` | Route handler |
| `type` | Type declaration |
| `pipe` | Pipe expression |
| `if` / `ife` | If / If-else |
| `guard` | Guard clause |
| `server` | Server block |
| `import` | Import statement |
| `test` | Test block |
| `while` | While loop |
| `mut` | Mutable variable |
| `try` | Try-catch |

## Debugging

1. Open a `.tova` file
2. Press F5 or open the Run and Debug panel
3. Select "Tova Debug" configuration
4. The file is compiled to JS with source maps, then launched under the Node.js debugger

## Extension Commands

This extension contributes the following commands via the LSP:

- Diagnostics (errors and warnings)
- Completions with parameter info
- Hover documentation for 150+ stdlib functions
- Go to definition
- Signature help
- Code actions (quick fixes)

## Theme

The "Tova Dark" theme uses the Catppuccin Mocha color palette, optimized for Tova syntax elements:

- Keywords in mauve (`#cba6f7`)
- Functions in blue (`#89b4fa`)
- Types in yellow (`#f9e2af`)
- Strings in green (`#a6e3a1`)
- Numbers in peach (`#fab387`)

Activate it: Preferences > Color Theme > Tova Dark

## Building from Source

```bash
cd editors/vscode
node build.js          # Bundle extension + LSP server
npx vsce package       # Create .vsix file
```

## License

MIT
