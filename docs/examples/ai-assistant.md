# AI Assistant

This example builds an AI-powered assistant with tool use, structured extraction, semantic search, and classification. It demonstrates multiple AI providers, server-side conversation history, and a full chat UI.

## The Full Application

```tova
shared {
  type Message {
    role: String
    content: String
    timestamp: String
  }

  type ContactInfo {
    name: String
    email: Option<String>
    phone: Option<String>
    company: Option<String>
  }

  type Ticket {
    subject: String
    priority: String
    category: String
    description: String
  }

  type Category { Bug, Feature, Question, Billing, Other }

  type Sentiment { Positive, Negative, Neutral }

  type SearchResult {
    content: String
    score: Float
    source: String
  }
}

server {
  // Primary AI provider
  ai "smart" {
    provider: "anthropic"
    model: "claude-sonnet"
    api_key: env("ANTHROPIC_API_KEY")
  }

  // Fast provider for bulk operations
  ai "fast" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
  }

  // Local fallback
  ai "local" {
    provider: "ollama"
    model: "llama3"
    url: "http://localhost:11434"
  }

  // --- Conversation Management ---

  var conversations = Map.new()

  fn chat_with_assistant(session_id: String, user_message: String) -> Message {
    history = conversations |> Map.get(session_id) |> unwrapOr([])

    new_msg = Message {
      role: "user",
      content: user_message,
      timestamp: Date.now()
    }
    messages = [...history, new_msg]

    response = smart.chat(messages, system: "You are a helpful assistant.")

    assistant_msg = Message {
      role: "assistant",
      content: response,
      timestamp: Date.now()
    }

    conversations = conversations
      |> Map.set(session_id, [...messages, assistant_msg])

    assistant_msg
  }

  fn get_history(session_id: String) -> [Message] {
    conversations |> Map.get(session_id) |> unwrapOr([])
  }

  fn clear_history(session_id: String) {
    conversations = conversations |> Map.delete(session_id)
  }

  // --- Simple Ask ---

  fn summarize(text: String) -> String {
    smart.ask("Summarize this in 2-3 sentences:\n\n{text}")
  }

  fn translate(text: String, target_lang: String) -> String {
    smart.ask("Translate to {target_lang}. Return only the translation:\n\n{text}")
  }

  // --- Tool Use ---

  fn assistant_with_tools(query: String) -> String {
    tools = [
      {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: {
          city: { "type": "string", description: "City name" }
        }
      },
      {
        name: "search_docs",
        description: "Search documentation for a topic",
        parameters: {
          query: { "type": "string", description: "Search query" }
        }
      },
      {
        name: "create_ticket",
        description: "Create a support ticket",
        parameters: {
          subject: { "type": "string" },
          priority: { "type": "string", enum: ["low", "medium", "high"] },
          description: { "type": "string" }
        }
      }
    ]

    response = smart.chat(
      [{ role: "user", content: query }],
      tools: tools
    )

    match response.tool_calls {
      [] => response.content
      calls => {
        results = calls |> map(fn(call) {
          result = match call.name {
            "get_weather" => get_weather(call.args.city)
            "search_docs" => search_docs(call.args.query)
            "create_ticket" => create_ticket(call.args)
            _ => "Unknown tool: {call.name}"
          }
          { tool_call_id: call.id, content: result }
        })

        // Send tool results back for final response
        smart.chat(
          [
            { role: "user", content: query },
            { role: "assistant", tool_calls: calls },
            ...results |> map(fn(r) { role: "tool", ...r })
          ]
        )
      }
    }
  }

  fn get_weather(city: String) -> String {
    "Weather in {city}: 72°F, partly cloudy"
  }

  fn search_docs(query: String) -> String {
    "Found 3 results for '{query}': Getting Started, API Reference, FAQ"
  }

  fn create_ticket(args) -> String {
    "Ticket created: {args.subject} (priority: {args.priority})"
  }

  // --- Structured Extraction ---

  fn extract_contact(text: String) -> ContactInfo {
    smart.extract(text, ContactInfo,
      prompt: "Extract contact information from this text"
    )
  }

  fn extract_ticket(text: String) -> Ticket {
    smart.extract(text, Ticket,
      prompt: "Extract support ticket details from this message"
    )
  }

  // --- Classification ---

  fn classify_message(text: String) -> Category {
    fast.classify(text, Category)
  }

  fn analyze_sentiment(text: String) -> Sentiment {
    fast.classify(text, Sentiment)
  }

  type ClassifiedMessage {
    text: String
    category: Category
    sentiment: Sentiment
  }

  fn classify_batch(messages: [String]) -> [ClassifiedMessage] {
    messages |> map(fn(msg) {
      {
        text: msg,
        category: fast.classify(msg, Category),
        sentiment: fast.classify(msg, Sentiment)
      }
    })
  }

  // --- Embeddings & Semantic Search ---

  var doc_embeddings = []

  type DocInput {
    content: String
    source: String
  }

  fn index_documents(docs: [DocInput]) {
    doc_embeddings = docs |> map(fn(doc) {
      {
        content: doc.content,
        source: doc.source,
        embedding: fast.embed(doc.content)
      }
    })
  }

  fn semantic_search(query: String, top_k: Int) -> [SearchResult] {
    query_embedding = fast.embed(query)

    doc_embeddings
      |> map(fn(doc) {
        score = cosine_similarity(query_embedding, doc.embedding)
        SearchResult { content: doc.content, score: score, source: doc.source }
      })
      |> sort_by(.score, desc: true)
      |> take(top_k)
  }

  fn cosine_similarity(a: [Float], b: [Float]) -> Float {
    dot = a |> zip(b) |> map(fn((x, y)) x * y) |> sum()
    mag_a = a |> map(fn(x) x * x) |> sum() |> Math.sqrt()
    mag_b = b |> map(fn(x) x * x) |> sum() |> Math.sqrt()
    dot / (mag_a * mag_b)
  }

  // --- Routes ---

  route POST "/api/chat" => chat_with_assistant
  route GET "/api/history/:session_id" => get_history
  route POST "/api/tools" => assistant_with_tools
  route POST "/api/extract/contact" => extract_contact
  route POST "/api/classify" => classify_message
  route POST "/api/search" => semantic_search
}

client {
  state messages: [Message] = []
  state input = ""
  state loading = false
  state session_id = "session-1"

  effect {
    history = server.get_history(session_id)
    messages = history
  }

  fn send_message() {
    guard input |> trim() |> len() > 0 else { return }

    user_msg = Message {
      role: "user",
      content: input,
      timestamp: Date.now()
    }
    messages = [...messages, user_msg]
    current_input = input
    input = ""
    loading = true

    response = server.chat_with_assistant(session_id, current_input)
    messages = [...messages, response]
    loading = false
  }

  fn clear_chat() {
    server.clear_history(session_id)
    messages = []
  }

  component MessageBubble(msg: Message) {
    <div class={match msg.role {
      "user" => "message user"
      "assistant" => "message assistant"
      _ => "message"
    }}>
      <div class="role">{msg.role}</div>
      <div class="content">{msg.content}</div>
      <div class="time">{msg.timestamp}</div>
    </div>
  }

  component ChatInput {
    <div class="chat-input">
      <input
        "type"="text"
        bind:value={input}
        placeholder="Type a message..."
        onkeydown={fn(e) {
          if e.key == "Enter" { send_message() }
        }}
      />
      <button onclick={fn() send_message()} disabled={loading}>
        {match loading { true => "Sending..." false => "Send" }}
      </button>
    </div>
  }

  component App {
    <div class="assistant">
      <header>
        <h1>"AI Assistant"</h1>
        <button onclick={fn() clear_chat()}>"Clear"</button>
      </header>

      <div class="messages">
        for msg in messages {
          <MessageBubble msg={msg} />
        }
        if loading {
          <div class="typing">"Thinking..."</div>
        }
      </div>

      <ChatInput />
    </div>
  }
}
```

