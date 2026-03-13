package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type htmlEntry struct {
	month string
	day   int
	alts  []string
}

// syntheticHTML builds a minimal HTML page with the given month/day/alt combinations.
// Days in the same month are grouped into one table to match real-page structure.
func syntheticHTML(entries []htmlEntry) string {
	// Collect days per month, preserving insertion order of months.
	type monthDays struct {
		month string
		days  []htmlEntry
	}
	var order []string
	groups := map[string][]htmlEntry{}
	for _, e := range entries {
		if _, ok := groups[e.month]; !ok {
			order = append(order, e.month)
		}
		groups[e.month] = append(groups[e.month], e)
	}

	var sb strings.Builder
	sb.WriteString("<html><body>")
	for _, month := range order {
		sb.WriteString(fmt.Sprintf(`<table id="%s_Calendar"><tbody>`, month))
		for _, e := range groups[month] {
			sb.WriteString(`<tr><td class="calendar-day"><table>`)
			sb.WriteString(fmt.Sprintf(`<tr><td align="right" colspan="2">%d</td></tr>`, e.day))
			sb.WriteString(`<tr><td>`)
			for _, alt := range e.alts {
				sb.WriteString(fmt.Sprintf(`<img alt="%s Bin" src="img.png"/>`, alt))
			}
			sb.WriteString(`</td></tr></table></td></tr>`)
		}
		sb.WriteString(`</tbody></table>`)
	}
	sb.WriteString("</body></html>")
	return sb.String()
}

func TestParseEvents_synthetic(t *testing.T) {
	html := syntheticHTML([]htmlEntry{
		{"March", 5, []string{"blue", "brown"}},
		{"March", 12, []string{"grey"}},
		{"April", 1, []string{"purple", "green"}},
	})

	events := parseEvents(html)

	// March 5 has blue + brown = 2 events
	// March 12 has grey = 1 event
	// April 1 has purple + green = 2 events
	// Total = 5
	if len(events) != 5 {
		t.Fatalf("expected 5 events, got %d", len(events))
	}

	// Check first event is from March
	if events[0].Month != 3 {
		t.Errorf("expected month 3, got %d", events[0].Month)
	}
	if events[0].Day != 5 {
		t.Errorf("expected day 5, got %d", events[0].Day)
	}
	// Check April event
	aprilFound := false
	for _, ev := range events {
		if ev.Month == 4 && ev.Day == 1 {
			aprilFound = true
			break
		}
	}
	if !aprilFound {
		t.Error("expected an event in April on day 1")
	}
}

func TestParseEvents_empty(t *testing.T) {
	events := parseEvents("<html><body></body></html>")
	if len(events) != 0 {
		t.Errorf("expected 0 events, got %d", len(events))
	}
}

func TestParseEvents_invalidDay(t *testing.T) {
	// Day 99 is invalid for February
	html := syntheticHTML([]htmlEntry{
		{"February", 99, []string{"blue"}},
	})
	events := parseEvents(html)
	if len(events) != 0 {
		t.Errorf("expected 0 events for invalid day 99, got %d", len(events))
	}
}

func TestParseEvents_multipleMonths(t *testing.T) {
	html := syntheticHTML([]htmlEntry{
		{"January", 10, []string{"blue"}},
		{"June", 15, []string{"brown"}},
		{"December", 25, []string{"grey"}},
	})
	events := parseEvents(html)
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}
	months := map[int]bool{}
	for _, e := range events {
		months[e.Month] = true
	}
	if !months[1] {
		t.Error("expected event in January (month 1)")
	}
	if !months[6] {
		t.Error("expected event in June (month 6)")
	}
	if !months[12] {
		t.Error("expected event in December (month 12)")
	}
}

