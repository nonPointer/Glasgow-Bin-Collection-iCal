The bin area in my neighbourhood was always filled with tons of bin bags, so I developed a serverless API to crawl the bin collection dates and generate results in iCalendar (a standard protocol for online calendar subscriptions). By using this I can throw my bin bags after they clear the public bins, and will not get my shoes dirty.

You can simply import the online calendar link into your Outlook, Google Calendar, Apple Calendar, Thunderbird...etc.

Related project: [Glasgow-Bin-Collection-iCal-Py - Generate 1-year iCal at once](https://github.com/nonPointer/Glasgow-Bin-Collection-iCal-Py)

## Usage

1. Find your Unique Property Reference Number (UPRN), a 12-digits number in the URL field by searching your postcode on the website of Glasgow City Council [here](https://www.glasgow.gov.uk/forms/refuseandrecyclingcalendar/AddressSearch.aspx).

2. Get your own link by concatenating `https://glasgow-bin-worker.vela.workers.dev/` with your UPRN. For example, `https://glasgow-bin-worker.vela.workers.dev/123456789012`. You can preview the iCal at [here](https://icscalendar.com/preview#calendar-preview).

3. Add the online calendar to your calendar service by the URL. For example, [Add to Google Calender](https://calendar.google.com/calendar/u/0/r/settings/addbyurl).

4. Sync the calendar events and enjoy

This repository also host the `main.py`, a Python script for generating `.ics` file locally. Usage: `python3 main.py [UPRN] [FILENAME.ics]`

## Privacy Concerns

This is a read-only service powered by Cloudflare Worker's serverless environment. It does not store, track or process any user information.

