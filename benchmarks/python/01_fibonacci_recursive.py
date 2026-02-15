import time

def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

# Warmup
fib(20)

n = 35
iterations = 5

times = []
result = 0
for i in range(iterations):
    start = time.perf_counter()
    result = fib(n)
    elapsed = (time.perf_counter() - start) * 1000
    times.append(elapsed)

best = min(times)
avg = sum(times) / len(times)
print("BENCHMARK: fibonacci_recursive")
print(f"n={n}, iterations={iterations}")
print(f"result={result}")
print(f"best={best}ms")
print(f"avg={avg}ms")
