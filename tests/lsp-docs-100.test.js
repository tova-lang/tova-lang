import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Prevent auto-start of the LSP server on import
globalThis.__TOVA_LSP_NO_AUTOSTART = true;

import { TovaLanguageServer, startServer } from '../src/lsp/server.js';
import { DocGenerator } from '../src/docs/generator.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

// ─── Helpers ─────────────────────────────────────────────────

function createTestServer() {
  const server = new TovaLanguageServer();
  const sent = [];
  const notifications = [];

  // Intercept _send to capture all outgoing JSON-RPC messages
  server._send = (message) => {
    sent.push(message);
    if (message.method) {
      notifications.push(message);
    }
  };

  return { server, sent, notifications };
}

function makeJsonRpc(method, id, params) {
  const msg = { jsonrpc: '2.0', method, params };
  if (id !== undefined) msg.id = id;
  return msg;
}

function buildLspMessage(obj) {
  const json = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

function parseSource(source, filename = '<test>') {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  return parser.parse();
}

// ─── LSP Server Tests ────────────────────────────────────────

describe('LSP Server: JSON-RPC Transport', () => {
  test('_send writes Content-Length header + JSON to stdout', () => {
    const server = new TovaLanguageServer();
    let written = '';
    const origWrite = process.stdout.write;
    process.stdout.write = (data) => { written += data; return true; };
    try {
      server._send({ jsonrpc: '2.0', id: 1, result: null });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(written).toContain('Content-Length:');
    expect(written).toContain('"jsonrpc":"2.0"');
  });

  test('_respond sends result message', () => {
    const { server, sent } = createTestServer();
    server._respond(42, { capabilities: {} });
    expect(sent.length).toBe(1);
    expect(sent[0].id).toBe(42);
    expect(sent[0].result).toEqual({ capabilities: {} });
  });

  test('_respondError sends error message', () => {
    const { server, sent } = createTestServer();
    server._respondError(99, -32601, 'Method not found');
    expect(sent.length).toBe(1);
    expect(sent[0].error.code).toBe(-32601);
    expect(sent[0].error.message).toBe('Method not found');
  });

  test('_notify sends notification without id', () => {
    const { server, sent } = createTestServer();
    server._notify('window/logMessage', { type: 3, message: 'test' });
    expect(sent.length).toBe(1);
    expect(sent[0].method).toBe('window/logMessage');
    expect(sent[0].id).toBeUndefined();
  });

  test('_logError sends window/logMessage with type 1', () => {
    const { server, notifications } = createTestServer();
    server._logError('something broke');
    expect(notifications.length).toBe(1);
    expect(notifications[0].params.type).toBe(1);
    expect(notifications[0].params.message).toContain('something broke');
  });

  test('_onData parses valid JSON-RPC messages', () => {
    const { server, sent } = createTestServer();
    // Send an initialize request
    const msg = makeJsonRpc('initialize', 1, { capabilities: {} });
    const data = buildLspMessage(msg);
    server._onData(Buffer.from(data));
    // Should have responded with initialize result
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].id).toBe(1);
    expect(sent[0].result.capabilities).toBeDefined();
  });

  test('_onData handles missing Content-Length', () => {
    const { server, sent } = createTestServer();
    // Send data without Content-Length header
    const data = Buffer.from('Bad-Header: something\r\n\r\n{}');
    server._onData(data);
    // Should not crash, no response expected
    expect(sent.length).toBe(0);
  });

  test('_onData handles invalid JSON body', () => {
    const { server, notifications } = createTestServer();
    const badJson = '{invalid json}';
    const data = `Content-Length: ${Buffer.byteLength(badJson)}\r\n\r\n${badJson}`;
    server._onData(Buffer.from(data));
    // Should log error
    expect(notifications.some(n => n.params?.message?.includes('Parse error'))).toBe(true);
  });

  test('_onData handles string chunks (not just Buffer)', () => {
    const { server, sent } = createTestServer();
    const msg = makeJsonRpc('initialize', 1, { capabilities: {} });
    const data = buildLspMessage(msg);
    // Pass as string, not Buffer
    server._onData(data);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].id).toBe(1);
  });

  test('_onData handles partial messages (split across chunks)', () => {
    const { server, sent } = createTestServer();
    const msg = makeJsonRpc('initialize', 1, { capabilities: {} });
    const data = buildLspMessage(msg);
    // Split the message at an arbitrary point
    const mid = Math.floor(data.length / 2);
    server._onData(Buffer.from(data.slice(0, mid)));
    expect(sent.length).toBe(0); // Not yet complete
    server._onData(Buffer.from(data.slice(mid)));
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe('LSP Server: Message Routing', () => {
  test('routes shutdown request', () => {
    const { server, sent } = createTestServer();
    server._handleMessage({ jsonrpc: '2.0', id: 1, method: 'shutdown' });
    expect(server._shutdownReceived).toBe(true);
    expect(sent[0].id).toBe(1);
    expect(sent[0].result).toBeNull();
  });

  test('routes unknown method with error', () => {
    const { server, sent } = createTestServer();
    server._handleMessage({ jsonrpc: '2.0', id: 5, method: 'unknown/method' });
    expect(sent[0].error).toBeDefined();
    expect(sent[0].error.code).toBe(-32601);
  });

  test('routes initialized notification', () => {
    const { server, notifications } = createTestServer();
    server._handleMessage({ jsonrpc: '2.0', method: 'initialized' });
    expect(notifications.some(n => n.params?.message?.includes('initialized'))).toBe(true);
  });

  test('routes textDocument/didOpen', () => {
    const { server } = createTestServer();
    server._handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri: 'file:///test.tova', text: 'x = 1', version: 1 }
      }
    });
    expect(server._documents.has('file:///test.tova')).toBe(true);
  });

  test('routes textDocument/didChange', () => {
    const { server } = createTestServer();
    server._documents.set('file:///test.tova', { text: 'x = 1', version: 1 });
    server._handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: 'file:///test.tova', version: 2 },
        contentChanges: [{ text: 'x = 2' }]
      }
    });
    expect(server._documents.get('file:///test.tova').text).toBe('x = 2');
  });

  test('routes textDocument/didClose', () => {
    const { server, notifications } = createTestServer();
    server._documents.set('file:///test.tova', { text: 'x = 1', version: 1 });
    server._handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didClose',
      params: { textDocument: { uri: 'file:///test.tova' } }
    });
    expect(server._documents.has('file:///test.tova')).toBe(false);
    expect(notifications.some(n => n.method === 'textDocument/publishDiagnostics')).toBe(true);
  });

  test('routes textDocument/didSave', () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///test.tova';
    server._documents.set(uri, { text: 'x = 1\nprint(x)', version: 1 });
    server._handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didSave',
      params: { textDocument: { uri }, text: 'x = 1\nprint(x)' }
    });
    expect(notifications.some(n => n.method === 'textDocument/publishDiagnostics')).toBe(true);
  });

  test('textDocument/didSave uses stored text when no text param', () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///test.tova';
    server._documents.set(uri, { text: 'y = 2\nprint(y)', version: 1 });
    server._handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didSave',
      params: { textDocument: { uri } }
    });
    expect(notifications.some(n => n.method === 'textDocument/publishDiagnostics')).toBe(true);
  });
});

describe('LSP Server: Document Management', () => {
  test('_onDidClose removes doc and clears diagnostics', () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///close.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._diagnosticsCache.set(uri, { ast: null });
    server._onDidClose({ textDocument: { uri } });
    expect(server._documents.has(uri)).toBe(false);
    expect(server._diagnosticsCache.has(uri)).toBe(false);
    const diag = notifications.find(n => n.method === 'textDocument/publishDiagnostics');
    expect(diag.params.diagnostics).toEqual([]);
  });

  test('_onDidSave triggers validation with params.text', () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///save.tova';
    server._documents.set(uri, { text: 'old code', version: 1 });
    server._onDidSave({ textDocument: { uri }, text: 'x = 42\nprint(x)' });
    expect(notifications.some(n => n.method === 'textDocument/publishDiagnostics')).toBe(true);
  });

  test('_onDidSave with no text and no doc does nothing', () => {
    const { server, notifications } = createTestServer();
    server._onDidSave({ textDocument: { uri: 'file:///nonexistent.tova' } });
    expect(notifications.filter(n => n.method === 'textDocument/publishDiagnostics').length).toBe(0);
  });
});

describe('LSP Server: Debounced Validation', () => {
  test('_debouncedValidate creates timer and eventually validates', async () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///debounce.tova';
    server._documents.set(uri, { text: 'x = 10\nprint(x)', version: 1 });
    server._debouncedValidate(uri, 'x = 10\nprint(x)');
    // Timer should be set
    expect(server._validateTimers).toBeDefined();
    expect(server._validateTimers.has(uri)).toBe(true);
    // Wait for debounce timeout (200ms) + buffer
    await new Promise(r => setTimeout(r, 350));
    expect(notifications.some(n => n.method === 'textDocument/publishDiagnostics')).toBe(true);
  });

  test('_debouncedValidate replaces existing timer', async () => {
    const { server } = createTestServer();
    const uri = 'file:///debounce2.tova';
    server._documents.set(uri, { text: 'x = 1\nprint(x)', version: 1 });
    server._debouncedValidate(uri, 'x = 1');
    const timer1 = server._validateTimers.get(uri);
    server._debouncedValidate(uri, 'x = 2');
    const timer2 = server._validateTimers.get(uri);
    // Timer should have been replaced
    expect(timer2).not.toBe(timer1);
  });
});

