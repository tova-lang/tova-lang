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

// ─── Malformed Number Literals ──────────────────────────────────

describe('Lexer — Malformed hex/binary/octal numbers', () => {
  test('0x with no digits throws error', () => {
    expect(() => lex('0x')).toThrow('Expected hex digits after 0x');
  });

  test('0x followed by non-hex letter throws error', () => {
    expect(() => lex('0xZZ')).toThrow('Expected hex digits after 0x');
  });

  test('0b with no digits throws error', () => {
    expect(() => lex('0b')).toThrow('Expected binary digits after 0b');
  });

  test('0b with invalid digit 2 throws error', () => {
    expect(() => lex('0b2')).toThrow('Expected binary digits after 0b');
  });

  test('0o with no digits throws error', () => {
    expect(() => lex('0o')).toThrow('Expected octal digits after 0o');
  });

  test('0o with invalid digit 9 throws error', () => {
    expect(() => lex('0o9')).toThrow('Expected octal digits after 0o');
  });

  test('0o with digit 8 throws error', () => {
    expect(() => lex('0o8')).toThrow('Expected octal digits after 0o');
  });

  test('0x with valid then invalid digits', () => {
    // 0xFFGG: FF is valid hex, GG is identifier
    const tokens = lex('0xFFGG');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(255);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[1].value).toBe('GG');
  });

  test('0b with valid then invalid digits', () => {
    // 0b1012: 101 is valid binary, 2 is separate number
    const tokens = lex('0b1012');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(5); // 0b101 = 5
    expect(tokens[1].type).toBe(TokenType.NUMBER);
    expect(tokens[1].value).toBe(2);
  });

  test('0X uppercase hex prefix with valid digits', () => {
    expect(values('0XDEAD')).toEqual([0xDEAD]);
  });

  test('0B uppercase binary prefix', () => {
    expect(values('0B0000')).toEqual([0]);
  });

  test('0O uppercase octal prefix', () => {
    expect(values('0O0')).toEqual([0]);
  });
});

// ─── Float and Exponent Edge Cases ──────────────────────────────

describe('Lexer — Float and exponent edge cases', () => {
  test('number followed by dot then alpha parses as float then identifier', () => {
    // 42.abc => lexer sees 42, then '.' with peek(1)!='.', so enters decimal
    // but 'a' is not a digit, so "42." => parseFloat = 42
    // then 'abc' is an identifier
    const tokens = lex('42.abc');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
    const ident = tokens.find(t => t.type === TokenType.IDENTIFIER && t.value === 'abc');
    expect(ident).toBeDefined();
  });

  test('float with trailing dot followed by alpha becomes float + dot + ident', () => {
    // 3.14.x => 3.14 . x
    const tokens = lex('3.14.x');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(3.14);
    expect(tokens[1].type).toBe(TokenType.DOT);
    expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
  });

  test('exponent with no digits after e', () => {
    // 1e => number 1, identifier e ... actually the lexer will consume e as part of exponent
    // then parseFloat("1e") = NaN? No, parseFloat("1e") = 1 in JS
    const tokens = lex('1e');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    // parseFloat("1e") in JS returns 1
    expect(tokens[0].value).toBe(1);
  });

  test('exponent with sign but no digits', () => {
    // 1e+ => parseFloat("1e+") = 1 in JS
    const tokens = lex('1e+');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(1);
  });

  test('exponent with negative sign and no digits', () => {
    // 1e- => parseFloat("1e-") = 1 in JS
    const tokens = lex('1e-');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(1);
  });

  test('float with only decimal point, no digits after', () => {
    // 42. followed by space => "42." => parseFloat = 42
    const tokens = lex('42. ');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
  });

  test('zero exponent', () => {
    expect(values('5e0')).toEqual([5]);
  });

  test('large exponent', () => {
    expect(values('1e20')).toEqual([1e20]);
  });

  test('negative exponent makes small number', () => {
    expect(values('1e-10')).toEqual([1e-10]);
  });

  test('float with exponent', () => {
    expect(values('1.5e3')).toEqual([1500]);
  });

  test('float exponent with negative sign', () => {
    expect(values('2.5E-1')).toEqual([0.25]);
  });

  test('integer 0 followed by dot dot is range', () => {
    const tokens = lex('0..5');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(0);
    expect(tokens[1].type).toBe(TokenType.DOT_DOT);
    expect(tokens[2].type).toBe(TokenType.NUMBER);
    expect(tokens[2].value).toBe(5);
  });

  test('number with underscore in decimal part', () => {
    // Underscore in decimal: 1._5 => the _ is consumed as part of decimal digits
    // parseFloat("1.5") = 1.5
    expect(values('1._5')).toEqual([1.5]);
  });
});

// ─── String Interpolation Edge Cases ────────────────────────────

