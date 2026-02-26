import { describe, test, expect, beforeEach } from 'bun:test';

// We cannot import TovaLanguageServer directly because the module auto-starts
// the server on import. Instead, we replicate its internal state and test the
// LSP handler logic by building a lightweight harness that uses the same
// Lexer/Parser/Analyzer pipeline and method implementations.

import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Formatter } from '../src/formatter/formatter.js';
import { TypeRegistry } from '../src/analyzer/type-registry.js';
import { BUILTIN_NAMES, BUILTIN_FUNCTIONS } from '../src/stdlib/inline.js';

// ─── Harness: Lightweight LSP Server ─────────────────────────────
// Mirrors the internal state and methods of TovaLanguageServer so we
// can test handler logic without stdio transport.

function createServer() {
  const srv = {
    _documents: new Map(),
    _diagnosticsCache: new Map(),
    _lastResponse: null,
    _lastNotifications: [],
  };

  // Capture responses instead of writing to stdout
  srv._respond = (id, result) => {
    srv._lastResponse = { id, result };
  };
  srv._notify = (method, params) => {
    srv._lastNotifications.push({ method, params });
  };
  srv._logError = (msg) => {};
  srv._logInfo = (msg) => {};

  // ─── Utility methods (copied from server.js) ─────────────

  srv._uriToPath = (uri) => {
    if (uri.startsWith('file://')) {
      let path = decodeURIComponent(uri.slice(7));
      if (/^\/[a-zA-Z]:/.test(path)) path = path.slice(1);
      return path;
    }
    return uri;
  };

  srv._getWordAt = (line, character) => {
    let start = character;
    let end = character;
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) start--;
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
    return line.slice(start, end) || null;
  };

  srv._getBuiltinDetail = (name) => {
    const src = BUILTIN_FUNCTIONS[name];
    if (!src) return 'Tova built-in';
    const constMatch = src.match(/^const\s+\w+\s*=/);
    if (constMatch) return 'const';
    const fnMatch = src.match(/^(?:async\s+)?function\s+\w+\s*\(([^)]*)\)/);
    if (fnMatch) {
      const params = fnMatch[1].trim();
      return params ? `fn(${params})` : 'fn()';
    }
    return 'Tova built-in';
  };

  srv._collectSymbols = (analyzer) => {
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
            _params: sym._params,
          });
        }
      }
      if (scope.children) {
        for (const child of scope.children) walkScope(child);
      }
    };
    if (analyzer.globalScope) walkScope(analyzer.globalScope);
    else if (analyzer.currentScope) walkScope(analyzer.currentScope);
    return symbols;
  };

  srv._findSymbolInScopes = (analyzer, name) => {
    const walkScope = (scope) => {
      if (!scope) return null;
      if (scope.symbols?.has(name)) return scope.symbols.get(name);
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
  };

  srv._findSymbolAtPosition = (analyzer, name, position) => {
    if (!analyzer.globalScope) return null;
    const line = position.line + 1;
    const column = position.character + 1;
    const scope = analyzer.globalScope.findScopeAtPosition(line, column);
    if (scope) return scope.lookup(name);
    return null;
  };

  srv._getDiagnosticSeverity = (diagnostic) => {
    const msg = diagnostic.message || '';
    if (msg.includes('declared but never used')) return 4;
    if (msg.includes('shadows a binding')) return 3;
    if (msg.includes('Non-exhaustive match')) return 2;
    if (msg.includes('Type mismatch')) return 1;
    if (msg.includes('should use snake_case') || msg.includes('should use PascalCase')) return 4;
    return 2;
  };

  srv._getDotCompletions = (uri, objectName, partial) => {
    const items = [];
    const cached = srv._diagnosticsCache.get(uri);
    if (!cached?.analyzer) return items;
    const sym = srv._findSymbolInScopes(cached.analyzer, objectName);
    if (!sym) return items;
    let typeName = null;
    if (sym.inferredType) typeName = sym.inferredType;
    else if (sym._variantOf) typeName = sym._variantOf;
    else if (sym.kind === 'type' && sym._typeStructure) typeName = sym.name;
    if (!typeName) return items;
    const typeRegistry = cached.typeRegistry;
    if (typeRegistry) {
      const members = typeRegistry.getMembers(typeName);
      for (const [fieldName, fieldType] of members.fields) {
        if (!partial || fieldName.startsWith(partial)) {
          items.push({
            label: fieldName,
            kind: 5,
            detail: fieldType ? fieldType.toString() : 'field',
            sortText: `0${fieldName}`,
          });
        }
      }
      for (const method of members.methods) {
        if (!partial || method.name.startsWith(partial)) {
          const paramStr = (method.params || []).filter(p => p !== 'self').join(', ');
          const retStr = method.returnType ? ` -> ${method.returnType}` : '';
          items.push({
            label: method.name,
            kind: 2,
            detail: `fn(${paramStr})${retStr}`,
            sortText: `1${method.name}`,
          });
        }
      }
    }
    return items;
  };

  srv._getMatchCompletions = (uri, text, position) => {
    const items = [];
    const lines = text.split('\n');
    let matchSubject = null;
    let braceDepth = 0;
    for (let i = position.line; i >= 0; i--) {
      const lineText = lines[i] || '';
      for (let j = (i === position.line ? position.character : lineText.length) - 1; j >= 0; j--) {
        if (lineText[j] === '}') braceDepth++;
        if (lineText[j] === '{') {
          braceDepth--;
          if (braceDepth < 0) {
            const beforeBrace = lineText.slice(0, j).trim();
            const matchExpr = beforeBrace.match(/match\s+(\w+)\s*$/);
            if (matchExpr) matchSubject = matchExpr[1];
            break;
          }
        }
      }
      if (matchSubject || braceDepth < 0) break;
    }
    if (!matchSubject) return items;
    const cached = srv._diagnosticsCache.get(uri);
    if (!cached?.analyzer) return items;
    const sym = srv._findSymbolInScopes(cached.analyzer, matchSubject);
    let typeName = sym?.inferredType || sym?._variantOf;
    if (typeName && cached.typeRegistry) {
      const variants = cached.typeRegistry.getVariantNames(typeName);
      for (const variant of variants) {
        items.push({ label: variant, kind: 20, detail: `variant of ${typeName}` });
      }
    }
    if (typeName === 'Result' || (typeName && typeName.startsWith('Result<'))) {
      if (!items.some(i => i.label === 'Ok')) items.push({ label: 'Ok', kind: 20, detail: 'Result variant' });
      if (!items.some(i => i.label === 'Err')) items.push({ label: 'Err', kind: 20, detail: 'Result variant' });
    }
    if (typeName === 'Option' || (typeName && typeName.startsWith('Option<'))) {
      if (!items.some(i => i.label === 'Some')) items.push({ label: 'Some', kind: 20, detail: 'Option variant' });
      if (!items.some(i => i.label === 'None')) items.push({ label: 'None', kind: 20, detail: 'Option variant' });
    }
    return items;
  };

  srv._parseCallArgPositions = (line, startIdx) => {
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
          if (i > argStart) positions.push({ start: argStart, end: i });
          break;
        }
        depth--;
        continue;
      }
      if (ch === ',' && depth === 0) {
        positions.push({ start: argStart, end: i });
        argStart = i + 1;
        while (argStart < line.length && line[argStart] === ' ') argStart++;
      }
    }
    return positions;
  };

  // ─── Handler methods (faithfully replicated from server.js) ───

  srv._onCompletion = (msg) => {
    const { position, textDocument } = msg.params;
    const doc = srv._documents.get(textDocument.uri);
    if (!doc) return srv._respond(msg.id, []);
    const items = [];
    const line = doc.text.split('\n')[position.line] || '';
    const before = line.slice(0, position.character);
    // CASE 1: Dot completion
    const dotMatch = before.match(/(\w+)\.\s*(\w*)$/);
    if (dotMatch) {
      const objectName = dotMatch[1];
      const partial = dotMatch[2] || '';
      const dotItems = srv._getDotCompletions(textDocument.uri, objectName, partial);
      if (dotItems.length > 0) return srv._respond(msg.id, dotItems.slice(0, 50));
    }
    // CASE 2: Type annotation
    const typeMatch = before.match(/:\s*(\w*)$/);
    if (typeMatch) {
      const partial = typeMatch[1] || '';
      const typeNames = ['Int', 'Float', 'String', 'Bool', 'Nil', 'Any', 'Result', 'Option', 'Function'];
      const cached = srv._diagnosticsCache.get(textDocument.uri);
      if (cached?.analyzer) {
        const symbols = srv._collectSymbols(cached.analyzer);
        for (const sym of symbols) {
          if (sym.kind === 'type' && !typeNames.includes(sym.name)) typeNames.push(sym.name);
        }
      }
      for (const name of typeNames) {
        if (name.toLowerCase().startsWith(partial.toLowerCase())) {
          items.push({ label: name, kind: 22, detail: 'type' });
        }
      }
      return srv._respond(msg.id, items.slice(0, 50));
    }
    // CASE 3: Match arm
    const matchItems = srv._getMatchCompletions(textDocument.uri, doc.text, position);
    if (matchItems.length > 0) return srv._respond(msg.id, matchItems.slice(0, 50));
    // CASE 4: Default
    const prefix = before.split(/[^a-zA-Z0-9_]/).pop() || '';
    const keywords = [
      'fn', 'let', 'if', 'elif', 'else', 'for', 'while', 'loop', 'when', 'in',
      'return', 'match', 'type', 'import', 'from', 'true', 'false',
      'nil', 'server', 'browser', 'client', 'shared', 'pub', 'mut',
      'try', 'catch', 'finally', 'break', 'continue', 'async', 'await',
      'guard', 'interface', 'derive', 'route', 'model', 'db',
    ];
    for (const kw of keywords) {
      if (kw.startsWith(prefix)) items.push({ label: kw, kind: 14 });
    }
    for (const fn of BUILTIN_NAMES) {
      if (fn.startsWith(prefix) && !fn.startsWith('__')) {
        const detail = srv._getBuiltinDetail(fn);
        items.push({ label: fn, kind: 3, detail });
      }
    }
    for (const rt of ['Ok', 'Err', 'Some', 'None']) {
      if (rt.startsWith(prefix)) items.push({ label: rt, kind: 3, detail: 'Tova built-in' });
    }
    const cached = srv._diagnosticsCache.get(textDocument.uri);
    if (cached?.analyzer) {
      const symbols = srv._collectSymbols(cached.analyzer);
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
    srv._respond(msg.id, items.slice(0, 50));
  };

  srv._onHover = (msg) => {
    const { position, textDocument } = msg.params;
    const cached = srv._diagnosticsCache.get(textDocument.uri);
    if (!cached?.analyzer) return srv._respond(msg.id, null);
    const doc = srv._documents.get(textDocument.uri);
    if (!doc) return srv._respond(msg.id, null);
    const line = doc.text.split('\n')[position.line] || '';
    const word = srv._getWordAt(line, position.character);
    if (!word) return srv._respond(msg.id, null);

    // Builtin docs (subset for testing)
    const builtinDocs = {
      'print': '`fn print(...args)` -- Print values to console',
      'len': '`fn len(v)` -- Get length of string, array, or object',
      'range': '`fn range(start, end?, step?)` -- Generate array of numbers',
      'Ok': '`Ok(value) -> Result` -- Create a successful Result\n\nMethods: `.map(fn)`, `.flatMap(fn)`, `.andThen(fn)`, `.unwrap()`, `.unwrapOr(default)`, `.isOk()`, `.isErr()`, `.mapErr(fn)`',
      'Err': '`Err(error) -> Result` -- Create an error Result\n\nMethods: `.unwrapOr(default)`, `.isOk()`, `.isErr()`, `.mapErr(fn)`, `.unwrapErr()`',
      'Some': '`Some(value) -> Option` -- Create an Option with a value\n\nMethods: `.map(fn)`, `.flatMap(fn)`, `.andThen(fn)`, `.unwrap()`, `.unwrapOr(default)`, `.isSome()`, `.isNone()`, `.filter(fn)`',
      'None': '`None` -- Empty Option value\n\nMethods: `.unwrapOr(default)`, `.isSome()`, `.isNone()`',
      'filter': '`fn filter(arr, fn) -> [T]` -- Filter array by predicate',
      'map': '`fn map(arr, fn) -> [U]` -- Transform each element',
      'sum': '`fn sum(arr) -> Float` -- Sum all elements in array',
      'sorted': '`fn sorted(arr, key?) -> [T]` -- Return sorted copy of array',
    };

    if (builtinDocs[word]) {
      return srv._respond(msg.id, {
        contents: { kind: 'markdown', value: builtinDocs[word] },
      });
    }

    const symbol = srv._findSymbolAtPosition(cached.analyzer, word, position) ||
                   srv._findSymbolInScopes(cached.analyzer, word);
    if (symbol) {
      let hoverText = `**${word}**`;
      if (symbol.kind) hoverText += ` *(${symbol.kind})*`;
      if (symbol.inferredType) hoverText += `\n\nType: \`${symbol.inferredType}\``;
      if (symbol.typeAnnotation) hoverText += `\n\nType: \`${symbol.typeAnnotation}\``;
      else if (symbol.type && typeof symbol.type === 'object' && symbol.type.type === 'TypeAnnotation') {
        hoverText += `\n\nReturn type: \`${symbol.type.name}\``;
      }
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
      if (symbol.kind === 'type' && symbol._typeStructure) {
        const structure = symbol._typeStructure;
        if (structure.variants && structure.variants.size > 0) {
          const variantStrs = [];
          for (const [vName, fields] of structure.variants) {
            if (fields.size > 0) {
              const fieldStrs = [];
              for (const [fName, fType] of fields) fieldStrs.push(`${fName}: ${fType}`);
              variantStrs.push(`  ${vName}(${fieldStrs.join(', ')})`);
            } else {
              variantStrs.push(`  ${vName}`);
            }
          }
          hoverText += `\n\n\`\`\`\ntype ${word} {\n${variantStrs.join('\n')}\n}\n\`\`\``;
        }
      }
      return srv._respond(msg.id, { contents: { kind: 'markdown', value: hoverText } });
    }
    srv._respond(msg.id, null);
  };

  srv._onDefinition = (msg) => {
    const { position, textDocument } = msg.params;
    const cached = srv._diagnosticsCache.get(textDocument.uri);
    if (!cached?.analyzer) return srv._respond(msg.id, null);
    const doc = srv._documents.get(textDocument.uri);
    if (!doc) return srv._respond(msg.id, null);
    const line = doc.text.split('\n')[position.line] || '';
    const word = srv._getWordAt(line, position.character);
    if (!word) return srv._respond(msg.id, null);
    const symbol = srv._findSymbolAtPosition(cached.analyzer, word, position) ||
                   srv._findSymbolInScopes(cached.analyzer, word);
    if (symbol?.loc) {
      srv._respond(msg.id, {
        uri: textDocument.uri,
        range: {
          start: { line: (symbol.loc.line || 1) - 1, character: (symbol.loc.column || 1) - 1 },
          end: { line: (symbol.loc.line || 1) - 1, character: (symbol.loc.column || 1) - 1 + word.length },
        },
      });
    } else {
      srv._respond(msg.id, null);
    }
  };

  srv._onReferences = (msg) => {
    const { position, textDocument } = msg.params;
    const doc = srv._documents.get(textDocument.uri);
    if (!doc) return srv._respond(msg.id, []);
    const line = doc.text.split('\n')[position.line] || '';
    const word = srv._getWordAt(line, position.character);
    if (!word) return srv._respond(msg.id, []);
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
    srv._respond(msg.id, locations);
  };

  srv._onSignatureHelp = (msg) => {
    const { position, textDocument } = msg.params;
    const doc = srv._documents.get(textDocument.uri);
    if (!doc) return srv._respond(msg.id, null);
    const line = doc.text.split('\n')[position.line] || '';
    const before = line.slice(0, position.character);
    let depth = 0;
    let parenPos = -1;
    for (let i = before.length - 1; i >= 0; i--) {
      if (before[i] === ')') depth++;
      else if (before[i] === '(') {
        if (depth === 0) { parenPos = i; break; }
        depth--;
      }
    }
    if (parenPos === -1) return srv._respond(msg.id, null);
    const funcMatch = before.slice(0, parenPos).match(/(\w+)\s*$/);
    if (!funcMatch) return srv._respond(msg.id, null);
    const funcName = funcMatch[1];
    const afterParen = before.slice(parenPos + 1);
    let activeParam = 0;
    let parenDepth = 0;
    for (const ch of afterParen) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === ',' && parenDepth === 0) activeParam++;
    }
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
      return srv._respond(msg.id, {
        signatures: [{ label: sig.label, parameters: sig.params.map(p => ({ label: p.label })) }],
        activeSignature: 0,
        activeParameter: Math.min(activeParam, sig.params.length - 1),
      });
    }
    const cached = srv._diagnosticsCache.get(textDocument.uri);
    if (cached?.analyzer) {
      const symbol = srv._findSymbolInScopes(cached.analyzer, funcName);
      if (symbol?._params) {
        return srv._respond(msg.id, {
          signatures: [{
            label: `${funcName}(${symbol._params.join(', ')})`,
            parameters: symbol._params.map(p => ({ label: p })),
          }],
          activeSignature: 0,
          activeParameter: Math.max(0, Math.min(activeParam, symbol._params.length - 1)),
        });
      }
    }
    srv._respond(msg.id, null);
  };

  srv._onCodeAction = (msg) => {
    const { textDocument, range, context } = msg.params;
    const doc = srv._documents.get(textDocument.uri);
    if (!doc) return srv._respond(msg.id, []);
    const actions = [];
    const diagnostics = context.diagnostics || [];
    for (const diag of diagnostics) {
      const message = diag.message || '';
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
        // Also offer suppress with comment
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
    }
    srv._respond(msg.id, actions);
  };

  srv._onInlayHint = (msg) => {
    const { textDocument, range } = msg.params;
    const cached = srv._diagnosticsCache.get(textDocument.uri);
    const doc = srv._documents.get(textDocument.uri);
    if (!cached || !cached.analyzer || !doc) return srv._respond(msg.id, []);
    const hints = [];
    const docLines = doc.text.split('\n');
    const startLine = range.start.line;
    const endLine = range.end.line;
    const bindingRegex = /^(\s*)(?:var\s+)?([a-zA-Z_]\w*)\s*=\s*(.+)/;
    const hasAnnotation = /^(\s*)(?:var\s+)?[a-zA-Z_]\w*\s*:\s*\w/;
    for (let i = startLine; i <= endLine && i < docLines.length; i++) {
      const line = docLines[i];
      if (hasAnnotation.test(line)) continue;
      const bindMatch = bindingRegex.exec(line);
      if (bindMatch) {
        const varName = bindMatch[2];
        if (varName.startsWith('_') || varName === '_') continue;
        if (['fn', 'if', 'for', 'while', 'match', 'type', 'import', 'return', 'let'].includes(varName)) continue;
        const sym = srv._findSymbolAtPosition(cached.analyzer, varName, { line: i, character: bindMatch[1].length + (line.includes('var ') ? 4 : 0) })
                 || srv._findSymbolInScopes(cached.analyzer, varName);
        if (sym) {
          let typeStr = null;
          if (sym.inferredType) typeStr = sym.inferredType;
          else if (sym.typeAnnotation) typeStr = sym.typeAnnotation;
          else if (sym.type && typeof sym.type === 'object' && sym.type.name) typeStr = sym.type.name;
          else if (sym.kind === 'function') typeStr = 'Function';
          if (typeStr && typeStr !== 'Unknown' && typeStr !== 'Any') {
            const nameEnd = line.indexOf(varName) + varName.length;
            hints.push({
              position: { line: i, character: nameEnd },
              label: `: ${typeStr}`,
              kind: 1,
              paddingLeft: false,
              paddingRight: true,
            });
          }
        }
      }
      const callRegex = /\b([a-zA-Z_]\w*)\s*\(/g;
      let callMatch;
      while ((callMatch = callRegex.exec(line)) !== null) {
        const funcName = callMatch[1];
        if (['if', 'for', 'while', 'match', 'fn', 'catch', 'switch'].includes(funcName)) continue;
        const funcSym = srv._findSymbolInScopes(cached.analyzer, funcName);
        const params = funcSym?._params;
        if (!params || params.length === 0) continue;
        const argsStart = callMatch.index + callMatch[0].length;
        const argPositions = srv._parseCallArgPositions(line, argsStart);
        for (let ai = 0; ai < argPositions.length && ai < params.length; ai++) {
          const argPos = argPositions[ai];
          const argText = line.slice(argPos.start, argPos.end).trim();
          if (argText === params[ai]) continue;
          if (params.length === 1 && argText.length <= 3) continue;
          if (params[ai] === 'self') continue;
          hints.push({
            position: { line: i, character: argPos.start },
            label: `${params[ai]}:`,
            kind: 2,
            paddingLeft: false,
            paddingRight: true,
          });
        }
      }
    }
    srv._respond(msg.id, hints);
  };

  srv._onWorkspaceSymbol = (msg) => {
    const query = (msg.params.query || '').toLowerCase();
    const results = [];
    for (const [uri, cached] of srv._diagnosticsCache) {
      if (!cached?.analyzer) continue;
      const symbols = srv._collectSymbols(cached.analyzer);
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
    srv._respond(msg.id, results.slice(0, 100));
  };

  return srv;
}

// ─── Helper: set up a document in the server ─────────────────────
function setupDocument(srv, uri, source) {
  srv._documents.set(uri, { text: source, version: 1 });
  const filename = srv._uriToPath(uri);

  try {
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, filename);
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, filename, { strict: true });
    const { warnings } = analyzer.analyze();
    const typeRegistry = TypeRegistry.fromAnalyzer(analyzer);
    srv._diagnosticsCache.set(uri, { ast, analyzer, text: source, typeRegistry });
    return { ast, analyzer, warnings, typeRegistry };
  } catch (err) {
    // Still cache partial AST if available
    if (err.partialAST) {
      try {
        const analyzer = new Analyzer(err.partialAST, filename, { tolerant: true, strict: true });
        analyzer.analyze();
        const typeRegistry = TypeRegistry.fromAnalyzer(analyzer);
        srv._diagnosticsCache.set(uri, { ast: err.partialAST, analyzer, text: source, typeRegistry });
      } catch (_) {
        srv._diagnosticsCache.set(uri, { ast: err.partialAST, text: source });
      }
    }
    return { error: err };
  }
}

