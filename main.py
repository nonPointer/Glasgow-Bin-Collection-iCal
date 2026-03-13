import requests
import bs4
import uuid
import icalendar
import datetime
import sys
from enum import Enum


def usage():
    print("Usage: python3 main.py [UPRN] [filename.ics]")
    sys.exit(0)


def validate_args():
    if len(sys.argv) < 2:
        usage()
    if sys.argv[1] == "help":
        usage()
    if len(sys.argv) != 3:
        print("Error: Invalid number of arguments")
        usage()


API = "https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/PrintCalendar.aspx?UPRN="
HEADERS = {"User-Agent": "Mozilla/5.0"}

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]


class Bin(Enum):
    BLUE = 1
    GREEN = 2
    GREY = 3
    PURPLE = 4
    BROWN = 5


BIN_DESCRIPTIONS = {
    Bin.BLUE: "Please use the blue bins to recycle card packaging, cardboard boxes, magazines, newspapers, comics, office paper, brochures, yellow pages, junk mail, envelopes, drinks cans, food tins, empty aerosols cans and plastic bottles. Please do not place any other items into the blue bins.",
    Bin.BROWN: "All compostable garden waste such as - grass cuttings, leaves, hedge trimmings, plants and garden weeds.  Plastic bin liners or carriers bags should not be placed in the brown bin because they are not compostable and can negatively impact the quality of compost produced at the re-processing facility. All garden waste has to be placed loose in your brown bin. Food waste can also be placed within the brown bin using compostable food waste liners.",
    Bin.PURPLE: "Wine Bottles, Beer bottles, Jam jars, Coffee jars, Sauce bottles. Bottle lids/caps can be kept on the bottles.  These are removed at the re-processing plant and recycled separate from the glass.",
    Bin.GREY: "Food waste.",
    Bin.GREEN: "Any items that cannot go into a recycling a blue, purple, brown bin or grey food caddy, can go into a general waste bin other than hazardous, bulky or electrical items and batteries."
}

ALT_TO_BIN = {
    "blue": Bin.BLUE,
    "grey": Bin.GREY,
    "green": Bin.GREEN,
    "purple": Bin.PURPLE,
    "brown": Bin.BROWN,
}


def create_event(bin: Bin, date: datetime.date) -> icalendar.Event:
    event = icalendar.Event()
    event.add('summary', "Bin collection - " + bin.name)
    event.add('dtstart', date)
    event.add('dtstamp', datetime.datetime.today())
    event.add('LOCATION', '')
    event.add('DESCRIPTION', BIN_DESCRIPTIONS[bin])
    event['uid'] = str(uuid.uuid1())
    return event


def fetch_page(uprn: str) -> bs4.BeautifulSoup:
    try:
        r = requests.get(API + uprn, headers=HEADERS, timeout=15)
        r.raise_for_status()
    except requests.exceptions.Timeout:
        print("Error: Request timed out")
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code} from server")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Error: Failed to fetch page - {e}")
        sys.exit(1)
    return bs4.BeautifulSoup(r.text, "html.parser")


def parse_events(soup: bs4.BeautifulSoup) -> list:
    today = datetime.date.today()
    events = []
    total_days = 0

    for month_name in MONTHS:
        table = soup.find("table", id=month_name + "_Calendar")
        if not table:
            continue
        month_num = MONTHS.index(month_name) + 1

        for td in table.find_all("td", class_="calendar-day"):
            day_td = td.find("td", attrs={"align": "right"})
            if not day_td or not day_td.text.strip():
                continue
            try:
                day = int(day_td.text.strip())
                date = datetime.date(today.year, month_num, day)
            except ValueError:
                continue
            total_days += 1

            for img in td.find_all("img"):
                alt = img.attrs.get("alt", "").lower()
                for key, bin_type in ALT_TO_BIN.items():
                    if key in alt:
                        events.append(create_event(bin_type, date))

    print(f"Loaded {total_days} days, {len(events)} collection events")
    return events


def build_calendar(events: list) -> icalendar.Calendar:
    cal = icalendar.Calendar()
    cal.add("PRODID", "-//nonPointer//Glasgow Bin Collection iCal//EN")
    cal.add("VERSION", "2.0")
    cal.add("X-WR-CALNAME", "Bins Collection")
    cal.add("X-WR-TIMEZONE", "Europe/London")
    cal.add("X-WR-CALDESC", "Events of bin collection in Glasgow area")
    for event in events:
        cal.add_component(event)
    return cal


if __name__ == "__main__":
    validate_args()
    UPRN = sys.argv[1].strip()
    FILENAME = sys.argv[2].strip()

    soup = fetch_page(UPRN)
    events = parse_events(soup)

    if not events:
        print("Warning: No collection events found. Check that the UPRN is correct.")
        sys.exit(1)

    cal = build_calendar(events)
    try:
        with open(FILENAME, "wb") as f:
            f.write(cal.to_ical())
        print(f"Saved to {FILENAME}")
    except OSError as e:
        print(f"Error: Could not write file - {e}")
        sys.exit(1)
