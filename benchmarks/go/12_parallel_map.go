package main

import (
	"fmt"
	"runtime"
	"sync"
	"time"
)

func heavy(x int) int {
	total := 0
	for i := 0; i < 10_000_000; i++ {
		total += (i % 97) * (i % 53)
	}
	return total + x
}

func sequentialMap(items []int) []int {
	result := make([]int, len(items))
	for i, x := range items {
		result[i] = heavy(x)
	}
	return result
}

func parallelMap(items []int, numWorkers int) []int {
	result := make([]int, len(items))
	var wg sync.WaitGroup
	ch := make(chan int, len(items))

	for _, x := range items {
		ch <- x
	}
	close(ch)

	chunkSize := (len(items) + numWorkers - 1) / numWorkers
	for w := 0; w < numWorkers; w++ {
		start := w * chunkSize
		end := start + chunkSize
		if end > len(items) {
			end = len(items)
		}
		if start >= len(items) {
			break
		}
		wg.Add(1)
		go func(s, e int) {
			defer wg.Done()
			for i := s; i < e; i++ {
				result[i] = heavy(items[i])
			}
		}(start, end)
	}
	wg.Wait()
	return result
}

func main() {
	cores := runtime.NumCPU()
	items := make([]int, 64)
	for i := range items {
		items[i] = i
	}

	// Warmup
	_ = parallelMap(items[:4], cores)

	// Sequential
	t0 := time.Now()
	seq := sequentialMap(items)
	t1 := time.Now()

	// Parallel
	t2 := time.Now()
	par := parallelMap(items, cores)
	t3 := time.Now()

	st := t1.Sub(t0).Milliseconds()
	pt := t3.Sub(t2).Milliseconds()
	fmt.Printf("Sequential(64x10M): %dms\n", st)
	fmt.Printf("Parallel(64x10M):   %dms\n", pt)
	fmt.Printf("Cores: %d\n", cores)
	fmt.Printf("Match: %v, Count: %d\n", seq[0] == par[0], len(par))
	if pt > 0 {
		fmt.Printf("Speedup: %.2fx\n", float64(st)/float64(pt))
	}
}