// ─── Helper: make an LSP request message ─────────────────────────
function makeMsg(id, params) {
  return { id, params };
}

// ─── Constants ───────────────────────────────────────────────────
const TEST_URI = 'file:///test/test.tova';


// ================================================================
//  TESTS
// ================================================================

describe('LSP Coverage: Completion -- keyword completions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
    setupDocument(srv, TEST_URI, 'x = 10\n');
  });

  test('prefix "fn" returns fn keyword', () => {
    srv._documents.set(TEST_URI, { text: 'fn', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const kwItems = items.filter(i => i.kind === 14);
    const labels = kwItems.map(i => i.label);
    expect(labels).toContain('fn');
  });

  test('prefix "gu" returns guard keyword', () => {
    srv._documents.set(TEST_URI, { text: 'gu', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('guard');
  });

  test('prefix "br" returns break keyword', () => {
    srv._documents.set(TEST_URI, { text: 'br', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('break');
  });

  test('prefix "as" returns async keyword', () => {
    srv._documents.set(TEST_URI, { text: 'as', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const kwLabels = items.filter(i => i.kind === 14).map(i => i.label);
    expect(kwLabels).toContain('async');
  });

  test('prefix "aw" returns await keyword', () => {
    srv._documents.set(TEST_URI, { text: 'aw', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const kwLabels = items.filter(i => i.kind === 14).map(i => i.label);
    expect(kwLabels).toContain('await');
  });

  test('empty prefix returns all keywords', () => {
    srv._documents.set(TEST_URI, { text: '\n', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    const items = srv._lastResponse.result;
    const kwLabels = items.filter(i => i.kind === 14).map(i => i.label);
    expect(kwLabels).toContain('fn');
    expect(kwLabels).toContain('if');
    expect(kwLabels).toContain('match');
    expect(kwLabels).toContain('type');
    expect(kwLabels).toContain('for');
    expect(kwLabels).toContain('while');
    expect(kwLabels).toContain('guard');
    expect(kwLabels).toContain('interface');
    expect(kwLabels).toContain('derive');
  });
});

describe('LSP Coverage: Completion -- builtin type completions (after colon)', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('typing ":" triggers type completions', () => {
    const source = 'fn foo(x: )';
    setupDocument(srv, TEST_URI, source);
    // Cursor right after ": " at position 10
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 10 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('Int');
    expect(labels).toContain('Float');
    expect(labels).toContain('String');
    expect(labels).toContain('Bool');
    expect(labels).toContain('Result');
    expect(labels).toContain('Option');
    // All should be kind 22 (Struct)
    for (const item of items) {
      expect(item.kind).toBe(22);
    }
  });

  test('partial type annotation narrows results', () => {
    const source = 'fn foo(x: St)';
    setupDocument(srv, TEST_URI, source);
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 12 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('String');
    expect(labels).not.toContain('Int');
    expect(labels).not.toContain('Float');
  });

  test('user-defined types appear in type completions', () => {
    const source = `type Point {\n  x: Int\n  y: Int\n}\nfn foo(p: )`;
    setupDocument(srv, TEST_URI, source);
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 4, character: 10 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('Point');
    expect(labels).toContain('Int');
  });
});

describe('LSP Coverage: Completion -- builtin function completions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
    setupDocument(srv, TEST_URI, 'x = 10\n');
  });

  test('prefix "pr" includes print builtin', () => {
    srv._documents.set(TEST_URI, { text: 'pr', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const builtinItems = items.filter(i => i.kind === 3);
    const labels = builtinItems.map(i => i.label);
    expect(labels).toContain('print');
  });

  test('prefix "so" includes sorted and some builtins', () => {
    srv._documents.set(TEST_URI, { text: 'so', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('sorted');
  });

  test('builtin completions include detail (signature)', () => {
    srv._documents.set(TEST_URI, { text: 'le', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const lenItem = items.find(i => i.label === 'len');
    expect(lenItem).toBeDefined();
    expect(lenItem.kind).toBe(3); // Function
    expect(lenItem.detail).toBeDefined();
  });

  test('Result/Option constructors appear in completions', () => {
    srv._documents.set(TEST_URI, { text: 'Ok', version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('Ok');
  });
});

describe('LSP Coverage: Completion -- user-defined symbol completions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('user functions appear in completions', () => {
    const source = `fn my_helper(x) {\n  return x * 2\n}\nmy`;
    setupDocument(srv, TEST_URI, source);
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('my_helper');
  });

  test('user variables appear in completions', () => {
    const source = `my_value = 42\nmy`;
    setupDocument(srv, TEST_URI, source);
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 1, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('my_value');
  });

  test('user types appear in completions', () => {
    const source = `type MyColor { Red, Green, Blue }\nMy`;
    setupDocument(srv, TEST_URI, source);
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 1, character: 2 },
    }));
    const items = srv._lastResponse.result;
    const labels = items.map(i => i.label);
    expect(labels).toContain('MyColor');
  });
});

describe('LSP Coverage: Completion -- no document returns empty', () => {
  test('completion on unknown URI returns empty array', () => {
    const srv = createServer();
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: 'file:///nonexistent.tova' },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toEqual([]);
  });
});

describe('LSP Coverage: Hover -- builtin functions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
    const source = `x = print(len(range(10)))`;
    setupDocument(srv, TEST_URI, source);
  });

  test('hover on "print" shows builtin docs', () => {
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 5 }, // on "print"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.kind).toBe('markdown');
    expect(result.contents.value).toContain('print');
    expect(result.contents.value).toContain('Print values to console');
  });

  test('hover on "len" shows builtin docs', () => {
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 11 }, // on "len"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('len');
    expect(result.contents.value).toContain('length');
  });

  test('hover on "range" shows builtin docs', () => {
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 15 }, // on "range"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('range');
  });
});

