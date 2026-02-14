// AI Runtime for Tova — Multi-provider AI client
// Supports: anthropic, openai, ollama, custom (OpenAI-compatible)

// ── Provider Implementations ──────────────────────────

const providers = {
  async anthropic(config, method, args) {
    const baseUrl = config.base_url || 'https://api.anthropic.com';
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': '2023-06-01',
      ...(config.headers || {}),
    };

    switch (method) {
      case 'ask': {
        const [prompt, opts = {}] = args;
        const body = {
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || config.max_tokens || 4096,
          messages: [{ role: 'user', content: prompt }],
        };
        if (opts.temperature ?? config.temperature) body.temperature = opts.temperature ?? config.temperature;
        if (opts.tools) {
          body.tools = opts.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: { type: 'object', properties: t.params ? Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, { type: typeof v === 'string' ? v.toLowerCase() : 'string' }])) : {} },
          }));
        }
        const res = await fetch(`${baseUrl}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (opts.tools && data.content.some(c => c.type === 'tool_use')) {
          return { text: data.content.filter(c => c.type === 'text').map(c => c.text).join(''), tool_calls: data.content.filter(c => c.type === 'tool_use') };
        }
        return data.content.map(c => c.text).join('');
      }
      case 'chat': {
        const [messages, opts = {}] = args;
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        const body = {
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || config.max_tokens || 4096,
          messages: nonSystemMessages,
        };
        if (systemMessages.length > 0) body.system = systemMessages.map(m => m.content).join('\n');
        if (opts.temperature ?? config.temperature) body.temperature = opts.temperature ?? config.temperature;
        const res = await fetch(`${baseUrl}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.content.map(c => c.text).join('');
      }
      case 'embed': {
        // Anthropic doesn't have embeddings — fall through to openai-compatible
        throw new Error('Anthropic does not support embeddings. Use an OpenAI-compatible provider.');
      }
      case 'extract': {
        const [prompt, schema, opts = {}] = args;
        const body = {
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || config.max_tokens || 4096,
          messages: [{ role: 'user', content: `${prompt}\n\nRespond with a JSON object matching this schema: ${JSON.stringify(schema)}` }],
        };
        if (opts.temperature ?? config.temperature) body.temperature = opts.temperature ?? config.temperature;
        const res = await fetch(`${baseUrl}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = data.content.map(c => c.text).join('');
        try { return JSON.parse(text); } catch { return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}'); }
      }
      case 'classify': {
        const [text, categories, opts = {}] = args;
        const catList = Array.isArray(categories) ? categories : Object.keys(categories);
        const body = {
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || config.max_tokens || 100,
          messages: [{ role: 'user', content: `Classify the following text into exactly one of these categories: ${catList.join(', ')}\n\nText: "${text}"\n\nRespond with only the category name, nothing else.` }],
        };
        if (opts.temperature ?? config.temperature) body.temperature = opts.temperature ?? config.temperature;
        const res = await fetch(`${baseUrl}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const result = data.content.map(c => c.text).join('').trim();
        // Match against categories (case-insensitive)
        return catList.find(c => c.toLowerCase() === result.toLowerCase()) || result;
      }
      default:
        throw new Error(`Unknown AI method: ${method}`);
    }
  },

  async openai(config, method, args) {
    const baseUrl = config.base_url || 'https://api.openai.com';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key}`,
      ...(config.headers || {}),
    };

    switch (method) {
      case 'ask': {
        const [prompt, opts = {}] = args;
        const body = {
          model: config.model || 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
        };
        if (opts.max_tokens || config.max_tokens) body.max_tokens = opts.max_tokens || config.max_tokens;
        if (opts.temperature ?? config.temperature) body.temperature = opts.temperature ?? config.temperature;
        if (opts.tools) {
          body.tools = opts.tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: { type: 'object', properties: t.params ? Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, { type: typeof v === 'string' ? v.toLowerCase() : 'string' }])) : {} } },
          }));
        }
        const res = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const choice = data.choices[0];
        if (opts.tools && choice.message.tool_calls) {
          return { text: choice.message.content || '', tool_calls: choice.message.tool_calls };
        }
        return choice.message.content;
      }
      case 'chat': {
        const [messages, opts = {}] = args;
        const body = { model: config.model || 'gpt-4o', messages };
        if (opts.max_tokens || config.max_tokens) body.max_tokens = opts.max_tokens || config.max_tokens;
        if (opts.temperature ?? config.temperature) body.temperature = opts.temperature ?? config.temperature;
        const res = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.choices[0].message.content;
      }
      case 'embed': {
        const [input, opts = {}] = args;
        const body = { model: config.model || 'text-embedding-3-small', input };
        const res = await fetch(`${baseUrl}/v1/embeddings`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (Array.isArray(input)) return data.data.map(d => d.embedding);
        return data.data[0].embedding;
      }
      case 'extract': {
        const [prompt, schema, opts = {}] = args;
        const body = {
          model: config.model || 'gpt-4o',
          messages: [{ role: 'user', content: `${prompt}\n\nRespond with a JSON object matching this schema: ${JSON.stringify(schema)}` }],
          response_format: { type: 'json_object' },
        };
        if (opts.max_tokens || config.max_tokens) body.max_tokens = opts.max_tokens || config.max_tokens;
        const res = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return JSON.parse(data.choices[0].message.content);
      }
      case 'classify': {
        const [text, categories, opts = {}] = args;
        const catList = Array.isArray(categories) ? categories : Object.keys(categories);
        const body = {
          model: config.model || 'gpt-4o',
          messages: [{ role: 'user', content: `Classify into one of: ${catList.join(', ')}\n\nText: "${text}"\n\nRespond with only the category.` }],
        };
        if (opts.max_tokens || config.max_tokens) body.max_tokens = opts.max_tokens || config.max_tokens;
        const res = await fetch(`${baseUrl}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const result = data.choices[0].message.content.trim();
        return catList.find(c => c.toLowerCase() === result.toLowerCase()) || result;
      }
      default:
        throw new Error(`Unknown AI method: ${method}`);
    }
  },

  async ollama(config, method, args) {
    const baseUrl = config.base_url || 'http://localhost:11434';
    const headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };

    switch (method) {
      case 'ask': {
        const [prompt, opts = {}] = args;
        const body = { model: config.model || 'llama3', messages: [{ role: 'user', content: prompt }], stream: false };
        const res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.message.content;
      }
      case 'chat': {
        const [messages, opts = {}] = args;
        const body = { model: config.model || 'llama3', messages, stream: false };
        const res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.message.content;
      }
      case 'embed': {
        const [input, opts = {}] = args;
        const body = { model: config.model || 'llama3', prompt: Array.isArray(input) ? input[0] : input };
        const res = await fetch(`${baseUrl}/api/embeddings`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (Array.isArray(input)) {
          const results = [];
          for (const text of input) {
            const r = await fetch(`${baseUrl}/api/embeddings`, { method: 'POST', headers, body: JSON.stringify({ model: config.model || 'llama3', prompt: text }) });
            const d = await r.json();
            results.push(d.embedding);
          }
          return results;
        }
        return data.embedding;
      }
      case 'extract': {
        const [prompt, schema] = args;
        const body = { model: config.model || 'llama3', messages: [{ role: 'user', content: `${prompt}\nRespond with JSON: ${JSON.stringify(schema)}` }], stream: false, format: 'json' };
        const res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return JSON.parse(data.message.content);
      }
      case 'classify': {
        const [text, categories] = args;
        const catList = Array.isArray(categories) ? categories : Object.keys(categories);
        const body = { model: config.model || 'llama3', messages: [{ role: 'user', content: `Classify into one of: ${catList.join(', ')}\nText: "${text}"\nRespond with only the category.` }], stream: false };
        const res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const result = data.message.content.trim();
        return catList.find(c => c.toLowerCase() === result.toLowerCase()) || result;
      }
      default:
        throw new Error(`Unknown AI method: ${method}`);
    }
  },
};

