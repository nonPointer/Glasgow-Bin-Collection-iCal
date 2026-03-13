'use strict';

// ---- Polyfills for Cloudflare Worker APIs not in Node ----
const { webcrypto } = require('crypto');
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => webcrypto.randomUUID();
}

// ---- Inline the worker code (without addEventListener) ----
const API = "https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/PrintCalendar.aspx?UPRN=";

const BINS_DESCRIPTION = {
  BLUE: "Please use the blue bins to recycle card packaging, cardboard boxes, magazines, newspapers, comics, office paper, brochures, yellow pages, junk mail, envelopes, drinks cans, food tins, empty aerosols cans and plastic bottles. Please do not place any other items into the blue bins.",
  BROWN: "All compostable garden waste such as - grass cuttings, leaves, hedge trimmings, plants and garden weeds.  Plastic bin liners or carriers bags should not be placed in the brown bin because they are not compostable and can negatively impact the quality of compost produced at the re-processing facility. All garden waste has to be placed loose in your brown bin. Food waste can also be placed within the brown bin using compostable food waste liners.",
  PURPLE: "Wine Bottles, Beer bottles, Jam jars, Coffee jars, Sauce bottles. Bottle lids/caps can be kept on the bottles.  These are removed at the re-processing plant and recycled separate from the glass.",
  GREY: "Food waste.",
  GREEN: "Any items that cannot go into a recycling a blue, purple, brown bin or grey food caddy, can go into a general waste bin other than hazardous, bulky or electrical items and batteries."
};

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const ALT_TO_BIN = { blue: "BLUE", grey: "GREY", green: "GREEN", purple: "PURPLE", brown: "BROWN" };

function formatDate(year, month, day) {
  return String(year) +
    String(month).padStart(2, '0') +
    String(day).padStart(2, '0');
}

function makeEvent(bin, year, month, day) {
  const dateStr = formatDate(year, month, day);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    "BEGIN:VEVENT",
    "SUMMARY:Bin collection - " + bin,
    "DTSTART;VALUE=DATE:" + dateStr,
    "DTSTAMP:" + stamp,
    "UID:" + crypto.randomUUID(),
    "DESCRIPTION:" + BINS_DESCRIPTION[bin],
    "LOCATION:",
    "END:VEVENT"
  ].join("\r\n");
}

function parseEvents(html) {
  const year = new Date().getFullYear();
  const events = [];

  for (let i = 0; i < MONTHS.length; i++) {
    const month = MONTHS[i];
    const monthNum = i + 1;

    const startIdx = html.indexOf(`id="${month}_Calendar"`);
    if (startIdx === -1) continue;
    const nextMonth = MONTHS[i + 1];
    const nextStart = nextMonth ? html.indexOf(`id="${nextMonth}_Calendar"`, startIdx) : -1;
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
        for (const [key, bin] of Object.entries(ALT_TO_BIN)) {
          if (alt.includes(key)) {
            events.push(makeEvent(bin, year, monthNum, day));
          }
        }
      }
    }
  }

  return events;
}

function isValidUPRN(uprn) {
  return /^\d{12}$/.test(uprn);
}

// ---- Test harness ----
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ''}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, substr, msg) {
  if (!str.includes(substr)) {
    throw new Error(`${msg || ''}\n        expected to contain: ${JSON.stringify(substr)}\n        in: ${JSON.stringify(str.slice(0, 200))}`);
  }
}

function assertNotContains(str, substr, msg) {
  if (str.includes(substr)) {
    throw new Error(`${msg || ''}\n        expected NOT to contain: ${JSON.stringify(substr)}`);
  }
}

function assertTrue(val, msg) {
  if (!val) throw new Error(msg || 'expected true');
}