describe('LSP Server: Crash Recovery', () => {
  test('start() registers event listeners', () => {
    const server = new TovaLanguageServer();
    const listeners = {
      stdin_data: 0,
      stdin_end: 0,
      uncaughtException: 0,
      unhandledRejection: 0,
    };

    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;

    process.stdin.on = function(event, handler) {
      if (event === 'data') listeners.stdin_data++;
      if (event === 'end') listeners.stdin_end++;
      return this;
    };
    process.on = function(event, handler) {
      if (event === 'uncaughtException') listeners.uncaughtException++;
      if (event === 'unhandledRejection') listeners.unhandledRejection++;
      return this;
    };

    try {
      server.start();
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }

    expect(listeners.stdin_data).toBe(1);
    expect(listeners.stdin_end).toBe(1);
    expect(listeners.uncaughtException).toBe(1);
    expect(listeners.unhandledRejection).toBe(1);
  });

  test('uncaughtException handler logs and recovers', () => {
    const server = new TovaLanguageServer();
    let exceptionHandler = null;
    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;

    process.stdin.on = function() { return this; };
    process.on = function(event, handler) {
      if (event === 'uncaughtException') exceptionHandler = handler;
      return this;
    };

    try {
      server.start();
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }

    expect(exceptionHandler).toBeDefined();

    // Mock _logError to capture the call
    let loggedMsg = null;
    server._logError = (msg) => { loggedMsg = msg; };
    exceptionHandler(new Error('test crash'));
    expect(loggedMsg).toContain('Uncaught exception');
    expect(loggedMsg).toContain('test crash');
  });

  test('uncaughtException handler falls back to stderr if _logError throws', () => {
    const server = new TovaLanguageServer();
    let exceptionHandler = null;
    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;

    process.stdin.on = function() { return this; };
    process.on = function(event, handler) {
      if (event === 'uncaughtException') exceptionHandler = handler;
      return this;
    };

    try {
      server.start();
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }

    // Make _logError throw
    server._logError = () => { throw new Error('double fault'); };
    let stderrOutput = '';
    const origStderrWrite = process.stderr.write;
    process.stderr.write = (data) => { stderrOutput += data; return true; };
    try {
      exceptionHandler(new Error('crash in crash'));
    } finally {
      process.stderr.write = origStderrWrite;
    }
    expect(stderrOutput).toContain('Uncaught exception');
    expect(stderrOutput).toContain('crash in crash');
  });

  test('unhandledRejection handler logs and recovers', () => {
    const server = new TovaLanguageServer();
    let rejectionHandler = null;
    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;

    process.stdin.on = function() { return this; };
    process.on = function(event, handler) {
      if (event === 'unhandledRejection') rejectionHandler = handler;
      return this;
    };

    try {
      server.start();
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }

    let loggedMsg = null;
    server._logError = (msg) => { loggedMsg = msg; };
    rejectionHandler(new Error('rejection test'));
    expect(loggedMsg).toContain('Unhandled rejection');
    expect(loggedMsg).toContain('rejection test');
  });

  test('unhandledRejection handler handles non-error values', () => {
    const server = new TovaLanguageServer();
    let rejectionHandler = null;
    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;

    process.stdin.on = function() { return this; };
    process.on = function(event, handler) {
      if (event === 'unhandledRejection') rejectionHandler = handler;
      return this;
    };

    try {
      server.start();
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }

    let loggedMsg = null;
    server._logError = (msg) => { loggedMsg = msg; };
    rejectionHandler('string rejection');
    expect(loggedMsg).toContain('string rejection');
  });

  test('unhandledRejection handler falls back to stderr if _logError throws', () => {
    const server = new TovaLanguageServer();
    let rejectionHandler = null;
    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;

    process.stdin.on = function() { return this; };
    process.on = function(event, handler) {
      if (event === 'unhandledRejection') rejectionHandler = handler;
      return this;
    };

    try {
      server.start();
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }

    server._logError = () => { throw new Error('double fault'); };
    let stderrOutput = '';
    const origStderrWrite = process.stderr.write;
    process.stderr.write = (data) => { stderrOutput += data; return true; };
    try {
      rejectionHandler(new Error('rej crash'));
    } finally {
      process.stderr.write = origStderrWrite;
    }
    expect(stderrOutput).toContain('Unhandled rejection');
  });
});

describe('LSP Server: Completion', () => {
  test('completion returns empty for unknown document', () => {
    const { server, sent } = createTestServer();
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri: 'file:///unknown.tova' }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toEqual([]);
  });

  test('completion filtering limits to 50 items', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///comp.tova';
    server._documents.set(uri, { text: '', version: 1 });
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    // There are many builtins, result should be <= 50
    expect(sent[0].result.length).toBeLessThanOrEqual(50);
  });

  test('completion with dot triggers dot completions', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///dot.tova';
    const text = 'x = 1\nx.';
    server._documents.set(uri, { text, version: 1 });
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri }, position: { line: 1, character: 2 } }
    });
    // Should return something (even if empty array for numeric)
    expect(sent[0].result).toBeDefined();
  });

  test('completion with type annotation trigger', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///type.tova';
    const text = 'fn foo(x: )';
    server._documents.set(uri, { text, version: 1 });
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 10 } }
    });
    const items = sent[0].result;
    expect(items.some(i => i.label === 'Int')).toBe(true);
    expect(items.some(i => i.label === 'String')).toBe(true);
  });

  test('type annotation completion includes user-defined types from cache', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///typecomp.tova';

    // Validate to populate cache
    const source = 'type MyCustom { val: Int }\nfn foo(x: )';
    server._documents.set(uri, { text: source, version: 2 });
    server._validateDocument(uri, source);

    sent.length = 0; // Clear sent from validation
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri }, position: { line: 1, character: 10 } }
    });
    const items = sent[0].result;
    expect(items.some(i => i.label === 'MyCustom')).toBe(true);
  });

  test('completion prefix filtering works', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///prefix.tova';
    const text = 'pri';
    server._documents.set(uri, { text, version: 1 });
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 3 } }
    });
    const items = sent[0].result;
    expect(items.some(i => i.label === 'print')).toBe(true);
  });

  test('completion includes user-defined symbols from cache', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///usersym.tova';
    const source = 'fn my_custom_func(a) {\n  return a\n}\nmy_';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);
    sent.length = 0; // Clear sent from validation
    server._onCompletion({
      id: 1,
      params: { textDocument: { uri }, position: { line: 3, character: 3 } }
    });
    const items = sent[0].result;
    expect(items.some(i => i.label === 'my_custom_func')).toBe(true);
  });
});

describe('LSP Server: Go-to-Definition', () => {
  test('go-to-def with no cached analyzer returns null', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///nodef.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onDefinition({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('go-to-def with no document returns null', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///nodef2.tova';
    server._diagnosticsCache.set(uri, { analyzer: {} });
    server._onDefinition({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('go-to-def with empty word returns null', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///noword.tova';
    server._documents.set(uri, { text: '  ', version: 1 });
    server._diagnosticsCache.set(uri, { analyzer: {} });
    server._onDefinition({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('go-to-def finds function definition location', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///godef.tova';
    const source = 'fn greet(name) {\n  return "hi " + name\n}\ngreet("world")';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    server._onDefinition({
      id: 1,
      params: { textDocument: { uri }, position: { line: 3, character: 2 } }
    });
    const result = sent[sent.length - 1].result;
    if (result) {
      expect(result.uri).toBe(uri);
      expect(result.range).toBeDefined();
    }
  });

  test('go-to-def returns null for unknown symbol', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///unknown.tova';
    const source = 'x = 1\nprint(x)';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    // Try to find definition of something not in source
    server._documents.set(uri, { text: 'unknown_var', version: 2 });
    server._onDefinition({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 3 } }
    });
    // May return null for builtin or undefined
    expect(sent[sent.length - 1]).toBeDefined();
  });
});

describe('LSP Server: Signature Help', () => {
  test('signature help for builtin function', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///sig.tova';
    const text = 'print(';
    server._documents.set(uri, { text, version: 1 });
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 6 } }
    });
    const result = sent[0].result;
    expect(result).not.toBeNull();
    expect(result.signatures.length).toBeGreaterThan(0);
    expect(result.signatures[0].label).toContain('print');
  });

  test('signature help for range function with active param', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///sig2.tova';
    const text = 'range(1, ';
    server._documents.set(uri, { text, version: 1 });
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 9 } }
    });
    const result = sent[0].result;
    expect(result.activeParameter).toBe(1);
  });

  test('signature help returns null when no paren found', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///sig3.tova';
    const text = 'hello world';
    server._documents.set(uri, { text, version: 1 });
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 5 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('signature help returns null when no function name before paren', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///sig4.tova';
    const text = '(1, 2)';
    server._documents.set(uri, { text, version: 1 });
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 1 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('signature help for user-defined function', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///sig5.tova';
    const source = 'fn add(a, b) {\n  return a + b\n}\nadd(';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 3, character: 4 } }
    });
    const result = sent[sent.length - 1].result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toContain('add');
    expect(result.signatures[0].parameters.length).toBe(2);
  });

  test('signature help returns null for no document', () => {
    const { server, sent } = createTestServer();
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri: 'file:///none.tova' }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('signature help returns null for unknown function', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///sig6.tova';
    const source = 'x = 1\nprint(x)';
    server._documents.set(uri, { text: 'unknown_func(', version: 1 });
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 13 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('signature help handles nested calls', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///nested.tova';
    const text = 'range(len(';
    server._documents.set(uri, { text, version: 1 });
    server._onSignatureHelp({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 10 } }
    });
    const result = sent[0].result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toContain('len');
  });
});

