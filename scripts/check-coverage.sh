#!/bin/bash
set -e

# Run tests with coverage and capture output
set +e
OUTPUT=$(bun test --coverage 2>&1)
TEST_EXIT=$?
set -e

if [ "$TEST_EXIT" -ne 0 ]; then
  echo "$OUTPUT"
  echo "FAIL: bun test --coverage exited with status $TEST_EXIT"
  exit "$TEST_EXIT"
fi

# Print summary
echo "$OUTPUT" | grep "All files" || true
echo "$OUTPUT" | tail -3

# Check minimum line coverage threshold (97%)
LINE_PCT=$(echo "$OUTPUT" | grep "All files" | awk -F'|' '{gsub(/[ ]+/,"",$3); print $3}')
if [ -z "$LINE_PCT" ]; then
  echo "FAIL: Could not extract coverage percentage"
  exit 1
fi

# Compare using awk (handles decimals)
PASS=$(echo "$LINE_PCT" | awk '{if ($1 >= 97.0) print "yes"; else print "no"}')
if [ "$PASS" = "no" ]; then
  echo "FAIL: Line coverage ${LINE_PCT}% is below 97% threshold"
  exit 1
fi

echo "PASS: Line coverage at ${LINE_PCT}% (threshold: 97%)"
