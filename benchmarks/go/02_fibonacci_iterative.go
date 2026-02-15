package main

import (
	"fmt"
	"math"
	"time"
)

func fibIter(n int) int {
	a, b := 0, 1
	for i := 0; i < n; i++ {
		a, b = b, a+b
	}
	return a
}

func main() {
	fibIter(1000)

	n := 50
	iterations := 1000000

	start := time.Now()
	var result int
	for i := 0; i < iterations; i++ {
		result = fibIter(n)
	}
	elapsed := time.Since(start).Seconds() * 1000

	opsPerSec := math.Floor(float64(iterations) / (elapsed / 1000))

	fmt.Println("BENCHMARK: fibonacci_iterative")
	fmt.Printf("n=%d, iterations=%d\n", n, iterations)
	fmt.Printf("result=%d\n", result)
	fmt.Printf("time=%.6fms\n", elapsed)
	fmt.Printf("ops_per_sec=%.0f\n", opsPerSec)
}
