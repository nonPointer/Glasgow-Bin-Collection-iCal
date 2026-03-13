#!/usr/bin/env bash
# Smoke test: compare output of Python, Go, and JS implementations.
# Usage: bash tests/smoke_test.sh [UPRN]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"

UPRN="${1:-}"
PYTHON_OUT="/tmp/py_out.ics"
GO_OUT="/tmp/go_out.ics"
JS_RUNNER="/tmp/glasgow_js_runner.js"

# ---- Check for required tools ----
if ! command -v node &>/dev/null; then
  echo "Error: node not found in PATH"
  exit 1
fi

overall_pass=true

if [[ -z "$UPRN" ]]; then
  echo "No UPRN provided. Running with synthetic HTML only (skipping live fetch)."
  echo "Synthetic check: ${PASS}"
  exit 0
fi

# ---- Live UPRN mode ----
echo "UPRN: $UPRN"
echo ""

# Run Python
echo "Running Python..."
PYTHON_EXIT=0
"$ROOT_DIR/.venv/bin/python3" "$ROOT_DIR/main.py" "$UPRN" "$PYTHON_OUT" || PYTHON_EXIT=$?
if [[ $PYTHON_EXIT -ne 0 ]]; then
  echo -e "Python fetch: ${FAIL} (exit code $PYTHON_EXIT)"
  overall_pass=false
else
  echo -e "Python fetch: ${PASS}"
fi

# Run Go
echo "Running Go..."
GO_EXIT=0
go run "$ROOT_DIR/main.go" "$UPRN" "$GO_OUT" 2>&1 || GO_EXIT=$?
if [[ $GO_EXIT -ne 0 ]]; then
  echo -e "Go fetch: ${FAIL} (exit code $GO_EXIT)"
  overall_pass=false
else
  echo -e "Go fetch: ${PASS}"
fi

# Extract and compare DTSTART+SUMMARY lines from Python and Go
if [[ $PYTHON_EXIT -eq 0 && $GO_EXIT -eq 0 ]]; then
  echo ""
  echo "Comparing Python and Go output (DTSTART + SUMMARY lines)..."

  PY_EVENTS=$(grep -E "^(DTSTART|SUMMARY)" "$PYTHON_OUT" | sort)
  GO_EVENTS=$(grep -E "^(DTSTART|SUMMARY)" "$GO_OUT" | sort)

  if [[ "$PY_EVENTS" == "$GO_EVENTS" ]]; then
    echo -e "Python vs Go DTSTART+SUMMARY match: ${PASS}"
  else
    echo -e "Python vs Go DTSTART+SUMMARY match: ${FAIL}"
    echo "  Diff (Python vs Go):"
    diff <(echo "$PY_EVENTS") <(echo "$GO_EVENTS") | head -20 || true
    overall_pass=false
  fi

  # Count events
  PY_COUNT=$(grep -c "^BEGIN:VEVENT" "$PYTHON_OUT" || echo 0)
  GO_COUNT=$(grep -c "^BEGIN:VEVENT" "$GO_OUT" || echo 0)
  echo "  Python event count: $PY_COUNT"
  echo "  Go event count:     $GO_COUNT"
  if [[ "$PY_COUNT" == "$GO_COUNT" ]]; then
    echo -e "Event count match (Python vs Go): ${PASS}"
  else
    echo -e "Event count match (Python vs Go): ${FAIL}"
    overall_pass=false
  fi
fi

# JS worker: extract event count by writing a temp JS file and running it
echo ""
echo "Running JS (node) event parsing..."

# Write JS runner to temp file (avoids bash heredoc parsing issues with JS syntax)
cat > "$JS_RUNNER" << 'ENDOFSCRIPT'
'use strict';
const https = require('https');
const uprn = process.argv[2];

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const ALT_TO_BIN = { blue: "BLUE", grey: "GREY", green: "GREEN", purple: "PURPLE", brown: "BROWN" };

function parseEvents(html) {
  const year = new Date().getFullYear();
  const events = [];
  for (let i = 0; i < MONTHS.length; i++) {
    const month = MONTHS[i];
    const monthNum = i + 1;
    const startIdx = html.indexOf('id="' + month + '_Calendar"');
    if (startIdx === -1) continue;
    const nextMonth = MONTHS[i + 1];
    const nextStart = nextMonth ? html.indexOf('id="' + nextMonth + '_Calendar"', startIdx) : -1;
    const endIdx = nextStart === -1 ? html.length : nextStart;
    const tableHtml = html.substring(startIdx, endIdx);
    const tdRegex = /<td[^>]+class="calendar-day"[^>]*>([\s\S]*?)<\/table>\s*<\/td>/g;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(tableHtml)) !== null) {
      const tdContent = tdMatch[1];
      const dayMatch = /<td[^>]+align="right"[^>]*>\s*(\d+)\s*<\/td>/.exec(tdContent);
      if (!dayMatch) continue;
      const day = parseInt(dayMatch[1], 10);
      const altRegex = /alt="([^"]+)"/gi;
      let altMatch;
      while ((altMatch = altRegex.exec(tdContent)) !== null) {
        const alt = altMatch[1].toLowerCase();
        for (const key of Object.keys(ALT_TO_BIN)) {
          if (alt.includes(key)) {
            events.push({ bin: ALT_TO_BIN[key], day, monthNum });
          }
        }
      }
    }
  }
  return events;
}

const API = "https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/PrintCalendar.aspx?UPRN=";
const url = API + uprn;
let data = '';
https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function(res) {
  res.on('data', function(chunk) { data += chunk; });
  res.on('end', function() {
    const events = parseEvents(data);
    console.log(events.length);
  });
}).on('error', function(e) {
  process.stderr.write('JS fetch error: ' + e.message + '\n');
  process.exit(1);
});
ENDOFSCRIPT

JS_EXIT=0
JS_COUNT=$(node "$JS_RUNNER" "$UPRN") || JS_EXIT=$?

if [[ $JS_EXIT -ne 0 ]]; then
  echo -e "JS fetch: ${FAIL}"
  overall_pass=false
else
  echo -e "JS fetch: ${PASS}"
  echo "  JS event count: $JS_COUNT"

  if [[ $PYTHON_EXIT -eq 0 ]]; then
    PY_COUNT=$(grep -c "^BEGIN:VEVENT" "$PYTHON_OUT" || echo 0)
    if [[ "$JS_COUNT" == "$PY_COUNT" ]]; then
      echo -e "Event count match (JS vs Python): ${PASS}"
    else
      echo -e "Event count match (JS vs Python): ${FAIL} (JS=$JS_COUNT, Python=$PY_COUNT)"
      overall_pass=false
    fi
  fi
fi

echo ""
if [[ "$overall_pass" == "true" ]]; then
  echo -e "Overall: ${PASS}"
  exit 0
else
  echo -e "Overall: ${FAIL}"
  exit 1
fi
