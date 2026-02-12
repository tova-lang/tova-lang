# Lux Language Documentation

**Lux** is a full-stack programming language that transpiles to JavaScript. It combines Python-inspired syntax with reactive UI primitives, seamless client-server communication, and pattern matching — all in a single file.

## Design Philosophy

- **Single-file full-stack**: Define shared types, server logic, and client UI in one `.lux` file
- **Zero-config RPC**: Call server functions from the client with `server.functionName()` — no API boilerplate
- **Reactive by default**: Signals, computed values, and effects power a fine-grained reactive UI system
- **Python-inspired syntax**: Clean, readable code with implicit returns, `elif`, `for...in`, list comprehensions, and pattern matching
- **Type-safe**: Optional type annotations with algebraic data types and generics
- **Batteries included**: Built-in ORM, auth, CORS, rate limiting, SSE, WebSocket, and more

## Hello World

```lux
name = "World"
print("Hello, {name}!")
```

## Full-Stack in One File

```lux
shared {
  type Todo {
    id: Int
    title: String
    completed: Bool
  }
}

server {
  var todos = []

  fn get_todos() -> [Todo] {
    todos
  }

  fn add_todo(title: String) -> Todo {
    todo = Todo(len(todos) + 1, title, false)
    todos = [...todos, todo]
    todo
  }
}

client {
  state todos: [Todo] = []

  effect {
    todos = server.get_todos()
  }

  component App {
    <div>
      <h1>My Todos</h1>
      <ul>
        for todo in todos {
          <li>{todo.title}</li>
        }
      </ul>
    </div>
  }
}
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Installation, first project, tutorial |
| [Language Reference](language-reference.md) | Complete syntax and semantics reference |
| [Full-Stack Architecture](full-stack-architecture.md) | The three-block model, RPC, named blocks |
| [Reactivity](reactivity.md) | Signals, effects, components, JSX, stores |
| [Server Reference](server-reference.md) | Routes, database, auth, middleware, SSE, WebSocket |
| [Standard Library](stdlib.md) | Built-in functions and methods |
| [CLI Reference](cli-reference.md) | Command-line interface |
| [Examples](examples.md) | Annotated real-world examples |
| [Grammar](grammar.md) | Formal EBNF grammar specification |

## Quick Links

- **New to Lux?** Start with [Getting Started](getting-started.md)
- **Need syntax help?** See the [Language Reference](language-reference.md)
- **Building a full-stack app?** Read [Full-Stack Architecture](full-stack-architecture.md)
- **Working with UI?** Check [Reactivity](reactivity.md)
- **Setting up a server?** See the [Server Reference](server-reference.md)
