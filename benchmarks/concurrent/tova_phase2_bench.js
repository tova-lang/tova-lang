'use strict';

/**
 * Tova Phase 2 Concurrency Benchmarks — Promise.all (concurrent/spawn syntax)
 *
 * Tests how Tova's `concurrent { spawn ... }` compiles and performs vs Go goroutines.
 * Phase 2 compiles to Promise.all — single-threaded concurrency (not parallelism).
 * Go goroutines are OS-scheduled across cores — true parallelism.
 *
 * This benchmark tests the overhead of the concurrency primitives, not parallel speedup.
 * Fair comparison: both languages spawning tasks and waiting for all to complete.
 */

// ─── Benchmark functions (pure JS, same as what Tova compiles to) ───

function fib(n) {
    let prev = 0, curr = 1;
    for (let i = 0; i < n; i++) {
        const tmp = curr;
        curr = prev + curr;
        prev = tmp;
    }
    return prev;
}

function compute(n) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += i * i;
    }
    return sum;
}

// Ok/Err (same as Tova codegen emits)
class Ok { constructor(v) { this.value = v; this.__tag = 'Ok'; } }
class Err { constructor(v) { this.value = v; this.__tag = 'Err'; } }

// ─── Benchmark 1: Two concurrent tasks ───

async function bench_two_tasks() {
    const iterations = 10_000;
    const t0 = performance.now();

    for (let i = 0; i < iterations; i++) {
        // This is exactly what `concurrent { a = spawn fib(30); b = spawn fib(30) }` compiles to:
        const [__c1_0, __c1_1] = await Promise.all([
            (async () => { try { return new Ok(await fib(30)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(30)); } catch(__e) { return new Err(__e); } })(),
        ]);
        const a = __c1_0;
        const b = __c1_1;
    }

    const elapsed = performance.now() - t0;
    console.log('--- 2 concurrent tasks x 10,000 iterations ---');
    console.log(`  time=${elapsed.toFixed(1)}ms`);
    console.log(`  iterations/sec=${Math.round(iterations / (elapsed / 1000))}`);
}

// ─── Benchmark 2: Four concurrent tasks ───

async function bench_four_tasks() {
    const iterations = 5_000;
    const t0 = performance.now();

    for (let i = 0; i < iterations; i++) {
        const [__c1_0, __c1_1, __c1_2, __c1_3] = await Promise.all([
            (async () => { try { return new Ok(await fib(30)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(30)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(30)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(30)); } catch(__e) { return new Err(__e); } })(),
        ]);
    }

    const elapsed = performance.now() - t0;
    console.log('--- 4 concurrent tasks x 5,000 iterations ---');
    console.log(`  time=${elapsed.toFixed(1)}ms`);
    console.log(`  iterations/sec=${Math.round(iterations / (elapsed / 1000))}`);
}

// ─── Benchmark 3: Heavy computation — concurrent vs sequential ───

async function bench_heavy_concurrent() {
    const t0 = performance.now();

    const [__c1_0, __c1_1, __c1_2, __c1_3] = await Promise.all([
        (async () => { try { return new Ok(await compute(10_000_000)); } catch(__e) { return new Err(__e); } })(),
        (async () => { try { return new Ok(await compute(10_000_000)); } catch(__e) { return new Err(__e); } })(),
        (async () => { try { return new Ok(await compute(10_000_000)); } catch(__e) { return new Err(__e); } })(),
        (async () => { try { return new Ok(await compute(10_000_000)); } catch(__e) { return new Err(__e); } })(),
    ]);

    const elapsed = performance.now() - t0;
    console.log('--- 4 heavy compute(10M) concurrent ---');
    console.log(`  time=${elapsed.toFixed(1)}ms`);
}

async function bench_heavy_sequential() {
    const t0 = performance.now();

    const r1 = compute(10_000_000);
    const r2 = compute(10_000_000);
    const r3 = compute(10_000_000);
    const r4 = compute(10_000_000);

    const elapsed = performance.now() - t0;
    console.log('--- 4 heavy compute(10M) sequential ---');
    console.log(`  time=${elapsed.toFixed(1)}ms`);
}

// ─── Benchmark 4: Many small tasks ───

async function bench_many_tasks() {
    const t0 = performance.now();

    for (let i = 0; i < 1_000; i++) {
        const [__c1_0, __c1_1, __c1_2, __c1_3, __c1_4] = await Promise.all([
            (async () => { try { return new Ok(await fib(10)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(10)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(10)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(10)); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await fib(10)); } catch(__e) { return new Err(__e); } })(),
        ]);
    }

    const elapsed = performance.now() - t0;
    console.log('--- 5 tasks x 1,000 iterations (5,000 spawns) ---');
    console.log(`  time=${elapsed.toFixed(1)}ms`);
    console.log(`  spawns/sec=${Math.round(5000 / (elapsed / 1000))}`);
}

// ─── Benchmark 5: Task spawn overhead (empty tasks) ───

async function bench_spawn_overhead() {
    const N = 50_000;
    const t0 = performance.now();

    for (let i = 0; i < N; i++) {
        await Promise.all([
            (async () => { try { return new Ok(await 1); } catch(__e) { return new Err(__e); } })(),
            (async () => { try { return new Ok(await 1); } catch(__e) { return new Err(__e); } })(),
        ]);
    }

    const elapsed = performance.now() - t0;
    console.log(`--- Spawn overhead: ${N.toLocaleString()} x 2 empty tasks ---`);
    console.log(`  time=${elapsed.toFixed(1)}ms`);
    console.log(`  pairs/sec=${Math.round(N / (elapsed / 1000)).toLocaleString()}`);
}

async function main() {
    console.log('=== Tova Phase 2 Concurrency Benchmarks ===');
    console.log('Runtime: Bun + Promise.all (concurrent/spawn syntax)');
    console.log('NOTE: Phase 2 is single-threaded cooperative concurrency.');
    console.log('      Go goroutines use true OS-level parallelism.');
    console.log('');

    await bench_two_tasks();
    console.log('');
    await bench_four_tasks();
    console.log('');
    await bench_heavy_concurrent();
    await bench_heavy_sequential();
    console.log('');
    await bench_many_tasks();
    console.log('');
    await bench_spawn_overhead();
    console.log('');
    console.log('=== Tova Results Complete ===');
}

main().catch(err => { console.error(err); process.exit(1); });
