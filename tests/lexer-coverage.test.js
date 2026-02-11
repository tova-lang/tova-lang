import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

function lex(source) {
  const lexer = new Lexer(source, '<test>');
  return lexer.tokenize();
}

function lexThrows(source) {
  return () => {
    const lexer = new Lexer(source, '<test>');
    lexer.tokenize();
  };
}

// ─── 1. Lexer error method (Line 14) ───────────────────────────

describe('Lexer error method', () => {
  test('unterminated double-quoted string throws with file location', () => {
    expect(lexThrows('"unterminated')).toThrow(/Unterminated string/);
  });

  test('error includes filename, line, and column', () => {
    expect(lexThrows('"unterminated')).toThrow(/<test>:1/);
  });
});

// ─── 2. Unterminated block comment (Line 164) ──────────────────

describe('Unterminated block comment', () => {
  test('throws on unclosed block comment', () => {
    expect(lexThrows('/* unclosed')).toThrow(/Unterminated block comment/);
  });

  test('throws on nested unclosed block comment', () => {
    expect(lexThrows('/* outer /* inner */')).toThrow(/Unterminated block comment/);
  });

  test('properly closed nested block comment succeeds', () => {
    const tokens = lex('/* outer /* inner */ */');
    // Should produce only EOF
    expect(tokens[tokens.length - 1].type).toBe(TokenType.EOF);
  });
});

// ─── 3. Unterminated string interpolation (Line 283) ───────────

