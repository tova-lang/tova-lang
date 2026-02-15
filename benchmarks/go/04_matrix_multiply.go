package main

import (
	"fmt"
	"time"
)

func main() {
	n := 200
	iterations := 3

	matA := make([][]int, n)
	matB := make([][]int, n)
	for i := 0; i < n; i++ {
		matA[i] = make([]int, n)
		matB[i] = make([]int, n)
		for j := 0; j < n; j++ {
			matA[i][j] = (i*n + j) % 100
			matB[i][j] = (i*n + j + 50) % 100
		}
	}

	times := make([]float64, 0, iterations)
	var checksum int

	for iter := 0; iter < iterations; iter++ {
		start := time.Now()

		result := make([][]int, n)
		for i := 0; i < n; i++ {
			result[i] = make([]int, n)
			for j := 0; j < n; j++ {
				val := 0
				for k := 0; k < n; k++ {
					val += matA[i][k] * matB[k][j]
				}
				result[i][j] = val
			}
		}

		elapsed := time.Since(start).Seconds() * 1000
		checksum = result[0][0]
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

	fmt.Println("BENCHMARK: matrix_multiply")
	fmt.Printf("size=%dx%d, iterations=%d\n", n, n, iterations)
	fmt.Printf("checksum=%d\n", checksum)
	fmt.Printf("best=%.6fms\n", best)
	fmt.Printf("avg=%.6fms\n", avg)
}
