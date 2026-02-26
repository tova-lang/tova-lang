import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

function lex(source) {
  const lexer = new Lexer(source, '<test>');
  return lexer.tokenize();
}

function types(source) {
  return lex(source)
    .filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
    .map(t => t.type);
}

function values(source) {
  return lex(source)
    .filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
    .map(t => t.value);
}

function lexThrows(source) {
  return () => {
    const lexer = new Lexer(source, '<test>');
    lexer.tokenize();
  };
}

// ─── Number Parsing Edge Cases ──────────────────────────────────

describe('Lexer — Number edge cases', () => {
  test('zero by itself', () => {
    expect(values('0')).toEqual([0]);
  });

  test('integer with trailing dot and dot (range)', () => {
    // 1..10 should be NUMBER DOT_DOT NUMBER (not 1. . 10)
    const toks = lex('1..10');
    expect(toks[0].type).toBe(TokenType.NUMBER);
    expect(toks[0].value).toBe(1);
    expect(toks[1].type).toBe(TokenType.DOT_DOT);
    expect(toks[2].type).toBe(TokenType.NUMBER);
    expect(toks[2].value).toBe(10);
  });

  test('float followed by method call (3.14.toString)', () => {
    const toks = lex('3.14.toString');
    expect(toks[0].type).toBe(TokenType.NUMBER);
    expect(toks[0].value).toBe(3.14);
    expect(toks[1].type).toBe(TokenType.DOT);
  });

  test('exponent with capital E and positive sign', () => {
    expect(values('1E+5')).toEqual([100000]);
  });

  test('exponent with capital E and negative sign', () => {
    expect(values('5E-2')).toEqual([0.05]);
  });

  test('integer exponent without sign', () => {
    expect(values('3e2')).toEqual([300]);
  });

  test('very large integer', () => {
    expect(values('999999999999999')).toEqual([999999999999999]);
  });

  test('very small float', () => {
    expect(values('0.0000001')).toEqual([0.0000001]);
  });

  test('number with multiple underscores', () => {
    expect(values('1_000_000_000')).toEqual([1000000000]);
  });

  test('hex lowercase', () => {
    expect(values('0xff')).toEqual([255]);
  });

  test('hex uppercase prefix', () => {
    expect(values('0XFF')).toEqual([255]);
  });

  test('binary uppercase prefix', () => {
    expect(values('0B1111')).toEqual([15]);
  });

  test('octal uppercase prefix', () => {
    expect(values('0O77')).toEqual([63]);
  });

  test('hex with mixed case digits', () => {
    expect(values('0xAbCd')).toEqual([0xAbCd]);
  });

  test('hex with underscores', () => {
    expect(values('0xFF_FF')).toEqual([65535]);
  });

  test('binary with underscores', () => {
    expect(values('0b1010_0101')).toEqual([165]);
  });

  test('octal with underscores', () => {
    expect(values('0o7_7_7')).toEqual([0o777]);
  });

  test('float with underscore in integer and decimal parts', () => {
    expect(values('1_234.567_8')).toEqual([1234.5678]);
  });

  test('float with exponent and underscore in integer part', () => {
    expect(values('1_0e2')).toEqual([1000]);
  });

  test('zero with decimal point', () => {
    expect(values('0.0')).toEqual([0]);
  });

  test('multiple numbers on one line', () => {
    expect(values('1 2 3')).toEqual([1, 2, 3]);
  });

  test('number immediately before operator', () => {
    const toks = types('42+3');
    expect(toks).toEqual([TokenType.NUMBER, TokenType.PLUS, TokenType.NUMBER]);
  });

  test('negative number via unary minus', () => {
    const toks = types('-42');
    expect(toks).toEqual([TokenType.MINUS, TokenType.NUMBER]);
  });
});

// ─── String Edge Cases ─────────────────────────────────────────

