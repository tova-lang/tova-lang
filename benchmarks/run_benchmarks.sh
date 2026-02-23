#!/bin/bash
# Tova Comprehensive Benchmark Suite
# Runs all benchmarks across Tova, Go, and Python (where available)
# Usage: ./run_benchmarks.sh [--quick] [--tova-only] [benchmark_number]
#   --quick:     Run only benchmarks 01-07 (classic suite)
#   --tova-only: Skip Go and Python
#   benchmark_number: Run a single benchmark (e.g., 08)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PY_DIR="$SCRIPT_DIR/python"
GO_DIR="$SCRIPT_DIR/go"

# Parse flags
QUICK=false
TOVA_ONLY=false
SINGLE=""
for arg in "$@"; do
    case "$arg" in
        --quick)     QUICK=true ;;
        --tova-only) TOVA_ONLY=true ;;
        [0-9]*)      SINGLE="$arg" ;;
    esac
done

echo "============================================================"
echo "  TOVA BENCHMARK SUITE"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Platform: $(uname -s) $(uname -m)"
echo "  Bun: $(bun --version 2>/dev/null || echo 'N/A')"
if [ "$TOVA_ONLY" = false ]; then
    echo "  Go: $(go version 2>/dev/null | awk '{print $3}' || echo 'N/A')"
    echo "  Python: $(python3 --version 2>&1 | awk '{print $2}' || echo 'N/A')"
fi
echo "============================================================"
echo ""

# All benchmarks in order
ALL_BENCHMARKS=(
    "01_fibonacci_recursive"
    "02_fibonacci_iterative"
    "03_prime_sieve"
    "04_matrix_multiply"
    "05_array_processing"
    "06_string_operations"
    "07_nbody"
    "08_pattern_matching"
    "09_result_option"
    "10_iife_elimination"
    "11_sort_benchmark"
    "12_parallel_map"
    "13_wasm_functions"
    "14_typed_arrays"
)

