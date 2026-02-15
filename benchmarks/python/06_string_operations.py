import time

def benchmark_string_concat(n):
    parts = [str(i) for i in range(n)]
    start = time.perf_counter()
    result = ",".join(parts)
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  join {n} strings: {elapsed}ms, len={len(result)}")

def benchmark_string_split(n):
    parts = [str(i) for i in range(n)]
    big_str = ",".join(parts)

    start = time.perf_counter()
    tokens = big_str.split(",")
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  split {n} tokens: {elapsed}ms, count={len(tokens)}")

def benchmark_string_replace(n):
    base = "hello world " * 1000

    start = time.perf_counter()
    for _ in range(n):
        result = base.replace("world", "tova")
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  replace x{n}: {elapsed}ms")

def benchmark_string_search(n):
    haystack = "abcdefghij" * 10000

    start = time.perf_counter()
    found_count = 0
    for _ in range(n):
        if "fghij" in haystack:
            found_count += 1
    elapsed = (time.perf_counter() - start) * 1000
    print(f"  contains x{n}: {elapsed}ms, found={found_count}")

print("BENCHMARK: string_operations")
benchmark_string_concat(100000)
benchmark_string_concat(1000000)
benchmark_string_split(100000)
benchmark_string_split(1000000)
benchmark_string_replace(10000)
benchmark_string_search(100000)
