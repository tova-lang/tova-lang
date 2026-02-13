#!/usr/bin/env bun
// Lux Language Server Protocol implementation
// Communicates via JSON-RPC over stdio

import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Analyzer } from '../analyzer/analyzer.js';
import { TokenType } from '../lexer/tokens.js';
import { Formatter } from '../formatter/formatter.js';

class LuxLanguageServer {
  constructor() {
    this._buffer = '';
    this._documents = new Map(); // uri -> { text, version }
    this._diagnosticsCache = new Map(); // uri -> { ast, analyzer, errors }
    this._initialized = false;
    this._capabilities = {};
  }

  start() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => this._onData(chunk));
    process.stdin.on('end', () => process.exit(0));
  }

  // ─── JSON-RPC Transport ────────────────────────────────────

  _onData(chunk) {
    this._buffer += chunk;
    while (true) {
      const headerEnd = this._buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this._buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this._buffer = this._buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1]);
      const start = headerEnd + 4;
      if (this._buffer.length < start + contentLength) break;

      const body = this._buffer.slice(start, start + contentLength);
      this._buffer = this._buffer.slice(start + contentLength);

      try {
        const message = JSON.parse(body);
        this._handleMessage(message);
      } catch (e) {
        this._logError(`Parse error: ${e.message}`);
      }
    }
  }

  _send(message) {
    const json = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
    process.stdout.write(header + json);
  }

  _respond(id, result) {
    this._send({ jsonrpc: '2.0', id, result });
  }

  _respondError(id, code, message) {
    this._send({ jsonrpc: '2.0', id, error: { code, message } });
  }

  _notify(method, params) {
    this._send({ jsonrpc: '2.0', method, params });
  }

  _logError(msg) {
    this._notify('window/logMessage', { type: 1, message: `[lux-lsp] ${msg}` });
  }

  _logInfo(msg) {
    this._notify('window/logMessage', { type: 3, message: `[lux-lsp] ${msg}` });
  }

  // ─── Message Routing ──────────────────────────────────────

  _handleMessage(msg) {
    const method = msg.method;

    if (msg.id !== undefined && method) {
      // Request
      switch (method) {
        case 'initialize': return this._onInitialize(msg);
        case 'shutdown': return this._respond(msg.id, null);
        case 'textDocument/completion': return this._onCompletion(msg);
        case 'textDocument/definition': return this._onDefinition(msg);
        case 'textDocument/hover': return this._onHover(msg);
        case 'textDocument/signatureHelp': return this._onSignatureHelp(msg);
        case 'textDocument/formatting': return this._onFormatting(msg);
        case 'textDocument/rename': return this._onRename(msg);
        case 'textDocument/references': return this._onReferences(msg);
        case 'workspace/symbol': return this._onWorkspaceSymbol(msg);
        default: return this._respondError(msg.id, -32601, `Method not found: ${method}`);
      }
    } else if (method) {
      // Notification
      switch (method) {
        case 'initialized': return this._onInitialized();
        case 'exit': return process.exit(0);
        case 'textDocument/didOpen': return this._onDidOpen(msg.params);
        case 'textDocument/didChange': return this._onDidChange(msg.params);
        case 'textDocument/didClose': return this._onDidClose(msg.params);
        case 'textDocument/didSave': return this._onDidSave(msg.params);
      }
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────

  _onInitialize(msg) {
    this._initialized = true;
    this._respond(msg.id, {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: 1, // Full content sync
          save: { includeText: true },
        },
        completionProvider: {
          triggerCharacters: ['.', '"', "'", '/', '<'],
          resolveProvider: false,
        },
        definitionProvider: true,
        hoverProvider: true,
        signatureHelpProvider: {
          triggerCharacters: ['(', ','],
        },
        documentFormattingProvider: true,
        renameProvider: { prepareProvider: false },
        referencesProvider: true,
        workspaceSymbolProvider: true,
      },
    });
  }

  _onInitialized() {
    this._logInfo('Lux Language Server initialized');
  }

  // ─── Document Management ──────────────────────────────────

  _onDidOpen(params) {
    const { uri, text, version } = params.textDocument;
    this._documents.set(uri, { text, version });
    this._validateDocument(uri, text);
  }

  _onDidChange(params) {
    const { uri, version } = params.textDocument;
    const text = params.contentChanges[0]?.text;
    if (text !== undefined) {
      this._documents.set(uri, { text, version });
      this._validateDocument(uri, text);
    }
  }

  _onDidClose(params) {
    const uri = params.textDocument.uri;
    this._documents.delete(uri);
    this._diagnosticsCache.delete(uri);
    // Clear diagnostics
    this._notify('textDocument/publishDiagnostics', { uri, diagnostics: [] });
  }

  _onDidSave(params) {
    const uri = params.textDocument.uri;
    const text = params.text || this._documents.get(uri)?.text;
    if (text) {
      this._validateDocument(uri, text);
    }
  }

  // ─── Diagnostics ──────────────────────────────────────────

  _validateDocument(uri, text) {
    const diagnostics = [];
    const filename = this._uriToPath(uri);

    try {
      const lexer = new Lexer(text, filename);
      const tokens = lexer.tokenize();

      const parser = new Parser(tokens, filename);
      const ast = parser.parse();

      const analyzer = new Analyzer(ast, filename);
      const { warnings } = analyzer.analyze();

      // Cache for go-to-definition
      this._diagnosticsCache.set(uri, { ast, analyzer, text });

      // Convert warnings to diagnostics
      for (const w of warnings) {
        diagnostics.push({
          range: {
            start: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 },
            end: { line: (w.line || 1) - 1, character: (w.column || 1) + 10 },
          },
          severity: 2, // Warning
          source: 'lux',
          message: w.message,
        });
      }
    } catch (err) {
      // Multi-error support from parser recovery
      const errors = err.errors || [err];
      for (const e of errors) {
        const loc = e.loc || this._extractErrorLocation(e.message, filename);
        diagnostics.push({
          range: {
            start: { line: (loc?.line || 1) - 1, character: (loc?.column || 1) - 1 },
            end: { line: (loc?.line || 1) - 1, character: 1000 },
          },
          severity: 1, // Error
          source: 'lux',
          message: loc?.message || e.message,
        });
      }

      // Use partial AST for go-to-definition even when there are errors
      if (err.partialAST) {
        this._diagnosticsCache.set(uri, { ast: err.partialAST, text });
      }
    }

    this._notify('textDocument/publishDiagnostics', { uri, diagnostics });
  }

  _extractErrorLocation(message, filename) {
    // Try "file:line:column — message" format
    const match = message.match(/^(.+?):(\d+):(\d+)\s*[—-]\s*(.+)/);
    if (match) {
      return { file: match[1], line: parseInt(match[2]), column: parseInt(match[3]), message: match[4] };
    }
    // Try "Analysis errors:" format
    if (message.startsWith('Analysis errors:')) {
      const lines = message.split('\n');
      for (const line of lines) {
        const m = line.trim().match(/^(.+?):(\d+):(\d+)\s*[—-]\s*(.+)/);
        if (m) return { file: m[1], line: parseInt(m[2]), column: parseInt(m[3]), message: m[4] };
      }
    }
    return null;
  }

  // ─── Completion ───────────────────────────────────────────

  _onCompletion(msg) {
    const { position, textDocument } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, []);

    const items = [];
    const line = doc.text.split('\n')[position.line] || '';
    const prefix = line.slice(0, position.character).split(/[^a-zA-Z0-9_]/).pop() || '';

    // Keywords
    const keywords = [
      'fn', 'let', 'if', 'elif', 'else', 'for', 'while', 'in',
      'return', 'match', 'type', 'import', 'from', 'true', 'false',
      'nil', 'server', 'client', 'shared', 'pub', 'mut',
      'try', 'catch', 'finally', 'break', 'continue', 'async', 'await',
      'guard', 'interface', 'derive', 'route', 'model', 'db',
    ];
    for (const kw of keywords) {
      if (kw.startsWith(prefix)) {
        items.push({ label: kw, kind: 14 /* Keyword */ });
      }
    }

    // Built-in functions
    const builtins = [
      'print', 'len', 'range', 'enumerate', 'sum', 'sorted',
      'reversed', 'zip', 'min', 'max', 'type_of', 'filter', 'map',
      'Ok', 'Err', 'Some', 'None',
    ];
    for (const fn of builtins) {
      if (fn.startsWith(prefix)) {
        items.push({ label: fn, kind: 3 /* Function */, detail: 'Lux built-in' });
      }
    }

    // Identifiers from current document's scope
    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (cached?.analyzer) {
      const symbols = this._collectSymbols(cached.analyzer);
      for (const sym of symbols) {
        if (sym.name.startsWith(prefix) && !builtins.includes(sym.name)) {
          items.push({
            label: sym.name,
            kind: sym.kind === 'function' ? 3 : sym.kind === 'type' ? 22 : 6,
            detail: sym.kind,
          });
        }
      }
    }

    this._respond(msg.id, items.slice(0, 50)); // Limit results
  }

  // ─── Go to Definition ────────────────────────────────────

  _onDefinition(msg) {
    const { position, textDocument } = msg.params;
    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (!cached?.analyzer) return this._respond(msg.id, null);

    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, null);

    // Get word at cursor position
    const line = doc.text.split('\n')[position.line] || '';
    const word = this._getWordAt(line, position.character);
    if (!word) return this._respond(msg.id, null);

    // Look up in symbol table
    const symbol = this._findSymbolInScopes(cached.analyzer, word);
    if (symbol?.loc) {
      this._respond(msg.id, {
        uri: textDocument.uri,
        range: {
          start: { line: (symbol.loc.line || 1) - 1, character: (symbol.loc.column || 1) - 1 },
          end: { line: (symbol.loc.line || 1) - 1, character: (symbol.loc.column || 1) - 1 + word.length },
        },
      });
    } else {
      this._respond(msg.id, null);
    }
  }

  // ─── Hover ────────────────────────────────────────────────

  _onHover(msg) {
    const { position, textDocument } = msg.params;
    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (!cached?.analyzer) return this._respond(msg.id, null);

    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, null);

    const line = doc.text.split('\n')[position.line] || '';
    const word = this._getWordAt(line, position.character);
    if (!word) return this._respond(msg.id, null);

    // Check builtins
    const builtinDocs = {
      'print': '`fn print(...args)` — Print values to console',
      'len': '`fn len(v)` — Get length of string, array, or object',
      'range': '`fn range(start, end, step?)` — Generate array of numbers',
      'enumerate': '`fn enumerate(arr)` — Returns [[index, value], ...]',
      'sum': '`fn sum(arr)` — Sum all elements in array',
      'sorted': '`fn sorted(arr, key?)` — Return sorted copy of array',
      'reversed': '`fn reversed(arr)` — Return reversed copy of array',
      'zip': '`fn zip(...arrays)` — Zip arrays together',
      'min': '`fn min(arr)` — Minimum value in array',
      'max': '`fn max(arr)` — Maximum value in array',
      'type_of': '`fn type_of(v)` — Get Lux type name as string',
      'Ok': '`Ok(value)` — Create a successful Result',
      'Err': '`Err(error)` — Create an error Result',
      'Some': '`Some(value)` — Create an Option with a value',
      'None': '`None` — Empty Option value',
    };

    if (builtinDocs[word]) {
      return this._respond(msg.id, {
        contents: { kind: 'markdown', value: builtinDocs[word] },
      });
    }

    // Check user-defined symbols
    const symbol = this._findSymbolInScopes(cached.analyzer, word);
    if (symbol) {
      let doc = `**${word}**`;
      if (symbol.kind) doc += ` *(${symbol.kind})*`;
      if (symbol.typeAnnotation) doc += `\n\nType: \`${symbol.typeAnnotation}\``;
      if (symbol.params) doc += `\n\nParameters: ${symbol.params.join(', ')}`;
      return this._respond(msg.id, {
        contents: { kind: 'markdown', value: doc },
      });
    }

    this._respond(msg.id, null);
  }

  // ─── Signature Help ───────────────────────────────────────

  _onSignatureHelp(msg) {
    const { position, textDocument } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, null);

    const line = doc.text.split('\n')[position.line] || '';
    const before = line.slice(0, position.character);

    // Find function name before (
    const match = before.match(/(\w+)\s*\([^)]*$/);
    if (!match) return this._respond(msg.id, null);

    const funcName = match[1];

    // Built-in signatures
    const signatures = {
      'print': { label: 'print(...args)', params: [{ label: '...args' }] },
      'len': { label: 'len(value)', params: [{ label: 'value' }] },
      'range': { label: 'range(start, end, step?)', params: [{ label: 'start' }, { label: 'end' }, { label: 'step?' }] },
      'enumerate': { label: 'enumerate(array)', params: [{ label: 'array' }] },
      'sum': { label: 'sum(array)', params: [{ label: 'array' }] },
      'sorted': { label: 'sorted(array, key?)', params: [{ label: 'array' }, { label: 'key?' }] },
      'reversed': { label: 'reversed(array)', params: [{ label: 'array' }] },
      'zip': { label: 'zip(...arrays)', params: [{ label: '...arrays' }] },
      'Ok': { label: 'Ok(value)', params: [{ label: 'value' }] },
      'Err': { label: 'Err(error)', params: [{ label: 'error' }] },
      'Some': { label: 'Some(value)', params: [{ label: 'value' }] },
    };

    const sig = signatures[funcName];
    if (sig) {
      // Count commas to determine active parameter
      const afterParen = before.slice(before.lastIndexOf('(') + 1);
      const activeParam = (afterParen.match(/,/g) || []).length;

      return this._respond(msg.id, {
        signatures: [{
          label: sig.label,
          parameters: sig.params.map(p => ({ label: p.label })),
        }],
        activeSignature: 0,
        activeParameter: Math.min(activeParam, sig.params.length - 1),
      });
    }

    // Check user-defined functions
    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (cached?.analyzer) {
      const symbol = this._findSymbolInScopes(cached.analyzer, funcName);
      if (symbol?.params) {
        const afterParen = before.slice(before.lastIndexOf('(') + 1);
        const activeParam = (afterParen.match(/,/g) || []).length;

        return this._respond(msg.id, {
          signatures: [{
            label: `${funcName}(${symbol.params.join(', ')})`,
            parameters: symbol.params.map(p => ({ label: p })),
          }],
          activeSignature: 0,
          activeParameter: Math.min(activeParam, symbol.params.length - 1),
        });
      }
    }

    this._respond(msg.id, null);
  }

  // ─── Formatting ──────────────────────────────────────────

  _onFormatting(msg) {
    const { textDocument } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, []);

    try {
      const lexer = new Lexer(doc.text, this._uriToPath(textDocument.uri));
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, this._uriToPath(textDocument.uri));
      const ast = parser.parse();
      const formatter = new Formatter();
      const formatted = formatter.format(ast);

      if (formatted === doc.text) return this._respond(msg.id, []);

      const lines = doc.text.split('\n');
      this._respond(msg.id, [{
        range: {
          start: { line: 0, character: 0 },
          end: { line: lines.length, character: 0 },
        },
        newText: formatted,
      }]);
    } catch (e) {
      this._respond(msg.id, []);
    }
  }

  // ─── Rename ─────────────────────────────────────────────

  _onRename(msg) {
    const { position, textDocument, newName } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, null);

    const line = doc.text.split('\n')[position.line] || '';
    const oldName = this._getWordAt(line, position.character);
    if (!oldName) return this._respond(msg.id, null);

    // Find all occurrences of the identifier in the document
    const edits = [];
    const docLines = doc.text.split('\n');
    const wordRegex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

    for (let i = 0; i < docLines.length; i++) {
      let match;
      while ((match = wordRegex.exec(docLines[i])) !== null) {
        edits.push({
          range: {
            start: { line: i, character: match.index },
            end: { line: i, character: match.index + oldName.length },
          },
          newText: newName,
        });
      }
    }

    this._respond(msg.id, {
      changes: { [textDocument.uri]: edits },
    });
  }

  // ─── References ─────────────────────────────────────────

  _onReferences(msg) {
    const { position, textDocument } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, []);

    const line = doc.text.split('\n')[position.line] || '';
    const word = this._getWordAt(line, position.character);
    if (!word) return this._respond(msg.id, []);

    const locations = [];
    const docLines = doc.text.split('\n');
    const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

    for (let i = 0; i < docLines.length; i++) {
      let match;
      while ((match = wordRegex.exec(docLines[i])) !== null) {
        locations.push({
          uri: textDocument.uri,
          range: {
            start: { line: i, character: match.index },
            end: { line: i, character: match.index + word.length },
          },
        });
      }
    }

    this._respond(msg.id, locations);
  }

  // ─── Workspace Symbol ──────────────────────────────────

  _onWorkspaceSymbol(msg) {
    const query = (msg.params.query || '').toLowerCase();
    const results = [];

    for (const [uri, cached] of this._diagnosticsCache) {
      if (!cached?.analyzer) continue;
      const symbols = this._collectSymbols(cached.analyzer);
      for (const sym of symbols) {
        if (query && !sym.name.toLowerCase().includes(query)) continue;
        const kindMap = { 'function': 12, 'type': 5, 'variable': 13 };
        results.push({
          name: sym.name,
          kind: kindMap[sym.kind] || 13,
          location: {
            uri,
            range: {
              start: { line: (sym.loc?.line || 1) - 1, character: (sym.loc?.column || 1) - 1 },
              end: { line: (sym.loc?.line || 1) - 1, character: (sym.loc?.column || 1) - 1 + sym.name.length },
            },
          },
        });
      }
    }

    this._respond(msg.id, results.slice(0, 100));
  }

  // ─── Utilities ────────────────────────────────────────────

  _uriToPath(uri) {
    if (uri.startsWith('file://')) {
      return decodeURIComponent(uri.slice(7));
    }
    return uri;
  }

  _getWordAt(line, character) {
    let start = character;
    let end = character;
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) start--;
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
    return line.slice(start, end) || null;
  }

  _collectSymbols(analyzer) {
    const symbols = [];
    const visited = new Set();

    const walkScope = (scope) => {
      if (!scope || visited.has(scope)) return;
      visited.add(scope);

      if (scope.symbols) {
        for (const [name, sym] of scope.symbols) {
          symbols.push({
            name,
            kind: sym.kind || 'variable',
            loc: sym.loc,
            typeAnnotation: sym.typeAnnotation,
            params: sym._params,
          });
        }
      }
      if (scope.children) {
        for (const child of scope.children) {
          walkScope(child);
        }
      }
    };

    if (analyzer.globalScope) walkScope(analyzer.globalScope);
    else if (analyzer.currentScope) walkScope(analyzer.currentScope);
    return symbols;
  }

  _findSymbolInScopes(analyzer, name) {
    const walkScope = (scope) => {
      if (!scope) return null;
      if (scope.symbols?.has(name)) {
        return scope.symbols.get(name);
      }
      if (scope.children) {
        for (const child of scope.children) {
          const found = walkScope(child);
          if (found) return found;
        }
      }
      return null;
    };

    if (analyzer.globalScope) return walkScope(analyzer.globalScope);
    if (analyzer.currentScope) return walkScope(analyzer.currentScope);
    return null;
  }
}

// Start the server
const server = new LuxLanguageServer();
server.start();