## Running It

```bash
ANTHROPIC_API_KEY=your-key tova dev assistant.tova
```

## What This Demonstrates

### Multiple Named AI Providers

```tova
ai "smart" {
  provider: "anthropic"
  model: "claude-sonnet"
  api_key: env("ANTHROPIC_API_KEY")
}

ai "fast" {
  provider: "anthropic"
  model: "claude-haiku"
  api_key: env("ANTHROPIC_API_KEY")
}

ai "local" {
  provider: "ollama"
  model: "llama3"
  url: "http://localhost:11434"
}
```

Each provider is named and referenced as `smart.ask()`, `fast.classify()`, etc. Use expensive models for complex tasks and cheap/local models for bulk operations.

### ask() and chat()

`ask()` is a single prompt-response call. `chat()` takes a message array for multi-turn conversations:

```tova
smart.ask("Summarize this: ...")

smart.chat(messages, system: "You are a helpful assistant.")
```

Server-side `var conversations` maintains history per session. Each call appends user and assistant messages.

### Tool Use

Define tools as objects with name, description, and parameters. The AI decides when to call them:

```tova
response = smart.chat([...], tools: tools)

match response.tool_calls {
  [] => response.content          // No tools needed
  calls => {
    results = calls |> map(fn(call) execute_tool(call))
    smart.chat([..., ...results])  // Send results back
  }
}
```

The pattern is: send message with tools → check for tool_calls → execute tools → send results back for final response.

### extract() — Structured Output

`extract()` parses unstructured text into typed structs:

```tova
fn extract_contact(text: String) -> ContactInfo {
  smart.extract(text, ContactInfo,
    prompt: "Extract contact information from this text"
  )
}
```

The AI uses the `ContactInfo` type definition to produce structured output with the correct field names and types.

### classify() — ADT Classification

```tova
fn classify_message(text: String) -> Category {
  fast.classify(text, Category)
}
```

`classify()` maps text to an ADT variant. The AI sees the variant names and returns the best match. Works with any ADT — `Category`, `Sentiment`, etc.

### embed() — Semantic Search

```tova
embedding = fast.embed("Some text")                    // [Float] vector
score = cosine_similarity(query_embedding, doc_embedding)  // 0.0 to 1.0
```

`embed()` generates vector embeddings. Combined with `cosine_similarity`, this enables semantic search — finding documents by meaning rather than keyword matching.

### Conversation UI

The client maintains a message list, sends messages via RPC, and renders a chat interface. The `loading` state drives a typing indicator. `bind:value` provides two-way input binding.

## Key Patterns

**Fast model for bulk, smart model for depth.** Use `fast.classify()` for high-volume categorization and `smart.chat()` for nuanced conversation.

**Server-side history.** Store conversation state in server `var` so the client can reconnect and resume. The session ID allows multiple independent conversations.

**Tool use loop.** Send tools → check response → execute → send results. This pattern lets AI decide when to use tools and how to combine results.

**ADTs for classification.** Define categories as ADT variants and pass the type to `classify()`. The compiler ensures exhaustive handling of all categories.
