package main

import (
	"fmt"
	"time"
)

func fib(n int) int {
	if n <= 1 {
		return n
	}
	return fib(n-1) + fib(n-2)
}

func main() {
	fib(20)

	n := 35
	iterations := 5

	times := make([]float64, 0, iterations)
	var result int

	for i := 0; i < iterations; i++ {
		start := time.Now()
		result = fib(n)
		elapsed := time.Since(start).Seconds() * 1000
		times = append(times, elapsed)
	}

	best := times[0]
	sum := 0.0
	for _, t := range times {
		if t < best {
			best = t
		}
		sum += t
	}
	avg := sum / float64(len(times))

	fmt.Println("BENCHMARK: fibonacci_recursive")
	fmt.Printf("n=%d, iterations=%d\n", n, iterations)
	fmt.Printf("result=%d\n", result)
	fmt.Printf("best=%.6fms\n", best)
	fmt.Printf("avg=%.6fms\n", avg)
}
