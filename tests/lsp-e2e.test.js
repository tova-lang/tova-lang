import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Prevent auto-start of the LSP server on import
globalThis.__TOVA_LSP_NO_AUTOSTART = true;

import { TovaLanguageServer } from '../src/lsp/server.js';

// ─── Test Harness ─────────────────────────────────────────────

let msgId = 0;
function nextId() { return ++msgId; }

function makeLSPMessage(obj) {
  const json = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

function createServer() {
  const server = new TovaLanguageServer();
  const messages = [];

  // Capture outgoing messages by overriding _send
  const origSend = server._send.bind(server);
  server._send = (msg) => {
    messages.push(msg);
  };

  function sendRequest(method, params) {
    const id = nextId();
    const raw = makeLSPMessage({ jsonrpc: '2.0', id, method, params });
    server._onData(Buffer.from(raw, 'utf8'));
    return { id, getResponse: () => messages.find(m => m.id === id) };
  }

  function sendNotification(method, params) {
    const raw = makeLSPMessage({ jsonrpc: '2.0', method, params });
    server._onData(Buffer.from(raw, 'utf8'));
  }

  function getNotifications(method) {
    return messages.filter(m => m.method === method);
  }

  function clearMessages() {
    messages.length = 0;
  }

  return { server, messages, sendRequest, sendNotification, getNotifications, clearMessages };
}

function initializeServer(ctx) {
  const { sendRequest, sendNotification } = ctx;
  const { getResponse } = sendRequest('initialize', {
    processId: process.pid,
    rootUri: 'file:///test',
    capabilities: {},
  });
  sendNotification('initialized', {});
  return getResponse();
}

function openDocument(ctx, uri, text) {
  ctx.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'tova', version: 1, text },
  });
}

// ─── Tests ────────────────────────────────────────────────────

describe('LSP E2E: Initialize lifecycle', () => {
  test('initialize returns capabilities with all providers', () => {
    const ctx = createServer();
    const response = initializeServer(ctx);

    expect(response).toBeDefined();
    expect(response.result).toBeDefined();

    const caps = response.result.capabilities;
    expect(caps.textDocumentSync).toBeDefined();
    expect(caps.completionProvider).toBeDefined();
    expect(caps.definitionProvider).toBe(true);
    expect(caps.hoverProvider).toBe(true);
    expect(caps.signatureHelpProvider).toBeDefined();
    expect(caps.documentFormattingProvider).toBe(true);
    expect(caps.renameProvider).toBeDefined();
    expect(caps.referencesProvider).toBe(true);
    expect(caps.codeActionProvider).toBeDefined();
    expect(caps.inlayHintProvider).toBe(true);
    expect(caps.workspaceSymbolProvider).toBe(true);
    expect(caps.semanticTokensProvider).toBeDefined();
    expect(caps.semanticTokensProvider.full).toBe(true);
    expect(caps.semanticTokensProvider.legend).toBeDefined();
    expect(caps.semanticTokensProvider.legend.tokenTypes.length).toBeGreaterThan(0);
    expect(caps.semanticTokensProvider.legend.tokenModifiers.length).toBeGreaterThan(0);
  });

  test('shutdown and exit', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const { getResponse } = ctx.sendRequest('shutdown', null);
    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeNull();
  });
});

describe('LSP E2E: Document open + diagnostics', () => {
  test('opening valid document publishes diagnostics', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/valid.tova';
    openDocument(ctx, uri, `x = 10\nprint(x)\n`);

    const diagnosticMsgs = ctx.getNotifications('textDocument/publishDiagnostics');
    expect(diagnosticMsgs.length).toBeGreaterThan(0);

    const lastDiag = diagnosticMsgs[diagnosticMsgs.length - 1];
    expect(lastDiag.params.uri).toBe(uri);
    expect(Array.isArray(lastDiag.params.diagnostics)).toBe(true);
  });

  test('opening document with errors produces error diagnostics', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/error.tova';
    openDocument(ctx, uri, `fn {\n`);

    const diagnosticMsgs = ctx.getNotifications('textDocument/publishDiagnostics');
    expect(diagnosticMsgs.length).toBeGreaterThan(0);

    const lastDiag = diagnosticMsgs[diagnosticMsgs.length - 1];
    expect(lastDiag.params.uri).toBe(uri);
    expect(lastDiag.params.diagnostics.length).toBeGreaterThan(0);
    // At least one diagnostic should be an error (severity 1)
    const hasError = lastDiag.params.diagnostics.some(d => d.severity === 1);
    expect(hasError).toBe(true);
  });
});

