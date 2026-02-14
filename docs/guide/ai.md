# AI Integration

Tova has built-in support for AI providers. Configure one or more AI backends with the `ai {}` block, then call methods like `ask()`, `chat()`, `embed()`, `extract()`, and `classify()` directly in your server code. No SDK imports, no boilerplate -- just declare a provider and start calling.

## Configuring a Provider

Add an `ai {}` block inside a `server` block to configure the default AI provider:

```tova
server {
  ai {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
  }

  answer = ai.ask("What is the capital of France?")
}
```

The default (unnamed) provider is accessed via the `ai` variable.

### Named Providers

Name your providers to use multiple AI backends in the same application:

```tova
server {
  ai "claude" {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
  }

  ai "gpt" {
    provider: "openai"
    model: "gpt-4o"
    api_key: env("OPENAI_API_KEY")
  }

  // Use by name
  answer = claude.ask("Explain quantum computing")
  summary = gpt.ask("Summarize this article: {text}")
}
```

### Open Configuration

The `ai {}` block is fully open. Every key-value pair is passed through to the provider client. Common properties have conventional meaning, but you can include any provider-specific configuration:

```tova
server {
  ai "fast" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
    temperature: 0.3
    max_tokens: 1024
  }

  ai "local" {
    provider: "ollama"
    model: "llama3"
    base_url: "http://localhost:11434"
  }

  ai "custom" {
    base_url: "https://my-company.com/v1"
    api_key: env("INTERNAL_API_KEY")
    model: "our-fine-tuned-model-v3"
    timeout: 60000
  }
}
```

## AI Methods

Every AI provider instance exposes five methods.

### `ask()` — Simple Prompt

Send a prompt, get a string response:

```tova
answer = ai.ask("What is the capital of France?")
// "The capital of France is Paris."

summary = claude.ask("Summarize: {article}")
```

### `chat()` — Multi-Turn Conversation

Pass a message history for multi-turn conversations:

```tova
response = ai.chat([
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello!" },
  { role: "assistant", content: "Hi! How can I help?" },
  { role: "user", content: "What's the weather like?" }
])
```

### `embed()` — Generate Embeddings

Generate vector embeddings for text, useful for semantic search and similarity:

```tova
// Single text
vec = ai.embed("some text")               // [Float]

// Batch
vecs = ai.embed(["text1", "text2"])        // [[Float]]

// In a pipeline
articles |> derive(.embedding = ai.embed(.content))
```

### `extract()` — Structured Output

Extract structured data from text using the type system. The compiler sends the type schema to the provider and returns a typed result:

```tova
type ProductInfo {
  name: String
  price: Float
  category: String
}

info: ProductInfo = ai.extract("Extract product info: {raw_text}")
```

### `classify()` — Classification

Classify text against categories. Use ADT variants or string arrays:

```tova
// With an ADT
type Sentiment { Positive, Negative, Neutral }
result: Sentiment = ai.classify("Great product!", Sentiment)

// With string categories
category = ai.classify("Fix login bug", ["feature", "bug", "docs"])
```

## Built-in Providers

| Provider | `provider` value | Description |
|----------|-----------------|-------------|
| Anthropic | `"anthropic"` | Claude models |
| OpenAI | `"openai"` | GPT models |
| Ollama | `"ollama"` | Local models via Ollama |
| Custom | (omit provider) | Any OpenAI-compatible API via `base_url` |

Custom providers use `base_url` with the standard OpenAI-compatible chat completions format, which most providers support.

## One-Off Calls

For quick scripts or one-time calls, you can skip the `ai {}` block entirely and pass configuration inline:

```tova
server {
  // No ai {} block needed
  answer = ai.ask("What is 2+2?",
    provider: "anthropic",
    model: "claude-haiku",
    api_key: env("ANTHROPIC_API_KEY")
  )

  // One-off embedding
  vec = ai.embed("hello world",
    provider: "openai",
    model: "text-embedding-3-small",
    api_key: env("OPENAI_API_KEY")
  )
}
```

## AI in Data Pipelines

AI methods work naturally with table operations and column expressions. Use a fast model for bulk processing and a more capable model for complex analysis:

```tova
server {
  ai "fast" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
  }

  ai "smart" {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
  }

  enriched = reviews
    |> derive(.sentiment = fast.classify(.text, Sentiment))
    |> derive(.summary = fast.ask("Summarize in 10 words: {.text}"))
    |> where(.sentiment == Negative)
    |> derive(.root_cause = smart.ask("Analyze root cause: {.text}"))
}
```

## Tool Use

Pass tool definitions to `ask()` for function calling:

```tova
server {
  ai { provider: "anthropic", model: "claude-sonnet-4-20250514", api_key: env("KEY") }

  tools = [
    {
      name: "get_weather",
      description: "Get current weather for a location",
      params: { location: String, unit: String }
    },
    {
      name: "search_db",
      description: "Search the database",
      params: { query: String }
    }
  ]

  response = ai.ask("What's the weather in Tokyo?", tools: tools)
  // response.tool_calls contains the tool invocations to handle
}
```

## Practical Tips

**Use named providers for different tasks.** A fast, cheap model for bulk classification and a capable model for nuanced analysis keeps costs down and latency low.

**Use `env()` for API keys.** Never hardcode API keys in source files. The `env()` function reads from environment variables at runtime:

```tova
ai {
  provider: "anthropic"
  api_key: env("ANTHROPIC_API_KEY")
  model: "claude-sonnet-4-20250514"
}
```

**Leverage `extract()` with types.** Instead of parsing unstructured AI output yourself, define a type and let `extract()` return structured data. The compiler sends the schema to the provider for reliable structured output.

**Start with one-off calls, then refactor.** During prototyping, use inline config with `ai.ask("...", provider: "...")`. When you settle on a configuration, promote it to an `ai {}` block.