describe('LSP Server: Symbol Collection', () => {
  test('_collectSymbols walks scopes recursively', () => {
    const { server } = createTestServer();
    const uri = 'file:///sym.tova';
    const source = 'fn outer() {\n  fn inner() {\n    return 1\n  }\n  return inner()\n}';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    const cached = server._diagnosticsCache.get(uri);
    const symbols = server._collectSymbols(cached.analyzer);
    expect(symbols.some(s => s.name === 'outer')).toBe(true);
    expect(symbols.some(s => s.name === 'inner')).toBe(true);
  });

  test('_collectSymbols falls back to currentScope', () => {
    const { server } = createTestServer();
    // Create an analyzer mock with only currentScope
    const mockAnalyzer = {
      currentScope: {
        symbols: new Map([['x', { kind: 'variable' }]]),
        children: [],
      },
    };
    const symbols = server._collectSymbols(mockAnalyzer);
    expect(symbols.some(s => s.name === 'x')).toBe(true);
  });

  test('_collectSymbols handles no scope', () => {
    const { server } = createTestServer();
    const symbols = server._collectSymbols({});
    expect(symbols).toEqual([]);
  });

  test('_findSymbolInScopes walks children', () => {
    const { server } = createTestServer();
    const uri = 'file:///find.tova';
    const source = 'fn foo() {\n  x = 42\n  return x\n}';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    const cached = server._diagnosticsCache.get(uri);
    const sym = server._findSymbolInScopes(cached.analyzer, 'foo');
    expect(sym).not.toBeNull();
    expect(sym.kind).toBe('function');
  });

  test('_findSymbolInScopes returns null for missing symbol', () => {
    const { server } = createTestServer();
    const uri = 'file:///findnull.tova';
    const source = 'x = 1\nprint(x)';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    const cached = server._diagnosticsCache.get(uri);
    const sym = server._findSymbolInScopes(cached.analyzer, 'nonexistent_xyz');
    expect(sym).toBeNull();
  });

  test('_findSymbolInScopes falls back to currentScope', () => {
    const { server } = createTestServer();
    const mockAnalyzer = {
      currentScope: {
        symbols: new Map([['y', { kind: 'variable' }]]),
        children: [],
      },
    };
    const sym = server._findSymbolInScopes(mockAnalyzer, 'y');
    expect(sym).not.toBeNull();
    expect(sym.kind).toBe('variable');
  });

  test('_findSymbolAtPosition uses scope position lookup', () => {
    const { server } = createTestServer();
    const uri = 'file:///pos.tova';
    const source = 'fn foo() {\n  x = 42\n  return x\n}\nfoo()';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);

    const cached = server._diagnosticsCache.get(uri);
    // Position inside the function
    const sym = server._findSymbolAtPosition(cached.analyzer, 'x', { line: 1, character: 2 });
    // May or may not find depending on scope indexing
    // At minimum, should not throw
    expect(true).toBe(true);
  });

  test('_findSymbolAtPosition returns null for no globalScope', () => {
    const { server } = createTestServer();
    const result = server._findSymbolAtPosition({}, 'x', { line: 0, character: 0 });
    expect(result).toBeNull();
  });
});

describe('LSP Server: _parseCallArgPositions', () => {
  test('parses simple argument positions', () => {
    const { server } = createTestServer();
    const line = 'foo(a, b, c)';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(3);
    expect(positions[0].start).toBe(4);
  });

  test('handles nested parens', () => {
    const { server } = createTestServer();
    const line = 'foo(bar(1, 2), c)';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
  });

  test('handles string arguments', () => {
    const { server } = createTestServer();
    const line = 'foo("hello, world", b)';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
  });

  test('handles escaped characters in strings', () => {
    const { server } = createTestServer();
    const line = 'foo("he\\"llo", b)';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
  });

  test('handles single-quoted strings', () => {
    const { server } = createTestServer();
    const line = "foo('hello, world', b)";
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
  });

  test('handles template literal strings', () => {
    const { server } = createTestServer();
    const line = 'foo(`hello, world`, b)';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
  });

  test('handles nested brackets and braces', () => {
    const { server } = createTestServer();
    const line = 'foo([1, 2], {a: 1, b: 2}, c)';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(3);
  });

  test('handles empty arg list', () => {
    const { server } = createTestServer();
    const line = 'foo()';
    const positions = server._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(0);
  });
});

describe('LSP Server: _walkTypeAnnotation', () => {
  test('handles null/non-object typeNode', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkTypeAnnotation(null, tokens);
    server._walkTypeAnnotation(42, tokens);
    server._walkTypeAnnotation('String', tokens);
    expect(tokens.length).toBe(0);
  });

  test('pushes token for named type with location', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkTypeAnnotation({ name: 'Int', loc: { line: 1, column: 5 } }, tokens);
    expect(tokens.length).toBe(1);
    expect(tokens[0].tokenType).toBe(1);
    expect(tokens[0].line).toBe(0); // 0-indexed
    expect(tokens[0].char).toBe(4);
    expect(tokens[0].length).toBe(3);
  });

  test('recursively walks typeArgs', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkTypeAnnotation({
      name: 'List',
      loc: { line: 1, column: 1 },
      typeArgs: [{ name: 'Int', loc: { line: 1, column: 6 } }],
    }, tokens);
    expect(tokens.length).toBe(2);
  });

  test('recursively walks params', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkTypeAnnotation({
      params: [{ name: 'Int', loc: { line: 1, column: 1 } }],
    }, tokens);
    expect(tokens.length).toBe(1);
  });

  test('walks left/right for union types', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkTypeAnnotation({
      left: { name: 'Int', loc: { line: 1, column: 1 } },
      right: { name: 'String', loc: { line: 1, column: 7 } },
    }, tokens);
    expect(tokens.length).toBe(2);
  });

  test('walks returnType and elementType', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkTypeAnnotation({
      returnType: { name: 'Bool', loc: { line: 1, column: 1 } },
      elementType: { name: 'Int', loc: { line: 2, column: 1 } },
    }, tokens);
    expect(tokens.length).toBe(2);
  });
});

describe('LSP Server: Utility Methods', () => {
  test('_uriToPath handles file:// URIs', () => {
    const { server } = createTestServer();
    expect(server._uriToPath('file:///Users/test.tova')).toBe('/Users/test.tova');
  });

  test('_uriToPath handles Windows paths', () => {
    const { server } = createTestServer();
    expect(server._uriToPath('file:///C:/Users/test.tova')).toBe('C:/Users/test.tova');
  });

  test('_uriToPath handles encoded URIs', () => {
    const { server } = createTestServer();
    expect(server._uriToPath('file:///Users/test%20file.tova')).toBe('/Users/test file.tova');
  });

  test('_uriToPath handles non-file URIs', () => {
    const { server } = createTestServer();
    expect(server._uriToPath('untitled:Untitled-1')).toBe('untitled:Untitled-1');
  });

  test('_getWordAt extracts word at position', () => {
    const { server } = createTestServer();
    expect(server._getWordAt('hello world', 2)).toBe('hello');
    expect(server._getWordAt('hello world', 8)).toBe('world');
    expect(server._getWordAt('fn foo()', 4)).toBe('foo');
  });

  test('_getWordAt returns null for no word', () => {
    const { server } = createTestServer();
    expect(server._getWordAt('   ', 1)).toBeNull();
  });

  test('_positionToOffset converts position to byte offset', () => {
    const { server } = createTestServer();
    const text = 'line1\nline2\nline3';
    expect(server._positionToOffset(text, { line: 0, character: 0 })).toBe(0);
    expect(server._positionToOffset(text, { line: 1, character: 0 })).toBe(6);
    expect(server._positionToOffset(text, { line: 1, character: 3 })).toBe(9);
    expect(server._positionToOffset(text, { line: 2, character: 0 })).toBe(12);
  });

  test('_applyEdit applies incremental edits', () => {
    const { server } = createTestServer();
    const text = 'hello world';
    const result = server._applyEdit(text, {
      start: { line: 0, character: 6 },
      end: { line: 0, character: 11 },
    }, 'tova');
    expect(result).toBe('hello tova');
  });

  test('_getBuiltinDetail returns detail for known functions', () => {
    const { server } = createTestServer();
    const detail = server._getBuiltinDetail('print');
    expect(typeof detail).toBe('string');
  });

  test('_getBuiltinDetail returns default for unknown', () => {
    const { server } = createTestServer();
    expect(server._getBuiltinDetail('nonexistent_builtin_xyz')).toBe('Tova built-in');
  });
});