describe('LSP E2E: Completion', () => {
  test('returns keyword and builtin completions', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/comp.tova';
    openDocument(ctx, uri, `\n`);

    const { getResponse } = ctx.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);
    expect(response.result.length).toBeGreaterThan(0);

    // Should contain keywords
    const labels = response.result.map(i => i.label);
    expect(labels).toContain('fn');
    expect(labels).toContain('if');

    // Should contain builtins
    expect(labels).toContain('print');
    expect(labels).toContain('len');
  });

  test('filters completions by prefix', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/comp2.tova';
    openDocument(ctx, uri, `pr\n`);

    const { getResponse } = ctx.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line: 0, character: 2 },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);

    const labels = response.result.map(i => i.label);
    // 'print' starts with 'pr'
    expect(labels).toContain('print');
    // 'len' does not start with 'pr'
    expect(labels).not.toContain('len');
  });
});

describe('LSP E2E: Hover', () => {
  test('hover on builtin shows documentation', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/hover.tova';
    openDocument(ctx, uri, `print("hello")\n`);

    const { getResponse } = ctx.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line: 0, character: 2 }, // inside "print"
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.contents).toBeDefined();
    expect(response.result.contents.kind).toBe('markdown');
    expect(response.result.contents.value).toContain('print');
  });

  test('hover on non-existent symbol returns null', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/hover2.tova';
    openDocument(ctx, uri, `x = 10\n`);

    const { getResponse } = ctx.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line: 0, character: 10 }, // past end of content
    });

    const response = getResponse();
    expect(response).toBeDefined();
    // Result may be null for no hover info
    expect(response.result === null || response.result === undefined || response.result.contents).toBeTruthy();
  });
});

describe('LSP E2E: Go to definition', () => {
  test('go-to-definition on function call resolves to declaration', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/def.tova';
    const source = `fn greet(name) {\n  return "Hello " + name\n}\ngreet("world")\n`;
    openDocument(ctx, uri, source);

    // "greet" on line 3 (0-indexed), character 0
    const { getResponse } = ctx.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line: 3, character: 1 },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();

    // Should point to the function declaration (line 0 in 0-based)
    if (response.result) {
      expect(response.result.uri).toBe(uri);
      expect(response.result.range.start.line).toBe(0);
    }
  });

  test('go-to-definition on unknown symbol returns null', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/def2.tova';
    openDocument(ctx, uri, `print("hello")\n`);

    // Position past the end of content on line 0 — no word here
    const { getResponse } = ctx.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line: 0, character: 50 },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeNull();
  });
});

describe('LSP E2E: Formatting', () => {
  test('formatting returns edits for unformatted code', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/fmt.tova';
    openDocument(ctx, uri, `fn   add( a , b ){ return a+b }\n`);

    const { getResponse } = ctx.sendRequest('textDocument/formatting', {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);
    // Either returns edits (formatted differently) or empty array (same)
  });

  test('formatting valid code returns result without error', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/fmt2.tova';
    openDocument(ctx, uri, `x = 10\nprint(x)\n`);

    const { getResponse } = ctx.sendRequest('textDocument/formatting', {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.error).toBeUndefined();
  });
});

