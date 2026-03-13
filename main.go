package main

import (
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const apiBase = "https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/PrintCalendar.aspx?UPRN="

var api = apiBase

var months = []string{
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
}

var altToBin = map[string]string{
	"blue":   "BLUE",
	"grey":   "GREY",
	"green":  "GREEN",
	"purple": "PURPLE",
	"brown":  "BROWN",
}

var binDescriptions = map[string]string{
	"BLUE":   "Please use the blue bins to recycle card packaging, cardboard boxes, magazines, newspapers, comics, office paper, brochures, yellow pages, junk mail, envelopes, drinks cans, food tins, empty aerosols cans and plastic bottles. Please do not place any other items into the blue bins.",
	"BROWN":  "All compostable garden waste such as - grass cuttings, leaves, hedge trimmings, plants and garden weeds.  Plastic bin liners or carriers bags should not be placed in the brown bin because they are not compostable and can negatively impact the quality of compost produced at the re-processing facility. All garden waste has to be placed loose in your brown bin. Food waste can also be placed within the brown bin using compostable food waste liners.",
	"PURPLE": "Wine Bottles, Beer bottles, Jam jars, Coffee jars, Sauce bottles. Bottle lids/caps can be kept on the bottles.  These are removed at the re-processing plant and recycled separate from the glass.",
	"GREY":   "Food waste.",
	"GREEN":  "Any items that cannot go into a recycling a blue, purple, brown bin or grey food caddy, can go into a general waste bin other than hazardous, bulky or electrical items and batteries.",
}

// Event represents a single bin collection event.
type Event struct {
	Bin   string
	Year  int
	Month int
	Day   int
}

func newUUID() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// ToIcal returns the VEVENT block for this event.
func (e Event) ToIcal() string {
	dateStr := fmt.Sprintf("%04d%02d%02d", e.Year, e.Month, e.Day)
	stamp := time.Now().UTC().Format("20060102T150405Z")
	uid := newUUID()
	desc := binDescriptions[e.Bin]
	lines := []string{
		"BEGIN:VEVENT",
		"SUMMARY:Bin collection - " + e.Bin,
		"DTSTART;VALUE=DATE:" + dateStr,
		"DTSTAMP:" + stamp,
		"UID:" + uid,
		"DESCRIPTION:" + desc,
		"LOCATION:",
		"END:VEVENT",
	}
	return strings.Join(lines, "\r\n")
}

// fetchPage fetches the HTML page from the given URL.
func fetchPage(url string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d from server", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	return string(body), nil
}

var (
	tdRegex  = regexp.MustCompile(`(?s)<td[^>]+class="calendar-day"[^>]*>(.*?)<\/table>\s*<\/td>`)
	dayRegex = regexp.MustCompile(`<td[^>]+align="right"[^>]*>\s*(\d+)\s*<\/td>`)
	altRegex = regexp.MustCompile(`(?i)alt="([^"]+)"`)
)

// parseEvents parses the HTML and returns a slice of Events.
func parseEvents(body string) []Event {
	year := time.Now().Year()
	var events []Event

	for i, month := range months {
		monthNum := i + 1
		marker := `id="` + month + `_Calendar"`
		startIdx := strings.Index(body, marker)
		if startIdx == -1 {
			continue
		}

		endIdx := len(body)
		for j := i + 1; j < len(months); j++ {
			nextMarker := `id="` + months[j] + `_Calendar"`
			nextStart := strings.Index(body[startIdx:], nextMarker)
			if nextStart != -1 {
				endIdx = startIdx + nextStart
				break
			}
		}
		tableHTML := body[startIdx:endIdx]

		tdMatches := tdRegex.FindAllStringSubmatch(tableHTML, -1)
		for _, tdMatch := range tdMatches {
			tdContent := tdMatch[1]

			dayMatch := dayRegex.FindStringSubmatch(tdContent)
			if dayMatch == nil {
				continue
			}
			day, err := strconv.Atoi(dayMatch[1])
			if err != nil {
				continue
			}

			// Validate date
			_, err = time.Parse("2006-01-02", fmt.Sprintf("%04d-%02d-%02d", year, monthNum, day))
			if err != nil {
				continue
			}

			altMatches := altRegex.FindAllStringSubmatch(tdContent, -1)
			for _, altMatch := range altMatches {
				alt := strings.ToLower(altMatch[1])
				for key, bin := range altToBin {
					if strings.Contains(alt, key) {
						events = append(events, Event{
							Bin:   bin,
							Year:  year,
							Month: monthNum,
							Day:   day,
						})
					}
				}
			}
		}
	}

	return events
}

// buildCalendar constructs the full iCal string from a slice of Events.
func buildCalendar(events []Event) string {
	var sb strings.Builder
	sb.WriteString("BEGIN:VCALENDAR\r\n")
	sb.WriteString("VERSION:2.0\r\n")
	sb.WriteString("PRODID:-//nonPointer//Glasgow Bin Collection iCal//EN\r\n")
	sb.WriteString("X-WR-CALNAME:Bins Collection\r\n")
	sb.WriteString("X-WR-TIMEZONE:Europe/London\r\n")
	sb.WriteString("X-WR-CALDESC:Events of bin collection in Glasgow area\r\n")
	for _, e := range events {
		sb.WriteString(e.ToIcal())
		sb.WriteString("\r\n")
	}
	sb.WriteString("END:VCALENDAR")
	return sb.String()
}

func usage() {
	fmt.Println("Usage: ./glasgow-bin [UPRN] [filename.ics]")
	os.Exit(0)
}

func main() {
	if len(os.Args) < 2 || os.Args[1] == "help" {
		usage()
	}
	if len(os.Args) != 3 {
		fmt.Println("Error: Invalid number of arguments")
		usage()
	}

	uprn := strings.TrimSpace(os.Args[1])
	filename := strings.TrimSpace(os.Args[2])

	body, err := fetchPage(api + uprn)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}

	events := parseEvents(body)
	fmt.Printf("Loaded %d collection events\n", len(events))

	if len(events) == 0 {
		fmt.Println("Warning: No collection events found. Check that the UPRN is correct.")
		os.Exit(1)
	}

	cal := buildCalendar(events)
	err = os.WriteFile(filename, []byte(cal), 0644)
	if err != nil {
		fmt.Println("Error: Could not write file -", err)
		os.Exit(1)
	}
	fmt.Println("Saved to", filename)
}