describe('Lexer — String interpolation additional edge cases', () => {
  test('empty interpolation {}', () => {
    // "{}" should create a template with one expr part containing no tokens
    const tokens = lex('"{}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(1);
    expect(parts[0].type).toBe('expr');
    expect(parts[0].tokens.length).toBe(0);
  });

  test('interpolation with array literal', () => {
    const tokens = lex('"{[1, 2, 3]}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts[0].type).toBe('expr');
  });

  test('interpolation with string inside', () => {
    const tokens = lex('"{greet("world")}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('multiple consecutive interpolations', () => {
    const tokens = lex('"{a}{b}{c}{d}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    expect(tokens[0].value.length).toBe(4);
    expect(tokens[0].value.every(p => p.type === 'expr')).toBe(true);
  });

  test('interpolation with deeply nested braces', () => {
    const tokens = lex('"{ {a: {b: 1}} }"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('text only string with special chars (no interpolation)', () => {
    const tokens = lex('"hello! @#$ world"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('hello! @#$ world');
  });

  test('single-quoted string has no interpolation', () => {
    const tokens = lex("'{name}'");
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('{name}');
  });

  test('interpolation preserves surrounding text', () => {
    const tokens = lex('"prefix{x}middle{y}suffix"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    expect(parts.length).toBe(5);
    expect(parts[0]).toEqual({ type: 'text', value: 'prefix' });
    expect(parts[1].type).toBe('expr');
    expect(parts[2]).toEqual({ type: 'text', value: 'middle' });
    expect(parts[3].type).toBe('expr');
    expect(parts[4]).toEqual({ type: 'text', value: 'suffix' });
  });
});

// ─── _isJSXStart() Heuristic Edge Cases ─────────────────────────

describe('Lexer — _isJSXStart() heuristic edge cases', () => {
  test('< after false is comparison not JSX', () => {
    const toks = types('false < x');
    expect(toks).toEqual([TokenType.FALSE, TokenType.LESS, TokenType.IDENTIFIER]);
  });

  test('< after STRING_TEMPLATE is comparison not JSX', () => {
    // STRING_TEMPLATE before < should be treated as value
    const tokens = lex('"{x}" < 5');
    const lessIdx = tokens.findIndex(t => t.type === TokenType.LESS);
    expect(lessIdx).toBeGreaterThan(0);
  });

  test('< after keyword return allows JSX', () => {
    // return <div> -- return is not in valueTypes, so JSX is allowed
    const tokens = lex('return <div>text</div>');
    // Should have JSX_TEXT
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< after = (assign) allows JSX', () => {
    const tokens = lex('x = <span>hello</span>');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< after ( allows JSX', () => {
    const tokens = lex('foo(<div>hi</div>)');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< after , allows JSX', () => {
    const tokens = lex('[1, <p>text</p>]');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< after { allows JSX', () => {
    const tokens = lex('{x: <div>content</div>}');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< with non-alpha next char is always LESS', () => {
    // < followed by a digit - not JSX
    const toks = types('x < 5');
    expect(toks).toContain(TokenType.LESS);
  });

  test('< at very start of file is JSX if followed by alpha', () => {
    const tokens = lex('<div>hello</div>');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< after => allows JSX', () => {
    const tokens = lex('fn(x) => <span>result</span>');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
  });

  test('< after binary operator allows JSX', () => {
    const tokens = lex('x + <span>y</span>');
    // + is not in valueTypes, so should detect JSX
    expect(tokens.some(t => t.value === 'span')).toBe(true);
  });
});

// ─── JSX Control Flow Brace Tracking ────────────────────────────

describe('Lexer — JSX control flow brace depth tracking', () => {
  test('JSX if with simple condition and body', () => {
    const tokens = lex('x = <div>if true { <span /> }</div>');
    expect(tokens.some(t => t.type === TokenType.IF)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.TRUE)).toBe(true);
  });

  test('JSX for with destructuring', () => {
    const tokens = lex('x = <ul>for item in items { <li>{item}</li> }</ul>');
    expect(tokens.some(t => t.type === TokenType.FOR)).toBe(true);
  });

  test('JSX control flow with expression braces in condition (key={val})', () => {
    // In JSX, after 'for', { in `key={val}` is expression brace, not block opener
    const tokens = lex('x = <div>for item in items { <li key={item.id}>text</li> }</div>');
    expect(tokens.some(t => t.type === TokenType.FOR)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT && t.value === 'text')).toBe(true);
  });

  test('JSX if-elif-else sequence', () => {
    const tokens = lex('x = <div>if a { <span /> } elif b { <em /> } else { <strong /> }</div>');
    expect(tokens.some(t => t.type === TokenType.IF)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.ELIF)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.ELSE)).toBe(true);
  });

  test('JSX with nested braces in expression child', () => {
    const tokens = lex('x = <div>{{a: 1, b: 2}}</div>');
    // Expression depth should track the nested {} correctly
    expect(tokens.some(t => t.type === TokenType.LBRACE)).toBe(true);
  });

  test('JSX brackets in control flow condition', () => {
    const tokens = lex('x = <ul>for item in [1, 2, 3] { <li /> }</ul>');
    expect(tokens.some(t => t.type === TokenType.FOR)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.LBRACKET)).toBe(true);
  });

  test('JSX parens in control flow condition', () => {
    const tokens = lex('x = <div>if (a and b) { <span /> }</div>');
    expect(tokens.some(t => t.type === TokenType.IF)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.LPAREN)).toBe(true);
  });

  test('cfblock pop on closing brace', () => {
    // After the } of a control flow block, should be back in JSX children mode
    const tokens = lex('x = <div>if true { <a /> } some text</div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT && t.value.includes('some text'));
    expect(text).toBeDefined();
  });

  test('multiple control flow blocks in same parent', () => {
    const tokens = lex('x = <div>if a { <span /> } if b { <em /> }</div>');
    const ifTokens = tokens.filter(t => t.type === TokenType.IF);
    expect(ifTokens.length).toBe(2);
  });
});

// ─── _scanJSXText Edge Cases ────────────────────────────────────

describe('Lexer — _scanJSXText edge cases', () => {
  test('JSX text stops at keyword after whitespace', () => {
    const tokens = lex('x = <div>hello for item in items { <span /> }</div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value.trim()).toBe('hello');
  });

  test('JSX text with no keywords continues until structural char', () => {
    const tokens = lex('x = <div>hello world foo bar</div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toContain('hello world foo bar');
  });

  test('JSX text stops at opening brace', () => {
    const tokens = lex('x = <div>text{expr}</div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toBe('text');
  });

  test('JSX text stops at less-than (child element)', () => {
    const tokens = lex('x = <div>text<span /></div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toBe('text');
  });

  test('JSX text stops at double-quote', () => {
    const tokens = lex('x = <p>text"quoted"</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toBe('text');
  });

  test('JSX text stops at single-quote', () => {
    const tokens = lex("x = <p>text'quoted'</p>");
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toBe('text');
  });

  test('JSX text containing elif-like word that is not a keyword', () => {
    // "belief" contains "elif" backwards but is not a keyword
    const tokens = lex('x = <p>belief</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toBe('belief');
  });

  test('JSX text with numbers', () => {
    const tokens = lex('x = <p>123 items</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toContain('123 items');
  });

  test('JSX text with special characters', () => {
    const tokens = lex('x = <p>Hello! Welcome.</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    expect(text.value).toContain('Hello! Welcome.');
  });
});

// ─── _scanInJSXChildren Whitespace Skipping ─────────────────────

describe('Lexer — _scanInJSXChildren whitespace skipping', () => {
  test('whitespace before < is skipped (no JSX_TEXT)', () => {
    const tokens = lex('x = <div>   <span /></div>');
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });

  test('whitespace before { is skipped', () => {
    const tokens = lex('x = <div>   {value}</div>');
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });

  test('whitespace before } (cfblock close) is skipped', () => {
    const tokens = lex('x = <div>if true { <span />   }</div>');
    // No trailing whitespace text token
    const texts = tokens.filter(t => t.type === TokenType.JSX_TEXT && t.value.trim() === '');
    expect(texts.length).toBe(0);
  });

  test('whitespace before " is skipped', () => {
    const tokens = lex('x = <p>   "quoted"</p>');
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });

  test('whitespace before keyword is skipped (keyword detected)', () => {
    const tokens = lex('x = <div>   if true { <span /> }</div>');
    expect(tokens.some(t => t.type === TokenType.IF)).toBe(true);
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });

  test('whitespace before non-keyword text becomes part of JSX_TEXT', () => {
    const tokens = lex('x = <p>   hello world</p>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT);
    expect(text).toBeDefined();
    // The whitespace should be consumed, then text starts
    expect(text.value).toContain('hello world');
  });

  test('whitespace-only between opening and closing tag produces no text', () => {
    const tokens = lex('x = <div>   </div>');
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });

  test('newlines between JSX children are skipped', () => {
    const tokens = lex('x = <div>\n  <span />\n  <em />\n</div>');
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });
});

// ─── Style Block Edge Cases ─────────────────────────────────────

describe('Lexer — Style block restoration edge cases', () => {
  test('style as function call (not followed by {)', () => {
    const tokens = lex('style(arg)');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style');
    expect(tokens[1].type).toBe(TokenType.LPAREN);
  });

  test('style followed by = (variable assignment)', () => {
    const tokens = lex('style = "bold"');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style');
    expect(tokens[1].type).toBe(TokenType.ASSIGN);
  });

  test('style followed by . (member access)', () => {
    const tokens = lex('style.property');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style');
    expect(tokens[1].type).toBe(TokenType.DOT);
    expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[2].value).toBe('property');
  });

  test('style block with empty CSS', () => {
    const tokens = lex('style { }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
    expect(style.value).toBe('');
  });

  test('style block with deeply nested braces', () => {
    const tokens = lex('style { .a { .b { .c { color: red } } } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
    expect(style.value).toContain('.a');
    expect(style.value).toContain('.c');
  });

  test('position/line/col restored when style is not followed by {', () => {
    // After checking and finding no {, position should be restored
    // The token after style should have correct line/column
    const tokens = lex('style + 1');
    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].value).toBe('style');
    expect(tokens[1].type).toBe(TokenType.PLUS);
    // Verify column is correct (style is 5 chars, so + should be at col 7)
    expect(tokens[1].column).toBe(7);
  });

  test('style with tab before {', () => {
    const tokens = lex('style\t{ .foo { color: red } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
  });

  test('style with CR+LF before {', () => {
    const tokens = lex('style\r\n{ .foo { color: red } }');
    const style = tokens.find(t => t.type === TokenType.STYLE_BLOCK);
    expect(style).toBeDefined();
  });
});

// ─── JSX Tag State Transitions ──────────────────────────────────

describe('Lexer — JSX tag state transitions', () => {
  test('self-closing tag does not push to stack', () => {
    // After <br/>, should be back in parent's children mode
    const tokens = lex('x = <div><br />text after</div>');
    const text = tokens.find(t => t.type === TokenType.JSX_TEXT && t.value.includes('text after'));
    expect(text).toBeDefined();
  });

  test('closing tag pops from stack correctly', () => {
    // After </span>, should still be in <div> children mode
    const tokens = lex('x = <div><span>inner</span>outer</div>');
    const texts = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(texts.some(t => t.value === 'inner')).toBe(true);
    expect(texts.some(t => t.value === 'outer')).toBe(true);
  });

  test('multiple nested elements with correct stack management', () => {
    const tokens = lex('x = <div><a><b>deep</b>mid</a>top</div>');
    const texts = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(texts.some(t => t.value === 'deep')).toBe(true);
    expect(texts.some(t => t.value === 'mid')).toBe(true);
    expect(texts.some(t => t.value === 'top')).toBe(true);
  });

  test('JSX expression child with nested JSX', () => {
    // Inside {}, the lexer enters expression mode, so nested JSX text scanning may not apply
    const tokens = lex('x = <div>{<span>nested</span>}</div>');
    // The inner span should still lex correctly with identifiers
    expect(tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'span')).toBe(true);
  });

  test('JSX with mixed children types', () => {
    const tokens = lex('x = <div>text <span />{expr}"quoted"</div>');
    expect(tokens.some(t => t.type === TokenType.JSX_TEXT)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.STRING)).toBe(true);
  });

  test('empty JSX element', () => {
    const tokens = lex('x = <div></div>');
    const textTokens = tokens.filter(t => t.type === TokenType.JSX_TEXT);
    expect(textTokens.length).toBe(0);
  });

  test('JSX with only self-closing children', () => {
    const tokens = lex('x = <div><br /><hr /><input /></div>');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids.some(t => t.value === 'br')).toBe(true);
    expect(ids.some(t => t.value === 'hr')).toBe(true);
    expect(ids.some(t => t.value === 'input')).toBe(true);
  });
});

// ─── JSX Attribute Context ──────────────────────────────────────

describe('Lexer — JSX attribute context', () => {
  test('JSX tag with string attribute', () => {
    const tokens = lex('x = <div class="main">text</div>');
    expect(tokens.some(t => t.type === TokenType.STRING && t.value === 'main')).toBe(true);
  });

  test('JSX tag with expression attribute', () => {
    const tokens = lex('x = <div class={cls}>text</div>');
    expect(tokens.some(t => t.type === TokenType.IDENTIFIER && t.value === 'cls')).toBe(true);
  });

  test('JSX tag with namespaced attribute', () => {
    const tokens = lex('x = <button on:click={handler}>text</button>');
    expect(tokens.some(t => t.type === TokenType.COLON)).toBe(true);
  });

  test('JSX with multiple attributes', () => {
    const tokens = lex('x = <input type="text" value={val} disabled />');
    expect(tokens.some(t => t.value === 'type')).toBe(true);
    expect(tokens.some(t => t.value === 'value')).toBe(true);
    expect(tokens.some(t => t.value === 'disabled')).toBe(true);
  });

  test('JSX with spread attribute', () => {
    const tokens = lex('x = <div {...props}>text</div>');
    expect(tokens.some(t => t.type === TokenType.SPREAD)).toBe(true);
  });
});

// ─── Ampersand and Pipe in JSX ──────────────────────────────────

describe('Lexer — & and | edge cases in JSX', () => {
  test('&& in normal context is AND_AND', () => {
    const tokens = lex('a && b');
    expect(tokens.some(t => t.type === TokenType.AND_AND)).toBe(true);
  });

  test('|| in normal context is OR_OR', () => {
    const tokens = lex('a || b');
    expect(tokens.some(t => t.type === TokenType.OR_OR)).toBe(true);
  });

  test('single | with > is pipe', () => {
    const tokens = lex('x |> y');
    expect(tokens.some(t => t.type === TokenType.PIPE)).toBe(true);
  });

  test('single | without > is valid BAR token', () => {
    const tokens = new Lexer('a | b', '<test>').tokenize();
    expect(tokens.some(t => t.type === 'BAR')).toBe(true);
  });

  test('single & without & throws outside JSX', () => {
    expect(lexThrows('a & b')).toThrow(/Unexpected character.*&/);
  });
});

// ─── Slash in JSX Context ───────────────────────────────────────

describe('Lexer — Slash in JSX context', () => {
  test('slash in self-closing tag sets _jsxSelfClosing', () => {
    const tokens = lex('x = <br />');
    // br should be an identifier, / should be SLASH
    expect(tokens.some(t => t.value === 'br')).toBe(true);
    expect(tokens.some(t => t.type === TokenType.SLASH)).toBe(true);
  });

  test('slash-assign is not confused with self-closing', () => {
    const tokens = lex('x /= 2');
    expect(tokens.some(t => t.type === TokenType.SLASH_ASSIGN)).toBe(true);
  });
});

// ─── Error Message Format ───────────────────────────────────────

describe('Lexer — Error message format', () => {
  test('error includes filename', () => {
    try {
      const lexer = new Lexer('@', 'myfile.tova');
      lexer.tokenize();
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e.message).toContain('myfile.tova');
    }
  });

  test('error includes line number', () => {
    try {
      lex('\n\n@');
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toContain(':3:');
    }
  });

  test('error includes column number', () => {
    try {
      lex('   @');
      expect(true).toBe(false);
    } catch (e) {
      // Column is 5 because advance() increments before error
      expect(e.message).toContain(':1:5');
    }
  });

  test('unterminated string error on correct line', () => {
    try {
      lex('x = 1\ny = "unterminated');
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toContain(':2:');
      expect(e.message).toContain('Unterminated string');
    }
  });

  test('unterminated block comment error', () => {
    try {
      lex('/* never closed');
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toContain('Unterminated block comment');
    }
  });
});

// ─── Complex Multi-Feature Scenarios ────────────────────────────

describe('Lexer — Complex multi-feature tokenization', () => {
  test('full component with state, JSX, events, and styles', () => {
    const src = `client {
  component Counter(initial: Int = 0) {
    state count = initial
    computed doubled = count * 2

    <div class="counter">
      <h1>"Count: {count}"</h1>
      <button on:click={fn() { count += 1 }}>Increment</button>
    </div>

    style { .counter { padding: 16px } }
  }
}`;
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.CLIENT)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.COMPONENT)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.STATE)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.COMPUTED)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.STYLE_BLOCK)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.STRING_TEMPLATE)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.COLON)).toBe(true); // on:click
  });

  test('server block with routes and middleware', () => {
    const src = `server {
  route GET "/api/users" => fn(req) {
    respond(users)
  }
  route POST "/api/users" => fn(req) {
    var user = req.body
    respond(user)
  }
}`;
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.SERVER)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.ROUTE)).toBe(true);
    expect(tokens.filter(t => t.type === TokenType.ROUTE).length).toBe(2);
  });

  test('shared block with type declarations', () => {
    const src = `shared {
  type Shape {
    Circle(radius: Float)
    Rectangle(width: Float, height: Float)
  }
  type Option<T> {
    Some(value: T)
    None
  }
}`;
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.SHARED)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.TYPE)).toBe(true);
    expect(tokens.filter(t => t.type === TokenType.TYPE).length).toBe(2);
  });

  test('match with all pattern types', () => {
    const src = `match value {
  0 => "zero"
  1..10 => "small"
  Circle(r) => "circle"
  [a, b] => "pair"
  _ => "other"
}`;
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.MATCH)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.DOT_DOT)).toBe(true);
    expect(tokens.filter(t => t.type === TokenType.ARROW).length).toBe(5);
  });

  test('try-catch with error propagation', () => {
    const src = `fn risky() {
  result = try_something()?
  try {
    dangerous()
  } catch(e) {
    Err(e)
  }
}`;
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.TRY)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.CATCH)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.QUESTION)).toBe(true);
  });

  test('pipe chain with optional chaining and null coalescing', () => {
    const src = 'data?.items |> filter(fn(x) x > 0) |> map(fn(x) x * 2) ?? []';
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.QUESTION_DOT)).toBe(true);
    expect(tokens.filter(t => t.type === TokenType.PIPE).length).toBe(2);
    expect(tokens.some(t => t.type === TokenType.QUESTION_QUESTION)).toBe(true);
  });

  test('destructuring with defaults', () => {
    const src = 'let { name, age: userAge = 0 } = user\nlet [first, ...rest] = items';
    const tokens = lex(src);
    expect(tokens.filter(t => t.type === TokenType.LET).length).toBe(2);
    expect(tokens.some(t => t.type === TokenType.SPREAD)).toBe(true);
  });

  test('for-in with multiple variables', () => {
    const src = 'for key, value in entries(obj) { print("{key}: {value}") }';
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.FOR)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.IN)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.COMMA)).toBe(true);
  });

  test('list and dict comprehensions', () => {
    const src = '[x * 2 for x in range(10)]';
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.FOR)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.IN)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.LBRACKET)).toBe(true);
  });

  test('import with alias', () => {
    const src = 'import { map as m, filter as f } from "stdlib"';
    const tokens = lex(src);
    expect(tokens.some(t => t.type === TokenType.IMPORT)).toBe(true);
    expect(tokens.some(t => t.type === TokenType.FROM)).toBe(true);
    expect(tokens.filter(t => t.type === TokenType.AS).length).toBe(2);
  });
});

