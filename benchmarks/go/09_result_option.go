package main

import (
	"fmt"
	"time"
)

// Result type — Go's idiomatic (value, error) pair
type Result struct {
	Value int
	Err   string
	IsOk  bool
}

func Ok(v int) Result  { return Result{Value: v, IsOk: true} }
func Err(e string) Result { return Result{Err: e, IsOk: false} }

func resultMap(r Result, fn func(int) int) Result {
	if r.IsOk {
		return Ok(fn(r.Value))
	}
	return r
}

func resultFlatMap(r Result, fn func(int) Result) Result {
	if r.IsOk {
		return fn(r.Value)
	}
	return r
}

func unwrapOr(r Result, def int) int {
	if r.IsOk {
		return r.Value
	}
	return def
}

// Option type
type Option struct {
	Value  int
	IsSome bool
}

func Some(v int) Option { return Option{Value: v, IsSome: true} }

var None = Option{IsSome: false}

func optionUnwrapOr(o Option, def int) int {
	if o.IsSome {
		return o.Value
	}
	return def
}

func benchmarkResultCreation(iterations int) {
	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		var r Result
		if i%3 == 0 {
			r = Ok(i)
		} else {
			r = Err("fail")
		}
		if r.IsOk {
			total += r.Value
		}
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  Result create+check (%d): %.6fms, total=%d\n", iterations, elapsed, total)
}

func benchmarkResultChain(iterations int) {
	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		r := Ok(i)
		r = resultMap(r, func(x int) int { return x * 2 })
		r = resultMap(r, func(x int) int { return x + 1 })
		r = resultMap(r, func(x int) int { return x * 3 })
		total += r.Value
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  Result 3x map (%d): %.6fms, total=%d\n", iterations, elapsed, total)
}

func benchmarkResultFlatmap(iterations int) {
	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		r := Ok(i)
		r = resultFlatMap(r, func(x int) Result {
			if x%2 == 0 {
				return Ok(x * 2)
			}
			return Err("odd")
		})
		if r.IsOk {
			total += r.Value
		}
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  Result flatMap (%d): %.6fms, total=%d\n", iterations, elapsed, total)
}

func benchmarkOptionCreation(iterations int) {
	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		var o Option
		if i%2 == 0 {
			o = Some(i)
		} else {
			o = None
		}
		total += optionUnwrapOr(o, 0)
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  Option create+unwrapOr (%d): %.6fms, total=%d\n", iterations, elapsed, total)
}

func benchmarkUnwrapOr(iterations int) {
	okVal := Ok(42)
	errVal := Err("nope")

	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		if i%2 == 0 {
			total += unwrapOr(okVal, 0)
		} else {
			total += unwrapOr(errVal, 0)
		}
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  unwrapOr alternating (%d): %.6fms, total=%d\n", iterations, elapsed, total)
}

func main() {
	fmt.Println("BENCHMARK: result_option")
	benchmarkResultCreation(1000000)
	benchmarkResultCreation(10000000)
	benchmarkResultChain(1000000)
	benchmarkResultChain(10000000)
	benchmarkResultFlatmap(1000000)
	benchmarkResultFlatmap(10000000)
	benchmarkOptionCreation(1000000)
	benchmarkOptionCreation(10000000)
	benchmarkUnwrapOr(1000000)
	benchmarkUnwrapOr(10000000)
}
