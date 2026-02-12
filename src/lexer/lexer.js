import { TokenType, Keywords, Token } from './tokens.js';

export class Lexer {
  constructor(source, filename = '<stdin>') {
    this.source = source;
    this.filename = filename;
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.length = source.length;

    // JSX context tracking for unquoted text support
    this._jsxStack = [];          // stack of 'tag' or 'cfblock' entries
    this._jsxTagOpening = false;  // true when < starts a JSX opening tag
    this._jsxSelfClosing = false; // true when / seen inside JSX tag (before >)
    this._jsxClosingTag = false;  // true when </ detected
    this._jsxExprDepth = 0;       // brace depth for {expr} inside JSX
    this._jsxControlFlowPending = false; // true after if/for/elif/else keyword in JSX
    this._cfParenDepth = 0;       // () and [] nesting in control flow condition
    this._cfBraceDepth = 0;       // {} nesting for expression braces (key={...})
  }

  error(message) {
    throw new Error(`${this.filename}:${this.line}:${this.column} — ${message}`);
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.length ? this.source[idx] : '\0';
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  match(expected) {
    if (this.pos < this.length && this.source[this.pos] === expected) {
      this.advance();
      return true;
    }
    return false;
  }

  addToken(type, value) {
    this.tokens.push(new Token(type, value, this.line, this.column));
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  isAlphaNumeric(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  isWhitespace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\r';
  }

  _isJSXStart() {
    const nextCh = this.peek();
    if (!this.isAlpha(nextCh)) return false;
    // Check the token BEFORE < (LESS was already pushed, so it's at length-2)
    const prev = this.tokens.length > 1 ? this.tokens[this.tokens.length - 2] : null;
    if (!prev) return true;
    const valueTypes = [TokenType.IDENTIFIER, TokenType.NUMBER, TokenType.STRING,
      TokenType.STRING_TEMPLATE, TokenType.RPAREN, TokenType.RBRACKET,
      TokenType.TRUE, TokenType.FALSE, TokenType.NIL];
    return !valueTypes.includes(prev.type);
  }

  tokenize() {
    while (this.pos < this.length) {
      this.scanToken();
    }
    this.tokens.push(new Token(TokenType.EOF, null, this.line, this.column));
    return this.tokens;
  }

  scanToken() {
    // In JSX children mode, scan raw text instead of normal tokens
    if (this._jsxStack.length > 0 && this._jsxExprDepth === 0 &&
        !this._jsxTagOpening && !this._jsxClosingTag &&
        !this._jsxControlFlowPending) {
      return this._scanInJSXChildren();
    }

    const ch = this.peek();

    // Skip whitespace (not newlines)
    if (this.isWhitespace(ch)) {
      this.advance();
      return;
    }

    // Newlines
    if (ch === '\n') {
      this.tokens.push(new Token(TokenType.NEWLINE, '\n', this.line, this.column));
      this.advance();
      return;
    }

    // Comments
    if (ch === '/' && this.peek(1) === '/') {
      this.scanComment();
      return;
    }
    if (ch === '/' && this.peek(1) === '*') {
      this.scanBlockComment();
      return;
    }

    // Numbers
    if (this.isDigit(ch)) {
      this.scanNumber();
      return;
    }

    // Strings
    if (ch === '"') {
      this.scanString();
      return;
    }
    if (ch === "'") {
      this.scanSimpleString();
      return;
    }

    // Identifiers and keywords
    if (this.isAlpha(ch)) {
      this.scanIdentifier();
      return;
    }

    // Operators and delimiters
    this.scanOperator();
  }

  _scanInJSXChildren() {
    const ch = this.peek();

    // Close control flow block: } when top of stack is 'cfblock'
    if (ch === '}' && this._jsxStack.length > 0 && this._jsxStack[this._jsxStack.length - 1] === 'cfblock') {
      this._jsxStack.pop();
      this.scanOperator(); // emits RBRACE
      return;
    }

    // Skip whitespace/newlines silently when followed by structural chars
    if (this.isWhitespace(ch) || ch === '\n') {
      let pp = this.pos;
      while (pp < this.length && (this.source[pp] === ' ' || this.source[pp] === '\t' || this.source[pp] === '\r' || this.source[pp] === '\n')) {
        pp++;
      }
      const nextNonWs = pp < this.length ? this.source[pp] : '\0';
      // Skip whitespace if next meaningful char is structural
      if (nextNonWs === '<' || nextNonWs === '{' || nextNonWs === '}' || nextNonWs === '"' || nextNonWs === "'" || pp >= this.length) {
        while (this.pos < pp) this.advance();
        return;
      }
      // Check if next non-ws starts a keyword (if/for/elif/else)
      if (this.isAlpha(nextNonWs)) {
        let word = '', wp = pp;
        while (wp < this.length && this.isAlphaNumeric(this.source[wp])) {
          word += this.source[wp]; wp++;
        }
        if (['if', 'for', 'elif', 'else'].includes(word)) {
          while (this.pos < pp) this.advance();
          return;
        }
      }
      // Otherwise, fall through to collect as JSX text
    }

    if (ch === '{') {
      this.scanOperator();
      this._jsxExprDepth = 1;
      return;
    }
    if (ch === '<') {
      // In JSX children, set flags directly (heuristic may fail after STRING tokens)
      const nextCh = this.peek(1);
      if (nextCh === '/') {
        this._jsxClosingTag = true;
      } else if (this.isAlpha(nextCh)) {
        this._jsxTagOpening = true;
      }
      this.scanOperator();
      return;
    }
    if (ch === '"') { this.scanString(); return; }
    if (ch === "'") { this.scanSimpleString(); return; }

    // Check for JSX control flow keywords: if, for, elif, else
    if (this.isAlpha(ch)) {
      let word = '', peekPos = this.pos;
      while (peekPos < this.length && this.isAlphaNumeric(this.source[peekPos])) {
        word += this.source[peekPos]; peekPos++;
      }
      if (['if', 'for', 'elif', 'else'].includes(word)) {
        this.scanIdentifier();
        // After keyword, enter control flow pending mode for normal scanning
        this._jsxControlFlowPending = true;
        this._cfParenDepth = 0;
        this._cfBraceDepth = 0;
        return;
      }
    }

    // Everything else: scan as raw JSX text
    this._scanJSXText();
  }

  _scanJSXText() {
    const startLine = this.line, startCol = this.column;
    let text = '';
    while (this.pos < this.length) {
      const ch = this.peek();
      if (ch === '<' || ch === '{' || ch === '"' || ch === "'") break;
      // Stop at keywords if, for, elif, else preceded by whitespace
      if (this.isAlpha(ch) && text.length > 0 && /\s$/.test(text)) {
        let word = '', pp = this.pos;
        while (pp < this.length && this.isAlphaNumeric(this.source[pp])) {
          word += this.source[pp]; pp++;
        }
        if (['if', 'for', 'elif', 'else'].includes(word)) break;
      }
      text += this.advance();
    }
    if (text.length > 0) {
      this.tokens.push(new Token(TokenType.JSX_TEXT, text, startLine, startCol));
    }
  }

  scanComment() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // /
    this.advance(); // /

    // Check for docstring ///
    const isDocstring = this.peek() === '/';
    if (isDocstring) this.advance();

    let value = '';
    while (this.pos < this.length && this.peek() !== '\n') {
      value += this.advance();
    }

    if (isDocstring) {
      this.tokens.push(new Token(TokenType.DOCSTRING, value.trim(), startLine, startCol));
    }
    // Regular comments are discarded
  }

  scanBlockComment() {
    this.advance(); // /
    this.advance(); // *
    let depth = 1;

    while (this.pos < this.length && depth > 0) {
      if (this.peek() === '/' && this.peek(1) === '*') {
        depth++;
        this.advance();
        this.advance();
      } else if (this.peek() === '*' && this.peek(1) === '/') {
        depth--;
        this.advance();
        this.advance();
      } else {
        this.advance();
      }
    }

    if (depth !== 0) {
      this.error('Unterminated block comment');
    }
  }

  scanNumber() {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    // Handle hex, octal, binary
    if (this.peek() === '0') {
      const next = this.peek(1);
      if (next === 'x' || next === 'X') {
        this.advance(); // 0
        this.advance(); // x
        while (this.pos < this.length && /[0-9a-fA-F_]/.test(this.peek())) {
          const ch = this.advance();
          if (ch !== '_') value += ch;
        }
        this.tokens.push(new Token(TokenType.NUMBER, parseInt(value, 16), startLine, startCol));
        return;
      }
      if (next === 'b' || next === 'B') {
        this.advance(); // 0
        this.advance(); // b
        while (this.pos < this.length && /[01_]/.test(this.peek())) {
          const ch = this.advance();
          if (ch !== '_') value += ch;
        }
        this.tokens.push(new Token(TokenType.NUMBER, parseInt(value, 2), startLine, startCol));
        return;
      }
      if (next === 'o' || next === 'O') {
        this.advance(); // 0
        this.advance(); // o
        while (this.pos < this.length && /[0-7_]/.test(this.peek())) {
          const ch = this.advance();
          if (ch !== '_') value += ch;
        }
        this.tokens.push(new Token(TokenType.NUMBER, parseInt(value, 8), startLine, startCol));
        return;
      }
    }

    // Decimal
    while (this.pos < this.length && (this.isDigit(this.peek()) || this.peek() === '_')) {
      const ch = this.advance();
      if (ch !== '_') value += ch;
    }

    // Decimal point
    if (this.peek() === '.' && this.peek(1) !== '.') {
      value += this.advance(); // .
      while (this.pos < this.length && (this.isDigit(this.peek()) || this.peek() === '_')) {
        const ch = this.advance();
        if (ch !== '_') value += ch;
      }
    }

    // Exponent
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (this.pos < this.length && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    this.tokens.push(new Token(TokenType.NUMBER, parseFloat(value), startLine, startCol));
  }

  scanString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // opening "

    const parts = [];
    let current = '';

    while (this.pos < this.length && this.peek() !== '"') {
      // Escape sequences
      if (this.peek() === '\\') {
        this.advance();
        const esc = this.advance();
        switch (esc) {
          case 'n': current += '\n'; break;
          case 't': current += '\t'; break;
          case 'r': current += '\r'; break;
          case '\\': current += '\\'; break;
          case '"': current += '"'; break;
          case '{': current += '{'; break;
          default: current += '\\' + esc;
        }
        continue;
      }

      // String interpolation: {expr}
      if (this.peek() === '{') {
        this.advance(); // {
        if (current.length > 0) {
          parts.push({ type: 'text', value: current });
          current = '';
        }

        // Lex the interpolation expression
        let depth = 1;
        let exprSource = '';
        while (this.pos < this.length && depth > 0) {
          if (this.peek() === '{') depth++;
          if (this.peek() === '}') {
            depth--;
            if (depth === 0) break;
          }
          exprSource += this.advance();
        }

        if (this.peek() !== '}') {
          this.error('Unterminated string interpolation');
        }
        this.advance(); // }

        // Sub-lex the expression
        const subLexer = new Lexer(exprSource, this.filename);
        const exprTokens = subLexer.tokenize();
        // Remove the EOF token
        exprTokens.pop();

        parts.push({ type: 'expr', tokens: exprTokens, source: exprSource });
        continue;
      }

      current += this.advance();
    }

    if (this.pos >= this.length) {
      this.error('Unterminated string');
    }
    this.advance(); // closing "

    // If there are no interpolation parts, emit a simple string
    if (parts.length === 0) {
      this.tokens.push(new Token(TokenType.STRING, current, startLine, startCol));
    } else {
      if (current.length > 0) {
        parts.push({ type: 'text', value: current });
      }
      this.tokens.push(new Token(TokenType.STRING_TEMPLATE, parts, startLine, startCol));
    }
  }

  scanSimpleString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // opening '

    let value = '';
    while (this.pos < this.length && this.peek() !== "'") {
      if (this.peek() === '\\') {
        this.advance();
        const esc = this.advance();
        switch (esc) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case "'": value += "'"; break;
          default: value += '\\' + esc;
        }
      } else {
        value += this.advance();
      }
    }

