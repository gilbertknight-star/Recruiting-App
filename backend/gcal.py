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


# --- Reading events (Google Calendar -> app) ---

def list_events(user_id: str, start: datetime, end: datetime) -> list[dict]:
    service = get_calendar_service(user_id)
    items = service.events().list(
        calendarId="primary", timeMin=start.isoformat() + "Z", timeMax=end.isoformat() + "Z",
        singleEvents=True, orderBy="startTime", maxResults=500,
    ).execute().get("items", [])
    return [
        {
            "id": e["id"],
            "title": e.get("summary", "(busy)"),
            "start": e["start"].get("dateTime") or e["start"].get("date"),
            "end": e["end"].get("dateTime") or e["end"].get("date"),
            "all_day": "date" in e["start"],
        }
        for e in items if e.get("status") != "cancelled"
    ]


# --- Live availability ---

def _busy_intervals(user_id: str, start_utc: datetime, end_utc: datetime) -> list[tuple[datetime, datetime]]:
    service = get_calendar_service(user_id)
    res = service.freebusy().query(body={
        "timeMin": start_utc.isoformat() + "Z",
        "timeMax": end_utc.isoformat() + "Z",
        "items": [{"id": "primary"}],
    }).execute()
    busy = res["calendars"]["primary"].get("busy", [])
    return [
        (datetime.fromisoformat(b["start"].replace("Z", "+00:00")), datetime.fromisoformat(b["end"].replace("Z", "+00:00")))
        for b in busy
    ]


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
    return dt.strftime("%I:%M%p").lstrip("0").lower()


def format_availability(slots: list[tuple[datetime, datetime]], recipient_tz: str, max_days: int = 4) -> str:
    """HTML lines like 'Tue 11/4: 10:00am–12:00pm, 3:00–5:00pm' in the recipient's time zone."""
    tz = pytz.timezone(recipient_tz)
    by_day: dict = {}
    for start, end in slots:
        s, e = start.astimezone(tz), end.astimezone(tz)
        by_day.setdefault(s.date(), []).append(f"{_fmt_time(s)}–{_fmt_time(e)}")
    days = sorted(by_day)[:max_days]
    if not days:
        return ""
    lines = [f"{d.strftime('%a')} {d.month}/{d.day}: {', '.join(by_day[d])}" for d in days]
    label = TZ_NAMES.get(recipient_tz, recipient_tz)
    return (f"Here are some times I'm free over the next week ({label}):<br>" + "<br>".join(lines)
            + "<br>Happy to work around your schedule if none of these work.")


def fill_availability(body: str, user_id: str, settings: dict, recipient_tz: str) -> str:
    """Replace the availability placeholder with live times; fall back to the written availability if the calendar fails."""
    if AVAILABILITY_TOKEN not in body:
        return body
    text = ""
    try:
        now = datetime.utcnow()
        busy = _busy_intervals(user_id, now, now + timedelta(days=settings.get("avail_days_ahead", 7) + 2))
        text = format_availability(free_slots(settings, busy), recipient_tz, settings.get("avail_max_days", 4))
    except Exception as e:
        print(f"[availability] calendar lookup failed, using written availability: {e}")
    if not text:
        written = (settings.get("availability") or "").strip()
        text = f"I am generally available {written}." if written else ""
    return body.replace(AVAILABILITY_TOKEN, text)
