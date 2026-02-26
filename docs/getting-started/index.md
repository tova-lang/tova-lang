---
title: Installation
description: Install the Tova compiler and create your first project.
---

# Installation

Get up and running with Tova in under five minutes.

## Install the Tova Compiler

### Option 1: Install Script (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/tova-lang/tova-lang/main/install.sh | sh
```

This downloads a prebuilt binary for your platform and adds it to your PATH. No dependencies required.

> **Note:** Some commands (`dev`, `test`) require [Bun](https://bun.sh). The standalone binary handles `run`, `build`, `new`, `repl`, `fmt`, and `lsp` without Bun.

### Option 2: npm (requires Bun)

```bash
bun install -g tova
```

### Option 3: Download Binary

Download the latest binary for your platform from the [GitHub Releases](https://github.com/tova-lang/tova-lang/releases) page. Place it somewhere on your PATH and make it executable:

```bash
chmod +x tova-<platform>
mv tova-<platform> /usr/local/bin/tova
```

### Verify Installation

```bash
tova --version
```

You should see the current Tova version printed to the terminal.

## Prerequisites for Full Functionality

Tova uses [Bun](https://bun.sh/) as its runtime for the dev server and test runner. If you need these features, install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

You need Bun 1.0 or later.

### Check Your Setup

Run `tova doctor` to verify your environment is configured correctly:

```bash
tova doctor
```

This checks Tova, Bun, PATH configuration, git, and your shell profile.

## Create a New Project

Scaffold a new project with `tova new`:

```bash
tova new my-app
cd my-app
```

You'll be prompted to choose a template (full-stack app, API server, script, library, or blank). You can also specify one directly:

```bash
tova new my-api --template api
tova new my-script --template script
```

## Run a Script

You do not need a project to use Tova. Create any `.tova` file and run it directly:

```bash
echo 'print("Hello from Tova!")' > hello.tova
tova run hello.tova
```

This is the simplest way to get started -- a single file, no project scaffold, no configuration. Perfect for scripts, utilities, and quick experiments.

## Project Structure

`tova new` generates a ready-to-run project. The exact filename depends on the template you choose (`app.tova` for full-stack and API templates, `main.tova` for scripts):

```
my-app/
├── src/
│   └── app.tova            # Main application file (or main.tova for scripts)
├── tova.toml               # Project manifest
├── .gitignore
└── README.md
```

The `tova.toml` file is the project manifest where you configure your project name, build settings, and npm dependencies. The source file in `src/` is where you write your application. You can write plain Tova scripts here, or use `shared`, `server`, and `browser` blocks for full-stack web applications -- the compiler splits them automatically.

## Install Dependencies

If your project uses npm packages, install them with:

```bash
tova install
```

This reads `tova.toml`, generates a shadow `package.json`, and runs `bun install`. You can also add packages directly:

```bash
tova add htmx
tova add prettier --dev
```

## Run the Dev Server (Web Projects)

If your project uses `server` and `browser` blocks, start the development server with hot reloading:

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
| `tova new <name>` | Scaffold a new project (with template picker) |
| `tova install` | Install npm dependencies from `tova.toml` |
| `tova add <pkg>` | Add an npm dependency (`--dev` for dev) |
| `tova remove <pkg>` | Remove an npm dependency |
| `tova dev [dir]` | Start development server with hot reload |
| `tova build [dir]` | Compile `.tova` files to JavaScript |
| `tova run <file>` | Compile and execute a single `.tova` file |
| `tova repl` | Start the interactive REPL |
| `tova test [dir]` | Run tests |
| `tova fmt [files]` | Format Tova source files |
| `tova lsp` | Start the Language Server Protocol server |
| `tova doctor` | Check your development environment |
| `tova completions <sh>` | Generate shell completions (bash, zsh, fish) |
| `tova upgrade` | Upgrade Tova to latest version |
| `tova migrate:create <name>` | Create a new database migration |
| `tova migrate:up [file]` | Run pending migrations |
| `tova migrate:status [file]` | Show migration status |

For full details on every command and flag, see the [CLI Reference](/tooling/cli).

## Editor Support

Tova ships with a VS Code extension that provides syntax highlighting, autocompletion, go-to-definition, and inline diagnostics. See [Editor Support](/editor/vscode) for setup instructions.

## Next Steps

- [Hello World](/getting-started/hello-world) -- write and run your first Tova program
- [Tour of Tova](/getting-started/tour) -- a 10-minute walkthrough of every major feature