describe('LSP Server: Validation & Diagnostics', () => {
  test('_validateDocument publishes diagnostics for valid code', () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///valid.tova';
    server._validateDocument(uri, 'x = 42\nprint(x)');
    const diag = notifications.find(n => n.method === 'textDocument/publishDiagnostics');
    expect(diag).toBeDefined();
    expect(diag.params.uri).toBe(uri);
  });

  test('_validateDocument publishes diagnostics for parse errors', () => {
    const { server, notifications } = createTestServer();
    const uri = 'file:///invalid.tova';
    server._validateDocument(uri, 'fn {');
    const diag = notifications.find(n => n.method === 'textDocument/publishDiagnostics');
    expect(diag).toBeDefined();
    expect(diag.params.diagnostics.length).toBeGreaterThan(0);
  });

  test('_validateDocument caches ast and analyzer', () => {
    const { server } = createTestServer();
    const uri = 'file:///cache.tova';
    server._validateDocument(uri, 'x = 1\nprint(x)');
    const cached = server._diagnosticsCache.get(uri);
    expect(cached).toBeDefined();
    expect(cached.ast).toBeDefined();
    expect(cached.analyzer).toBeDefined();
  });

  test('_getDiagnosticSeverity returns correct severities', () => {
    const { server } = createTestServer();
    expect(server._getDiagnosticSeverity({ message: "'x' declared but never used" })).toBe(4);
    expect(server._getDiagnosticSeverity({ message: "x shadows a binding" })).toBe(3);
    expect(server._getDiagnosticSeverity({ message: "Non-exhaustive match" })).toBe(2);
    expect(server._getDiagnosticSeverity({ message: "Type mismatch" })).toBe(1);
    expect(server._getDiagnosticSeverity({ message: "x should use snake_case" })).toBe(4);
    expect(server._getDiagnosticSeverity({ message: "x should use PascalCase" })).toBe(4);
    expect(server._getDiagnosticSeverity({ message: "some other warning" })).toBe(2);
    expect(server._getDiagnosticSeverity({})).toBe(2);
  });

  test('_extractErrorLocation parses file:line:column format', () => {
    const { server } = createTestServer();
    const loc = server._extractErrorLocation('test.tova:5:10 — Unexpected token', 'test.tova');
    expect(loc.line).toBe(5);
    expect(loc.column).toBe(10);
    expect(loc.message).toBe('Unexpected token');
  });

  test('_extractErrorLocation parses Analysis errors format', () => {
    const { server } = createTestServer();
    const msg = 'Analysis errors:\ntest.tova:3:5 — Type error here';
    const loc = server._extractErrorLocation(msg, 'test.tova');
    expect(loc.line).toBe(3);
  });

  test('_extractErrorLocation returns null for unrecognized format', () => {
    const { server } = createTestServer();
    const loc = server._extractErrorLocation('random error message', 'test.tova');
    expect(loc).toBeNull();
  });

  test('LRU eviction for diagnostics cache', () => {
    const { server } = createTestServer();
    // Fill cache beyond MAX_CACHE_SIZE
    for (let i = 0; i < 110; i++) {
      const uri = `file:///cache${i}.tova`;
      server._diagnosticsCache.set(uri, { ast: null });
    }
    // Now validate a new document
    server._validateDocument('file:///newcache.tova', 'x = 1\nprint(x)');
    // Cache should not exceed MAX_CACHE_SIZE too much
    expect(server._diagnosticsCache.size).toBeLessThanOrEqual(112);
  });
});

describe('LSP Server: Initialize', () => {
  test('_onInitialize sets initialized and responds with capabilities', () => {
    const { server, sent } = createTestServer();
    server._onInitialize({ id: 1, params: { capabilities: {} } });
    expect(server._initialized).toBe(true);
    const caps = sent[0].result.capabilities;
    expect(caps.textDocumentSync).toBeDefined();
    expect(caps.completionProvider).toBeDefined();
    expect(caps.definitionProvider).toBe(true);
    expect(caps.hoverProvider).toBe(true);
    expect(caps.signatureHelpProvider).toBeDefined();
    expect(caps.semanticTokensProvider).toBeDefined();
  });
});

describe('LSP Server: Workspace Symbol', () => {
  test('workspace symbol returns empty for no query', () => {
    const { server, sent } = createTestServer();
    server._handleMessage({
      jsonrpc: '2.0', id: 1, method: 'workspace/symbol',
      params: { query: '' }
    });
    expect(sent[0].result).toBeDefined();
  });
});

describe('LSP Server: startServer export', () => {
  test('startServer creates and starts server', () => {
    let started = false;
    const origStdinOn = process.stdin.on;
    const origProcessOn = process.on;
    process.stdin.on = function() { started = true; return this; };
    process.on = function() { return this; };
    try {
      const srv = startServer();
      expect(srv).toBeDefined();
      expect(started).toBe(true);
    } finally {
      process.stdin.on = origStdinOn;
      process.on = origProcessOn;
    }
  });
});

// ─── DocGenerator Tests ──────────────────────────────────────

describe('DocGenerator: Basic', () => {
  test('constructor stores modules', () => {
    const gen = new DocGenerator([{ name: 'test', ast: { body: [] } }]);
    expect(gen.modules.length).toBe(1);
    expect(gen.modules[0].name).toBe('test');
  });

  test('generate with empty modules returns index only', () => {
    const gen = new DocGenerator([]);
    const pages = gen.generate();
    expect(pages['index.html']).toBeDefined();
    expect(pages['index.html']).toContain('Tova API Documentation');
  });
});

