addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const API = "https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/PrintCalendar.aspx?UPRN="

const BINS_DESCRIPTION = {
  BLUE: "Please use the blue bins to recycle card packaging, cardboard boxes, magazines, newspapers, comics, office paper, brochures, yellow pages, junk mail, envelopes, drinks cans, food tins, empty aerosols cans and plastic bottles. Please do not place any other items into the blue bins.",
  BROWN: "All compostable garden waste such as - grass cuttings, leaves, hedge trimmings, plants and garden weeds.  Plastic bin liners or carriers bags should not be placed in the brown bin because they are not compostable and can negatively impact the quality of compost produced at the re-processing facility. All garden waste has to be placed loose in your brown bin. Food waste can also be placed within the brown bin using compostable food waste liners.",
  PURPLE: "Wine Bottles, Beer bottles, Jam jars, Coffee jars, Sauce bottles. Bottle lids/caps can be kept on the bottles.  These are removed at the re-processing plant and recycled separate from the glass.",
  GREY: "Food waste.",
  GREEN: "Any items that cannot go into a recycling a blue, purple, brown bin or grey food caddy, can go into a general waste bin other than hazardous, bulky or electrical items and batteries."
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"]

const ALT_TO_BIN = { blue: "BLUE", grey: "GREY", green: "GREEN", purple: "PURPLE", brown: "BROWN" }

function formatDate(year, month, day) {
  return String(year) +
    String(month).padStart(2, '0') +
    String(day).padStart(2, '0')
}

function makeEvent(bin, year, month, day) {
  const dateStr = formatDate(year, month, day)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  return [
    "BEGIN:VEVENT",
    "SUMMARY:Bin collection - " + bin,
    "DTSTART;VALUE=DATE:" + dateStr,
    "DTSTAMP:" + stamp,
    "UID:" + crypto.randomUUID(),
    "DESCRIPTION:" + BINS_DESCRIPTION[bin],
    "LOCATION:",
    "END:VEVENT"
  ].join("\r\n")
}

function parseEvents(html) {
  const year = new Date().getFullYear()
  const events = []

  for (let i = 0; i < MONTHS.length; i++) {
    const month = MONTHS[i]
    const monthNum = i + 1

    const startIdx = html.indexOf(`id="${month}_Calendar"`)
    if (startIdx === -1) continue
    const nextMonth = MONTHS[i + 1]
    const nextStart = nextMonth ? html.indexOf(`id="${nextMonth}_Calendar"`, startIdx) : -1
    const endIdx = nextStart === -1 ? html.length : nextStart
    const tableHtml = html.substring(startIdx, endIdx)

    const tdRegex = /<td[^>]+class="calendar-day"[^>]*>([\s\S]*?)<\/table>\s*<\/td>/g
    let tdMatch

    while ((tdMatch = tdRegex.exec(tableHtml)) !== null) {
      const tdContent = tdMatch[1]

      const dayMatch = /<td[^>]+align="right"[^>]*>\s*(\d+)\s*<\/td>/.exec(tdContent)
      if (!dayMatch) continue
      const day = parseInt(dayMatch[1], 10)

      const altRegex = /alt="([^"]+)"/gi
      let altMatch
      while ((altMatch = altRegex.exec(tdContent)) !== null) {
        const alt = altMatch[1].toLowerCase()
        for (const [key, bin] of Object.entries(ALT_TO_BIN)) {
          if (alt.includes(key)) {
            events.push(makeEvent(bin, year, monthNum, day))
          }
        }
      }
    }
  }

  return events
}

async function handleRequest(request) {
  const uprn = (new URL(request.url)).pathname.substring(1)

  if (uprn === '')
    return new Response("UPRN not specified", { status: 400 })
  if (!/^\d{12}$/.test(uprn))
    return new Response("UPRN is not valid (must be exactly 12 digits)", { status: 400 })

  let html
  try {
    const res = await fetch(API + uprn, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok)
      return new Response("Failed to fetch collection calendar: HTTP " + res.status, { status: 502 })
    html = await res.text()
  } catch (e) {
    return new Response("Failed to fetch collection calendar: " + e.message, { status: 502 })
  }

  const events = parseEvents(html)

  if (events.length === 0)
    return new Response("No collection events found. Check that the UPRN is correct.", { status: 404 })

  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nonPointer//Glasgow Bin Collection iCal//EN",
    "X-WR-CALNAME:Bins Collection",
    "X-WR-TIMEZONE:Europe/London",
    "X-WR-CALDESC:Events of bin collection in Glasgow area",
    events.join("\r\n"),
    "END:VCALENDAR"
  ].join("\r\n")

  return new Response(cal, {
    headers: { 'content-type': 'text/calendar; charset=utf-8' }
  })
}
