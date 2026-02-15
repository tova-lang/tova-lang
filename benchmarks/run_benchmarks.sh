#!/bin/bash
# Tova vs Python vs Go Benchmark Suite
# Runs all 7 benchmarks in all three languages and collects results

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PY_DIR="$SCRIPT_DIR/python"
GO_DIR="$SCRIPT_DIR/go"

echo "============================================================"
echo "  TOVA vs PYTHON vs GO BENCHMARK SUITE"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Platform: $(uname -s) $(uname -m)"
echo "  Bun: $(bun --version)"
echo "  Python: $(python3 --version 2>&1 | awk '{print $2}')"
echo "  Go: $(go version | awk '{print $3}')"
echo "============================================================"
echo ""

# Pre-compile Go binaries for fair comparison
echo "Compiling Go binaries..."
GO_BINS="$SCRIPT_DIR/.go-bins"
mkdir -p "$GO_BINS"
for f in "$GO_DIR"/*.go; do
    name=$(basename "$f" .go)
    go build -o "$GO_BINS/$name" "$f"
    echo "  compiled $name"
done
echo ""

BENCHMARKS=(
    "01_fibonacci_recursive"
    "02_fibonacci_iterative"
    "03_prime_sieve"
    "04_matrix_multiply"
    "05_array_processing"
    "06_string_operations"
    "07_nbody"
)

declare -a TOVA_RESULTS
declare -a PY_RESULTS
declare -a GO_RESULTS

for bench in "${BENCHMARKS[@]}"; do
    echo "------------------------------------------------------------"
    echo "  Running: $bench"
    echo "------------------------------------------------------------"

    echo ""
    echo "  [Tova]"
    tova_output=$(cd "$ROOT_DIR" && bun bin/tova.js run "benchmarks/${bench}.tova" 2>/dev/null)
    echo "$tova_output" | sed 's/^/    /'

    echo ""
    echo "  [Python]"
    py_output=$(python3 "$PY_DIR/${bench}.py" 2>/dev/null)
    echo "$py_output" | sed 's/^/    /'

    echo ""
    echo "  [Go]"
    go_output=$("$GO_BINS/$bench" 2>/dev/null)
    echo "$go_output" | sed 's/^/    /'

    echo ""

    TOVA_RESULTS+=("$tova_output")
    PY_RESULTS+=("$py_output")
    GO_RESULTS+=("$go_output")
done

echo "============================================================"
echo "  SUMMARY"
echo "============================================================"
echo ""
printf "%-28s %12s %12s %12s %10s %10s\n" "Benchmark" "Tova (ms)" "Python (ms)" "Go (ms)" "vs Python" "vs Go"
printf "%-28s %12s %12s %12s %10s %10s\n" "----------------------------" "------------" "------------" "------------" "----------" "----------"

extract_time() {
    local out="$1"
    local t
    t=$(echo "$out" | grep -oE 'best=[0-9.]+' | head -1 | cut -d= -f2)
    if [ -z "$t" ]; then
        t=$(echo "$out" | grep -oE 'time=[0-9.]+' | head -1 | cut -d= -f2)
    fi
    if [ -z "$t" ]; then
        t=$(echo "$out" | grep "1000000" | head -1 | grep -oE '[0-9.]+ms' | head -1 | sed 's/ms//')
    fi
    echo "$t"
}

for i in "${!BENCHMARKS[@]}"; do
    bench="${BENCHMARKS[$i]}"
    tova_time=$(extract_time "${TOVA_RESULTS[$i]}")
    py_time=$(extract_time "${PY_RESULTS[$i]}")
    go_time=$(extract_time "${GO_RESULTS[$i]}")

    vs_py="N/A"
    vs_go="N/A"
    if [ -n "$tova_time" ] && [ -n "$py_time" ]; then
        vs_py=$(echo "scale=2; $py_time / $tova_time" | bc 2>/dev/null || echo "N/A")
        vs_py="${vs_py}x"
    fi
    if [ -n "$tova_time" ] && [ -n "$go_time" ]; then
        vs_go=$(echo "scale=2; $tova_time / $go_time" | bc 2>/dev/null || echo "N/A")
        vs_go="${vs_go}x"
    fi

    printf "%-28s %12s %12s %12s %10s %10s\n" \
        "$bench" \
        "${tova_time:-N/A}" \
        "${py_time:-N/A}" \
        "${go_time:-N/A}" \
        "$vs_py" \
        "$vs_go"
done

echo ""
echo "vs Python = Python/Tova (higher means Tova is faster)"
echo "vs Go     = Tova/Go    (lower means Tova is closer to Go)"
echo ""

# Cleanup
rm -rf "$GO_BINS"
