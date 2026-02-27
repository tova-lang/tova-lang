// Form-specific parser methods for the Tova language
// Extracted for lazy loading — only loaded when form { } blocks are encountered.

import {
  FormDeclaration, FormFieldDeclaration, FormGroupDeclaration,
  FormArrayDeclaration, FormValidator, FormStepsDeclaration, FormStep,
} from './form-ast.js';
import { TokenType } from '../lexer/tokens.js';

export function installFormParser(ParserClass) {
  if (ParserClass.prototype._formParserInstalled) return;
  ParserClass.prototype._formParserInstalled = true;

  ParserClass.prototype.parseFormDeclaration = function() {
    const l = this.loc();
    this.expect(TokenType.FORM);
    const name = this.expect(TokenType.IDENTIFIER, "Expected form name").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.expect(TokenType.LBRACE, "Expected '{' after form name");

    const fields = [];
    const groups = [];
    const arrays = [];
    const computeds = [];
    let steps = null;
    let onSubmit = null;

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FIELD)) {
        fields.push(this.parseFormField());
      } else if (this.check(TokenType.GROUP)) {
        groups.push(this.parseFormGroup());
      } else if (this._checkFormContextual('array')) {
        arrays.push(this.parseFormArray());
      } else if (this.check(TokenType.COMPUTED)) {
        computeds.push(this.parseComputed());
      } else if (this.check(TokenType.STEPS)) {
        steps = this.parseFormSteps();
      } else if (this._checkFormContextual('on') && this._peekFormContextual(1, 'submit')) {
        onSubmit = this.parseFormOnSubmit();
      } else {
        this.error("Expected 'field', 'group', 'array', 'computed', 'steps', or 'on submit' inside form block");
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close form block");
    return new FormDeclaration(name, typeAnnotation, fields, groups, arrays, computeds, steps, onSubmit, l);
  };

  ParserClass.prototype.parseFormField = function() {
    const l = this.loc();
    this.expect(TokenType.FIELD);
    const name = this.expect(TokenType.IDENTIFIER, "Expected field name").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    let initialValue = null;
    if (this.match(TokenType.ASSIGN)) {
      initialValue = this.parseExpression();
    }

    const validators = [];
    if (this.check(TokenType.LBRACE)) {
      this.advance(); // consume {
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        validators.push(this.parseFormValidator());
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close validator block");
    }

    return new FormFieldDeclaration(name, typeAnnotation, initialValue, validators, l);
  };

  ParserClass.prototype.parseFormValidator = function() {
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
  };

  ParserClass.prototype.parseFormGroup = function() {
    const l = this.loc();
    this.expect(TokenType.GROUP);
    const name = this.expect(TokenType.IDENTIFIER, "Expected group name").value;

    let condition = null;
    if (this.check(TokenType.WHEN)) {
      this.advance(); // consume 'when'
      condition = this.parseExpression();
    }

    this.expect(TokenType.LBRACE, "Expected '{' after group name");

    const fields = [];
    const groups = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FIELD)) {
        fields.push(this.parseFormField());
      } else if (this.check(TokenType.GROUP)) {
        groups.push(this.parseFormGroup());
      } else {
        this.error("Expected 'field' or 'group' inside form group");
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close group block");
    return new FormGroupDeclaration(name, condition, fields, groups, l);
  };

  ParserClass.prototype.parseFormArray = function() {
    const l = this.loc();
    this.advance(); // consume 'array' (contextual keyword — it's an IDENTIFIER with value "array")
    const name = this.expect(TokenType.IDENTIFIER, "Expected array name").value;

    this.expect(TokenType.LBRACE, "Expected '{' after array name");

    const fields = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.FIELD)) {
        fields.push(this.parseFormField());
      } else {
        this.error("Expected 'field' inside form array");
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close array block");
    return new FormArrayDeclaration(name, fields, [], l);
  };

  ParserClass.prototype.parseFormSteps = function() {
    const l = this.loc();
    this.expect(TokenType.STEPS);
    this.expect(TokenType.LBRACE, "Expected '{' after steps");

    const stepsArr = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      stepsArr.push(this.parseFormStep());
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close steps block");
    return new FormStepsDeclaration(stepsArr, l);
  };

  ParserClass.prototype.parseFormStep = function() {
    const l = this.loc();
    if (!this._checkFormContextual('step')) {
      this.error("Expected 'step' inside steps block");
    }
    this.advance(); // consume 'step'
    const label = this.expect(TokenType.STRING, "Expected step label string").value;
    this.expect(TokenType.LBRACE, "Expected '{' after step label");

    const members = [];
    members.push(this.expect(TokenType.IDENTIFIER, "Expected field/group/array name").value);
    while (this.match(TokenType.COMMA)) {
      members.push(this.expect(TokenType.IDENTIFIER, "Expected field/group/array name").value);
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close step");
    return new FormStep(label, members, l);
  };

  ParserClass.prototype.parseFormOnSubmit = function() {
    this.advance(); // consume 'on'
    this.advance(); // consume 'submit'
    return this.parseBlock();
  };

  // Helper: check if current token is an identifier with a specific value
  if (!ParserClass.prototype._checkFormContextual) {
    ParserClass.prototype._checkFormContextual = function(name) {
      return this.check(TokenType.IDENTIFIER) && this.current().value === name;
    };
  }

  if (!ParserClass.prototype._peekFormContextual) {
    ParserClass.prototype._peekFormContextual = function(offset, name) {
      const token = this.peek(offset);
      return token && token.type === TokenType.IDENTIFIER && token.value === name;
    };
  }
}