    if (this.pos >= this.length) {
      this.error('Unterminated string');
    }
    this.advance(); // closing '

    this.tokens.push(new Token(TokenType.STRING, value, startLine, startCol));
  }

  scanIdentifier() {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    while (this.pos < this.length && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    // Special case: "style {" → read raw CSS block
    if (value === 'style') {
      const savedPos = this.pos;
      const savedLine = this.line;
      const savedCol = this.column;
      // Skip whitespace (including newlines) to check for {
      while (this.pos < this.length && (this.isWhitespace(this.peek()) || this.peek() === '\n')) {
        this.advance();
      }
      if (this.peek() === '{') {
        this.advance(); // skip {
        let depth = 1;
        let css = '';
        while (depth > 0 && this.pos < this.length) {
          const ch = this.peek();
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) { this.advance(); break; }
          }
          css += this.advance();
        }
        this.tokens.push(new Token(TokenType.STYLE_BLOCK, css.trim(), startLine, startCol));
        return;
      }
      // Not a style block — restore position
      this.pos = savedPos;
      this.line = savedLine;
      this.column = savedCol;
    }

    // Check if it's a keyword
    const type = Keywords[value] || TokenType.IDENTIFIER;
    this.tokens.push(new Token(type, value, startLine, startCol));
  }

  scanOperator() {
    const startLine = this.line;
    const startCol = this.column;
    const ch = this.advance();

    switch (ch) {
      case '(':
        this.tokens.push(new Token(TokenType.LPAREN, '(', startLine, startCol));
        if (this._jsxControlFlowPending) this._cfParenDepth++;
        break;
      case ')':
        this.tokens.push(new Token(TokenType.RPAREN, ')', startLine, startCol));
        if (this._jsxControlFlowPending && this._cfParenDepth > 0) this._cfParenDepth--;
        break;
      case '{':
        this.tokens.push(new Token(TokenType.LBRACE, '{', startLine, startCol));
        if (this._jsxControlFlowPending) {
          if (this._cfBraceDepth > 0) {
            // Nested brace inside expression (e.g., key={obj.field})
            this._cfBraceDepth++;
          } else if (this._cfParenDepth > 0) {
            // Inside parens, this is an expression brace
            this._cfBraceDepth++;
          } else {
            // Check if prev token is ASSIGN (key={...}) or FOR (destructuring: for {a,b} in ...)
            const prev = this.tokens.length > 1 ? this.tokens[this.tokens.length - 2] : null;
            if (prev && (prev.type === TokenType.ASSIGN || prev.type === TokenType.FOR)) {
              this._cfBraceDepth++;
            } else {
              // This is the block opener for the control flow body
              this._jsxControlFlowPending = false;
              this._jsxStack.push('cfblock');
            }
          }
        } else if (this._jsxExprDepth > 0) {
          this._jsxExprDepth++;
        }
        break;
      case '}':
        this.tokens.push(new Token(TokenType.RBRACE, '}', startLine, startCol));
        if (this._jsxControlFlowPending && this._cfBraceDepth > 0) {
          this._cfBraceDepth--;
        } else if (this._jsxExprDepth > 0) {
          this._jsxExprDepth--;
        }
        break;
      case '[':
        this.tokens.push(new Token(TokenType.LBRACKET, '[', startLine, startCol));
        if (this._jsxControlFlowPending) this._cfParenDepth++;
        break;
      case ']':
        this.tokens.push(new Token(TokenType.RBRACKET, ']', startLine, startCol));
        if (this._jsxControlFlowPending && this._cfParenDepth > 0) this._cfParenDepth--;
        break;
      case ',':
        this.tokens.push(new Token(TokenType.COMMA, ',', startLine, startCol));
        break;
      case ';':
        this.tokens.push(new Token(TokenType.SEMICOLON, ';', startLine, startCol));
        break;

      case '+':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.PLUS_ASSIGN, '+=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.PLUS, '+', startLine, startCol));
        }
        break;

      case '-':
        if (this.match('>')) {
          this.tokens.push(new Token(TokenType.THIN_ARROW, '->', startLine, startCol));
        } else if (this.match('=')) {
          this.tokens.push(new Token(TokenType.MINUS_ASSIGN, '-=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.MINUS, '-', startLine, startCol));
        }
        break;

      case '*':
        if (this.match('*')) {
          this.tokens.push(new Token(TokenType.POWER, '**', startLine, startCol));
        } else if (this.match('=')) {
          this.tokens.push(new Token(TokenType.STAR_ASSIGN, '*=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.STAR, '*', startLine, startCol));
        }
        break;

      case '/':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.SLASH_ASSIGN, '/=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.SLASH, '/', startLine, startCol));
          if (this._jsxTagOpening) this._jsxSelfClosing = true;
        }
        break;

      case '%':
        this.tokens.push(new Token(TokenType.PERCENT, '%', startLine, startCol));
        break;

      case '=':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.EQUAL, '==', startLine, startCol));
        } else if (this.match('>')) {
          this.tokens.push(new Token(TokenType.ARROW, '=>', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.ASSIGN, '=', startLine, startCol));
        }
        break;

      case '!':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.NOT_EQUAL, '!=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.BANG, '!', startLine, startCol));
        }
        break;

      case '<':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.LESS_EQUAL, '<=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.LESS, '<', startLine, startCol));
          // Don't override flags already set by _scanInJSXChildren
          if (!this._jsxClosingTag && !this._jsxTagOpening) {
            if (this.peek() === '/') {
              this._jsxClosingTag = true;
            } else if (this._isJSXStart()) {
              this._jsxTagOpening = true;
            }
          }
        }
        break;

      case '>':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.GREATER_EQUAL, '>=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.GREATER, '>', startLine, startCol));
          // JSX state transitions on >
          if (this._jsxSelfClosing) {
            // Self-closing tag: <br/> — don't push to stack
            this._jsxTagOpening = false;
            this._jsxSelfClosing = false;
          } else if (this._jsxClosingTag) {
            // Closing tag: </div> — pop 'tag' from stack
            this._jsxClosingTag = false;
            if (this._jsxStack.length > 0) this._jsxStack.pop();
          } else if (this._jsxTagOpening) {
            // Opening tag: <div> — push 'tag' to stack (entering children mode)
            this._jsxTagOpening = false;
            this._jsxStack.push('tag');
          }
        }
        break;

      case '&':
        if (this.match('&')) {
          this.tokens.push(new Token(TokenType.AND_AND, '&&', startLine, startCol));
        } else if (this._jsxStack.length > 0) {
          // Inside JSX, & is valid text - should not reach here normally
          // but handle gracefully by treating as text
          this.tokens.push(new Token(TokenType.JSX_TEXT, '&', startLine, startCol));
        } else {
          this.error(`Unexpected character: '&'. Did you mean '&&'?`);
        }
        break;

      case '|':
        if (this.match('>')) {
          this.tokens.push(new Token(TokenType.PIPE, '|>', startLine, startCol));
        } else if (this.match('|')) {
          this.tokens.push(new Token(TokenType.OR_OR, '||', startLine, startCol));
        } else {
          this.error(`Unexpected character: '|'. Did you mean '|>' or '||'?`);
        }
        break;

      case '.':
        if (this.match('.')) {
          if (this.match('=')) {
            this.tokens.push(new Token(TokenType.DOT_DOT_EQUAL, '..=', startLine, startCol));
          } else if (this.match('.')) {
            this.tokens.push(new Token(TokenType.SPREAD, '...', startLine, startCol));
          } else {
            this.tokens.push(new Token(TokenType.DOT_DOT, '..', startLine, startCol));
          }
        } else {
          this.tokens.push(new Token(TokenType.DOT, '.', startLine, startCol));
        }
        break;

      case ':':
        if (this.match(':')) {
          this.tokens.push(new Token(TokenType.DOUBLE_COLON, '::', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.COLON, ':', startLine, startCol));
        }
        break;

      case '?':
        if (this.match('.')) {
          this.tokens.push(new Token(TokenType.QUESTION_DOT, '?.', startLine, startCol));
        } else if (this.match('?')) {
          this.tokens.push(new Token(TokenType.QUESTION_QUESTION, '??', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.QUESTION, '?', startLine, startCol));
        }
        break;

      default:
        this.error(`Unexpected character: '${ch}'`);
    }
  }
}
