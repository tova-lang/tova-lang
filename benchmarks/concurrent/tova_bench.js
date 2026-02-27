'use strict';

/**
 * Tova Concurrency Benchmarks
 * Tests: concurrent WASM tasks (Tokio + Wasmtime), crossbeam channels
 * Run with: bun benchmarks/concurrent/tova_bench.js
 */

const { join } = require('path');
const bridge = require(join(__dirname, '..', '..', 'src', 'stdlib', 'runtime-bridge.js'));
const { generateAddModule, generateFibModule } = require(join(__dirname, '..', '..', 'tests', 'fixtures', 'gen-test-wasm.js'));

if (!bridge.isRuntimeAvailable()) {
    console.error('ERROR: tova_runtime native addon not available.');
    console.error('Build it first: cd tova_runtime && cargo build --release');
    process.exit(1);
}

console.log('=== Tova Concurrency Benchmarks ===');
console.log('Runtime: Bun + tova_runtime (Tokio/Wasmtime/Crossbeam)');
console.log('');

async function benchConcurrentAdd() {
    const N = 100_000;
    const wasmBytes = Buffer.from(generateAddModule());
    const tasks = Array.from({ length: N }, (_, i) => ({
        wasm: wasmBytes,
        func: 'add',
        args: [i, i],
    }));

    console.log(`--- ${N.toLocaleString()} concurrent WASM add tasks ---`);
    const t0 = performance.now();
    const results = await bridge.concurrentWasmShared(tasks);
    const t1 = performance.now();
    const elapsed = t1 - t0;
    const tasksPerSec = Math.round(N / (elapsed / 1000));

    // Verify correctness
    if (results[0] !== 0 || results[N - 1] !== (N - 1) * 2) {
        console.error('  VERIFY FAILED: results[0]=' + results[0] + ', results[N-1]=' + results[N - 1]);
    }

    console.log(`  time=${elapsed.toFixed(1)}ms`);
    console.log(`  tasks/sec=${tasksPerSec.toLocaleString()}`);
    console.log('');
    return { name: 'concurrent_add_100k', elapsed, tasksPerSec };
}

async function benchChannelMessages() {
    // Use 100K messages — each send/receive is a NAPI FFI call, so 1M would be too slow.
    // Capacity must be >= N so all sends complete before receives start (sequential benchmark).
    const N = 100_000;
    console.log(`--- ${N.toLocaleString()} channel messages ---`);

    const chId = bridge.channelCreate(N);

    // Send phase
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
        bridge.channelSend(chId, i);
    }
    const tSend = performance.now();

    // Receive phase (try_recv is non-blocking, returns null when empty)
    let sum = 0;
    let received = 0;
    while (received < N) {
        const val = bridge.channelReceive(chId);
        if (val !== null && val !== undefined) {
            sum += val;
            received++;
        }
    }
    const t1 = performance.now();

    bridge.channelClose(chId);

    const sendElapsed = tSend - t0;
    const recvElapsed = t1 - tSend;
    const totalElapsed = t1 - t0;
    const msgPerSec = Math.round(N / (totalElapsed / 1000));

    // Verify: sum of 0..N-1 = N*(N-1)/2
    const expected = (N * (N - 1)) / 2;
    if (sum !== expected) {
        console.error('  VERIFY FAILED: sum=' + sum + ', expected=' + expected);
    }

    console.log(`  send=${sendElapsed.toFixed(1)}ms  recv=${recvElapsed.toFixed(1)}ms  total=${totalElapsed.toFixed(1)}ms`);
    console.log(`  msg/sec=${msgPerSec.toLocaleString()}`);
    console.log('');
    return { name: 'channel_100k', totalElapsed, msgPerSec };
}

async function benchConcurrentFib() {
    const N = 1_000;
    const FIB_N = 30;
    const wasmBytes = Buffer.from(generateFibModule());
    const tasks = Array.from({ length: N }, () => ({
        wasm: wasmBytes,
        func: 'fib',
        args: [FIB_N],
    }));

    console.log(`--- ${N.toLocaleString()} concurrent WASM fib(${FIB_N}) tasks ---`);
    const t0 = performance.now();
    const results = await bridge.concurrentWasmShared(tasks);
    const t1 = performance.now();
    const elapsed = t1 - t0;

    // fib(30) = 832040
    if (results[0] !== 832040) {
        console.error('  VERIFY FAILED: fib(30)=' + results[0] + ', expected=832040');
    }

    console.log(`  time=${elapsed.toFixed(1)}ms`);
    console.log(`  tasks/sec=${Math.round(N / (elapsed / 1000)).toLocaleString()}`);
    console.log('');
    return { name: 'concurrent_fib30_1k', elapsed };
}

async function main() {
    const results = [];

    results.push(await benchConcurrentAdd());
    results.push(await benchChannelMessages());
    results.push(await benchConcurrentFib());

    console.log('=== Tova Results Summary ===');
    for (const r of results) {
        if (r.tasksPerSec) {
            console.log(`  ${r.name}: ${r.elapsed ? r.elapsed.toFixed(1) : r.totalElapsed.toFixed(1)}ms (${r.tasksPerSec.toLocaleString()} ops/sec)`);
        } else if (r.msgPerSec) {
            console.log(`  ${r.name}: ${r.totalElapsed.toFixed(1)}ms (${r.msgPerSec.toLocaleString()} msg/sec)`);
        } else {
            console.log(`  ${r.name}: ${r.elapsed.toFixed(1)}ms`);
        }
    }
    console.log('');
}

main().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
