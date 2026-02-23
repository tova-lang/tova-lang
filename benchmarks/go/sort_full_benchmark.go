package main

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
	"time"
)

func benchSort(name string, n int) {
	data := make([]float64, n)
	for i := range data {
		data[i] = rand.Float64() * 1000000
	}
	
	best := math.MaxFloat64
	for run := 0; run < 3; run++ {
		cp := make([]float64, n)
		copy(cp, data)
		start := time.Now()
		sort.Float64s(cp)
		elapsed := float64(time.Since(start).Microseconds()) / 1000.0
		if elapsed < best {
			best = elapsed
		}
	}
	fmt.Printf("  Sort %11s: %.1fms\n", name, best)
}

func main() {
	fmt.Println("=== Go Sort Benchmark (best of 3 runs) ===")
	benchSort("1,000", 1000)
	benchSort("10,000", 10000)
	benchSort("100,000", 100000)
	benchSort("1,000,000", 1000000)
}