describe('Lexer — String edge cases', () => {
  test('empty double-quoted string', () => {
    const tokens = lex('""');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('');
  });

  test('empty single-quoted string', () => {
    const tokens = lex("''");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('');
  });

  test('string with only escaped characters', () => {
    const tokens = lex('"\\n\\t\\r"');
    expect(tokens[0].value).toBe('\n\t\r');
  });

  test('consecutive escape sequences', () => {
    const tokens = lex('"\\\\\\n"');
    expect(tokens[0].value).toBe('\\\n');
  });

  test('escaped quote at end of string', () => {
    const tokens = lex('"test\\""');
    expect(tokens[0].value).toBe('test"');
  });

  test('escaped single quote at end of single-quoted string', () => {
    const tokens = lex("'test\\''");
    expect(tokens[0].value).toBe("test'");
  });

  test('unknown escape in double-quoted preserves backslash', () => {
    const tokens = lex('"\\q"');
    expect(tokens[0].value).toBe('\\q');
  });

  test('unknown escape in single-quoted preserves backslash', () => {
    const tokens = lex("'\\q'");
    expect(tokens[0].value).toBe('\\q');
  });

  test('string with spaces only', () => {
    const tokens = lex('"   "');
    expect(tokens[0].value).toBe('   ');
  });

  test('string with unicode characters', () => {
    const tokens = lex('"hello world"');
    expect(tokens[0].type).toBe(TokenType.STRING);
  });

  test('multiple strings on same line', () => {
    const toks = lex('"a" "b" "c"');
    expect(toks[0].value).toBe('a');
    expect(toks[1].value).toBe('b');
    expect(toks[2].value).toBe('c');
  });
});

// ─── String Interpolation Edge Cases ────────────────────────────

