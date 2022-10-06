addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})


const BINS_DESCRIPTION = {
  BLUE: "Please use the blue bins to recycle card packaging, cardboard boxes, magazines, newspapers, comics, office paper, brochures, yellow pages, junk mail, envelopes, drinks cans, food tins, empty aerosols cans and plastic bottles. Please do not place any other items into the blue bins.",
  BROWN: "All compostable garden waste such as - grass cuttings, leaves, hedge trimmings, plants and garden weeds.  Plastic bin liners or carriers bags should not be placed in the brown bin because they are not compostable and can negatively impact the quality of compost produced at the re-processing facility. All garden waste has to be placed loose in your brown bin. Food waste can also be placed within the brown bin using compostable food waste liners.",
  PURPLE: "Wine Bottles, Beer bottles, Jam jars, Coffee jars, Sauce bottles. Bottle lids/caps can be kept on the bottles.  These are removed at the re-processing plant and recycled separate from the glass.",
  GREY: "Food waste.",
  GREEN: "Any items that cannot go into a recycling a blue, purple, brown bin or grey food caddy, can go into a general waste bin other than hazardous, bulky or electrical items and batteries."
}

const BINS = Object.keys(BINS_DESCRIPTION);

class AbstractEvent {
  constructor(bin, date) {
    this.bin = bin;
    this.date = date;
  }

  toString() {
    let d = new Date();
    d.setDate(this.date);
    let data = [
      "BEGIN:VEVENT",
      "SUMMARY:Bin collection - " + this.bin,
      "DTSTART;VALUE=DATE:" + d.toISOString().split('T')[0].replace(/-/g, ''),
      "DTSTAMP;VALUE=DATE:" + (new Date()).toISOString().replace(/-|\:/g, '').split('.')[0],
      "UID:" + crypto.randomUUID(),
      "DESCRIPTION:" + BINS_DESCRIPTION[this.bin],
      "LOCATION:",
      "END:VEVENT"
    ]
    return data.join("\r\n")
  }
}

/**
 * Respond with hello worker text
 * @param {Request} event
 */
async function handleRequest(request) {
  let UPRN = (new URL(request.url)).pathname;

  UPRN = UPRN.substring(1);
  if (UPRN == "")
    return new Response("UPRN not specified", { status: 400 });
  if (RegExp(/\d{12}/).test(UPRN) == false)
    return new Response("UPRN is not valid", { status: 400 });

  console.log("UPRN: " + UPRN);

  tds = await fetch("https://www.glasgow.gov.uk/forms/refuseandrecyclingcalendar/CollectionsCalendar.aspx?UPRN=" + UPRN)
    .then(response => response.text())
    .then(data => {
      table = RegExp("<table id=\"Application_Calendar\" class=\"Calendar\".*?>(.*)</table>", "s").exec(data)[1];
      tds = table.match(/(<td title=".*? \d{4}\".*?>.*?<\/td>)/gs)
      return tds;
    })

  events = []
  for (let td of tds) {
    let date = RegExp(/.*title=".*?, (\d+) \w+ \d{4}".*/, "s").exec(td)[1];
    if (td.match(/blue/))
      events.push(new AbstractEvent("BLUE", date));
    if (td.match(/brown/))
      events.push(new AbstractEvent("BROWN", date));
    if (td.match(/purple/))
      events.push(new AbstractEvent("PURPLE", date));
    if (td.match(/grey/))
      events.push(new AbstractEvent("GREY", date));
    if (td.match(/green/))
      events.push(new AbstractEvent("GREEN", date));
  }

  res = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nonPointer//Glasgow Bin Collection iCal//EN",
    "X-WR-CALNAME:Bins Collection",
    "X-WR-TIMEZONE:Europe/London",
    "X-WR-CALDESC:Events of bin collection in Glasgow area",
    events.map(e => e.toString()).join("\r\n"),
    "END:VCALENDAR"
  ].join("\r\n");
  return new Response(res, {
    headers: { 'content-type': 'text/calendar' },
  })
}