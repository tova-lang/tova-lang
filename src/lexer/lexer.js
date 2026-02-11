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

  tokenize() {
    while (this.pos < this.length) {
      this.scanToken();
    }
    this.tokens.push(new Token(TokenType.EOF, null, this.line, this.column));
    return this.tokens;
  }

  scanToken() {
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
        break;
      case ')':
        this.tokens.push(new Token(TokenType.RPAREN, ')', startLine, startCol));
        break;
      case '{':
        this.tokens.push(new Token(TokenType.LBRACE, '{', startLine, startCol));
        break;
      case '}':
        this.tokens.push(new Token(TokenType.RBRACE, '}', startLine, startCol));
        break;
      case '[':
        this.tokens.push(new Token(TokenType.LBRACKET, '[', startLine, startCol));
        break;
      case ']':
        this.tokens.push(new Token(TokenType.RBRACKET, ']', startLine, startCol));
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
        }
        break;

      case '>':
        if (this.match('=')) {
          this.tokens.push(new Token(TokenType.GREATER_EQUAL, '>=', startLine, startCol));
        } else {
          this.tokens.push(new Token(TokenType.GREATER, '>', startLine, startCol));
        }
        break;

      case '&':
        if (this.match('&')) {
          this.tokens.push(new Token(TokenType.AND_AND, '&&', startLine, startCol));
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
