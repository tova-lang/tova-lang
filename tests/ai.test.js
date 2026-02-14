import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova');
  return gen.generate();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, 'test.tova', { tolerant: true });
  return analyzer.analyze();
}

describe('AI config parsing', () => {
  test('default ai block', () => {
    const ast = parse(`server {
      ai {
        provider: "anthropic"
        model: "claude-sonnet-4-20250514"
        api_key: "test-key"
      }
    }`);
    const server = ast.body[0];
    const aiConfig = server.body[0];
    expect(aiConfig.type).toBe('AiConfigDeclaration');
    expect(aiConfig.name).toBeNull();
    expect(aiConfig.config.provider.value).toBe('anthropic');
    expect(aiConfig.config.model.value).toBe('claude-sonnet-4-20250514');
  });

  test('named ai block', () => {
    const ast = parse(`server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "test"
      }
    }`);
    const server = ast.body[0];
    const aiConfig = server.body[0];
    expect(aiConfig.type).toBe('AiConfigDeclaration');
    expect(aiConfig.name).toBe('claude');
  });

  test('multiple named providers', () => {
    const ast = parse(`server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "key1"
      }
      ai "gpt" {
        provider: "openai"
        model: "gpt-4o"
        api_key: "key2"
      }
    }`);
    const server = ast.body[0];
    expect(server.body[0].type).toBe('AiConfigDeclaration');
    expect(server.body[0].name).toBe('claude');
    expect(server.body[1].type).toBe('AiConfigDeclaration');
    expect(server.body[1].name).toBe('gpt');
  });
});

describe('AI codegen', () => {
  test('default ai block generates __createAI', () => {
    const result = compile(`server {
      ai {
        provider: "anthropic"
        model: "claude-sonnet-4-20250514"
        api_key: "test-key"
      }
    }`);
    expect(result.server).toContain('__createAI');
    expect(result.server).toContain('const ai = __createAI');
    expect(result.server).toContain('"anthropic"');
  });

  test('named ai block generates named const', () => {
    const result = compile(`server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "test-key"
      }
    }`);
    expect(result.server).toContain('const claude = __createAI');
  });

  test('AI runtime includes ask, chat, embed, extract, classify', () => {
    const result = compile(`server {
      ai {
        provider: "anthropic"
        model: "claude-sonnet-4-20250514"
        api_key: "test-key"
      }
    }`);
    expect(result.server).toContain('ask(');
    expect(result.server).toContain('chat(');
    expect(result.server).toContain('embed(');
    expect(result.server).toContain('extract(');
    expect(result.server).toContain('classify(');
  });
});

describe('AI parsing — additional', () => {
  test('ai block with env() call for api_key', () => {
    const ast = parse(`server {
      ai {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: env("ANTHROPIC_API_KEY")
      }
    }`);
    const aiConfig = ast.body[0].body[0];
    expect(aiConfig.config.api_key.type).toBe('CallExpression');
  });

  test('ai block with extra config keys', () => {
    const ast = parse(`server {
      ai {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "test"
        temperature: 0.7
        max_tokens: 4096
      }
    }`);
    const aiConfig = ast.body[0].body[0];
    expect(aiConfig.config.temperature.value).toBe(0.7);
    expect(aiConfig.config.max_tokens.value).toBe(4096);
  });

  test('ai block with base_url for custom provider', () => {
    const ast = parse(`server {
      ai "custom" {
        base_url: "http://localhost:11434"
        model: "llama3"
      }
    }`);
    const aiConfig = ast.body[0].body[0];
    expect(aiConfig.name).toBe('custom');
    expect(aiConfig.config.base_url.value).toBe('http://localhost:11434');
  });
});

describe('AI codegen — additional', () => {
  test('multiple AI blocks generate multiple createAI calls', () => {
    const result = compile(`server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "key1"
      }
      ai "gpt" {
        provider: "openai"
        model: "gpt-4o"
        api_key: "key2"
      }
    }`);
    expect(result.server).toContain('const claude = __createAI');
    expect(result.server).toContain('const gpt = __createAI');
  });

  test('AI codegen includes provider in config', () => {
    const result = compile(`server {
      ai {
        provider: "openai"
        model: "gpt-4o"
        api_key: "test"
      }
    }`);
    expect(result.server).toContain('"openai"');
    expect(result.server).toContain('"gpt-4o"');
  });
});

describe('AI analyzer', () => {
  test('named ai provider registered in scope', () => {
    const result = analyze(`server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "test-key"
      }
      result = claude.ask("hello")
    }`);
    // Should not have errors about undefined 'claude'
    const undefinedErrors = result.errors?.filter(e => e.message.includes('claude'));
    expect(undefinedErrors?.length || 0).toBe(0);
  });

  test('default ai registered in scope', () => {
    const result = analyze(`server {
      ai {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "test-key"
      }
      result = ai.ask("hello")
    }`);
    const undefinedErrors = result.errors?.filter(e => e.message.includes("'ai'") && e.message.includes('undefined'));
    expect(undefinedErrors?.length || 0).toBe(0);
  });

  test('multiple named providers all registered in scope', () => {
    const result = analyze(`server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-haiku"
        api_key: "key1"
      }
      ai "gpt" {
        provider: "openai"
        model: "gpt-4o"
        api_key: "key2"
      }
      x = claude.ask("hello")
      y = gpt.ask("hi")
    }`);
    const undefinedErrors = result.errors?.filter(e =>
      e.message.includes("'claude'") || e.message.includes("'gpt'")
    );
    expect(undefinedErrors?.length || 0).toBe(0);
  });
});

describe('AI runtime — createAI factory', () => {
  // These test the runtime module without making actual API calls
  let createAI, defaultAI;

  test('createAI returns object with all methods', async () => {
    const mod = await import('../src/runtime/ai.js');
    createAI = mod.createAI;
    defaultAI = mod.defaultAI;

    const client = createAI({ provider: 'anthropic', model: 'test', api_key: 'test' });
    expect(typeof client.ask).toBe('function');
    expect(typeof client.chat).toBe('function');
    expect(typeof client.embed).toBe('function');
    expect(typeof client.extract).toBe('function');
    expect(typeof client.classify).toBe('function');
    expect(client._config.provider).toBe('anthropic');
  });

  test('createAI with no config defaults to custom provider', async () => {
    const mod = await import('../src/runtime/ai.js');
    const client = mod.createAI();
    expect(client._config).toEqual({});
  });

  test('defaultAI has all methods', async () => {
    const mod = await import('../src/runtime/ai.js');
    expect(typeof mod.defaultAI.ask).toBe('function');
    expect(typeof mod.defaultAI.chat).toBe('function');
    expect(typeof mod.defaultAI.embed).toBe('function');
    expect(typeof mod.defaultAI.extract).toBe('function');
    expect(typeof mod.defaultAI.classify).toBe('function');
  });

  test('createAI with unknown provider falls back to custom', async () => {
    const mod = await import('../src/runtime/ai.js');
    const client = mod.createAI({ provider: 'unknown-provider' });
    expect(typeof client.ask).toBe('function');
  });
});
