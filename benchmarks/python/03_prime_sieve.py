import time

def sieve(limit):
    flags = [True] * (limit + 1)
    flags[0] = flags[1] = False

    p = 2
    while p * p <= limit:
        if flags[p]:
            m = p * p
            while m <= limit:
                flags[m] = False
                m += p
        p += 1

    return sum(flags)

# Warmup
sieve(1000)

limit = 10000000
iterations = 5

times = []
primes_found = 0
for _ in range(iterations):
    start = time.perf_counter()
    primes_found = sieve(limit)
    elapsed = (time.perf_counter() - start) * 1000
    times.append(elapsed)

best = min(times)
avg = sum(times) / len(times)
print("BENCHMARK: prime_sieve")
print(f"limit={limit}, iterations={iterations}")
print(f"primes_found={primes_found}")
print(f"best={best}ms")
print(f"avg={avg}ms")
