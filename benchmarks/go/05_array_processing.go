package main

import (
	"fmt"
	"sort"
	"time"
)

func benchmarkMapFilterReduce(size int) {
	data := make([]int, size)
	for i := 0; i < size; i++ {
		data[i] = i
	}

	start := time.Now()

	filtered := make([]int, 0, size)
	for _, x := range data {
		if x%3 != 0 {
			filtered = append(filtered, x)
		}
	}

	mapped := make([]int, len(filtered))
	for i, x := range filtered {
		mapped[i] = x * x
	}

	result := 0
	for _, x := range mapped {
		result += x
	}

	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  map/filter/reduce (%d items): %.6fms, result=%d\n", size, elapsed, result)
}

func benchmarkSort(size int) {
	data := make([]int, size)
	for i := 0; i < size; i++ {
		data[i] = size - i
	}

	start := time.Now()
	sort.Ints(data)
	elapsed := time.Since(start).Seconds() * 1000

	fmt.Printf("  sort (%d items): %.6fms, first=%d, last=%d\n", size, elapsed, data[0], data[size-1])
}

func benchmarkFind(size int) {
	data := make([]int, size)
	for i := 0; i < size; i++ {
		data[i] = i
	}
	target := size - 1

	start := time.Now()
	found := 0
	for i := 0; i < 100; i++ {
		for _, x := range data {
			if x == target {
				found++
				break
			}
		}
	}
	elapsed := time.Since(start).Seconds() * 1000

	fmt.Printf("  find x100 (%d items): %.6fms, found=%d\n", size, elapsed, found)
}

func main() {
	fmt.Println("BENCHMARK: array_processing")

	benchmarkMapFilterReduce(100000)
	benchmarkMapFilterReduce(1000000)
	benchmarkSort(100000)
	benchmarkSort(1000000)
	benchmarkFind(100000)
	benchmarkFind(1000000)
}
