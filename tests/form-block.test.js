import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

describe('Form Block — Lexer', () => {
  test('form keyword produces FORM token', () => {
    const lexer = new Lexer('form');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.FORM);
  });

  test('field keyword produces FIELD token', () => {
    const lexer = new Lexer('field');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.FIELD);
  });

  test('group keyword produces GROUP token', () => {
    const lexer = new Lexer('group');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.GROUP);
  });

  test('steps keyword produces STEPS token', () => {
    const lexer = new Lexer('steps');
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.STEPS);
  });
});