// Helper to build synthetic HTML (same month in one table)
function makeSyntheticHTML(entries) {
  const monthDays = new Map();
  for (const [month, day, alts] of entries) {
    if (!monthDays.has(month)) monthDays.set(month, []);
    monthDays.get(month).push([day, alts]);
  }
  let html = '<html><body>';
  for (const [month, days] of monthDays) {
    html += `<table id="${month}_Calendar"><tbody>`;
    for (const [day, alts] of days) {
      html += `<tr><td class="calendar-day"><table>`;
      html += `<tr><td align="right" colspan="2">${day}</td></tr><tr><td>`;
      for (const alt of alts) {
        html += `<img alt="${alt} Bin" src="img.png"/>`;
      }
      html += `</td></tr></table></td></tr>`;
    }
    html += `</tbody></table>`;
  }
  html += '</body></html>';
  return html;
}

// ---- formatDate tests ----
console.log('\nformatDate:');
test('pads month and day with leading zeros', () => {
  assertEqual(formatDate(2026, 1, 7), '20260107');
});
test('handles double-digit month and day', () => {
  assertEqual(formatDate(2026, 12, 31), '20261231');
});
test('handles mid-year date', () => {
  assertEqual(formatDate(2025, 6, 15), '20250615');
});

// ---- makeEvent tests ----
console.log('\nmakeEvent:');
test('contains BEGIN:VEVENT and END:VEVENT', () => {
  const ev = makeEvent('BLUE', 2026, 3, 5);
  assertContains(ev, 'BEGIN:VEVENT');
  assertContains(ev, 'END:VEVENT');
});
test('SUMMARY contains bin name', () => {
  const ev = makeEvent('BLUE', 2026, 3, 5);
  assertContains(ev, 'SUMMARY:Bin collection - BLUE');
});
test('DTSTART is formatted correctly', () => {
  const ev = makeEvent('BLUE', 2026, 3, 5);
  assertContains(ev, 'DTSTART;VALUE=DATE:20260305');
});
test('DESCRIPTION contains bin description', () => {
  const ev = makeEvent('BLUE', 2026, 3, 5);
  assertContains(ev, BINS_DESCRIPTION.BLUE);
});
test('contains UID', () => {
  const ev = makeEvent('BLUE', 2026, 3, 5);
  assertContains(ev, 'UID:');
});
test('uses CRLF line endings', () => {
  const ev = makeEvent('BLUE', 2026, 3, 5);
  assertTrue(ev.includes('\r\n'), 'expected CRLF line endings');
});
test('BROWN bin description is correct', () => {
  const ev = makeEvent('BROWN', 2026, 3, 5);
  assertContains(ev, BINS_DESCRIPTION.BROWN);
});
test('all 5 bin types produce correct summary', () => {
  for (const bin of ['BLUE', 'BROWN', 'GREY', 'GREEN', 'PURPLE']) {
    const ev = makeEvent(bin, 2026, 3, 5);
    assertContains(ev, `SUMMARY:Bin collection - ${bin}`);
  }
});

// ---- parseEvents tests ----
console.log('\nparseEvents:');
test('synthetic HTML with multiple bins in March', () => {
  const html = makeSyntheticHTML([
    ['March', 5, ['blue', 'brown']],
    ['March', 12, ['grey']],
  ]);
  const events = parseEvents(html);
  assertEqual(events.length, 3, 'expected 3 events');
});

test('multi-month HTML returns correct event count', () => {
  const html = makeSyntheticHTML([
    ['January', 10, ['blue']],
    ['February', 15, ['brown']],
    ['March', 25, ['grey']],
  ]);
  const events = parseEvents(html);
  assertEqual(events.length, 3, 'expected 3 events across 3 months');
});

test('empty HTML returns no events', () => {
  const events = parseEvents('<html><body></body></html>');
  assertEqual(events.length, 0, 'expected 0 events');
});

test('whitespace-only day cell is skipped', () => {
  const html = `<table id="March_Calendar"><tr><td class="calendar-day"><table><tr><td align="right" colspan="2">  </td></tr></table></td></tr></table>`;
  const events = parseEvents(html);
  assertEqual(events.length, 0, 'expected 0 events for whitespace day');
});

test('all 5 bin types are parsed', () => {
  const html = makeSyntheticHTML([
    ['April', 1, ['blue', 'brown', 'grey', 'purple', 'green']],
  ]);
  const events = parseEvents(html);
  assertEqual(events.length, 5, 'expected 5 events for all bin types');
});