# Select benchmarks to run
if [ -n "$SINGLE" ]; then
    BENCHMARKS=()
    for b in "${ALL_BENCHMARKS[@]}"; do
        if [[ "$b" == ${SINGLE}* ]]; then
            BENCHMARKS+=("$b")
        fi
    done
    if [ ${#BENCHMARKS[@]} -eq 0 ]; then
        echo "Error: No benchmark matching '$SINGLE'"
        exit 1
    fi
elif [ "$QUICK" = true ]; then
    BENCHMARKS=("${ALL_BENCHMARKS[@]:0:7}")
else
    BENCHMARKS=("${ALL_BENCHMARKS[@]}")
fi

# Pre-compile Go binaries for fair comparison (exclude compilation time)
if [ "$TOVA_ONLY" = false ]; then
    echo "Compiling Go binaries..."
    GO_BINS="$SCRIPT_DIR/.go-bins"
    mkdir -p "$GO_BINS"
    compiled=0
    for bench in "${BENCHMARKS[@]}"; do
        if [ -f "$GO_DIR/${bench}.go" ]; then
            go build -o "$GO_BINS/$bench" "$GO_DIR/${bench}.go" 2>/dev/null && {
                echo "  compiled $bench"
                compiled=$((compiled + 1))
            } || echo "  FAILED: $bench"
        fi
    done
    echo "  $compiled Go binaries ready"
    echo ""
fi

# Run benchmarks
declare -a NAMES
declare -a TOVA_TIMES
declare -a GO_TIMES
declare -a PY_TIMES

extract_time() {
    local out="$1"
    local t=""
    # Try: best=NNN format
    t=$(echo "$out" | grep -oE 'best=[0-9.]+' | head -1 | cut -d= -f2)
    # Try: time=NNN format
    if [ -z "$t" ]; then
        t=$(echo "$out" | grep -oE 'time=[0-9.]+' | head -1 | cut -d= -f2)
    fi
    # Try: NNNms in 10000000 iteration line (the big run)
    if [ -z "$t" ]; then
        t=$(echo "$out" | grep "10000000" | head -1 | grep -oE '[0-9.]+ms' | head -1 | sed 's/ms//')
    fi
    # Try: NNNms in 1000000 iteration line
    if [ -z "$t" ]; then
        t=$(echo "$out" | grep "1000000" | head -1 | grep -oE '[0-9.]+ms' | head -1 | sed 's/ms//')
    fi
    # Try: any NNNms
    if [ -z "$t" ]; then
        t=$(echo "$out" | grep -oE '[0-9.]+ms' | tail -1 | sed 's/ms//')
    fi
    echo "$t"
}

idx=0
for bench in "${BENCHMARKS[@]}"; do
    echo "------------------------------------------------------------"
    echo "  $bench"
    echo "------------------------------------------------------------"

    # --- Tova ---
    tova_output=""
    tova_time=""
    if [ -f "$SCRIPT_DIR/${bench}.tova" ]; then
        echo "  [Tova]"
        tova_output=$(cd "$ROOT_DIR" && bun bin/tova.js run "benchmarks/${bench}.tova" 2>/dev/null) || true
        echo "$tova_output" | sed 's/^/    /'
        tova_time=$(extract_time "$tova_output")
    else
        echo "  [Tova] (no file)"
    fi

    # --- Go ---
    go_output=""
    go_time=""
    if [ "$TOVA_ONLY" = false ] && [ -f "$GO_BINS/$bench" ]; then
        echo "  [Go]"
        go_output=$("$GO_BINS/$bench" 2>/dev/null) || true
        echo "$go_output" | sed 's/^/    /'
        go_time=$(extract_time "$go_output")
    elif [ "$TOVA_ONLY" = false ]; then
        echo "  [Go] (no benchmark)"
    fi

    # --- Python ---
    py_output=""
    py_time=""
    if [ "$TOVA_ONLY" = false ] && [ -f "$PY_DIR/${bench}.py" ]; then
        echo "  [Python]"
        py_output=$(python3 "$PY_DIR/${bench}.py" 2>/dev/null) || true
        echo "$py_output" | sed 's/^/    /'
        py_time=$(extract_time "$py_output")
    fi

    NAMES+=("$bench")
    TOVA_TIMES+=("$tova_time")
    GO_TIMES+=("$go_time")
    PY_TIMES+=("$py_time")
    echo ""
done

# Summary table
echo "============================================================"
echo "  SUMMARY"
echo "============================================================"
echo ""

if [ "$TOVA_ONLY" = false ]; then
    printf "%-30s %12s %12s %10s\n" "Benchmark" "Tova (ms)" "Go (ms)" "Tova/Go"
    printf "%-30s %12s %12s %10s\n" "------------------------------" "------------" "------------" "----------"
else
    printf "%-30s %12s\n" "Benchmark" "Tova (ms)"
    printf "%-30s %12s\n" "------------------------------" "------------"
fi

wins=0
ties=0
losses=0
total_compared=0

for i in "${!NAMES[@]}"; do
    bench="${NAMES[$i]}"
    tt="${TOVA_TIMES[$i]}"
    gt="${GO_TIMES[$i]}"

    vs_go=""
    status=""
    if [ -n "$tt" ] && [ -n "$gt" ] && [ "$TOVA_ONLY" = false ]; then
        ratio=$(echo "scale=2; $tt / $gt" | bc 2>/dev/null || echo "")
        if [ -n "$ratio" ]; then
            vs_go="${ratio}x"
            total_compared=$((total_compared + 1))
            # Check win/tie/loss (< 1.0 = win, 1.0-1.1 = tie, > 1.1 = loss)
            is_win=$(echo "$ratio < 1.0" | bc 2>/dev/null || echo "0")
            is_tie=$(echo "$ratio <= 1.1" | bc 2>/dev/null || echo "0")
            if [ "$is_win" = "1" ]; then
                wins=$((wins + 1))
                status=" BEATS GO"
            elif [ "$is_tie" = "1" ]; then
                ties=$((ties + 1))
                status=" ~tie"
            else
                losses=$((losses + 1))
            fi
        fi
    fi

    if [ "$TOVA_ONLY" = false ]; then
        printf "%-30s %12s %12s %10s%s\n" \
            "$bench" \
            "${tt:-N/A}" \
            "${gt:-N/A}" \
            "${vs_go:-N/A}" \
            "$status"
    else
        printf "%-30s %12s\n" "$bench" "${tt:-N/A}"
    fi
done

echo ""
if [ "$TOVA_ONLY" = false ] && [ $total_compared -gt 0 ]; then
    echo "Tova/Go = ratio (< 1.0 means Tova is faster)"
    echo ""
    echo "Scorecard: $wins wins, $ties ties, $losses losses (out of $total_compared compared)"
fi
echo ""

# Cleanup
if [ "$TOVA_ONLY" = false ]; then
    rm -rf "$GO_BINS"
fi
