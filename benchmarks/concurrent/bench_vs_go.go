package main

import (
	"fmt"
	"runtime"
	"sync"
	"time"
)

// Tova vs Go Concurrency Benchmark Suite
//
// Output format: RESULT:<name>:<value>:<unit>
// This format is parsed by run_comparison.sh for side-by-side comparison.

func fib(n int64) int64 {
	var prev, curr int64 = 0, 1
	for i := int64(0); i < n; i++ {
		prev, curr = curr, prev+curr
	}
	return prev
}

// Benchmark 1: Spawn overhead — 100K empty goroutine pairs
func benchSpawnOverhead() {
	const N = 100_000
	var wg sync.WaitGroup

	t0 := time.Now()
	for i := 0; i < N; i++ {
		wg.Add(2)
		go func() { wg.Done() }()
		go func() { wg.Done() }()
	}
	wg.Wait()
	elapsed := time.Since(t0)

	ms := float64(elapsed.Microseconds()) / 1000.0
	fmt.Printf("RESULT:spawn_overhead:%.2f:ms\n", ms)
}

// Benchmark 2: Channel throughput — 1M messages, buffered channel, concurrent producer+consumer
func benchChannelThroughput() {
	const N = 1_000_000
	ch := make(chan int64, 1024)

	var sum int64
	var wg sync.WaitGroup
	wg.Add(1)

	t0 := time.Now()

	// Consumer
	go func() {
		defer wg.Done()
		for val := range ch {
			sum += val
		}
	}()

	// Producer
	for i := int64(0); i < N; i++ {
		ch <- i
	}
	close(ch)
	wg.Wait()
	elapsed := time.Since(t0)

	expected := int64(N) * int64(N-1) / 2
	if sum != expected {
		fmt.Printf("VERIFY FAILED: sum=%d expected=%d\n", sum, expected)
	}

	ms := float64(elapsed.Microseconds()) / 1000.0
	fmt.Printf("RESULT:channel_throughput:%.2f:ms\n", ms)
}

// Benchmark 3: Ping-pong latency — 100K round-trips through 2 unbuffered channels
func benchPingPong() {
	const N = 100_000
	ping := make(chan int64)
	pong := make(chan int64)

	// Ponger: receives on ping, sends on pong
	go func() {
		for i := 0; i < N; i++ {
			val := <-ping
			pong <- val + 1
		}
	}()

	t0 := time.Now()
	var lastVal int64
	for i := 0; i < N; i++ {
		ping <- int64(i)
		lastVal = <-pong
	}
	elapsed := time.Since(t0)

	if lastVal != int64(N-1)+1 {
		fmt.Printf("VERIFY FAILED: lastVal=%d expected=%d\n", lastVal, int64(N-1)+1)
	}

	ms := float64(elapsed.Microseconds()) / 1000.0
	fmt.Printf("RESULT:ping_pong:%.2f:ms\n", ms)
}

// Benchmark 4: Fan-out — 1 producer, 4 consumers, 100K items through shared channel
func benchFanOut() {
	const N = 100_000
	const WORKERS = 4
	ch := make(chan int64, 256)

	var sums [WORKERS]int64
	var wg sync.WaitGroup

	t0 := time.Now()

	// Consumers
	for w := 0; w < WORKERS; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for val := range ch {
				sums[id] += val
			}
		}(w)
	}

	// Producer
	for i := int64(0); i < N; i++ {
		ch <- i
	}
	close(ch)
	wg.Wait()
	elapsed := time.Since(t0)

	var totalSum int64
	for _, s := range sums {
		totalSum += s
	}
	expected := int64(N) * int64(N-1) / 2
	if totalSum != expected {
		fmt.Printf("VERIFY FAILED: sum=%d expected=%d\n", totalSum, expected)
	}

	ms := float64(elapsed.Microseconds()) / 1000.0
	fmt.Printf("RESULT:fan_out:%.2f:ms\n", ms)
}

// Benchmark 5: Select multiplexing — select across 4 channels, 100K total messages
func benchSelectMultiplex() {
	const N = 100_000
	const CHANS = 4
	var chs [CHANS]chan int64
	for i := 0; i < CHANS; i++ {
		chs[i] = make(chan int64, 64)
	}

	// Producers: each sends N/CHANS messages
	var wg sync.WaitGroup
	perChan := N / CHANS
	for c := 0; c < CHANS; c++ {
		wg.Add(1)
		go func(ch chan int64) {
			defer wg.Done()
			for i := 0; i < perChan; i++ {
				ch <- int64(i)
			}
			close(ch)
		}(chs[c])
	}

	t0 := time.Now()

	var sum int64
	received := 0
	closed := 0
	for closed < CHANS {
		select {
		case val, ok := <-chs[0]:
			if !ok {
				chs[0] = nil
				closed++
			} else {
				sum += val
				received++
			}
		case val, ok := <-chs[1]:
			if !ok {
				chs[1] = nil
				closed++
			} else {
				sum += val
				received++
			}
		case val, ok := <-chs[2]:
			if !ok {
				chs[2] = nil
				closed++
			} else {
				sum += val
				received++
			}
		case val, ok := <-chs[3]:
			if !ok {
				chs[3] = nil
				closed++
			} else {
				sum += val
				received++
			}
		}
	}
	wg.Wait()
	elapsed := time.Since(t0)

	if received != N {
		fmt.Printf("VERIFY FAILED: received=%d expected=%d\n", received, N)
	}

	ms := float64(elapsed.Microseconds()) / 1000.0
	fmt.Printf("RESULT:select_multiplex:%.2f:ms\n", ms)
}

// Benchmark 6: Concurrent compute — 4 workers each running fib(30) × REPS
// Uses repeated fib(30) calls to create measurable workload on both runtimes.
func benchConcurrentCompute() {
	const WORKERS = 4
	const FIB_N int64 = 30
	const REPS = 10_000
	expected := int64(832040) * REPS

	computeWork := func() int64 {
		var sum int64
		for r := 0; r < REPS; r++ {
			sum += fib(FIB_N)
		}
		return sum
	}

	// Sequential
	t0 := time.Now()
	var seqSum int64
	for i := 0; i < WORKERS; i++ {
		seqSum += computeWork()
	}
	seqElapsed := time.Since(t0)

	if seqSum != expected*WORKERS {
		fmt.Printf("VERIFY FAILED: seqSum=%d expected=%d\n", seqSum, expected*WORKERS)
	}

	// Concurrent
	results := make([]int64, WORKERS)
	var wg sync.WaitGroup

	t1 := time.Now()
	for i := 0; i < WORKERS; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = computeWork()
		}(i)
	}
	wg.Wait()
	concElapsed := time.Since(t1)

	var concSum int64
	for _, r := range results {
		concSum += r
	}
	if concSum != expected*WORKERS {
		fmt.Printf("VERIFY FAILED: concSum=%d expected=%d\n", concSum, expected*WORKERS)
	}

	seqMs := float64(seqElapsed.Microseconds()) / 1000.0
	concMs := float64(concElapsed.Microseconds()) / 1000.0
	fmt.Printf("RESULT:compute_sequential:%.2f:ms\n", seqMs)
	fmt.Printf("RESULT:compute_concurrent:%.2f:ms\n", concMs)
}

func main() {
	fmt.Printf("Go Benchmark Suite — GOMAXPROCS=%d\n", runtime.GOMAXPROCS(0))

	benchSpawnOverhead()
	benchChannelThroughput()
	benchPingPong()
	benchFanOut()
	benchSelectMultiplex()
	benchConcurrentCompute()

	fmt.Println("DONE")
}
