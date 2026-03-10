#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Run all Tova data analytics test scripts
# Usage: bash run_all.sh [script_number]
# ══════════════════════════════════════════════════════════════

set -e

TOVA="../../bin/tova.js"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

passed=0
failed=0
errors=""

run_script() {
  local script="$1"
  local name=$(basename "$script" .tova)
  echo -e "\n${YELLOW}━━━ Running: $name ━━━${NC}"

  if bun "$TOVA" run "$script" 2>&1; then
    echo -e "${GREEN}✓ $name passed${NC}"
    ((passed++))
  else
    echo -e "${RED}✗ $name FAILED${NC}"
    ((failed++))
    errors="$errors\n  - $name"
  fi
}

echo "══════════════════════════════════════════════════"
echo "  Tova Data Analytics Test Suite"
echo "══════════════════════════════════════════════════"

if [ -n "$1" ]; then
  # Run single script by number
  script=$(ls ${1}*.tova 2>/dev/null | head -1)
  if [ -n "$script" ]; then
    run_script "$script"
  else
    echo -e "${RED}No script found matching: $1${NC}"
    exit 1
  fi
else
  # Run all scripts in order
  for script in $(ls [0-9]*.tova | sort); do
    run_script "$script"
  done
fi

echo ""
echo "══════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
if [ -n "$errors" ]; then
  echo -e "  Failed:$errors"
fi
echo "══════════════════════════════════════════════════"

exit $failed