describe('LSP Coverage: Hover -- user-defined symbols', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('hover on user function shows kind and signature', () => {
    const source = `fn add(a, b) {\n  return a + b\n}\nadd(1, 2)`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 4 }, // on "add"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('**add**');
    expect(result.contents.value).toContain('function');
    expect(result.contents.value).toContain('Signature');
    expect(result.contents.value).toContain('fn add(a, b)');
  });

  test('hover on user variable shows kind', () => {
    const source = `my_val = 42\nprint(my_val)`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 }, // on "my_val"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('**my_val**');
  });

  test('hover on user type shows type structure', () => {
    const source = `type Shape {\n  Circle(radius: Float)\n  Rectangle(width: Float, height: Float)\n}`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 6 }, // on "Shape"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('**Shape**');
    expect(result.contents.value).toContain('type');
  });

  test('hover returns null for whitespace', () => {
    const source = `x  =  10`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 }, // on space between x and =
    }));
    const result = srv._lastResponse.result;
    expect(result).toBeNull();
  });
});

describe('LSP Coverage: Hover -- no document or cache returns null', () => {
  test('hover without cached analyzer returns null', () => {
    const srv = createServer();
    srv._documents.set(TEST_URI, { text: 'x = 10', version: 1 });
    // No diagnostics cache
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toBeNull();
  });

  test('hover without document returns null', () => {
    const srv = createServer();
    setupDocument(srv, TEST_URI, 'x = 10');
    srv._documents.delete(TEST_URI); // remove the document
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toBeNull();
  });
});