// ─── peek() and advance() Boundary Conditions ──────────────────

describe('Lexer — Utility method edge cases', () => {
  test('peek beyond source length returns null char', () => {
    const lexer = new Lexer('a', '<test>');
    expect(lexer.peek(0)).toBe('a');
    expect(lexer.peek(1)).toBe('\0');
    expect(lexer.peek(100)).toBe('\0');
  });

  test('advance tracks line and column across newlines', () => {
    const lexer = new Lexer('ab\ncd', '<test>');
    expect(lexer.line).toBe(1);
    expect(lexer.column).toBe(1);
    lexer.advance(); // a
    expect(lexer.column).toBe(2);
    lexer.advance(); // b
    expect(lexer.column).toBe(3);
    lexer.advance(); // \n
    expect(lexer.line).toBe(2);
    expect(lexer.column).toBe(1);
    lexer.advance(); // c
    expect(lexer.column).toBe(2);
  });

  test('match returns true and advances on expected char', () => {
    const lexer = new Lexer('ab', '<test>');
    expect(lexer.match('a')).toBe(true);
    expect(lexer.pos).toBe(1);
  });

  test('match returns false and does not advance on mismatch', () => {
    const lexer = new Lexer('ab', '<test>');
    expect(lexer.match('b')).toBe(false);
    expect(lexer.pos).toBe(0);
  });

  test('match at end of source returns false', () => {
    const lexer = new Lexer('', '<test>');
    expect(lexer.match('a')).toBe(false);
  });

  test('isDigit boundary cases', () => {
    const lexer = new Lexer('', '<test>');
    expect(lexer.isDigit('0')).toBe(true);
    expect(lexer.isDigit('9')).toBe(true);
    expect(lexer.isDigit('a')).toBe(false);
    expect(lexer.isDigit('/')).toBe(false);
    expect(lexer.isDigit(':')).toBe(false);
  });

  test('isAlpha boundary cases', () => {
    const lexer = new Lexer('', '<test>');
    expect(lexer.isAlpha('a')).toBe(true);
    expect(lexer.isAlpha('z')).toBe(true);
    expect(lexer.isAlpha('A')).toBe(true);
    expect(lexer.isAlpha('Z')).toBe(true);
    expect(lexer.isAlpha('_')).toBe(true);
    expect(lexer.isAlpha('0')).toBe(false);
    expect(lexer.isAlpha(' ')).toBe(false);
    expect(lexer.isAlpha('$')).toBe(false);
  });

  test('isAlphaNumeric combines digit and alpha', () => {
    const lexer = new Lexer('', '<test>');
    expect(lexer.isAlphaNumeric('a')).toBe(true);
    expect(lexer.isAlphaNumeric('0')).toBe(true);
    expect(lexer.isAlphaNumeric('_')).toBe(true);
    expect(lexer.isAlphaNumeric(' ')).toBe(false);
  });

  test('isWhitespace identifies space, tab, CR but not newline', () => {
    const lexer = new Lexer('', '<test>');
    expect(lexer.isWhitespace(' ')).toBe(true);
    expect(lexer.isWhitespace('\t')).toBe(true);
    expect(lexer.isWhitespace('\r')).toBe(true);
    expect(lexer.isWhitespace('\n')).toBe(false);
    expect(lexer.isWhitespace('a')).toBe(false);
  });
});

