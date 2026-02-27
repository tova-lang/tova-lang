import { describe, test, expect } from 'bun:test';
import { ConcurrentBlock } from '../src/parser/ast.js';
import { SpawnExpression } from '../src/parser/concurrency-ast.js';
import { SelectStatement, SelectCase } from '../src/parser/select-ast.js';
import { BlockRegistry } from '../src/registry/register-all.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

function parse(code) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, code);
    return parser.parse();
}

function findNode(ast, type) {
    for (const node of ast.body) {
        if (node.type === type) return node;
    }
    return null;
}

function analyze(code) {
    const ast = parse(code);
    const analyzer = new Analyzer(ast, 'test.tova');
    return analyzer.analyze();
}

function getWarnings(code) {
    try {
        const result = analyze(code);
        return result.warnings || [];
    } catch (e) {
        // If analyzer throws (errors present), warnings are on the error object
        return e.warnings || [];
    }
}

function compileCode(code) {
    const ast = parse(code);
    const result = new CodeGenerator(ast, '<test>').generate();
    return result.shared || '';
}

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

describe('concurrency plugin registration', () => {
    test('concurrency plugin is registered', () => {
        const plugin = BlockRegistry.get('concurrency');
        expect(plugin).toBeDefined();
        expect(plugin.name).toBe('concurrency');
        expect(plugin.astNodeType).toBe('ConcurrentBlock');
    });

    test('ConcurrentBlock maps to concurrency plugin', () => {
        const entry = BlockRegistry.getByAstType('ConcurrentBlock');
        expect(entry).toBeDefined();
        expect(entry.name).toBe('concurrency');
    });

    test('SpawnExpression is registered as noop', () => {
        const isNoop = BlockRegistry.isNoopType('SpawnExpression');
        expect(isNoop).toBe(true);
    });

    test('detection strategy is identifier', () => {
        const plugin = BlockRegistry.get('concurrency');
        expect(plugin.detection.strategy).toBe('identifier');
        expect(plugin.detection.identifierValue).toBe('concurrent');
    });

    test('SelectStatement routed to concurrency plugin', () => {
        const plugin = BlockRegistry.getByAstType('SelectStatement');
        expect(plugin).toBeTruthy();
        expect(plugin.name).toBe('concurrency');
    });

    test('SelectCase is a noop type', () => {
        expect(BlockRegistry.isNoopType('SelectCase')).toBe(true);
    });
});