describe('LSP Coverage: Go-to-definition -- user-defined symbols', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('go-to-definition on function call jumps to declaration', () => {
    const source = `fn greet(name) {\n  return name\n}\ngreet("world")`;
    setupDocument(srv, TEST_URI, source);
    srv._onDefinition(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 2 }, // on "greet" in call
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.uri).toBe(TEST_URI);
    // Should point to line 0 where "fn greet" is declared
    expect(result.range.start.line).toBe(0);
  });

  test('go-to-definition on variable usage jumps to declaration', () => {
    const source = `my_count = 0\nprint(my_count)`;
    setupDocument(srv, TEST_URI, source);
    srv._onDefinition(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 1, character: 7 }, // on "my_count" in print
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.uri).toBe(TEST_URI);
    expect(result.range.start.line).toBe(0);
  });

  test('go-to-definition on type name jumps to type declaration', () => {
    const source = `type Color { Red, Green, Blue }\nprint(Color)`;
    setupDocument(srv, TEST_URI, source);
    srv._onDefinition(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 1, character: 7 }, // on "Color" in print
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.range.start.line).toBe(0);
  });

  test('go-to-definition returns null without cache', () => {
    const srv = createServer();
    srv._documents.set(TEST_URI, { text: 'x = 10', version: 1 });
    srv._onDefinition(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toBeNull();
  });

  test('go-to-definition returns null without document', () => {
    const srv = createServer();
    setupDocument(srv, TEST_URI, 'x = 10');
    srv._documents.delete(TEST_URI);
    srv._onDefinition(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toBeNull();
  });
});