// ─── Token Type Coverage ────────────────────────────────────────

describe('Lexer — Token type completeness', () => {
  test('all keyword tokens can be lexed', () => {
    const keywordMap = {
      'var': TokenType.VAR, 'let': TokenType.LET, 'fn': TokenType.FN,
      'return': TokenType.RETURN, 'if': TokenType.IF, 'elif': TokenType.ELIF,
      'else': TokenType.ELSE, 'for': TokenType.FOR, 'while': TokenType.WHILE,
      'match': TokenType.MATCH, 'type': TokenType.TYPE, 'import': TokenType.IMPORT,
      'from': TokenType.FROM, 'export': TokenType.EXPORT, 'as': TokenType.AS,
      'and': TokenType.AND, 'or': TokenType.OR, 'not': TokenType.NOT,
      'in': TokenType.IN, 'true': TokenType.TRUE, 'false': TokenType.FALSE,
      'nil': TokenType.NIL, 'server': TokenType.SERVER, 'client': TokenType.CLIENT,
      'shared': TokenType.SHARED, 'route': TokenType.ROUTE, 'state': TokenType.STATE,
      'computed': TokenType.COMPUTED, 'effect': TokenType.EFFECT,
      'component': TokenType.COMPONENT, 'store': TokenType.STORE,
      'try': TokenType.TRY, 'catch': TokenType.CATCH,
    };
    for (const [keyword, expectedType] of Object.entries(keywordMap)) {
      const tokens = lex(keyword);
      expect(tokens[0].type).toBe(expectedType);
      expect(tokens[0].value).toBe(keyword);
    }
  });

  test('all operator tokens can be lexed', () => {
    const operators = [
      ['+', TokenType.PLUS], ['-', TokenType.MINUS], ['*', TokenType.STAR],
      ['/', TokenType.SLASH], ['%', TokenType.PERCENT], ['**', TokenType.POWER],
      ['=', TokenType.ASSIGN], ['==', TokenType.EQUAL], ['!=', TokenType.NOT_EQUAL],
      ['<', TokenType.LESS], ['<=', TokenType.LESS_EQUAL],
      ['>', TokenType.GREATER], ['>=', TokenType.GREATER_EQUAL],
      ['&&', TokenType.AND_AND], ['||', TokenType.OR_OR], ['!', TokenType.BANG],
      ['+=', TokenType.PLUS_ASSIGN], ['-=', TokenType.MINUS_ASSIGN],
      ['*=', TokenType.STAR_ASSIGN], ['/=', TokenType.SLASH_ASSIGN],
      ['=>', TokenType.ARROW], ['->', TokenType.THIN_ARROW],
      ['|>', TokenType.PIPE], ['.', TokenType.DOT], ['..', TokenType.DOT_DOT],
      ['..=', TokenType.DOT_DOT_EQUAL], ['...', TokenType.SPREAD],
      [':', TokenType.COLON], ['::', TokenType.DOUBLE_COLON],
      ['?.', TokenType.QUESTION_DOT], ['??', TokenType.QUESTION_QUESTION],
      ['?', TokenType.QUESTION],
    ];
    for (const [op, expectedType] of operators) {
      const tokens = lex(op);
      const found = tokens.find(t => t.type === expectedType);
      expect(found).toBeDefined();
    }
  });

  test('all delimiter tokens can be lexed', () => {
    const delimiters = [
      ['(', TokenType.LPAREN], [')', TokenType.RPAREN],
      ['{', TokenType.LBRACE], ['}', TokenType.RBRACE],
      ['[', TokenType.LBRACKET], [']', TokenType.RBRACKET],
      [',', TokenType.COMMA], [';', TokenType.SEMICOLON],
    ];
    for (const [delim, expectedType] of delimiters) {
      const tokens = lex(delim);
      expect(tokens[0].type).toBe(expectedType);
    }
  });
});

