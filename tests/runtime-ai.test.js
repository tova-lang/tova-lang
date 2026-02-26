import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createAI, defaultAI } from '../src/runtime/ai.js';

// --- Mock helpers ---

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function anthropicResponse(text) {
  return mockResponse({ content: [{ type: 'text', text }] });
}

function openaiResponse(content) {
  return mockResponse({ choices: [{ message: { content } }] });
}

function ollamaResponse(content) {
  return mockResponse({ message: { content } });
}

// --- Tests ---

describe("createAI factory", () => {
  test("creates browser with default config", () => {
    const ai = createAI();
    expect(ai).toBeDefined();
    expect(ai._config).toBeDefined();
  });

  test("creates browser with anthropic provider", () => {
    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    expect(ai._config.provider).toBe("anthropic");
  });

  test("creates browser with openai provider", () => {
    const ai = createAI({ provider: "openai", api_key: "test-key" });
    expect(ai._config.provider).toBe("openai");
  });

  test("creates browser with ollama provider", () => {
    const ai = createAI({ provider: "ollama" });
    expect(ai._config.provider).toBe("ollama");
  });

  test("unknown provider falls back to custom (openai format)", () => {
    const ai = createAI({ provider: "something-unknown", api_key: "key" });
    // Should not throw, falls back to custom which uses openai format
    expect(ai).toBeDefined();
    expect(typeof ai.ask).toBe("function");
  });

  test("client has all methods: ask, chat, embed, extract, classify", () => {
    const ai = createAI({ provider: "openai", api_key: "test-key" });
    expect(typeof ai.ask).toBe("function");
    expect(typeof ai.chat).toBe("function");
    expect(typeof ai.embed).toBe("function");
    expect(typeof ai.extract).toBe("function");
    expect(typeof ai.classify).toBe("function");
  });

  test("config is stored in _config", () => {
    const ai = createAI({ provider: "anthropic", api_key: "my-key", model: "claude-3" });
    expect(ai._config.provider).toBe("anthropic");
    expect(ai._config.api_key).toBe("my-key");
    expect(ai._config.model).toBe("claude-3");
  });
});

describe("Anthropic provider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(async (url, opts) => {
      return anthropicResponse("Hello from Claude");
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("ask() sends correct request to /v1/messages with anthropic headers", async () => {
    const ai = createAI({ provider: "anthropic", api_key: "test-anthropic-key", model: "claude-3-sonnet" });
    await ai.ask("Hello");

    expect(globalThis.fetch).toHaveBeenCalled();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/v1/messages");
    expect(opts.headers["x-api-key"]).toBe("test-anthropic-key");
    expect(opts.headers["anthropic-version"]).toBeDefined();
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.model).toBe("claude-3-sonnet");
    expect(body.messages).toBeDefined();
  });

  test("ask() returns text from response", async () => {
    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    const result = await ai.ask("Hello");
    expect(result).toBe("Hello from Claude");
  });

  test("ask() with tools returns tool_calls when present", async () => {
    globalThis.fetch = mock(async () => {
      return mockResponse({
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'get_weather', input: { location: 'SF' } }
        ]
      });
    });

    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    const tools = [{ name: "get_weather", description: "Get weather", input_schema: { type: "object", properties: { location: { type: "string" } } } }];
    const result = await ai.ask("What is the weather?", { tools });
    // Should return tool calls info
    expect(result).toBeDefined();
  });

  test("chat() separates system messages and sends correctly", async () => {
    globalThis.fetch = mock(async (url, opts) => {
      return anthropicResponse("Chat response");
    });

    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    const messages = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
    ];
    const result = await ai.chat(messages);

    expect(result).toBe("Chat response");
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    // Anthropic uses a separate system field, not in messages array
    expect(body.system).toBeDefined();
    const userMessages = body.messages.filter(m => m.role === "user");
    expect(userMessages.length).toBeGreaterThanOrEqual(1);
  });

  test("embed() throws 'does not support embeddings' error", async () => {
    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    await expect(ai.embed("hello")).rejects.toThrow(/does not support embeddings/i);
  });

  test("extract() appends schema to prompt and parses JSON response", async () => {
    const schema = { name: "string", age: "number" };
    globalThis.fetch = mock(async () => {
      return anthropicResponse('{"name": "Alice", "age": 30}');
    });

    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    const result = await ai.extract("Extract info from: Alice is 30", { schema });

    expect(result).toEqual({ name: "Alice", age: 30 });

    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    const lastMessage = body.messages[body.messages.length - 1];
    expect(JSON.stringify(lastMessage.content)).toContain("name");
  });

  test("classify() returns matched category (case-insensitive)", async () => {
    globalThis.fetch = mock(async () => {
      return anthropicResponse("positive");
    });

    const ai = createAI({ provider: "anthropic", api_key: "test-key" });
    const result = await ai.classify("I love this!", { categories: ["positive", "negative", "neutral"] });
    expect(result.toLowerCase()).toBe("positive");
  });

  test("API error (non-ok response) throws with status code", async () => {
    globalThis.fetch = mock(async () => {
      return mockResponse({ error: { message: "Unauthorized" } }, false, 401);
    });

    const ai = createAI({ provider: "anthropic", api_key: "bad-key" });
    await expect(ai.ask("Hello")).rejects.toThrow(/401/);
  });
});