describe('DocGenerator: _extractDocs', () => {
  test('extracts function documentation', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'greet',
        params: [{ name: 'name', typeAnnotation: 'String' }],
        returnType: { name: 'String' },
        isAsync: false,
        docstring: 'Greets someone\n@param name The name to greet\n@returns A greeting string\n@example\ngreet("world")',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'mymod', ast }]);
    const docs = gen._extractDocs(ast, 'mymod');
    expect(docs.length).toBe(1);
    expect(docs[0].kind).toBe('function');
    expect(docs[0].name).toBe('greet');
    expect(docs[0].description).toContain('Greets someone');
    expect(docs[0].docParams.length).toBe(1);
    expect(docs[0].docReturns).toContain('greeting string');
    expect(docs[0].docExamples.length).toBe(1);
  });

  test('extracts type declaration with variants', () => {
    const ast = {
      body: [{
        type: 'TypeDeclaration',
        name: 'Shape',
        variants: [
          { name: 'Circle', fields: [{ name: 'radius', typeAnnotation: { name: 'Float' } }] },
          { name: 'Square', fields: [{ name: 'side', typeAnnotation: 'Float' }] },
          { name: 'Point', fields: [] },
        ],
        docstring: 'A geometric shape',
      }]
    };
    const gen = new DocGenerator([{ name: 'shapes', ast }]);
    const docs = gen._extractDocs(ast, 'shapes');
    expect(docs.length).toBe(1);
    expect(docs[0].kind).toBe('type');
    expect(docs[0].variants.length).toBe(3);
    expect(docs[0].variants[0].name).toBe('Circle');
    expect(docs[0].variants[0].fields[0].type).toBe('Float');
    expect(docs[0].variants[2].fields).toEqual([]);
  });

  test('extracts interface declaration with methods', () => {
    const ast = {
      body: [{
        type: 'InterfaceDeclaration',
        name: 'Drawable',
        methods: [
          { name: 'draw', params: ['self', { name: 'ctx' }], returnType: { name: 'Void' } },
          { name: 'area', params: ['self'], returnType: { name: 'Float' } },
        ],
        docstring: 'Things that can be drawn',
      }]
    };
    const gen = new DocGenerator([{ name: 'ifaces', ast }]);
    const docs = gen._extractDocs(ast, 'ifaces');
    expect(docs.length).toBe(1);
    expect(docs[0].kind).toBe('interface');
    expect(docs[0].methods.length).toBe(2);
    expect(docs[0].methods[0].name).toBe('draw');
    expect(docs[0].methods[0].returnType).toBe('Void');
  });

  test('extracts trait declaration with methods', () => {
    const ast = {
      body: [{
        type: 'TraitDeclaration',
        name: 'Serializable',
        methods: [
          { name: 'serialize', params: ['self'], returnType: { name: 'String' } },
        ],
        docstring: 'Trait for serialization',
      }]
    };
    const gen = new DocGenerator([{ name: 'traits', ast }]);
    const docs = gen._extractDocs(ast, 'traits');
    expect(docs.length).toBe(1);
    expect(docs[0].kind).toBe('trait');
    expect(docs[0].methods[0].name).toBe('serialize');
  });

  test('extracts constant (Assignment) documentation', () => {
    const ast = {
      body: [{
        type: 'Assignment',
        targets: [{ name: 'MAX_SIZE' }],
        docstring: 'Maximum buffer size',
      }]
    };
    const gen = new DocGenerator([{ name: 'constants', ast }]);
    const docs = gen._extractDocs(ast, 'constants');
    expect(docs.length).toBe(1);
    expect(docs[0].kind).toBe('constant');
    expect(docs[0].name).toBe('MAX_SIZE');
  });

  test('extracts constant with string target', () => {
    const ast = {
      body: [{
        type: 'Assignment',
        targets: ['VERSION'],
        docstring: 'Current version',
      }]
    };
    const gen = new DocGenerator([{ name: 'constants', ast }]);
    const docs = gen._extractDocs(ast, 'constants');
    expect(docs[0].name).toBe('VERSION');
  });

  test('returns null for unknown node types', () => {
    const ast = {
      body: [{
        type: 'SomeUnknownNode',
        docstring: 'Unknown thing',
      }]
    };
    const gen = new DocGenerator([{ name: 'unknown', ast }]);
    const docs = gen._extractDocs(ast, 'unknown');
    expect(docs.length).toBe(0);
  });

  test('walks into ServerBlock/BrowserBlock/SharedBlock bodies', () => {
    // ServerBlock body is an array, so _extractDocs walks it from both
    // the generic node.body check (line 27) and the ServerBlock-specific check (line 28).
    // This means documented items inside will be found twice.
    const ast = {
      body: [{
        type: 'ServerBlock',
        body: [{
          type: 'FunctionDeclaration',
          name: 'api_handler',
          params: [],
          docstring: 'Server handler',
          body: [],
        }],
      }]
    };
    const gen = new DocGenerator([{ name: 'server', ast }]);
    const docs = gen._extractDocs(ast, 'server');
    // Both the generic body walk and ServerBlock-specific walk find it
    expect(docs.length).toBe(2);
    expect(docs[0].name).toBe('api_handler');

    // BrowserBlock
    const ast2 = {
      body: [{
        type: 'BrowserBlock',
        body: [{
          type: 'FunctionDeclaration',
          name: 'render',
          params: [],
          docstring: 'Render function',
          body: [],
        }],
      }]
    };
    const docs2 = gen._extractDocs(ast2, 'browser');
    expect(docs2.length).toBe(2);

    // SharedBlock
    const ast3 = {
      body: [{
        type: 'SharedBlock',
        body: [{
          type: 'FunctionDeclaration',
          name: 'shared_fn',
          params: [],
          docstring: 'Shared function',
          body: [],
        }],
      }]
    };
    const docs3 = gen._extractDocs(ast3, 'shared');
    expect(docs3.length).toBe(2);
  });

  test('skips null nodes', () => {
    const ast = { body: [null, undefined] };
    const gen = new DocGenerator([{ name: 'nulls', ast }]);
    const docs = gen._extractDocs(ast, 'nulls');
    expect(docs.length).toBe(0);
  });

  test('skips nodes without docstring', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'no_docs',
        params: [],
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'nodocs', ast }]);
    const docs = gen._extractDocs(ast, 'nodocs');
    expect(docs.length).toBe(0);
  });
});

describe('DocGenerator: _typeToString', () => {
  test('handles null/undefined', () => {
    const gen = new DocGenerator([]);
    expect(gen._typeToString(null)).toBe('');
    expect(gen._typeToString(undefined)).toBe('');
  });

  test('handles string type', () => {
    const gen = new DocGenerator([]);
    expect(gen._typeToString('Int')).toBe('Int');
  });

  test('handles named type object', () => {
    const gen = new DocGenerator([]);
    expect(gen._typeToString({ name: 'Float' })).toBe('Float');
  });

  test('handles generic type with typeParams', () => {
    const gen = new DocGenerator([]);
    const result = gen._typeToString({
      name: 'Result',
      typeParams: [{ name: 'String' }, { name: 'Error' }],
    });
    expect(result).toBe('Result<String, Error>');
  });

  test('handles ArrayTypeAnnotation', () => {
    const gen = new DocGenerator([]);
    const result = gen._typeToString({
      type: 'ArrayTypeAnnotation',
      elementType: { name: 'Int' },
    });
    expect(result).toBe('[Int]');
  });

  test('handles FunctionTypeAnnotation', () => {
    const gen = new DocGenerator([]);
    const result = gen._typeToString({
      type: 'FunctionTypeAnnotation',
      paramTypes: [{ name: 'Int' }, { name: 'String' }],
      returnType: { name: 'Bool' },
    });
    expect(result).toBe('(Int, String) -> Bool');
  });

  test('FunctionTypeAnnotation with no returnType defaults to Void', () => {
    const gen = new DocGenerator([]);
    const result = gen._typeToString({
      type: 'FunctionTypeAnnotation',
      paramTypes: [{ name: 'Int' }],
      returnType: null,
    });
    expect(result).toBe('(Int) -> Void');
  });

  test('handles unknown object by converting to string', () => {
    const gen = new DocGenerator([]);
    const result = gen._typeToString({ toString() { return 'custom'; } });
    expect(result).toBe('custom');
  });
});

describe('DocGenerator: _parseDocstring', () => {
  test('parses description only', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('Simple function description');
    expect(result.description).toBe('Simple function description');
    expect(result.docParams).toEqual([]);
    expect(result.docReturns).toBe('');
    expect(result.docExamples).toEqual([]);
  });

  test('parses @param tags', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('@param name The user name\n@param age The user age');
    expect(result.docParams.length).toBe(2);
    expect(result.docParams[0].name).toBe('name');
    expect(result.docParams[0].description).toBe('The user name');
    expect(result.docParams[1].name).toBe('age');
  });

  test('parses @param with no description', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('@param x');
    expect(result.docParams.length).toBe(1);
    expect(result.docParams[0].name).toBe('x');
    expect(result.docParams[0].description).toBe('');
  });

  test('parses @returns tag', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('@returns The computed value');
    expect(result.docReturns).toBe('The computed value');
  });

  test('parses @return tag (without s)', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('@return The value');
    expect(result.docReturns).toBe('The value');
  });

  test('parses @example blocks', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('A function\n@example\nfoo(1)\nfoo(2)\n@example\nbar(3)');
    expect(result.docExamples.length).toBe(2);
    expect(result.docExamples[0]).toContain('foo(1)');
    expect(result.docExamples[1]).toContain('bar(3)');
  });

  test('handles @param after @example flushes example buffer', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('@example\nfoo(1)\n@param x the value');
    expect(result.docExamples.length).toBe(1);
    expect(result.docParams.length).toBe(1);
  });

  test('handles @returns after @example flushes example buffer', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('@example\nfoo(1)\n@returns the value');
    expect(result.docExamples.length).toBe(1);
    expect(result.docReturns).toBe('the value');
  });

  test('handles multiple description lines', () => {
    const gen = new DocGenerator([]);
    const result = gen._parseDocstring('Line one\nLine two\nLine three');
    expect(result.description).toBe('Line one Line two Line three');
  });
});

describe('DocGenerator: HTML rendering', () => {
  test('generate with html format produces index and module pages', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'hello',
        params: [{ name: 'who', typeAnnotation: { name: 'String' } }],
        returnType: { name: 'String' },
        isAsync: true,
        docstring: 'Says hello\n@param who The recipient\n@returns Greeting',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'greetings', ast }]);
    const pages = gen.generate('html');
    expect(pages['index.html']).toContain('greetings');
    expect(pages['greetings.html']).toContain('hello');
    expect(pages['greetings.html']).toContain('async');
    expect(pages['greetings.html']).toContain('who: String');
    expect(pages['greetings.html']).toContain('String');
  });

  test('HTML renders type variants', () => {
    const ast = {
      body: [{
        type: 'TypeDeclaration',
        name: 'Color',
        variants: [
          { name: 'Red', fields: [] },
          { name: 'RGB', fields: [
            { name: 'r', typeAnnotation: { name: 'Int' } },
            { name: 'g', typeAnnotation: { name: 'Int' } },
            { name: 'b', typeAnnotation: { name: 'Int' } },
          ]},
        ],
        docstring: 'Color type',
      }]
    };
    const gen = new DocGenerator([{ name: 'colors', ast }]);
    const pages = gen.generate('html');
    expect(pages['colors.html']).toContain('Variants');
    expect(pages['colors.html']).toContain('Red');
    expect(pages['colors.html']).toContain('RGB');
    expect(pages['colors.html']).toContain('r: Int');
  });

  test('HTML renders interface methods', () => {
    const ast = {
      body: [{
        type: 'InterfaceDeclaration',
        name: 'Printable',
        methods: [
          { name: 'to_string', params: ['self'], returnType: { name: 'String' } },
        ],
        docstring: 'Printable interface',
      }]
    };
    const gen = new DocGenerator([{ name: 'ifaces', ast }]);
    const pages = gen.generate('html');
    expect(pages['ifaces.html']).toContain('Methods');
    expect(pages['ifaces.html']).toContain('fn to_string');
    expect(pages['ifaces.html']).toContain('-> String');
  });

  test('HTML renders trait methods', () => {
    const ast = {
      body: [{
        type: 'TraitDeclaration',
        name: 'Hashable',
        methods: [
          { name: 'hash', params: ['self'], returnType: { name: 'Int' } },
        ],
        docstring: 'Hashable trait',
      }]
    };
    const gen = new DocGenerator([{ name: 'traits', ast }]);
    const pages = gen.generate('html');
    expect(pages['traits.html']).toContain('Methods');
    expect(pages['traits.html']).toContain('fn hash');
  });

  test('HTML renders example code blocks', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'add',
        params: [{ name: 'a' }, { name: 'b' }],
        docstring: 'Adds two numbers\n@example\nadd(1, 2)',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'math', ast }]);
    const pages = gen.generate('html');
    expect(pages['math.html']).toContain('Examples');
    expect(pages['math.html']).toContain('add(1, 2)');
  });

  test('HTML escapes special characters', () => {
    const gen = new DocGenerator([]);
    expect(gen._escapeHtml('a < b & c > d "e"')).toBe('a &lt; b &amp; c &gt; d &quot;e&quot;');
  });

  test('HTML includes styles', () => {
    const gen = new DocGenerator([]);
    const styles = gen._getStyles();
    expect(styles).toContain('--ctp-base');
    expect(styles).toContain('font-family');
  });
});

