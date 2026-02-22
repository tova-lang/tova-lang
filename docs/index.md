---
layout: home

hero:
  name: Tova
  text: A Modern Programming Language
  tagline: Clean syntax, powerful types, and batteries included. Write scripts, CLI tools, data pipelines, AI apps, and full-stack web — all in one language.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: View on GitHub
      link: https://github.com/tovalang/tova

features:
  - title: Clean, Expressive Syntax
    details: Readable, concise, and safe by default. Pipe operators, pattern matching, implicit returns, and no semicolons needed.
  - title: Batteries Included
    details: 60+ stdlib functions, Result/Option types, Tables/DataFrames, file I/O, built-in test runner, REPL, LSP server, and VS Code extension.
  - title: AI Built In
    details: Multi-provider AI support (Anthropic, OpenAI, Ollama). ask, chat, embed, extract, and classify — all as language-level operations.
  - title: Pattern Matching & Types
    details: Algebraic data types, generics, interfaces, and exhaustive match with destructuring, ranges, guards, and string patterns.
  - title: Scripting & Data
    details: CSV/JSON/JSONL/TSV I/O, file system ops, shell execution, and Tables for data pipelines. Great for scripts and CLI tools.
  - title: Full-Stack Web
    details: Server + client in one file, automatic RPC, fine-grained reactivity, JSX components, and zero-config dev server.
---

<div style="max-width: 688px; margin: 2rem auto; padding: 0 24px;">

## Quick Taste

### Script

```tova
// Read a CSV file, transform it, and write the result
data = read("sales.csv")
  |> filter(fn(row) row.revenue > 1000)
  |> sort_by(.region)
  |> group_by(.region, fn(rows) {
    { total: sum_by(rows, .revenue), count: len(rows) }
  })

write(data, "summary.json")
print("Wrote {len(data)} regions")
```

### CLI Tool

```tova
// A command-line tool with pattern-matched subcommands
match args() {
  ["add", name]       => add_task(name)
  ["done", id]        => complete_task(to_int(id))
  ["list"]            => list_tasks() |> each(fn(t) print(t))
  ["list", "--done"]  => list_tasks() |> filter(.done) |> each(fn(t) print(t))
  _                   => print("Usage: tasks <add|done|list>")
}
```

### Full-Stack Web

```tova
shared {
  type Todo { id: Int, text: String, done: Bool }
}

server {
  var todos = []
  fn all_todos() -> [Todo] { todos }
  fn add_todo(text: String) -> Todo {
    t = Todo(len(todos) + 1, text, false)
    todos = [...todos, t]
    t
  }
}

client {
  state todos = []
  state draft = ""

  effect { todos = server.all_todos() }

  component App() {
    <div>
      <input value={draft} on:input={fn(e) draft = e.target.value} />
      <button on:click={fn() { server.add_todo(draft); draft = ""; todos = server.all_todos() }}>"Add"</button>
      <ul>for t in todos { <li>"{t.text}"</li> }</ul>
    </div>
  }
}
```

</div>
