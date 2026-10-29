"""Google Calendar: sync coffee chats to the user's calendar and offer live availability in emails."""
from datetime import datetime, timedelta

import pytz
from googleapiclient.discovery import build

from gmail import get_google_credentials

# Drafts carry this line; it's replaced with live availability when the email is sent
AVAILABILITY_TOKEN = "[[AVAILABILITY: filled in from your Google Calendar when sent]]"

TZ_NAMES = {
    "America/New_York": "Eastern Time",
    "America/Chicago": "Central Time",
    "America/Denver": "Mountain Time",
    "America/Phoenix": "Arizona Time",
    "America/Los_Angeles": "Pacific Time",
    "America/Anchorage": "Alaska Time",
    "Pacific/Honolulu": "Hawaii Time",
}


def get_calendar_service(user_id: str):
    return build("calendar", "v3", credentials=get_google_credentials(user_id))


# --- Meeting sync (app -> Google Calendar) ---

def _event_body(contact: dict) -> dict:
    who = contact.get("name", "").strip()
    firm = contact.get("firm", "").strip()
    details = [
        f"Title: {contact['title']}" if contact.get("title") else "",
        f"Email: {contact['email']}" if contact.get("email") else "",
        f"LinkedIn: {contact['linkedin_url']}" if contact.get("linkedin_url") else "",
        "Added by Ducks In a Row",
    ]
    end = contact.get("meeting_end") or (
        datetime.fromisoformat(contact["meeting_at"].replace("Z", "+00:00")) + timedelta(minutes=30)
    ).isoformat()
    return {
        "summary": f"Coffee chat: {who}" + (f" ({firm})" if firm else ""),
        "description": "\n".join(d for d in details if d),
        "start": {"dateTime": contact["meeting_at"]},
        "end": {"dateTime": end},
    }


def sync_meeting(user_id: str, contact: dict) -> str | None:
    """Create, update or delete the contact's Google Calendar event. Returns the event id to store (None if removed).
    The contact is never added as an attendee, so Google sends them nothing."""
    service = get_calendar_service(user_id)
    event_id = contact.get("google_event_id")
    if not contact.get("meeting_at"):
        if event_id:
            try:
                service.events().delete(calendarId="primary", eventId=event_id).execute()
            except Exception:
                pass  # already deleted in Google Calendar
        return None
    body = _event_body(contact)
    if event_id:
        try:
            return service.events().update(calendarId="primary", eventId=event_id, body=body).execute()["id"]
        except Exception:
            pass  # deleted in Google Calendar; create a fresh one
    return service.events().insert(calendarId="primary", body=body).execute()["id"]


# --- Which calendars to read ---

def list_calendars(user_id: str) -> list[dict]:
    """Every calendar in the user's Google Calendar list: their own, shared, and subscribed (e.g. an Outlook feed)."""
    service = get_calendar_service(user_id)
    items = service.calendarList().list().execute().get("items", [])
    return [
        {
            "id": c["id"],
            "name": c.get("summaryOverride") or c.get("summary", c["id"]),
            "color": c.get("backgroundColor", "#94a3b8"),
            "primary": bool(c.get("primary")),
            "shown_in_google": bool(c.get("selected")),
        }
        for c in items if not c.get("deleted")
    ]


def chosen_calendars(user_id: str, settings: dict) -> list[dict]:
    """Calendars picked in Settings; until then, the ones checked in Google Calendar.
    Falls back to the main calendar if the calendar list can't be read (an older Google login)."""
    try:
        calendars = list_calendars(user_id)
    except Exception as e:
        print(f"[calendar] calendar list unavailable, using primary only: {e}")
        return [{"id": "primary", "name": "Google Calendar", "color": "#94a3b8", "primary": True}]
    picked = settings.get("calendar_ids")
    if picked:
        return [c for c in calendars if c["id"] in picked]
    return [c for c in calendars if c["shown_in_google"] or c["primary"]]


# --- Reading events (Google Calendar -> app) ---

def _raw_events(service, calendar_id: str, start: datetime, end: datetime) -> list[dict]:
    return service.events().list(
        calendarId=calendar_id, timeMin=start.isoformat() + "Z", timeMax=end.isoformat() + "Z",
        singleEvents=True, orderBy="startTime", maxResults=500,
    ).execute().get("items", [])


def list_events(user_id: str, start: datetime, end: datetime, settings: dict = None) -> list[dict]:
    service = get_calendar_service(user_id)
    events = []
    for cal in chosen_calendars(user_id, settings or {}):
        try:
            items = _raw_events(service, cal["id"], start, end)
        except Exception as e:
            print(f"[calendar] couldn't read {cal['name']}: {e}")
            continue
        events += [
            {
                "id": e["id"],
                "title": e.get("summary", "(busy)"),
                "start": e["start"].get("dateTime") or e["start"].get("date"),
                "end": e["end"].get("dateTime") or e["end"].get("date"),
                "all_day": "date" in e["start"],
                "calendar": cal["name"],
                "color": cal["color"],
            }
            for e in items if e.get("status") != "cancelled"
        ]
    return events


# --- Live availability ---