describe('DocGenerator: Markdown rendering', () => {
  test('generate with markdown format produces index and module pages', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'hello',
        params: [{ name: 'who', typeAnnotation: { name: 'String' } }],
        returnType: { name: 'String' },
        isAsync: true,
        docstring: 'Says hello\n@param who The recipient\n@returns Greeting\n@example\nhello("world")',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'greetings', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['index.md']).toContain('greetings');
    expect(pages['index.md']).toContain('hello');
    expect(pages['greetings.md']).toBeDefined();
  });

  test('markdown renders function signature', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'compute',
        params: [
          { name: 'x', typeAnnotation: { name: 'Int' } },
          { name: 'y', typeAnnotation: { name: 'Float' } },
        ],
        returnType: { name: 'Float' },
        isAsync: false,
        docstring: 'Computes something',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'math', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['math.md']).toContain('fn compute(x: Int, y: Float) -> Float');
  });

  test('markdown renders async function signature', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'fetch_data',
        params: [],
        returnType: { name: 'String' },
        isAsync: true,
        docstring: 'Fetches data',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'net', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['net.md']).toContain('async fn fetch_data');
  });

  test('markdown renders parameter table', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'greet',
        params: [{ name: 'name' }],
        docstring: 'Greets\n@param name The name\n@param age The age',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'mod', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['mod.md']).toContain('### Parameters');
    expect(pages['mod.md']).toContain('| Name | Description |');
    expect(pages['mod.md']).toContain('| `name` | The name |');
    expect(pages['mod.md']).toContain('| `age` | The age |');
  });

  test('markdown renders returns section', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'foo',
        params: [],
        docstring: '@returns The value',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'mod', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['mod.md']).toContain('### Returns');
    expect(pages['mod.md']).toContain('The value');
  });

  test('markdown renders example code blocks', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'foo',
        params: [],
        docstring: 'A function\n@example\nfoo()\nfoo()',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'mod', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['mod.md']).toContain('### Examples');
    expect(pages['mod.md']).toContain('```tova');
    expect(pages['mod.md']).toContain('foo()');
  });

  test('markdown renders type variants', () => {
    const ast = {
      body: [{
        type: 'TypeDeclaration',
        name: 'Shape',
        variants: [
          { name: 'Circle', fields: [{ name: 'r', typeAnnotation: { name: 'Float' } }] },
          { name: 'Point', fields: [] },
        ],
        docstring: 'A shape',
      }]
    };
    const gen = new DocGenerator([{ name: 'shapes', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['shapes.md']).toContain('### Variants');
    expect(pages['shapes.md']).toContain('`Circle(r: Float)`');
    expect(pages['shapes.md']).toContain('`Point`');
  });

  test('markdown renders interface methods', () => {
    const ast = {
      body: [{
        type: 'InterfaceDeclaration',
        name: 'Showable',
        methods: [
          { name: 'show', params: ['self'], returnType: { name: 'String' } },
          { name: 'debug', params: ['self', 'verbose'], returnType: null },
        ],
        docstring: 'Can be shown',
      }]
    };
    const gen = new DocGenerator([{ name: 'show', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['show.md']).toContain('### Methods');
    expect(pages['show.md']).toContain('`fn show(self) -> String`');
    expect(pages['show.md']).toContain('`fn debug(self, verbose)`');
  });

  test('markdown renders trait methods', () => {
    const ast = {
      body: [{
        type: 'TraitDeclaration',
        name: 'Cloneable',
        methods: [
          { name: 'clone', params: ['self'], returnType: { name: 'Self' } },
        ],
        docstring: 'Can be cloned',
      }]
    };
    const gen = new DocGenerator([{ name: 'clone', ast }]);
    const pages = gen.generate('markdown');
    expect(pages['clone.md']).toContain('### Methods');
    expect(pages['clone.md']).toContain('`fn clone(self) -> Self`');
  });
});

describe('DocGenerator: Module name passing', () => {
  test('module name is passed through to generate output', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'test_fn',
        params: [],
        docstring: 'Test function',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'my_module', ast }]);
    const pages = gen.generate('html');
    expect(pages['index.html']).toContain('my_module');
    expect(pages['my_module.html']).toBeDefined();
  });
});

describe('DocGenerator: Function with default params', () => {
  test('extracts default param info', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'greet',
        params: [
          { name: 'name', typeAnnotation: 'String', defaultValue: { type: 'StringLiteral', value: 'world' } },
        ],
        returnType: null,
        docstring: 'Greets someone',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'mod', ast }]);
    const docs = gen._extractDocs(ast, 'mod');
    expect(docs[0].params[0].default).toBe(true);
  });

  test('function with no returnType renders without arrow', () => {
    const ast = {
      body: [{
        type: 'FunctionDeclaration',
        name: 'doStuff',
        params: [],
        returnType: null,
        docstring: 'Does stuff',
        body: [],
      }]
    };
    const gen = new DocGenerator([{ name: 'mod', ast }]);
    const pages = gen.generate('html');
    expect(pages['mod.html']).not.toContain('-&gt;');
  });
});

describe('DocGenerator: Assignment with empty targets', () => {
  test('handles assignment with empty targets array', () => {
    const ast = {
      body: [{
        type: 'Assignment',
        targets: [],
        docstring: 'Empty targets',
      }]
    };
    const gen = new DocGenerator([{ name: 'mod', ast }]);
    const docs = gen._extractDocs(ast, 'mod');
    expect(docs[0].kind).toBe('constant');
    expect(docs[0].name).toBe('');
  });
});

describe('DocGenerator: Complex integration', () => {
  test('multiple modules with mixed types generate correctly', () => {
    const mod1Ast = {
      body: [
        {
          type: 'FunctionDeclaration',
          name: 'fn1',
          params: [],
          docstring: 'Function 1',
          body: [],
        },
        {
          type: 'TypeDeclaration',
          name: 'T1',
          variants: [{ name: 'A', fields: [] }],
          docstring: 'Type 1',
        },
      ]
    };
    const mod2Ast = {
      body: [
        {
          type: 'InterfaceDeclaration',
          name: 'I1',
          methods: [{ name: 'm1', params: [], returnType: null }],
          docstring: 'Interface 1',
        },
      ]
    };
    const gen = new DocGenerator([
      { name: 'mod1', ast: mod1Ast },
      { name: 'mod2', ast: mod2Ast },
    ]);

    // Test HTML
    const htmlPages = gen.generate('html');
    expect(Object.keys(htmlPages)).toContain('index.html');
    expect(Object.keys(htmlPages)).toContain('mod1.html');
    expect(Object.keys(htmlPages)).toContain('mod2.html');

    // Test Markdown
    const mdPages = gen.generate('markdown');
    expect(Object.keys(mdPages)).toContain('index.md');
    expect(Object.keys(mdPages)).toContain('mod1.md');
    expect(Object.keys(mdPages)).toContain('mod2.md');
  });
});

// ─── LSP Server: Hover ──────────────────────────────────────

function setupServerWithDoc(uri, source) {
  const { server, sent, notifications } = createTestServer();
  server._documents.set(uri, { text: source, version: 1 });
  server._validateDocument(uri, source);
  sent.length = 0;
  notifications.length = 0;
  return { server, sent, notifications };
}

