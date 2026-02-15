import time
from functools import reduce

def benchmark_map_filter_reduce(size):
    data = list(range(size))

    start = time.perf_counter()

    filtered = list(filter(lambda x: x % 3 != 0, data))
    mapped = list(map(lambda x: x * x, filtered))
    result = reduce(lambda acc, x: acc + x, mapped, 0)

    elapsed = (time.perf_counter() - start) * 1000
    print(f"  map/filter/reduce ({size} items): {elapsed}ms, result={result}")

def benchmark_sort(size):
    data = list(range(size, 0, -1))

    start = time.perf_counter()
    sorted_data = sorted(data)
    elapsed = (time.perf_counter() - start) * 1000

    print(f"  sort ({size} items): {elapsed}ms, first={sorted_data[0]}, last={sorted_data[-1]}")

def benchmark_find(size):
    data = list(range(size))
    target = size - 1

    start = time.perf_counter()
    found = 0
    for _ in range(100):
        r = next((x for x in data if x == target), None)
        if r is not None:
            found += 1
    elapsed = (time.perf_counter() - start) * 1000

    print(f"  find x100 ({size} items): {elapsed}ms, found={found}")

print("BENCHMARK: array_processing")

benchmark_map_filter_reduce(100000)
benchmark_map_filter_reduce(1000000)
benchmark_sort(100000)
benchmark_sort(1000000)
benchmark_find(100000)
benchmark_find(1000000)