def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _busy_intervals(user_id: str, start_utc: datetime, end_utc: datetime, settings: dict = None) -> list[tuple[datetime, datetime]]:
    """Busy times across every chosen calendar. Google's free/busy check covers most calendars; subscribed
    feeds it can't answer for (like an Outlook link) are read event by event instead."""
    service = get_calendar_service(user_id)
    calendars = chosen_calendars(user_id, settings or {})
    res = service.freebusy().query(body={
        "timeMin": start_utc.isoformat() + "Z",
        "timeMax": end_utc.isoformat() + "Z",
        "items": [{"id": c["id"]} for c in calendars],
    }).execute()
    busy = []
    for cal in calendars:
        result = res.get("calendars", {}).get(cal["id"], {})
        if not result.get("errors"):
            busy += [(_parse(b["start"]), _parse(b["end"])) for b in result.get("busy", [])]
            continue
        try:
            for e in _raw_events(service, cal["id"], start_utc, end_utc):
                # All-day entries (reminders, deadlines) and events marked "free" don't block time
                if e.get("status") == "cancelled" or e.get("transparency") == "transparent" or "date" in e["start"]:
                    continue
                busy.append((_parse(e["start"]["dateTime"]), _parse(e["end"]["dateTime"])))
        except Exception as err:
            print(f"[availability] couldn't read {cal['name']}: {err}")
    return busy


def free_slots(settings: dict, busy: list[tuple[datetime, datetime]], now: datetime = None) -> list[tuple[datetime, datetime]]:
    """Free windows inside the user's calling hours on upcoming weekdays, starting tomorrow."""
    my_tz = pytz.timezone(settings.get("avail_timezone") or "America/Los_Angeles")
    start_hour = settings.get("avail_start_hour", 9)
    end_hour = settings.get("avail_end_hour", 17)
    min_len = timedelta(minutes=settings.get("avail_min_minutes", 30))
    days_ahead = settings.get("avail_days_ahead", 7)
    today = (now or datetime.now(pytz.utc)).astimezone(my_tz).date()

    slots = []
    for offset in range(1, days_ahead + 1):
        day = today + timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        cursor = my_tz.localize(datetime(day.year, day.month, day.day, start_hour))
        day_end = my_tz.localize(datetime(day.year, day.month, day.day, end_hour))
        for b_start, b_end in sorted(busy):
            if b_end <= cursor or b_start >= day_end:
                continue
            if b_start - cursor >= min_len:
                slots.append((cursor, b_start))
            cursor = max(cursor, b_end)
        if day_end - cursor >= min_len:
            slots.append((cursor, day_end))
    return slots


def _fmt_time(dt: datetime) -> str:
    """'9am', '12:30pm'"""
    return dt.strftime("%I:%M%p").lstrip("0").lower().replace(":00", "")


def _fmt_range(s: datetime, e: datetime) -> str:
    """'10am–12pm', '9–11:30am' (drop the first am/pm when both match)"""
    start, end = _fmt_time(s), _fmt_time(e)
    if start[-2:] == end[-2:]:
        start = start[:-2]
    return f"{start}–{end}"


P_STYLE = "margin:0 0 12px 0"


def format_availability(slots: list[tuple[datetime, datetime]], recipient_tz: str, max_days: int = 4) -> str:
    """HTML paragraphs: an intro line, one indented line per day ('Tuesday, Nov 4: 10am–12pm, 3–5pm'),
    and a closing line, in the recipient's time zone."""
    tz = pytz.timezone(recipient_tz)
    by_day: dict = {}
    for start, end in slots:
        s, e = start.astimezone(tz), end.astimezone(tz)
        by_day.setdefault(s.date(), []).append(_fmt_range(s, e))
    days = sorted(by_day)[:max_days]
    if not days:
        return ""
    label = TZ_NAMES.get(recipient_tz, recipient_tz)
    day_lines = "".join(
        f'<div style="margin:0 0 6px 0">&bull;&nbsp; {d.strftime("%A, %b")} {d.day}: {", ".join(by_day[d])}</div>'
        for d in days
    )
    return (f'<p style="{P_STYLE}">Here are some times I\'m free over the next week ({label}):</p>'
            f'<div style="margin:0 0 12px 12px">{day_lines}</div>'
            f'<p style="{P_STYLE}">Happy to work around your schedule if none of these work.</p>')


def fill_availability(body: str, user_id: str, settings: dict, recipient_tz: str) -> str:
    """Replace the availability placeholder with live times; fall back to the written availability if the calendar fails."""
    if AVAILABILITY_TOKEN not in body:
        return body
    text = ""
    try:
        now = datetime.utcnow()
        busy = _busy_intervals(user_id, now, now + timedelta(days=settings.get("avail_days_ahead", 7) + 2), settings)
        text = format_availability(free_slots(settings, busy), recipient_tz, settings.get("avail_max_days", 4))
    except Exception as e:
        print(f"[availability] calendar lookup failed, using written availability: {e}")
    if not text:
        written = (settings.get("availability") or "").strip()
        text = f'<p style="{P_STYLE}">I am generally available {written}.</p>' if written else ""
    # The placeholder sits in its own paragraph; swap the whole paragraph so the block's spacing is ours
    import re
    token = re.escape(AVAILABILITY_TOKEN)
    # Older drafts put the placeholder after the sign-off ("Best,<br>Gilbert"); move it in front
    sign_off = (r"(?:best|best regards|warm regards|kind regards|regards|thanks|thank you|many thanks|"
                r"sincerely|cheers|all the best)[,!.]?")
    body = re.sub(
        rf'(<p[^>]*>\s*{sign_off}\s*(?:<br\s*/?>[^<]*)?</p>)(\s*<p[^>]*>\s*{token}\s*</p>)',
        r"\2\1", body, flags=re.IGNORECASE,
    )
    replaced, n = re.subn(rf'<p[^>]*>\s*{token}\s*</p>', lambda _: text, body)
    return replaced if n else body.replace(AVAILABILITY_TOKEN, text)