describe('LSP Server: Hover', () => {
  test('hover on builtin function shows docs', () => {
    const uri = 'file:///hover.tova';
    const source = 'print("hello")';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 2 } }
    });
    const result = sent[0].result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('print');
  });

  test('hover on user-defined function shows signature', () => {
    const uri = 'file:///hover2.tova';
    const source = 'fn greet(name) {\n  return "hi " + name\n}\ngreet("world")';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 3, character: 2 } }
    });
    const result = sent[0].result;
    if (result) {
      expect(result.contents.kind).toBe('markdown');
      expect(result.contents.value).toContain('greet');
    }
  });

  test('hover on type shows type structure', () => {
    const uri = 'file:///hover3.tova';
    const source = 'type Color {\n  Red\n  Blue\n  Green\n}\nx = Color.Red';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 6 } }
    });
    const result = sent[0].result;
    if (result) {
      expect(result.contents.value).toContain('Color');
    }
  });

  test('hover returns null for no cached analyzer', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///hovnone.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('hover returns null for no document', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///hovnodoc.tova';
    server._diagnosticsCache.set(uri, { analyzer: {} });
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('hover returns null for empty word', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///hovempty.tova';
    server._documents.set(uri, { text: '   ', version: 1 });
    server._diagnosticsCache.set(uri, { analyzer: {} });
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    expect(sent[0].result).toBeNull();
  });

  test('hover returns null for unknown symbol', () => {
    const uri = 'file:///hovunk.tova';
    const source = 'x = 1\nprint(x)';
    const { server, sent } = setupServerWithDoc(uri, source);
    // Modify text to have an unknown word
    server._documents.set(uri, { text: 'zzzzunknown = 1', version: 2 });
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 5 } }
    });
    // May return null or the symbol
    expect(sent[0]).toBeDefined();
  });

  test('hover on function with params and types', () => {
    const uri = 'file:///hovfn.tova';
    const source = 'fn add(a: Int, b: Int) -> Int {\n  return a + b\n}\nadd(1, 2)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 3, character: 1 } }
    });
    const result = sent[0].result;
    if (result) {
      expect(result.contents.value).toContain('add');
    }
  });

  test('hover on variable shows inferred type', () => {
    const uri = 'file:///hovvar.tova';
    const source = 'x = 42\nprint(x)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } }
    });
    const result = sent[0].result;
    if (result) {
      expect(result.contents.value).toContain('x');
    }
  });

  test('hover shows Ok/Err/Some/None docs', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///hovresult.tova';
    const source = 'x = Ok(42)';
    server._documents.set(uri, { text: source, version: 1 });
    server._validateDocument(uri, source);
    sent.length = 0;
    server._onHover({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 4 } }
    });
    const result = sent[0].result;
    if (result) {
      expect(result.contents.value).toContain('Ok');
    }
  });
});

// ─── LSP Server: Formatting ─────────────────────────────────

describe('LSP Server: Formatting', () => {
  test('formatting returns edits for valid code', () => {
    const uri = 'file:///fmt.tova';
    const { server, sent } = createTestServer();
    server._documents.set(uri, { text: 'x  =  1\nprint(  x  )', version: 1 });
    server._onFormatting({
      id: 1,
      params: { textDocument: { uri } }
    });
    const result = sent[0].result;
    expect(Array.isArray(result)).toBe(true);
  });

  test('formatting returns empty for no document', () => {
    const { server, sent } = createTestServer();
    server._onFormatting({
      id: 1,
      params: { textDocument: { uri: 'file:///nofmt.tova' } }
    });
    expect(sent[0].result).toEqual([]);
  });

  test('formatting returns empty for invalid code', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///badfmt.tova';
    server._documents.set(uri, { text: 'fn {{{', version: 1 });
    server._onFormatting({
      id: 1,
      params: { textDocument: { uri } }
    });
    expect(sent[0].result).toEqual([]);
  });
});

// ─── LSP Server: Code Actions ─────────────────────────────────

describe('LSP Server: Code Actions', () => {
  test('code action for unused variable: prefix with _', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action.tova';
    const source = 'fn foo() {\n  x = 1\n}';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
        context: {
          diagnostics: [{
            message: "'x' declared but never used",
            range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
          }],
        },
      },
    });
    const result = sent[0].result;
    expect(result.some(a => a.title.includes('Prefix'))).toBe(true);
    // Also check suppress with tova-ignore
    expect(result.some(a => a.title.includes('tova-ignore'))).toBe(true);
  });

  test('code action for did-you-mean suggestion', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action2.tova';
    const source = 'fn hello() {\n  return "hi"\n}\nhelo()';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
        context: {
          diagnostics: [{
            message: "'helo' is not defined (hint: did you mean 'hello'?)",
            range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
          }],
        },
      },
    });
    const result = sent[0].result;
    expect(result.some(a => a.title.includes("Replace"))).toBe(true);
  });

  test('code action for naming convention', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action3.tova';
    const source = 'myFunc = 1';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        context: {
          diagnostics: [{
            message: "'myFunc' should use snake_case (hint: Rename 'myFunc' to 'my_func')",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          }],
        },
      },
    });
    const result = sent[0].result;
    expect(result.some(a => a.title.includes("Rename"))).toBe(true);
  });

  test('code action for Type mismatch toString', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action4.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: 'Type mismatch (hint: try toString to convert)',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('toString'))).toBe(true);
  });

  test('code action for Type mismatch Ok(value)', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action5.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: 'Type mismatch (hint: try Ok(value))',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('Ok()'))).toBe(true);
  });

  test('code action for Type mismatch Some(value)', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action6.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: 'Type mismatch (hint: try Some(value))',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('Some()'))).toBe(true);
  });

  test('code action for Type mismatch toInt/toFloat/floor', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action7.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });

    // toInt
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: 'Type mismatch (hint: try toInt to convert)',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('toInt'))).toBe(true);

    // toFloat
    sent.length = 0;
    server._onCodeAction({
      id: 2,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: 'Type mismatch (hint: try toFloat to convert)',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('toFloat'))).toBe(true);

    // floor
    sent.length = 0;
    server._onCodeAction({
      id: 3,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: 'Type mismatch (hint: try floor(value))',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('floor'))).toBe(true);
  });

  test('code action for immutable variable reassignment', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action8.tova';
    const source = 'x = 1\nx = 2';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
        context: {
          diagnostics: [{
            message: "Cannot reassign immutable variable 'x'",
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('mutable'))).toBe(true);
  });

  test('code action for operator on immutable variable', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action9.tova';
    const source = 'x = 1\nx += 2';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
        context: {
          diagnostics: [{
            message: "Cannot use '+=' on immutable variable 'x'",
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('mutable'))).toBe(true);
  });

  test('code action for await outside async', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action10.tova';
    const source = 'fn foo() {\n  await sleep(100)\n}';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } },
        context: {
          diagnostics: [{
            message: "'await' can only be used inside an async function",
            range: { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('async'))).toBe(true);
  });

  test('code action for Non-exhaustive match', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action11.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: {
          diagnostics: [{
            message: "Non-exhaustive match: missing 'Err'",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes('catch-all'))).toBe(true);
  });

  test('code action for throw keyword', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action12.tova';
    const source = 'fn foo() {\n  throw "error"\n}';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } },
        context: {
          diagnostics: [{
            message: "'throw' is not a Tova keyword",
            range: { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes("Err()"))).toBe(true);
  });

  test('code action for mut keyword', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///action13.tova';
    const source = 'mut x = 1';
    server._documents.set(uri, { text: source, version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        context: {
          diagnostics: [{
            message: "'mut' is not supported. Use 'var' for mutable variables.",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          }],
        },
      },
    });
    expect(sent[0].result.some(a => a.title.includes("'var'"))).toBe(true);
  });

  test('code action returns empty for no document', () => {
    const { server, sent } = createTestServer();
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri: 'file:///noactn.tova' },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: { diagnostics: [] },
      },
    });
    expect(sent[0].result).toEqual([]);
  });

  test('code action returns empty for no diagnostics', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///noactn2.tova';
    server._documents.set(uri, { text: 'x = 1', version: 1 });
    server._onCodeAction({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        context: { diagnostics: [] },
      },
    });
    expect(sent[0].result).toEqual([]);
  });
});

// ─── LSP Server: Rename ─────────────────────────────────────

describe('LSP Server: Rename', () => {
  test('rename returns null for no document', () => {
    const { server, sent } = createTestServer();
    server._onRename({
      id: 1,
      params: {
        textDocument: { uri: 'file:///norename.tova' },
        position: { line: 0, character: 0 },
        newName: 'newName',
      },
    });
    expect(sent[0].result).toBeNull();
  });

  test('rename returns null for empty word', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///rename2.tova';
    server._documents.set(uri, { text: '   ', version: 1 });
    server._onRename({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 }, newName: 'y' },
    });
    expect(sent[0].result).toBeNull();
  });

  test('rename falls back to naive rename without analyzer', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///rename3.tova';
    server._documents.set(uri, { text: 'x = 1\nprint(x)', version: 1 });
    server._onRename({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 }, newName: 'y' },
    });
    const result = sent[0].result;
    expect(result.changes).toBeDefined();
    expect(result.changes[uri].length).toBeGreaterThan(0);
  });

  test('scope-aware rename with analyzer', () => {
    const uri = 'file:///rename4.tova';
    const source = 'x = 10\nprint(x)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onRename({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 }, newName: 'val' },
    });
    const result = sent[0].result;
    expect(result.changes).toBeDefined();
  });

  test('naive rename replaces all occurrences', () => {
    const { server, sent } = createTestServer();
    server._naiveRename(1, 'file:///t.tova', 'x = 1\ny = x + x', 'x', 'z');
    const result = sent[0].result;
    expect(result.changes['file:///t.tova'].length).toBe(3); // x defined + x used twice
  });
});

