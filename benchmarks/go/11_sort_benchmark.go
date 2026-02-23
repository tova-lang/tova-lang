package main

import (
	"fmt"
	"math/rand"
	"sort"
	"time"
)

func main() {
	N := 1_000_000

	// Generate random data
	data := make([]float64, N)
	for i := range data {
		data[i] = rand.Float64() * 1000000
	}

	// Sort benchmark
	copy1 := make([]float64, N)
	copy(copy1, data)

	start := time.Now()
	sort.Float64s(copy1)
	elapsed := time.Since(start)
	fmt.Printf("Go sort %d numbers: %.1fms\n", N, float64(elapsed.Microseconds())/1000.0)

	// Verify sorted
	sorted := true
	for i := 1; i < N; i++ {
		if copy1[i] < copy1[i-1] {
			sorted = false
			break
		}
	}
	fmt.Printf("Go sort correct: %v\n", sorted)
}
