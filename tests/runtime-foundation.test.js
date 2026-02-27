import { describe, test, expect, beforeAll } from 'bun:test';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
const { generateAddModule, generateFibModule } = require('./fixtures/gen-test-wasm.js');

// Load the napi-rs addon
function loadRuntime() {
    const searchDirs = [
        join(__dirname, '..', 'tova_runtime'),
        join(__dirname, '..', 'tova_runtime', 'target', 'release'),
    ];
    for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        const files = readdirSync(dir).filter(f => f.endsWith('.node'));
        for (const f of files) {
            try { return require(join(dir, f)); } catch (e) { continue; }
        }
    }
    throw new Error('Could not load tova_runtime native addon');
}

describe('tova_runtime foundation', () => {
    let runtime;

    test('loads native addon', () => {
        runtime = loadRuntime();
        expect(runtime).toBeDefined();
    });

    test('health check', () => {
        runtime = loadRuntime();
        expect(runtime.healthCheck()).toBe('tova_runtime ok');
    });
});

describe('tokio scheduler', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('spawn a single async task and get result', async () => {
        const result = await runtime.spawnTask(42);
        expect(result).toBe(42);
    });

    test('spawn multiple tasks concurrently', async () => {
        const results = await runtime.concurrentAll([1, 2, 3, 4, 5]);
        expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    test('spawn 10000 tasks', async () => {
        const n = 10000;
        const inputs = Array.from({ length: n }, (_, i) => i);
        const results = await runtime.concurrentAll(inputs);
        expect(results.length).toBe(n);
        expect(results[0]).toBe(0);
        expect(results[n - 1]).toBe(n - 1);
    });
});

describe('wasmtime executor', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('execute a WASM module (add)', async () => {
        const wasmBytes = generateAddModule();
        const result = await runtime.execWasm(Buffer.from(wasmBytes), 'add', [3, 4]);
        expect(result).toBe(7);
    });

    test('execute WASM fib(10)', async () => {
        const wasmBytes = generateFibModule();
        const result = await runtime.execWasm(Buffer.from(wasmBytes), 'fib', [10]);
        expect(result).toBe(55);
    });

    test('execute WASM on Tokio — multiple tasks concurrently', async () => {
        const wasmBytes = Buffer.from(generateAddModule());
        const tasks = [
            { wasm: wasmBytes, func: 'add', args: [1, 2] },
            { wasm: wasmBytes, func: 'add', args: [10, 20] },
            { wasm: wasmBytes, func: 'add', args: [100, 200] },
        ];
        const results = await runtime.concurrentWasm(tasks);
        expect(results).toEqual([3, 30, 300]);
    });

    test('1000 concurrent WASM tasks', async () => {
        const wasmBytes = Buffer.from(generateAddModule());
        const tasks = Array.from({ length: 1000 }, (_, i) => ({
            wasm: wasmBytes,
            func: 'add',
            args: [i, i],
        }));
        const results = await runtime.concurrentWasm(tasks);
        expect(results.length).toBe(1000);
        expect(results[0]).toBe(0);
        expect(results[999]).toBe(1998);
    });
});
