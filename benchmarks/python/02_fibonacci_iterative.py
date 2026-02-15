import time
import math

def fib_iter(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

# Warmup
fib_iter(1000)

n = 50
iterations = 1000000

start = time.perf_counter()
result = 0
for _ in range(iterations):
    result = fib_iter(n)
elapsed = (time.perf_counter() - start) * 1000

ops_per_sec = math.floor(iterations / (elapsed / 1000))
print("BENCHMARK: fibonacci_iterative")
print(f"n={n}, iterations={iterations}")
print(f"result={result}")
print(f"time={elapsed}ms")
print(f"ops_per_sec={ops_per_sec}")