describe('Unterminated string interpolation', () => {
  test('throws on missing closing brace in interpolation', () => {
    expect(lexThrows('"hello {name"')).toThrow(/Unterminated string interpolation/);
  });

  test('valid string interpolation succeeds', () => {
    const tokens = lex('"hello {name}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('string interpolation with expression succeeds', () => {
    const tokens = lex('"result: {1 + 2}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('string with escaped brace is not interpolation', () => {
    const tokens = lex('"hello \\{name}"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello {name}');
  });
});

// ─── 4. Unterminated double-quoted string (Line 301) ───────────

describe('Unterminated double-quoted string', () => {
  test('throws on unterminated string at EOF', () => {
    expect(lexThrows('"hello')).toThrow(/Unterminated string/);
  });

  test('throws on multiline unterminated string', () => {
    expect(lexThrows('"hello\nworld')).toThrow(/Unterminated string/);
  });
});

// ─── 5. Single-quoted string escape sequences (Lines 324-332) ──

describe('Single-quoted string escape sequences', () => {
  test('newline escape in single-quoted string', () => {
    const tokens = lex("'line\\nbreak'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('line\nbreak');
  });

  test('tab escape in single-quoted string', () => {
    const tokens = lex("'tab\\there'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('tab\there');
  });

  test('backslash escape in single-quoted string', () => {
    const tokens = lex("'back\\\\slash'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('back\\slash');
  });

  test('carriage return escape in single-quoted string', () => {
    const tokens = lex("'cr\\rhere'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('cr\rhere');
  });

  test('single quote escape in single-quoted string', () => {
    const tokens = lex("'it\\'s'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe("it's");
  });

  test('unknown escape sequence preserves backslash', () => {
    const tokens = lex("'test\\zvalue'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('test\\zvalue');
  });
});

// ─── 6. Unterminated single-quoted string (Line 340) ───────────

describe('Unterminated single-quoted string', () => {
  test('throws on unterminated single-quoted string', () => {
    expect(lexThrows("'hello")).toThrow(/Unterminated string/);
  });

  test('throws on single-quoted string with escape at end', () => {
    expect(lexThrows("'test\\")).toThrow();
  });
});

// ─── 7. Single & without && (Line 469) ─────────────────────────

describe('Single ampersand error', () => {
  test('throws on single & suggesting &&', () => {
    expect(lexThrows('x & y')).toThrow(/Unexpected character.*&.*&&/);
  });
});

// ─── Additional lexer coverage ──────────────────────────────────

describe('Additional lexer coverage', () => {
  // Double-quoted string escape sequences
  test('double-quoted string escape sequences', () => {
    const tokens = lex('"line\\nbreak"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('line\nbreak');
  });

  test('double-quoted tab escape', () => {
    const tokens = lex('"tab\\there"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('tab\there');
  });

  test('double-quoted carriage return escape', () => {
    const tokens = lex('"cr\\rhere"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('cr\rhere');
  });

  test('double-quoted backslash escape', () => {
    const tokens = lex('"back\\\\slash"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('back\\slash');
  });

  test('double-quoted quote escape', () => {
    const tokens = lex('"say \\"hi\\""');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('say "hi"');
  });

  test('double-quoted brace escape', () => {
    const tokens = lex('"escaped \\{brace}"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('escaped {brace}');
  });

  test('double-quoted unknown escape preserves backslash', () => {
    const tokens = lex('"test\\zvalue"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('test\\zvalue');
  });

  // Number formats
  test('hex number', () => {
    const tokens = lex('0xFF');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(255);
  });

  test('binary number', () => {
    const tokens = lex('0b1010');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(10);
  });

  test('octal number', () => {
    const tokens = lex('0o17');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(15);
  });

  test('decimal with underscores', () => {
    const tokens = lex('1_000_000');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(1000000);
  });

  test('float number', () => {
    const tokens = lex('3.14');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(3.14);
  });

  test('float with exponent', () => {
    const tokens = lex('1.5e10');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(1.5e10);
  });

  test('number with negative exponent', () => {
    const tokens = lex('2.5e-3');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(0.0025);
  });

  test('number with positive exponent', () => {
    const tokens = lex('1E+5');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(100000);
  });

  test('hex with underscores', () => {
    const tokens = lex('0xFF_FF');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(65535);
  });

  test('binary with underscores', () => {
    const tokens = lex('0b1010_0101');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(165);
  });

  test('octal with underscores', () => {
    const tokens = lex('0o7_7');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(63);
  });

  // Comments
  test('line comment is discarded', () => {
    const tokens = lex('// this is a comment\n42');
    // Should skip the comment, have NEWLINE and NUMBER
    const numToken = tokens.find(t => t.type === TokenType.NUMBER);
    expect(numToken.value).toBe(42);
  });

  test('docstring comment is preserved', () => {
    const tokens = lex('/// This is a doc\n42');
    const docToken = tokens.find(t => t.type === TokenType.DOCSTRING);
    expect(docToken).toBeDefined();
    expect(docToken.value).toBe('This is a doc');
  });

  // Operators
  test('single pipe throws', () => {
    expect(lexThrows('x | y')).toThrow(/Unexpected character.*\|/);
  });

  test('pipe operator |>', () => {
    const tokens = lex('x |> y');
    const pipe = tokens.find(t => t.type === TokenType.PIPE);
    expect(pipe).toBeDefined();
  });

  test('or operator ||', () => {
    const tokens = lex('x || y');
    const or = tokens.find(t => t.type === TokenType.OR_OR);
    expect(or).toBeDefined();
  });

  test('and operator &&', () => {
    const tokens = lex('x && y');
    const and = tokens.find(t => t.type === TokenType.AND_AND);
    expect(and).toBeDefined();
  });

  test('dot dot equal ..=', () => {
    const tokens = lex('1..=10');
    const dde = tokens.find(t => t.type === TokenType.DOT_DOT_EQUAL);
    expect(dde).toBeDefined();
  });

  test('spread ...', () => {
    const tokens = lex('...x');
    const spread = tokens.find(t => t.type === TokenType.SPREAD);
    expect(spread).toBeDefined();
  });

  test('dot dot ..', () => {
    const tokens = lex('1..10');
    const dd = tokens.find(t => t.type === TokenType.DOT_DOT);
    expect(dd).toBeDefined();
  });

  test('dot .', () => {
    const tokens = lex('x.y');
    const dot = tokens.find(t => t.type === TokenType.DOT);
    expect(dot).toBeDefined();
  });

  test('double colon ::', () => {
    const tokens = lex('a::b');
    const dc = tokens.find(t => t.type === TokenType.DOUBLE_COLON);
    expect(dc).toBeDefined();
  });

  test('colon :', () => {
    const tokens = lex('a: b');
    const c = tokens.find(t => t.type === TokenType.COLON);
    expect(c).toBeDefined();
  });

  test('question dot ?.', () => {
    const tokens = lex('x?.y');
    const qd = tokens.find(t => t.type === TokenType.QUESTION_DOT);
    expect(qd).toBeDefined();
  });

  test('question question ??', () => {
    const tokens = lex('x ?? y');
    const qq = tokens.find(t => t.type === TokenType.QUESTION_QUESTION);
    expect(qq).toBeDefined();
  });

  test('question ?', () => {
    const tokens = lex('x?');
    const q = tokens.find(t => t.type === TokenType.QUESTION);
    expect(q).toBeDefined();
  });

  test('arrow =>', () => {
    const tokens = lex('x => y');
    const arrow = tokens.find(t => t.type === TokenType.ARROW);
    expect(arrow).toBeDefined();
  });

  test('thin arrow ->', () => {
    const tokens = lex('x -> y');
    const arrow = tokens.find(t => t.type === TokenType.THIN_ARROW);
    expect(arrow).toBeDefined();
  });

  test('minus assign -=', () => {
    const tokens = lex('x -= 1');
    const op = tokens.find(t => t.type === TokenType.MINUS_ASSIGN);
    expect(op).toBeDefined();
  });

  test('power **', () => {
    const tokens = lex('x ** 2');
    const op = tokens.find(t => t.type === TokenType.POWER);
    expect(op).toBeDefined();
  });

  test('star assign *=', () => {
    const tokens = lex('x *= 2');
    const op = tokens.find(t => t.type === TokenType.STAR_ASSIGN);
    expect(op).toBeDefined();
  });

  test('slash assign /=', () => {
    const tokens = lex('x /= 2');
    const op = tokens.find(t => t.type === TokenType.SLASH_ASSIGN);
    expect(op).toBeDefined();
  });

  test('plus assign +=', () => {
    const tokens = lex('x += 1');
    const op = tokens.find(t => t.type === TokenType.PLUS_ASSIGN);
    expect(op).toBeDefined();
  });

  test('equal ==', () => {
    const tokens = lex('x == y');
    const op = tokens.find(t => t.type === TokenType.EQUAL);
    expect(op).toBeDefined();
  });

  test('not equal !=', () => {
    const tokens = lex('x != y');
    const op = tokens.find(t => t.type === TokenType.NOT_EQUAL);
    expect(op).toBeDefined();
  });

  test('bang !', () => {
    const tokens = lex('!x');
    const op = tokens.find(t => t.type === TokenType.BANG);
    expect(op).toBeDefined();
  });

  test('less equal <=', () => {
    const tokens = lex('x <= y');
    const op = tokens.find(t => t.type === TokenType.LESS_EQUAL);
    expect(op).toBeDefined();
  });

  test('greater equal >=', () => {
    const tokens = lex('x >= y');
    const op = tokens.find(t => t.type === TokenType.GREATER_EQUAL);
    expect(op).toBeDefined();
  });

  test('percent %', () => {
    const tokens = lex('x % 2');
    const op = tokens.find(t => t.type === TokenType.PERCENT);
    expect(op).toBeDefined();
  });

  test('semicolon ;', () => {
    const tokens = lex('x; y');
    const op = tokens.find(t => t.type === TokenType.SEMICOLON);
    expect(op).toBeDefined();
  });

  // Delimiters
  test('all delimiters', () => {
    const tokens = lex('(){}[],');
    expect(tokens.find(t => t.type === TokenType.LPAREN)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.RPAREN)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.LBRACE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.RBRACE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.LBRACKET)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.RBRACKET)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.COMMA)).toBeDefined();
  });

  // Keywords
  test('keywords are recognized', () => {
    const tokens = lex('var let fn return if elif else for while match type import from export as and or not in true false nil server client shared route state computed effect component');
    expect(tokens.find(t => t.type === TokenType.VAR)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.LET)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.FN)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.RETURN)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.IF)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.ELIF)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.ELSE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.FOR)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.WHILE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.MATCH)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.TYPE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.IMPORT)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.FROM)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.EXPORT)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.AS)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.AND)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.OR)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.NOT)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.IN)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.TRUE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.FALSE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.NIL)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.SERVER)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.CLIENT)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.SHARED)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.ROUTE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.STATE)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.COMPUTED)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.EFFECT)).toBeDefined();
    expect(tokens.find(t => t.type === TokenType.COMPONENT)).toBeDefined();
  });

  // Identifiers
  test('identifiers with underscores', () => {
    const tokens = lex('_foo bar_baz __init__');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('_foo');
  });

  // Whitespace handling
  test('tabs and carriage returns are whitespace', () => {
    const tokens = lex('\tx\r\n');
    const id = tokens.find(t => t.type === TokenType.IDENTIFIER);
    expect(id).toBeDefined();
    expect(id.value).toBe('x');
  });

  test('newlines produce NEWLINE tokens', () => {
    const tokens = lex('x\ny');
    const newlines = tokens.filter(t => t.type === TokenType.NEWLINE);
    expect(newlines.length).toBeGreaterThan(0);
  });

  // Unexpected character
  test('unexpected character throws', () => {
    expect(lexThrows('x @ y')).toThrow(/Unexpected character/);
  });

  // EOF
  test('empty source produces only EOF', () => {
    const tokens = lex('');
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  // String with trailing text after interpolation
  test('string with text after interpolation', () => {
    const tokens = lex('"hello {name}!"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(3);
    expect(parts[0]).toEqual({ type: 'text', value: 'hello ' });
    expect(parts[1].type).toBe('expr');
    expect(parts[2]).toEqual({ type: 'text', value: '!' });
  });

  // Slash without assign
  test('slash operator /', () => {
    const tokens = lex('x / y');
    const op = tokens.find(t => t.type === TokenType.SLASH);
    expect(op).toBeDefined();
  });

  // Simple string (no interpolation)
  test('simple double-quoted string', () => {
    const tokens = lex('"hello world"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello world');
  });

  // Simple single-quoted string
  test('simple single-quoted string', () => {
    const tokens = lex("'hello world'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello world');
  });

  // Nested braces in string interpolation
  test('string interpolation with nested braces', () => {
    const tokens = lex('"result: {{1: 2}}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  // Token toString
  test('Token toString returns formatted string', () => {
    const tokens = lex('42');
    const str = tokens[0].toString();
    expect(str).toContain('NUMBER');
    expect(str).toContain('42');
  });

  // Upper case hex prefix
  test('upper case hex prefix 0X', () => {
    const tokens = lex('0XAB');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(171);
  });

  // Upper case binary prefix
  test('upper case binary prefix 0B', () => {
    const tokens = lex('0B11');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(3);
  });

  // Upper case octal prefix
  test('upper case octal prefix 0O', () => {
    const tokens = lex('0O10');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(8);
  });

  // Float with underscore in decimal portion
  test('float with underscore in decimal portion', () => {
    const tokens = lex('3.14_15');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(3.1415);
  });
});
