package main

import (
	"fmt"
	"time"
)

type ColorTag int

const (
	ColorRed ColorTag = iota
	ColorGreen
	ColorBlue
)

type Color struct {
	tag        ColorTag
	brightness float64
	r, g       float64
}

func benchmarkVariantMatchAssign(iterations int) {
	colors := []Color{
		{tag: ColorRed},
		{tag: ColorGreen, brightness: 0.5},
		{tag: ColorBlue, r: 0.2, g: 0.8},
		{tag: ColorRed},
	}

	start := time.Now()
	total := 0.0
	for i := 0; i < iterations; i++ {
		c := colors[i%4]
		var val float64
		switch c.tag {
		case ColorRed:
			val = 1.0
		case ColorGreen:
			val = c.brightness * 2.0
		case ColorBlue:
			val = c.r + c.g
		default:
			val = 0.0
		}
		total += val
	}
	elapsed := time.Since(start).Milliseconds()
	fmt.Printf("  variant match assign (%d iters): %dms, total=%f\n", iterations, elapsed, total)
}

func benchmarkLiteralSwitchAssign(iterations int) {
	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		x := i % 5
		var val int
		switch x {
		case 0:
			val = 10
		case 1:
			val = 20
		case 2:
			val = 30
		case 3:
			val = 40
		default:
			val = 50
		}
		total += val
	}
	elapsed := time.Since(start).Milliseconds()
	fmt.Printf("  literal switch assign (%d iters): %dms, total=%d\n", iterations, elapsed, total)
}

func benchmarkIfExprAssign(iterations int) {
	start := time.Now()
	total := 0.0
	for i := 0; i < iterations; i++ {
		x := i % 3
		var val float64
		if x == 0 {
			a := 1.5
			val = a * 2.0
		} else if x == 1 {
			b := 2.5
			val = b * 3.0
		} else {
			c := 3.5
			val = c * 4.0
		}
		total += val
	}
	elapsed := time.Since(start).Milliseconds()
	fmt.Printf("  if-expr assign (%d iters): %dms, total=%f\n", iterations, elapsed, total)
}

func main() {
	fmt.Println("BENCHMARK: iife_elimination (Go)")
	benchmarkVariantMatchAssign(1000000)
	benchmarkVariantMatchAssign(10000000)
	benchmarkLiteralSwitchAssign(1000000)
	benchmarkLiteralSwitchAssign(10000000)
	benchmarkIfExprAssign(1000000)
	benchmarkIfExprAssign(10000000)
}