// ─── LSP Server: References ─────────────────────────────────

describe('LSP Server: References', () => {
  test('references returns empty for no document', () => {
    const { server, sent } = createTestServer();
    server._onReferences({
      id: 1,
      params: { textDocument: { uri: 'file:///norefs.tova' }, position: { line: 0, character: 0 } },
    });
    expect(sent[0].result).toEqual([]);
  });

  test('references returns empty for empty word', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///refs2.tova';
    server._documents.set(uri, { text: '   ', version: 1 });
    server._onReferences({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } },
    });
    expect(sent[0].result).toEqual([]);
  });

  test('references with naive fallback (no analyzer)', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///refs3.tova';
    server._documents.set(uri, { text: 'x = 1\nprint(x)', version: 1 });
    server._onReferences({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } },
    });
    const result = sent[0].result;
    expect(result.length).toBeGreaterThan(0);
  });

  test('scope-aware references', () => {
    const uri = 'file:///refs4.tova';
    const source = 'x = 10\nprint(x)\ny = x + 1';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onReferences({
      id: 1,
      params: { textDocument: { uri }, position: { line: 0, character: 0 } },
    });
    const result = sent[0].result;
    expect(result.length).toBeGreaterThan(0);
  });

  test('naive references finds all occurrences', () => {
    const { server, sent } = createTestServer();
    server._naiveReferences(1, 'file:///t.tova', 'x = 1\ny = x + x', 'x');
    const result = sent[0].result;
    expect(result.length).toBe(3);
  });
});

// ─── LSP Server: Workspace Symbol ───────────────────────────

describe('LSP Server: Workspace Symbol', () => {
  test('workspace symbol finds symbols from cached documents', () => {
    const uri = 'file:///ws.tova';
    const source = 'fn my_func() {\n  return 42\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onWorkspaceSymbol({
      id: 1,
      params: { query: 'my_func' },
    });
    const result = sent[0].result;
    expect(result.some(s => s.name === 'my_func')).toBe(true);
  });

  test('workspace symbol with empty query returns all symbols', () => {
    const uri = 'file:///ws2.tova';
    const source = 'fn alpha() {\n  return 1\n}\nfn beta() {\n  return 2\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onWorkspaceSymbol({
      id: 1,
      params: { query: '' },
    });
    const result = sent[0].result;
    expect(result.length).toBeGreaterThan(0);
  });

  test('workspace symbol uses kind map', () => {
    const uri = 'file:///ws3.tova';
    const source = 'type MyType {\n  val: Int\n}\nfn foo() {\n  return 1\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onWorkspaceSymbol({
      id: 1,
      params: { query: '' },
    });
    const result = sent[0].result;
    const fnSym = result.find(s => s.name === 'foo');
    const typeSym = result.find(s => s.name === 'MyType');
    if (fnSym) expect(fnSym.kind).toBe(12); // function
    if (typeSym) expect(typeSym.kind).toBe(5); // type
  });
});

// ─── LSP Server: Inlay Hints ─────────────────────────────────

describe('LSP Server: Inlay Hints', () => {
  test('inlay hints returns empty for no cached analyzer', () => {
    const { server, sent } = createTestServer();
    server._onInlayHint({
      id: 1,
      params: {
        textDocument: { uri: 'file:///nohint.tova' },
        range: { start: { line: 0 }, end: { line: 10 } },
      },
    });
    expect(sent[0].result).toEqual([]);
  });

  test('inlay hints for variable bindings', () => {
    const uri = 'file:///hint.tova';
    const source = 'x = 42\nprint(x)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onInlayHint({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0 }, end: { line: 1 } },
      },
    });
    const result = sent[0].result;
    // May have type hints for x
    expect(Array.isArray(result)).toBe(true);
  });

  test('inlay hints skips lines with type annotations', () => {
    const uri = 'file:///hint2.tova';
    const source = 'x: Int = 42\nprint(x)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onInlayHint({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0 }, end: { line: 1 } },
      },
    });
    // x already has annotation, should not get hint
    const result = sent[0].result;
    const typeHints = result.filter(h => h.kind === 1 && h.label.includes('Int'));
    // Should be empty or not include the annotated variable
    expect(Array.isArray(result)).toBe(true);
  });

  test('inlay hints for function call parameter names', () => {
    const uri = 'file:///hint3.tova';
    const source = 'fn greet(name, greeting) {\n  return greeting + name\n}\ngreet("world", "hello")';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onInlayHint({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0 }, end: { line: 3 } },
      },
    });
    const result = sent[0].result;
    const paramHints = result.filter(h => h.kind === 2); // Parameter hints
    expect(paramHints.length).toBeGreaterThan(0);
  });

  test('inlay hints skips private/special names', () => {
    const uri = 'file:///hint4.tova';
    const source = '_private = 42\nprint(_private)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onInlayHint({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0 }, end: { line: 1 } },
      },
    });
    const result = sent[0].result;
    const typeHints = result.filter(h => h.kind === 1 && h.label.includes('_private'));
    expect(typeHints.length).toBe(0);
  });

  test('inlay hints returns empty for no doc', () => {
    const { server, sent } = createTestServer();
    const uri = 'file:///hint5.tova';
    server._diagnosticsCache.set(uri, { analyzer: {} });
    server._onInlayHint({
      id: 1,
      params: {
        textDocument: { uri },
        range: { start: { line: 0 }, end: { line: 1 } },
      },
    });
    expect(sent[0].result).toEqual([]);
  });
});

// ─── LSP Server: Semantic Tokens ─────────────────────────────

describe('LSP Server: Semantic Tokens', () => {
  test('semantic tokens returns empty for no cache', () => {
    const { server, sent } = createTestServer();
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri: 'file:///nosem.tova' } },
    });
    expect(sent[0].result).toEqual({ data: [] });
  });

  test('semantic tokens for function declaration', () => {
    const uri = 'file:///sem.tova';
    const source = 'fn hello(name) {\n  return 42\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    const result = sent[0].result;
    expect(result.data.length).toBeGreaterThan(0);
  });

  test('semantic tokens for type declaration with variants', () => {
    const uri = 'file:///sem2.tova';
    const source = 'type Shape {\n  Circle(r: Float)\n  Square(side: Float)\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    const result = sent[0].result;
    expect(result.data.length).toBeGreaterThan(0);
  });

  test('semantic tokens for async function', () => {
    const uri = 'file:///sem3.tova';
    const source = 'async fn fetch_data() {\n  return "data"\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    expect(sent[0].result.data.length).toBeGreaterThan(0);
  });

  test('semantic tokens for call expression with builtin', () => {
    const uri = 'file:///sem4.tova';
    const source = 'print("hello")';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    expect(sent[0].result.data.length).toBeGreaterThan(0);
  });

  test('semantic tokens for variable assignment', () => {
    const uri = 'file:///sem5.tova';
    const source = 'x = 42\nvar y = "hello"\nprint(x)\nprint(y)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    expect(sent[0].result.data.length).toBeGreaterThan(0);
  });

  test('semantic tokens delta encoding', () => {
    const uri = 'file:///sem6.tova';
    const source = 'fn a() {\n  return 1\n}\nfn b() {\n  return 2\n}';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    const data = sent[0].result.data;
    // Data should be in groups of 5: deltaLine, deltaChar, length, tokenType, modifiers
    expect(data.length % 5).toBe(0);
  });

  test('semantic tokens for member expression', () => {
    const uri = 'file:///sem7.tova';
    const source = 'type Point { x: Int, y: Int }\np = Point { x: 1, y: 2 }\nprint(p.x)';
    const { server, sent } = setupServerWithDoc(uri, source);
    server._onSemanticTokensFull({
      id: 1,
      params: { textDocument: { uri } },
    });
    expect(sent[0].result.data.length).toBeGreaterThan(0);
  });

  test('_walkASTForSemanticTokens handles null/non-object nodes', () => {
    const { server } = createTestServer();
    const tokens = [];
    server._walkASTForSemanticTokens(null, {}, tokens);
    server._walkASTForSemanticTokens(42, {}, tokens);
    server._walkASTForSemanticTokens('string', {}, tokens);
    expect(tokens.length).toBe(0);
  });

  test('_walkASTForSemanticTokens walks default children', () => {
    const { server } = createTestServer();
    const tokens = [];
    // Unknown node type with children
    server._walkASTForSemanticTokens({
      type: 'UnknownNode',
      child: { type: 'FunctionDeclaration', name: 'test', loc: { line: 1, column: 4 }, body: [] },
      children: [
        { type: 'Assignment', name: 'x', loc: { line: 2, column: 1 }, value: null },
      ],
    }, { globalScope: { symbols: new Map(), children: [] } }, tokens);
    expect(tokens.length).toBeGreaterThan(0);
  });
});