describe('LSP Coverage: Find references', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('finds all references of a variable', () => {
    const source = `x = 10\ny = x + 1\nz = x * 2\nprint(x)`;
    setupDocument(srv, TEST_URI, source);
    srv._onReferences(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 }, // on "x"
    }));
    const result = srv._lastResponse.result;
    expect(result.length).toBe(4); // x=10, x+1, x*2, print(x)
    for (const loc of result) {
      expect(loc.uri).toBe(TEST_URI);
    }
  });

  test('finds all references of a function', () => {
    const source = `fn add(a, b) {\n  return a + b\n}\nadd(1, 2)\nadd(3, 4)`;
    setupDocument(srv, TEST_URI, source);
    srv._onReferences(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 4 }, // on "add" in declaration
    }));
    const result = srv._lastResponse.result;
    expect(result.length).toBe(3); // fn add, add(1,2), add(3,4)
  });

  test('returns empty array when cursor is on whitespace', () => {
    const source = `x = 10`;
    setupDocument(srv, TEST_URI, source);
    srv._onReferences(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 2 }, // on space between x and =
    }));
    const result = srv._lastResponse.result;
    expect(result).toEqual([]);
  });

  test('returns empty when no document', () => {
    const srv = createServer();
    srv._onReferences(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toEqual([]);
  });

  test('references include correct character positions', () => {
    const source = `name = "Alice"\nprint(name)`;
    setupDocument(srv, TEST_URI, source);
    srv._onReferences(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 1 }, // on "name"
    }));
    const result = srv._lastResponse.result;
    expect(result.length).toBe(2);
    // First reference: "name" at line 0, char 0
    expect(result[0].range.start.line).toBe(0);
    expect(result[0].range.start.character).toBe(0);
    expect(result[0].range.end.character).toBe(4);
    // Second reference: "name" at line 1 inside print()
    expect(result[1].range.start.line).toBe(1);
  });
});

describe('LSP Coverage: Signature help -- builtin functions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
    setupDocument(srv, TEST_URI, 'x = 10\n');
  });

  test('signature help for range() shows 3 params', () => {
    srv._documents.set(TEST_URI, { text: 'range(1, ', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 9 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('range(start, end, step?)');
    expect(result.signatures[0].parameters.length).toBe(3);
    expect(result.activeParameter).toBe(1); // after first comma
  });

  test('signature help for print() shows params', () => {
    srv._documents.set(TEST_URI, { text: 'print(', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 6 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('print(...args)');
    expect(result.activeParameter).toBe(0);
  });

  test('signature help for Ok() shows value param', () => {
    srv._documents.set(TEST_URI, { text: 'Ok(', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 3 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('Ok(value)');
  });

  test('signature help for Some() shows value param', () => {
    srv._documents.set(TEST_URI, { text: 'Some(', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 5 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('Some(value)');
  });

  test('signature help for Err() shows error param', () => {
    srv._documents.set(TEST_URI, { text: 'Err(', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 4 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('Err(error)');
  });

  test('activeParameter increments with commas', () => {
    srv._documents.set(TEST_URI, { text: 'range(1, 2, ', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 12 },
    }));
    const result = srv._lastResponse.result;
    expect(result.activeParameter).toBe(2); // after second comma
  });

  test('activeParameter is clamped to max params', () => {
    srv._documents.set(TEST_URI, { text: 'range(1, 2, 3, ', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 15 },
    }));
    const result = srv._lastResponse.result;
    // range has 3 params, so activeParameter should be clamped to 2
    expect(result.activeParameter).toBe(2);
  });
});

describe('LSP Coverage: Signature help -- user-defined functions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('signature help for user function shows params', () => {
    const source = `fn calculate(x, y, z) {\n  return x + y + z\n}\ncalculate(1, `;
    setupDocument(srv, TEST_URI, source);
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 13 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('calculate(x, y, z)');
    expect(result.signatures[0].parameters.length).toBe(3);
    expect(result.activeParameter).toBe(1);
  });

  test('signature help returns null when not in a call', () => {
    const source = `x = 10`;
    setupDocument(srv, TEST_URI, source);
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 6 },
    }));
    expect(srv._lastResponse.result).toBeNull();
  });

  test('signature help returns null for unknown function', () => {
    const source = `unknown_fn(1, 2)`;
    setupDocument(srv, TEST_URI, source);
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 14 },
    }));
    // unknown_fn is not in builtins or user-defined
    expect(srv._lastResponse.result).toBeNull();
  });

  test('signature help without document returns null', () => {
    const srv = createServer();
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 0 },
    }));
    expect(srv._lastResponse.result).toBeNull();
  });

  test('signature help handles nested function calls', () => {
    const source = `fn outer(a, b) {\n  return a + b\n}\nfn inner(x) {\n  return x\n}\nouter(inner(1), `;
    setupDocument(srv, TEST_URI, source);
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 6, character: 16 }, // after "inner(1), "
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    // Should resolve to outer(), not inner(), because inner(1) is closed
    expect(result.signatures[0].label).toBe('outer(a, b)');
    expect(result.activeParameter).toBe(1);
  });
});

