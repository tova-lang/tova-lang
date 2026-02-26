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

describe('Lexer — Basics', () => {
  test('empty input', () => {
    const tokens = lex('');
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  test('whitespace only', () => {
    const tokens = lex('   \t  ');
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  test('newlines', () => {
    const tokens = lex('\n\n');
    expect(tokens.filter(t => t.type === TokenType.NEWLINE).length).toBe(2);
  });
});

describe('Lexer — Numbers', () => {
  test('integers', () => {
    expect(values('42')).toEqual([42]);
    expect(values('0')).toEqual([0]);
    expect(values('1_000_000')).toEqual([1000000]);
  });

  test('floats', () => {
    expect(values('3.14')).toEqual([3.14]);
    expect(values('0.5')).toEqual([0.5]);
  });

  test('exponents', () => {
    expect(values('1e10')).toEqual([1e10]);
    expect(values('2.5E-3')).toEqual([2.5e-3]);
  });

  test('hex', () => {
    expect(values('0xFF')).toEqual([255]);
    expect(values('0x1A')).toEqual([26]);
  });

  test('binary', () => {
    expect(values('0b1010')).toEqual([10]);
  });

  test('octal', () => {
    expect(values('0o17')).toEqual([15]);
  });
});

describe('Lexer — Strings', () => {
  test('simple double-quoted', () => {
    const tokens = lex('"hello"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello');
  });

  test('simple single-quoted', () => {
    const tokens = lex("'hello'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello');
  });

  test('escape sequences', () => {
    expect(values('"line1\\nline2"')).toEqual(['line1\nline2']);
    expect(values('"tab\\there"')).toEqual(['tab\there']);
    expect(values('"quote\\\\"')).toEqual(['quote\\']);
  });

  test('string interpolation', () => {
    const tokens = lex('"Hello, {name}!"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(3);
    expect(parts[0]).toEqual({ type: 'text', value: 'Hello, ' });
    expect(parts[1].type).toBe('expr');
    expect(parts[1].tokens[0].value).toBe('name');
    expect(parts[2]).toEqual({ type: 'text', value: '!' });
  });

  test('interpolation with expression', () => {
    const tokens = lex('"result: {x + 1}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[1].type).toBe('expr');
    expect(parts[1].tokens.length).toBe(3); // x, +, 1
  });

  test('escaped braces in string', () => {
    const tokens = lex('"literal \\{brace}"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('literal {brace}');
  });
});

describe('Lexer — Keywords', () => {
  test('all keywords recognized', () => {
    const keywords = [
      'var', 'let', 'fn', 'return', 'if', 'elif', 'else',
      'for', 'while', 'match', 'type', 'import', 'from', 'export', 'as',
      'and', 'or', 'not', 'in', 'true', 'false', 'nil',
      'server', 'browser', 'client', 'shared', 'route',
      'state', 'computed', 'effect', 'component',
    ];
    for (const kw of keywords) {
      const tokens = lex(kw);
      expect(tokens[0].type).not.toBe(TokenType.IDENTIFIER);
      expect(tokens[0].value).toBe(kw);
    }
  });

  test('identifiers not confused with keywords', () => {
    expect(types('variable')).toEqual([TokenType.IDENTIFIER]);
    expect(types('format')).toEqual([TokenType.IDENTIFIER]);
    expect(types('server_name')).toEqual([TokenType.IDENTIFIER]);
    expect(types('if_condition')).toEqual([TokenType.IDENTIFIER]);
  });
});

describe('Lexer — Operators', () => {
  test('arithmetic', () => {
    // Note: bare `* /` is ambiguous (could be regex after *), so we test
    // / in a division context (after identifier) and other operators separately
    expect(types('+ - * % **')).toEqual([
      TokenType.PLUS, TokenType.MINUS, TokenType.STAR,
      TokenType.PERCENT, TokenType.POWER,
    ]);
    // / after an identifier is unambiguously division
    expect(types('x / y')).toEqual([
      TokenType.IDENTIFIER, TokenType.SLASH, TokenType.IDENTIFIER,
    ]);
  });

  test('comparison', () => {
    expect(types('== != < <= > >=')).toEqual([
      TokenType.EQUAL, TokenType.NOT_EQUAL,
      TokenType.LESS, TokenType.LESS_EQUAL,
      TokenType.GREATER, TokenType.GREATER_EQUAL,
    ]);
  });

  test('logical', () => {
    expect(types('&& || !')).toEqual([
      TokenType.AND_AND, TokenType.OR_OR, TokenType.BANG,
    ]);
  });

  test('assignment operators', () => {
    expect(types('= += -= *= /=')).toEqual([
      TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN,
      TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN,
    ]);
  });

  test('arrows', () => {
    expect(types('=> ->')).toEqual([TokenType.ARROW, TokenType.THIN_ARROW]);
  });

  test('pipe operator', () => {
    expect(types('|>')).toEqual([TokenType.PIPE]);
  });

  test('dot variants', () => {
    expect(types('. .. ..= ...')).toEqual([
      TokenType.DOT, TokenType.DOT_DOT,
      TokenType.DOT_DOT_EQUAL, TokenType.SPREAD,
    ]);
  });

  test('colon variants', () => {
    expect(types(': ::')).toEqual([TokenType.COLON, TokenType.DOUBLE_COLON]);
  });

  test('optional chaining', () => {
    expect(types('?.')).toEqual([TokenType.QUESTION_DOT]);
    expect(types('?')).toEqual([TokenType.QUESTION]);
  });

  test('null coalescing', () => {
    expect(types('??')).toEqual([TokenType.QUESTION_QUESTION]);
  });

  test('?? vs ?. vs ? disambiguation', () => {
    expect(types('a ?? b')).toEqual([
      TokenType.IDENTIFIER, TokenType.QUESTION_QUESTION, TokenType.IDENTIFIER,
    ]);
    expect(types('a?.b')).toEqual([
      TokenType.IDENTIFIER, TokenType.QUESTION_DOT, TokenType.IDENTIFIER,
    ]);
    expect(types('a?')).toEqual([
      TokenType.IDENTIFIER, TokenType.QUESTION,
    ]);
  });
});

describe('Lexer — Delimiters', () => {
  test('all delimiters', () => {
    expect(types('( ) { } [ ] , ;')).toEqual([
      TokenType.LPAREN, TokenType.RPAREN,
      TokenType.LBRACE, TokenType.RBRACE,
      TokenType.LBRACKET, TokenType.RBRACKET,
      TokenType.COMMA, TokenType.SEMICOLON,
    ]);
  });
});

describe('Lexer — Comments', () => {
  test('line comments are discarded', () => {
    const tokens = lex('x = 1 // this is a comment');
    const nonNewline = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonNewline.length).toBe(3);
  });

  test('block comments are discarded', () => {
    const tokens = lex('x /* comment */ = 1');
    const nonNewline = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonNewline.length).toBe(3);
  });

  test('docstrings are preserved', () => {
    const tokens = lex('/// This is a doc comment');
    expect(tokens[0].type).toBe(TokenType.DOCSTRING);
    expect(tokens[0].value).toBe('This is a doc comment');
  });

  test('nested block comments', () => {
    const tokens = lex('x /* outer /* inner */ still comment */ = 1');
    const nonNewline = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonNewline.length).toBe(3);
  });
});

describe('Lexer — Complex expressions', () => {
  test('function declaration', () => {
    expect(types('fn add(a, b) { a + b }')).toEqual([
      TokenType.FN, TokenType.IDENTIFIER, TokenType.LPAREN,
      TokenType.IDENTIFIER, TokenType.COMMA, TokenType.IDENTIFIER,
      TokenType.RPAREN, TokenType.LBRACE, TokenType.IDENTIFIER,
      TokenType.PLUS, TokenType.IDENTIFIER, TokenType.RBRACE,
    ]);
  });

  test('immutable assignment', () => {
    expect(types('x = 42')).toEqual([
      TokenType.IDENTIFIER, TokenType.ASSIGN, TokenType.NUMBER,
    ]);
  });

  test('mutable variable', () => {
    expect(types('var x = 42')).toEqual([
      TokenType.VAR, TokenType.IDENTIFIER, TokenType.ASSIGN, TokenType.NUMBER,
    ]);
  });

  test('let destructuring', () => {
    expect(types('let { name, age } = user')).toEqual([
      TokenType.LET, TokenType.LBRACE, TokenType.IDENTIFIER,
      TokenType.COMMA, TokenType.IDENTIFIER, TokenType.RBRACE,
      TokenType.ASSIGN, TokenType.IDENTIFIER,
    ]);
  });

  test('pipe expression', () => {
    expect(types('data |> filter(x) |> map(y)')).toEqual([
      TokenType.IDENTIFIER, TokenType.PIPE,
      TokenType.IDENTIFIER, TokenType.LPAREN, TokenType.IDENTIFIER, TokenType.RPAREN,
      TokenType.PIPE,
      TokenType.IDENTIFIER, TokenType.LPAREN, TokenType.IDENTIFIER, TokenType.RPAREN,
    ]);
  });

  test('server block', () => {
    expect(types('server { }')).toEqual([
      TokenType.SERVER, TokenType.LBRACE, TokenType.RBRACE,
    ]);
  });

  test('route declaration', () => {
    expect(types('route GET "/api/users" => get_users')).toEqual([
      TokenType.ROUTE, TokenType.IDENTIFIER, TokenType.STRING,
      TokenType.ARROW, TokenType.IDENTIFIER,
    ]);
  });

  test('typed function', () => {
    expect(types('fn add(a: Int, b: Int) -> Int')).toEqual([
      TokenType.FN, TokenType.IDENTIFIER, TokenType.LPAREN,
      TokenType.IDENTIFIER, TokenType.COLON, TokenType.IDENTIFIER,
      TokenType.COMMA, TokenType.IDENTIFIER, TokenType.COLON,
      TokenType.IDENTIFIER, TokenType.RPAREN, TokenType.THIN_ARROW,
      TokenType.IDENTIFIER,
    ]);
  });

  test('match expression', () => {
    const src = 'match x { 0 => "zero", _ => "other" }';
    const toks = types(src);
    expect(toks[0]).toBe(TokenType.MATCH);
    expect(toks).toContain(TokenType.ARROW);
  });

  test('line and column tracking', () => {
    const tokens = lex('x = 1\ny = 2');
    const xTok = tokens[0];
    expect(xTok.line).toBe(1);
    expect(xTok.column).toBe(1);
    const yTok = tokens.find(t => t.value === 'y');
    expect(yTok.line).toBe(2);
    expect(yTok.column).toBe(1);
  });
});
