package main

import (
	"fmt"
	"sync"
	"time"
)

// Equivalent benchmarks to tova_phase2_bench.tova
// Go uses goroutines + sync.WaitGroup (the idiomatic equivalent of concurrent/spawn)

func fib(n int) int {
	prev, curr := 0, 1
	for i := 0; i < n; i++ {
		prev, curr = curr, prev+curr
	}
	return prev
}

func compute(n int) int {
	sum := 0
	for i := 0; i < n; i++ {
		sum += i * i
	}
	return sum
}

// Benchmark 1: Two concurrent tasks
func benchTwoTasks() {
	iterations := 10000
	t0 := time.Now()

	for i := 0; i < iterations; i++ {
		var wg sync.WaitGroup
		var a, b int
		wg.Add(2)
		go func() { defer wg.Done(); a = fib(30) }()
		go func() { defer wg.Done(); b = fib(30) }()
		wg.Wait()
		_ = a
		_ = b
	}

	elapsed := time.Since(t0)
	fmt.Println("--- 2 concurrent tasks x 10,000 iterations ---")
	fmt.Printf("  time=%dms\n", elapsed.Milliseconds())
	fmt.Printf("  iterations/sec=%d\n", int64(float64(iterations)/elapsed.Seconds()))
}

// Benchmark 2: Four concurrent tasks
func benchFourTasks() {
	iterations := 5000
	t0 := time.Now()

	for i := 0; i < iterations; i++ {
		var wg sync.WaitGroup
		var a, b, c, d int
		wg.Add(4)
		go func() { defer wg.Done(); a = fib(30) }()
		go func() { defer wg.Done(); b = fib(30) }()
		go func() { defer wg.Done(); c = fib(30) }()
		go func() { defer wg.Done(); d = fib(30) }()
		wg.Wait()
		_ = a
		_ = b
		_ = c
		_ = d
	}

	elapsed := time.Since(t0)
	fmt.Println("--- 4 concurrent tasks x 5,000 iterations ---")
	fmt.Printf("  time=%dms\n", elapsed.Milliseconds())
	fmt.Printf("  iterations/sec=%d\n", int64(float64(iterations)/elapsed.Seconds()))
}

// Benchmark 3: Heavy computation — concurrent vs sequential
func benchHeavyConcurrent() {
	t0 := time.Now()

	var wg sync.WaitGroup
	var r1, r2, r3, r4 int
	wg.Add(4)
	go func() { defer wg.Done(); r1 = compute(10_000_000) }()
	go func() { defer wg.Done(); r2 = compute(10_000_000) }()
	go func() { defer wg.Done(); r3 = compute(10_000_000) }()
	go func() { defer wg.Done(); r4 = compute(10_000_000) }()
	wg.Wait()
	_ = r1
	_ = r2
	_ = r3
	_ = r4

	elapsed := time.Since(t0)
	fmt.Println("--- 4 heavy compute(10M) concurrent ---")
	fmt.Printf("  time=%.1fms\n", float64(elapsed.Microseconds())/1000.0)
}

func benchHeavySequential() {
	t0 := time.Now()

	r1 := compute(10_000_000)
	r2 := compute(10_000_000)
	r3 := compute(10_000_000)
	r4 := compute(10_000_000)
	_ = r1
	_ = r2
	_ = r3
	_ = r4

	elapsed := time.Since(t0)
	fmt.Println("--- 4 heavy compute(10M) sequential ---")
	fmt.Printf("  time=%.1fms\n", float64(elapsed.Microseconds())/1000.0)
}

// Benchmark 4: Many small tasks
func benchManyTasks() {
	t0 := time.Now()

	for i := 0; i < 1000; i++ {
		var wg sync.WaitGroup
		var a, b, c, d, e int
		wg.Add(5)
		go func() { defer wg.Done(); a = fib(10) }()
		go func() { defer wg.Done(); b = fib(10) }()
		go func() { defer wg.Done(); c = fib(10) }()
		go func() { defer wg.Done(); d = fib(10) }()
		go func() { defer wg.Done(); e = fib(10) }()
		wg.Wait()
		_ = a
		_ = b
		_ = c
		_ = d
		_ = e
	}

	elapsed := time.Since(t0)
	fmt.Println("--- 5 tasks x 1,000 iterations (5,000 spawns) ---")
	fmt.Printf("  time=%dms\n", elapsed.Milliseconds())
	fmt.Printf("  spawns/sec=%d\n", int64(5000.0/elapsed.Seconds()))
}

// Benchmark 5: Spawn overhead (empty tasks)
func benchSpawnOverhead() {
	N := 50000
	t0 := time.Now()

	for i := 0; i < N; i++ {
		var wg sync.WaitGroup
		var a, b int
		wg.Add(2)
		go func() { defer wg.Done(); a = 1 }()
		go func() { defer wg.Done(); b = 1 }()
		wg.Wait()
		_ = a
		_ = b
	}

	elapsed := time.Since(t0)
	fmt.Printf("--- Spawn overhead: %d x 2 empty tasks ---\n", N)
	fmt.Printf("  time=%dms\n", elapsed.Milliseconds())
	fmt.Printf("  pairs/sec=%d\n", int64(float64(N)/elapsed.Seconds()))
}

func main() {
	fmt.Println("=== Go Concurrency Benchmarks (Phase 2 equivalent) ===")
	fmt.Println("Runtime: Go (goroutines + sync.WaitGroup)")
	fmt.Println("NOTE: Go goroutines use true OS-level parallelism.")
	fmt.Println()

	benchTwoTasks()
	fmt.Println()
	benchFourTasks()
	fmt.Println()
	benchHeavyConcurrent()
	benchHeavySequential()
	fmt.Println()
	benchManyTasks()
	fmt.Println()
	benchSpawnOverhead()
	fmt.Println()
	fmt.Println("=== Go Results Complete ===")
}
