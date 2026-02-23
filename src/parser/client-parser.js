// Client-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when client { } blocks are encountered.

import { TokenType, Keywords } from '../lexer/tokens.js';
import * as AST from './ast.js';

export function installClientParser(ParserClass) {
  if (ParserClass.prototype._clientParserInstalled) return;
  ParserClass.prototype._clientParserInstalled = true;

  ParserClass.prototype.parseClientBlock = function() {
    const l = this.loc();
    this.expect(TokenType.CLIENT);
    // Optional block name: client "admin" { }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after 'client'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseClientStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close client block");
    return new AST.ClientBlock(body, l, name);
  };

  ParserClass.prototype.parseClientStatement = function() {
    if (this.check(TokenType.STATE)) return this.parseState();
    if (this.check(TokenType.COMPUTED)) return this.parseComputed();
    if (this.check(TokenType.EFFECT)) return this.parseEffect();
    if (this.check(TokenType.COMPONENT)) return this.parseComponent();
    if (this.check(TokenType.STORE)) return this.parseStore();
    return this.parseStatement();
  };

  ParserClass.prototype.parseStore = function() {
    const l = this.loc();
    this.expect(TokenType.STORE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected store name").value;
    this.expect(TokenType.LBRACE, "Expected '{' after store name");

    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.STATE)) {
        body.push(this.parseState());
      } else if (this.check(TokenType.COMPUTED)) {
        body.push(this.parseComputed());
      } else if (this.check(TokenType.FN) && (this.peek(1).type === TokenType.IDENTIFIER || this._isContextualKeywordToken(this.peek(1)))) {
        body.push(this.parseFunctionDeclaration());
      } else {
        this.error("Expected 'state', 'computed', or 'fn' inside store block");
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close store block");

    return new AST.StoreDeclaration(name, body, l);
  };

  ParserClass.prototype.parseState = function() {
    const l = this.loc();
    this.expect(TokenType.STATE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected state variable name").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.expect(TokenType.ASSIGN, "Expected '=' in state declaration");
    const value = this.parseExpression();

    return new AST.StateDeclaration(name, typeAnnotation, value, l);
  };

  ParserClass.prototype.parseComputed = function() {
    const l = this.loc();
    this.expect(TokenType.COMPUTED);
    const name = this.expect(TokenType.IDENTIFIER, "Expected computed variable name").value;
    this.expect(TokenType.ASSIGN, "Expected '=' in computed declaration");
    const expr = this.parseExpression();

    return new AST.ComputedDeclaration(name, expr, l);
  };

  ParserClass.prototype.parseEffect = function() {
    const l = this.loc();
    this.expect(TokenType.EFFECT);
    const body = this.parseBlock();
    return new AST.EffectDeclaration(body, l);
  };

  ParserClass.prototype.parseComponent = function() {
    const l = this.loc();
    this.expect(TokenType.COMPONENT);
    const name = this.expect(TokenType.IDENTIFIER, "Expected component name").value;

    let params = [];
    if (this.match(TokenType.LPAREN)) {
      params = this.parseParameterList();
      this.expect(TokenType.RPAREN, "Expected ')' after component parameters");
    }

    this.expect(TokenType.LBRACE, "Expected '{' to open component body");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.STYLE_BLOCK)) {
        const sl = this.loc();
        const css = this.current().value;
        this.advance();
        body.push(new AST.ComponentStyleBlock(css, sl));
      } else if (this.check(TokenType.LESS) && this._looksLikeJSX()) {
        body.push(this.parseJSXElementOrFragment());
      } else if (this.check(TokenType.STATE)) {
        body.push(this.parseState());
      } else if (this.check(TokenType.COMPUTED)) {
        body.push(this.parseComputed());
      } else if (this.check(TokenType.EFFECT)) {
        body.push(this.parseEffect());
      } else if (this.check(TokenType.COMPONENT)) {
        body.push(this.parseComponent());
      } else {
        body.push(this.parseStatement());
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close component body");

    return new AST.ComponentDeclaration(name, params, body, l);
  };

  // ─── JSX-like parsing ─────────────────────────────────────

  ParserClass.prototype._collapseJSXWhitespace = function(text) {
    let result = text.replace(/\s+/g, ' ');
    if (result.trim() === '') return '';
    return result.trim();
  };

  ParserClass.prototype.parseJSXElementOrFragment = function() {
    // Check if this is a fragment: <>...</>
    if (this.check(TokenType.LESS) && this.peek(1).type === TokenType.GREATER) {
      return this.parseJSXFragment();
    }
    return this.parseJSXElement();
  };

  ParserClass.prototype.parseJSXFragment = function() {
    const l = this.loc();
    this.expect(TokenType.LESS, "Expected '<'");
    this.expect(TokenType.GREATER, "Expected '>' in fragment opening");

    // Parse children until </>
    const children = this.parseJSXFragmentChildren();

    return new AST.JSXFragment(children, l);
  };

  ParserClass.prototype.parseJSXFragmentChildren = function() {
    const children = [];

    while (!this.isAtEnd()) {
      // Closing fragment: </>
      if (this.check(TokenType.LESS) && this.peek(1).type === TokenType.SLASH) {
        // Check for </> (fragment close) vs </tag> (error)
        if (this.peek(2).type === TokenType.GREATER) {
          this.advance(); // <
          this.advance(); // /
          this.advance(); // >
          break;
        } else {
          this.error("Unexpected closing tag inside fragment. Use </> to close a fragment");
        }
      }

      // Nested element or fragment
      if (this.check(TokenType.LESS)) {
        if (this.peek(1).type === TokenType.GREATER) {
          children.push(this.parseJSXFragment());
        } else {
          children.push(this.parseJSXElement());
        }
        continue;
      }

      // String literal as text
      if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        const str = this.parseStringLiteral();
        children.push(new AST.JSXText(str, this.loc()));
        continue;
      }

      // Unquoted JSX text
      if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          children.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
        continue;
      }

      // Expression in braces: {expr}
      if (this.check(TokenType.LBRACE)) {
        this.advance();
        const expr = this.parseExpression();
        this.expect(TokenType.RBRACE, "Expected '}' after JSX expression");
        children.push(new AST.JSXExpression(expr, this.loc()));
        continue;
      }

      // for loop inside JSX
      if (this.check(TokenType.FOR)) {
        children.push(this.parseJSXFor());
        continue;
      }

      // if inside JSX
      if (this.check(TokenType.IF)) {
        children.push(this.parseJSXIf());
        continue;
      }

      // match inside JSX
      if (this.check(TokenType.MATCH)) {
        children.push(this.parseJSXMatch());
        continue;
      }

      break;
    }

    return children;
  };

  ParserClass.prototype.parseJSXElement = function() {
    const l = this.loc();
    this.expect(TokenType.LESS, "Expected '<'");

    const tag = this.expect(TokenType.IDENTIFIER, "Expected tag name").value;

    // Parse attributes (including spread: {...expr})
    const attributes = [];
    while (!this.check(TokenType.GREATER) && !this.check(TokenType.SLASH) && !this.isAtEnd()) {
      // Check for spread attribute: {...expr}
      if (this.check(TokenType.LBRACE) && this.peek(1).type === TokenType.SPREAD) {
        const sl = this.loc();
        this.advance(); // {
        this.advance(); // ...
        const expr = this.parseExpression();
        this.expect(TokenType.RBRACE, "Expected '}' after spread expression");
        attributes.push(new AST.JSXSpreadAttribute(expr, sl));
      } else {
        attributes.push(this.parseJSXAttribute());
      }
    }

    // Self-closing tag: />
    if (this.match(TokenType.SLASH)) {
      this.expect(TokenType.GREATER, "Expected '>' in self-closing tag");
      return new AST.JSXElement(tag, attributes, [], true, l);
    }

    this.expect(TokenType.GREATER, "Expected '>'");

    // Parse children
    const children = this.parseJSXChildren(tag);

    return new AST.JSXElement(tag, attributes, children, false, l);
  };

  ParserClass.prototype.parseJSXAttribute = function() {
    const l = this.loc();
    // Accept keywords as attribute names (type, class, for, async, defer, etc. are valid HTML attributes)
    let name;
    if (this.check(TokenType.IDENTIFIER) || (this.peek().value in Keywords)) {
      name = this.advance().value;
    } else {
      this.error("Expected attribute name");
    }

    // Handle namespaced attributes: on:click, bind:value, class:active
    if (this.match(TokenType.COLON)) {
      let suffix;
      if (this.check(TokenType.IDENTIFIER) || (this.peek().value in Keywords)) {
        suffix = this.advance().value;
      } else {
        suffix = this.expect(TokenType.IDENTIFIER, "Expected name after ':'").value;
      }
      name = `${name}:${suffix}`;
      // Consume event modifiers: on:click.stop.prevent
      if (name.startsWith('on:') && this.check(TokenType.DOT)) {
        while (this.match(TokenType.DOT)) {
          const mod = this.expect(TokenType.IDENTIFIER, "Expected modifier name after '.'").value;
          name += `.${mod}`;
        }
      }
    }

    if (!this.match(TokenType.ASSIGN)) {
      // Boolean attribute: <input disabled />
      return new AST.JSXAttribute(name, new AST.BooleanLiteral(true, l), l);
    }

    // Value can be {expression} or "string"
    if (this.match(TokenType.LBRACE)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RBRACE, "Expected '}' after attribute expression");
      return new AST.JSXAttribute(name, expr, l);
    }

    if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
      const val = this.parseStringLiteral();
      return new AST.JSXAttribute(name, val, l);
    }

    this.error("Expected attribute value");
  };

  ParserClass.prototype.parseJSXChildren = function(parentTag) {
    const children = [];

    while (!this.isAtEnd()) {
      // Closing tag: </tag>
      if (this.check(TokenType.LESS) && this.peek(1).type === TokenType.SLASH) {
        this.advance(); // <
        this.advance(); // /
        const closeTag = this.expect(TokenType.IDENTIFIER, "Expected closing tag name").value;
        if (closeTag !== parentTag) {
          this.error(`Mismatched closing tag: expected </${parentTag}>, got </${closeTag}>`);
        }
        this.expect(TokenType.GREATER, "Expected '>' in closing tag");
        break;
      }

      // Nested element or fragment
      if (this.check(TokenType.LESS)) {
        children.push(this.parseJSXElementOrFragment());
        continue;
      }

      // String literal as text
      if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        const str = this.parseStringLiteral();
        children.push(new AST.JSXText(str, this.loc()));
        continue;
      }

      // Unquoted JSX text
      if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          children.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
        continue;
      }

      // Expression in braces: {expr}
      if (this.check(TokenType.LBRACE)) {
        this.advance();
        const expr = this.parseExpression();
        this.expect(TokenType.RBRACE, "Expected '}' after JSX expression");
        children.push(new AST.JSXExpression(expr, this.loc()));
        continue;
      }

      // for loop inside JSX
      if (this.check(TokenType.FOR)) {
        children.push(this.parseJSXFor());
        continue;
      }

      // if inside JSX
      if (this.check(TokenType.IF)) {
        children.push(this.parseJSXIf());
        continue;
      }

      // match inside JSX
      if (this.check(TokenType.MATCH)) {
        children.push(this.parseJSXMatch());
        continue;
      }

      break;
    }

    return children;
  };

  ParserClass.prototype.parseJSXFor = function() {
    const l = this.loc();
    this.expect(TokenType.FOR);

    // Support destructuring: for [i, item] in ..., for {name, age} in ...
    let variable;
    if (this.check(TokenType.LBRACKET)) {
      // Array destructuring: [a, b]
      this.advance(); // consume [
      const elements = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in array pattern").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET, "Expected ']' in destructuring pattern");
      variable = `[${elements.join(', ')}]`;
    } else if (this.check(TokenType.LBRACE)) {
      // Object destructuring: {name, age}
      this.advance(); // consume {
      const props = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        props.push(this.expect(TokenType.IDENTIFIER, "Expected property name in object pattern").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in destructuring pattern");
      variable = `{${props.join(', ')}}`;
    } else {
      variable = this.expect(TokenType.IDENTIFIER, "Expected loop variable").value;
    }

    this.expect(TokenType.IN, "Expected 'in' in for loop");
    const iterable = this.parseExpression();

    // Optional key expression: for item in items key={item.id} { ... }
    let keyExpr = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'key') {
      this.advance(); // consume 'key'
      this.expect(TokenType.ASSIGN, "Expected '=' after 'key'");
      this.expect(TokenType.LBRACE, "Expected '{' after 'key='");
      keyExpr = this.parseExpression();
      this.expect(TokenType.RBRACE, "Expected '}' after key expression");
    }

    this.expect(TokenType.LBRACE, "Expected '{' in JSX for body");

    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.LESS)) {
        body.push(this.parseJSXElementOrFragment());
      } else if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        body.push(new AST.JSXText(this.parseStringLiteral(), this.loc()));
      } else if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          body.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
      } else if (this.check(TokenType.LBRACE)) {
        this.advance();
        body.push(new AST.JSXExpression(this.parseExpression(), this.loc()));
        this.expect(TokenType.RBRACE);
      } else if (this.check(TokenType.FOR)) {
        body.push(this.parseJSXFor());
      } else if (this.check(TokenType.IF)) {
        body.push(this.parseJSXIf());
      } else if (this.check(TokenType.MATCH)) {
        body.push(this.parseJSXMatch());
      } else {
        break;
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close JSX for body");

    return new AST.JSXFor(variable, iterable, body, l, keyExpr);
  };

  ParserClass.prototype._parseJSXIfBody = function() {
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.LESS)) {
        body.push(this.parseJSXElementOrFragment());
      } else if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        body.push(new AST.JSXText(this.parseStringLiteral(), this.loc()));
      } else if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          body.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
      } else if (this.check(TokenType.LBRACE)) {
        this.advance();
        body.push(new AST.JSXExpression(this.parseExpression(), this.loc()));
        this.expect(TokenType.RBRACE);
      } else if (this.check(TokenType.FOR)) {
        body.push(this.parseJSXFor());
      } else if (this.check(TokenType.IF)) {
        body.push(this.parseJSXIf());
      } else if (this.check(TokenType.MATCH)) {
        body.push(this.parseJSXMatch());
      } else {
        break;
      }
    }
    return body;
  };

  ParserClass.prototype.parseJSXIf = function() {
    const l = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    this.expect(TokenType.LBRACE, "Expected '{' in JSX if body");
    const consequent = this._parseJSXIfBody();
    this.expect(TokenType.RBRACE, "Expected '}' to close JSX if body");

    // Parse elif chains
    const alternates = [];
    while (this.check(TokenType.ELIF)) {
      this.advance(); // consume 'elif'
      const elifCond = this.parseExpression();
      this.expect(TokenType.LBRACE, "Expected '{' in JSX elif body");
      const elifBody = this._parseJSXIfBody();
      this.expect(TokenType.RBRACE, "Expected '}' to close JSX elif body");
      alternates.push({ condition: elifCond, body: elifBody });
    }

    // Parse optional else
    let alternate = null;
    if (this.check(TokenType.ELSE)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      alternate = this._parseJSXIfBody();
      this.expect(TokenType.RBRACE);
    }

    return new AST.JSXIf(condition, consequent, alternate, l, alternates);
  };

  ParserClass.prototype.parseJSXMatch = function() {
    const l = this.loc();
    this.expect(TokenType.MATCH);
    const subject = this.parseExpression();
    this.expect(TokenType.LBRACE, "Expected '{' to open JSX match body");

    const arms = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const al = this.loc();
      const pattern = this.parsePattern();

      let guard = null;
      if (this.match(TokenType.IF)) {
        guard = this.parseExpression();
      }

      this.expect(TokenType.ARROW, "Expected '=>' in JSX match arm");

      // Parse arm body as JSX children
      const body = [];
      if (this.check(TokenType.LESS)) {
        body.push(this.parseJSXElementOrFragment());
      } else if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        body.push(new AST.JSXText(this.parseStringLiteral(), this.loc()));
      } else if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          body.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
      } else if (this.check(TokenType.LBRACE)) {
        this.advance();
        body.push(new AST.JSXExpression(this.parseExpression(), this.loc()));
        this.expect(TokenType.RBRACE);
      } else if (this.check(TokenType.FOR)) {
        body.push(this.parseJSXFor());
      } else if (this.check(TokenType.IF)) {
        body.push(this.parseJSXIf());
      } else {
        // Fallback to regular expression (e.g., null, number literals)
        body.push(new AST.JSXExpression(this.parseExpression(), this.loc()));
      }

      arms.push({ pattern, guard, body, loc: al });
      this.match(TokenType.COMMA); // Optional comma between arms
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close JSX match body");
    return new AST.JSXMatch(subject, arms, l);
  };
}
