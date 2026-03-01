#!/bin/bash
# Tova vs Go — Concurrency Comparison Runner
#
# Runs both Go and Tova/JS benchmarks and prints a formatted comparison table.
#
# Usage: bash benchmarks/concurrent/run_comparison.sh
#
# Requirements:
#   - go (for Go benchmarks)
#   - bun (for Tova/JS benchmarks)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Header ──

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          TOVA vs GO — CONCURRENCY BENCHMARK COMPARISON         ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Date:     $(date '+%Y-%m-%d %H:%M:%S')                              ║"
printf "║  Platform: %-52s ║\n" "$(uname -s) $(uname -m)"
printf "║  Bun:      %-52s ║\n" "$(bun --version 2>/dev/null || echo 'N/A')"
printf "║  Go:       %-52s ║\n" "$(go version 2>/dev/null | awk '{print $3" "$4}' || echo 'N/A')"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── Build Tova native runtime ──

echo "▸ Building tova_runtime (Rust/napi-rs)..."
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -d "$ROOT_DIR/tova_runtime" ]; then
  cd "$ROOT_DIR/tova_runtime"
  cargo build --release 2>&1 | tail -3
  cd "$ROOT_DIR"
  echo "  Done."
else
  echo "  ERROR: tova_runtime/ not found at $ROOT_DIR/tova_runtime"
  exit 1
fi
echo ""

# ── Run Go benchmarks ──

echo "▸ Running Go benchmarks..."
GO_BIN="$SCRIPT_DIR/bench_vs_go_bin"
go build -o "$GO_BIN" "$SCRIPT_DIR/bench_vs_go.go"
GO_OUTPUT=$("$GO_BIN" 2>&1)
rm -f "$GO_BIN"
echo "  Done."
echo ""

# ── Run Tova/JS benchmarks ──

echo "▸ Running Tova/JS benchmarks..."
TOVA_OUTPUT=$(bun "$SCRIPT_DIR/bench_vs_go.js" 2>&1)
echo "  Done."
echo ""

# ── Parse RESULT lines into temp files ──

GO_FILE=$(mktemp)
TOVA_FILE=$(mktemp)
trap "rm -f $GO_FILE $TOVA_FILE" EXIT

echo "$GO_OUTPUT" | grep '^RESULT:' > "$GO_FILE" || true
echo "$TOVA_OUTPUT" | grep '^RESULT:' > "$TOVA_FILE" || true

# Helper: get value for a benchmark name from a results file
get_val() {
  local file="$1" name="$2"
  awk -F: -v n="$name" '$2 == n { print $3 }' "$file"
}

# Benchmark names in display order, with labels
BENCHMARKS="spawn_overhead|Spawn 100K pairs
channel_throughput|Channel 1M msgs
ping_pong|Ping-pong 100K
fan_out|Fan-out 4x100K
select_multiplex|Select 4ch 100K
compute_sequential|Compute seq 40K fib(30)
compute_concurrent|Compute conc 40K fib(30)"

# ── Print comparison table ──

echo "┌──────────────────────────┬────────────┬────────────┬────────────┐"
echo "│ Benchmark                │   Go (ms)  │ Tova (ms)  │   Ratio    │"
echo "├──────────────────────────┼────────────┼────────────┼────────────┤"

echo "$BENCHMARKS" | while IFS='|' read -r name label; do
  go_val=$(get_val "$GO_FILE" "$name")
  tova_val=$(get_val "$TOVA_FILE" "$name")

  if [ -z "$go_val" ]; then go_val="N/A"; fi
  if [ -z "$tova_val" ]; then tova_val="N/A"; fi

  if [ "$go_val" != "N/A" ] && [ "$tova_val" != "N/A" ]; then
    ratio=$(awk "BEGIN { if ($go_val > 0) printf \"%.1fx\", $tova_val / $go_val; else print \"N/A\" }")
  else
    ratio="N/A"
  fi

  printf "│ %-24s │ %10s │ %10s │ %10s │\n" "$label" "$go_val" "$tova_val" "$ratio"
done

echo "└──────────────────────────┴────────────┴────────────┴────────────┘"
echo ""

# ── Notes ──

echo "Notes:"
echo "  • Ratio = Tova/Go (higher means Go is faster by that factor)"
echo "  • Go uses goroutines (true parallelism, GOMAXPROCS=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo '?') cores)"
echo "  • Tova uses Tokio multi-threaded runtime + Wasmtime (true parallelism)"
echo "  • Channel impl: Go = runtime channels; Tova = Crossbeam bounded channels"
echo "  • Select impl: Go = runtime select; Tova = try_recv polling via NAPI FFI"
echo "  • Spawn includes WASM instantiation overhead (Wasmtime compile + store + instance)"
echo ""

# ── Raw output (for debugging) ──

if [ "${VERBOSE:-}" = "1" ]; then
  echo "── Raw Go output ──"
  echo "$GO_OUTPUT"
  echo ""
  echo "── Raw Tova output ──"
  echo "$TOVA_OUTPUT"
fi