// ─── Number edge cases with context ─────────────────────────────

describe('Lexer — Numbers in expression context', () => {
  test('number before range operator', () => {
    const tokens = lex('1..10');
    expect(tokens[0].value).toBe(1);
    expect(tokens[1].type).toBe(TokenType.DOT_DOT);
    expect(tokens[2].value).toBe(10);
  });

  test('number before inclusive range', () => {
    const tokens = lex('1..=10');
    expect(tokens[0].value).toBe(1);
    expect(tokens[1].type).toBe(TokenType.DOT_DOT_EQUAL);
    expect(tokens[2].value).toBe(10);
  });

  test('float before comparison', () => {
    const tokens = lex('3.14 < 4.0');
    expect(tokens[0].value).toBe(3.14);
    expect(tokens[1].type).toBe(TokenType.LESS);
    expect(tokens[2].value).toBe(4.0);
  });

  test('hex in expression', () => {
    const tokens = lex('0xFF + 0x01');
    expect(tokens[0].value).toBe(255);
    expect(tokens[1].type).toBe(TokenType.PLUS);
    expect(tokens[2].value).toBe(1);
  });

  test('binary in arithmetic expression', () => {
    const tokens = lex('0b1010 + 0b0101');
    expect(tokens[0].value).toBe(10);
    expect(tokens[1].type).toBe(TokenType.PLUS);
    expect(tokens[2].value).toBe(5);
  });

  test('consecutive numbers separated by comma', () => {
    const tokens = lex('[1, 2.5, 0xFF, 0b101]');
    const nums = tokens.filter(t => t.type === TokenType.NUMBER);
    expect(nums.map(n => n.value)).toEqual([1, 2.5, 255, 5]);
  });
});