describe('Lexer — Interpolation edge cases', () => {
  test('interpolation at start of string', () => {
    const tokens = lex('"{x} rest"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[0].type).toBe('expr');
    expect(parts[1]).toEqual({ type: 'text', value: ' rest' });
  });

  test('interpolation at end of string', () => {
    const tokens = lex('"start {x}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[0]).toEqual({ type: 'text', value: 'start ' });
    expect(parts[1].type).toBe('expr');
  });

  test('consecutive interpolations with no text between', () => {
    const tokens = lex('"{a}{b}{c}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(3);
    expect(parts[0].type).toBe('expr');
    expect(parts[1].type).toBe('expr');
    expect(parts[2].type).toBe('expr');
  });

  test('only interpolation in string', () => {
    const tokens = lex('"{x}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(1);
    expect(parts[0].type).toBe('expr');
  });

  test('interpolation with complex expression', () => {
    const tokens = lex('"{x + y * z}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[0].type).toBe('expr');
    expect(parts[0].tokens.length).toBe(5); // x + y * z
  });

  test('interpolation with nested braces (object literal)', () => {
    const tokens = lex('"result: {{a: 1}}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('interpolation with function call', () => {
    const tokens = lex('"{foo(1, 2)}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[0].type).toBe('expr');
    // foo ( 1 , 2 )
    expect(parts[0].tokens.length).toBe(6);
  });

  test('text between two interpolations', () => {
    const tokens = lex('"{a} and {b}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(3);
    expect(parts[0].type).toBe('expr');
    expect(parts[1]).toEqual({ type: 'text', value: ' and ' });
    expect(parts[2].type).toBe('expr');
  });

  test('interpolation with member access', () => {
    const tokens = lex('"{user.name}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('escaped brace followed by interpolation', () => {
    const tokens = lex('"\\{literal} {real}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[0]).toEqual({ type: 'text', value: '{literal} ' });
    expect(parts[1].type).toBe('expr');
  });

  test('unterminated interpolation throws', () => {
    expect(lexThrows('"hello {name"')).toThrow(/Unterminated string interpolation/);
  });
});

// ─── Comment Edge Cases ────────────────────────────────────────

describe('Lexer — Comment edge cases', () => {
  test('line comment at end of file (no trailing newline)', () => {
    const tokens = lex('x = 1 // comment');
    const nonMeta = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonMeta.length).toBe(3);
  });

  test('empty line comment', () => {
    const tokens = lex('//\n42');
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(42);
  });

  test('empty block comment', () => {
    const tokens = lex('/**/42');
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(42);
  });

  test('block comment with no space after opening', () => {
    const tokens = lex('/*comment*/42');
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(42);
  });

  test('deeply nested block comments (3 levels)', () => {
    const tokens = lex('/* outer /* mid /* inner */ mid */ outer */42');
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(42);
  });

  test('block comment with newlines inside', () => {
    const tokens = lex('x /* line1\nline2\nline3 */ = 1');
    const nonMeta = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonMeta.length).toBe(3);
  });

  test('unterminated block comment throws', () => {
    expect(lexThrows('/* never closed')).toThrow(/Unterminated block comment/);
  });

  test('unterminated nested block comment throws', () => {
    expect(lexThrows('/* outer /* inner */')).toThrow(/Unterminated block comment/);
  });

  test('docstring with four slashes', () => {
    const tokens = lex('//// extra slash');
    const doc = tokens.find(t => t.type === TokenType.DOCSTRING);
    expect(doc).toBeDefined();
    expect(doc.value).toBe('/ extra slash');
  });

  test('docstring trims whitespace', () => {
    const tokens = lex('///   spaced   ');
    const doc = tokens.find(t => t.type === TokenType.DOCSTRING);
    expect(doc.value).toBe('spaced');
  });

  test('docstring at end of file (no trailing newline)', () => {
    const tokens = lex('/// doc at eof');
    const doc = tokens.find(t => t.type === TokenType.DOCSTRING);
    expect(doc).toBeDefined();
    expect(doc.value).toBe('doc at eof');
  });

  test('multiple comments between tokens', () => {
    const tokens = lex('x // first\n// second\ny');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids.length).toBe(2);
    expect(ids[0].value).toBe('x');
    expect(ids[1].value).toBe('y');
  });
});

// ─── Operator Edge Cases ───────────────────────────────────────

describe('Lexer — Operator edge cases', () => {
  test('all assignment operators', () => {
    expect(types('+= -= *= /=')).toEqual([
      TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN,
      TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN,
    ]);
  });

  test('power vs star-assign disambiguation', () => {
    // ** should be POWER, *= should be STAR_ASSIGN
    expect(types('**')).toEqual([TokenType.POWER]);
    expect(types('*=')).toEqual([TokenType.STAR_ASSIGN]);
  });

  test('thin arrow vs minus disambiguation', () => {
    expect(types('->')).toEqual([TokenType.THIN_ARROW]);
    expect(types('-=')).toEqual([TokenType.MINUS_ASSIGN]);
    expect(types('-')).toEqual([TokenType.MINUS]);
  });

  test('arrow vs equal-assign disambiguation', () => {
    expect(types('=>')).toEqual([TokenType.ARROW]);
    expect(types('==')).toEqual([TokenType.EQUAL]);
    expect(types('=')).toEqual([TokenType.ASSIGN]);
  });

  test('dot variants disambiguated correctly', () => {
    expect(types('.')).toEqual([TokenType.DOT]);
    expect(types('..')).toEqual([TokenType.DOT_DOT]);
    expect(types('..=')).toEqual([TokenType.DOT_DOT_EQUAL]);
    expect(types('...')).toEqual([TokenType.SPREAD]);
  });

  test('question variants disambiguated correctly', () => {
    expect(types('?')).toEqual([TokenType.QUESTION]);
    expect(types('?.')).toEqual([TokenType.QUESTION_DOT]);
    expect(types('??')).toEqual([TokenType.QUESTION_QUESTION]);
  });

  test('not-equal vs bang', () => {
    expect(types('!=')).toEqual([TokenType.NOT_EQUAL]);
    expect(types('!')).toEqual([TokenType.BANG]);
  });

  test('less-equal vs less', () => {
    expect(types('<=')).toEqual([TokenType.LESS_EQUAL]);
    expect(types('<')).toEqual([TokenType.LESS]);
  });

  test('greater-equal vs greater', () => {
    expect(types('>=')).toEqual([TokenType.GREATER_EQUAL]);
    expect(types('>')).toEqual([TokenType.GREATER]);
  });

  test('operators with no whitespace between', () => {
    // a+b should tokenize correctly
    const toks = types('a+b');
    expect(toks).toEqual([TokenType.IDENTIFIER, TokenType.PLUS, TokenType.IDENTIFIER]);
  });

  test('slash-assign vs slash', () => {
    expect(types('/=')).toEqual([TokenType.SLASH_ASSIGN]);
    expect(types('/')).toEqual([TokenType.SLASH]);
  });

  test('colon vs double colon', () => {
    expect(types(':')).toEqual([TokenType.COLON]);
    expect(types('::')).toEqual([TokenType.DOUBLE_COLON]);
  });

  test('single & outside JSX throws', () => {
    expect(lexThrows('a & b')).toThrow(/Unexpected character.*&/);
  });

  test('single | is valid BAR token for union types', () => {
    const tokens = new Lexer('a | b', '<test>').tokenize();
    expect(tokens.some(t => t.type === 'BAR')).toBe(true);
  });

  test('@ is a valid token for decorators', () => {
    const tokens = lex('@');
    expect(tokens[0].type).toBe('AT');
    expect(tokens[0].value).toBe('@');
  });

  test('unexpected character # throws', () => {
    expect(lexThrows('#')).toThrow(/Unexpected character/);
  });

  test('unexpected character $ throws', () => {
    expect(lexThrows('$')).toThrow(/Unexpected character/);
  });

  test('unexpected character ~ throws', () => {
    expect(lexThrows('~')).toThrow(/Unexpected character/);
  });

  test('unexpected character ` throws', () => {
    expect(lexThrows('`')).toThrow(/Unexpected character/);
  });
});

// ─── Keyword vs Identifier Edge Cases ──────────────────────────

describe('Lexer — Keyword vs Identifier edge cases', () => {
  test('keyword prefixes are identifiers', () => {
    expect(types('variable')).toEqual([TokenType.IDENTIFIER]);
    expect(types('format')).toEqual([TokenType.IDENTIFIER]);
    expect(types('return_value')).toEqual([TokenType.IDENTIFIER]);
    expect(types('if_condition')).toEqual([TokenType.IDENTIFIER]);
    expect(types('for_each')).toEqual([TokenType.IDENTIFIER]);
    expect(types('while_loop')).toEqual([TokenType.IDENTIFIER]);
    expect(types('match_result')).toEqual([TokenType.IDENTIFIER]);
    expect(types('typeof')).toEqual([TokenType.IDENTIFIER]);
    expect(types('import_data')).toEqual([TokenType.IDENTIFIER]);
  });

  test('try and catch are keywords', () => {
    expect(types('try')).toEqual([TokenType.TRY]);
    expect(types('catch')).toEqual([TokenType.CATCH]);
  });

  test('store is keyword', () => {
    expect(types('store')).toEqual([TokenType.STORE]);
  });

  test('identifiers starting with underscore', () => {
    const tokens = lex('_private __dunder __init__');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids[0].value).toBe('_private');
    expect(ids[1].value).toBe('__dunder');
    expect(ids[2].value).toBe('__init__');
  });

  test('identifiers with numbers', () => {
    const tokens = lex('x1 foo2bar item3');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids[0].value).toBe('x1');
    expect(ids[1].value).toBe('foo2bar');
    expect(ids[2].value).toBe('item3');
  });

  test('single character identifiers', () => {
    expect(types('x')).toEqual([TokenType.IDENTIFIER]);
    expect(types('a')).toEqual([TokenType.IDENTIFIER]);
    expect(types('_')).toEqual([TokenType.IDENTIFIER]);
  });

  test('HTTP method keywords', () => {
    // GET/POST/etc are identifiers, not keywords (used contextually)
    expect(types('GET')).toEqual([TokenType.IDENTIFIER]);
    expect(types('POST')).toEqual([TokenType.IDENTIFIER]);
    expect(types('PUT')).toEqual([TokenType.IDENTIFIER]);
    expect(types('DELETE')).toEqual([TokenType.IDENTIFIER]);
    expect(types('PATCH')).toEqual([TokenType.IDENTIFIER]);
  });
});

// ─── Whitespace and Newline Edge Cases ─────────────────────────

describe('Lexer — Whitespace and newline edge cases', () => {
  test('carriage return alone is whitespace', () => {
    const tokens = lex('x\ry');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids.length).toBe(2);
  });

  test('tab is whitespace', () => {
    const tokens = lex('x\ty');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids.length).toBe(2);
  });

  test('multiple consecutive newlines', () => {
    const tokens = lex('x\n\n\ny');
    const newlines = tokens.filter(t => t.type === TokenType.NEWLINE);
    expect(newlines.length).toBe(3);
  });

  test('mixed whitespace and newlines', () => {
    const tokens = lex('  x  \n  \t  y  \n');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids.length).toBe(2);
    expect(ids[0].value).toBe('x');
    expect(ids[1].value).toBe('y');
  });

  test('leading whitespace is ignored', () => {
    const tokens = lex('    42');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
  });

  test('trailing whitespace is ignored', () => {
    const tokens = lex('42    ');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
    expect(tokens[1].type).toBe(TokenType.EOF);
  });
});

// ─── Line and Column Tracking ──────────────────────────────────

describe('Lexer — Line and column tracking', () => {
  test('first token is at line 1 column 1', () => {
    const tokens = lex('hello');
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].column).toBe(1);
  });

  test('column increments with characters', () => {
    const tokens = lex('abc def');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids[0].column).toBe(1);
    expect(ids[1].column).toBe(5);
  });

  test('line increments with newlines', () => {
    const tokens = lex('a\nb\nc');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids[0].line).toBe(1);
    expect(ids[1].line).toBe(2);
    expect(ids[2].line).toBe(3);
  });

  test('column resets after newline', () => {
    const tokens = lex('a\n  b');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids[1].line).toBe(2);
    expect(ids[1].column).toBe(3);
  });

  test('error message includes location', () => {
    try {
      lex('\n\n  @');
    } catch (e) {
      expect(e.message).toContain('<test>:3:');
    }
  });
});

