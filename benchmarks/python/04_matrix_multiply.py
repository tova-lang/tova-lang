import time

n = 200
iterations = 3

mat_a = [[(i * n + j) % 100 for j in range(n)] for i in range(n)]
mat_b = [[(i * n + j + 50) % 100 for j in range(n)] for i in range(n)]

times = []
checksum = 0

for _ in range(iterations):
    start = time.perf_counter()

    result = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            val = 0
            for k in range(n):
                val += mat_a[i][k] * mat_b[k][j]
            result[i][j] = val

    elapsed = (time.perf_counter() - start) * 1000
    checksum = result[0][0]
    times.append(elapsed)

best = min(times)
avg = sum(times) / len(times)
print("BENCHMARK: matrix_multiply")
print(f"size={n}x{n}, iterations={iterations}")
print(f"checksum={checksum}")
print(f"best={best}ms")
print(f"avg={avg}ms")
