"""
Maps city names (from contact location strings) to IANA timezone identifiers.
Lookup is case-insensitive and matches on the first word/phrase that appears
in the location string, so "New York, NY" and "New York City" both work.
Falls back to UTC if no match found.
"""

from datetime import datetime
import pytz
import re

# 50+ US cities + major global finance hubs
CITY_TIMEZONES = {
    # Northeast
    "new york":         "America/New_York",
    "nyc":              "America/New_York",
    "manhattan":        "America/New_York",
    "brooklyn":         "America/New_York",
    "philadelphia":     "America/New_York",
    "boston":           "America/New_York",
    "hartford":         "America/New_York",
    "buffalo":          "America/New_York",
    "albany":           "America/New_York",
    "providence":       "America/New_York",
    "portland me":      "America/New_York",
    "newark":           "America/New_York",
    "jersey city":      "America/New_York",
    "pittsburgh":       "America/New_York",
    "baltimore":        "America/New_York",
    "washington":       "America/New_York",
    "dc":               "America/New_York",
    "richmond":         "America/New_York",
    "virginia beach":   "America/New_York",
    "norfolk":          "America/New_York",
    "raleigh":          "America/New_York",
    "charlotte":        "America/New_York",
    "durham":           "America/New_York",
    "columbia sc":      "America/New_York",
    "jacksonville":     "America/New_York",
    "miami":            "America/New_York",
    "orlando":          "America/New_York",
    "tampa":            "America/New_York",
    "atlanta":          "America/New_York",
    "columbus oh":      "America/New_York",
    "cleveland":        "America/New_York",
    "cincinnati":       "America/New_York",
    "detroit":          "America/Detroit",
    "indianapolis":     "America/Indiana/Indianapolis",
    "louisville":       "America/New_York",
    "lexington":        "America/New_York",

    # Central
    "chicago":          "America/Chicago",
    "milwaukee":        "America/Chicago",
    "minneapolis":      "America/Chicago",
    "st paul":          "America/Chicago",
    "kansas city":      "America/Chicago",
    "st louis":         "America/Chicago",
    "saint louis":      "America/Chicago",
    "omaha":            "America/Chicago",
    "des moines":       "America/Chicago",
    "dallas":           "America/Chicago",
    "fort worth":       "America/Chicago",
    "houston":          "America/Chicago",
    "san antonio":      "America/Chicago",
    "austin":           "America/Chicago",
    "oklahoma city":    "America/Chicago",
    "tulsa":            "America/Chicago",
    "memphis":          "America/Chicago",
    "nashville":        "America/Chicago",
    "new orleans":      "America/Chicago",
    "baton rouge":      "America/Chicago",
    "little rock":      "America/Chicago",
    "wichita":          "America/Chicago",

    # Mountain
    "denver":           "America/Denver",
    "colorado springs": "America/Denver",
    "salt lake city":   "America/Denver",
    "albuquerque":      "America/Denver",
    "el paso":          "America/Denver",
    "boise":            "America/Denver",
    "billings":         "America/Denver",
    "phoenix":          "America/Phoenix",
    "tucson":           "America/Phoenix",
    "mesa":             "America/Phoenix",
    "scottsdale":       "America/Phoenix",
    "las vegas":        "America/Los_Angeles",

    # Pacific
    "los angeles":      "America/Los_Angeles",
    "la":               "America/Los_Angeles",
    "san francisco":    "America/Los_Angeles",
    "sf":               "America/Los_Angeles",
    "san jose":         "America/Los_Angeles",
    "san diego":        "America/Los_Angeles",
    "sacramento":       "America/Los_Angeles",
    "fresno":           "America/Los_Angeles",
    "long beach":       "America/Los_Angeles",
    "oakland":          "America/Los_Angeles",
    "bakersfield":      "America/Los_Angeles",
    "anaheim":          "America/Los_Angeles",
    "santa ana":        "America/Los_Angeles",
    "irvine":           "America/Los_Angeles",
    "palo alto":        "America/Los_Angeles",
    "menlo park":       "America/Los_Angeles",
    "seattle":          "America/Los_Angeles",
    "portland":         "America/Los_Angeles",
    "spokane":          "America/Los_Angeles",

    # Non-contiguous US
    "honolulu":         "Pacific/Honolulu",
    "hawaii":           "Pacific/Honolulu",
    "anchorage":        "America/Anchorage",
    "alaska":           "America/Anchorage",

    # Canada
    "toronto":          "America/Toronto",
    "montreal":         "America/Toronto",
    "vancouver":        "America/Vancouver",
    "calgary":          "America/Denver",

    # Global finance hubs
    "london":           "Europe/London",
    "paris":            "Europe/Paris",
    "frankfurt":        "Europe/Berlin",
    "berlin":           "Europe/Berlin",
    "zurich":           "Europe/Zurich",
    "geneva":           "Europe/Zurich",
    "amsterdam":        "Europe/Amsterdam",
    "madrid":           "Europe/Madrid",
    "milan":            "Europe/Rome",
    "dubai":            "Asia/Dubai",
    "abu dhabi":        "Asia/Dubai",
    "hong kong":        "Asia/Hong_Kong",
    "singapore":        "Asia/Singapore",
    "tokyo":            "Asia/Tokyo",
    "osaka":            "Asia/Tokyo",
    "shanghai":         "Asia/Shanghai",
    "beijing":          "Asia/Shanghai",
    "seoul":            "Asia/Seoul",
    "mumbai":           "Asia/Kolkata",
    "bangalore":        "Asia/Kolkata",
    "sydney":           "Australia/Sydney",
    "melbourne":        "Australia/Melbourne",
    "auckland":         "Pacific/Auckland",
    "sao paulo":        "America/Sao_Paulo",
    "mexico city":      "America/Mexico_City",
}


def location_to_timezone(location: str) -> str:
    """
    Given a location string like 'New York, NY' or 'San Francisco, CA',
    return the best-matching IANA timezone. Falls back to 'America/New_York'
    (most IB contacts are on the East Coast) if no match found.
    """
    if not location:
        return "America/New_York"

    loc = location.lower().strip()

    # Try longest matches first to avoid 'la' matching 'dallas'
    for city in sorted(CITY_TIMEZONES, key=len, reverse=True):
        if re.search(r'\b' + re.escape(city) + r'\b', loc):
            return CITY_TIMEZONES[city]

    return "America/New_York"  # sensible IB default


def local_to_utc(date_str: str, time_str: str, timezone_id: str) -> datetime:
    """
    Convert a local date+time (e.g. '2026-06-21', '09:00') in the given
    timezone to a UTC datetime.
    """
    tz = pytz.timezone(timezone_id)
    local_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    local_dt = tz.localize(local_dt)
    return local_dt.astimezone(pytz.utc).replace(tzinfo=None)