// ─── Style Block Lexing ────────────────────────────────────────

describe('Lexer — Style block edge cases', () => {
  test('basic style block', () => {
    const tokens = lex('style { .foo { color: red } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
    expect(style.value).toContain('.foo');
    expect(style.value).toContain('color: red');
  });

  test('style block with nested braces', () => {
    const tokens = lex('style { .x { .y { color: blue } } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
    expect(style.value).toContain('.x');
    expect(style.value).toContain('.y');
  });

  test('style keyword as identifier when not followed by brace', () => {
    const tokens = lex('style = "bold"');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style');
  });

  test('style block with newline before brace', () => {
    const tokens = lex('style\n{ .foo { color: red } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
  });

  test('style block with CSS comments', () => {
    const tokens = lex('style { /* comment */ .foo { color: red } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
    expect(style.value).toContain('/* comment */');
  });

  test('identifier containing style prefix', () => {
    const tokens = lex('style_var = 1');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style_var');
  });

  test('style as variable name followed by dot', () => {
    const tokens = lex('style.color');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style');
    expect(tokens[1].type).toBe(TokenType.DOT);
  });
});

// ─── _isJSXStart Edge Cases ────────────────────────────────────

describe('Lexer — _isJSXStart context detection', () => {
  test('< after operator allows JSX', () => {
    // After =, < should be treated as JSX start
    const tokens = lex('x = <div>');
    const hasJSX = tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'div');
    expect(hasJSX).toBe(true);
  });

  test('< after number is comparison not JSX', () => {
    const toks = types('42 < x');
    expect(toks).toEqual([TokenType.NUMBER, TokenType.LESS, TokenType.IDENTIFIER]);
  });

  test('< after string is comparison not JSX', () => {
    const toks = types('"a" < "b"');
    expect(toks).toEqual([TokenType.STRING, TokenType.LESS, TokenType.STRING]);
  });

  test('< after true is comparison not JSX', () => {
    const toks = types('true < false');
    expect(toks).toEqual([TokenType.TRUE, TokenType.LESS, TokenType.FALSE]);
  });

  test('< after nil is comparison not JSX', () => {
    const toks = types('nil < x');
    expect(toks).toEqual([TokenType.NIL, TokenType.LESS, TokenType.IDENTIFIER]);
  });

  test('< after ) is comparison not JSX', () => {
    const toks = types('foo() < 5');
    expect(toks).toContain(TokenType.LESS);
  });

  test('< after ] is comparison not JSX', () => {
    const toks = types('arr[0] < 5');
    expect(toks).toContain(TokenType.LESS);
  });

  test('< after identifier is comparison not JSX', () => {
    const toks = types('x < y');
    expect(toks).toEqual([TokenType.IDENTIFIER, TokenType.LESS, TokenType.IDENTIFIER]);
  });

  test('< at start of input with alpha is JSX', () => {
    // Should detect JSX when < is the very first token
    const tokens = lex('<div>');
    // In JSX context, div should be an identifier after JSX open
    const hasDiv = tokens.some(t => t.value === 'div');
    expect(hasDiv).toBe(true);
  });
});

// ─── JSX Context Tracking ──────────────────────────────────────

describe('Lexer — JSX context tracking', () => {
  test('self-closing JSX tag', () => {
    const tokens = lex('x = <br />');
    expect(tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'br')).toBe(true);
  });

  test('JSX opening and closing tags', () => {
    const tokens = lex('x = <div></div>');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    const divs = ids.filter(t => t.value === 'div');
    expect(divs.length).toBe(2);
  });

  test('JSX with text content', () => {
    const tokens = lex('x = <p>Hello World</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toContain('Hello World');
  });

  test('JSX with expression child', () => {
    const tokens = lex('x = <div>{value}</div>');
    const idents = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(idents.some(t => t.value === 'value')).toBe(true);
  });

  test('JSX with string child', () => {
    const tokens = lex('x = <p>"quoted text"</p>');
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toBe('quoted text');
  });

  test('nested JSX tags', () => {
    const tokens = lex('x = <div><span>text</span></div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toBe('text');
  });

  test('JSX if control flow keyword', () => {
    const tokens = lex('x = <div>if true { <span /> }</div>');
    const ifTok = tokens.find(t => t.type === TokenType.IF);
    expect(ifTok).toBeDefined();
  });

  test('JSX for control flow keyword', () => {
    const tokens = lex('x = <div>for x in items { <li /> }</div>');
    const forTok = tokens.find(t => t.type === TokenType.FOR);
    expect(forTok).toBeDefined();
  });

  test('JSX elif control flow keyword', () => {
    const tokens = lex('x = <div>if a { <span /> } elif b { <span /> }</div>');
    const elif = tokens.find(t => t.type === TokenType.ELIF);
    expect(elif).toBeDefined();
  });

  test('JSX else control flow keyword', () => {
    const tokens = lex('x = <div>if a { <span /> } else { <span /> }</div>');
    const elseTok = tokens.find(t => t.type === TokenType.ELSE);
    expect(elseTok).toBeDefined();
  });

  test('JSX text stops at keyword boundary', () => {
    const tokens = lex('x = <div>text if true { <br /> }</div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    // Text should stop before the 'if' keyword
    expect(text.value.trim()).toBe('text');
  });

  test('JSX text with non-keyword alphanumeric', () => {
    const tokens = lex('x = <p>hello world</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toContain('hello world');
  });

  test('multiple JSX siblings', () => {
    const tokens = lex('x = <div><a /><b /><c /></div>');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids.some(t => t.value === 'a')).toBe(true);
    expect(ids.some(t => t.value === 'b')).toBe(true);
    expect(ids.some(t => t.value === 'c')).toBe(true);
  });

  test('JSX with whitespace between structural chars is skipped', () => {
    const tokens = lex('x = <div>   <span /></div>');
    // No JSX_TEXT token for whitespace-only between < characters
    const text = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(text.length).toBe(0);
  });

  test('JSX with & inside tag becomes text', () => {
    // & inside JSX children should be handled gracefully
    const tokens = lex('x = <div>a &amp; b</div>');
    // Should not throw — & in JSX context is handled
  });

  test('closing tag pops from JSX stack', () => {
    // After </div>, we should be back to normal mode
    const tokens = lex('x = <div>text</div>\ny = 42');
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num).toBeDefined();
    expect(num.value).toBe(42);
  });
});

// ─── Token Class Edge Cases ────────────────────────────────────

describe('Lexer — Token class', () => {
  test('Token toString with string value', () => {
    const tokens = lex('"hello"');
    const str = tokens[0].toString();
    expect(str).toContain('STRING');
    expect(str).toContain('hello');
  });

  test('Token toString with number value', () => {
    const tokens = lex('42');
    const str = tokens[0].toString();
    expect(str).toContain('NUMBER');
    expect(str).toContain('42');
  });

  test('Token toString with null value (EOF)', () => {
    const tokens = lex('');
    const eof = tokens[0];
    expect(eof.type).toBe(TokenType.EOF);
    const str = eof.toString();
    expect(str).toContain('EOF');
    expect(str).toContain('null');
  });

  test('Token toString with keyword', () => {
    const tokens = lex('if');
    const str = tokens[0].toString();
    expect(str).toContain('IF');
    expect(str).toContain('if');
    expect(str).toContain('1:1');
  });
});

// ─── Complex Tokenization Scenarios ────────────────────────────

describe('Lexer — Complex scenarios', () => {
  test('function with all features', () => {
    const src = 'fn greet(name: String = "world") -> String {\n  "Hello, {name}!"\n}';
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.FN)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.THIN_ARROW)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.STRING_TEMPLATE)).toBe(true);
  });

  test('match expression with multiple patterns', () => {
    const src = 'match x {\n  0 => "zero"\n  1..10 => "small"\n  _ => "other"\n}';
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.MATCH)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.DOT_DOT)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.ARROW)).toBe(true);
  });

  test('pipe chain', () => {
    const toks = types('data |> filter |> map |> sort');
    expect(toks.filter(t => t === TokenType.PIPE).length).toBe(3);
  });

  test('complex expression with all operator types', () => {
    const src = 'a + b * c ** d / e - f % g';
    const toks = types(src);
    expect(toks).toContain(TokenType.PLUS);
    expect(toks).toContain(TokenType.STAR);
    expect(toks).toContain(TokenType.POWER);
    expect(toks).toContain(TokenType.SLASH);
    expect(toks).toContain(TokenType.MINUS);
    expect(toks).toContain(TokenType.PERCENT);
  });

  test('let destructuring with array and object', () => {
    const src = 'let { a, b } = obj\nlet [x, y] = arr';
    const tokens = lex(src);
    expect(tokens.filter(t => t.type === TokenType.LET).length).toBe(2);
    expect(tokens.filter(t => t.type === TokenType.ASSIGN).length).toBe(2);
  });

  test('try-catch tokens', () => {
    const toks = types('try { } catch(e) { }');
    expect(toks).toContain(TokenType.TRY);
    expect(toks).toContain(TokenType.CATCH);
  });

  test('for in loop', () => {
    const toks = types('for x in items { }');
    expect(toks).toContain(TokenType.FOR);
    expect(toks).toContain(TokenType.IN);
  });

  test('while loop', () => {
    const toks = types('while x > 0 { }');
    expect(toks).toContain(TokenType.WHILE);
    expect(toks).toContain(TokenType.GREATER);
  });

  test('import statement', () => {
    const toks = types('import { foo, bar } from "module"');
    expect(toks).toContain(TokenType.IMPORT);
    expect(toks).toContain(TokenType.FROM);
  });

  test('type declaration', () => {
    const toks = types('type User { name: String }');
    expect(toks).toContain(TokenType.TYPE);
  });

  test('server block with route', () => {
    const toks = types('server { route GET "/api" => handler }');
    expect(toks).toContain(TokenType.SERVER);
    expect(toks).toContain(TokenType.ROUTE);
  });

  test('browser block with state', () => {
    const toks = types('browser { state count = 0 }');
    expect(toks).toContain(TokenType.BROWSER);
    expect(toks).toContain(TokenType.STATE);
  });

  test('shared block', () => {
    const toks = types('shared { type Item { name: String } }');
    expect(toks).toContain(TokenType.SHARED);
    expect(toks).toContain(TokenType.TYPE);
  });

  test('optional chaining chain', () => {
    const toks = types('a?.b?.c?.d');
    const questionDots = toks.filter(t => t === TokenType.QUESTION_DOT);
    expect(questionDots.length).toBe(3);
  });

  test('null coalescing chain', () => {
    const toks = types('a ?? b ?? c');
    const qq = toks.filter(t => t === TokenType.QUESTION_QUESTION);
    expect(qq.length).toBe(2);
  });

  test('spread in array and object', () => {
    const toks = types('[...a, ...b]');
    const spreads = toks.filter(t => t === TokenType.SPREAD);
    expect(spreads.length).toBe(2);
  });

  test('range inclusive', () => {
    const toks = types('1..=10');
    expect(toks).toContain(TokenType.DOT_DOT_EQUAL);
  });

  test('chained comparison', () => {
    const toks = types('1 < x < 10');
    const less = toks.filter(t => t === TokenType.LESS);
    expect(less.length).toBe(2);
  });

  test('membership operator', () => {
    const toks = types('x in list');
    expect(toks).toContain(TokenType.IN);
  });

  test('computed and effect keywords', () => {
    expect(types('computed')).toEqual([TokenType.COMPUTED]);
    expect(types('effect')).toEqual([TokenType.EFFECT]);
  });

  test('component keyword', () => {
    expect(types('component')).toEqual([TokenType.COMPONENT]);
  });

  test('boolean literals', () => {
    expect(types('true')).toEqual([TokenType.TRUE]);
    expect(types('false')).toEqual([TokenType.FALSE]);
  });

  test('nil literal', () => {
    expect(types('nil')).toEqual([TokenType.NIL]);
  });

  test('logical keywords', () => {
    expect(types('and')).toEqual([TokenType.AND]);
    expect(types('or')).toEqual([TokenType.OR]);
    expect(types('not')).toEqual([TokenType.NOT]);
  });
});
