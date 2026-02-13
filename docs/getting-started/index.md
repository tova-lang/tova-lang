---
title: Installation
description: Install the Tova compiler and create your first project.
---

# Installation

Get up and running with Tova in under five minutes.

## Prerequisites

Tova uses [Bun](https://bun.sh/) as its runtime. If you do not have Bun installed, run:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify Bun is available:

```bash
bun --version
```

You need Bun 1.0 or later.

## Install the Tova Compiler

Clone the repository and link the `tova` command globally:

```bash
git clone https://github.com/tova-lang/tova-lang.git
cd tova-lang
bun install
bun link
```

This makes the `tova` command available system-wide. Verify the installation:

```bash
tova --version
```

You should see the current Tova version printed to the terminal.

## Create a New Project

Scaffold a new project with `tova new`:

```bash
tova new my-app
cd my-app
```

This generates a ready-to-run project with the following structure:

```
my-app/
├── src/
│   └── app.tova            # Main application file
├── package.json
└── README.md
```

The `src/app.tova` file is where you write your application. A single `.tova` file can contain `shared`, `server`, and `client` blocks -- the compiler splits them automatically.

## Run the Dev Server

Start the development server with hot reloading:

```bash
tova dev
```

Open your browser to the URL printed in the terminal. Every time you save a `.tova` file, the server recompiles and reloads automatically.

## Build for Production

When you are ready to deploy:

```bash
tova build --production
```

This compiles all `.tova` files to JavaScript, bundles assets, adds content hashes for cache-busting, and minifies the output. Compiled files go to `.tova-out/`.

## CLI Quick Reference

| Command | Description |
|---------|-------------|
| `tova new <name>` | Scaffold a new project |
| `tova dev [dir]` | Start development server with hot reload |
| `tova build [dir]` | Compile `.tova` files to JavaScript |
| `tova run <file>` | Compile and execute a single `.tova` file |
| `tova repl` | Start the interactive REPL |
| `tova test [dir]` | Run tests |
| `tova fmt [files]` | Format Tova source files |
| `tova lsp` | Start the Language Server Protocol server |
| `tova migrate:create <name>` | Create a new database migration |
| `tova migrate:up [file]` | Run pending migrations |
| `tova migrate:status [file]` | Show migration status |

For full details on every command and flag, see the [CLI Reference](/tooling/cli).

## Editor Support

Tova ships with a VS Code extension that provides syntax highlighting, autocompletion, go-to-definition, and inline diagnostics. See [Editor Support](/editor/vscode) for setup instructions.

## Next Steps

- [Hello World](/getting-started/hello-world) -- write and run your first Tova program
- [Tour of Tova](/getting-started/tour) -- a 10-minute walkthrough of every major feature
