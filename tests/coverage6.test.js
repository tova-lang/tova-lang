// Final function coverage tests
import { describe, test, expect } from 'bun:test';
import { Token, TokenType, Keywords } from '../src/lexer/tokens.js';
import { Lexer } from '../src/lexer/lexer.js';
import { SharedCodegen } from '../src/codegen/shared-codegen.js';
import { ServerCodegen } from '../src/codegen/server-codegen.js';
import { ClientCodegen } from '../src/codegen/client-codegen.js';
import { print } from '../src/stdlib/core.js';
import { capitalize } from '../src/stdlib/string.js';

// ─── Token.toString() ────────────────────────────────────
describe('Token — toString', () => {
  test('Token.toString() returns formatted string', () => {
    const t = new Token(TokenType.NUMBER, 42, 1, 5);
    const str = t.toString();
    expect(str).toContain('NUMBER');
    expect(str).toContain('42');
    expect(str).toContain('1:5');
  });
});

// ─── Keywords object ─────────────────────────────────────
describe('Keywords', () => {
  test('Keywords maps strings to token types', () => {
    expect(Keywords['if']).toBe(TokenType.IF);
    expect(Keywords['server']).toBe(TokenType.SERVER);
    expect(Keywords['true']).toBe(TokenType.TRUE);
    expect(Keywords['nil']).toBe(TokenType.NIL);
  });
});

// ─── Lexer.error() ───────────────────────────────────────
describe('Lexer — error function', () => {
  test('Lexer.error() throws with filename and position', () => {
    const lexer = new Lexer('test', 'myfile.lux');
    expect(() => lexer.error('bad token')).toThrow('myfile.lux');
  });
});

// ─── Lexer.addToken() ────────────────────────────────────
describe('Lexer — addToken', () => {
  test('addToken pushes token to array', () => {
    const lexer = new Lexer('', '<test>');
    lexer.addToken(TokenType.NUMBER, 42);
    expect(lexer.tokens.length).toBe(1);
    expect(lexer.tokens[0].type).toBe(TokenType.NUMBER);
  });
});

// ─── SharedCodegen constructor ───────────────────────────
describe('SharedCodegen — constructor', () => {
  test('SharedCodegen instantiates', () => {
    const gen = new SharedCodegen();
    expect(gen).toBeDefined();
    expect(gen.indent).toBe(0);
  });
});

// ─── ServerCodegen constructor ───────────────────────────
describe('ServerCodegen — constructor', () => {
  test('ServerCodegen instantiates', () => {
    const gen = new ServerCodegen();
    expect(gen).toBeDefined();
    expect(gen.indent).toBe(0);
  });
});

// ─── ClientCodegen constructor ───────────────────────────
describe('ClientCodegen — constructor', () => {
  test('ClientCodegen instantiates with stateNames', () => {
    const gen = new ClientCodegen();
    expect(gen).toBeDefined();
    expect(gen.stateNames).toBeDefined();
    expect(gen.stateNames.size).toBe(0);
  });
});

// ─── stdlib print ────────────────────────────────────────
describe('Core — print', () => {
  test('print calls console.log', () => {
    const logs = [];
    const orig = console.log;
    console.log = (...args) => logs.push(args);
    print('hello', 'world');
    console.log = orig;
    expect(logs[0]).toEqual(['hello', 'world']);
  });
});

// ─── stdlib capitalize ───────────────────────────────────
describe('String — capitalize', () => {
  test('capitalize null/undefined returns as-is', () => {
    expect(capitalize(null)).toBeNull();
    expect(capitalize(undefined)).toBeUndefined();
  });
});