test('events contain correct DTSTART', () => {
  const year = new Date().getFullYear();
  const html = makeSyntheticHTML([['March', 5, ['blue']]]);
  const events = parseEvents(html);
  assertEqual(events.length, 1, 'expected 1 event');
  assertContains(events[0], `DTSTART;VALUE=DATE:${year}0305`);
});

// ---- UPRN validation tests ----
console.log('\nUPRN validation:');
test('12-digit UPRN is valid', () => {
  assertTrue(isValidUPRN('123456789012'), 'should be valid');
});
test('11-digit UPRN is invalid', () => {
  assertTrue(!isValidUPRN('12345678901'), 'should be invalid');
});
test('13-digit UPRN is invalid', () => {
  assertTrue(!isValidUPRN('1234567890123'), 'should be invalid');
});
test('UPRN with letters is invalid', () => {
  assertTrue(!isValidUPRN('12345678901a'), 'should be invalid');
});
test('empty UPRN is invalid', () => {
  assertTrue(!isValidUPRN(''), 'should be invalid');
});

// ---- handleRequest tests (using mock fetch) ----
console.log('\nhandleRequest:');

// We simulate handleRequest inline since we can't use the real Cloudflare fetch in Node
async function mockHandleRequest(url, fetchFn) {
  const uprn = new URL(url).pathname.substring(1);
  if (uprn === '') return { status: 400, text: 'UPRN not specified' };
  if (!/^\d{12}$/.test(uprn)) return { status: 400, text: 'UPRN is not valid (must be exactly 12 digits)' };

  let html;
  try {
    const res = await fetchFn(API + uprn);
    if (!res.ok) return { status: 502, text: 'Failed to fetch collection calendar: HTTP ' + res.status };
    html = await res.text();
  } catch (e) {
    return { status: 502, text: 'Failed to fetch collection calendar: ' + e.message };
  }

  const events = parseEvents(html);
  if (events.length === 0) return { status: 404, text: 'No collection events found. Check that the UPRN is correct.' };

  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nonPointer//Glasgow Bin Collection iCal//EN",
    "X-WR-CALNAME:Bins Collection",
    "X-WR-TIMEZONE:Europe/London",
    "X-WR-CALDESC:Events of bin collection in Glasgow area",
    events.join("\r\n"),
    "END:VCALENDAR"
  ].join("\r\n");

  return { status: 200, text: cal, contentType: 'text/calendar; charset=utf-8' };
}

async function runHandleRequestTests() {
  const mockFetchOK = (html) => async () => ({ ok: true, status: 200, text: async () => html });
  const mockFetchError = (status) => async () => ({ ok: false, status, text: async () => '' });
  const mockFetchThrow = async () => { throw new Error('network error'); };

  const syntheticHtml = makeSyntheticHTML([['March', 5, ['blue']]]);

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/', mockFetchOK(''));
    test('empty UPRN returns 400', () => assertEqual(res.status, 400));
  })();

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/abc', mockFetchOK(''));
    test('non-numeric UPRN returns 400', () => assertEqual(res.status, 400));
  })();

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/123', mockFetchOK(''));
    test('short UPRN returns 400', () => assertEqual(res.status, 400));
  })();

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/123456789012', mockFetchError(503));
    test('upstream 503 returns 502', () => assertEqual(res.status, 502));
  })();

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/123456789012', mockFetchThrow);
    test('network error returns 502', () => assertEqual(res.status, 502));
  })();

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/123456789012', mockFetchOK('<html></html>'));
    test('no events found returns 404', () => assertEqual(res.status, 404));
  })();

  await (async () => {
    const res = await mockHandleRequest('https://worker.dev/123456789012', mockFetchOK(syntheticHtml));
    test('valid UPRN with events returns 200 with iCal', () => {
      assertEqual(res.status, 200);
      assertContains(res.text, 'BEGIN:VCALENDAR');
      assertContains(res.text, 'BEGIN:VEVENT');
    });
  })();
}

runHandleRequestTests().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
