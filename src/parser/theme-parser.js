// Theme-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when theme { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import { ThemeBlock, ThemeSection, ThemeToken } from './theme-ast.js';

export function installThemeParser(ParserClass) {
  if (ParserClass.prototype._themeParserInstalled) return;
  ParserClass.prototype._themeParserInstalled = true;

  ParserClass.prototype.parseThemeBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'theme'
    this.expect(TokenType.LBRACE, "Expected '{' after 'theme'");

    const sections = [];
    const darkOverrides = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const sectionLoc = this.loc();
      const sectionName = this.expect(TokenType.IDENTIFIER, "Expected section name inside theme block").value;
      this.expect(TokenType.LBRACE, `Expected '{' after theme section '${sectionName}'`);

      if (sectionName === 'dark') {
        // dark section: flat overrides with dot-notation names
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          darkOverrides.push(this._parseThemeToken());
        }
      } else {
        // Regular section: parse tokens into a ThemeSection
        const tokens = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          tokens.push(this._parseThemeToken());
        }
        sections.push(new ThemeSection(sectionName, tokens, sectionLoc));
      }

      this.expect(TokenType.RBRACE, `Expected '}' to close theme section '${sectionName}'`);
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close theme block");
    return new ThemeBlock(sections, darkOverrides, l);
  };

  ParserClass.prototype._parseThemeToken = function() {
    const l = this.loc();

    // Read dot-separated name: IDENTIFIER (DOT IDENTIFIER)*
    let name = this.expect(TokenType.IDENTIFIER, "Expected token name").value;
    while (this.check(TokenType.DOT)) {
      this.advance(); // consume DOT
      const part = this.expect(TokenType.IDENTIFIER, "Expected identifier after '.' in token name").value;
      name += '.' + part;
    }

    this.expect(TokenType.COLON, `Expected ':' after token name '${name}'`);

    // Read value: STRING or NUMBER
    let value;
    if (this.check(TokenType.STRING)) {
      value = this.advance().value;
    } else if (this.check(TokenType.NUMBER)) {
      value = this.advance().value;
    } else {
      this.error(`Expected string or number value for token '${name}'`);
    }

    return new ThemeToken(name, value, l);
  };
}
