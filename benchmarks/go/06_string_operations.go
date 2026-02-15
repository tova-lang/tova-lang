package main

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

func benchmarkStringConcat(n int) {
	parts := make([]string, n)
	for i := 0; i < n; i++ {
		parts[i] = strconv.Itoa(i)
	}
	start := time.Now()
	result := strings.Join(parts, ",")
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  join %d strings: %.6fms, len=%d\n", n, elapsed, len(result))
}

func benchmarkStringSplit(n int) {
	parts := make([]string, n)
	for i := 0; i < n; i++ {
		parts[i] = strconv.Itoa(i)
	}
	bigStr := strings.Join(parts, ",")

	start := time.Now()
	tokens := strings.Split(bigStr, ",")
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  split %d tokens: %.6fms, count=%d\n", n, elapsed, len(tokens))
}

func benchmarkStringReplace(n int) {
	base := strings.Repeat("hello world ", 1000)

	start := time.Now()
	var result string
	for i := 0; i < n; i++ {
		result = strings.ReplaceAll(base, "world", "tova")
	}
	_ = result
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  replace x%d: %.6fms\n", n, elapsed)
}

func benchmarkStringSearch(n int) {
	haystack := strings.Repeat("abcdefghij", 10000)

	start := time.Now()
	foundCount := 0
	for i := 0; i < n; i++ {
		if strings.Contains(haystack, "fghij") {
			foundCount++
		}
	}
	elapsed := time.Since(start).Seconds() * 1000
	fmt.Printf("  contains x%d: %.6fms, found=%d\n", n, elapsed, foundCount)
}

func main() {
	fmt.Println("BENCHMARK: string_operations")
	benchmarkStringConcat(100000)
	benchmarkStringConcat(1000000)
	benchmarkStringSplit(100000)
	benchmarkStringSplit(1000000)
	benchmarkStringReplace(10000)
	benchmarkStringSearch(100000)
}
