#!/usr/bin/env bash
# Run all unit tests for Python, Go, and JS.
# Usage: bash tests/unit_test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

overall_pass=true

run_suite() {
  local name="$1"
  shift
  echo "========================================"
  echo "Running $name tests..."
  echo "========================================"
  if "$@"; then
    echo -e "${GREEN}$name: PASS${NC}"
  else
    echo -e "${RED}$name: FAIL${NC}"
    overall_pass=false
  fi
  echo ""
}

# Python tests
run_suite "Python" "$ROOT_DIR/.venv/bin/python3" "$ROOT_DIR/tests/test_python.py" -v

# Go tests
run_suite "Go" go test "$ROOT_DIR/..." -v

# JS tests
run_suite "JavaScript" node "$ROOT_DIR/tests/test_js.js"

echo "========================================"
if [[ "$overall_pass" == "true" ]]; then
  echo -e "${GREEN}All test suites PASSED${NC}"
  exit 0
else
  echo -e "${RED}One or more test suites FAILED${NC}"
  exit 1
fi