// ─── Comment edge cases ─────────────────────────────────────────

describe('Lexer — Comment additional edge cases', () => {
  test('comment immediately after number', () => {
    const tokens = lex('42//comment');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
  });

  test('block comment immediately after number', () => {
    const tokens = lex('42/*comment*/');
    expect(tokens[0].type).toBe(TokenType.NUMBER);
    expect(tokens[0].value).toBe(42);
  });

  test('docstring with no content', () => {
    const tokens = lex('///');
    const doc = tokens.find(t => t.type === TokenType.DOCSTRING);
    expect(doc).toBeDefined();
    expect(doc.value).toBe('');
  });

  test('block comment spanning multiple lines preserves line tracking', () => {
    const tokens = lex('a\n/* line 2\nline 3\nline 4 */\nb');
    const ids = tokens.filter(t => t.type === TokenType.IDENTIFIER);
    expect(ids[0].line).toBe(1); // a
    expect(ids[1].line).toBe(5); // b
  });

  test('block comment with stars inside', () => {
    const tokens = lex('/* * * * */42');
    expect(tokens.find(t => t.type === TokenType.NUMBER).value).toBe(42);
  });

  test('block comment with slashes inside', () => {
    const tokens = lex('/* / // / */42');
    expect(tokens.find(t => t.type === TokenType.NUMBER).value).toBe(42);
  });
});

