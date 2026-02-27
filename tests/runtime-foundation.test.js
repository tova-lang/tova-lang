import { describe, test, expect, beforeAll } from 'bun:test';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

const { generateAddModule, generateFibModule } = require('./fixtures/gen-test-wasm.js');
const { generateProducerModule, generateConsumerModule } = require('./fixtures/gen-channel-wasm.js');

// Load the napi-rs addon
function loadRuntime() {
    const searchDirs = [
        join(__dirname, '..', 'tova_runtime'),
        join(__dirname, '..', 'tova_runtime', 'target', 'release'),
    ];
    for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        // Search for .node files first (napi-rs convention)
        const nodeFiles = readdirSync(dir).filter(f => f.endsWith('.node'));
        for (const f of nodeFiles) {
            try { return require(join(dir, f)); } catch (e) { continue; }
        }
        // Fall back to .dylib files (macOS raw cargo output)
        const dylibFiles = readdirSync(dir).filter(f => f.endsWith('.dylib'));
        for (const f of dylibFiles) {
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
            wasm: wasmBytes, func: 'add', args: [i, i],
        }));
        const results = await runtime.concurrentWasm(tasks);
        expect(results.length).toBe(1000);
        expect(results[0]).toBe(0);
        expect(results[999]).toBe(1998);
    });
});

describe('channels', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('create a channel and get handle', () => {
        const chId = runtime.channelCreate(10);
        expect(typeof chId).toBe('number');
        expect(chId).toBeGreaterThanOrEqual(0);
    });

    test('send and receive on a channel', () => {
        const chId = runtime.channelCreate(10);
        runtime.channelSend(chId, 42);
        runtime.channelSend(chId, 99);
        const v1 = runtime.channelReceive(chId);
        const v2 = runtime.channelReceive(chId);
        expect(v1).toBe(42);
        expect(v2).toBe(99);
    });

    test('close channel — receive returns null after drain', () => {
        const chId = runtime.channelCreate(1);
        runtime.channelSend(chId, 7);
        runtime.channelClose(chId);
        const v1 = runtime.channelReceive(chId);
        expect(v1).toBe(7);
        const v2 = runtime.channelReceive(chId);
        expect(v2).toBeNull();
    });

    test('channel 100 messages', () => {
        const chId = runtime.channelCreate(100);
        for (let i = 0; i < 100; i++) {
            runtime.channelSend(chId, i);
        }
        runtime.channelClose(chId);
        const values = [];
        let v;
        while ((v = runtime.channelReceive(chId)) !== null) {
            values.push(v);
        }
        expect(values.length).toBe(100);
        expect(values[0]).toBe(0);
        expect(values[99]).toBe(99);
    });
});

describe('WASM host imports — channels', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('producer WASM sends values through channel', async () => {
        const chId = runtime.channelCreate(100);
        const wasmBytes = Buffer.from(generateProducerModule());
        const sent = await runtime.execWasmWithChannels(wasmBytes, 'producer', [chId, 10]);
        expect(sent).toBe(10);
        const values = [];
        let v;
        while ((v = runtime.channelReceive(chId)) !== null) {
            values.push(v);
        }
        expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    test('producer + consumer via channel on separate Tokio tasks', async () => {
        const chId = runtime.channelCreate(50);
        const producerWasm = Buffer.from(generateProducerModule());
        const consumerWasm = Buffer.from(generateConsumerModule());
        const results = await runtime.concurrentWasmWithChannels([
            { wasm: producerWasm, func: 'producer', args: [chId, 100] },
            { wasm: consumerWasm, func: 'consumer', args: [chId, 100] },
        ]);
        expect(results[0]).toBe(100);  // producer sent 100
        expect(results[1]).toBe(4950); // consumer sum(0..99) = 4950
    });
});

describe('runtime bridge', () => {
    const bridge = require('../src/stdlib/runtime-bridge.js');

    test('loads runtime via bridge', () => {
        expect(bridge.isRuntimeAvailable()).toBe(true);
    });

    test('bridge healthCheck returns string', () => {
        const result = bridge.healthCheck();
        expect(result).toBe('tova_runtime ok');
    });

    test('bridge exposes high-level API', () => {
        const chId = bridge.channelCreate(10);
        expect(typeof chId).toBe('number');
        bridge.channelSend(chId, 42);
        bridge.channelSend(chId, 99);
        const v1 = bridge.channelReceive(chId);
        const v2 = bridge.channelReceive(chId);
        expect(v1).toBe(42);
        expect(v2).toBe(99);
        bridge.channelClose(chId);
    });

    test('bridge exports all expected functions', () => {
        expect(typeof bridge.isRuntimeAvailable).toBe('function');
        expect(typeof bridge.healthCheck).toBe('function');
        expect(typeof bridge.channelCreate).toBe('function');
        expect(typeof bridge.channelSend).toBe('function');
        expect(typeof bridge.channelReceive).toBe('function');
        expect(typeof bridge.channelClose).toBe('function');
        expect(typeof bridge.execWasm).toBe('function');
        expect(typeof bridge.execWasmWithChannels).toBe('function');
        expect(typeof bridge.concurrentWasm).toBe('function');
        expect(typeof bridge.concurrentWasmWithChannels).toBe('function');
        expect(typeof bridge.concurrentWasmShared).toBe('function');
    });
});
