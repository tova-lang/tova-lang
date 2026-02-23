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

func compute(n int) int {
	total := 0
	for i := 0; i < n; i++ {
		total += (i % 97) * (i % 53)
	}
	return total
}

func main() {
	_ = fib(20)
	_ = compute(1000)

	fmt.Println("--- fibonacci(40) ---")
	t0 := time.Now()
	r1 := fib(40)
	t1 := time.Now()
	fmt.Printf("Go: %dms (result: %d)\n", t1.Sub(t0).Milliseconds(), r1)

	fmt.Println("--- compute(500K) x 200 ---")
	n := 500000
	t2 := time.Now()
	var r2 int
	for j := 0; j < 200; j++ {
		r2 = compute(n)
	}
	t3 := time.Now()
	fmt.Printf("Go: %dms (result: %d)\n", t3.Sub(t2).Milliseconds(), r2)
}
