package main

import (
	"fmt"
	"math"
	"time"
)

func dotProduct(a, b []float64) float64 {
	s := 0.0
	for i := 0; i < len(a); i++ {
		s += a[i] * b[i]
	}
	return s
}

func vectorAdd(a, b []float64) []float64 {
	n := len(a)
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		out[i] = a[i] + b[i]
	}
	return out
}

func vectorNorm(arr []float64) float64 {
	s := 0.0
	for i := 0; i < len(arr); i++ {
		s += arr[i] * arr[i]
	}
	return math.Sqrt(s)
}

func matrixVectorMul(mat, vec []float64, rows, cols int) []float64 {
	out := make([]float64, rows)
	for i := 0; i < rows; i++ {
		s := 0.0
		for j := 0; j < cols; j++ {
			s += mat[i*cols+j] * vec[j]
		}
		out[i] = s
	}
	return out
}

func kahanSum(arr []float64) float64 {
	s := 0.0
	c := 0.0
	for i := 0; i < len(arr); i++ {
		y := arr[i] - c
		t := s + y
		c = (t - s) - y
		s = t
	}
	return s
}

func linspace(start, end float64, n int) []float64 {
	arr := make([]float64, n)
	if n <= 1 {
		if n == 1 {
			arr[0] = start
		}
		return arr
	}
	step := (end - start) / float64(n-1)
	for i := 0; i < n; i++ {
		arr[i] = start + float64(i)*step
	}
	return arr
}

func main() {
	n := 1000000
	iters := 100

	a := linspace(0.0, 1.0, n)
	b := linspace(1.0, 2.0, n)

	// Benchmark 1: Dot product
	t0 := time.Now()
	var result float64
	for k := 0; k < iters; k++ {
		result = dotProduct(a, b)
	}
	t1 := time.Since(t0)
	fmt.Printf("Dot product 1M x %d: %dms (result: %f)\n", iters, t1.Milliseconds(), result)

	// Benchmark 2: Vector addition
	t2 := time.Now()
	var out []float64
	for k := 0; k < iters; k++ {
		out = vectorAdd(a, b)
	}
	t3 := time.Since(t2)
	_ = out
	fmt.Printf("Vector add 1M x %d: %dms\n", iters, t3.Milliseconds())

	// Benchmark 3: Vector norm
	t4 := time.Now()
	var normResult float64
	for k := 0; k < iters; k++ {
		normResult = vectorNorm(a)
	}
	t5 := time.Since(t4)
	fmt.Printf("Vector norm 1M x %d: %dms (result: %f)\n", iters, t5.Milliseconds(), normResult)

	// Benchmark 4: Matrix-vector multiply
	matSize := 1000
	mat := linspace(0.0, 1.0, matSize*matSize)
	vec := linspace(0.0, 1.0, matSize)

	t6 := time.Now()
	var mvResult []float64
	for k := 0; k < iters; k++ {
		mvResult = matrixVectorMul(mat, vec, matSize, matSize)
	}
	t7 := time.Since(t6)
	_ = mvResult
	fmt.Printf("MatVec 1000x1000 x %d: %dms\n", iters, t7.Milliseconds())

	// Benchmark 5: Kahan sum
	t8 := time.Now()
	var sumResult float64
	for k := 0; k < iters; k++ {
		sumResult = kahanSum(a)
	}
	t9 := time.Since(t8)
	fmt.Printf("Kahan sum 1M x %d: %dms (result: %f)\n", iters, t9.Milliseconds(), sumResult)
}