describe('LSP Coverage: Code actions -- unused variable', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('offers "prefix with _" for unused variable', () => {
    const source = `fn foo() {\n  unused = 10\n  return 1\n}`;
    setupDocument(srv, TEST_URI, source);
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
      context: {
        diagnostics: [{
          range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
          message: "'unused' is declared but never used",
        }],
      },
    }));
    const actions = srv._lastResponse.result;
    expect(actions.length).toBeGreaterThanOrEqual(1);
    const prefixAction = actions.find(a => a.title.includes('Prefix'));
    expect(prefixAction).toBeDefined();
    expect(prefixAction.title).toBe("Prefix 'unused' with _");
    expect(prefixAction.kind).toBe('quickfix');
    expect(prefixAction.edit.changes[TEST_URI][0].newText).toBe('_unused');
  });

  test('offers suppress comment for unused variable', () => {
    const source = `fn foo() {\n  unused = 10\n  return 1\n}`;
    setupDocument(srv, TEST_URI, source);
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
      context: {
        diagnostics: [{
          range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
          message: "'unused' is declared but never used",
        }],
      },
    }));
    const actions = srv._lastResponse.result;
    const suppressAction = actions.find(a => a.title.includes('Suppress'));
    expect(suppressAction).toBeDefined();
    expect(suppressAction.title).toContain('tova-ignore');
    expect(suppressAction.edit.changes[TEST_URI][0].newText).toContain('// tova-ignore W001');
  });
});

describe('LSP Coverage: Code actions -- did you mean suggestion', () => {
  test('offers replacement for misspelled identifier', () => {
    const srv = createServer();
    const source = `fn greet(name) {\n  return name\n}\ngreet("world")\ngret("again")`;
    setupDocument(srv, TEST_URI, source);
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 4, character: 0 }, end: { line: 4, character: 4 } },
      context: {
        diagnostics: [{
          range: { start: { line: 4, character: 0 }, end: { line: 4, character: 4 } },
          message: "'gret' is not defined (hint: did you mean 'greet'?)",
        }],
      },
    }));
    const actions = srv._lastResponse.result;
    const replaceAction = actions.find(a => a.title.includes('Replace'));
    expect(replaceAction).toBeDefined();
    expect(replaceAction.title).toBe("Replace 'gret' with 'greet'");
    expect(replaceAction.isPreferred).toBe(true);
    expect(replaceAction.edit.changes[TEST_URI][0].newText).toBe('greet');
  });
});

describe('LSP Coverage: Code actions -- naming convention', () => {
  test('offers rename for snake_case violation', () => {
    const srv = createServer();
    const source = `fn myFunc() {\n  return 1\n}\nmyFunc()`;
    setupDocument(srv, TEST_URI, source);
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: {
        diagnostics: [{
          range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } },
          message: "Function 'myFunc' should use snake_case (hint: Rename 'myFunc' to 'my_func')",
        }],
      },
    }));
    const actions = srv._lastResponse.result;
    const renameAction = actions.find(a => a.title.includes('Rename'));
    expect(renameAction).toBeDefined();
    expect(renameAction.title).toBe("Rename 'myFunc' to 'my_func'");
    expect(renameAction.edit.changes[TEST_URI][0].newText).toBe('my_func');
  });

  test('offers rename for PascalCase violation on type', () => {
    const srv = createServer();
    const source = `type my_type { x: Int }`;
    setupDocument(srv, TEST_URI, source);
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: {
        diagnostics: [{
          range: { start: { line: 0, character: 5 }, end: { line: 0, character: 12 } },
          message: "Type 'my_type' should use PascalCase (hint: Rename 'my_type' to 'MyType')",
        }],
      },
    }));
    const actions = srv._lastResponse.result;
    const renameAction = actions.find(a => a.title.includes('Rename'));
    expect(renameAction).toBeDefined();
    expect(renameAction.title).toBe("Rename 'my_type' to 'MyType'");
  });
});

describe('LSP Coverage: Code actions -- empty diagnostics', () => {
  test('returns empty actions when no diagnostics', () => {
    const srv = createServer();
    setupDocument(srv, TEST_URI, 'x = 10\nprint(x)');
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: { diagnostics: [] },
    }));
    expect(srv._lastResponse.result).toEqual([]);
  });

  test('returns empty actions when no document', () => {
    const srv = createServer();
    srv._onCodeAction(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: { diagnostics: [] },
    }));
    expect(srv._lastResponse.result).toEqual([]);
  });
});

describe('LSP Coverage: Workspace symbols', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('lists user-defined symbols by query', () => {
    setupDocument(srv, TEST_URI, `fn hello() { return 1 }\nfn world() { return 2 }\nmy_count = 0`);
    // Use specific query to find user-defined symbols (global scope includes 200+ builtins)
    srv._onWorkspaceSymbol(makeMsg(1, { query: 'hello' }));
    const result1 = srv._lastResponse.result;
    expect(result1.map(s => s.name)).toContain('hello');

    srv._onWorkspaceSymbol(makeMsg(2, { query: 'world' }));
    const result2 = srv._lastResponse.result;
    expect(result2.map(s => s.name)).toContain('world');

    srv._onWorkspaceSymbol(makeMsg(3, { query: 'my_count' }));
    const result3 = srv._lastResponse.result;
    expect(result3.map(s => s.name)).toContain('my_count');
  });

  test('filters symbols by query', () => {
    setupDocument(srv, TEST_URI, `fn get_user() { return 1 }\nfn get_name() { return 2 }\nfn set_user() { return 3 }`);
    srv._onWorkspaceSymbol(makeMsg(1, { query: 'get' }));
    const result = srv._lastResponse.result;
    const names = result.map(s => s.name);
    expect(names).toContain('get_user');
    expect(names).toContain('get_name');
    // "set_user" does not match "get"
    expect(names).not.toContain('set_user');
  });

  test('symbol kinds are correct', () => {
    setupDocument(srv, TEST_URI, `fn my_fn() { return 1 }\ntype MyType { x: Int }\nmy_var = 42`);

    srv._onWorkspaceSymbol(makeMsg(1, { query: 'my_fn' }));
    const fnSym = srv._lastResponse.result.find(s => s.name === 'my_fn');
    expect(fnSym).toBeDefined();
    expect(fnSym.kind).toBe(12); // Function

    srv._onWorkspaceSymbol(makeMsg(2, { query: 'MyType' }));
    const typeSym = srv._lastResponse.result.find(s => s.name === 'MyType');
    expect(typeSym).toBeDefined();
    expect(typeSym.kind).toBe(5); // Class/Type

    srv._onWorkspaceSymbol(makeMsg(3, { query: 'my_var' }));
    const varSym = srv._lastResponse.result.find(s => s.name === 'my_var');
    expect(varSym).toBeDefined();
    expect(varSym.kind).toBe(13); // Variable
  });

  test('searches across multiple documents', () => {
    const uri2 = 'file:///test/other.tova';
    setupDocument(srv, TEST_URI, `fn alpha() { return 1 }`);
    setupDocument(srv, uri2, `fn beta() { return 2 }`);

    srv._onWorkspaceSymbol(makeMsg(1, { query: 'alpha' }));
    expect(srv._lastResponse.result.map(s => s.name)).toContain('alpha');

    srv._onWorkspaceSymbol(makeMsg(2, { query: 'beta' }));
    expect(srv._lastResponse.result.map(s => s.name)).toContain('beta');
  });

  test('returns empty for non-matching query', () => {
    setupDocument(srv, TEST_URI, `fn hello() { return 1 }`);
    srv._onWorkspaceSymbol(makeMsg(1, { query: 'zzz_nonexistent' }));
    const result = srv._lastResponse.result;
    expect(result.length).toBe(0);
  });
});

