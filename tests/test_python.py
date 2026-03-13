"""Unit tests for main.py"""
import sys
import os
import unittest
import datetime
from unittest.mock import MagicMock, patch

# Add parent directory to path so we can import main
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main as m


def make_synthetic_html(entries):
    """Build a minimal HTML page with the given month/day/alt combinations.
    entries: list of (month_name, day, [alt, ...])
    Days in the same month are grouped into one table.
    """
    from collections import OrderedDict
    month_days = OrderedDict()
    for month, day, alts in entries:
        if month not in month_days:
            month_days[month] = []
        month_days[month].append((day, alts))

    parts = ["<html><body>"]
    for month, days in month_days.items():
        parts.append(f'<table id="{month}_Calendar"><tbody>')
        for day, alts in days:
            parts.append('<tr><td class="calendar-day"><table>')
            parts.append(f'<tr><td align="right" colspan="2">{day}</td></tr>')
            parts.append('<tr><td>')
            for alt in alts:
                parts.append(f'<img alt="{alt} Bin" src="img.png"/>')
            parts.append('</td></tr></table></td></tr>')
        parts.append('</tbody></table>')
    parts.append("</body></html>")
    return "".join(parts)


class TestCreateEvent(unittest.TestCase):
    def test_create_event_summary(self):
        date = datetime.date(2026, 3, 5)
        event = m.create_event(m.Bin.BLUE, date)
        self.assertIn("Bin collection - BLUE", str(event.get("summary")))

    def test_create_event_dtstart(self):
        date = datetime.date(2026, 3, 5)
        event = m.create_event(m.Bin.BLUE, date)
        self.assertEqual(event.get("dtstart").dt, date)

    def test_create_event_description(self):
        date = datetime.date(2026, 3, 5)
        event = m.create_event(m.Bin.BLUE, date)
        self.assertIn("blue bins", str(event.get("description")).lower())

    def test_create_event_uid(self):
        date = datetime.date(2026, 3, 5)
        event = m.create_event(m.Bin.BLUE, date)
        self.assertIsNotNone(event.get("uid"))
        self.assertNotEqual(str(event.get("uid")), "")

    def test_create_event_location(self):
        date = datetime.date(2026, 3, 5)
        event = m.create_event(m.Bin.BLUE, date)
        self.assertEqual(str(event.get("location")), "")


class TestBuildCalendar(unittest.TestCase):
    def test_build_calendar_headers(self):
        cal = m.build_calendar([])
        ical_str = cal.to_ical().decode("utf-8")
        self.assertIn("BEGIN:VCALENDAR", ical_str)
        self.assertIn("VERSION:2.0", ical_str)
        self.assertIn("-//nonPointer//Glasgow Bin Collection iCal//EN", ical_str)
        self.assertIn("Bins Collection", ical_str)
        self.assertIn("Europe/London", ical_str)
        self.assertIn("Events of bin collection in Glasgow area", ical_str)

    def test_build_calendar_with_events(self):
        date = datetime.date(2026, 3, 5)
        events = [m.create_event(m.Bin.BLUE, date), m.create_event(m.Bin.BROWN, date)]
        cal = m.build_calendar(events)
        ical_str = cal.to_ical().decode("utf-8")
        self.assertEqual(ical_str.count("BEGIN:VEVENT"), 2)

    def test_build_calendar_empty(self):
        cal = m.build_calendar([])
        ical_str = cal.to_ical().decode("utf-8")
        self.assertNotIn("BEGIN:VEVENT", ical_str)


class TestParseEvents(unittest.TestCase):
    def _parse(self, html):
        import bs4
        soup = bs4.BeautifulSoup(html, "html.parser")
        return m.parse_events(soup)

    def test_parse_events_synthetic(self):
        html = make_synthetic_html([
            ("March", 5, ["blue", "brown"]),
            ("March", 12, ["grey"]),
        ])
        events = self._parse(html)
        self.assertEqual(len(events), 3)

    def test_parse_events_empty(self):
        events = self._parse("<html><body></body></html>")
        self.assertEqual(len(events), 0)

    def test_parse_events_invalid_day(self):
        html = make_synthetic_html([("February", 99, ["blue"])])
        events = self._parse(html)
        self.assertEqual(len(events), 0)

    def test_parse_events_multi_month(self):
        html = make_synthetic_html([
            ("January", 10, ["blue"]),
            ("June", 15, ["brown"]),
            ("December", 25, ["grey"]),
        ])
        events = self._parse(html)
        self.assertEqual(len(events), 3)

    def test_parse_events_all_bin_types(self):
        html = make_synthetic_html([
            ("April", 1, ["blue", "brown", "grey", "purple", "green"]),
        ])
        events = self._parse(html)
        self.assertEqual(len(events), 5)

    def test_parse_events_description_correct(self):
        html = make_synthetic_html([("March", 5, ["blue"])])
        events = self._parse(html)
        self.assertEqual(len(events), 1)
        desc = str(events[0].get("description"))
        self.assertIn("blue bins", desc.lower())


class TestFetchPage(unittest.TestCase):
    def test_fetch_page_timeout(self):
        import requests
        with patch("requests.get", side_effect=requests.exceptions.Timeout):
            with self.assertRaises(SystemExit) as ctx:
                m.fetch_page("123456789012")
            self.assertEqual(ctx.exception.code, 1)

    def test_fetch_page_http_error(self):
        import requests
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            response=mock_response
        )
        with patch("requests.get", return_value=mock_response):
            with self.assertRaises(SystemExit) as ctx:
                m.fetch_page("123456789012")
            self.assertEqual(ctx.exception.code, 1)

    def test_fetch_page_success(self):
        import bs4
        import requests
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.text = "<html><body>Test</body></html>"
        with patch("requests.get", return_value=mock_response):
            result = m.fetch_page("123456789012")
        self.assertIsInstance(result, bs4.BeautifulSoup)


if __name__ == "__main__":
    unittest.main()