func TestBuildCalendar(t *testing.T) {
	year := time.Now().Year()
	events := []Event{
		{Bin: "BLUE", Year: year, Month: 3, Day: 5},
		{Bin: "BROWN", Year: year, Month: 4, Day: 10},
	}
	cal := buildCalendar(events)

	if !strings.Contains(cal, "BEGIN:VCALENDAR\r\n") {
		t.Error("missing BEGIN:VCALENDAR header")
	}
	if !strings.Contains(cal, "VERSION:2.0\r\n") {
		t.Error("missing VERSION:2.0")
	}
	if !strings.Contains(cal, "PRODID:-//nonPointer//Glasgow Bin Collection iCal//EN\r\n") {
		t.Error("missing PRODID")
	}
	if !strings.Contains(cal, "X-WR-CALNAME:Bins Collection\r\n") {
		t.Error("missing X-WR-CALNAME")
	}
	if !strings.Contains(cal, "X-WR-TIMEZONE:Europe/London\r\n") {
		t.Error("missing X-WR-TIMEZONE")
	}
	if !strings.Contains(cal, "X-WR-CALDESC:Events of bin collection in Glasgow area\r\n") {
		t.Error("missing X-WR-CALDESC")
	}
	if !strings.Contains(cal, "BEGIN:VEVENT") {
		t.Error("missing BEGIN:VEVENT")
	}
	if !strings.HasSuffix(cal, "END:VCALENDAR") {
		t.Error("missing END:VCALENDAR at end")
	}
	if strings.Count(cal, "BEGIN:VEVENT") != 2 {
		t.Errorf("expected 2 VEVENTs, got %d", strings.Count(cal, "BEGIN:VEVENT"))
	}
}

func TestBuildCalendar_empty(t *testing.T) {
	cal := buildCalendar([]Event{})
	if strings.Contains(cal, "BEGIN:VEVENT") {
		t.Error("expected no VEVENT for empty events")
	}
	if !strings.Contains(cal, "BEGIN:VCALENDAR") {
		t.Error("missing BEGIN:VCALENDAR")
	}
}

func TestEventToIcal(t *testing.T) {
	year := time.Now().Year()
	e := Event{Bin: "BLUE", Year: year, Month: 3, Day: 5}
	ical := e.ToIcal()

	if !strings.Contains(ical, "SUMMARY:Bin collection - BLUE") {
		t.Errorf("missing SUMMARY: got %q", ical)
	}
	expected := fmt.Sprintf("DTSTART;VALUE=DATE:%04d0305", year)
	if !strings.Contains(ical, expected) {
		t.Errorf("missing DTSTART: expected %q in %q", expected, ical)
	}
	if !strings.Contains(ical, "DESCRIPTION:"+binDescriptions["BLUE"]) {
		t.Error("missing DESCRIPTION for BLUE bin")
	}
	if !strings.Contains(ical, "BEGIN:VEVENT") {
		t.Error("missing BEGIN:VEVENT")
	}
	if !strings.Contains(ical, "END:VEVENT") {
		t.Error("missing END:VEVENT")
	}
	if !strings.Contains(ical, "UID:") {
		t.Error("missing UID")
	}
	// Verify CRLF line endings
	if !strings.Contains(ical, "\r\n") {
		t.Error("expected CRLF line endings")
	}
}

func TestEventToIcal_dateFormat(t *testing.T) {
	e := Event{Bin: "GREY", Year: 2026, Month: 1, Day: 7}
	ical := e.ToIcal()
	if !strings.Contains(ical, "DTSTART;VALUE=DATE:20260107") {
		t.Errorf("expected DTSTART;VALUE=DATE:20260107 in %q", ical)
	}
}

func TestFetchPage_httpError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	_, err := fetchPage(srv.URL + "/test")
	if err == nil {
		t.Fatal("expected error for HTTP 503, got nil")
	}
	if !strings.Contains(err.Error(), "503") {
		t.Errorf("expected 503 in error message, got %q", err.Error())
	}
}

func TestFetchPage_success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "<html><body>Test content</body></html>")
	}))
	defer srv.Close()

	body, err := fetchPage(srv.URL + "/test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(body, "Test content") {
		t.Errorf("expected body to contain 'Test content', got %q", body)
	}
}
