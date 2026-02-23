package main

import (
	"fmt"
	"time"
)

type ShapeTag int

const (
	CircleTag   ShapeTag = 0
	RectTag     ShapeTag = 1
	TriangleTag ShapeTag = 2
	PointTag    ShapeTag = 3
)

type Shape struct {
	Tag    ShapeTag
	F1, F2 float64
}

func Circle(r float64) Shape   { return Shape{Tag: CircleTag, F1: r} }
func Rect(w, h float64) Shape  { return Shape{Tag: RectTag, F1: w, F2: h} }
func Triangle(b, h float64) Shape { return Shape{Tag: TriangleTag, F1: b, F2: h} }
func Point() Shape              { return Shape{Tag: PointTag} }

func area(s Shape) float64 {
	switch s.Tag {
	case CircleTag:
		return 3.14159265 * s.F1 * s.F1
	case RectTag:
		return s.F1 * s.F2
	case TriangleTag:
		return 0.5 * s.F1 * s.F2
	case PointTag:
		return 0.0
	}
	return 0.0
}

func benchmarkMatchDispatch(iterations int) {
	shapes := [4]Shape{
		Circle(5.0),
		Rect(3.0, 4.0),
		Triangle(6.0, 3.0),
		Point(),
	}

	start := time.Now()
	total := 0.0
	for i := 0; i < iterations; i++ {
		s := shapes[i%4]
		total += area(s)
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  match dispatch (%d iters): %.6fms, total=%f\n", iterations, elapsed, total)
}

func benchmarkMatchCreation(iterations int) {
	start := time.Now()
	total := 0.0
	for i := 0; i < iterations; i++ {
		var s Shape
		switch i % 4 {
		case 0:
			s = Circle(1.0)
		case 1:
			s = Rect(2.0, 3.0)
		case 2:
			s = Triangle(4.0, 5.0)
		default:
			s = Point()
		}
		total += area(s)
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  create+match (%d iters): %.6fms, total=%f\n", iterations, elapsed, total)
}

func benchmarkNestedMatch(iterations int) {
	start := time.Now()
	total := 0
	for i := 0; i < iterations; i++ {
		x := i % 10
		var result int
		switch x {
		case 0:
			result = 1
		case 1:
			result = 2
		case 2:
			result = 3
		case 3:
			result = 4
		case 4:
			result = 5
		case 5:
			result = 6
		case 6:
			result = 7
		case 7:
			result = 8
		case 8:
			result = 9
		default:
			result = 10
		}
		total += result
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  10-arm match (%d iters): %.6fms, total=%d\n", iterations, elapsed, total)
}

func main() {
	fmt.Println("BENCHMARK: pattern_matching")
	benchmarkMatchDispatch(1000000)
	benchmarkMatchDispatch(10000000)
	benchmarkMatchCreation(1000000)
	benchmarkMatchCreation(10000000)
	benchmarkNestedMatch(1000000)
	benchmarkNestedMatch(10000000)
}
