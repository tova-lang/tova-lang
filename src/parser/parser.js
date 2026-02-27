import { TokenType, Keywords } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { FormValidator } from './form-ast.js';
import { BlockRegistry } from '../registry/register-all.js';

export class Parser {
  static MAX_EXPRESSION_DEPTH = 200;
  static COMPARISON_OPS = null; // initialized after class definition

  constructor(tokens, filename = '<stdin>') {
    // Pre-filter: build array of significant tokens for O(1) peek
    const significant = [];
    const docs = [];
    for (const t of tokens) {
      const type = t.type;
      if (type === TokenType.NEWLINE || type === TokenType.SEMICOLON) continue;
      if (type === TokenType.DOCSTRING) { docs.push(t); continue; }
      significant.push(t);
    }
    this.tokens = significant;
    this._eof = significant[significant.length - 1]; // cache EOF for hot-path methods
    this.filename = filename;
    this.pos = 0;
    this.errors = [];
    this._expressionDepth = 0;
    this.docstrings = docs;
  }

  // ─── Helpers ───────────────────────────────────────────────

  error(message, code = null) {
    const tok = this.current();
    const err = new Error(
      `${this.filename}:${tok.line}:${tok.column} — Parse error: ${message}\n  Got: ${tok.type} (${JSON.stringify(tok.value)})`
    );
    err.loc = { line: tok.line, column: tok.column, file: this.filename };
    if (code) err.code = code;
    throw err;
  }

  current() {
    return this.tokens[this.pos] || this._eof;
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this._eof;
  }

  advance() {
    return this.tokens[this.pos++] || this._eof;
  }

  check(type) {
    return this.current().type === type;
  }

  checkValue(type, value) {
    const tok = this.current();
    return tok.type === type && tok.value === value;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    this.error(message || `Expected ${type}, got ${this.current().type}`);
  }

  // Accept IDENTIFIER or any keyword token as a property name (e.g., obj.field, obj.state).
  // Keywords are valid property names after '.' and '?.' just like in JavaScript.
  expectPropertyName(message) {
    const tok = this.current();
    if (tok.type === TokenType.IDENTIFIER || (typeof tok.value === 'string' && tok.type !== TokenType.EOF && tok.type !== TokenType.NUMBER && tok.type !== TokenType.STRING && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(tok.value))) {
      return this.advance();
    }
    this.error(message || `Expected property name, got ${tok.type}`);
  }

  loc() {
    const tok = this.current();
    return { line: tok.line, column: tok.column, file: this.filename };
  }

  isAtEnd() {
    return this.check(TokenType.EOF);
  }

  _synchronize() {
    const startPos = this.pos;
    this.advance(); // skip the problematic token
    while (!this.isAtEnd()) {
      const tok = this.current();
      // Statement-starting keywords — safe to resume parsing here
      if (tok.type === TokenType.FN || tok.type === TokenType.TYPE ||
          tok.type === TokenType.IF || tok.type === TokenType.FOR ||
          tok.type === TokenType.WHILE || tok.type === TokenType.RETURN ||
          tok.type === TokenType.IMPORT || tok.type === TokenType.MATCH ||
          tok.type === TokenType.TRY || tok.type === TokenType.SERVER ||
          tok.type === TokenType.BROWSER || tok.type === TokenType.SHARED ||
          tok.type === TokenType.GUARD || tok.type === TokenType.INTERFACE ||
          tok.type === TokenType.IMPL || tok.type === TokenType.TRAIT ||
          tok.type === TokenType.PUB || tok.type === TokenType.DEFER ||
          tok.type === TokenType.EXTERN ||
          tok.type === TokenType.VAR || tok.type === TokenType.ASYNC) {
        return;
      }
      if (tok.type === TokenType.RBRACE) {
        this.advance();
        return;
      }
      this.advance();
    }
    // Safety: if we didn't advance at all, force advance to avoid infinite loop
    if (this.pos === startPos && !this.isAtEnd()) {
      this.advance();
    }
  }

  // Full-stack keywords (route, state, computed, effect, component, store) are contextual —
  // they act as keywords inside server/client blocks but can be used as identifiers elsewhere.
  _isContextualKeyword() {
    const t = this.current().type;
    return t === TokenType.ROUTE || t === TokenType.STATE || t === TokenType.COMPUTED ||
           t === TokenType.EFFECT || t === TokenType.COMPONENT || t === TokenType.STORE;
  }

  _isContextualKeywordToken(token) {
    const t = token.type;
    return t === TokenType.ROUTE || t === TokenType.STATE || t === TokenType.COMPUTED ||
           t === TokenType.EFFECT || t === TokenType.COMPONENT || t === TokenType.STORE;
  }

  _synchronizeBlock() {
    // Don't advance if already at } — that's the block closer we need
    if (!this.isAtEnd() && this.current().type !== TokenType.RBRACE) {
      this.advance(); // skip the problematic token
    }
    while (!this.isAtEnd()) {
      const tok = this.current();
      // Stop at } WITHOUT consuming — let the block close properly
      if (tok.type === TokenType.RBRACE) return;
      // Statement-starting keywords — safe to resume parsing here
      if (tok.type === TokenType.FN || tok.type === TokenType.TYPE ||
          tok.type === TokenType.IF || tok.type === TokenType.FOR ||
          tok.type === TokenType.WHILE || tok.type === TokenType.RETURN ||
          tok.type === TokenType.IMPORT || tok.type === TokenType.MATCH ||
          tok.type === TokenType.TRY || tok.type === TokenType.SERVER ||
          tok.type === TokenType.BROWSER || tok.type === TokenType.SHARED ||
          tok.type === TokenType.GUARD || tok.type === TokenType.INTERFACE ||
          tok.type === TokenType.IMPL || tok.type === TokenType.TRAIT ||
          tok.type === TokenType.PUB || tok.type === TokenType.DEFER ||
          tok.type === TokenType.EXTERN || tok.type === TokenType.VAR || tok.type === TokenType.MUT ||
          tok.type === TokenType.STATE || tok.type === TokenType.ROUTE ||
          tok.type === TokenType.IDENTIFIER) {
        return;
      }
      this.advance();
    }
  }

  // Detect if current < starts a JSX tag (vs comparison operator)
  _looksLikeJSX() {
    if (!this.check(TokenType.LESS)) return false;
    const next = this.peek(1);
    // Fragment: <>
    if (next.type === TokenType.GREATER) return true;
    // Accept identifiers and keywords as JSX tag names (e.g., <form>, <label>, <field>)
    if (next.type !== TokenType.IDENTIFIER && !(next.value in Keywords)) return false;
    // Uppercase tag is always a component reference, never a comparison variable
    if (/^[A-Z]/.test(next.value)) return true;
    const afterIdent = this.peek(2);
    // Negative check: if afterIdent is a comparison/logical operator, this is NOT JSX
    // This catches `a < b && c > d` being misread as JSX
    if (afterIdent.type === TokenType.LESS ||
        afterIdent.type === TokenType.LESS_EQUAL ||
        afterIdent.type === TokenType.GREATER_EQUAL ||
        afterIdent.type === TokenType.AND_AND ||
        afterIdent.type === TokenType.OR_OR ||
        afterIdent.type === TokenType.EQUAL ||
        afterIdent.type === TokenType.NOT_EQUAL) {
      return false;
    }
    // JSX patterns: <div>, <div/>, <div attr=...>, <div on:click=...>
    // After the tag name, we can see >, /, an attribute name (identifier or keyword), or :
    return afterIdent.type === TokenType.GREATER ||
           afterIdent.type === TokenType.SLASH ||
           afterIdent.type === TokenType.IDENTIFIER ||
           afterIdent.type === TokenType.COLON ||
           afterIdent.type === TokenType.STATE ||
           afterIdent.type === TokenType.TYPE ||
           afterIdent.type === TokenType.FOR ||
           afterIdent.type === TokenType.IN ||
           afterIdent.type === TokenType.IF ||
           afterIdent.type === TokenType.ELSE ||
           afterIdent.type === TokenType.MATCH ||
           afterIdent.type === TokenType.RETURN ||
           afterIdent.type === TokenType.NUMBER;
  }

  // ─── Program ───────────────────────────────────────────────

  parse() {
    const body = [];
    const maxErrors = 50; // Stop after 50 errors to avoid cascading noise
    while (!this.isAtEnd()) {
      if (this.errors.length >= maxErrors) break;
      try {
        const stmt = this.parseTopLevel();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronize();
      }
    }
    if (this.errors.length > 0) {
      const program = new AST.Program(body);
      this._attachDocstrings(program);
      const combined = new Error(this.errors.map(e => e.message).join('\n'));
      combined.errors = this.errors;
      combined.partialAST = program;
      if (this.errors.length >= maxErrors) {
        combined.truncated = true;
      }
      throw combined;
    }
    const program = new AST.Program(body);
    this._attachDocstrings(program);
    return program;
  }