describe('LSP Coverage: Inlay hints', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('shows parameter name hints for function calls', () => {
    const source = `fn greet(name, greeting) {\n  return name\n}\ngreet("Alice", "Hello")`;
    setupDocument(srv, TEST_URI, source);
    srv._onInlayHint(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0 }, end: { line: 4 } },
    }));
    const result = srv._lastResponse.result;
    // Should have parameter hints for greet("Alice", "Hello")
    const paramHints = result.filter(h => h.kind === 2);
    expect(paramHints.length).toBeGreaterThanOrEqual(1);
    const labels = paramHints.map(h => h.label);
    expect(labels.some(l => l.includes('name'))).toBe(true);
  });

  test('returns empty when no document', () => {
    const srv = createServer();
    srv._onInlayHint(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0 }, end: { line: 10 } },
    }));
    expect(srv._lastResponse.result).toEqual([]);
  });

  test('returns empty when no cache', () => {
    const srv = createServer();
    srv._documents.set(TEST_URI, { text: 'x = 10', version: 1 });
    srv._onInlayHint(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0 }, end: { line: 1 } },
    }));
    expect(srv._lastResponse.result).toEqual([]);
  });

  test('skips hints for keyword-like variable names', () => {
    const source = `fn greet(name) {\n  return name\n}`;
    setupDocument(srv, TEST_URI, source);
    srv._onInlayHint(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      range: { start: { line: 0 }, end: { line: 3 } },
    }));
    const result = srv._lastResponse.result;
    // Should not have a type hint for "fn" -- "fn" is filtered as a keyword
    const typeHints = result.filter(h => h.kind === 1);
    const kwHints = typeHints.filter(h => h.label.includes('fn'));
    expect(kwHints.length).toBe(0);
  });
});

describe('LSP Coverage: _parseCallArgPositions', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('parses simple arguments', () => {
    const line = 'foo(a, b, c)';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(3);
    expect(line.slice(positions[0].start, positions[0].end).trim()).toBe('a');
    expect(line.slice(positions[1].start, positions[1].end).trim()).toBe('b');
    expect(line.slice(positions[2].start, positions[2].end).trim()).toBe('c');
  });

  test('handles nested calls', () => {
    const line = 'foo(bar(1, 2), c)';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
    expect(line.slice(positions[0].start, positions[0].end).trim()).toBe('bar(1, 2)');
    expect(line.slice(positions[1].start, positions[1].end).trim()).toBe('c');
  });

  test('handles string arguments with commas', () => {
    const line = 'foo("a, b", c)';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
    expect(line.slice(positions[0].start, positions[0].end).trim()).toBe('"a, b"');
    expect(line.slice(positions[1].start, positions[1].end).trim()).toBe('c');
  });

  test('handles empty argument list', () => {
    const line = 'foo()';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(0);
  });

  test('handles single argument', () => {
    const line = 'foo(42)';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(1);
    expect(line.slice(positions[0].start, positions[0].end).trim()).toBe('42');
  });

  test('handles array literal argument', () => {
    const line = 'foo([1, 2, 3], x)';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
    expect(line.slice(positions[0].start, positions[0].end).trim()).toBe('[1, 2, 3]');
    expect(line.slice(positions[1].start, positions[1].end).trim()).toBe('x');
  });

  test('handles object literal argument', () => {
    const line = 'foo({a: 1, b: 2}, x)';
    const positions = srv._parseCallArgPositions(line, 4);
    expect(positions.length).toBe(2);
    expect(line.slice(positions[0].start, positions[0].end).trim()).toBe('{a: 1, b: 2}');
  });
});

describe('LSP Coverage: _getWordAt edge cases', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('extracts word with underscores', () => {
    expect(srv._getWordAt('my_var = 10', 2)).toBe('my_var');
  });

  test('extracts word with numbers', () => {
    expect(srv._getWordAt('x2 = 10', 1)).toBe('x2');
  });

  test('returns null for empty line', () => {
    expect(srv._getWordAt('', 0)).toBe(null);
  });

  test('returns null at operator position', () => {
    expect(srv._getWordAt('a + b', 2)).toBe(null);
  });

  test('handles cursor at line start', () => {
    expect(srv._getWordAt('hello', 0)).toBe('hello');
  });

  test('handles cursor at line end', () => {
    expect(srv._getWordAt('hello', 4)).toBe('hello');
  });
});

describe('LSP Coverage: _getDiagnosticSeverity', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('unused variable returns Hint (4)', () => {
    expect(srv._getDiagnosticSeverity({ message: "'x' is declared but never used" })).toBe(4);
  });

  test('shadow binding returns Information (3)', () => {
    expect(srv._getDiagnosticSeverity({ message: "'x' shadows a binding in outer scope" })).toBe(3);
  });

  test('non-exhaustive match returns Warning (2)', () => {
    expect(srv._getDiagnosticSeverity({ message: "Non-exhaustive match: missing 'None'" })).toBe(2);
  });

  test('type mismatch returns Error (1)', () => {
    expect(srv._getDiagnosticSeverity({ message: "Type mismatch: expected Int, got String" })).toBe(1);
  });

  test('naming convention returns Hint (4)', () => {
    expect(srv._getDiagnosticSeverity({ message: "Function 'myFunc' should use snake_case" })).toBe(4);
    expect(srv._getDiagnosticSeverity({ message: "Type 'my_type' should use PascalCase" })).toBe(4);
  });

  test('unknown warning returns default Warning (2)', () => {
    expect(srv._getDiagnosticSeverity({ message: "Some other warning" })).toBe(2);
  });

  test('empty message returns default Warning (2)', () => {
    expect(srv._getDiagnosticSeverity({ message: '' })).toBe(2);
  });
});

