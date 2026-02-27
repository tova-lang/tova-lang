import { describe, test, expect } from 'bun:test';
import { ConcurrentBlock, SpawnExpression } from '../src/parser/concurrency-ast.js';

describe('concurrency AST nodes', () => {
    test('ConcurrentBlock has correct structure', () => {
        const block = new ConcurrentBlock('all', null, [], { line: 1, column: 0 });
        expect(block.type).toBe('ConcurrentBlock');
        expect(block.mode).toBe('all');
        expect(block.timeout).toBeNull();
        expect(block.body).toEqual([]);
        expect(block.loc).toEqual({ line: 1, column: 0 });
    });

    test('ConcurrentBlock cancel_on_error mode', () => {
        const block = new ConcurrentBlock('cancel_on_error', null, [], { line: 1, column: 0 });
        expect(block.mode).toBe('cancel_on_error');
    });

    test('ConcurrentBlock with timeout', () => {
        const timeout = { type: 'NumberLiteral', value: 5000 };
        const block = new ConcurrentBlock('all', timeout, [], { line: 1, column: 0 });
        expect(block.timeout).toEqual(timeout);
    });

    test('SpawnExpression has correct structure', () => {
        const callee = { type: 'Identifier', name: 'foo' };
        const args = [{ type: 'NumberLiteral', value: 42 }];
        const spawn = new SpawnExpression(callee, args, { line: 1, column: 0 });
        expect(spawn.type).toBe('SpawnExpression');
        expect(spawn.callee).toBe(callee);
        expect(spawn.arguments).toBe(args);
    });

    test('SpawnExpression with lambda body', () => {
        const callee = { type: 'LambdaExpression', params: [], body: [] };
        const spawn = new SpawnExpression(callee, [], { line: 2, column: 4 });
        expect(spawn.type).toBe('SpawnExpression');
        expect(spawn.callee.type).toBe('LambdaExpression');
    });
});