  _attachDocstrings(program) {
    // Use pre-extracted docstring tokens
    const docTokens = this.docstrings;
    if (docTokens.length === 0) return;

    // Group consecutive docstring lines
    const groups = [];
    let current = [docTokens[0]];
    for (let i = 1; i < docTokens.length; i++) {
      if (docTokens[i].line === current[current.length - 1].line + 1) {
        current.push(docTokens[i]);
      } else {
        groups.push(current);
        current = [docTokens[i]];
      }
    }
    groups.push(current);

    // Map: endLine → docstring text
    const docsByEndLine = new Map();
    for (const group of groups) {
      const endLine = group[group.length - 1].line;
      const text = group.map(t => t.value).join('\n');
      docsByEndLine.set(endLine, text);
    }

    // Walk top-level nodes and attach docstrings
    const docTypes = new Set(['FunctionDeclaration', 'TypeDeclaration', 'InterfaceDeclaration', 'Assignment', 'TraitDeclaration']);
    const walk = (nodes) => {
      for (const node of nodes) {
        if (!node || !node.loc) continue;
        if (docTypes.has(node.type)) {
          const doc = docsByEndLine.get(node.loc.line - 1);
          if (doc) node.docstring = doc;
        }
        // Walk into block bodies (arrays) and block nodes with body properties
        if (node.body && Array.isArray(node.body)) {
          walk(node.body);
        } else if (BlockRegistry.getByAstType(node.type) && node.body) {
          walk(node.body);
        }
      }
    };
    walk(program.body);
  }

  parseTopLevel() {
    // Registry-driven block dispatch
    for (const plugin of BlockRegistry.all()) {
      if (this._matchesBlock(plugin)) {
        const p = plugin.parser;
        if (p.install && p.installedFlag && !Parser.prototype[p.installedFlag]) {
          p.install(Parser);
        }
        return this[p.method]();
      }
    }
    if (this.check(TokenType.IMPORT)) return this.parseImport();
    return this.parseStatement();
  }

  _matchesBlock(plugin) {
    const d = plugin.detection;
    if (d.strategy === 'keyword') {
      return this.check(TokenType[d.tokenType]);
    }
    if (d.strategy === 'identifier') {
      if (!this.check(TokenType.IDENTIFIER) || this.current().value !== d.identifierValue) return false;
      return d.lookahead ? d.lookahead(this) : this.peek(1).type === TokenType.LBRACE;
    }
    return false;
  }

