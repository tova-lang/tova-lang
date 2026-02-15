package main

import (
	"fmt"
	"time"
)

func sieve(limit int) int {
	flags := make([]bool, limit+1)
	for i := 2; i <= limit; i++ {
		flags[i] = true
	}

	for p := 2; p*p <= limit; p++ {
		if flags[p] {
			for m := p * p; m <= limit; m += p {
				flags[m] = false
			}
		}
	}

	count := 0
	for i := 2; i <= limit; i++ {
		if flags[i] {
			count++
		}
	}
	return count
}

func main() {
	sieve(1000)

	limit := 10000000
	iterations := 5

	times := make([]float64, 0, iterations)
	var primesFound int

	for iter := 0; iter < iterations; iter++ {
		start := time.Now()
		primesFound = sieve(limit)
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

	fmt.Println("BENCHMARK: prime_sieve")
	fmt.Printf("limit=%d, iterations=%d\n", limit, iterations)
	fmt.Printf("primes_found=%d\n", primesFound)
	fmt.Printf("best=%.6fms\n", best)
	fmt.Printf("avg=%.6fms\n", avg)
}
