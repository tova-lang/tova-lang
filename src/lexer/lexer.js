import { TokenType, Keywords, Token } from './tokens.js';

export class Lexer {
  static MAX_INTERPOLATION_DEPTH = 64;

  // Pre-compiled regex constants (avoid re-compilation in hot loops)
  static UNICODE_LETTER_RE = /\p{Letter}/u;
  static UNICODE_ALPHANUM_RE = /[\p{Letter}\p{Number}\p{Mark}]/u;
  static HEX_DIGIT_RE = /[0-9a-fA-F_]/;
  static BINARY_DIGIT_RE = /[01_]/;
  static OCTAL_DIGIT_RE = /[0-7_]/;
  static REGEX_FLAG_RE = /[gimsuydv]/;
  static REGEX_START_RE = /[\s\/*=]/;
  static JSX_CF_KEYWORDS = new Set(['if', 'for', 'elif', 'else', 'match']);

  constructor(source, filename = '<stdin>', lineOffset = 0, columnOffset = 0, _depth = 0) {
    this.source = source;
    this.filename = filename;
    this.tokens = [];
    this.pos = 0;
    this.line = 1 + lineOffset;
    this.column = 1 + columnOffset;
    this.length = source.length;
    this._depth = _depth;

    // JSX context tracking (consolidated state machine)
    this._jsxStack = [];          // stack of 'tag' or 'cfblock' entries
    this._jsxTagMode = null;      // null | 'open' | 'close' — current tag parsing state
    this._jsxSelfClosing = false; // true when / seen in opening tag (before >)
    this._jsxExprDepth = 0;       // brace depth for {expr} inside JSX
    this._jsxCF = null;           // null | { paren: 0, brace: 0, keyword? } — control flow state
    this._matchBlockDepth = 0;    // brace depth for match body inside JSX
    this._subLexer = null;        // reusable sub-lexer for string interpolation
  }

  reset(source, lineOffset, columnOffset) {
    this.source = source;
    this.tokens = [];
    this.pos = 0;
    this.line = 1 + lineOffset;
    this.column = 1 + columnOffset;
    this.length = source.length;
    this._jsxStack = [];
    this._jsxTagMode = null;
    this._jsxSelfClosing = false;
    this._jsxExprDepth = 0;
    this._jsxCF = null;
    this._matchBlockDepth = 0;
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
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') return true;
    // Unicode letter support
    if (ch > '\x7f') return Lexer.UNICODE_LETTER_RE.test(ch);
    return false;
  }

  isAlphaNumeric(ch) {
    if (this.isAlpha(ch) || this.isDigit(ch)) return true;
    // Unicode continue characters (combining marks, etc.)
    if (ch > '\x7f') return Lexer.UNICODE_ALPHANUM_RE.test(ch);
    return false;
  }

  isWhitespace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\r';
  }

  _processEscape(esc) {
    switch (esc) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      case '{': return '{';
      case '}': return '}';
      default: return '\\' + esc;
    }
  }

  _isJSXStart() {
    const nextCh = this.peek();
    if (!this.isAlpha(nextCh)) return false;
    // Check the token BEFORE < (LESS was already pushed, so it's at length-2)
    const prev = this.tokens.length > 1 ? this.tokens[this.tokens.length - 2] : null;
    if (!prev) return true;
    return !Lexer.VALUE_TOKEN_TYPES.has(prev.type);
  }

  tokenize() {
    // Strip shebang line if present (e.g. #!/usr/bin/env tova)
    if (this.pos === 0 && this.source[0] === '#' && this.source[1] === '!') {
      while (this.pos < this.length && this.source[this.pos] !== '\n') this.advance();
      if (this.pos < this.length) this.advance();
    }

    while (this.pos < this.length) {
      this.scanToken();
    }
    this.tokens.push(new Token(TokenType.EOF, null, this.line, this.column));
    return this.tokens;
  }

  scanToken() {
    // In JSX children mode, scan raw text instead of normal tokens
    // (but not inside matchblock — match bodies need normal scanning for patterns/arrows)
    if (this._jsxStack.length > 0 && this._jsxExprDepth === 0 &&
        !this._jsxTagMode && !this._jsxCF && this._matchBlockDepth === 0) {
      return this._scanInJSXChildren();
    }

    const ch = this.peek();

    // Skip whitespace (not newlines) — batch skip for consecutive whitespace
    if (this.isWhitespace(ch)) {
      this.advance();
      while (this.pos < this.length && this.isWhitespace(this.source[this.pos])) {
        this.advance();
      }
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

    // Regex literals: /pattern/flags
    // Must not be /=, //, /*, and must be in a context where regex makes sense
    if (ch === '/' && this.peek(1) !== '/' && this.peek(1) !== '*' && this.peek(1) !== '='
        && this._jsxStack.length === 0) {
      let prev = null;
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        if (this.tokens[i].type !== TokenType.NEWLINE) {
          prev = this.tokens[i];
          break;
        }
      }
      // Negative list: if previous token ends an expression (produces a value),
      // then / is division. Otherwise, / starts a regex.
      // This is simpler and more robust — new token types default to regex context.
      if (prev && !Lexer.VALUE_TOKEN_TYPES.has(prev.type)) {
        this.scanRegex();
        return;
      }
      // At start of file (no prev token), treat / as regex if followed by a non-space, non-special char
      if (!prev && this.pos + 1 < this.length && !Lexer.REGEX_START_RE.test(this.peek(1))) {
        this.scanRegex();
        return;
      }
    }

    // Numbers
    if (this.isDigit(ch)) {
      this.scanNumber();
      return;
    }

    // Strings
    if (ch === '"') {
      // Triple-quote multiline strings: """..."""
      if (this.peek(1) === '"' && this.peek(2) === '"') {
        this.scanTripleQuoteString();
        return;
      }
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
        let wp = pp;
        while (wp < this.length && this.isAlphaNumeric(this.source[wp])) wp++;
        const word = this.source.substring(pp, wp);
        if (Lexer.JSX_CF_KEYWORDS.has(word)) {
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
      // In JSX children, set tag mode directly (heuristic may fail after STRING tokens)
      const nextCh = this.peek(1);
      if (nextCh === '/') {
        this._jsxTagMode = 'close';
      } else if (nextCh === '>' || this.isAlpha(nextCh)) {
        // <tag or <> (fragment)
        this._jsxTagMode = 'open';
      }
      this.scanOperator();
      return;
    }
    if (ch === '"') { this.scanString(); return; }
    if (ch === "'") { this.scanSimpleString(); return; }

    // Check for JSX control flow keywords: if, for, elif, else, match
    if (this.isAlpha(ch)) {
      let peekPos = this.pos;
      while (peekPos < this.length && this.isAlphaNumeric(this.source[peekPos])) peekPos++;
      const word = this.source.substring(this.pos, peekPos);
      if (Lexer.JSX_CF_KEYWORDS.has(word)) {
        this.scanIdentifier();
        // After keyword, enter control flow mode for normal scanning
        this._jsxCF = { paren: 0, brace: 0, keyword: word };
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
      if (this.isAlpha(ch) && text.length > 0) {
        const lastCh = text[text.length - 1];
        if (lastCh === ' ' || lastCh === '\t' || lastCh === '\n' || lastCh === '\r') {
          let pp = this.pos;
          while (pp < this.length && this.isAlphaNumeric(this.source[pp])) pp++;
          const word = this.source.substring(this.pos, pp);
          if (Lexer.JSX_CF_KEYWORDS.has(word)) break;
        }
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
        while (this.pos < this.length && Lexer.HEX_DIGIT_RE.test(this.peek())) {
          const ch = this.advance();
          if (ch !== '_') value += ch;
        }
        if (!value) this.error('Expected hex digits after 0x');
        this.tokens.push(new Token(TokenType.NUMBER, parseInt(value, 16), startLine, startCol));
        return;
      }
      if (next === 'b' || next === 'B') {
        this.advance(); // 0
        this.advance(); // b
        while (this.pos < this.length && Lexer.BINARY_DIGIT_RE.test(this.peek())) {
          const ch = this.advance();
          if (ch !== '_') value += ch;
        }
        if (!value) this.error('Expected binary digits after 0b');
        this.tokens.push(new Token(TokenType.NUMBER, parseInt(value, 2), startLine, startCol));
        return;
      }
      if (next === 'o' || next === 'O') {
        this.advance(); // 0
        this.advance(); // o
        while (this.pos < this.length && Lexer.OCTAL_DIGIT_RE.test(this.peek())) {
          const ch = this.advance();
          if (ch !== '_') value += ch;
        }
        if (!value) this.error('Expected octal digits after 0o');
        this.tokens.push(new Token(TokenType.NUMBER, parseInt(value, 8), startLine, startCol));
        return;
      }
    }

    // Fast path: scan decimal number using index advancement (no string concat)
    // Handles digits, underscores, decimal point, and exponent
    const numStart = this.pos;
    let hasUnderscore = false;
    while (this.pos < this.length) {
      const ch = this.source[this.pos];
      if (ch >= '0' && ch <= '9') { this.pos++; this.column++; }
      else if (ch === '_') { hasUnderscore = true; this.pos++; this.column++; }
      else break;
    }

    // Decimal point — only consume if followed by a digit or underscore (not e.g. 15.minutes)
    if (this.pos < this.length && this.source[this.pos] === '.') {
      const next = this.pos + 1 < this.length ? this.source[this.pos + 1] : '';
      if (next !== '.' && ((next >= '0' && next <= '9') || next === '_')) {
        this.pos++; this.column++; // .
        while (this.pos < this.length) {
          const ch = this.source[this.pos];
          if (ch >= '0' && ch <= '9') { this.pos++; this.column++; }
          else if (ch === '_') { hasUnderscore = true; this.pos++; this.column++; }
          else break;
        }
      }
    }

    // Exponent
    if (this.pos < this.length) {
      const ech = this.source[this.pos];
      if (ech === 'e' || ech === 'E') {
        const savedPos = this.pos;
        const savedCol = this.column;
        this.pos++; this.column++;
        if (this.pos < this.length && (this.source[this.pos] === '+' || this.source[this.pos] === '-')) {
          this.pos++; this.column++;
        }
        if (this.pos < this.length && this.source[this.pos] >= '0' && this.source[this.pos] <= '9') {
          while (this.pos < this.length && this.source[this.pos] >= '0' && this.source[this.pos] <= '9') {
            this.pos++; this.column++;
          }
        } else {
          // No digits after exponent — backtrack
          this.pos = savedPos;
          this.column = savedCol;
        }
      }
    }

    let numStr = this.source.substring(numStart, this.pos);
    if (hasUnderscore) numStr = numStr.replace(/_/g, '');
    value = numStr;
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
        if (this.pos >= this.length) {
          this.error('Unterminated string');
        }
        current += this._processEscape(this.advance());
        continue;
      }

      // String interpolation: {expr}
      if (this.peek() === '{') {
        this.advance(); // {
        if (current.length > 0) {
          parts.push({ type: 'text', value: current });
          current = '';
        }

        // Lex the interpolation expression, respecting nested strings
        const exprStartLine = this.line - 1; // 0-based offset for sub-lexer
        const exprStartCol = this.column - 1;
        let depth = 1;
        // Use array-based building to avoid O(n^2) string concatenation
        const exprParts = [];
        while (this.pos < this.length && depth > 0) {
          const ch = this.peek();
          // Skip over string literals so braces inside them don't affect depth
          if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            exprParts.push(this.advance()); // opening quote
            let strDepth = 0; // track interpolation depth inside nested strings
            while (this.pos < this.length) {
              if (this.peek() === '\\') {
                exprParts.push(this.advance()); // backslash
                if (this.pos < this.length) exprParts.push(this.advance()); // escaped char
              } else if (quote === '"' && this.peek() === '{') {
                strDepth++;
                exprParts.push(this.advance());
              } else if (quote === '"' && this.peek() === '}' && strDepth > 0) {
                strDepth--;
                exprParts.push(this.advance());
              } else if (this.peek() === quote && strDepth === 0) {
                break;
              } else {
                exprParts.push(this.advance());
              }
            }
            if (this.pos < this.length) exprParts.push(this.advance()); // closing quote
            continue;
          }
          if (ch === '{') depth++;
          if (ch === '}') {
            depth--;
            if (depth === 0) break;
          }
          exprParts.push(this.advance());
        }
        const exprSource = exprParts.join('');

        if (this.peek() !== '}') {
          this.error('Unterminated string interpolation');
        }
        this.advance(); // }

        // Sub-lex the expression with correct file position offsets
        if (this._depth + 1 > Lexer.MAX_INTERPOLATION_DEPTH) {
          this.error('String interpolation nested too deeply (max ' + Lexer.MAX_INTERPOLATION_DEPTH + ' levels)');
        }
        if (!this._subLexer) {
          this._subLexer = new Lexer(exprSource, this.filename, exprStartLine, exprStartCol, this._depth + 1);
        } else {
          this._subLexer.reset(exprSource, exprStartLine, exprStartCol);
        }
        const exprTokens = this._subLexer.tokenize();
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

  scanTripleQuoteString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // first "
    this.advance(); // second "
    this.advance(); // third "

    // Skip a leading newline immediately after opening """
    if (this.pos < this.length && this.peek() === '\n') {
      this.advance();
    } else if (this.pos < this.length && this.peek() === '\r' && this.peek(1) === '\n') {
      this.advance();
      this.advance();
    }

    const parts = [];
    let current = '';

    while (this.pos < this.length) {
      // Check for closing """
      if (this.peek() === '"' && this.peek(1) === '"' && this.peek(2) === '"') {
        break;
      }

      // Escape sequences (same as regular strings)
      if (this.peek() === '\\') {
        this.advance();
        if (this.pos >= this.length) {
          this.error('Unterminated multiline string');
        }
        current += this._processEscape(this.advance());
        continue;
      }

      // String interpolation: {expr}
      if (this.peek() === '{') {
        this.advance(); // {
        if (current.length > 0) {
          parts.push({ type: 'text', value: current });
          current = '';
        }

        const exprStartLine = this.line - 1;
        const exprStartCol = this.column - 1;
        let depth = 1;
        const exprParts = [];
        while (this.pos < this.length && depth > 0) {
          const ch = this.peek();
          if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            exprParts.push(this.advance());
            let strDepth = 0;
            while (this.pos < this.length) {
              if (this.peek() === '\\') {
                exprParts.push(this.advance());
                if (this.pos < this.length) exprParts.push(this.advance());
              } else if (quote === '"' && this.peek() === '{') {
                strDepth++;
                exprParts.push(this.advance());
              } else if (quote === '"' && this.peek() === '}' && strDepth > 0) {
                strDepth--;
                exprParts.push(this.advance());
              } else if (this.peek() === quote && strDepth === 0) {
                break;
              } else {
                exprParts.push(this.advance());
              }
            }
            if (this.pos < this.length) exprParts.push(this.advance());
            continue;
          }
          if (ch === '{') depth++;
          if (ch === '}') {
            depth--;
            if (depth === 0) break;
          }
          exprParts.push(this.advance());
        }
        const exprSource = exprParts.join('');

        if (this.peek() !== '}') {
          this.error('Unterminated string interpolation in multiline string');
        }
        this.advance(); // }

        if (this._depth + 1 > Lexer.MAX_INTERPOLATION_DEPTH) {
          this.error('String interpolation nested too deeply (max ' + Lexer.MAX_INTERPOLATION_DEPTH + ' levels)');
        }
        if (!this._subLexer) {
          this._subLexer = new Lexer(exprSource, this.filename, exprStartLine, exprStartCol, this._depth + 1);
        } else {
          this._subLexer.reset(exprSource, exprStartLine, exprStartCol);
        }
        const exprTokens = this._subLexer.tokenize();
        exprTokens.pop();

        parts.push({ type: 'expr', tokens: exprTokens, source: exprSource });
        continue;
      }

      current += this.advance();
    }

    if (this.pos >= this.length || this.peek() !== '"') {
      this.error('Unterminated multiline string (expected closing \"\"\")')
    }
    this.advance(); // first closing "
    this.advance(); // second closing "
    this.advance(); // third closing "

    // Auto-dedent: find the indentation of the closing """ line
    // Look back in `current` for the last newline to get the indentation
    let rawContent = current;
    if (parts.length === 0) {
      // Simple string, no interpolation — auto-dedent
      const dedented = this._dedentTripleQuote(rawContent);
      this.tokens.push(new Token(TokenType.STRING, dedented, startLine, startCol));
    } else {
      // Template string — dedent text parts
      if (current.length > 0) {
        parts.push({ type: 'text', value: current });
      }
      const dedentedParts = this._dedentTripleQuoteParts(parts);
      if (dedentedParts.length === 1 && dedentedParts[0].type === 'text') {
        this.tokens.push(new Token(TokenType.STRING, dedentedParts[0].value, startLine, startCol));
      } else {
        this.tokens.push(new Token(TokenType.STRING_TEMPLATE, dedentedParts, startLine, startCol));
      }
    }
  }

  _dedentTripleQuote(text) {
    // Remove trailing whitespace-only line (the line before closing """)
    if (text.endsWith('\n')) {
      text = text.slice(0, -1);
    } else {
      // Check for trailing whitespace-only content after last newline
      const lastNl = text.lastIndexOf('\n');
      if (lastNl !== -1) {
        const lastLine = text.slice(lastNl + 1);
        if (lastLine.trim() === '') {
          text = text.slice(0, lastNl);
        }
      }
    }

    const lines = text.split('\n');
    // Find minimum indentation of non-empty lines
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const indent = line.match(/^[ \t]*/)[0].length;
      if (indent < minIndent) minIndent = indent;
    }
    if (minIndent === Infinity) minIndent = 0;

    // Strip the common indentation
    return lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.slice(minIndent);
    }).join('\n');
  }

  _dedentTripleQuoteParts(parts) {
    // Collect all text to determine minimum indent
    let allText = '';
    for (const p of parts) {
      if (p.type === 'text') allText += p.value;
      else allText += 'X'; // placeholder for expressions
    }

    // Remove trailing whitespace-only line
    if (allText.endsWith('\n')) {
      // Trim trailing newline from last text part
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].type === 'text' && parts[i].value.endsWith('\n')) {
          parts[i] = { type: 'text', value: parts[i].value.slice(0, -1) };
          break;
        }
      }
    }

    // Find minimum indentation from text parts
    let minIndent = Infinity;
    for (const p of parts) {
      if (p.type !== 'text') continue;
      const lines = p.value.split('\n');
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        const indent = line.match(/^[ \t]*/)[0].length;
        if (indent < minIndent) minIndent = indent;
      }
    }
    if (minIndent === Infinity || minIndent === 0) return parts;

    // Dedent text parts
    return parts.map(p => {
      if (p.type !== 'text') return p;
      const lines = p.value.split('\n');
      const dedented = lines.map(line => {
        if (line.trim().length === 0) return '';
        return line.slice(Math.min(minIndent, line.match(/^[ \t]*/)[0].length));
      }).join('\n');
      return { type: 'text', value: dedented };
    });
  }

  scanSimpleString() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // opening '

    let value = '';
    while (this.pos < this.length && this.peek() !== "'") {
      if (this.peek() === '\\') {
        this.advance();
        if (this.pos >= this.length) {
          this.error('Unterminated string');
        }
        value += this._processEscape(this.advance());
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

  scanRegex() {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // opening /

    let pattern = '';
    let escaped = false;
    let inCharClass = false;

    while (this.pos < this.length) {
      const ch = this.peek();
      if (ch === '\n') {
        this.error('Unterminated regex literal');
      }
      if (escaped) {
        pattern += ch;
        this.advance();
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        pattern += ch;
        this.advance();
        escaped = true;
        continue;
      }
      if (ch === '[') inCharClass = true;
      if (ch === ']') inCharClass = false;
      if (ch === '/' && !inCharClass) break;
      pattern += this.advance();
    }

    if (this.pos >= this.length || this.peek() !== '/') {
      this.error('Unterminated regex literal');
    }
    this.advance(); // closing /

    // Read flags
    let flags = '';
    while (this.pos < this.length && Lexer.REGEX_FLAG_RE.test(this.peek())) {
      flags += this.advance();
    }

    this.tokens.push(new Token(TokenType.REGEX, { pattern, flags }, startLine, startCol));
  }

  scanIdentifier() {
    const startLine = this.line;
    const startCol = this.column;
    const startPos = this.pos;

    // Fast path: scan ASCII identifier using index advancement (no string concat)
    while (this.pos < this.length) {
      const ch = this.source[this.pos];
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || (ch >= '0' && ch <= '9')) {
        this.pos++;
        this.column++;
      } else if (ch > '\x7f' && Lexer.UNICODE_ALPHANUM_RE.test(ch)) {
        this.pos++;
        this.column++;
      } else {
        break;
      }
    }
    const value = this.source.substring(startPos, this.pos);

    // Raw string: r"no\escapes"
    if (value === 'r' && this.pos < this.length && this.peek() === '"') {
      this.advance(); // opening "
      const rawParts = [];
      while (this.pos < this.length && this.peek() !== '"') {
        rawParts.push(this.advance());
      }
      const raw = rawParts.join('');
      if (this.pos >= this.length) {
        this.error('Unterminated raw string');
      }
      this.advance(); // closing "
      this.tokens.push(new Token(TokenType.STRING, raw, startLine, startCol));
      return;
    }

    // f-string: f"Hello, {name}!" — explicit interpolation sigil
    // Delegates to scanString() which already handles interpolation
    if (value === 'f' && this.pos < this.length && this.peek() === '"') {
      this.scanString();
      return;
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
        if (depth > 0) {
          this.error('Unterminated style block');
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
        if (this._jsxCF) this._jsxCF.paren++;
        break;
      case ')':
        this.tokens.push(new Token(TokenType.RPAREN, ')', startLine, startCol));
        if (this._jsxCF && this._jsxCF.paren > 0) this._jsxCF.paren--;
        break;
      case '{':
        this.tokens.push(new Token(TokenType.LBRACE, '{', startLine, startCol));
        if (this._jsxCF) {
          if (this._jsxCF.brace > 0) {
            // Nested brace inside expression (e.g., key={obj.field})
            this._jsxCF.brace++;
          } else if (this._jsxCF.paren > 0) {
            // Inside parens, this is an expression brace
            this._jsxCF.brace++;
          } else {
            // Check if prev token is ASSIGN (key={...}) or FOR (destructuring: for {a,b} in ...)
            const prev = this.tokens.length > 1 ? this.tokens[this.tokens.length - 2] : null;
            if (prev && (prev.type === TokenType.ASSIGN || prev.type === TokenType.FOR)) {
              this._jsxCF.brace++;
            } else if (this._jsxCF.keyword === 'match') {
              // Match body: scan normally (patterns, =>, etc.) — not JSX children mode
              this._jsxCF = null;
              this._jsxStack.push('matchblock');
              this._matchBlockDepth = 1;
            } else {
              // This is the block opener for the control flow body
              this._jsxCF = null;
              this._jsxStack.push('cfblock');
            }
          }
        } else if (this._jsxExprDepth > 0) {
          this._jsxExprDepth++;
        } else if (this._matchBlockDepth > 0) {
          this._matchBlockDepth++;
        }
        break;
      case '}':
        this.tokens.push(new Token(TokenType.RBRACE, '}', startLine, startCol));
        if (this._jsxCF && this._jsxCF.brace > 0) {
          this._jsxCF.brace--;
        } else if (this._matchBlockDepth > 0) {
          this._matchBlockDepth--;
          if (this._matchBlockDepth === 0) {
            // Match body closed — pop matchblock from JSX stack
            if (this._jsxStack.length > 0 && this._jsxStack[this._jsxStack.length - 1] === 'matchblock') {
              this._jsxStack.pop();
            }
          }
        } else if (this._jsxExprDepth > 0) {
          this._jsxExprDepth--;
        }
        break;
      case '[':
        this.tokens.push(new Token(TokenType.LBRACKET, '[', startLine, startCol));
        if (this._jsxCF) this._jsxCF.paren++;
        break;
      case ']':
        this.tokens.push(new Token(TokenType.RBRACKET, ']', startLine, startCol));
        if (this._jsxCF && this._jsxCF.paren > 0) this._jsxCF.paren--;
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
          if (this._jsxTagMode === 'open') this._jsxSelfClosing = true;
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
          // Don't override tag mode already set by _scanInJSXChildren
          if (!this._jsxTagMode) {
            if (this.peek() === '/') {
              this._jsxTagMode = 'close';
            } else if (this.peek() === '>') {
              // Fragment: <> — use same heuristic as _isJSXStart
              // to avoid false positives in expressions
              if (this._jsxStack.length > 0) {
                this._jsxTagMode = 'open';
              } else {
                const prev = this.tokens.length > 1 ? this.tokens[this.tokens.length - 2] : null;
                if (!prev || !Lexer.VALUE_TOKEN_TYPES.has(prev.type)) {
                  this._jsxTagMode = 'open';
                }
              }
            } else if (this._isJSXStart()) {
              this._jsxTagMode = 'open';
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
            this._jsxTagMode = null;
            this._jsxSelfClosing = false;
          } else if (this._jsxTagMode === 'close') {
            // Closing tag: </div> or </> — pop 'tag' from stack
            this._jsxTagMode = null;
            if (this._jsxStack.length > 0) this._jsxStack.pop();
          } else if (this._jsxTagMode === 'open') {
            // Opening tag: <div> or <> — push 'tag' to stack (entering children mode)
            this._jsxTagMode = null;
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
          this.tokens.push(new Token(TokenType.BAR, '|', startLine, startCol));
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

      case '@':
        this.tokens.push(new Token(TokenType.AT, '@', startLine, startCol));
        break;

      default:
        this.error(`Unexpected character: '${ch}'`);
    }
  }
}

// Initialize static Set after class definition (depends on TokenType)
Lexer.VALUE_TOKEN_TYPES = new Set([
  TokenType.IDENTIFIER, TokenType.NUMBER, TokenType.STRING,
  TokenType.STRING_TEMPLATE, TokenType.RPAREN, TokenType.RBRACKET, TokenType.RBRACE,
  TokenType.TRUE, TokenType.FALSE, TokenType.NIL
]);
