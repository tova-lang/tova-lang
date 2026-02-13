---
title: Installation
description: Install the Lux compiler and create your first project.
---

# Installation

Get up and running with Lux in under five minutes.

## Prerequisites

Lux uses [Bun](https://bun.sh/) as its runtime. If you do not have Bun installed, run:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify Bun is available:

```bash
bun --version
```

You need Bun 1.0 or later.

## Install the Lux Compiler

Clone the repository and link the `lux` command globally:

```bash
git clone https://github.com/lux-lang/lux-lang.git
cd lux-lang
bun install
bun link
```

This makes the `lux` command available system-wide. Verify the installation:

```bash
lux --version
```

You should see the current Lux version printed to the terminal.

## Create a New Project

Scaffold a new project with `lux new`:

```bash
lux new my-app
cd my-app
```

This generates a ready-to-run project with the following structure:

```
my-app/
├── src/
│   └── app.lux            # Main application file
├── package.json
└── README.md
```

The `src/app.lux` file is where you write your application. A single `.lux` file can contain `shared`, `server`, and `client` blocks -- the compiler splits them automatically.

## Run the Dev Server

Start the development server with hot reloading:

```bash
lux dev
```

Open your browser to the URL printed in the terminal. Every time you save a `.lux` file, the server recompiles and reloads automatically.

## Build for Production

When you are ready to deploy:

```bash
lux build --production
```

This compiles all `.lux` files to JavaScript, bundles assets, adds content hashes for cache-busting, and minifies the output. Compiled files go to `.lux-out/`.

## CLI Quick Reference

| Command | Description |
|---------|-------------|
| `lux new <name>` | Scaffold a new project |
| `lux dev [dir]` | Start development server with hot reload |
| `lux build [dir]` | Compile `.lux` files to JavaScript |
| `lux run <file>` | Compile and execute a single `.lux` file |
| `lux repl` | Start the interactive REPL |
| `lux test [dir]` | Run tests |
| `lux fmt [files]` | Format Lux source files |
| `lux lsp` | Start the Language Server Protocol server |
| `lux migrate:create <name>` | Create a new database migration |
| `lux migrate:up [file]` | Run pending migrations |
| `lux migrate:status [file]` | Show migration status |

For full details on every command and flag, see the [CLI Reference](/tooling/cli).

## Editor Support

Lux ships with a VS Code extension that provides syntax highlighting, autocompletion, go-to-definition, and inline diagnostics. See [Editor Support](/editor/vscode) for setup instructions.

## Next Steps

- [Hello World](/getting-started/hello-world) -- write and run your first Lux program
- [Tour of Lux](/getting-started/tour) -- a 10-minute walkthrough of every major feature
