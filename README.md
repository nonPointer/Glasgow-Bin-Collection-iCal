# Glasgow Bin Collection iCal

Crawls Glasgow City Council's bin collection schedule and generates an iCalendar (`.ics`) file. Import it into Outlook, Google Calendar, Apple Calendar, Thunderbird, etc. for automatic reminders.

Three implementations are provided: a Python CLI, a Go CLI, and a Cloudflare Worker.

## Step 1: Find your UPRN

Your Unique Property Reference Number (UPRN) is a 12-digit number. Find it by searching your postcode on the [Glasgow City Council refuse calendar](https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/AddressSearch.aspx) — it appears in the page URL after you select your address.

## Step 2: Generate your iCal

### Python CLI

Requires Python 3 with `requests`, `beautifulsoup4`, and `icalendar`.

```sh
pip install requests beautifulsoup4 icalendar
python3 main.py [UPRN] [output.ics]
```

### Go CLI

No dependencies. Pre-built binaries for Windows, macOS, and Linux (amd64/arm64) are available as artifacts from GitHub Actions.

```sh
./glasgow-bin [UPRN] [output.ics]
```

To build from source:

```sh
go build -o glasgow-bin .
```

### Cloudflare Worker

Deploy `index.js` to [Cloudflare Workers](https://workers.cloudflare.com/). Once live, subscribe to your calendar via:

```
https://your-worker.workers.dev/[UPRN]
```

You can preview any `.ics` URL at [icscalendar.com](https://icscalendar.com/preview#calendar-preview).

## Step 3: Subscribe

Import the `.ics` file or subscribe via URL in your calendar app. Example: [Add to Google Calendar](https://calendar.google.com/calendar/u/0/r/settings/addbyurl).

## Testing

```sh
# Unit tests (all three implementations)
bash tests/unit_test.sh

# Smoke test — compares Python, Go, and JS output for a real UPRN
bash tests/smoke_test.sh [UPRN]

# Go tests only
go test ./...

# Python tests only
python3 tests/test_python.py

# JS tests only
node tests/test_js.js
```

## Privacy

This is a read-only tool. It fetches publicly available collection schedule data from Glasgow City Council. No user data is stored, tracked, or transmitted beyond the council's own website.