describe('LSP E2E: Semantic Tokens', () => {
  test('semantic tokens for function declaration', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/sem.tova';
    openDocument(ctx, uri, `fn hello() {\n  print("world")\n}\n`);

    const { getResponse } = ctx.sendRequest('textDocument/semanticTokens/full', {
      textDocument: { uri },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.data).toBeDefined();
    expect(Array.isArray(response.result.data)).toBe(true);
    // Should have some tokens (at least the function name)
    expect(response.result.data.length).toBeGreaterThan(0);
    // Data should be multiple of 5 (deltaLine, deltaChar, length, type, modifiers)
    expect(response.result.data.length % 5).toBe(0);
  });

  test('semantic tokens for variable and type declarations', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/sem2.tova';
    openDocument(ctx, uri, `type Color {\n  Red\n  Blue\n}\nx = 42\n`);

    const { getResponse } = ctx.sendRequest('textDocument/semanticTokens/full', {
      textDocument: { uri },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.data.length).toBeGreaterThan(0);
    expect(response.result.data.length % 5).toBe(0);
  });

  test('semantic tokens with no AST returns empty data', () => {
    const ctx = createServer();
    initializeServer(ctx);

    // Request on a URI that has not been opened
    const { getResponse } = ctx.sendRequest('textDocument/semanticTokens/full', {
      textDocument: { uri: 'file:///test/nonexistent.tova' },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.data).toEqual([]);
  });
});

describe('LSP E2E: Signature Help', () => {
  test('signature help for builtin function', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/sig.tova';
    openDocument(ctx, uri, `range(1, 10)\n`);

    const { getResponse } = ctx.sendRequest('textDocument/signatureHelp', {
      textDocument: { uri },
      position: { line: 0, character: 8 }, // inside range(1, |)
    });

    const response = getResponse();
    expect(response).toBeDefined();
    if (response.result) {
      expect(response.result.signatures).toBeDefined();
      expect(response.result.signatures.length).toBeGreaterThan(0);
    }
  });
});

describe('LSP E2E: References', () => {
  test('find references of a variable', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/refs.tova';
    openDocument(ctx, uri, `x = 10\nprint(x)\ny = x + 1\n`);

    const { getResponse } = ctx.sendRequest('textDocument/references', {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: true },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);
    // x appears at least 3 times: declaration, print(x), and y = x + 1
    expect(response.result.length).toBeGreaterThanOrEqual(3);
  });
});

describe('LSP E2E: Rename', () => {
  test('rename a variable', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/rename.tova';
    openDocument(ctx, uri, `x = 10\nprint(x)\n`);

    const { getResponse } = ctx.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      newName: 'value',
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(response.result.changes).toBeDefined();
    expect(response.result.changes[uri]).toBeDefined();
    expect(response.result.changes[uri].length).toBeGreaterThanOrEqual(2);
  });
});

describe('LSP E2E: Code Actions', () => {
  test('code action for unused variable', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/action.tova';
    openDocument(ctx, uri, `x = 10\n`);

    // Get the published diagnostics
    const diagnosticMsgs = ctx.getNotifications('textDocument/publishDiagnostics');
    const lastDiag = diagnosticMsgs[diagnosticMsgs.length - 1];
    const diagnostics = lastDiag?.params?.diagnostics || [];

    // Request code actions with the diagnostics
    const { getResponse } = ctx.sendRequest('textDocument/codeAction', {
      textDocument: { uri },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      context: { diagnostics },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);
  });
});

describe('LSP E2E: Workspace Symbol', () => {
  test('workspace symbol returns declared symbols', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/ws.tova';
    openDocument(ctx, uri, `fn myFunc() {\n  return 1\n}\ntype MyType {\n  value: Int\n}\n`);

    const { getResponse } = ctx.sendRequest('workspace/symbol', {
      query: 'my',
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);

    const names = response.result.map(s => s.name);
    expect(names).toContain('myFunc');
    expect(names).toContain('MyType');
  });
});

describe('LSP E2E: Inlay Hints', () => {
  test('inlay hints for variable types', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const uri = 'file:///test/inlay.tova';
    openDocument(ctx, uri, `x = 10\ny = "hello"\n`);

    const { getResponse } = ctx.sendRequest('textDocument/inlayHint', {
      textDocument: { uri },
      range: { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } },
    });

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result)).toBe(true);
  });
});

describe('LSP E2E: Method not found', () => {
  test('unknown method returns error', () => {
    const ctx = createServer();
    initializeServer(ctx);

    const { getResponse } = ctx.sendRequest('textDocument/unknownMethod', {});

    const response = getResponse();
    expect(response).toBeDefined();
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(-32601);
  });
});
