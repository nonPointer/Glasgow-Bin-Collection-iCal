import requests
import bs4
import uuid
import icalendar
import datetime
import sys
from enum import Enum

if sys.argv[1] == "help":
    print("Usage: python3 main.py [UPRN] [filename.ics]")
    exit()
elif len(sys.argv) != 3:
    print("Invalid number of arguments")
    exit()

UPRN = sys.argv[1].strip()
FILENAME = sys.argv[2].strip()

API = "https://www.glasgow.gov.uk/forms/refuseandrecyclingcalendar/CollectionsCalendar.aspx?UPRN="


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


def create_event(bin: Bin, date: int) -> icalendar.Event:
    event = icalendar.Event()
    event.add('summary', "Bin collection - " + bin.name)

    today = datetime.datetime.today()
    date = datetime.datetime(today.year, today.month, date)
    event.add('dtstart', date.date())
    event.add('dtstamp', today)
    event.add('LOCATION', '')
    event.add('DESCRIPTION', BIN_DESCRIPTIONS[bin])
    event['uid'] = str(uuid.uuid1())

    return event


if __name__ == "__main__":
    r = requests.get(API + UPRN)
    soup = bs4.BeautifulSoup(r.text, "html.parser")
    tds = soup.find_all("td", attrs={"class": "CalendarDayStyle"})
    tds = list(filter(lambda x: x.text != "", tds))
    print("Load {} days".format(len(tds)))

    events = []
    for td in tds:
        cur = int(td.attrs["title"].split(",")[1].split(" ")[1])
        if td.select("img"):
            for img in td.select("img"):
                title = img.attrs["title"]
                if "blue" in title:
                    events.append(create_event(Bin.BLUE, cur))
                if "grey" in title:
                    events.append(create_event(Bin.GREY, cur))
                if "green" in title:
                    events.append(create_event(Bin.GREEN, cur))
                if "purple" in title:
                    events.append(create_event(Bin.PURPLE, cur))
                if "brown" in title:
                    events.append(create_event(Bin.BROWN, cur))

    cal = icalendar.Calendar()
    cal.add("PRODID", "-//nonPointer//Glasgow Bin Collection iCal//EN")
    cal.add("VERSION", "2.0")
    cal.add("X-WR-CALNAME", "Bins Collection")
    cal.add("X-WR-TIMEZONE", "Europe/London")
    cal.add("X-WR-CALDESC", "Events of bin collection in Glasgow area")
    for event in events:
        cal.add_component(event)
    with open(FILENAME, "wb") as f:
        f.write(cal.to_ical())
