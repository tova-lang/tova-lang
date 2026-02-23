#!/usr/bin/env bun
// Tova Language Server Protocol implementation
// Communicates via JSON-RPC over stdio

import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Analyzer } from '../analyzer/analyzer.js';
import { TokenType } from '../lexer/tokens.js';
import { Formatter } from '../formatter/formatter.js';
import { TypeRegistry } from '../analyzer/type-registry.js';
import { BUILTIN_NAMES, BUILTIN_FUNCTIONS } from '../stdlib/inline.js';

class TovaLanguageServer {
  static MAX_CACHE_SIZE = 100; // max cached diagnostics entries

  constructor() {
    this._buffer = Buffer.alloc(0);
    this._documents = new Map(); // uri -> { text, version }
    this._diagnosticsCache = new Map(); // uri -> { ast, analyzer, errors, typeRegistry }
    this._initialized = false;
    this._shutdownReceived = false;
    this._capabilities = {};
  }

  start() {
    // Do NOT set encoding — use raw Buffers for correct byte-based Content-Length (LSP protocol)
    process.stdin.on('data', (chunk) => this._onData(chunk));
    process.stdin.on('end', () => process.exit(0));

    // Crash recovery — prevent the LSP from dying on unexpected errors
    process.on('uncaughtException', (err) => {
      try {
        this._logError(`Uncaught exception (recovered): ${err.message}`);
      } catch {
        process.stderr.write(`[tova-lsp] Uncaught exception: ${err.message}\n`);
      }
    });
    process.on('unhandledRejection', (err) => {
      try {
        this._logError(`Unhandled rejection (recovered): ${err && err.message || err}`);
      } catch {
        process.stderr.write(`[tova-lsp] Unhandled rejection: ${err}\n`);
      }
    });
  }

