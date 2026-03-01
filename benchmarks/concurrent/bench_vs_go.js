'use strict';

/**
 * Tova vs Go Concurrency Benchmark Suite — Tova side (Rust/Tokio native runtime)
 *
 * Uses the tova_runtime native addon (napi-rs):
 *   - Tokio multi-threaded runtime (true parallelism)
 *   - Wasmtime WASM execution on blocking threads
 *   - Crossbeam bounded channels
 *
 * Output format: RESULT:<name>:<value>:<unit>
 * Parsed by run_comparison.sh for side-by-side comparison with Go.
 */

const { join } = require('path');
const bridge = require(join(__dirname, '..', '..', 'src', 'stdlib', 'runtime-bridge.js'));
const { generateAddModule, generateFibModule } = require(join(__dirname, '..', '..', 'tests', 'fixtures', 'gen-test-wasm.js'));
const { generateProducerModule, generateConsumerModule } = require(join(__dirname, '..', '..', 'tests', 'fixtures', 'gen-channel-wasm.js'));

if (!bridge.isRuntimeAvailable()) {
  console.error('ERROR: tova_runtime native addon not available.');
  console.error('Build it first: cd tova_runtime && cargo build --release');
  process.exit(1);
}

// ── WASM modules (compiled once, reused) ──

const addWasm = Buffer.from(generateAddModule());
const fibWasm = Buffer.from(generateFibModule());
const producerWasm = Buffer.from(generateProducerModule());
const consumerWasm = Buffer.from(generateConsumerModule());

// ── Benchmark 1: Spawn overhead — 100K WASM task pairs on Tokio ──

async function benchSpawnOverhead() {
  const N = 100_000;

  // Create 2*N trivial tasks: add(0, 0) — measures Tokio spawn + WASM instantiation
  const tasks = Array.from({ length: N * 2 }, () => ({
    wasm: addWasm,
    func: 'add',
    args: [0, 0],
  }));

  const t0 = performance.now();
  await bridge.concurrentWasmShared(tasks);
  const elapsed = performance.now() - t0;

  console.log(`RESULT:spawn_overhead:${elapsed.toFixed(2)}:ms`);
}

// ── Benchmark 2: Channel throughput — 1M messages, Crossbeam bounded channel ──
//
// Uses WASM producer/consumer modules with chan_send/chan_receive host imports.
// Producer and consumer run concurrently on Tokio blocking threads.

async function benchChannelThroughput() {
  const N = 1_000_000;
  const chId = bridge.channelCreate(1024);

  const t0 = performance.now();
  const results = await bridge.concurrentWasmWithChannels([
    { wasm: producerWasm, func: 'producer', args: [chId, N] },
    { wasm: consumerWasm, func: 'consumer', args: [chId, N] },
  ]);
  const elapsed = performance.now() - t0;

  bridge.channelClose(chId);

  const sent = Number(results[0]);
  const sum = Number(results[1]);
  const expected = N * (N - 1) / 2;
  if (sent !== N) {
    console.log(`VERIFY FAILED: sent=${sent} expected=${N}`);
  }
  if (sum !== expected) {
    console.log(`VERIFY FAILED: sum=${sum} expected=${expected}`);
  }

  console.log(`RESULT:channel_throughput:${elapsed.toFixed(2)}:ms`);
}

// ── Benchmark 3: Ping-pong latency — 100K round-trips via Crossbeam channels ──
//
// Measures per-hop NAPI FFI + Crossbeam channel latency.
// Uses capacity=1 channels so single-threaded send-then-receive works.
// Each iteration: send to ch → receive from ch (2 NAPI FFI calls per hop).

async function benchPingPong() {
  const N = 100_000;
  const ch = bridge.channelCreate(1); // capacity 1 so send doesn't block

  const t0 = performance.now();

  let lastVal = -1;
  for (let i = 0; i < N; i++) {
    bridge.channelSend(ch, i);
    const val = bridge.channelReceive(ch);
    if (val !== null && val !== undefined) {
      lastVal = val;
    }
  }

  const elapsed = performance.now() - t0;

  bridge.channelClose(ch);

  if (lastVal !== N - 1) {
    console.log(`VERIFY FAILED: lastVal=${lastVal} expected=${N - 1}`);
  }

  console.log(`RESULT:ping_pong:${elapsed.toFixed(2)}:ms`);
}

// ── Benchmark 4: Fan-out — 1 producer, 4 consumers, 100K items through Crossbeam channel ──

