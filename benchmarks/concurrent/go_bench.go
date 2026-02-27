package main

import (
	"fmt"
	"sync"
	"time"
)

// add simulates the WASM add(i, i) operation
func add(a, b int64) int64 {
	return a + b
}

// fib computes iterative fibonacci (matches the WASM fib module)
func fib(n int64) int64 {
	var prev, curr int64 = 0, 1
	for i := int64(0); i < n; i++ {
		prev, curr = curr, prev+curr
	}
	return prev
}

func benchConcurrentAdd() {
	const N = 100_000
	fmt.Printf("--- %d concurrent add tasks (goroutines) ---\n", N)

	results := make([]int64, N)
	var wg sync.WaitGroup
	wg.Add(N)

	t0 := time.Now()
	for i := 0; i < N; i++ {
		go func(idx int) {
			defer wg.Done()
			results[idx] = add(int64(idx), int64(idx))
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(t0)

	// Verify
	if results[0] != 0 || results[N-1] != int64((N-1)*2) {
		fmt.Printf("  VERIFY FAILED: results[0]=%d, results[N-1]=%d\n", results[0], results[N-1])
	}

	tasksPerSec := float64(N) / elapsed.Seconds()
	fmt.Printf("  time=%.1fms\n", float64(elapsed.Milliseconds()))
	fmt.Printf("  tasks/sec=%d\n", int64(tasksPerSec))
	fmt.Println()
}

func benchChannelMessages() {
	const N = 100_000
	fmt.Printf("--- %d channel messages ---\n", N)

	ch := make(chan int64, N)

	t0 := time.Now()

	// Producer goroutine
	go func() {
		for i := int64(0); i < N; i++ {
			ch <- i
		}
		close(ch)
	}()

	// Consumer
	var sum int64
	for val := range ch {
		sum += val
	}
	elapsed := time.Since(t0)

	// Verify
	expected := int64(N) * int64(N-1) / 2
	if sum != expected {
		fmt.Printf("  VERIFY FAILED: sum=%d, expected=%d\n", sum, expected)
	}

	msgPerSec := float64(N) / elapsed.Seconds()
	fmt.Printf("  time=%.1fms\n", float64(elapsed.Milliseconds()))
	fmt.Printf("  msg/sec=%d\n", int64(msgPerSec))
	fmt.Println()
}

func benchConcurrentFib() {
	const N = 1_000
	const FIB_N = 30
	fmt.Printf("--- %d concurrent fib(%d) goroutines ---\n", N, FIB_N)

	results := make([]int64, N)
	var wg sync.WaitGroup
	wg.Add(N)

	t0 := time.Now()
	for i := 0; i < N; i++ {
		go func(idx int) {
			defer wg.Done()
			results[idx] = fib(FIB_N)
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(t0)

	// Verify: fib(30) = 832040
	if results[0] != 832040 {
		fmt.Printf("  VERIFY FAILED: fib(30)=%d, expected=832040\n", results[0])
	}

	tasksPerSec := float64(N) / elapsed.Seconds()
	fmt.Printf("  time=%.1fms\n", float64(elapsed.Milliseconds()))
	fmt.Printf("  tasks/sec=%d\n", int64(tasksPerSec))
	fmt.Println()
}

func main() {
	fmt.Println("=== Go Concurrency Benchmarks ===")
	fmt.Println("Runtime: Go (goroutines + channels)")
	fmt.Println()

	benchConcurrentAdd()
	benchChannelMessages()
	benchConcurrentFib()

	fmt.Println("=== Go Results Complete ===")
}
