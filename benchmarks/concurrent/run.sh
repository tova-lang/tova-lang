#!/bin/bash
# Tova vs Go Concurrency Benchmarks
# Compares: Tokio/Wasmtime/Crossbeam (Tova native addon) vs Go goroutines/channels
#
# Usage: bash benchmarks/concurrent/run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "============================================================"
echo "  TOVA vs GO — CONCURRENCY BENCHMARKS"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Platform: $(uname -s) $(uname -m)"
echo "  Bun: $(bun --version 2>/dev/null || echo 'N/A')"
echo "  Go: $(go version 2>/dev/null | awk '{print $3}' || echo 'N/A')"
echo "============================================================"
echo ""

# Step 1: Build Tova native runtime (Rust)
echo "--- Building tova_runtime (Rust/napi-rs) ---"
if [ -d "$ROOT_DIR/tova_runtime" ]; then
    cd "$ROOT_DIR/tova_runtime"
    cargo build --release 2>&1 | tail -3
    echo "  Build complete."
else
    echo "  ERROR: tova_runtime/ directory not found at $ROOT_DIR/tova_runtime"
    exit 1
fi
echo ""

# Step 2: Run Tova benchmarks
echo "============================================================"
echo "  TOVA BENCHMARKS"
echo "============================================================"
cd "$ROOT_DIR"
bun "$SCRIPT_DIR/tova_bench.js"

# Step 3: Build and run Go benchmarks
echo "============================================================"
echo "  GO BENCHMARKS"
echo "============================================================"
if command -v go &>/dev/null; then
    go build -o "$SCRIPT_DIR/go_bench_bin" "$SCRIPT_DIR/go_bench.go"
    "$SCRIPT_DIR/go_bench_bin"
    rm -f "$SCRIPT_DIR/go_bench_bin"
else
    echo "  Go not installed — skipping Go benchmarks"
fi
echo ""

echo "============================================================"
echo "  COMPARISON COMPLETE"
echo "============================================================"
echo ""
echo "Notes:"
echo "  - Tova uses Tokio (task scheduler) + Wasmtime (WASM execution) + Crossbeam (channels)"
echo "  - Go uses goroutines (task scheduler) + native channels"
echo "  - Tova WASM tasks have Wasmtime instantiation overhead per-task"
echo "  - Go add/fib are native compiled — no WASM overhead"
echo "  - Channel benchmarks are most directly comparable (both use bounded channels)"