describe('LSP Coverage: _getBuiltinDetail', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('returns signature for known builtin', () => {
    const detail = srv._getBuiltinDetail('print');
    expect(detail).toBeDefined();
    // print is a function, so it should contain "fn"
    expect(typeof detail).toBe('string');
  });

  test('returns "Tova built-in" for unknown name', () => {
    const detail = srv._getBuiltinDetail('nonexistent_xyz');
    expect(detail).toBe('Tova built-in');
  });

  test('returns "const" for constants like PI', () => {
    const detail = srv._getBuiltinDetail('PI');
    expect(detail).toBe('const');
  });
});

describe('LSP Coverage: _collectSymbols', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('collects symbols from nested scopes', () => {
    const source = `fn outer(a) {\n  fn inner(b) {\n    return b\n  }\n  return inner(a)\n}`;
    const { analyzer } = setupDocument(srv, TEST_URI, source);
    const symbols = srv._collectSymbols(analyzer);
    const names = symbols.map(s => s.name);
    expect(names).toContain('outer');
    expect(names).toContain('inner');
  });

  test('collects function params', () => {
    const source = `fn greet(name) {\n  return name\n}`;
    const { analyzer } = setupDocument(srv, TEST_URI, source);
    const symbols = srv._collectSymbols(analyzer);
    const greetSym = symbols.find(s => s.name === 'greet');
    expect(greetSym).toBeDefined();
    expect(greetSym.kind).toBe('function');
    expect(greetSym.params || greetSym._params).toBeDefined();
  });

  test('collects type symbols', () => {
    const source = `type Color { Red, Green, Blue }`;
    const { analyzer } = setupDocument(srv, TEST_URI, source);
    const symbols = srv._collectSymbols(analyzer);
    const colorSym = symbols.find(s => s.name === 'Color');
    expect(colorSym).toBeDefined();
    expect(colorSym.kind).toBe('type');
  });
});

describe('LSP Coverage: _findSymbolInScopes', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('finds symbol in global scope', () => {
    const source = `x = 42\nprint(x)`;
    const { analyzer } = setupDocument(srv, TEST_URI, source);
    const sym = srv._findSymbolInScopes(analyzer, 'x');
    expect(sym).not.toBeNull();
  });

  test('finds symbol in child scope', () => {
    const source = `fn foo() {\n  local_var = 10\n  return local_var\n}`;
    const { analyzer } = setupDocument(srv, TEST_URI, source);
    const sym = srv._findSymbolInScopes(analyzer, 'local_var');
    expect(sym).not.toBeNull();
  });

  test('returns null for nonexistent symbol', () => {
    const source = `x = 42`;
    const { analyzer } = setupDocument(srv, TEST_URI, source);
    const sym = srv._findSymbolInScopes(analyzer, 'nonexistent');
    expect(sym).toBeNull();
  });
});

describe('LSP Coverage: Full pipeline integration', () => {
  test('completion + hover + definition on same document', () => {
    const srv = createServer();
    const source = `fn add(a, b) {\n  return a + b\n}\nresult = add(1, 2)\nprint(result)`;
    setupDocument(srv, TEST_URI, source);

    // Completion on "add"
    srv._documents.set(TEST_URI, { text: source, version: 1 });
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 11 }, // "add" position
    }));
    const completionItems = srv._lastResponse.result;
    expect(completionItems.length).toBeGreaterThan(0);

    // Hover on "add"
    srv._onHover(makeMsg(2, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 4 },
    }));
    const hoverResult = srv._lastResponse.result;
    expect(hoverResult).not.toBeNull();
    expect(hoverResult.contents.value).toContain('add');

    // Definition on "add" in call
    srv._onDefinition(makeMsg(3, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 10 },
    }));
    const defResult = srv._lastResponse.result;
    expect(defResult).not.toBeNull();
    expect(defResult.range.start.line).toBe(0);

    // References for "result"
    srv._onReferences(makeMsg(4, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 2 },
    }));
    const refs = srv._lastResponse.result;
    expect(refs.length).toBe(2); // result = ... and print(result)

    // Signature help inside add()
    srv._documents.set(TEST_URI, { text: `fn add(a, b) {\n  return a + b\n}\nadd(1, `, version: 2 });
    srv._onSignatureHelp(makeMsg(5, {
      textDocument: { uri: TEST_URI },
      position: { line: 3, character: 7 },
    }));
    const sigResult = srv._lastResponse.result;
    expect(sigResult).not.toBeNull();
    expect(sigResult.signatures[0].label).toBe('add(a, b)');
    expect(sigResult.activeParameter).toBe(1);
  });

  test('document with parse error still caches partial AST', () => {
    const srv = createServer();
    const source = `fn good() { return 1 }\nfn bad( {`;
    const result = setupDocument(srv, TEST_URI, source);
    // Should have either an error or partial AST cached
    expect(result.error).toBeDefined();
    // Even with error, diagnostics cache may have partial data
  });
});

describe('LSP Coverage: _uriToPath', () => {
  let srv;

  beforeEach(() => {
    srv = createServer();
  });

  test('decodes Unix file URI', () => {
    expect(srv._uriToPath('file:///home/user/test.tova')).toBe('/home/user/test.tova');
  });

  test('strips leading slash for Windows paths', () => {
    expect(srv._uriToPath('file:///C:/Users/test.tova')).toBe('C:/Users/test.tova');
  });

  test('handles encoded characters', () => {
    expect(srv._uriToPath('file:///home/my%20project/test.tova')).toBe('/home/my project/test.tova');
  });

  test('non-file URI returned as-is', () => {
    expect(srv._uriToPath('untitled:test')).toBe('untitled:test');
  });
});

describe('LSP Coverage: edge cases and error paths', () => {
  test('completion with dot notation but no cached analyzer returns default completions', () => {
    const srv = createServer();
    const source = `x = 10\nx.`;
    srv._documents.set(TEST_URI, { text: source, version: 1 });
    // No diagnostics cache set
    srv._onCompletion(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 1, character: 2 },
    }));
    // Should fall through to default completions since dot completions return empty
    const items = srv._lastResponse.result;
    expect(Array.isArray(items)).toBe(true);
  });

  test('hover on Result/Option constructors shows methods', () => {
    const srv = createServer();
    const source = `x = Ok(42)`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 4 }, // on "Ok"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('Ok');
    expect(result.contents.value).toContain('Result');
  });

  test('hover on None shows Option docs', () => {
    const srv = createServer();
    const source = `x = None`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 5 }, // on "None"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('None');
    expect(result.contents.value).toContain('Option');
  });

  test('hover on Some shows Option docs', () => {
    const srv = createServer();
    const source = `x = Some(42)`;
    setupDocument(srv, TEST_URI, source);
    srv._onHover(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 5 }, // on "Some"
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.contents.value).toContain('Some');
    expect(result.contents.value).toContain('Option');
  });

  test('signature help with enum constructors', () => {
    const srv = createServer();
    srv._documents.set(TEST_URI, { text: 'Err("fail', version: 1 });
    srv._onSignatureHelp(makeMsg(1, {
      textDocument: { uri: TEST_URI },
      position: { line: 0, character: 9 },
    }));
    const result = srv._lastResponse.result;
    expect(result).not.toBeNull();
    expect(result.signatures[0].label).toBe('Err(error)');
  });
});