// Custom provider uses OpenAI-compatible API format
providers.custom = providers.openai;

// ── AI Client Factory ─────────────────────────────────

export function createAI(config = {}) {
  const providerName = config.provider || 'custom';
  const providerFn = providers[providerName] || providers.custom;

  const client = {
    _config: config,
    _provider: providerFn,

    async ask(prompt, opts = {}) {
      const mergedConfig = { ...config, ...opts };
      return providerFn(mergedConfig, 'ask', [prompt, opts]);
    },

    async chat(messages, opts = {}) {
      const mergedConfig = { ...config, ...opts };
      return providerFn(mergedConfig, 'chat', [messages, opts]);
    },

    async embed(input, opts = {}) {
      const mergedConfig = { ...config, ...opts };
      return providerFn(mergedConfig, 'embed', [input, opts]);
    },

    async extract(prompt, schema, opts = {}) {
      const mergedConfig = { ...config, ...opts };
      return providerFn(mergedConfig, 'extract', [prompt, schema, opts]);
    },

    async classify(text, categories, opts = {}) {
      const mergedConfig = { ...config, ...opts };
      return providerFn(mergedConfig, 'classify', [text, categories, opts]);
    },
  };

  return client;
}

// ── Default AI object (for one-off calls) ─────────────

export const defaultAI = {
  async ask(prompt, opts = {}) {
    const client = createAI(opts);
    return client.ask(prompt, opts);
  },
  async chat(messages, opts = {}) {
    const client = createAI(opts);
    return client.chat(messages, opts);
  },
  async embed(input, opts = {}) {
    const client = createAI(opts);
    return client.embed(input, opts);
  },
  async extract(prompt, schema, opts = {}) {
    const client = createAI(opts);
    return client.extract(prompt, schema, opts);
  },
  async classify(text, categories, opts = {}) {
    const client = createAI(opts);
    return client.classify(text, categories, opts);
  },
};
