# CLAUDE.md

Project context for Claude Code.

## Project

Glasgow Bin Collection iCal — three implementations that fetch Glasgow City Council's bin collection schedule and produce iCalendar output.

## Source files

| File | Purpose |
|------|---------|
| `main.py` | Python CLI — generates `.ics` for the full year |
| `main.go` | Go CLI — same functionality, stdlib only |
| `index.js` | Cloudflare Worker — HTTP endpoint, returns `.ics` on `GET /{UPRN}` |

## API

All three implementations fetch from:
```
https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/PrintCalendar.aspx?UPRN={UPRN}
```

## HTML parsing strategy

The page contains 12 month tables: `<table id="January_Calendar">` … `<table id="December_Calendar">`.

Each table contains `<td class="calendar-day">` cells. Inside each cell is a nested `<table>` with:
- Day number: `<td align="right" colspan="2">N</td>`
- Bin images: `<img alt="blue Bin" …/>`, `<img alt="brown Bin" …/>`, etc.

Alt-text keywords → bin types: `blue→BLUE`, `grey→GREY`, `green→GREEN`, `purple→PURPLE`, `brown→BROWN`.

Year is always `current year` (`time.Now().Year()` / `datetime.date.today().year` / `new Date().getFullYear()`).

## Build & run

```sh
# Python (create venv first)
python3 -m venv .venv && .venv/bin/pip install requests beautifulsoup4 icalendar
.venv/bin/python3 main.py [UPRN] output.ics

# Go
go build -o glasgow-bin .
./glasgow-bin [UPRN] output.ics

# JS (Cloudflare Worker — local test via node)
node tests/test_js.js
```

## Tests

```sh
go test ./...                    # Go unit tests
.venv/bin/python3 tests/test_python.py   # Python unit tests
node tests/test_js.js            # JS unit tests
bash tests/smoke_test.sh [UPRN]  # Cross-implementation smoke test
bash tests/unit_test.sh          # All unit tests
```

## CI

`.github/workflows/build.yml` — triggers on changes to `**.go`, `go.mod`, or `go.sum`. Runs `go test ./...`, then builds binaries for 6 platforms (windows/darwin/linux × amd64/arm64) and uploads as artifacts.

## Key decisions

- **No external Go deps** — uses stdlib + regex only, keeps cross-compilation simple.
- **HTML parsing via regex/string search** (not DOM) — avoids heavy dependencies in Go and JS; works because the page structure is stable.
- **Year = current year for all months** — the PrintCalendar page shows the current collection year's schedule; past months appear as historical events in the calendar.
- **Section slicing by month marker** (`strings.Index` / `indexOf`) instead of table-level regex — avoids the nested-`</table>` early-termination bug in greedy/lazy regex.