  // ─── JSON-RPC Transport ────────────────────────────────────

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk]);
    while (true) {
      const sep = Buffer.from('\r\n\r\n');
      const headerEnd = this._buffer.indexOf(sep);
      if (headerEnd === -1) break;

      const header = this._buffer.slice(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this._buffer = this._buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1]);
      const start = headerEnd + 4;
      if (this._buffer.length < start + contentLength) break;

      const body = this._buffer.slice(start, start + contentLength).toString('utf8');
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
    this._notify('window/logMessage', { type: 1, message: `[tova-lsp] ${msg}` });
  }

  _logInfo(msg) {
    this._notify('window/logMessage', { type: 3, message: `[tova-lsp] ${msg}` });
  }

  // ─── Message Routing ──────────────────────────────────────

  _handleMessage(msg) {
    const method = msg.method;

    if (msg.id !== undefined && method) {
      // Request
      switch (method) {
        case 'initialize': return this._onInitialize(msg);
        case 'shutdown': this._shutdownReceived = true; return this._respond(msg.id, null);
        case 'textDocument/completion': return this._onCompletion(msg);
        case 'textDocument/definition': return this._onDefinition(msg);
        case 'textDocument/hover': return this._onHover(msg);
        case 'textDocument/signatureHelp': return this._onSignatureHelp(msg);
        case 'textDocument/formatting': return this._onFormatting(msg);
        case 'textDocument/rename': return this._onRename(msg);
        case 'textDocument/codeAction': return this._onCodeAction(msg);
        case 'textDocument/references': return this._onReferences(msg);
        case 'textDocument/inlayHint': return this._onInlayHint(msg);
        case 'workspace/symbol': return this._onWorkspaceSymbol(msg);
        default: return this._respondError(msg.id, -32601, `Method not found: ${method}`);
      }
    } else if (method) {
      // Notification
      switch (method) {
        case 'initialized': return this._onInitialized();
        case 'exit': return process.exit(this._shutdownReceived ? 0 : 1);
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
          change: 2, // Incremental sync — receive only changed ranges
          save: { includeText: true },
        },
        completionProvider: {
          triggerCharacters: ['.', '"', "'", '/', '<', ':'],
          resolveProvider: false,
        },
        definitionProvider: true,
        hoverProvider: true,
        signatureHelpProvider: {
          triggerCharacters: ['(', ','],
        },
        codeActionProvider: {
          codeActionKinds: ['quickfix'],
        },
        documentFormattingProvider: true,
        renameProvider: { prepareProvider: false },
        referencesProvider: true,
        inlayHintProvider: true,
        workspaceSymbolProvider: true,
      },
    });
  }

  _onInitialized() {
    this._logInfo('Tova Language Server initialized');
  }

  // ─── Document Management ──────────────────────────────────

  _onDidOpen(params) {
    const { uri, text, version } = params.textDocument;
    this._documents.set(uri, { text, version });
    this._validateDocument(uri, text);
  }

  _onDidChange(params) {
    const { uri, version } = params.textDocument;
    const changes = params.contentChanges;
    if (!changes || changes.length === 0) return;

    const doc = this._documents.get(uri);
    if (!doc) return;

    let text = doc.text;

    for (const change of changes) {
      if (change.range) {
        // Incremental sync: apply range edit
        text = this._applyEdit(text, change.range, change.text);
      } else {
        // Full sync fallback (e.g., if client sends full text)
        text = change.text;
      }
    }

    this._documents.set(uri, { text, version });
    this._debouncedValidate(uri, text);
  }

  // Apply a single incremental text edit to the document
  _applyEdit(text, range, newText) {
    const startOffset = this._positionToOffset(text, range.start);
    const endOffset = this._positionToOffset(text, range.end);
    return text.slice(0, startOffset) + newText + text.slice(endOffset);
  }

  // Convert { line, character } position to byte offset in text
  _positionToOffset(text, pos) {
    let line = 0;
    let offset = 0;
    while (line < pos.line && offset < text.length) {
      if (text[offset] === '\n') line++;
      offset++;
    }
    return offset + pos.character;
  }

  _debouncedValidate(uri, text) {
    if (!this._validateTimers) this._validateTimers = new Map();
    const existing = this._validateTimers.get(uri);
    if (existing) clearTimeout(existing);
    this._validateTimers.set(uri, setTimeout(() => {
      this._validateTimers.delete(uri);
      // Re-read latest text in case more changes arrived
      const doc = this._documents.get(uri);
      if (doc) this._validateDocument(uri, doc.text);
    }, 200));
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

      // LSP always runs with strict: true for better diagnostics
      const analyzer = new Analyzer(ast, filename, { strict: true });
      const result = analyzer.analyze();
      // Build sorted scope index for O(log n) position lookups
      analyzer.globalScope.buildIndex();
      const { warnings } = result;
      const typeRegistry = TypeRegistry.fromAnalyzer(analyzer);

      // Cache for go-to-definition (with LRU eviction)
      this._diagnosticsCache.set(uri, { ast, analyzer, text, typeRegistry });
      if (this._diagnosticsCache.size > TovaLanguageServer.MAX_CACHE_SIZE) {
        const toEvict = this._diagnosticsCache.size - TovaLanguageServer.MAX_CACHE_SIZE;
        let evicted = 0;
        for (const key of this._diagnosticsCache.keys()) {
          if (evicted >= toEvict) break;
          if (!this._documents.has(key)) {
            this._diagnosticsCache.delete(key);
            evicted++;
          }
        }
      }

      // Convert warnings to diagnostics with refined severity
      for (const w of warnings) {
        const severity = this._getDiagnosticSeverity(w);
        const diag = {
          range: {
            start: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 },
            end: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 + (w.length || 10) },
          },
          severity,
          source: 'tova',
          message: w.hint ? `${w.message} (hint: ${w.hint})` : w.message,
        };
        if (w.code) diag.code = w.code;
        // Add unnecessary tag for unused variables
        if (w.message.includes('declared but never used')) {
          diag.tags = [1]; // Unnecessary
        }
        diagnostics.push(diag);
      }
    } catch (err) {
      // Multi-error support from parser recovery
      const errors = err.errors || [err];
      for (const e of errors) {
        const loc = e.loc || this._extractErrorLocation(e.message, filename);
        diagnostics.push({
          range: {
            start: { line: (loc?.line || 1) - 1, character: (loc?.column || 1) - 1 },
            end: { line: (loc?.line || 1) - 1, character: (loc?.column || 1) - 1 + (loc?.length || 20) },
          },
          severity: 1, // Error
          source: 'tova',
          message: loc?.message || e.message,
        });
      }

      // Convert analyzer warnings to diagnostics (from analyzer errors that carry warnings)
      if (err.warnings) {
        for (const w of err.warnings) {
          const severity = this._getDiagnosticSeverity(w);
          diagnostics.push({
            range: {
              start: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 },
              end: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 + (w.length || 10) },
            },
            severity,
            source: 'tova',
            message: w.message,
          });
        }
      }

      // Use partial AST for go-to-definition even when there are errors
      const partialAST = err.partialAST;
      if (partialAST) {
        try {
          const analyzer = new Analyzer(partialAST, filename, { tolerant: true, strict: true });
          const result = analyzer.analyze();
          analyzer.globalScope.buildIndex();
          const typeRegistry = TypeRegistry.fromAnalyzer(analyzer);
          this._diagnosticsCache.set(uri, { ast: partialAST, analyzer, text, typeRegistry });
          for (const w of result.warnings) {
            diagnostics.push({
              range: {
                start: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 },
                end: { line: (w.line || 1) - 1, character: (w.column || 1) - 1 + (w.length || 10) },
              },
              severity: 2,
              source: 'tova',
              message: w.message,
            });
          }
          if (result.errors) {
            for (const e of result.errors) {
              diagnostics.push({
                range: {
                  start: { line: (e.line || 1) - 1, character: (e.column || 1) - 1 },
                  end: { line: (e.line || 1) - 1, character: (e.column || 1) - 1 + 10 },
                },
                severity: 1,
                source: 'tova',
                message: e.message,
              });
            }
          }
        } catch (_) {
          this._diagnosticsCache.set(uri, { ast: partialAST, text });
        }
      }
    }

    this._notify('textDocument/publishDiagnostics', { uri, diagnostics });
  }

  _getDiagnosticSeverity(diagnostic) {
    const msg = diagnostic.message || '';
    // Unused variables → Hint (4)
    if (msg.includes('declared but never used')) return 4;
    // Variable shadowing → Information (3)
    if (msg.includes('shadows a binding')) return 3;
    // Non-exhaustive match → Warning (2)
    if (msg.includes('Non-exhaustive match')) return 2;
    // Type mismatches in strict mode → Error (1)
    if (msg.includes('Type mismatch')) return 1;
    // Naming convention → Hint (4)
    if (msg.includes('should use snake_case') || msg.includes('should use PascalCase')) return 4;
    // Default → Warning (2)
    return 2;
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
    const before = line.slice(0, position.character);

    // CASE 1: Dot completion — "expr."
    const dotMatch = before.match(/(\w+)\.\s*(\w*)$/);
    if (dotMatch) {
      const objectName = dotMatch[1];
      const partial = dotMatch[2] || '';
      const dotItems = this._getDotCompletions(textDocument.uri, objectName, partial);
      if (dotItems.length > 0) {
        return this._respond(msg.id, dotItems.slice(0, 50));
      }
    }

    // CASE 2: Type annotation — after ":"
    const typeMatch = before.match(/:\s*(\w*)$/);
    if (typeMatch) {
      const partial = typeMatch[1] || '';
      const typeNames = ['Int', 'Float', 'String', 'Bool', 'Nil', 'Any',
        'Result', 'Option', 'Function'];
      // Add user-defined types
      const cached = this._diagnosticsCache.get(textDocument.uri);
      if (cached?.analyzer) {
        const symbols = this._collectSymbols(cached.analyzer);
        for (const sym of symbols) {
          if (sym.kind === 'type' && !typeNames.includes(sym.name)) {
            typeNames.push(sym.name);
          }
        }
      }
      for (const name of typeNames) {
        if (name.toLowerCase().startsWith(partial.toLowerCase())) {
          items.push({
            label: name,
            kind: 22, // Struct
            detail: 'type',
          });
        }
      }
      return this._respond(msg.id, items.slice(0, 50));
    }

    // CASE 3: Match arm — detect if we're inside a match block
    const matchItems = this._getMatchCompletions(textDocument.uri, doc.text, position);
    if (matchItems.length > 0) {
      return this._respond(msg.id, matchItems.slice(0, 50));
    }

    // CASE 4: Default — keywords + builtins + symbols
    const prefix = before.split(/[^a-zA-Z0-9_]/).pop() || '';

    // Keywords
    const keywords = [
      'fn', 'let', 'if', 'elif', 'else', 'for', 'while', 'loop', 'when', 'in',
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

    // Built-in functions (dynamically from stdlib) — with parameter info
    for (const fn of BUILTIN_NAMES) {
      if (fn.startsWith(prefix) && !fn.startsWith('__')) {
        const detail = this._getBuiltinDetail(fn);
        items.push({ label: fn, kind: 3 /* Function */, detail });
      }
    }
    // Runtime types
    for (const rt of ['Ok', 'Err', 'Some', 'None']) {
      if (rt.startsWith(prefix)) {
        items.push({ label: rt, kind: 3 /* Function */, detail: 'Tova built-in' });
      }
    }

    // Identifiers from current document's scope
    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (cached?.analyzer) {
      const symbols = this._collectSymbols(cached.analyzer);
      for (const sym of symbols) {
        if (sym.name.startsWith(prefix) && !BUILTIN_NAMES.has(sym.name)) {
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

  _getDotCompletions(uri, objectName, partial) {
    const items = [];
    const cached = this._diagnosticsCache.get(uri);
    if (!cached?.analyzer) return items;

    // Look up the object's type
    const sym = this._findSymbolInScopes(cached.analyzer, objectName);
    if (!sym) return items;

    // Determine the type name
    let typeName = null;
    if (sym.inferredType) {
      typeName = sym.inferredType;
    } else if (sym._variantOf) {
      typeName = sym._variantOf;
    } else if (sym.kind === 'type' && sym._typeStructure) {
      typeName = sym.name;
    }

    if (!typeName) return items;

    // Get members from type registry
    const typeRegistry = cached.typeRegistry;
    if (typeRegistry) {
      const members = typeRegistry.getMembers(typeName);

      // Add fields
      for (const [fieldName, fieldType] of members.fields) {
        if (!partial || fieldName.startsWith(partial)) {
          items.push({
            label: fieldName,
            kind: 5, // Field
            detail: fieldType ? fieldType.toString() : 'field',
            sortText: `0${fieldName}`, // Fields first
          });
        }
      }

      // Add impl methods
      for (const method of members.methods) {
        if (!partial || method.name.startsWith(partial)) {
          const paramStr = (method.params || []).filter(p => p !== 'self').join(', ');
          const retStr = method.returnType ? ` -> ${method.returnType}` : '';
          items.push({
            label: method.name,
            kind: 2, // Method
            detail: `fn(${paramStr})${retStr}`,
            sortText: `1${method.name}`, // Methods after fields
          });
        }
      }
    }

    return items;
  }

  _getMatchCompletions(uri, text, position) {
    const items = [];
    const lines = text.split('\n');

    // Walk backwards from cursor to find if we're inside a match block
    let matchSubject = null;
    let braceDepth = 0;
    for (let i = position.line; i >= 0; i--) {
      const lineText = lines[i] || '';
      for (let j = (i === position.line ? position.character : lineText.length) - 1; j >= 0; j--) {
        if (lineText[j] === '}') braceDepth++;
        if (lineText[j] === '{') {
          braceDepth--;
          if (braceDepth < 0) {
            // Found the opening brace — check if preceding text is a match expression
            const beforeBrace = lineText.slice(0, j).trim();
            const matchExpr = beforeBrace.match(/match\s+(\w+)\s*$/);
            if (matchExpr) {
              matchSubject = matchExpr[1];
            }
            break;
          }
        }
      }
      if (matchSubject || braceDepth < 0) break;
    }

    if (!matchSubject) return items;

    const cached = this._diagnosticsCache.get(uri);
    if (!cached?.analyzer) return items;

    // Look up subject type
    const sym = this._findSymbolInScopes(cached.analyzer, matchSubject);
    let typeName = sym?.inferredType || sym?._variantOf;

    if (typeName && cached.typeRegistry) {
      const variants = cached.typeRegistry.getVariantNames(typeName);
      for (const variant of variants) {
        items.push({
          label: variant,
          kind: 20, // EnumMember
          detail: `variant of ${typeName}`,
        });
      }
    }

    // Also suggest built-in variants if subject type is Result or Option
    if (typeName === 'Result' || (typeName && typeName.startsWith('Result<'))) {
      if (!items.some(i => i.label === 'Ok')) items.push({ label: 'Ok', kind: 20, detail: 'Result variant' });
      if (!items.some(i => i.label === 'Err')) items.push({ label: 'Err', kind: 20, detail: 'Result variant' });
    }
    if (typeName === 'Option' || (typeName && typeName.startsWith('Option<'))) {
      if (!items.some(i => i.label === 'Some')) items.push({ label: 'Some', kind: 20, detail: 'Option variant' });
      if (!items.some(i => i.label === 'None')) items.push({ label: 'None', kind: 20, detail: 'Option variant' });
    }

    return items;
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

    // Look up in symbol table — try scope-aware lookup first
    const symbol = this._findSymbolAtPosition(cached.analyzer, word, position) ||
                   this._findSymbolInScopes(cached.analyzer, word);
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

    // Check builtins — comprehensive hover docs for all stdlib functions
    const builtinDocs = {
      // Core
      'print': '`fn print(...args)` — Print values to console',
      'len': '`fn len(v)` — Get length of string, array, or object',
      'range': '`fn range(start, end?, step?)` — Generate array of numbers',
      'enumerate': '`fn enumerate(arr)` — Returns [[index, value], ...]',
      'type_of': '`fn type_of(v) -> String` — Get Tova type name as string',
      // Result/Option
      'Ok': '`Ok(value) -> Result` — Create a successful Result\n\nMethods: `.map(fn)`, `.flatMap(fn)`, `.andThen(fn)`, `.unwrap()`, `.unwrapOr(default)`, `.isOk()`, `.isErr()`, `.mapErr(fn)`',
      'Err': '`Err(error) -> Result` — Create an error Result\n\nMethods: `.unwrapOr(default)`, `.isOk()`, `.isErr()`, `.mapErr(fn)`, `.unwrapErr()`',
      'Some': '`Some(value) -> Option` — Create an Option with a value\n\nMethods: `.map(fn)`, `.flatMap(fn)`, `.andThen(fn)`, `.unwrap()`, `.unwrapOr(default)`, `.isSome()`, `.isNone()`, `.filter(fn)`',
      'None': '`None` — Empty Option value\n\nMethods: `.unwrapOr(default)`, `.isSome()`, `.isNone()`',
      // Collections
      'filter': '`fn filter(arr, fn) -> [T]` — Filter array by predicate',
      'map': '`fn map(arr, fn) -> [U]` — Transform each element',
      'find': '`fn find(arr, fn) -> T?` — Find first matching element (nil if none)',
      'find_index': '`fn find_index(arr, fn) -> Int?` — Find index of first match (nil if none)',
      'any': '`fn any(arr, fn) -> Bool` — True if any element matches predicate',
      'all': '`fn all(arr, fn) -> Bool` — True if all elements match predicate',
      'flat_map': '`fn flat_map(arr, fn) -> [U]` — Map and flatten one level',
      'reduce': '`fn reduce(arr, fn, init?) -> T` — Reduce array to single value',
      'sum': '`fn sum(arr) -> Float` — Sum all elements in array',
      'min': '`fn min(arr) -> T?` — Minimum value in array',
      'max': '`fn max(arr) -> T?` — Maximum value in array',
      'sorted': '`fn sorted(arr, key?) -> [T]` — Return sorted copy of array',
      'reversed': '`fn reversed(arr) -> [T]` — Return reversed copy',
      'zip': '`fn zip(...arrays) -> [[T]]` — Zip arrays together',
      'unique': '`fn unique(arr) -> [T]` — Remove duplicates',
      'group_by': '`fn group_by(arr, fn) -> {String: [T]}` — Group elements by key function',
      'chunk': '`fn chunk(arr, n) -> [[T]]` — Split array into chunks of size n',
      'flatten': '`fn flatten(arr) -> [T]` — Flatten one level of nesting',
      'take': '`fn take(arr, n) -> [T]` — Take first n elements',
      'drop': '`fn drop(arr, n) -> [T]` — Drop first n elements',
      'first': '`fn first(arr) -> T?` — First element (nil if empty)',
      'last': '`fn last(arr) -> T?` — Last element (nil if empty)',
      'count': '`fn count(arr, fn) -> Int` — Count elements matching predicate',
      'partition': '`fn partition(arr, fn) -> [[T], [T]]` — Split into [matching, non-matching]',
      'includes': '`fn includes(arr, value) -> Bool` — Check if array contains value',
      'compact': '`fn compact(arr) -> [T]` — Remove nil values',
      'rotate': '`fn rotate(arr, n) -> [T]` — Rotate array by n positions',
      'insert_at': '`fn insert_at(arr, idx, val) -> [T]` — Insert value at index',
      'remove_at': '`fn remove_at(arr, idx) -> [T]` — Remove element at index',
      'update_at': '`fn update_at(arr, idx, val) -> [T]` — Replace element at index',
      // Math
      'abs': '`fn abs(n) -> Float` — Absolute value',
      'floor': '`fn floor(n) -> Int` — Round down',
      'ceil': '`fn ceil(n) -> Int` — Round up',
      'round': '`fn round(n) -> Int` — Round to nearest integer',
      'clamp': '`fn clamp(n, lo, hi) -> Float` — Clamp value to range [lo, hi]',
      'sqrt': '`fn sqrt(n) -> Float` — Square root',
      'pow': '`fn pow(base, exp) -> Float` — Exponentiation',
      'random': '`fn random() -> Float` — Random number in [0, 1)',
      'random_int': '`fn random_int(lo, hi) -> Int` — Random integer in [lo, hi]',
      'random_float': '`fn random_float(lo, hi) -> Float` — Random float in [lo, hi)',
      'sign': '`fn sign(n) -> Int` — Sign of number (-1, 0, or 1)',
      'trunc': '`fn trunc(n) -> Int` — Truncate toward zero',
      'gcd': '`fn gcd(a, b) -> Int` — Greatest common divisor',
      'lcm': '`fn lcm(a, b) -> Int` — Least common multiple',
      'factorial': '`fn factorial(n) -> Int` — Factorial (nil for negative)',
      'hypot': '`fn hypot(a, b) -> Float` — Hypotenuse length',
      'lerp': '`fn lerp(a, b, t) -> Float` — Linear interpolation',
      'divmod': '`fn divmod(a, b) -> [Int, Int]` — Quotient and remainder',
      'avg': '`fn avg(arr) -> Float` — Average of array values',
      'is_nan': '`fn is_nan(n) -> Bool` — Check if value is NaN',
      'is_finite': '`fn is_finite(n) -> Bool` — Check if value is finite',
      'is_close': '`fn is_close(a, b, tol?) -> Bool` — Check if values are approximately equal',
      'PI': '`PI: Float` — Mathematical constant pi (3.14159...)',
      'E': '`E: Float` — Euler\'s number (2.71828...)',
      'INF': '`INF: Float` — Positive infinity',
      // Trig
      'sin': '`fn sin(n) -> Float` — Sine (radians)',
      'cos': '`fn cos(n) -> Float` — Cosine (radians)',
      'tan': '`fn tan(n) -> Float` — Tangent (radians)',
      'asin': '`fn asin(n) -> Float` — Arcsine',
      'acos': '`fn acos(n) -> Float` — Arccosine',
      'atan': '`fn atan(n) -> Float` — Arctangent',
      'atan2': '`fn atan2(y, x) -> Float` — Two-argument arctangent',
      'to_radians': '`fn to_radians(deg) -> Float` — Convert degrees to radians',
      'to_degrees': '`fn to_degrees(rad) -> Float` — Convert radians to degrees',
      // Logarithmic
      'log': '`fn log(n) -> Float` — Natural logarithm',
      'log2': '`fn log2(n) -> Float` — Base-2 logarithm',
      'log10': '`fn log10(n) -> Float` — Base-10 logarithm',
      'exp': '`fn exp(n) -> Float` — e raised to the power n',
      // String
      'trim': '`fn trim(s) -> String` — Remove leading/trailing whitespace',
      'trim_start': '`fn trim_start(s) -> String` — Remove leading whitespace',
      'trim_end': '`fn trim_end(s) -> String` — Remove trailing whitespace',
      'split': '`fn split(s, sep) -> [String]` — Split string by separator',
      'join': '`fn join(arr, sep) -> String` — Join array elements with separator',
      'replace': '`fn replace(s, from, to) -> String` — Replace all occurrences',
      'replace_first': '`fn replace_first(s, from, to) -> String` — Replace first occurrence',
      'repeat': '`fn repeat(s, n) -> String` — Repeat string n times',
      'upper': '`fn upper(s) -> String` — Convert to uppercase',
      'lower': '`fn lower(s) -> String` — Convert to lowercase',
      'contains': '`fn contains(s, sub) -> Bool` — Check if string contains substring',
      'starts_with': '`fn starts_with(s, prefix) -> Bool` — Check if string starts with prefix',
      'ends_with': '`fn ends_with(s, suffix) -> Bool` — Check if string ends with suffix',
      'chars': '`fn chars(s) -> [String]` — Split string into individual characters',
      'words': '`fn words(s) -> [String]` — Split by whitespace',
      'lines': '`fn lines(s) -> [String]` — Split by newlines',
      'capitalize': '`fn capitalize(s) -> String` — Capitalize first letter',
      'title_case': '`fn title_case(s) -> String` — Capitalize each word',
      'snake_case': '`fn snake_case(s) -> String` — Convert to snake_case',
      'camel_case': '`fn camel_case(s) -> String` — Convert to camelCase',
      'kebab_case': '`fn kebab_case(s) -> String` — Convert to kebab-case',
      'pad_start': '`fn pad_start(s, n, fill?) -> String` — Pad start to length n',
      'pad_end': '`fn pad_end(s, n, fill?) -> String` — Pad end to length n',
      'char_at': '`fn char_at(s, i) -> String?` — Character at index (nil if out of bounds)',
      'index_of': '`fn index_of(s, sub) -> Int?` — Index of first occurrence (nil if not found)',
      'last_index_of': '`fn last_index_of(s, sub) -> Int?` — Index of last occurrence',
      'count_of': '`fn count_of(s, sub) -> Int` — Count occurrences of substring',
      'reverse_str': '`fn reverse_str(s) -> String` — Reverse a string',
      'substr': '`fn substr(s, start, end?) -> String` — Extract substring',
      'center': '`fn center(s, n, fill?) -> String` — Center string in field of width n',
      'slugify': '`fn slugify(s) -> String` — Convert to URL-safe slug',
      'truncate': '`fn truncate(s, n, suffix?) -> String` — Truncate with ellipsis',
      'escape_html': '`fn escape_html(s) -> String` — Escape HTML entities',
      'unescape_html': '`fn unescape_html(s) -> String` — Unescape HTML entities',
      'dedent': '`fn dedent(s) -> String` — Remove common leading whitespace',
      'indent_str': '`fn indent_str(s, n, ch?) -> String` — Indent each line',
      'word_wrap': '`fn word_wrap(s, width) -> String` — Wrap text at word boundaries',
      'fmt': '`fn fmt(template, ...args) -> String` — Format string with `{}` placeholders',
      'is_empty': '`fn is_empty(v) -> Bool` — Check if string, array, or object is empty',
      // Object
      'keys': '`fn keys(obj) -> [String]` — Object keys',
      'values': '`fn values(obj) -> [T]` — Object values',
      'entries': '`fn entries(obj) -> [[String, T]]` — Object entries as [key, value] pairs',
      'merge': '`fn merge(...objs) -> Object` — Merge objects (later values win)',
      'freeze': '`fn freeze(obj) -> Object` — Make object immutable',
      'clone': '`fn clone(obj) -> Object` — Deep clone',
      'has_key': '`fn has_key(obj, key) -> Bool` — Check if object has key',
      'get': '`fn get(obj, path, default?) -> T` — Get nested value by dot path',
      'pick': '`fn pick(obj, keys) -> Object` — Select subset of keys',
      'omit': '`fn omit(obj, keys) -> Object` — Remove subset of keys',
      'map_values': '`fn map_values(obj, fn) -> Object` — Transform all values',
      'from_entries': '`fn from_entries(pairs) -> Object` — Create object from [key, value] pairs',
      // Type Conversion
      'to_int': '`fn to_int(v) -> Int?` — Parse value to integer (nil on failure)',
      'to_float': '`fn to_float(v) -> Float?` — Parse value to float (nil on failure)',
      'to_string': '`fn to_string(v) -> String` — Convert any value to string',
      'to_bool': '`fn to_bool(v) -> Bool` — Convert value to boolean',
      // Assertions
      'assert': '`fn assert(cond, msg?)` — Assert condition is true',
      'assert_eq': '`fn assert_eq(a, b, msg?)` — Assert values are equal',
      'assert_ne': '`fn assert_ne(a, b, msg?)` — Assert values are not equal',
      // Async
      'sleep': '`fn sleep(ms) -> Promise` — Wait for ms milliseconds',
      'parallel': '`fn parallel(list) -> Promise` — Run promises concurrently (Promise.all)',
      'timeout': '`fn timeout(promise, ms) -> Promise` — Reject if promise exceeds timeout',
      'retry': '`fn retry(fn, {times?, delay?, backoff?}) -> Promise` — Retry async function',
      // Functional
      'compose': '`fn compose(...fns) -> Function` — Right-to-left function composition',
      'pipe_fn': '`fn pipe_fn(...fns) -> Function` — Left-to-right function composition',
      'identity': '`fn identity(x) -> T` — Return value unchanged',
      'memoize': '`fn memoize(fn) -> Function` — Cache function results',
      'debounce': '`fn debounce(fn, ms) -> Function` — Debounce function calls',
      'throttle': '`fn throttle(fn, ms) -> Function` — Throttle function calls',
      'once': '`fn once(fn) -> Function` — Only call function once',
      'negate': '`fn negate(fn) -> Function` — Return a negated predicate',
      'partial': '`fn partial(fn, ...args) -> Function` — Partially apply arguments',
      'curry': '`fn curry(fn, arity?) -> Function` — Curry a function',
      'flip': '`fn flip(fn) -> Function` — Swap first two arguments',
      // Error Handling
      'try_fn': '`fn try_fn(fn) -> Result` — Wrap function call in Result',
      'try_async': '`fn try_async(fn) -> Result` — Wrap async call in Result',
      'filter_ok': '`fn filter_ok(arr) -> [T]` — Extract Ok values from Result array',
      'filter_err': '`fn filter_err(arr) -> [E]` — Extract Err values from Result array',
      // Randomness
      'choice': '`fn choice(arr) -> T?` — Random element from array',
      'sample': '`fn sample(arr, n) -> [T]` — Random n elements from array',
      'shuffle': '`fn shuffle(arr) -> [T]` — Randomly reorder array',
      // JSON
      'json_parse': '`fn json_parse(s) -> Result` — Parse JSON string (returns Result)',
      'json_stringify': '`fn json_stringify(v) -> String` — Convert to JSON string',
      'json_pretty': '`fn json_pretty(v) -> String` — Convert to pretty-printed JSON',
      // Encoding
      'base64_encode': '`fn base64_encode(s) -> String` — Encode string to base64',
      'base64_decode': '`fn base64_decode(s) -> String` — Decode base64 string',
      'url_encode': '`fn url_encode(s) -> String` — URL-encode string',
      'url_decode': '`fn url_decode(s) -> String` — URL-decode string',
      'hex_encode': '`fn hex_encode(s) -> String` — Encode string to hex',
      'hex_decode': '`fn hex_decode(s) -> String` — Decode hex string',
      // Number Formatting
      'format_number': '`fn format_number(n, {separator?, decimals?}) -> String` — Format number with separators',
      'to_hex': '`fn to_hex(n) -> String` — Convert number to hex string',
      'to_binary': '`fn to_binary(n) -> String` — Convert number to binary string',
      'to_octal': '`fn to_octal(n) -> String` — Convert number to octal string',
      'to_fixed': '`fn to_fixed(n, decimals) -> Float` — Round to fixed decimal places',
      // Itertools
      'pairwise': '`fn pairwise(arr) -> [[T, T]]` — Adjacent pairs',
      'combinations': '`fn combinations(arr, r) -> [[T]]` — All r-combinations',
      'permutations': '`fn permutations(arr, r?) -> [[T]]` — All permutations',
      'intersperse': '`fn intersperse(arr, sep) -> [T]` — Insert separator between elements',
      'interleave': '`fn interleave(...arrs) -> [T]` — Interleave multiple arrays',
      'repeat_value': '`fn repeat_value(val, n) -> [T]` — Create array of n copies',
      'sliding_window': '`fn sliding_window(arr, n) -> [[T]]` — Sliding window of size n',
      'zip_with': '`fn zip_with(a, b, fn) -> [U]` — Zip two arrays with combining function',
      'frequencies': '`fn frequencies(arr) -> {String: Int}` — Count occurrences of each element',
      'scan': '`fn scan(arr, fn, init) -> [T]` — Running accumulation',
      'min_by': '`fn min_by(arr, fn) -> T?` — Minimum by key function',
      'max_by': '`fn max_by(arr, fn) -> T?` — Maximum by key function',
      'sum_by': '`fn sum_by(arr, fn) -> Float` — Sum by key function',
      'product': '`fn product(arr) -> Float` — Product of all elements',
      'binary_search': '`fn binary_search(arr, target, key?) -> Int` — Binary search (-1 if not found)',
      'is_sorted': '`fn is_sorted(arr, key?) -> Bool` — Check if array is sorted',
      // Set Operations
      'intersection': '`fn intersection(a, b) -> [T]` — Elements in both arrays',
      'difference': '`fn difference(a, b) -> [T]` — Elements in a but not b',
      'symmetric_difference': '`fn symmetric_difference(a, b) -> [T]` — Elements in either but not both',
      'is_subset': '`fn is_subset(a, b) -> Bool` — Check if a is subset of b',
      'is_superset': '`fn is_superset(a, b) -> Bool` — Check if a is superset of b',
      // Statistics
      'mean': '`fn mean(arr) -> Float` — Arithmetic mean',
      'median': '`fn median(arr) -> Float?` — Median value',
      'mode': '`fn mode(arr) -> T?` — Most frequent value',
      'stdev': '`fn stdev(arr) -> Float` — Standard deviation',
      'variance': '`fn variance(arr) -> Float` — Variance',
      'percentile': '`fn percentile(arr, p) -> Float?` — p-th percentile',
      // Validation
      'is_email': '`fn is_email(s) -> Bool` — Check if string is valid email',
      'is_url': '`fn is_url(s) -> Bool` — Check if string is valid URL',
      'is_numeric': '`fn is_numeric(s) -> Bool` — Check if string is numeric',
      'is_alpha': '`fn is_alpha(s) -> Bool` — Check if string is alphabetic',
      'is_alphanumeric': '`fn is_alphanumeric(s) -> Bool` — Check if string is alphanumeric',
      'is_uuid': '`fn is_uuid(s) -> Bool` — Check if string is valid UUID',
      'is_hex': '`fn is_hex(s) -> Bool` — Check if string is valid hex',
      // URL
      'uuid': '`fn uuid() -> String` — Generate random UUID v4',
      'parse_url': '`fn parse_url(s) -> Result` — Parse URL into components',
      'build_url': '`fn build_url(parts) -> String` — Build URL from components',
      'parse_query': '`fn parse_query(s) -> Object` — Parse query string',
      'build_query': '`fn build_query(obj) -> String` — Build query string from object',
      // Regex
      'regex_test': '`fn regex_test(s, pattern, flags?) -> Bool` — Test if string matches regex',
      'regex_match': '`fn regex_match(s, pattern, flags?) -> Result` — First regex match',
      'regex_find_all': '`fn regex_find_all(s, pattern, flags?) -> [Match]` — All regex matches',
      'regex_replace': '`fn regex_replace(s, pattern, replacement, flags?) -> String` — Replace by regex',
      'regex_split': '`fn regex_split(s, pattern, flags?) -> [String]` — Split by regex',
      'regex_capture': '`fn regex_capture(s, pattern, flags?) -> Result` — Named capture groups',
      // Date/Time
      'now': '`fn now() -> Int` — Current timestamp in milliseconds',
      'now_iso': '`fn now_iso() -> String` — Current time as ISO 8601 string',
      'date_parse': '`fn date_parse(s) -> Result` — Parse date string',
      'date_format': '`fn date_format(d, fmt) -> String` — Format date (iso, date, time, datetime, or custom)',
      'date_add': '`fn date_add(d, amount, unit) -> Date` — Add time to date',
      'date_diff': '`fn date_diff(d1, d2, unit) -> Int` — Difference between dates',
      'date_from': '`fn date_from(parts) -> Date` — Create date from {year, month, day, ...}',
      'date_part': '`fn date_part(d, part) -> Int` — Extract part (year, month, day, ...)',
      'time_ago': '`fn time_ago(d) -> String` — Human-readable relative time',
      // I/O
      'read': '`fn read(source, opts?) -> Table` — Read CSV, JSON, JSONL, or URL into Table',
      'write': '`fn write(data, dest, opts?)` — Write Table/array to CSV, JSON, JSONL',
      // Scripting
      'env': '`fn env(key?, fallback?) -> String?` — Get environment variable',
      'args': '`fn args() -> [String]` — Get CLI arguments',
      'exit': '`fn exit(code?)` — Exit process',
      'exists': '`fn exists(path) -> Bool` — Check if file/directory exists',
      'read_text': '`fn read_text(path) -> Result` — Read file as string',
      'write_text': '`fn write_text(path, content, opts?) -> Result` — Write string to file',
      'mkdir': '`fn mkdir(dir) -> Result` — Create directory (recursive)',
      'ls': '`fn ls(dir?, opts?) -> [String]` — List directory contents',
      'cwd': '`fn cwd() -> String` — Current working directory',
      'read_stdin': '`fn read_stdin() -> String` — Read all of stdin (for piped input)',
      'read_lines': '`fn read_lines() -> [String]` — Read stdin as array of lines',
      'script_path': '`fn script_path() -> String?` — Absolute path of running .tova script',
      'script_dir': '`fn script_dir() -> String?` — Directory containing running .tova script',
      'parse_args': '`fn parse_args(argv) -> {flags, positional}` — Parse CLI args into flags and positional args',
      'color': '`fn color(text, name) -> String` — ANSI color (red/green/yellow/blue/magenta/cyan/white/gray)',
      'bold': '`fn bold(text) -> String` — Bold ANSI text',
      'dim': '`fn dim(text) -> String` — Dim ANSI text',
      'on_signal': '`fn on_signal(name, callback)` — Register signal handler (e.g. "SIGINT")',
      'file_stat': '`fn file_stat(path) -> Result<{size, mode, mtime, atime, isDir, isFile, isSymlink}>` — File metadata',
      'file_size': '`fn file_size(path) -> Result<Int>` — File size in bytes',
      'path_join': '`fn path_join(...parts) -> String` — Join path segments',
      'path_dirname': '`fn path_dirname(path) -> String` — Directory portion of path',
      'path_basename': '`fn path_basename(path, ext?) -> String` — File name portion of path',
      'path_resolve': '`fn path_resolve(path) -> String` — Resolve to absolute path',
      'path_ext': '`fn path_ext(path) -> String` — File extension (e.g. ".js")',
      'path_relative': '`fn path_relative(from, to) -> String` — Relative path between two paths',
      'symlink': '`fn symlink(target, path) -> Result` — Create symbolic link',
      'readlink': '`fn readlink(path) -> Result<String>` — Read symbolic link target',
      'is_symlink': '`fn is_symlink(path) -> Bool` — Check if path is a symbolic link',
      'spawn': '`fn spawn(cmd, args?, opts?) -> Promise<Result<{stdout, stderr, exitCode}>>` — Async shell command',
    };

    if (builtinDocs[word]) {
      return this._respond(msg.id, {
        contents: { kind: 'markdown', value: builtinDocs[word] },
      });
    }

    // Check user-defined symbols
    const symbol = this._findSymbolAtPosition(cached.analyzer, word, position) ||
                   this._findSymbolInScopes(cached.analyzer, word);
    if (symbol) {
      let hoverText = `**${word}**`;
      if (symbol.kind) hoverText += ` *(${symbol.kind})*`;

      // Show inferred type for variables
      if (symbol.inferredType) {
        hoverText += `\n\nType: \`${symbol.inferredType}\``;
      }

      // Show declared type annotation
      if (symbol.typeAnnotation) {
        hoverText += `\n\nType: \`${symbol.typeAnnotation}\``;
      } else if (symbol.type && typeof symbol.type === 'object' && symbol.type.type === 'TypeAnnotation') {
        hoverText += `\n\nReturn type: \`${symbol.type.name}\``;
      }

      // Show full function signature
      if (symbol._params) {
        const params = symbol._params.map((p, i) => {
          const paramType = symbol._paramTypes && symbol._paramTypes[i];
          if (paramType) {
            const typeStr = typeof paramType === 'string' ? paramType :
              (paramType.name || paramType.type || '');
            return typeStr ? `${p}: ${typeStr}` : p;
          }
          return p;
        });
        const retType = symbol.type ? ` -> ${symbol.type.name || symbol.type}` : '';
        hoverText += `\n\nSignature: \`fn ${word}(${params.join(', ')})${retType}\``;
      }

      // Show type structure for type symbols
      if (symbol.kind === 'type' && symbol._typeStructure) {
        const structure = symbol._typeStructure;
        if (structure.variants && structure.variants.size > 0) {
          const variantStrs = [];
          for (const [vName, fields] of structure.variants) {
            if (fields.size > 0) {
              const fieldStrs = [];
              for (const [fName, fType] of fields) {
                fieldStrs.push(`${fName}: ${fType}`);
              }
              variantStrs.push(`  ${vName}(${fieldStrs.join(', ')})`);
            } else {
              variantStrs.push(`  ${vName}`);
            }
          }
          hoverText += `\n\n\`\`\`\ntype ${word} {\n${variantStrs.join('\n')}\n}\n\`\`\``;
        }
      }

      return this._respond(msg.id, {
        contents: { kind: 'markdown', value: hoverText },
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

    // Walk backwards to find the immediately enclosing function call (handles nesting)
    let depth = 0;
    let parenPos = -1;
    for (let i = before.length - 1; i >= 0; i--) {
      if (before[i] === ')') depth++;
      else if (before[i] === '(') {
        if (depth === 0) { parenPos = i; break; }
        depth--;
      }
    }
    if (parenPos === -1) return this._respond(msg.id, null);

    const funcMatch = before.slice(0, parenPos).match(/(\w+)\s*$/);
    if (!funcMatch) return this._respond(msg.id, null);

    const funcName = funcMatch[1];

    // Count commas at depth 0 after the enclosing paren (ignores nested call commas)
    const afterParen = before.slice(parenPos + 1);
    let activeParam = 0;
    let parenDepth = 0;
    for (const ch of afterParen) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === ',' && parenDepth === 0) activeParam++;
    }

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
      if (symbol?._params) {
        return this._respond(msg.id, {
          signatures: [{
            label: `${funcName}(${symbol._params.join(', ')})`,
            parameters: symbol._params.map(p => ({ label: p })),
          }],
          activeSignature: 0,
          activeParameter: Math.max(0, Math.min(activeParam, symbol._params.length - 1)),
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

  // ─── Code Actions ──────────────────────────────────────

  _onCodeAction(msg) {
    const { textDocument, range, context } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, []);

    const actions = [];
    const diagnostics = context.diagnostics || [];

    for (const diag of diagnostics) {
      const message = diag.message || '';

      // Unused variable: offer "prefix with _"
      if (message.includes('declared but never used')) {
        const match = message.match(/'([^']+)'/);
        if (match) {
          const varName = match[1];
          const line = doc.text.split('\n')[diag.range.start.line] || '';
          const wordRegex = new RegExp(`\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          const wordMatch = wordRegex.exec(line);
          if (wordMatch) {
            actions.push({
              title: `Prefix '${varName}' with _`,
              kind: 'quickfix',
              diagnostics: [diag],
              edit: {
                changes: {
                  [textDocument.uri]: [{
                    range: {
                      start: { line: diag.range.start.line, character: wordMatch.index },
                      end: { line: diag.range.start.line, character: wordMatch.index + varName.length },
                    },
                    newText: `_${varName}`,
                  }],
                },
              },
            });
          }
        }
      }

      // "Did you mean?" suggestion: offer replacement
      if (message.includes('is not defined') && message.includes('hint: did you mean')) {
        const nameMatch = message.match(/'([^']+)' is not defined/);
        const suggMatch = message.match(/did you mean '([^']+)'/);
        if (nameMatch && suggMatch) {
          const oldName = nameMatch[1];
          const newName = suggMatch[1];
          const line = doc.text.split('\n')[diag.range.start.line] || '';
          const wordRegex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          const wordMatch = wordRegex.exec(line);
          if (wordMatch) {
            actions.push({
              title: `Replace '${oldName}' with '${newName}'`,
              kind: 'quickfix',
              isPreferred: true,
              diagnostics: [diag],
              edit: {
                changes: {
                  [textDocument.uri]: [{
                    range: {
                      start: { line: diag.range.start.line, character: wordMatch.index },
                      end: { line: diag.range.start.line, character: wordMatch.index + oldName.length },
                    },
                    newText: newName,
                  }],
                },
              },
            });
          }
        }
      }

      // Naming convention: offer rename
      if (message.includes('should use snake_case') || message.includes('should use PascalCase')) {
        const nameMatch = message.match(/'([^']+)'/);
        const hintMatch = (diag.message || '').match(/Rename '([^']+)' to '([^']+)'/);
        if (nameMatch && hintMatch) {
          const oldName = hintMatch[1];
          const newName = hintMatch[2];
          const line = doc.text.split('\n')[diag.range.start.line] || '';
          const wordRegex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          const wordMatch = wordRegex.exec(line);
          if (wordMatch) {
            actions.push({
              title: `Rename '${oldName}' to '${newName}'`,
              kind: 'quickfix',
              diagnostics: [diag],
              edit: {
                changes: {
                  [textDocument.uri]: [{
                    range: {
                      start: { line: diag.range.start.line, character: wordMatch.index },
                      end: { line: diag.range.start.line, character: wordMatch.index + oldName.length },
                    },
                    newText: newName,
                  }],
                },
              },
            });
          }
        }
      }

      // Type mismatch with toString hint
      if (message.includes('Type mismatch') && message.includes('hint: try toString')) {
        actions.push({
          title: 'Wrap with toString()',
          kind: 'quickfix',
          diagnostics: [diag],
        });
      }

      // Type mismatch with Ok() hint
      if (message.includes('Type mismatch') && message.includes('hint: try Ok(value)')) {
        actions.push({
          title: 'Wrap with Ok()',
          kind: 'quickfix',
          diagnostics: [diag],
        });
      }

      // Type mismatch with Some() hint
      if (message.includes('Type mismatch') && message.includes('hint: try Some(value)')) {
        actions.push({
          title: 'Wrap with Some()',
          kind: 'quickfix',
          diagnostics: [diag],
        });
      }

      // Type mismatch: try toInt/toFloat/floor/round
      if (message.includes('Type mismatch') && message.includes('hint: try toInt')) {
        actions.push({
          title: 'Convert with toInt()',
          kind: 'quickfix',
          diagnostics: [diag],
        });
      }
      if (message.includes('Type mismatch') && message.includes('hint: try toFloat')) {
        actions.push({
          title: 'Convert with toFloat()',
          kind: 'quickfix',
          diagnostics: [diag],
        });
      }
      if (message.includes('hint: try floor(value)')) {
        actions.push({
          title: 'Convert with floor()',
          kind: 'quickfix',
          diagnostics: [diag],
        });
      }

      // Immutable variable: offer to change declaration to var
      if (message.includes('Cannot reassign immutable variable')) {
        const nameMatch = message.match(/variable '([^']+)'/);
        if (nameMatch) {
          const varName = nameMatch[1];
          // Find the line where the variable is first declared
          const docLines = doc.text.split('\n');
          for (let i = 0; i < docLines.length; i++) {
            const declMatch = docLines[i].match(new RegExp(`(?<![\\w])${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`));
            if (declMatch && i < diag.range.start.line) {
              const col = declMatch.index;
              actions.push({
                title: `Make '${varName}' mutable (add 'var')`,
                kind: 'quickfix',
                isPreferred: true,
                diagnostics: [diag],
                edit: {
                  changes: {
                    [textDocument.uri]: [{
                      range: {
                        start: { line: i, character: col },
                        end: { line: i, character: col },
                      },
                      newText: 'var ',
                    }],
                  },
                },
              });
              break;
            }
          }
        }
      }

      // Cannot use operator on immutable variable
      if (message.includes("Cannot use") && message.includes("on immutable variable")) {
        const nameMatch = message.match(/variable '([^']+)'/);
        if (nameMatch) {
          const varName = nameMatch[1];
          const docLines = doc.text.split('\n');
          for (let i = 0; i < docLines.length; i++) {
            const declMatch = docLines[i].match(new RegExp(`(?<![\\w])${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`));
            if (declMatch && i < diag.range.start.line) {
              const col = declMatch.index;
              actions.push({
                title: `Make '${varName}' mutable (add 'var')`,
                kind: 'quickfix',
                isPreferred: true,
                diagnostics: [diag],
                edit: {
                  changes: {
                    [textDocument.uri]: [{
                      range: {
                        start: { line: i, character: col },
                        end: { line: i, character: col },
                      },
                      newText: 'var ',
                    }],
                  },
                },
              });
              break;
            }
          }
        }
      }

      // await outside async: offer to add 'async' to the function
      if (message.includes("'await' can only be used inside an async function")) {
        const docLines = doc.text.split('\n');
        // Search backward for the enclosing 'fn' declaration
        for (let i = diag.range.start.line; i >= 0; i--) {
          const fnMatch = docLines[i].match(/(\s*)fn\s+/);
          if (fnMatch) {
            const col = fnMatch.index + fnMatch[1].length;
            actions.push({
              title: 'Add async to function',
              kind: 'quickfix',
              isPreferred: true,
              diagnostics: [diag],
              edit: {
                changes: {
                  [textDocument.uri]: [{
                    range: {
                      start: { line: i, character: col },
                      end: { line: i, character: col },
                    },
                    newText: 'async ',
                  }],
                },
              },
            });
            break;
          }
        }
      }

      // Non-exhaustive match: offer to add wildcard arm
      if (message.includes('Non-exhaustive match')) {
        const variantMatch = message.match(/missing '([^']+)'/);
        if (variantMatch) {
          actions.push({
            title: `Add '_ => ...' catch-all arm`,
            kind: 'quickfix',
            diagnostics: [diag],
          });
        }
      }

      // 'throw' is not a Tova keyword
      if (message.includes("'throw' is not a Tova keyword")) {
        const line = doc.text.split('\n')[diag.range.start.line] || '';
        const throwMatch = line.match(/\bthrow\b/);
        if (throwMatch) {
          actions.push({
            title: "Replace 'throw' with 'Err()'",
            kind: 'quickfix',
            isPreferred: true,
            diagnostics: [diag],
            edit: {
              changes: {
                [textDocument.uri]: [{
                  range: {
                    start: { line: diag.range.start.line, character: throwMatch.index },
                    end: { line: diag.range.start.line, character: throwMatch.index + 5 },
                  },
                  newText: 'return Err(',
                }],
              },
            },
          });
        }
      }

      // 'mut' not supported: offer 'var'
      if (message.includes("'mut' is not supported") || message.includes("Use 'var' for mutable")) {
        const line = doc.text.split('\n')[diag.range.start.line] || '';
        const mutMatch = line.match(/\bmut\b/);
        if (mutMatch) {
          actions.push({
            title: "Replace 'mut' with 'var'",
            kind: 'quickfix',
            isPreferred: true,
            diagnostics: [diag],
            edit: {
              changes: {
                [textDocument.uri]: [{
                  range: {
                    start: { line: diag.range.start.line, character: mutMatch.index },
                    end: { line: diag.range.start.line, character: mutMatch.index + 3 },
                  },
                  newText: 'var',
                }],
              },
            },
          });
        }
      }

      // Suppress unused variable with tova-ignore comment
      if (message.includes('declared but never used')) {
        const nameMatch = message.match(/'([^']+)'/);
        if (nameMatch) {
          const lineNum = diag.range.start.line;
          const docLines = doc.text.split('\n');
          const lineContent = docLines[lineNum] || '';
          const indent = lineContent.match(/^(\s*)/)[1];
          actions.push({
            title: `Suppress with // tova-ignore W001`,
            kind: 'quickfix',
            diagnostics: [diag],
            edit: {
              changes: {
                [textDocument.uri]: [{
                  range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: 0 },
                  },
                  newText: `${indent}// tova-ignore W001\n`,
                }],
              },
            },
          });
        }
      }
    }

    this._respond(msg.id, actions);
  }

  // ─── Rename (scope-aware) ────────────────────────────────

  _onRename(msg) {
    const { position, textDocument, newName } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, null);

    const line = doc.text.split('\n')[position.line] || '';
    const oldName = this._getWordAt(line, position.character);
    if (!oldName) return this._respond(msg.id, null);

    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (!cached || !cached.analyzer || !cached.analyzer.globalScope) {
      // Fallback to naive rename if no scope info
      return this._naiveRename(msg.id, textDocument.uri, doc.text, oldName, newName);
    }

    // Find which scope defines the binding the cursor is on
    const cursorLine = position.line + 1;   // LSP 0-based to 1-based
    const cursorCol = position.character + 1;
    const cursorScope = cached.analyzer.globalScope.findScopeAtPosition(cursorLine, cursorCol);
    if (!cursorScope) {
      return this._naiveRename(msg.id, textDocument.uri, doc.text, oldName, newName);
    }

    // Walk up from cursor scope to find where this name is defined
    let definingScope = null;
    let scope = cursorScope;
    while (scope) {
      if (scope.symbols && scope.symbols.has(oldName)) {
        definingScope = scope;
        break;
      }
      scope = scope.parent;
    }

    if (!definingScope) {
      return this._naiveRename(msg.id, textDocument.uri, doc.text, oldName, newName);
    }

    // Collect edits: for each occurrence, check if it resolves to the same defining scope
    const edits = [];
    const docLines = doc.text.split('\n');
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp('\\b' + escaped + '\\b', 'g');

    for (let i = 0; i < docLines.length; i++) {
      let match;
      while ((match = wordRegex.exec(docLines[i])) !== null) {
        const matchLine = i + 1;   // 1-based
        const matchCol = match.index + 1;
        // Find the narrowest scope at this location
        const matchScope = cached.analyzer.globalScope.findScopeAtPosition(matchLine, matchCol);
        if (!matchScope) continue;

        // Walk up from matchScope to see if the name resolves to definingScope
        let resolvedScope = null;
        let s = matchScope;
        while (s) {
          if (s.symbols && s.symbols.has(oldName)) {
            resolvedScope = s;
            break;
          }
          s = s.parent;
        }

        if (resolvedScope === definingScope) {
          edits.push({
            range: {
              start: { line: i, character: match.index },
              end: { line: i, character: match.index + oldName.length },
            },
            newText: newName,
          });
        }
      }
    }

    // If scope-aware rename found nothing (e.g. positional info gaps), fall back
    if (edits.length === 0) {
      return this._naiveRename(msg.id, textDocument.uri, doc.text, oldName, newName);
    }

    this._respond(msg.id, {
      changes: { [textDocument.uri]: edits },
    });
  }

  _naiveRename(id, uri, text, oldName, newName) {
    const edits = [];
    const docLines = text.split('\n');
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp('\\b' + escaped + '\\b', 'g');

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

    this._respond(id, {
      changes: { [uri]: edits },
    });
  }

  // ─── References (scope-aware) ───────────────────────────

  _onReferences(msg) {
    const { position, textDocument } = msg.params;
    const doc = this._documents.get(textDocument.uri);
    if (!doc) return this._respond(msg.id, []);

    const line = doc.text.split('\n')[position.line] || '';
    const word = this._getWordAt(line, position.character);
    if (!word) return this._respond(msg.id, []);

    const cached = this._diagnosticsCache.get(textDocument.uri);
    if (!cached || !cached.analyzer || !cached.analyzer.globalScope) {
      // Fallback to naive text search if no scope info
      return this._naiveReferences(msg.id, textDocument.uri, doc.text, word);
    }

    // Find the scope at cursor and walk up to find the defining scope
    const cursorLine = position.line + 1;
    const cursorCol = position.character + 1;
    const cursorScope = cached.analyzer.globalScope.findScopeAtPosition(cursorLine, cursorCol);
    if (!cursorScope) {
      return this._naiveReferences(msg.id, textDocument.uri, doc.text, word);
    }

    let definingScope = null;
    let scope = cursorScope;
    while (scope) {
      if (scope.symbols && scope.symbols.has(word)) {
        definingScope = scope;
        break;
      }
      scope = scope.parent;
    }

    if (!definingScope) {
      return this._naiveReferences(msg.id, textDocument.uri, doc.text, word);
    }

    // Collect locations: for each text occurrence, check if it resolves to the same scope
    const locations = [];
    const docLines = doc.text.split('\n');
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp('\\b' + escaped + '\\b', 'g');

    for (let i = 0; i < docLines.length; i++) {
      let match;
      while ((match = wordRegex.exec(docLines[i])) !== null) {
        const matchLine = i + 1;
        const matchCol = match.index + 1;
        const matchScope = cached.analyzer.globalScope.findScopeAtPosition(matchLine, matchCol);
        if (!matchScope) continue;

        // Walk up from matchScope to see if the name resolves to definingScope
        let resolvedScope = null;
        let s = matchScope;
        while (s) {
          if (s.symbols && s.symbols.has(word)) {
            resolvedScope = s;
            break;
          }
          s = s.parent;
        }

        if (resolvedScope === definingScope) {
          locations.push({
            uri: textDocument.uri,
            range: {
              start: { line: i, character: match.index },
              end: { line: i, character: match.index + word.length },
            },
          });
        }
      }
    }

    // Fallback if scope-aware search found nothing (e.g. positional info gaps)
    if (locations.length === 0) {
      return this._naiveReferences(msg.id, textDocument.uri, doc.text, word);
    }

    this._respond(msg.id, locations);
  }

  _naiveReferences(id, uri, text, word) {
    const locations = [];
    const docLines = text.split('\n');
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRegex = new RegExp('\\b' + escaped + '\\b', 'g');

    for (let i = 0; i < docLines.length; i++) {
      let match;
      while ((match = wordRegex.exec(docLines[i])) !== null) {
        locations.push({
          uri: uri,
          range: {
            start: { line: i, character: match.index },
            end: { line: i, character: match.index + word.length },
          },
        });
      }
    }

    this._respond(id, locations);
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

  // ─── Inlay Hints ─────────────────────────────────────────

  _onInlayHint(msg) {
    const { textDocument, range } = msg.params;
    const cached = this._diagnosticsCache.get(textDocument.uri);
    const doc = this._documents.get(textDocument.uri);
    if (!cached || !cached.analyzer || !doc) return this._respond(msg.id, []);

    const hints = [];
    const docLines = doc.text.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;

    // ─── Type hints for variable bindings ─────────────
    // Match: `name = expr` and `var name = expr` (but NOT `name: Type = expr` which already has annotation)
    const bindingRegex = /^(\s*)(?:var\s+)?([a-zA-Z_]\w*)\s*=\s*(.+)/;
    const hasAnnotation = /^(\s*)(?:var\s+)?[a-zA-Z_]\w*\s*:\s*\w/;

    for (let i = startLine; i <= endLine && i < docLines.length; i++) {
      const line = docLines[i];

      // Skip lines that already have type annotations
      if (hasAnnotation.test(line)) continue;

      const bindMatch = bindingRegex.exec(line);
      if (bindMatch) {
        const varName = bindMatch[2];
        // Skip private/special names
        if (varName.startsWith('_') || varName === '_') continue;
        // Skip keywords that look like assignments
        if (['fn', 'if', 'for', 'while', 'match', 'type', 'import', 'return', 'let'].includes(varName)) continue;

        // Look up the symbol's inferred type
        const sym = this._findSymbolAtPosition(cached.analyzer, varName, { line: i, character: bindMatch[1].length + (line.includes('var ') ? 4 : 0) })
                 || this._findSymbolInScopes(cached.analyzer, varName);
        if (sym) {
          let typeStr = null;
          if (sym.inferredType) {
            typeStr = sym.inferredType;
          } else if (sym.typeAnnotation) {
            typeStr = sym.typeAnnotation;
          } else if (sym.type && typeof sym.type === 'object' && sym.type.name) {
            typeStr = sym.type.name;
          } else if (sym.kind === 'function') {
            typeStr = 'Function';
          }

          if (typeStr && typeStr !== 'Unknown' && typeStr !== 'Any') {
            // Position: right after the variable name
            const nameEnd = line.indexOf(varName) + varName.length;
            hints.push({
              position: { line: i, character: nameEnd },
              label: `: ${typeStr}`,
              kind: 1, // Type
              paddingLeft: false,
              paddingRight: true,
            });
          }
        }
      }

      // ─── Parameter name hints at call sites ─────────
      // Match function calls: name(arg1, arg2, ...)
      const callRegex = /\b([a-zA-Z_]\w*)\s*\(/g;
      let callMatch;
      while ((callMatch = callRegex.exec(line)) !== null) {
        const funcName = callMatch[1];
        // Skip keywords that look like function calls
        if (['if', 'for', 'while', 'match', 'fn', 'catch', 'switch'].includes(funcName)) continue;

        // Look up function signature
        const funcSym = this._findSymbolInScopes(cached.analyzer, funcName);
        const params = funcSym?._params;
        if (!params || params.length === 0) continue;

        // Parse the arguments (simplified — handles nested parens but not all edge cases)
        const argsStart = callMatch.index + callMatch[0].length;
        const argPositions = this._parseCallArgPositions(line, argsStart);

        for (let ai = 0; ai < argPositions.length && ai < params.length; ai++) {
          const argPos = argPositions[ai];
          const argText = line.slice(argPos.start, argPos.end).trim();
          // Don't show hint if the argument is already the parameter name
          if (argText === params[ai]) continue;
          // Don't show hints for single-argument calls with obvious context
          if (params.length === 1 && argText.length <= 3) continue;
          // Don't show for self parameter
          if (params[ai] === 'self') continue;

          hints.push({
            position: { line: i, character: argPos.start },
            label: `${params[ai]}:`,
            kind: 2, // Parameter
            paddingLeft: false,
            paddingRight: true,
          });
        }
      }
    }

    this._respond(msg.id, hints);
  }

  /**
   * Parse positions of arguments in a function call, handling nested parens.
   * Starts just after the opening '(' character.
   */
  _parseCallArgPositions(line, startIdx) {
    const positions = [];
    let depth = 0;
    let argStart = startIdx;
    let inStr = null;

    for (let i = startIdx; i < line.length; i++) {
      const ch = line[i];
      if (inStr) {
        if (ch === '\\') { i++; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
      if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) {
          // End of argument list
          if (i > argStart) {
            positions.push({ start: argStart, end: i });
          }
          break;
        }
        depth--;
        continue;
      }
      if (ch === ',' && depth === 0) {
        positions.push({ start: argStart, end: i });
        argStart = i + 1;
        // Skip whitespace after comma
        while (argStart < line.length && line[argStart] === ' ') argStart++;
      }
    }

    return positions;
  }

  // ─── Utilities ────────────────────────────────────────────

  _uriToPath(uri) {
    if (uri.startsWith('file://')) {
      let path = decodeURIComponent(uri.slice(7));
      // On Windows, file:///C:/path becomes /C:/path — strip leading slash
      if (/^\/[a-zA-Z]:/.test(path)) {
        path = path.slice(1);
      }
      return path;
    }
    return uri;
  }

  _getBuiltinDetail(name) {
    const src = BUILTIN_FUNCTIONS[name];
    if (!src) return 'Tova built-in';
    // Constants (const PI = ...)
    const constMatch = src.match(/^const\s+\w+\s*=/);
    if (constMatch) return 'const';
    // Functions — extract params from source
    const fnMatch = src.match(/^(?:async\s+)?function\s+\w+\s*\(([^)]*)\)/);
    if (fnMatch) {
      const params = fnMatch[1].trim();
      return params ? `fn(${params})` : 'fn()';
    }
    return 'Tova built-in';
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
            inferredType: sym.inferredType,
            _paramTypes: sym._paramTypes,
            _typeStructure: sym._typeStructure,
            _variantOf: sym._variantOf,
            type: sym.type,
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

  /**
   * Scope-aware symbol lookup using positional information.
   * Finds the narrowest scope containing the cursor position, then walks up.
   */
  _findSymbolAtPosition(analyzer, name, position) {
    if (!analyzer.globalScope) return null;
    const line = position.line + 1; // LSP is 0-based, our scopes are 1-based
    const column = position.character + 1;

    const scope = analyzer.globalScope.findScopeAtPosition(line, column);
    if (scope) {
      return scope.lookup(name);
    }
    return null;
  }
}

export { TovaLanguageServer };

// Auto-start when imported (for `tova lsp` command).
// Use startServer() export for explicit control.
export function startServer() {
  const server = new TovaLanguageServer();
  server.start();
  return server;
}

// Start automatically — callers that only want the class import should
// use dynamic import with test-aware filtering or call startServer() explicitly
const _autoStart = globalThis.__TOVA_LSP_NO_AUTOSTART !== true;
if (_autoStart) {
  startServer();
}