// ─── String edge cases ──────────────────────────────────────────

describe('Lexer — String additional edge cases', () => {
  test('double-quoted string with all escape types', () => {
    const tokens = lex('"\\n\\t\\r\\\\\\"\\{"');
    expect(tokens[0].value).toBe('\n\t\r\\"{'  );
  });

  test('single-quoted string with carriage return escape', () => {
    const tokens = lex("'\\r'");
    expect(tokens[0].value).toBe('\r');
  });

  test('multiple unknown escape sequences', () => {
    const tokens = lex('"\\a\\b\\c\\d"');
    expect(tokens[0].value).toBe('\\a\\b\\c\\d');
  });

  test('string with only interpolation no text', () => {
    const tokens = lex('"{x}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    expect(tokens[0].value.length).toBe(1);
    expect(tokens[0].value[0].type).toBe('expr');
  });

  test('unterminated double-quoted string throws', () => {
    expect(lexThrows('"hello')).toThrow(/Unterminated string/);
  });

  test('unterminated single-quoted string throws', () => {
    expect(lexThrows("'hello")).toThrow(/Unterminated string/);
  });

  test('string with newline inside (multiline)', () => {
    // Strings can span newlines; they continue until closing quote
    // Actually the lexer reads until " or end of input
    // With a newline, it should still be part of the string
    const tokens = lex('"line1\nline2"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toContain('line1');
  });
});

// ─── JSX with quotes inside children ────────────────────────────

describe('Lexer — JSX children with quotes', () => {
  test('double-quoted string inside JSX children', () => {
    const tokens = lex('x = <p>"Hello World"</p>');
    expect(tokens.some(t => t.type === TokenType.STRING && t.value === 'Hello World')).toBe(true);
  });

  test('single-quoted string inside JSX children', () => {
    const tokens = lex("x = <p>'Hello World'</p>");
    expect(tokens.some(t => t.type === TokenType.STRING && t.value === 'Hello World')).toBe(true);
  });

  test('interpolated string inside JSX children', () => {
    const tokens = lex('x = <p>"Hello {name}"</p>');
    expect(tokens.some(t => t.type === TokenType.STRING_TEMPLATE)).toBe(true);
  });
});

// ─── Constructor and toString coverage ──────────────────────────

describe('Lexer — Constructor and Token metadata', () => {
  test('custom filename propagates to errors', () => {
    try {
      const lexer = new Lexer('@', 'custom/path.tova');
      lexer.tokenize();
    } catch (e) {
      expect(e.message).toContain('custom/path.tova');
    }
  });

  test('default filename is <stdin>', () => {
    try {
      const lexer = new Lexer('@');
      lexer.tokenize();
    } catch (e) {
      expect(e.message).toContain('<stdin>');
    }
  });

  test('tokens have correct line and column for multiline source', () => {
    const tokens = lex('x = 1\n  y = 2\n    z = 3');
    const z = tokens.find(t => t.value === 'z');
    expect(z.line).toBe(3);
    expect(z.column).toBe(5);
  });

  test('addToken stores line and column at call time', () => {
    const lexer = new Lexer('ab', '<test>');
    lexer.addToken(TokenType.IDENTIFIER, 'test');
    expect(lexer.tokens[0].line).toBe(1);
    expect(lexer.tokens[0].column).toBe(1);
  });
});