  parseTestBlock() {
    const l = this.loc();
    this.advance(); // consume 'test'
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    // Parse optional timeout=N
    let timeout = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'timeout' && this.peek(1).type === TokenType.ASSIGN) {
      this.advance(); // consume 'timeout'
      this.advance(); // consume '='
      const tok = this.expect(TokenType.NUMBER, "Expected number after timeout=");
      timeout = Number(tok.value);
    }
    this.expect(TokenType.LBRACE, "Expected '{' after test block name");
    const body = [];
    let beforeEach = null;
    let afterEach = null;
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        // Check for before_each { ... }
        if (this.check(TokenType.IDENTIFIER) && this.current().value === 'before_each' && this.peek(1).type === TokenType.LBRACE) {
          this.advance(); // consume 'before_each'
          this.expect(TokenType.LBRACE, "Expected '{' after before_each");
          beforeEach = [];
          while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            const s = this.parseStatement();
            if (s) beforeEach.push(s);
          }
          this.expect(TokenType.RBRACE, "Expected '}' to close before_each");
          continue;
        }
        // Check for after_each { ... }
        if (this.check(TokenType.IDENTIFIER) && this.current().value === 'after_each' && this.peek(1).type === TokenType.LBRACE) {
          this.advance(); // consume 'after_each'
          this.expect(TokenType.LBRACE, "Expected '{' after after_each");
          afterEach = [];
          while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            const s = this.parseStatement();
            if (s) afterEach.push(s);
          }
          this.expect(TokenType.RBRACE, "Expected '}' to close after_each");
          continue;
        }
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close test block");
    return new AST.TestBlock(name, body, l, { timeout, beforeEach, afterEach });
  }

  parseBenchBlock() {
    const l = this.loc();
    this.advance(); // consume 'bench'
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after bench block name");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close bench block");
    return new AST.BenchBlock(name, body, l);
  }

  // ─── Full-stack blocks ────────────────────────────────────
  // parseBrowserBlock() and browser-specific methods are in browser-parser.js (lazy-loaded)

  parseSharedBlock() {
    const l = this.loc();
    this.expect(TokenType.SHARED);
    // Optional block name: shared "models" { }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after 'shared'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close shared block");
    return new AST.SharedBlock(body, l, name);
  }

  // ─── Data block ────────────────────────────────────────────

  parseDataBlock() {
    const l = this.loc();
    this.advance(); // consume 'data'
    this.expect(TokenType.LBRACE, "Expected '{' after 'data'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseDataStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close data block");
    return new AST.DataBlock(body, l);
  }

  parseDataStatement() {
    if (!this.check(TokenType.IDENTIFIER)) {
      return this.parseStatement();
    }

    const val = this.current().value;

    // source customers: Table<Customer> = read("customers.csv")
    if (val === 'source') {
      return this.parseSourceDeclaration();
    }

    // pipeline clean_customers = customers |> where(...)
    if (val === 'pipeline') {
      return this.parsePipelineDeclaration();
    }

    // validate Customer { .email |> contains("@"), ... }
    if (val === 'validate') {
      return this.parseValidateBlock();
    }

    // refresh customers every 15.minutes
    // refresh orders on_demand
    if (val === 'refresh') {
      return this.parseRefreshPolicy();
    }

    return this.parseStatement();
  }

  parseSourceDeclaration() {
    const l = this.loc();
    this.advance(); // consume 'source'
    const name = this.expect(TokenType.IDENTIFIER, "Expected source name").value;

    // Optional type annotation: source customers: Table<Customer>
    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.expect(TokenType.ASSIGN, "Expected '=' after source name");
    const expression = this.parseExpression();

    return new AST.SourceDeclaration(name, typeAnnotation, expression, l);
  }

  parsePipelineDeclaration() {
    const l = this.loc();
    this.advance(); // consume 'pipeline'
    const name = this.expect(TokenType.IDENTIFIER, "Expected pipeline name").value;
    this.expect(TokenType.ASSIGN, "Expected '=' after pipeline name");
    const expression = this.parseExpression();
    return new AST.PipelineDeclaration(name, expression, l);
  }

  parseValidateBlock() {
    const l = this.loc();
    this.advance(); // consume 'validate'
    const typeName = this.expect(TokenType.IDENTIFIER, "Expected type name after 'validate'").value;
    this.expect(TokenType.LBRACE, "Expected '{' after validate type name");

    const rules = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const rule = this.parseExpression();
      rules.push(rule);
      this.match(TokenType.COMMA); // optional comma separator
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close validate block");
    return new AST.ValidateBlock(typeName, rules, l);
  }

  parseRefreshPolicy() {
    const l = this.loc();
    this.advance(); // consume 'refresh'
    const sourceName = this.expect(TokenType.IDENTIFIER, "Expected source name after 'refresh'").value;

    // refresh X every N.unit  OR  refresh X on_demand
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'on_demand') {
      this.advance();
      return new AST.RefreshPolicy(sourceName, 'on_demand', l);
    }

    // expect 'every'
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'every') {
      this.advance(); // consume 'every'
    }

    // Parse interval: N.unit (e.g., 15.minutes, 1.hour)
    const value = this.expect(TokenType.NUMBER, "Expected interval value").value;
    this.expect(TokenType.DOT, "Expected '.' after interval value");
    const unit = this.expect(TokenType.IDENTIFIER, "Expected time unit (minutes, hours, seconds)").value;

    return new AST.RefreshPolicy(sourceName, { value, unit }, l);
  }

  // Browser-specific statements and JSX parsing are in browser-parser.js (lazy-loaded)

  // ─── Statements ───────────────────────────────────────────

  parseStatement() {
    // pub modifier: pub fn, pub type, pub x = ...
    if (this.check(TokenType.PUB)) return this.parsePubDeclaration();
    if (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FOR) {
      this.advance(); // consume async
      return this.parseForStatement(null, true);
    }
    if (this.check(TokenType.AT)) return this.parseDecoratedDeclaration();
    if (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN) return this.parseAsyncFunctionDeclaration();
    if (this.check(TokenType.FN) && (this.peek(1).type === TokenType.IDENTIFIER || this._isContextualKeywordToken(this.peek(1)))) return this.parseFunctionDeclaration();
    if (this.check(TokenType.TYPE)) return this.parseTypeDeclaration();
    if (this.check(TokenType.MUT)) this.error("'mut' is not supported in Tova. Use 'var' for mutable variables");
    if (this.check(TokenType.VAR)) return this.parseVarDeclaration();
    if (this.check(TokenType.LET)) return this.parseLetDestructure();
    if (this.check(TokenType.IF)) return this.parseIfStatement();
    if (this.check(TokenType.FOR)) return this.parseForStatement();
    if (this.check(TokenType.WHILE)) return this.parseWhileStatement();
    if (this.check(TokenType.LOOP)) return this.parseLoopStatement();
    if (this.check(TokenType.RETURN)) return this.parseReturnStatement();
    if (this.check(TokenType.IMPORT)) return this.parseImport();
    if (this.check(TokenType.MATCH)) return this.parseMatchAsStatement();
    if (this.check(TokenType.TRY)) return this.parseTryCatch();
    if (this.check(TokenType.BREAK)) return this.parseBreakStatement();
    if (this.check(TokenType.CONTINUE)) return this.parseContinueStatement();
    if (this.check(TokenType.GUARD)) return this.parseGuardStatement();
    if (this.check(TokenType.INTERFACE)) return this.parseInterfaceDeclaration();
    if (this.check(TokenType.IMPL)) return this.parseImplDeclaration();
    if (this.check(TokenType.TRAIT)) return this.parseTraitDeclaration();
    if (this.check(TokenType.DEFER)) return this.parseDeferStatement();
    if (this.check(TokenType.WITH)) return this.parseWithStatement();
    if (this.check(TokenType.EXTERN)) return this.parseExternDeclaration();

    // Labeled loops: name: for/while/loop
    if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
      const afterColon = this.peek(2).type;
      if (afterColon === TokenType.FOR || afterColon === TokenType.WHILE || afterColon === TokenType.LOOP) {
        const label = this.advance().value; // consume identifier
        this.advance(); // consume colon
        if (this.check(TokenType.FOR)) return this.parseForStatement(label);
        if (this.check(TokenType.WHILE)) return this.parseWhileStatement(label);
        if (this.check(TokenType.LOOP)) return this.parseLoopStatement(label);
      }
    }

    return this.parseExpressionOrAssignment();
  }

  parsePubDeclaration() {
    const l = this.loc();
    this.advance(); // consume 'pub'
    if (this.check(TokenType.PUB)) {
      this.error("Duplicate 'pub' modifier");
    }
    const stmt = this.parseStatement();
    if (stmt) stmt.isPublic = true;
    return stmt;
  }

  parseImplDeclaration() {
    const l = this.loc();
    this.expect(TokenType.IMPL);
    const firstName = this.expect(TokenType.IDENTIFIER, "Expected type name after 'impl'").value;

    // Check for `impl Trait for Type`
    let typeName, traitName = null;
    if (this.check(TokenType.FOR)) {
      this.advance();
      traitName = firstName;
      typeName = this.expect(TokenType.IDENTIFIER, "Expected type name after 'for'").value;
    } else {
      typeName = firstName;
    }

    this.expect(TokenType.LBRACE, "Expected '{' to open impl block");

    const methods = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const isAsync = this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN;
      if (isAsync) {
        methods.push(this.parseAsyncFunctionDeclaration());
      } else {
        this.expect(TokenType.FN, "Expected 'fn' in impl block");
        const methodLoc = this.loc();
        const name = this.expect(TokenType.IDENTIFIER, "Expected method name").value;
        this.expect(TokenType.LPAREN, "Expected '(' after method name");
        const params = this.parseParameterList();
        this.expect(TokenType.RPAREN, "Expected ')' after parameters");
        let returnType = null;
        if (this.match(TokenType.THIN_ARROW)) {
          returnType = this.parseTypeAnnotation();
        }
        const body = this.parseBlock();
        methods.push(new AST.FunctionDeclaration(name, params, body, returnType, methodLoc));
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close impl block");
    return new AST.ImplDeclaration(typeName, methods, l, traitName);
  }

  parseTraitDeclaration() {
    const l = this.loc();
    this.expect(TokenType.TRAIT);
    const name = this.expect(TokenType.IDENTIFIER, "Expected trait name").value;
    this.expect(TokenType.LBRACE, "Expected '{' to open trait body");

    const methods = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.expect(TokenType.FN, "Expected 'fn' in trait body");
      const methodName = this.expect(TokenType.IDENTIFIER, "Expected method name").value;
      this.expect(TokenType.LPAREN, "Expected '(' after method name");
      const params = this.parseParameterList();
      this.expect(TokenType.RPAREN, "Expected ')' after parameters");
      let returnType = null;
      if (this.match(TokenType.THIN_ARROW)) {
        returnType = this.parseTypeAnnotation();
      }
      // Optional default implementation
      let body = null;
      if (this.check(TokenType.LBRACE)) {
        body = this.parseBlock();
      }
      methods.push({ name: methodName, params, returnType, body });
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close trait body");
    return new AST.TraitDeclaration(name, methods, l);
  }

  parseDeferStatement() {
    const l = this.loc();
    this.expect(TokenType.DEFER);
    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }
    return new AST.DeferStatement(body, l);
  }

  parseWithStatement() {
    const l = this.loc();
    this.expect(TokenType.WITH);
    const expression = this.parseExpression();
    this.expect(TokenType.AS, "Expected 'as' after with expression");
    const name = this.expect(TokenType.IDENTIFIER, "Expected variable name after 'as'").value;
    const body = this.parseBlock();
    return new AST.WithStatement(expression, name, body, l);
  }

  parseExternDeclaration() {
    const l = this.loc();
    this.expect(TokenType.EXTERN);

    const isAsync = !!this.match(TokenType.ASYNC);
    this.expect(TokenType.FN, "Expected 'fn' after 'extern'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name in extern declaration").value;
    this.expect(TokenType.LPAREN, "Expected '(' after extern function name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after extern parameters");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    return new AST.ExternDeclaration(name, params, returnType, l, isAsync);
  }

  parseDecoratedDeclaration() {
    const decorators = [];
    while (this.check(TokenType.AT)) {
      this.advance(); // consume @
      const decName = this.expect(TokenType.IDENTIFIER, "Expected decorator name after '@'").value;
      let decArgs = [];
      if (this.check(TokenType.LPAREN)) {
        this.advance(); // consume (
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          decArgs.push(this.parseExpression());
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after decorator arguments");
      }
      decorators.push({ name: decName, args: decArgs });
    }
    // After decorators, expect fn or async fn
    if (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN) {
      const node = this.parseAsyncFunctionDeclaration(decorators);
      return node;
    }
    if (this.check(TokenType.FN)) {
      const node = this.parseFunctionDeclaration(decorators);
      return node;
    }
    this.error("Expected 'fn' or 'async fn' after decorator");
  }

  parseFunctionDeclaration(decorators = []) {
    const l = this.loc();
    this.expect(TokenType.FN);
    let name;
    if (this._isContextualKeyword()) {
      name = this.advance().value;
    } else {
      name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    }

    // Parse optional type parameters: fn name<T, U>(...)
    let typeParams = [];
    if (this.check(TokenType.LESS)) {
      this.advance(); // consume <
      while (!this.check(TokenType.GREATER) && !this.isAtEnd()) {
        typeParams.push(this.expect(TokenType.IDENTIFIER, "Expected type parameter name").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.GREATER, "Expected '>' after type parameters");
    }

    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    const body = this.parseBlock();
    return new AST.FunctionDeclaration(name, params, body, returnType, l, false, typeParams, decorators);
  }

  parseAsyncFunctionDeclaration(decorators = []) {
    const l = this.loc();
    this.expect(TokenType.ASYNC);
    this.expect(TokenType.FN);
    let name;
    if (this._isContextualKeyword()) {
      name = this.advance().value;
    } else {
      name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    }

    // Parse optional type parameters: async fn name<T, U>(...)
    let typeParams = [];
    if (this.check(TokenType.LESS)) {
      this.advance(); // consume <
      while (!this.check(TokenType.GREATER) && !this.isAtEnd()) {
        typeParams.push(this.expect(TokenType.IDENTIFIER, "Expected type parameter name").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.GREATER, "Expected '>' after type parameters");
    }

    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    const body = this.parseBlock();
    return new AST.FunctionDeclaration(name, params, body, returnType, l, true, typeParams, decorators);
  }

  parseBreakStatement() {
    const l = this.loc();
    this.expect(TokenType.BREAK);
    // Optional label: break outer
    let label = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().line === l.line) {
      label = this.advance().value;
    }
    return new AST.BreakStatement(l, label);
  }

  parseContinueStatement() {
    const l = this.loc();
    this.expect(TokenType.CONTINUE);
    // Optional label: continue outer
    let label = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().line === l.line) {
      label = this.advance().value;
    }
    return new AST.ContinueStatement(l, label);
  }

  parseGuardStatement() {
    const l = this.loc();
    this.expect(TokenType.GUARD);
    const condition = this.parseExpression();
    this.expect(TokenType.ELSE, "Expected 'else' after guard condition");
    const elseBody = this.parseBlock();
    return new AST.GuardStatement(condition, elseBody, l);
  }

  parseInterfaceDeclaration() {
    const l = this.loc();
    this.expect(TokenType.INTERFACE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected interface name").value;
    this.expect(TokenType.LBRACE, "Expected '{' to open interface body");

    const methods = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.expect(TokenType.FN, "Expected 'fn' in interface body");
      const methodName = this.expect(TokenType.IDENTIFIER, "Expected method name").value;
      this.expect(TokenType.LPAREN, "Expected '(' after method name");
      const params = this.parseParameterList();
      this.expect(TokenType.RPAREN, "Expected ')' after parameters");
      let returnType = null;
      if (this.match(TokenType.THIN_ARROW)) {
        returnType = this.parseTypeAnnotation();
      }
      methods.push({ name: methodName, params, returnType });
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close interface body");
    return new AST.InterfaceDeclaration(name, methods, l);
  }

  parseParameterList() {
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      const l = this.loc();

      // Destructuring pattern parameter: {name, email}: User or [head, ...tail]
      if (this.check(TokenType.LBRACE)) {
        this.advance();
        const properties = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const key = this.expect(TokenType.IDENTIFIER, "Expected property name").value;
          let value = key;
          let defaultValue = null;
          if (this.match(TokenType.COLON)) {
            value = this.expect(TokenType.IDENTIFIER, "Expected alias name").value;
          }
          if (this.match(TokenType.ASSIGN)) {
            defaultValue = this.parseExpression();
          }
          properties.push({ key, value, defaultValue });
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RBRACE, "Expected '}'");
        const pattern = new AST.ObjectPattern(properties, l);
        const param = new AST.Parameter(null, null, null, l);
        param.destructure = pattern;
        // Optional type annotation after destructure: {name, age}: User
        if (this.match(TokenType.COLON)) {
          param.typeAnnotation = this.parseTypeAnnotation();
        }
        params.push(param);
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const elements = [];
        while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
          // Support spread in array destructure: [head, ...tail]
          if (this.check(TokenType.SPREAD)) {
            this.advance(); // consume ...
            const restName = this.expect(TokenType.IDENTIFIER, "Expected identifier after '...'").value;
            elements.push('...' + restName);
            break; // rest must be last
          }
          elements.push(this.expect(TokenType.IDENTIFIER, "Expected element name").value);
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RBRACKET, "Expected ']'");
        const pattern = new AST.ArrayPattern(elements, l);
        const param = new AST.Parameter(null, null, null, l);
        param.destructure = pattern;
        // Optional type annotation after destructure: [head, ...tail]: [Int]
        if (this.match(TokenType.COLON)) {
          param.typeAnnotation = this.parseTypeAnnotation();
        }
        params.push(param);
      } else {
        let name;
        if (this._isContextualKeyword()) {
          name = this.advance().value;
        } else {
          name = this.expect(TokenType.IDENTIFIER, "Expected parameter name").value;
        }

        let typeAnnotation = null;
        if (this.match(TokenType.COLON)) {
          typeAnnotation = this.parseTypeAnnotation();
        }

        let defaultValue = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.parseExpression();
        }

        params.push(new AST.Parameter(name, typeAnnotation, defaultValue, l));
      }

      if (!this.match(TokenType.COMMA)) break;
    }
    return params;
  }

  parseTypeAnnotation() {
    const l = this.loc();
    const first = this._parseSingleTypeAnnotation();

    // Union types: Type | Type | Type
    if (this.check(TokenType.BAR)) {
      const members = [first];
      while (this.match(TokenType.BAR)) {
        members.push(this._parseSingleTypeAnnotation());
      }
      return new AST.UnionTypeAnnotation(members, l);
    }

    return first;
  }

  // Parse a single type annotation without union (used as union member)
  _parseSingleTypeAnnotation() {
    const l = this.loc();

    // [Type] — array type shorthand
    if (this.match(TokenType.LBRACKET)) {
      const elementType = this._parseSingleTypeAnnotation();
      this.expect(TokenType.RBRACKET, "Expected ']' in array type");
      return new AST.ArrayTypeAnnotation(elementType, l);
    }

    // (Type, Type) — tuple type or function type
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const types = [];
      while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
        types.push(this.parseTypeAnnotation());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RPAREN, "Expected ')' in type annotation");
      if (this.match(TokenType.THIN_ARROW)) {
        const returnType = this.parseTypeAnnotation();
        return new AST.FunctionTypeAnnotation(types, returnType, l);
      }
      return new AST.TupleTypeAnnotation(types, l);
    }

    const name = this.expect(TokenType.IDENTIFIER, "Expected type name").value;

    let typeParams = [];
    if (this.match(TokenType.LESS)) {
      do {
        typeParams.push(this.parseTypeAnnotation());
      } while (this.match(TokenType.COMMA));
      this.expect(TokenType.GREATER, "Expected '>' to close type parameters");
    }

    return new AST.TypeAnnotation(name, typeParams, l);
  }

  // Parse inline validators for type fields: { required, email, min(18) }
  // Uses comma-separated validator names, supports args in parens
  _parseTypeFieldValidators() {
    const validators = [];
    if (this.check(TokenType.LBRACE)) {
      this.advance(); // consume {
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        validators.push(this._parseInlineValidator());
        this.match(TokenType.COMMA); // optional comma separator
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close validator block");
    }
    return validators;
  }

  // Parse a single inline validator: name or name(args...)
  _parseInlineValidator() {
    const l = this.loc();
    let isAsync = false;
    if (this.check(TokenType.ASYNC)) {
      isAsync = true;
      this.advance();
    }
    const name = this.expect(TokenType.IDENTIFIER, "Expected validator name").value;
    const args = [];
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        args.push(this.parseExpression());
        while (this.match(TokenType.COMMA)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(TokenType.RPAREN, "Expected ')' after validator arguments");
    }
    return new FormValidator(name, args, isAsync, l);
  }

  parseTypeDeclaration() {
    const l = this.loc();
    this.expect(TokenType.TYPE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected type name").value;

    // Optional type parameters: Type<T, E>
    let typeParams = [];
    if (this.match(TokenType.LESS)) {
      do {
        typeParams.push(this.expect(TokenType.IDENTIFIER, "Expected type parameter name").value);
      } while (this.match(TokenType.COMMA));
      this.expect(TokenType.GREATER, "Expected '>' to close type parameters");
    }

    // Type alias: type Name = TypeExpr
    // OR Refinement type: type Name = TypeExpr where { ... }
    if (this.match(TokenType.ASSIGN)) {
      const typeExpr = this.parseTypeAnnotation();

      // Check for refinement type: type Email = String where { ... }
      if (this.check(TokenType.IDENTIFIER) && this.current().value === 'where') {
        this.advance(); // consume 'where'
        this.expect(TokenType.LBRACE, "Expected '{' after 'where'");

        // Parse predicate block — uses 'it' as implicit parameter
        const predicates = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          predicates.push(this.parseExpression());
          this.match(TokenType.COMMA); // optional comma between predicates
        }
        this.expect(TokenType.RBRACE, "Expected '}' to close where block");

        // Combine predicates with 'and'
        let predicate = predicates[0];
        for (let i = 1; i < predicates.length; i++) {
          predicate = new AST.LogicalExpression('and', predicate, predicates[i], l);
        }

        return new AST.RefinementType(name, typeExpr, predicate, l);
      }

      // Simple enum syntax: type Color = Red | Green | Blue
      // Detect when the type expression is a union of bare identifiers (PascalCase, no type params)
      // But NOT when any member is a known built-in type (that's a type alias, not an enum)
      if (typeExpr.type === 'UnionTypeAnnotation') {
        const builtinTypes = new Set(['String', 'Int', 'Float', 'Bool', 'List', 'Map', 'Set', 'Option', 'Result', 'Any', 'Nil', 'Void', 'Number', 'Array', 'Object', 'Promise', 'Tuple']);
        const isSimpleEnum = typeExpr.members.every(m =>
          m.type === 'TypeAnnotation' && m.typeParams.length === 0 && /^[A-Z]/.test(m.name)
        );
        const hasBuiltinType = typeExpr.members.some(m =>
          m.type === 'TypeAnnotation' && builtinTypes.has(m.name)
        );
        if (isSimpleEnum && !hasBuiltinType) {
          const variants = typeExpr.members.map(m =>
            new AST.TypeVariant(m.name, [], m.loc)
          );
          return new AST.TypeDeclaration(name, typeParams, variants, l);
        }
      }

      return new AST.TypeAlias(name, typeParams, typeExpr, l);
    }

    this.expect(TokenType.LBRACE, "Expected '{' to open type body");

    const variants = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const vl = this.loc();
      const vname = this.expect(TokenType.IDENTIFIER, "Expected variant or field name").value;

      if (this.match(TokenType.LPAREN)) {
        // Variant with fields: Circle(radius: Float)
        const fields = [];
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          const fl = this.loc();
          const fname = this.expect(TokenType.IDENTIFIER, "Expected field name").value;
          let ftype = null;
          if (this.match(TokenType.COLON)) {
            ftype = this.parseTypeAnnotation();
          }
          fields.push(new AST.TypeField(fname, ftype, fl));
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after variant fields");
        variants.push(new AST.TypeVariant(vname, fields, vl));
      } else if (this.match(TokenType.COLON)) {
        // Simple field: name: String  or  name: String { required, email }
        const ftype = this.parseTypeAnnotation();
        const validators = this._parseTypeFieldValidators();
        variants.push(new AST.TypeField(vname, ftype, vl, validators));
      } else {
        // Bare variant: None
        variants.push(new AST.TypeVariant(vname, [], vl));
      }

      this.match(TokenType.COMMA);
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close type body");

    // Optional derive clause: type Foo { ... } derive [Eq, Show, JSON]
    const node = new AST.TypeDeclaration(name, typeParams, variants, l);
    if (this.match(TokenType.DERIVE)) {
      this.expect(TokenType.LBRACKET, "Expected '[' after derive");
      node.derive = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        node.derive.push(this.expect(TokenType.IDENTIFIER, "Expected derive trait name").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET, "Expected ']' after derive traits");
    }
    return node;
  }

  parseVarDeclaration() {
    const l = this.loc();
    this.expect(TokenType.VAR);

    const targets = [];
    do {
      targets.push(this.expect(TokenType.IDENTIFIER, "Expected variable name").value);
    } while (this.match(TokenType.COMMA));

    this.expect(TokenType.ASSIGN, "Expected '=' in var declaration");

    const values = [this.parseExpression()];
    while (this.match(TokenType.COMMA)) {
      values.push(this.parseExpression());
    }

    return new AST.VarDeclaration(targets, values, l);
  }

  parseLetDestructure() {
    const l = this.loc();
    this.expect(TokenType.LET);

    let pattern;
    if (this.check(TokenType.LBRACE)) {
      pattern = this.parseObjectPattern();
    } else if (this.check(TokenType.LBRACKET)) {
      pattern = this.parseArrayPattern();
    } else if (this.check(TokenType.LPAREN)) {
      // Tuple destructuring: let (a, b) = expr
      pattern = this.parseTuplePattern();
    } else if (this.check(TokenType.IDENTIFIER)) {
      const name = this.current().value;
      this.error(`Use '${name} = value' for binding or 'var ${name} = value' for mutable. 'let' is only for destructuring: let {a, b} = obj`);
    } else {
      this.error("Expected '{', '[', or '(' after 'let' for destructuring");
    }

    this.expect(TokenType.ASSIGN, "Expected '=' in destructuring");
    const value = this.parseExpression();

    return new AST.LetDestructure(pattern, value, l);
  }

  parseObjectPattern() {
    const l = this.loc();
    this.expect(TokenType.LBRACE);
    const properties = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected property name").value;
      let valueName = key;
      let defaultValue = null;

      if (this.match(TokenType.COLON)) {
        valueName = this.expect(TokenType.IDENTIFIER, "Expected alias name").value;
      }
      if (this.match(TokenType.ASSIGN)) {
        defaultValue = this.parseExpression();
      }

      properties.push({ key, value: valueName, defaultValue });
      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RBRACE, "Expected '}' in object pattern");
    return new AST.ObjectPattern(properties, l);
  }

  parseArrayPattern() {
    const l = this.loc();
    this.expect(TokenType.LBRACKET);
    const elements = [];

    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENTIFIER) && this.current().value === '_') {
        elements.push(null); // skip placeholder
        this.advance();
      } else {
        elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in array pattern").value);
      }
      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RBRACKET, "Expected ']' in array pattern");
    return new AST.ArrayPattern(elements, l);
  }

  parseTuplePattern() {
    const l = this.loc();
    this.expect(TokenType.LPAREN);
    const elements = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in tuple pattern").value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN, "Expected ')' in tuple pattern");
    return new AST.TuplePattern(elements, l);
  }

  parseIfStatement() {
    const l = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    const consequent = this.parseBlock();

    const alternates = [];
    while (this.check(TokenType.ELIF) ||
           (this.check(TokenType.ELSE) && this.peek(1).type === TokenType.IF)) {
      if (this.check(TokenType.ELIF)) {
        this.advance();
      } else {
        this.advance(); // else
        this.advance(); // if
      }
      const elifCond = this.parseExpression();
      const elifBody = this.parseBlock();
      alternates.push({ condition: elifCond, body: elifBody });
    }

    let elseBody = null;
    if (this.match(TokenType.ELSE)) {
      elseBody = this.parseBlock();
    }

    return new AST.IfStatement(condition, consequent, alternates, elseBody, l);
  }

  parseForStatement(label = null, isAsync = false) {
    const l = this.loc();
    this.expect(TokenType.FOR);

    // For variable(s) — supports simple, pair, array destructuring, and object destructuring
    let variable;
    if (this.check(TokenType.LBRACKET)) {
      // Array destructuring: for [a, b] in ...
      this.advance();
      const elements = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in array pattern").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET, "Expected ']' in destructuring pattern");
      variable = `[${elements.join(', ')}]`;
    } else if (this.check(TokenType.LBRACE)) {
      // Object destructuring: for {name, age} in ...
      this.advance();
      const props = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        props.push(this.expect(TokenType.IDENTIFIER, "Expected property name in object pattern").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in destructuring pattern");
      variable = `{${props.join(', ')}}`;
    } else {
      const firstName = this.expect(TokenType.IDENTIFIER, "Expected loop variable").value;
      if (this.match(TokenType.COMMA)) {
        const secondName = this.expect(TokenType.IDENTIFIER, "Expected second loop variable").value;
        variable = [firstName, secondName];
      } else {
        variable = firstName;
      }
    }

    this.expect(TokenType.IN, "Expected 'in' after for variable");
    const iterable = this.parseExpression();

    // Optional when guard: for user in users when user.active { ... }
    let guard = null;
    if (this.match(TokenType.WHEN)) {
      guard = this.parseExpression();
    }

    const body = this.parseBlock();

    let elseBody = null;
    if (this.match(TokenType.ELSE)) {
      elseBody = this.parseBlock();
    }

    return new AST.ForStatement(variable, iterable, body, elseBody, l, guard, label, isAsync);
  }

  parseWhileStatement(label = null) {
    const l = this.loc();
    this.expect(TokenType.WHILE);
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return new AST.WhileStatement(condition, body, l, label);
  }

  parseLoopStatement(label = null) {
    const l = this.loc();
    this.expect(TokenType.LOOP);
    const body = this.parseBlock();
    return new AST.LoopStatement(body, label, l);
  }

  parseTryCatch() {
    const l = this.loc();
    this.expect(TokenType.TRY);
    const tryBlock = this.parseBlock();

    let catchParam = null;
    let catchBody = null;
    let finallyBody = null;

    // Parse optional catch block
    if (this.match(TokenType.CATCH)) {
      if (this.check(TokenType.IDENTIFIER)) {
        catchParam = this.advance().value;
      }
      const catchBlock = this.parseBlock();
      catchBody = catchBlock.body;
    }

    // Parse optional finally block
    if (this.match(TokenType.FINALLY)) {
      const finallyBlock = this.parseBlock();
      finallyBody = finallyBlock.body;
    }

    // Must have at least catch or finally
    if (!catchBody && !finallyBody) {
      this.error("Expected 'catch' or 'finally' after try block");
    }

    return new AST.TryCatchStatement(tryBlock.body, catchParam, catchBody, l, finallyBody);
  }

  parseReturnStatement() {
    const l = this.loc();
    const returnToken = this.expect(TokenType.RETURN);

    let value = null;
    // Only parse return value if the next token is on the same line as `return`
    // This prevents `return\nx = 5` from being parsed as `return x` then `= 5`
    if (!this.check(TokenType.RBRACE) && !this.isAtEnd() && this.current().line === returnToken.line) {
      value = this.parseExpression();
    }

    return new AST.ReturnStatement(value, l);
  }

  parseImport() {
    const l = this.loc();
    this.expect(TokenType.IMPORT);

    // import * as name from "module"
    if (this.check(TokenType.STAR)) {
      this.advance(); // consume *
      this.expect(TokenType.AS, "Expected 'as' after '*' in wildcard import");
      const name = this.expect(TokenType.IDENTIFIER, "Expected namespace name after 'as'").value;
      this.expect(TokenType.FROM, "Expected 'from' in import");
      const source = this.expect(TokenType.STRING, "Expected module path").value;
      return new AST.ImportWildcard(name, source, l);
    }

    // import { a, b } from "module"
    if (this.match(TokenType.LBRACE)) {
      const specifiers = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const imported = this.expect(TokenType.IDENTIFIER, "Expected import name").value;
        let local = imported;
        if (this.match(TokenType.AS)) {
          local = this.expect(TokenType.IDENTIFIER, "Expected alias name").value;
        }
        specifiers.push(new AST.ImportSpecifier(imported, local, this.loc()));
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in import");
      this.expect(TokenType.FROM, "Expected 'from' in import");
      const source = this.expect(TokenType.STRING, "Expected module path").value;
      return new AST.ImportDeclaration(specifiers, source, l);
    }

    // import Name from "module"
    const name = this.expect(TokenType.IDENTIFIER, "Expected import name").value;
    this.expect(TokenType.FROM, "Expected 'from' in import");
    const source = this.expect(TokenType.STRING, "Expected module path").value;
    return new AST.ImportDefault(name, source, l);
  }

  parseBlock() {
    const l = this.loc();
    this.expect(TokenType.LBRACE, "Expected '{'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}'");
    return new AST.BlockStatement(body, l);
  }

  // ─── Expression or Assignment ─────────────────────────────

  parseExpressionOrAssignment() {
    const l = this.loc();
    const expr = this.parseExpression();

    // Multiple assignment: a, b = 1, 2
    if (this.check(TokenType.COMMA) && expr.type === 'Identifier') {
      const targets = [expr.name];
      while (this.match(TokenType.COMMA)) {
        targets.push(this.expect(TokenType.IDENTIFIER, "Expected variable name").value);
      }
      this.expect(TokenType.ASSIGN, "Expected '=' in multiple assignment");
      const values = [this.parseExpression()];
      while (this.match(TokenType.COMMA)) {
        values.push(this.parseExpression());
      }
      return new AST.Assignment(targets, values, l);
    }

    // Simple assignment: x = expr (creates immutable binding), obj.x = expr, arr[i] = expr
    if (this.match(TokenType.ASSIGN)) {
      if (expr.type === 'Identifier') {
        const value = this.parseExpression();
        return new AST.Assignment([expr.name], [value], l);
      }
      if (expr.type === 'MemberExpression') {
        const value = this.parseExpression();
        return new AST.Assignment([expr], [value], l);
      }
      // Destructuring without let: {name, age} = user  or  [a, b] = list
      if (expr.type === 'ObjectLiteral') {
        const pattern = new AST.ObjectPattern(
          expr.properties.map(p => ({ key: typeof p.key === 'string' ? p.key : p.key.name || p.key, value: typeof p.key === 'string' ? p.key : p.key.name || p.key })),
          expr.loc
        );
        const value = this.parseExpression();
        return new AST.LetDestructure(pattern, value, l);
      }
      if (expr.type === 'ArrayLiteral') {
        const pattern = new AST.ArrayPattern(
          expr.elements.map(e => e.type === 'Identifier' ? e.name : '_'),
          expr.loc
        );
        const value = this.parseExpression();
        return new AST.LetDestructure(pattern, value, l);
      }
      this.error("Invalid assignment target");
    }

    // Compound assignment: x += expr
    const compoundOp = this.match(TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN);
    if (compoundOp) {
      if (expr.type !== 'Identifier' && expr.type !== 'MemberExpression') {
        this.error("Invalid compound assignment target");
      }
      const value = this.parseExpression();
      return new AST.CompoundAssignment(expr, compoundOp.value, value, l);
    }

    return new AST.ExpressionStatement(expr, l);
  }

  parseMatchAsStatement() {
    const expr = this.parseMatchExpression();
    return new AST.ExpressionStatement(expr, this.loc());
  }

  parseIfExpression() {
    const l = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    const consequent = this.parseBlock();

    const alternates = [];
    while (this.check(TokenType.ELIF) ||
           (this.check(TokenType.ELSE) && this.peek(1).type === TokenType.IF)) {
      if (this.check(TokenType.ELIF)) {
        this.advance();
      } else {
        this.advance(); // else
        this.advance(); // if
      }
      const elifCond = this.parseExpression();
      const elifBody = this.parseBlock();
      alternates.push({ condition: elifCond, body: elifBody });
    }

    if (!this.check(TokenType.ELSE)) {
      this.error("if expression requires an else branch");
    }
    this.advance();
    const elseBody = this.parseBlock();

    return new AST.IfExpression(condition, consequent, alternates, elseBody, l);
  }

  // ─── Expressions (precedence climbing) ────────────────────

  parseExpression() {
    if (this._expressionDepth >= Parser.MAX_EXPRESSION_DEPTH) {
      this.error('Expression nested too deeply (max ' + Parser.MAX_EXPRESSION_DEPTH + ' levels)');
    }
    this._expressionDepth++;
    try {
      return this.parsePipe();
    } finally {
      this._expressionDepth--;
    }
  }

  parsePipe() {
    let left = this.parseNullCoalesce();
    while (this.match(TokenType.PIPE)) {
      const opTok = this.tokens[this.pos - 1];
      const l = { line: opTok.line, column: opTok.column, file: this.filename };
      // Method pipe: |> .method(args) — parse as MemberExpression with empty Identifier
      if (this.check(TokenType.DOT)) {
        this.advance(); // consume .
        const method = this.expect(TokenType.IDENTIFIER, "Expected method name after '.'").value;
        const placeholder = new AST.Identifier(AST.PIPE_TARGET, l);
        const memberExpr = new AST.MemberExpression(placeholder, method, false, l);
        if (this.check(TokenType.LPAREN)) {
          const call = this.parseCallExpression(memberExpr);
          left = new AST.PipeExpression(left, call, l);
        } else {
          left = new AST.PipeExpression(left, memberExpr, l);
        }
      } else {
        const right = this.parseNullCoalesce();
        left = new AST.PipeExpression(left, right, l);
      }
    }
    return left;
  }

  parseNullCoalesce() {
    let left = this.parseOr();
    while (this.match(TokenType.QUESTION_QUESTION)) {
      const opTok = this.tokens[this.pos - 1];
      const l = { line: opTok.line, column: opTok.column, file: this.filename };
      const right = this.parseOr();
      left = new AST.BinaryExpression('??', left, right, l);
    }
    return left;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.match(TokenType.OR_OR) || this.match(TokenType.OR)) {
      const opTok = this.tokens[this.pos - 1];
      const l = { line: opTok.line, column: opTok.column, file: this.filename };
      const right = this.parseAnd();
      left = new AST.LogicalExpression('or', left, right, l);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.match(TokenType.AND_AND) || this.match(TokenType.AND)) {
      const opTok = this.tokens[this.pos - 1];
      const l = { line: opTok.line, column: opTok.column, file: this.filename };
      const right = this.parseNot();
      left = new AST.LogicalExpression('and', left, right, l);
    }
    return left;
  }

  parseNot() {
    if (this.match(TokenType.NOT) || this.match(TokenType.BANG)) {
      const opTok = this.tokens[this.pos - 1];
      const l = { line: opTok.line, column: opTok.column, file: this.filename };
      const operand = this.parseNot();
      return new AST.UnaryExpression('not', operand, true, l);
    }
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseMembership();

    // Check for chained comparisons: a < b < c
    if (Parser.COMPARISON_OPS.has(this.current().type)) {
      // Don't parse < as comparison if it looks like JSX
      if (this.check(TokenType.LESS) && this._looksLikeJSX()) {
        return left;
      }
      const l = this.loc(); // capture loc at the operator
      const operands = [left];
      const operators = [];

      while (Parser.COMPARISON_OPS.has(this.current().type)) {
        const op = this.advance();
        operators.push(op.value);
        operands.push(this.parseMembership());
      }

      if (operators.length === 1) {
        return new AST.BinaryExpression(operators[0], operands[0], operands[1], l);
      }
      return new AST.ChainedComparison(operands, operators, l);
    }

    return left;
  }

  parseMembership() {
    let left = this.parseRange();

    // "is" / "is not" — type checking: value is String, value is not Nil
    if (this.check(TokenType.IS)) {
      const l = this.loc();
      this.advance(); // is
      let negated = false;
      if (this.check(TokenType.NOT)) {
        this.advance(); // not
        negated = true;
      }
      const typeName = this.expect(TokenType.IDENTIFIER, "Expected type name after 'is'").value;
      return new AST.IsExpression(left, typeName, negated, l);
    }

    // "in" / "not in"
    if (this.check(TokenType.NOT) && this.peek(1).type === TokenType.IN) {
      const l = this.loc();
      this.advance(); // not
      this.advance(); // in
      const right = this.parseRange();
      return new AST.MembershipExpression(left, right, true, l);
    }

    if (this.check(TokenType.IN)) {
      const l = this.loc();
      this.advance();
      const right = this.parseRange();
      return new AST.MembershipExpression(left, right, false, l);
    }

    return left;
  }

  parseRange() {
    let left = this.parseAddition();

    if (this.check(TokenType.DOT_DOT_EQUAL)) {
      const l = this.loc();
      this.advance();
      const right = this.parseAddition();
      return new AST.RangeExpression(left, right, true, l);
    }
    if (this.check(TokenType.DOT_DOT)) {
      const l = this.loc();
      this.advance();
      const right = this.parseAddition();
      return new AST.RangeExpression(left, right, false, l);
    }

    return left;
  }

  parseAddition() {
    let left = this.parseMultiplication();
    while (true) {
      const l = this.loc();
      const op = this.match(TokenType.PLUS, TokenType.MINUS);
      if (!op) break;
      const right = this.parseMultiplication();
      left = new AST.BinaryExpression(op.value, left, right, l);
    }
    return left;
  }

  parseMultiplication() {
    let left = this.parsePower();
    while (true) {
      const l = this.loc();
      const op = this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT);
      if (!op) break;
      const right = this.parsePower();
      left = new AST.BinaryExpression(op.value, left, right, l);
    }
    return left;
  }

  parsePower() {
    let base = this.parseUnary();
    if (this.check(TokenType.POWER)) {
      const l = this.loc();
      this.advance();
      const exp = this.parsePower(); // Right-associative
      return new AST.BinaryExpression('**', base, exp, l);
    }
    return base;
  }

  parseUnary() {
    if (this.check(TokenType.AWAIT)) {
      const l = this.loc();
      this.advance();
      const operand = this.parseUnary();
      return new AST.AwaitExpression(operand, l);
    }
    if (this.check(TokenType.YIELD)) {
      const l = this.loc();
      this.advance();
      // yield from expr
      let delegate = false;
      if (this.check(TokenType.FROM)) {
        this.advance();
        delegate = true;
      }
      const operand = this.parseUnary();
      return new AST.YieldExpression(operand, delegate, l);
    }
    // Negated column expression: -.column (for select exclusion)
    if (this.check(TokenType.MINUS) && this.peek(1).type === TokenType.DOT && this.peek(2).type === TokenType.IDENTIFIER) {
      const l = this.loc();
      this.advance(); // consume -
      this.advance(); // consume .
      const name = this.advance().value;
      return new AST.NegatedColumnExpression(name, l);
    }
    if (this.check(TokenType.MINUS)) {
      const l = this.loc();
      this.advance();
      const operand = this.parseUnary();
      return new AST.UnaryExpression('-', operand, true, l);
    }
    if (this.check(TokenType.SPREAD)) {
      const l = this.loc();
      this.advance();
      const operand = this.parseUnary();
      return new AST.SpreadExpression(operand, l);
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check(TokenType.DOT)) {
        const l = this.loc();
        this.advance();
        // Tuple index access: t.0, t.1, etc.
        if (this.check(TokenType.NUMBER) && Number.isInteger(this.current().value) && this.current().value >= 0) {
          const idx = this.advance().value;
          expr = new AST.MemberExpression(expr, new AST.NumberLiteral(idx, l), true, l);
          continue;
        }
        const prop = this.expectPropertyName("Expected property name after '.'").value;
        expr = new AST.MemberExpression(expr, prop, false, l);
        continue;
      }

      if (this.check(TokenType.QUESTION_DOT)) {
        const l = this.loc();
        this.advance();
        const prop = this.expectPropertyName("Expected property name after '?.'").value;
        expr = new AST.OptionalChain(expr, prop, false, l);
        continue;
      }

      if (this.check(TokenType.LBRACKET)) {
        // Don't treat [ as subscript if it's on a new line (avoids ambiguity with array patterns in match)
        const prevLine = this.pos > 0 ? this.tokens[this.pos - 1].line : 0;
        const curLine = this.current().line;
        if (curLine > prevLine) break;
        expr = this.parseSubscript(expr);
        continue;
      }

      if (this.check(TokenType.LPAREN)) {
        // Don't treat ( as call if it's on a new line (avoids ambiguity with grouped expressions)
        const prevLine = this.pos > 0 ? this.tokens[this.pos - 1].line : 0;
        const curLine = this.current().line;
        if (curLine > prevLine) break;
        expr = this.parseCallExpression(expr);
        continue;
      }

      if (this.check(TokenType.QUESTION)) {
        const prevLine = this.pos > 0 ? this.tokens[this.pos - 1].line : 0;
        const curLine = this.current().line;
        if (curLine === prevLine) {
          const l = this.loc();
          this.advance();
          expr = new AST.PropagateExpression(expr, l);
          continue;
        }
      }

      break;
    }

    return expr;
  }

  parseSubscript(object) {
    const l = this.loc();
    this.expect(TokenType.LBRACKET);

    // Handle [::step] — DOUBLE_COLON is lexed as one token
    if (this.check(TokenType.DOUBLE_COLON)) {
      this.advance();
      let step = null;
      if (!this.check(TokenType.RBRACKET)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, null, null, step, l);
    }

    // Check for slice: obj[start:end:step]
    if (this.check(TokenType.COLON)) {
      // [:end] or [:end:step]
      this.advance();
      let end = null;
      let step = null;
      if (!this.check(TokenType.COLON) && !this.check(TokenType.DOUBLE_COLON) && !this.check(TokenType.RBRACKET)) {
        end = this.parseExpression();
      }
      if (this.match(TokenType.COLON)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, null, end, step, l);
    }

    const start = this.parseExpression();

    // Handle [start::step] — DOUBLE_COLON after start expression
    if (this.check(TokenType.DOUBLE_COLON)) {
      this.advance();
      let step = null;
      if (!this.check(TokenType.RBRACKET)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, start, null, step, l);
    }

    if (this.match(TokenType.COLON)) {
      // [start:end] or [start:end:step]
      let end = null;
      let step = null;
      if (!this.check(TokenType.COLON) && !this.check(TokenType.DOUBLE_COLON) && !this.check(TokenType.RBRACKET)) {
        end = this.parseExpression();
      }
      if (this.match(TokenType.COLON)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, start, end, step, l);
    }

    this.expect(TokenType.RBRACKET, "Expected ']'");
    return new AST.MemberExpression(object, start, true, l);
  }

  parseCallExpression(callee) {
    const l = this.loc();
    this.expect(TokenType.LPAREN);
    const args = [];

    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      // Check for named argument: name: value
      if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
        const name = this.advance().value;
        this.advance(); // :
        const value = this.parseExpression();
        args.push(new AST.NamedArgument(name, this._maybeWrapItLambda(value), this.loc()));
      } else {
        args.push(this._maybeWrapItLambda(this.parseExpression()));
      }
      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RPAREN, "Expected ')' after arguments");
    return new AST.CallExpression(callee, args, l);
  }

  // ─── Primary expressions ──────────────────────────────────

  parsePrimary() {
    const l = this.loc();
    const tokenType = this.current().type;

    switch (tokenType) {
      case TokenType.NUMBER:
        return new AST.NumberLiteral(this.advance().value, l);

      case TokenType.STRING:
      case TokenType.STRING_TEMPLATE:
        return this.parseStringLiteral();

      case TokenType.REGEX: {
        const token = this.advance();
        return new AST.RegexLiteral(token.value.pattern, token.value.flags, l);
      }

      case TokenType.TRUE:
        this.advance();
        return new AST.BooleanLiteral(true, l);

      case TokenType.FALSE:
        this.advance();
        return new AST.BooleanLiteral(false, l);

      case TokenType.NIL:
        this.advance();
        return new AST.NilLiteral(l);

      case TokenType.MATCH:
        return this.parseMatchExpression();

      case TokenType.IF:
        return this.parseIfExpression();

      case TokenType.ASYNC:
        if (this.peek(1).type === TokenType.FN) {
          return this.parseAsyncLambda();
        }
        break;

      case TokenType.FN:
        if (this.peek(1).type === TokenType.LPAREN) {
          return this.parseLambda();
        }
        break;

      case TokenType.LBRACKET:
        return this.parseArrayOrComprehension();

      case TokenType.LBRACE:
        return this.parseObjectOrDictComprehension();

      case TokenType.DOT:
        // Column expression: .column (for table operations)
        if (this.peek(1).type === TokenType.IDENTIFIER) {
          this.advance(); // consume .
          const name = this.advance().value; // consume identifier
          // Check for column assignment: .col = expr (used in derive)
          if (this.check(TokenType.ASSIGN)) {
            this.advance(); // consume =
            const expr = this.parseExpression();
            return new AST.ColumnAssignment(name, expr, l);
          }
          return new AST.ColumnExpression(name, l);
        }
        break;

      case TokenType.LPAREN:
        return this.parseParenOrArrowLambda();

      case TokenType.SERVER:
      case TokenType.BROWSER:
      case TokenType.SHARED:
      case TokenType.DERIVE:
        return new AST.Identifier(this.advance().value, l);

      case TokenType.IDENTIFIER: {
        const name = this.advance().value;
        // Check for arrow lambda: x => expr or x -> expr
        if (this.check(TokenType.ARROW) || this.check(TokenType.THIN_ARROW)) {
          this.advance();
          const body = this.parseExpression();
          return new AST.LambdaExpression(
            [new AST.Parameter(name, null, null, l)],
            body,
            l
          );
        }
        return new AST.Identifier(name, l);
      }
    }

    // Contextual keywords that can appear as identifiers in expression position
    if (this._isContextualKeyword()) {
      return new AST.Identifier(this.advance().value, l);
    }

    this.error(`Unexpected token: ${this.current().type}`);
  }

  parseStringLiteral() {
    const l = this.loc();
    const tok = this.advance();

    if (tok.type === TokenType.STRING) {
      return new AST.StringLiteral(tok.value, l);
    }

    // String template with interpolation
    const parts = tok.value.map(part => {
      if (part.type === 'text') {
        return { type: 'text', value: part.value };
      }
      // Re-parse the expression tokens
      const subParser = new Parser(
        [...part.tokens, { type: TokenType.EOF, value: null, line: 0, column: 0 }],
        this.filename
      );
      const expr = subParser.parseExpression();
      return { type: 'expr', value: expr };
    });

    return new AST.TemplateLiteral(parts, l);
  }

  parseLambda() {
    const l = this.loc();
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN);
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN);

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      // Parse expression, then check for compound/simple assignment
      const expr = this.parseExpression();
      const compoundOp = this.match(TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN);
      if (compoundOp) {
        const value = this.parseExpression();
        body = new AST.CompoundAssignment(expr, compoundOp.value, value, l);
      } else if (this.match(TokenType.ASSIGN)) {
        if (expr.type === 'Identifier') {
          const value = this.parseExpression();
          body = new AST.Assignment([expr.name], [value], l);
        } else {
          body = expr;
        }
      } else {
        body = expr;
      }
    }

    return new AST.LambdaExpression(params, body, l);
  }

  parseAsyncLambda() {
    const l = this.loc();
    this.expect(TokenType.ASYNC);
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN);
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN);

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return new AST.LambdaExpression(params, body, l, true);
  }

  parseMatchExpression() {
    const l = this.loc();
    this.expect(TokenType.MATCH);
    const subject = this.parseExpression();
    this.expect(TokenType.LBRACE, "Expected '{' to open match body");

    const arms = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      arms.push(this.parseMatchArm());
      this.match(TokenType.COMMA); // Optional comma between arms
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close match body");
    return new AST.MatchExpression(subject, arms, l);
  }

  parseMatchArm() {
    const l = this.loc();
    const pattern = this.parsePattern();

    let guard = null;
    if (this.match(TokenType.IF)) {
      guard = this.parseExpression();
    }

    this.expect(TokenType.ARROW, "Expected '=>' in match arm");

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return new AST.MatchArm(pattern, guard, body, l);
  }

  parsePattern() {
    const l = this.loc();

    // Wildcard _
    if (this.checkValue(TokenType.IDENTIFIER, '_')) {
      this.advance();
      return new AST.WildcardPattern(l);
    }

    // Negative number literal pattern: -1, -3.14
    if (this.check(TokenType.MINUS) && this.peek(1).type === TokenType.NUMBER) {
      this.advance(); // consume -
      const val = -this.advance().value;
      // Check for range pattern: -5..0
      if (this.match(TokenType.DOT_DOT_EQUAL)) {
        const endNeg = this.match(TokenType.MINUS);
        const end = this.expect(TokenType.NUMBER, "Expected number in range pattern").value;
        return new AST.RangePattern(val, endNeg ? -end : end, true, l);
      }
      if (this.match(TokenType.DOT_DOT)) {
        const endNeg = this.match(TokenType.MINUS);
        const end = this.expect(TokenType.NUMBER, "Expected number in range pattern").value;
        return new AST.RangePattern(val, endNeg ? -end : end, false, l);
      }
      return new AST.LiteralPattern(val, l);
    }

    // Number literal pattern
    if (this.check(TokenType.NUMBER)) {
      const val = this.advance().value;
      // Check for range pattern: 1..10
      if (this.match(TokenType.DOT_DOT_EQUAL)) {
        const end = this.expect(TokenType.NUMBER, "Expected number in range pattern").value;
        return new AST.RangePattern(val, end, true, l);
      }
      if (this.match(TokenType.DOT_DOT)) {
        const end = this.expect(TokenType.NUMBER, "Expected number in range pattern").value;
        return new AST.RangePattern(val, end, false, l);
      }
      return new AST.LiteralPattern(val, l);
    }

    // String literal pattern, possibly with ++ concat pattern
    if (this.check(TokenType.STRING)) {
      const strVal = this.advance().value;
      // Check for string concat pattern: "prefix" ++ rest
      // Verify the two + tokens are adjacent (no space between them) to distinguish from arithmetic
      if (this.check(TokenType.PLUS) && this.peek(1).type === TokenType.PLUS &&
          this.current().column + 1 === this.peek(1).column && this.current().line === this.peek(1).line) {
        this.advance(); // first +
        this.advance(); // second +
        const rest = this.parsePattern();
        return new AST.StringConcatPattern(strVal, rest, l);
      }
      return new AST.LiteralPattern(strVal, l);
    }

    // Boolean literal pattern
    if (this.check(TokenType.TRUE)) {
      this.advance();
      return new AST.LiteralPattern(true, l);
    }
    if (this.check(TokenType.FALSE)) {
      this.advance();
      return new AST.LiteralPattern(false, l);
    }

    // Nil pattern
    if (this.check(TokenType.NIL)) {
      this.advance();
      return new AST.LiteralPattern(null, l);
    }

    // Array pattern: [a, b, c] or [0, _]
    if (this.check(TokenType.LBRACKET)) {
      this.advance();
      const elements = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        elements.push(this.parsePattern());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET);
      return new AST.ArrayPattern(elements, l);
    }

    // Tuple pattern: (a, b)
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const elements = [];
      while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
        elements.push(this.parsePattern());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RPAREN, "Expected ')' in tuple pattern");
      return new AST.TuplePattern(elements, l);
    }

    // Identifier: could be variant pattern or binding pattern
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;

      // Variant pattern: Circle(r), Some(Ok(value))
      if (this.match(TokenType.LPAREN)) {
        const fields = [];
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          fields.push(this.parsePattern());
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN);
        return new AST.VariantPattern(name, fields, l);
      }

      // Binding pattern (lowercase = binding, uppercase = variant without args)
      if (name[0] === name[0].toUpperCase() && name[0] !== '_') {
        return new AST.VariantPattern(name, [], l);
      }
      return new AST.BindingPattern(name, l);
    }

    this.error("Expected pattern");
  }

  parseArrayOrComprehension() {
    const l = this.loc();
    this.expect(TokenType.LBRACKET);

    if (this.check(TokenType.RBRACKET)) {
      this.advance();
      return new AST.ArrayLiteral([], l);
    }

    // Parse first expression
    const first = this.parseExpression();

    // Check if this is a list comprehension: [expr for x in items]
    if (this.check(TokenType.FOR)) {
      this.advance();
      const variable = this.expect(TokenType.IDENTIFIER, "Expected variable in comprehension").value;
      this.expect(TokenType.IN, "Expected 'in' in comprehension");
      const iterable = this.parseExpression();

      let condition = null;
      if (this.match(TokenType.IF)) {
        condition = this.parseExpression();
      }

      this.expect(TokenType.RBRACKET, "Expected ']' to close comprehension");
      return new AST.ListComprehension(first, variable, iterable, condition, l);
    }

    // Regular array literal
    const elements = [first];
    while (this.match(TokenType.COMMA)) {
      if (this.check(TokenType.RBRACKET)) break; // trailing comma
      elements.push(this.parseExpression());
    }

    this.expect(TokenType.RBRACKET, "Expected ']'");
    return new AST.ArrayLiteral(elements, l);
  }

  _parseObjectProperty() {
    // Spread property: ...expr
    if (this.check(TokenType.SPREAD)) {
      const sl = this.loc();
      this.advance();
      const argument = this.parseUnary();
      return { spread: true, argument };
    }
    const key = this.parseExpression();
    if (this.match(TokenType.COLON)) {
      const value = this.parseExpression();
      return { key, value, shorthand: false };
    }
    if (key.type === 'Identifier') {
      return { key, value: key, shorthand: true };
    }
    this.error("Expected ':' in object literal");
  }

  parseObjectOrDictComprehension() {
    const l = this.loc();
    this.expect(TokenType.LBRACE);

    if (this.check(TokenType.RBRACE)) {
      this.advance();
      return new AST.ObjectLiteral([], l);
    }

    // Check for spread as first element — always an object literal
    if (this.check(TokenType.SPREAD)) {
      const properties = [this._parseObjectProperty()];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACE)) break;
        properties.push(this._parseObjectProperty());
      }
      this.expect(TokenType.RBRACE, "Expected '}'");
      return new AST.ObjectLiteral(properties, l);
    }

    // Try to parse first key: value pair
    const firstKey = this.parseExpression();

    if (this.match(TokenType.COLON)) {
      const firstValue = this.parseExpression();

      // Dict comprehension: {k: v for k, v in pairs}
      if (this.check(TokenType.FOR)) {
        this.advance();
        const vars = [];
        vars.push(this.expect(TokenType.IDENTIFIER, "Expected variable").value);
        if (this.match(TokenType.COMMA)) {
          vars.push(this.expect(TokenType.IDENTIFIER, "Expected variable").value);
        }
        this.expect(TokenType.IN, "Expected 'in' in comprehension");
        const iterable = this.parseExpression();
        let condition = null;
        if (this.match(TokenType.IF)) {
          condition = this.parseExpression();
        }
        this.expect(TokenType.RBRACE, "Expected '}' to close dict comprehension");
        return new AST.DictComprehension(firstKey, firstValue, vars, iterable, condition, l);
      }

      // Regular object literal
      const properties = [{ key: firstKey, value: firstValue, shorthand: false }];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACE)) break;
        properties.push(this._parseObjectProperty());
      }

      this.expect(TokenType.RBRACE, "Expected '}'");
      return new AST.ObjectLiteral(properties, l);
    }

    // Shorthand object: { x, y } or mixed { x, y: 10 }
    if (firstKey.type === 'Identifier') {
      const properties = [{ key: firstKey, value: firstKey, shorthand: true }];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACE)) break;
        properties.push(this._parseObjectProperty());
      }
      this.expect(TokenType.RBRACE, "Expected '}'");
      return new AST.ObjectLiteral(properties, l);
    }

    this.error("Invalid object literal");
  }

  parseParenOrArrowLambda() {
    const l = this.loc();

    // Save position to backtrack if needed
    const savedPos = this.pos;

    this.expect(TokenType.LPAREN);

    // Empty parens: () => expr or () -> expr
    if (this.check(TokenType.RPAREN)) {
      this.advance();
      if (this.check(TokenType.ARROW) || this.check(TokenType.THIN_ARROW)) {
        this.advance();
        const body = this.parseExpression();
        return new AST.LambdaExpression([], body, l);
      }
      // Empty parens but not arrow — error or unit value
      this.error("Unexpected '()'");
    }

    // Try to parse as arrow lambda params
    // Look ahead: if we see ) => then it's a lambda
    const params = [];
    let isLambda = true;

    const savedErrors = this.errors.length;
    try {
      const innerSaved = this.pos;
      while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
        if (!this.check(TokenType.IDENTIFIER)) {
          isLambda = false;
          break;
        }
        const pname = this.advance().value;
        let ptype = null;
        let pdefault = null;
        if (this.match(TokenType.COLON)) {
          // Could be a type annotation or named argument
          if (this.check(TokenType.IDENTIFIER)) {
            ptype = this.parseTypeAnnotation();
          } else {
            isLambda = false;
            break;
          }
        }
        if (this.match(TokenType.ASSIGN)) {
          pdefault = this.parseExpression();
        }
        params.push(new AST.Parameter(pname, ptype, pdefault, l));
        if (!this.match(TokenType.COMMA)) break;
      }

      if (isLambda && this.check(TokenType.RPAREN)) {
        this.advance(); // )
        if (this.check(TokenType.ARROW) || this.check(TokenType.THIN_ARROW)) {
          this.advance(); // =>
          const body = this.check(TokenType.LBRACE) ? this.parseBlock() : this.parseExpression();
          return new AST.LambdaExpression(params, body, l);
        }
        // Helpful hint: user may have typed = instead of -> or =>
        if (this.check(TokenType.ASSIGN) || this.check(TokenType.EQUAL)) {
          this.error("Use '->' or '=>' for arrow functions: (x, y) -> expr");
        }
      }
    } catch (e) {
      // Speculative parse failure — expected during backtracking, not a real error
    }

    // Backtrack and parse as parenthesized expression or tuple
    // Also restore errors to discard any ghost errors from speculative parsing
    this.errors.length = savedErrors;
    this.pos = savedPos;
    this.expect(TokenType.LPAREN);
    const expr = this.parseExpression();

    // Tuple: (a, b, c) — requires at least one comma
    if (this.check(TokenType.COMMA)) {
      const elements = [expr];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RPAREN)) break; // trailing comma
        elements.push(this.parseExpression());
      }
      this.expect(TokenType.RPAREN, "Expected ')'");
      return new AST.TupleExpression(elements, l);
    }

    this.expect(TokenType.RPAREN, "Expected ')'");
    return expr;
  }

  // ─── Implicit `it` parameter support ─────────────────────

  _containsFreeIt(node) {
    if (!node) return false;
    if (node.type === 'Identifier' && node.name === 'it') return true;
    if (node.type === 'LambdaExpression' || node.type === 'FunctionDeclaration') return false;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && this._containsFreeIt(item)) return true;
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (this._containsFreeIt(val)) return true;
      }
    }
    return false;
  }

  _maybeWrapItLambda(node) {
    if (node.type === 'Identifier' && node.name === 'it') return node;
    if (node.type === 'LambdaExpression') return node;
    if (node.type === 'FunctionDeclaration') return node;
    if (this._containsFreeIt(node)) {
      const loc = node.loc || this.loc();
      return new AST.LambdaExpression(
        [new AST.Parameter('it', null, null, loc)],
        node, loc
      );
    }
    return node;
  }
}

// Initialize static Set after class definition (depends on TokenType)
Parser.COMPARISON_OPS = new Set([
  TokenType.LESS, TokenType.LESS_EQUAL,
  TokenType.GREATER, TokenType.GREATER_EQUAL,
  TokenType.EQUAL, TokenType.NOT_EQUAL
]);