async function benchFanOut() {
  const N = 100_000;
  const WORKERS = 4;
  const chId = bridge.channelCreate(256);
  const perWorker = N / WORKERS;

  const t0 = performance.now();

  // Run producer + 4 consumers concurrently on Tokio
  const tasks = [
    { wasm: producerWasm, func: 'producer', args: [chId, N] },
    ...Array.from({ length: WORKERS }, () => ({
      wasm: consumerWasm, func: 'consumer', args: [chId, perWorker],
    })),
  ];

  const results = await bridge.concurrentWasmWithChannels(tasks);
  const elapsed = performance.now() - t0;

  bridge.channelClose(chId);

  const sent = Number(results[0]);
  let totalSum = 0;
  for (let i = 1; i <= WORKERS; i++) {
    totalSum += Number(results[i]);
  }
  const expected = N * (N - 1) / 2;

  if (sent !== N) {
    console.log(`VERIFY FAILED: sent=${sent} expected=${N}`);
  }
  if (totalSum !== expected) {
    console.log(`VERIFY FAILED: sum=${totalSum} expected=${expected}`);
  }

  console.log(`RESULT:fan_out:${elapsed.toFixed(2)}:ms`);
}

// ── Benchmark 5: Select multiplexing — receive from 4 Crossbeam channels, 100K messages ──
//
// No native select in tova_runtime — uses JS-level try_recv polling on 4 channels
// via the bridge (same as channelReceive which is non-blocking).

async function benchSelectMultiplex() {
  const N = 100_000;
  const CHANS = 4;
  const perChan = N / CHANS;

  const chIds = Array.from({ length: CHANS }, () => bridge.channelCreate(64));

  // Launch producers via WASM on Tokio
  const producerTasks = chIds.map(chId => ({
    wasm: producerWasm, func: 'producer', args: [chId, perChan],
  }));
  const producersDone = bridge.concurrentWasmWithChannels(producerTasks);

  const t0 = performance.now();

  let sum = 0;
  let received = 0;

  // Select loop: try_recv polling across channels (channelReceive = non-blocking)
  while (received < N) {
    let found = false;
    for (let c = 0; c < CHANS; c++) {
      const val = bridge.channelReceive(chIds[c]);
      if (val !== null && val !== undefined) {
        sum += val;
        received++;
        found = true;
        break; // Handle first ready case (like select)
      }
    }
    // If nothing available, spin (no yield needed — NAPI calls are sync)
  }

  await producersDone;
  const elapsed = performance.now() - t0;

  for (const chId of chIds) bridge.channelClose(chId);

  if (received !== N) {
    console.log(`VERIFY FAILED: received=${received} expected=${N}`);
  }

  console.log(`RESULT:select_multiplex:${elapsed.toFixed(2)}:ms`);
}

// ── Benchmark 6: Concurrent compute — 4 workers × 10K fib(30) on Tokio vs sequential ──

async function benchConcurrentCompute() {
  const WORKERS = 4;
  const FIB_N = 30;
  const REPS = 10_000;
  const TOTAL_TASKS = WORKERS * REPS;
  const expectedPerWorker = 832040 * REPS;

  // Sequential: run fib(30) WORKERS*REPS times, one at a time
  const seqTasks = Array.from({ length: TOTAL_TASKS }, () => ({
    wasm: fibWasm,
    func: 'fib',
    args: [FIB_N],
  }));

  const t0 = performance.now();
  let seqSum = 0;
  for (let i = 0; i < TOTAL_TASKS; i++) {
    const result = await bridge.execWasm(fibWasm, 'fib', [FIB_N]);
    seqSum += Number(result);
  }
  const seqElapsed = performance.now() - t0;

  if (seqSum !== expectedPerWorker * WORKERS) {
    console.log(`VERIFY FAILED: seqSum=${seqSum} expected=${expectedPerWorker * WORKERS}`);
  }

  // Concurrent: all WORKERS*REPS tasks on Tokio thread pool (true parallelism)
  const concTasks = Array.from({ length: TOTAL_TASKS }, () => ({
    wasm: fibWasm,
    func: 'fib',
    args: [FIB_N],
  }));

  const t1 = performance.now();
  const results = await bridge.concurrentWasmShared(concTasks);
  const concElapsed = performance.now() - t1;

  let concSum = 0;
  for (const r of results) concSum += Number(r);
  if (concSum !== expectedPerWorker * WORKERS) {
    console.log(`VERIFY FAILED: concSum=${concSum} expected=${expectedPerWorker * WORKERS}`);
  }

  console.log(`RESULT:compute_sequential:${seqElapsed.toFixed(2)}:ms`);
  console.log(`RESULT:compute_concurrent:${concElapsed.toFixed(2)}:ms`);
}

// ── Main ──

async function main() {
  console.log('Tova Benchmark Suite — Runtime: Tokio + Wasmtime + Crossbeam (native)');

  await benchSpawnOverhead();
  await benchChannelThroughput();
  await benchPingPong();
  await benchFanOut();
  await benchSelectMultiplex();
  await benchConcurrentCompute();

  console.log('DONE');
}

main().catch(err => { console.error(err); process.exit(1); });
