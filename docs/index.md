---
layout: home

hero:
  name: Tova
  text: A Modern Full-Stack Language
  tagline: Write frontend and backend in one file. Transpiles to JavaScript with zero runtime overhead.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: View on GitHub
      link: https://github.com/tovalang/tova

features:
  - title: Full-Stack in One File
    details: Write server routes, database queries, and reactive UI in a single .tova file. The compiler splits code automatically.
  - title: Automatic RPC
    details: Call server functions from the client as if they were local. Tova generates the HTTP bridge at compile time.
  - title: Fine-Grained Reactivity
    details: Signals-based UI with automatic dependency tracking. No virtual DOM — only the exact DOM nodes that need updating change.
  - title: Pattern Matching
    details: Exhaustive match expressions with destructuring, ranges, guards, and string patterns. The compiler warns on missing cases.
  - title: Batteries Included
    details: 60+ stdlib functions, Result/Option types, built-in test runner, formatter, REPL, LSP server, and VS Code extension.
  - title: Clean Syntax
    details: Python-like readability with Rust-like safety. No semicolons needed, implicit returns, and expressive type system.
---

<div style="max-width: 688px; margin: 2rem auto; padding: 0 24px;">

## Quick Taste

```tova
// A full-stack counter in one file

shared {
  type Action = Increment | Decrement | Reset
}

server {
  var count = 0

  route GET "/count" {
    respond({ count: count })
  }

  route POST "/update" {
    match body.action {
      Increment => count += 1
      Decrement => count -= 1
      Reset => count = 0
    }
    respond({ count: count })
  }
}

client {
  state count = 0

  fn update(action) {
    result = await fetch("/update", {
      method: "POST",
      body: { action: action }
    })
    count = result.count
  }

  component App() {
    <div>
      <h1>"Count: {count}"</h1>
      <button onClick={fn() update(Increment)}>"+"</button>
      <button onClick={fn() update(Decrement)}>"-"</button>
      <button onClick={fn() update(Reset)}>"Reset"</button>
    </div>
  }
}
```

</div>