describe('concurrency parser', () => {
    test('parses basic concurrent block', () => {
        const ast = parse('concurrent { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block).not.toBeNull();
        expect(block.mode).toBe('all');
        expect(block.timeout).toBeNull();
        expect(block.body.length).toBeGreaterThan(0);
    });

    test('parses concurrent cancel_on_error', () => {
        const ast = parse('concurrent cancel_on_error { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block).not.toBeNull();
        expect(block.mode).toBe('cancel_on_error');
    });

    test('parses concurrent first', () => {
        const ast = parse('concurrent first { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.mode).toBe('first');
    });

    test('parses concurrent timeout(ms)', () => {
        const ast = parse('concurrent timeout(5000) { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.mode).toBe('timeout');
        expect(block.timeout).not.toBeNull();
        expect(block.timeout.value).toBe(5000);
    });

    test('parses spawn as expression', () => {
        const ast = parse('concurrent { a = spawn foo(42) }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.body.length).toBe(1);
        const assign = block.body[0];
        expect(assign.type).toBe('Assignment');
        // The value should be a SpawnExpression (Assignment uses targets/values arrays)
        expect(assign.values[0].type).toBe('SpawnExpression');
        expect(assign.values[0].callee.name).toBe('foo');
    });

    test('parses spawn with no assignment (fire-and-forget)', () => {
        const ast = parse('concurrent { spawn fire() }');
        const block = findNode(ast, 'ConcurrentBlock');
        const stmt = block.body[0];
        // ExpressionStatement wrapping SpawnExpression
        expect(stmt.type).toBe('ExpressionStatement');
        expect(stmt.expression.type).toBe('SpawnExpression');
    });

    test('parses multiple spawns in concurrent block', () => {
        const ast = parse(`
            concurrent {
                a = spawn fetch_users()
                b = spawn fetch_posts()
            }
        `);
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.body.length).toBe(2);
        expect(block.body[0].values[0].type).toBe('SpawnExpression');
        expect(block.body[1].values[0].type).toBe('SpawnExpression');
    });

    test('concurrent block inside function body', () => {
        const ast = parse(`
            fn main() {
                concurrent {
                    a = spawn foo()
                }
            }
        `);
        const fn = findNode(ast, 'FunctionDeclaration');
        expect(fn).not.toBeNull();
        const block = fn.body.body[0];
        expect(block.type).toBe('ConcurrentBlock');
    });
});

describe('concurrency analyzer', () => {
    test('concurrent block with spawns analyzes without errors', () => {
        expect(() => analyze(`
            fn foo() -> Int { 42 }
            concurrent {
                a = spawn foo()
            }
        `)).not.toThrow();
    });

    test('spawn outside concurrent block warns', () => {
        const warnings = getWarnings(`
            fn foo() -> Int { 42 }
            fn main() {
                a = spawn foo()
            }
        `);
        const spawnWarning = warnings.find(w => w.code === 'W_SPAWN_OUTSIDE_CONCURRENT');
        expect(spawnWarning).toBeDefined();
    });

    test('concurrent block variables are in scope after block', () => {
        // This should not produce "undefined identifier" warnings for a and b
        const warnings = getWarnings(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                    b = spawn foo()
                }
                print(a)
                print(b)
            }
        `);
        // a and b should not be flagged as undefined
        const flagged = warnings.filter(w => w.message && (w.message.includes("'a'") || w.message.includes("'b'")));
        expect(flagged.length).toBe(0);
    });

    test('empty concurrent block warns', () => {
        const warnings = getWarnings('concurrent { }');
        const emptyWarning = warnings.find(w => w.code === 'W_EMPTY_CONCURRENT');
        expect(emptyWarning).toBeDefined();
    });
});

describe('concurrency codegen', () => {
    test('concurrent block generates Promise.all', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                    b = spawn foo()
                }
            }
        `);
        expect(code).toContain('Promise.all');
    });

    test('spawn wraps in Result (try/catch)', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                }
            }
        `);
        // Result wrapping: Ok on success, Err on catch
        expect(code).toContain('Ok(');
        expect(code).toContain('Err(');
    });

    test('concurrent block assigns results to variables', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                    b = spawn foo()
                }
            }
        `);
        // Variables should be assigned from the Promise.all result
        expect(code).toContain('const a =');
        expect(code).toContain('const b =');
    });

    test('fire-and-forget spawn (no assignment)', () => {
        const code = compileCode(`
            fn fire() { print("done") }
            fn main() {
                concurrent {
                    spawn fire()
                }
            }
        `);
        expect(code).toContain('Promise.all');
        // Should still be in the task list, just no variable assignment
    });

    test('concurrent with timeout generates timeout wrapper', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent timeout(5000) {
                    a = spawn foo()
                }
            }
        `);
        // Should include a timeout mechanism
        expect(code).toContain('5000');
    });

    test('spawn standalone expression generates correctly', () => {
        const code = compileCode(`
            fn foo(n: Int) -> Int { n * 2 }
            fn main() {
                concurrent {
                    a = spawn foo(21)
                }
            }
        `);
        expect(code).toContain('foo(21)');
    });
});

function runTova(code) {
    const tmpDir = join(__dirname, '..', '.tova-out', 'test-concurrent');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, 'test.tova');
    writeFileSync(tmpFile, code);
    try {
        const result = execFileSync(
            'bun',
            ['run', join(__dirname, '..', 'bin', 'tova.js'), 'run', tmpFile],
            { encoding: 'utf-8', timeout: 10000 }
        );
        return result.trim();
    } finally {
        try { unlinkSync(tmpFile); } catch (e) {}
    }
}

describe('concurrency E2E', () => {
    test('basic concurrent block runs both tasks', () => {
        const output = runTova(`
            fn double(n: Int) -> Int { n * 2 }

            async fn main() {
                concurrent {
                    a = spawn double(21)
                    b = spawn double(10)
                }
                match a {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
                match b {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
            }
        `);
        expect(output).toContain('42');
        expect(output).toContain('20');
    });

    test('concurrent with error returns Err result', () => {
        const output = runTova(`
            fn might_fail() -> Int {
                var x = None
                x.unwrap()
            }

            fn succeed() -> Int { 42 }

            async fn main() {
                concurrent {
                    a = spawn might_fail()
                    b = spawn succeed()
                }
                match a {
                    Ok(v) => print(v)
                    Err(_) => print("error caught")
                }
                match b {
                    Ok(v) => print(v)
                    Err(_) => print("b error")
                }
            }
        `);
        expect(output).toContain('error caught');
        expect(output).toContain('42');
    });

    test('concurrent with multiple spawns all complete', () => {
        const output = runTova(`
            fn add(a: Int, b: Int) -> Int { a + b }

            async fn main() {
                concurrent {
                    r1 = spawn add(1, 2)
                    r2 = spawn add(10, 20)
                    r3 = spawn add(100, 200)
                }
                match r1 {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
                match r2 {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
                match r3 {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
            }
        `);
        expect(output).toContain('3');
        expect(output).toContain('30');
        expect(output).toContain('300');
    });
});

describe('select AST nodes', () => {
    test('SelectStatement has correct structure', () => {
        const stmt = new SelectStatement([], { line: 1, column: 0 });
        expect(stmt.type).toBe('SelectStatement');
        expect(stmt.cases).toEqual([]);
        expect(stmt.loc).toEqual({ line: 1, column: 0 });
    });

    test('SelectStatement with multiple cases', () => {
        const case1 = new SelectCase('receive', { type: 'Identifier', name: 'ch1' }, 'msg', null, [], { line: 2, column: 4 });
        const case2 = new SelectCase('send', { type: 'Identifier', name: 'ch2' }, null, { type: 'NumberLiteral', value: 42 }, [], { line: 3, column: 4 });
        const stmt = new SelectStatement([case1, case2], { line: 1, column: 0 });
        expect(stmt.cases.length).toBe(2);
        expect(stmt.cases[0].kind).toBe('receive');
        expect(stmt.cases[1].kind).toBe('send');
    });

    test('SelectCase receive kind', () => {
        const c = new SelectCase('receive', { type: 'Identifier', name: 'ch' }, 'msg', null, [], { line: 1, column: 0 });
        expect(c.type).toBe('SelectCase');
        expect(c.kind).toBe('receive');
        expect(c.channel).toEqual({ type: 'Identifier', name: 'ch' });
        expect(c.binding).toBe('msg');
        expect(c.value).toBeNull();
        expect(c.body).toEqual([]);
        expect(c.loc).toEqual({ line: 1, column: 0 });
    });

    test('SelectCase send kind', () => {
        const c = new SelectCase('send', { type: 'Identifier', name: 'ch' }, null, { type: 'NumberLiteral', value: 42 }, [], { line: 1, column: 0 });
        expect(c.type).toBe('SelectCase');
        expect(c.kind).toBe('send');
        expect(c.channel).toEqual({ type: 'Identifier', name: 'ch' });
        expect(c.binding).toBeNull();
        expect(c.value).toEqual({ type: 'NumberLiteral', value: 42 });
    });

    test('SelectCase timeout kind', () => {
        const c = new SelectCase('timeout', null, null, { type: 'NumberLiteral', value: 5000 }, [], { line: 1, column: 0 });
        expect(c.type).toBe('SelectCase');
        expect(c.kind).toBe('timeout');
        expect(c.channel).toBeNull();
        expect(c.binding).toBeNull();
        expect(c.value).toEqual({ type: 'NumberLiteral', value: 5000 });
    });

    test('SelectCase default kind', () => {
        const c = new SelectCase('default', null, null, null, [{ type: 'ExpressionStatement' }], { line: 1, column: 0 });
        expect(c.type).toBe('SelectCase');
        expect(c.kind).toBe('default');
        expect(c.channel).toBeNull();
        expect(c.binding).toBeNull();
        expect(c.value).toBeNull();
        expect(c.body).toEqual([{ type: 'ExpressionStatement' }]);
    });
});

describe('select parser', () => {
    test('parses basic receive case', () => {
        const ast = parse('select { msg from ch => print(msg) }');
        const sel = findNode(ast, 'SelectStatement');
        expect(sel).not.toBeNull();
        expect(sel.cases.length).toBe(1);
        expect(sel.cases[0].kind).toBe('receive');
        expect(sel.cases[0].binding).toBe('msg');
        expect(sel.cases[0].channel.name).toBe('ch');
    });

    test('parses wildcard receive', () => {
        const ast = parse('select { _ from done => print("done") }');
        const sel = findNode(ast, 'SelectStatement');
        expect(sel.cases[0].kind).toBe('receive');
        expect(sel.cases[0].binding).toBeNull();
        expect(sel.cases[0].channel.name).toBe('done');
    });

    test('parses timeout case', () => {
        const ast = parse('select { timeout(5000) => print("timeout") }');
        const sel = findNode(ast, 'SelectStatement');
        expect(sel.cases[0].kind).toBe('timeout');
        expect(sel.cases[0].value.value).toBe(5000);
    });

    test('parses default case', () => {
        const ast = parse('select { _ => print("default") }');
        const sel = findNode(ast, 'SelectStatement');
        expect(sel.cases[0].kind).toBe('default');
    });

    test('parses send case', () => {
        const ast = parse('select { ch.send(42) => print("sent") }');
        const sel = findNode(ast, 'SelectStatement');
        expect(sel.cases[0].kind).toBe('send');
        expect(sel.cases[0].channel.name).toBe('ch');
        expect(sel.cases[0].value.value).toBe(42);
    });

    test('parses multiple cases', () => {
        const ast = parse(`
            select {
                msg from ch1 => print(msg)
                timeout(5000) => print("timeout")
                _ => print("default")
            }
        `);
        const sel = findNode(ast, 'SelectStatement');
        expect(sel.cases.length).toBe(3);
        expect(sel.cases[0].kind).toBe('receive');
        expect(sel.cases[1].kind).toBe('timeout');
        expect(sel.cases[2].kind).toBe('default');
    });

    test('parses block body in select case', () => {
        const ast = parse(`
            select {
                msg from ch => {
                    print(msg)
                    print("done")
                }
            }
        `);
        const sel = findNode(ast, 'SelectStatement');
        expect(sel.cases[0].body.length).toBe(2);
    });

    test('select() function call is NOT parsed as SelectStatement', () => {
        const ast = parse('select(table, cols)');
        const sel = findNode(ast, 'SelectStatement');
        expect(sel).toBeNull();
    });
});

describe('select analyzer', () => {
    test('empty select warns', () => {
        const warnings = getWarnings('select { }');
        const w = warnings.find(w => w.code === 'W_EMPTY_SELECT');
        expect(w).toBeDefined();
    });

    test('duplicate default warns', () => {
        const warnings = getWarnings(`
            fn main() {
                select {
                    _ => print("one")
                    _ => print("two")
                }
            }
        `);
        const w = warnings.find(w => w.code === 'W_DUPLICATE_SELECT_DEFAULT');
        expect(w).toBeDefined();
    });

    test('duplicate timeout warns', () => {
        const warnings = getWarnings(`
            fn main() {
                select {
                    timeout(100) => print("one")
                    timeout(200) => print("two")
                }
            }
        `);
        const w = warnings.find(w => w.code === 'W_DUPLICATE_SELECT_TIMEOUT');
        expect(w).toBeDefined();
    });

    test('default + timeout warns', () => {
        const warnings = getWarnings(`
            fn main() {
                select {
                    _ => print("default")
                    timeout(100) => print("timeout")
                }
            }
        `);
        const w = warnings.find(w => w.code === 'W_SELECT_DEFAULT_TIMEOUT');
        expect(w).toBeDefined();
    });

    test('receive binding accessible in case body', () => {
        // This should NOT produce undefined identifier warning for 'msg'
        const warnings = getWarnings(`
            fn main() {
                ch = Channel.new(1)
                select {
                    msg from ch => print(msg)
                }
            }
        `);
        const flagged = warnings.filter(w => w.message && w.message.includes("'msg'"));
        expect(flagged.length).toBe(0);
    });

    test('undefined channel warns', () => {
        const warnings = getWarnings(`
            fn main() {
                select {
                    msg from unknown_channel => print(msg)
                }
            }
        `);
        const flagged = warnings.filter(w => w.message && w.message.includes("'unknown_channel'"));
        expect(flagged.length).toBeGreaterThan(0);
    });
});