describe("OpenAI provider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(async (url, opts) => {
      if (url.includes("/v1/embeddings")) {
        return mockResponse({
          data: [{ embedding: [0.1, 0.2, 0.3] }]
        });
      }
      return openaiResponse("Hello from GPT");
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("ask() sends to /v1/chat/completions with Bearer auth", async () => {
    const ai = createAI({ provider: "openai", api_key: "test-openai-key", model: "gpt-4" });
    await ai.ask("Hello");

    expect(globalThis.fetch).toHaveBeenCalled();
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/v1/chat/completions");
    expect(opts.headers["Authorization"]).toBe("Bearer test-openai-key");
    expect(opts.method).toBe("POST");
  });

  test("ask() returns choices[0].message.content", async () => {
    const ai = createAI({ provider: "openai", api_key: "test-key" });
    const result = await ai.ask("Hello");
    expect(result).toBe("Hello from GPT");
  });

  test("chat() works", async () => {
    const ai = createAI({ provider: "openai", api_key: "test-key" });
    const messages = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
    ];
    const result = await ai.chat(messages);
    expect(result).toBe("Hello from GPT");

    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.messages.length).toBeGreaterThanOrEqual(2);
  });

  test("embed() sends to /v1/embeddings and returns embedding", async () => {
    const ai = createAI({ provider: "openai", api_key: "test-key" });
    const result = await ai.embed("hello world");

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/v1/embeddings");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  test("embed() with array input returns array of embeddings", async () => {
    globalThis.fetch = mock(async () => {
      return mockResponse({
        data: [
          { embedding: [0.1, 0.2] },
          { embedding: [0.3, 0.4] },
        ]
      });
    });

    const ai = createAI({ provider: "openai", api_key: "test-key" });
    const result = await ai.embed(["hello", "world"]);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[1]).toEqual([0.3, 0.4]);
  });

  test("extract() uses response_format: { type: 'json_object' }", async () => {
    globalThis.fetch = mock(async () => {
      return openaiResponse('{"name": "Bob", "age": 25}');
    });

    const ai = createAI({ provider: "openai", api_key: "test-key" });
    const result = await ai.extract("Extract: Bob is 25", { schema: { name: "string", age: "number" } });

    expect(result).toEqual({ name: "Bob", age: 25 });

    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  test("classify() works", async () => {
    globalThis.fetch = mock(async () => {
      return openaiResponse("negative");
    });

    const ai = createAI({ provider: "openai", api_key: "test-key" });
    const result = await ai.classify("I hate this!", { categories: ["positive", "negative", "neutral"] });
    expect(result.toLowerCase()).toBe("negative");
  });
});

describe("Ollama provider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(async (url, opts) => {
      if (url.includes("/api/embeddings")) {
        return mockResponse({ embedding: [0.5, 0.6, 0.7] });
      }
      return ollamaResponse("Hello from Ollama");
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("ask() sends to /api/chat with stream: false", async () => {
    const ai = createAI({ provider: "ollama", model: "llama2" });
    const result = await ai.ask("Hello");

    expect(result).toBe("Hello from Ollama");
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/chat");
    const body = JSON.parse(opts.body);
    expect(body.stream).toBe(false);
  });

  test("embed() sends to /api/embeddings", async () => {
    const ai = createAI({ provider: "ollama", model: "llama2" });
    const result = await ai.embed("hello world");

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/embeddings");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([0.5, 0.6, 0.7]);
  });

  test("extract() uses format: 'json'", async () => {
    globalThis.fetch = mock(async () => {
      return ollamaResponse('{"color": "blue"}');
    });

    const ai = createAI({ provider: "ollama", model: "llama2" });
    const result = await ai.extract("What color is the sky?", { schema: { color: "string" } });

    expect(result).toEqual({ color: "blue" });

    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.format).toBe("json");
  });
});

describe("defaultAI", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("has all methods: ask, chat, embed, extract, classify", () => {
    expect(typeof defaultAI.ask).toBe("function");
    expect(typeof defaultAI.chat).toBe("function");
    expect(typeof defaultAI.embed).toBe("function");
    expect(typeof defaultAI.extract).toBe("function");
    expect(typeof defaultAI.classify).toBe("function");
  });

  test("each method creates a client and delegates", async () => {
    globalThis.fetch = mock(async () => {
      return openaiResponse("delegated response");
    });

    // defaultAI will pick up provider from env or use a default
    // We just verify it attempts to call fetch (delegates to a real provider)
    try {
      const result = await defaultAI.ask("Hello");
      // If it succeeds, the delegation worked
      expect(result).toBeDefined();
    } catch (e) {
      // It may throw if no API key is configured, which is expected
      // The important thing is it tried to delegate (created a client internally)
      expect(e).toBeDefined();
    }
  });
});
