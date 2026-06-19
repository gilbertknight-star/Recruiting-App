import copy
import uuid
from datetime import date, datetime, timedelta
from db import DEFAULT_TEMPLATES

DEV_USER_ID = "dev-user"

_SEED_CONTACTS = [
    # Cold
    {"name": "James Whitfield", "email": "j.whitfield@goldmansachs.com", "title": "Investment Banking Analyst", "firm": "Goldman Sachs", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Priya Mehta", "email": "p.mehta@morganstanley.com", "title": "Investment Banking Analyst", "firm": "Morgan Stanley", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Connor Walsh", "email": "c.walsh@jpmorgan.com", "title": "Associate", "firm": "JP Morgan", "location": "Chicago", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Sofia Reyes", "email": "s.reyes@blackstone.com", "title": "Analyst", "firm": "Blackstone", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Tyler Brooks", "email": "t.brooks@lazard.com", "title": "Investment Banking Analyst", "firm": "Lazard", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Anika Patel", "email": "a.patel@evercore.com", "title": "Analyst", "firm": "Evercore", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Marcus Green", "email": "m.green@bain.com", "title": "Associate Consultant", "firm": "Bain & Company", "location": "Boston", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Lauren Kim", "email": "l.kim@baml.com", "title": "Investment Banking Analyst", "firm": "Bank of America", "location": "Charlotte", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Derek Ng", "email": "d.ng@citadel.com", "title": "Analyst", "firm": "Citadel", "location": "Chicago", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Rachel Torres", "email": "r.torres@ubs.com", "title": "Associate", "firm": "UBS", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    # Contacted
    {"name": "Michael Chen", "email": "m.chen@goldmansachs.com", "title": "Vice President", "firm": "Goldman Sachs", "location": "New York", "tier": "vp", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=5)).isoformat(), "follow_up_due": (date.today() + timedelta(days=2)).isoformat(), "gmail_thread_id": "thread_001"},
    {"name": "Sarah Mitchell", "email": "s.mitchell@morganstanley.com", "title": "Investment Banking Associate", "firm": "Morgan Stanley", "location": "New York", "tier": "analyst_associate", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=3)).isoformat(), "follow_up_due": (date.today() + timedelta(days=4)).isoformat(), "gmail_thread_id": "thread_002"},
    {"name": "David Park", "email": "d.park@jpmorgan.com", "title": "VP, Technology M&A", "firm": "JP Morgan", "location": "San Francisco", "tier": "vp", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=6)).isoformat(), "follow_up_due": (date.today() + timedelta(days=1)).isoformat(), "gmail_thread_id": "thread_003"},
    {"name": "Emily Zhao", "email": "e.zhao@lazard.com", "title": "Analyst", "firm": "Lazard", "location": "New York", "tier": "analyst_associate", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=2)).isoformat(), "follow_up_due": (date.today() + timedelta(days=5)).isoformat(), "gmail_thread_id": "thread_004"},
    {"name": "Ryan Foster", "email": "r.foster@evercore.com", "title": "Senior Associate", "firm": "Evercore", "location": "New York", "tier": "analyst_associate", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=4)).isoformat(), "follow_up_due": (date.today() + timedelta(days=3)).isoformat(), "gmail_thread_id": "thread_005"},
    {"name": "Jessica Wang", "email": "j.wang@baml.com", "title": "Associate", "firm": "Bank of America", "location": "New York", "tier": "analyst_associate", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=1)).isoformat(), "follow_up_due": (date.today() + timedelta(days=6)).isoformat(), "gmail_thread_id": "thread_006"},
    {"name": "Nathan Cole", "email": "n.cole@jefferies.com", "title": "Investment Banking Analyst", "firm": "Jefferies", "location": "New York", "tier": "analyst_associate", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=7)).isoformat(), "follow_up_due": (date.today()).isoformat(), "gmail_thread_id": "thread_007"},
    {"name": "Olivia Scott", "email": "o.scott@pwc.com", "title": "Director, Deals", "firm": "PwC", "location": "Dallas", "tier": "vp", "status": "Contacted", "sent_at": (datetime.utcnow() - timedelta(days=3)).isoformat(), "follow_up_due": (date.today() + timedelta(days=4)).isoformat(), "gmail_thread_id": "thread_008"},
    # Replied
    {"name": "Andrew Liu", "email": "a.liu@goldmansachs.com", "title": "Managing Director", "firm": "Goldman Sachs", "location": "New York", "tier": "md_partner", "status": "Replied", "sent_at": (datetime.utcnow() - timedelta(days=10)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=7)).isoformat()},
    {"name": "Stephanie Holt", "email": "s.holt@morganstanley.com", "title": "Vice President", "firm": "Morgan Stanley", "location": "New York", "tier": "vp", "status": "Replied", "sent_at": (datetime.utcnow() - timedelta(days=8)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=6)).isoformat()},
    {"name": "Kevin Ma", "email": "k.ma@kkr.com", "title": "Associate", "firm": "KKR", "location": "New York", "tier": "analyst_associate", "status": "Replied", "sent_at": (datetime.utcnow() - timedelta(days=9)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=5)).isoformat()},
    {"name": "Natalie Burns", "email": "n.burns@blackrock.com", "title": "Analyst", "firm": "BlackRock", "location": "New York", "tier": "analyst_associate", "status": "Replied", "sent_at": (datetime.utcnow() - timedelta(days=12)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=9)).isoformat()},
    {"name": "Brandon Lee", "email": "b.lee@carlyle.com", "title": "VP, Financial Sponsors", "firm": "The Carlyle Group", "location": "Washington DC", "tier": "vp", "status": "Replied", "sent_at": (datetime.utcnow() - timedelta(days=11)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=8)).isoformat()},
    # Warm
    {"name": "Rachel Kim", "email": "r.kim@bainCapital.com", "title": "Associate", "firm": "Bain Capital", "location": "Boston", "tier": "analyst_associate", "status": "Warm", "sent_at": (datetime.utcnow() - timedelta(days=15)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=12)).isoformat()},
    {"name": "Jason Clark", "email": "j.clark@apolloglobal.com", "title": "Vice President", "firm": "Apollo Global", "location": "New York", "tier": "vp", "status": "Warm", "sent_at": (datetime.utcnow() - timedelta(days=14)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=10)).isoformat()},
    {"name": "Megan Price", "email": "m.price@tpg.com", "title": "Associate", "firm": "TPG Capital", "location": "San Francisco", "tier": "analyst_associate", "status": "Warm", "sent_at": (datetime.utcnow() - timedelta(days=18)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=14)).isoformat()},
    {"name": "Chris Abbott", "email": "c.abbott@warburg.com", "title": "MD, Healthcare", "firm": "Warburg Pincus", "location": "New York", "tier": "md_partner", "status": "Warm", "sent_at": (datetime.utcnow() - timedelta(days=20)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=16)).isoformat()},
    {"name": "Amy Nguyen", "email": "a.nguyen@pwc.com", "title": "Analyst", "firm": "PwC", "location": "San Jose", "tier": "analyst_associate", "status": "Warm", "sent_at": (datetime.utcnow() - timedelta(days=13)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=9)).isoformat()},
    {"name": "Daniel Ross", "email": "d.ross@houlihan.com", "title": "Vice President", "firm": "Houlihan Lokey", "location": "Los Angeles", "tier": "vp", "status": "Warm", "sent_at": (datetime.utcnow() - timedelta(days=16)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=11)).isoformat()},
    # Meeting Scheduled
    {"name": "Samantha Reed", "email": "s.reed@goldmansachs.com", "title": "Partner", "firm": "Goldman Sachs", "location": "New York", "tier": "md_partner", "status": "Meeting Scheduled", "sent_at": (datetime.utcnow() - timedelta(days=22)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=18)).isoformat(), "meeting_at": (datetime.now() + timedelta(days=3)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat(), "meeting_end": (datetime.now() + timedelta(days=3)).replace(hour=10, minute=30, second=0, microsecond=0).isoformat()},
    {"name": "Tom Nguyen", "email": "t.nguyen@morganstanley.com", "title": "Vice President", "firm": "Morgan Stanley", "location": "New York", "tier": "vp", "status": "Meeting Scheduled", "sent_at": (datetime.utcnow() - timedelta(days=19)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=15)).isoformat(), "meeting_at": (datetime.now() + timedelta(days=5)).replace(hour=14, minute=30, second=0, microsecond=0).isoformat(), "meeting_end": (datetime.now() + timedelta(days=5)).replace(hour=15, minute=0, second=0, microsecond=0).isoformat()},
    {"name": "Grace Patel", "email": "g.patel@evercore.com", "title": "MD, Technology", "firm": "Evercore", "location": "San Francisco", "tier": "md_partner", "status": "Meeting Scheduled", "sent_at": (datetime.utcnow() - timedelta(days=25)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=20)).isoformat(), "meeting_at": (datetime.now() + timedelta(days=7)).replace(hour=9, minute=0, second=0, microsecond=0).isoformat(), "meeting_end": (datetime.now() + timedelta(days=7)).replace(hour=9, minute=30, second=0, microsecond=0).isoformat()},
    # Closed
    {"name": "William Turner", "email": "w.turner@lazard.com", "title": "Managing Director", "firm": "Lazard", "location": "New York", "tier": "md_partner", "status": "Referral", "sent_at": (datetime.utcnow() - timedelta(days=30)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=25)).isoformat()},
    {"name": "Isabella Cruz", "email": "i.cruz@jefferies.com", "title": "Associate", "firm": "Jefferies", "location": "New York", "tier": "analyst_associate", "status": "Referral", "sent_at": (datetime.utcnow() - timedelta(days=28)).isoformat(), "replied_at": (datetime.utcnow() - timedelta(days=22)).isoformat()},
    # More Cold to round out to 50
    {"name": "Patrick Stone", "email": "p.stone@citi.com", "title": "Investment Banking Analyst", "firm": "Citi", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Hannah Moore", "email": "h.moore@deutschebank.com", "title": "Analyst", "firm": "Deutsche Bank", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Eric Sanders", "email": "e.sanders@barclays.com", "title": "Associate", "firm": "Barclays", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Nina Johansson", "email": "n.johansson@rothschild.com", "title": "Analyst", "firm": "Rothschild & Co", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Sean Murphy", "email": "s.murphy@pjt.com", "title": "Investment Banking Analyst", "firm": "PJT Partners", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Victoria Huang", "email": "v.huang@guggenheim.com", "title": "Analyst", "firm": "Guggenheim Securities", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Alex Turner", "email": "a.turner@baml.com", "title": "Vice President", "firm": "Bank of America", "location": "New York", "tier": "vp", "status": "Cold"},
    {"name": "Julia Simmons", "email": "j.simmons@stifel.com", "title": "Associate", "firm": "Stifel", "location": "St. Louis", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Robert Haines", "email": "r.haines@blair.com", "title": "Investment Banking Analyst", "firm": "William Blair", "location": "Chicago", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Chloe Bennett", "email": "c.bennett@cowen.com", "title": "Analyst", "firm": "Cowen", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Mark Donovan", "email": "m.donovan@leerink.com", "title": "Managing Director", "firm": "Leerink Partners", "location": "Boston", "tier": "md_partner", "status": "Cold"},
    {"name": "Tiffany Wu", "email": "t.wu@moelis.com", "title": "Analyst", "firm": "Moelis & Company", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Cameron Hill", "email": "c.hill@perella.com", "title": "Associate", "firm": "Perella Weinberg", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Alicia Ford", "email": "a.ford@centurygroup.com", "title": "VP, Consumer", "firm": "Century Group", "location": "Los Angeles", "tier": "vp", "status": "Cold"},
    {"name": "Joshua Bell", "email": "j.bell@nomura.com", "title": "Investment Banking Analyst", "firm": "Nomura", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
    {"name": "Melissa Grant", "email": "m.grant@creditsuisse.com", "title": "Associate", "firm": "Credit Suisse", "location": "New York", "tier": "analyst_associate", "status": "Cold"},
]

_SAMPLE_EMAIL = """Hello {name},

My name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.

I'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.

I have attached my resume and a recent report for the Oregon Investment Group.

Best,
Gilbert"""

def _make_contact(seed: dict) -> dict:
    cid = str(uuid.uuid4())
    days_ago = 30 - _SEED_CONTACTS.index(seed)
    has_email = seed["status"] not in ("Cold",)
    return {
        "id": cid,
        "user_id": DEV_USER_ID,
        "linkedin_url": "",
        "school": "",
        "notes": "",
        "created_at": (datetime.utcnow() - timedelta(days=days_ago)).isoformat(),
        "generated_email": _SAMPLE_EMAIL.format(name=seed["name"].split()[0], firm=seed["firm"]) if has_email else None,
        "generated_subject": "UOregon Freshman - Gilbert Knight" if has_email else None,
        "sent_at": None,
        "replied_at": None,
        "follow_up_due": None,
        "meeting_at": None,
        "meeting_end": None,
        "gmail_thread_id": None,
        **seed,
    }

_contacts: dict[str, dict] = {c["id"]: c for c in [_make_contact(s) for s in _SEED_CONTACTS]}
_settings: dict = {
    "user_id": DEV_USER_ID,
    "daily_cap": 50,
    "emails_per_minute": 10,
    "sender_name": "Gilbert Knight",
    "sender_school": "University of Oregon",
    "attachments": [],
    "availability": "Monday through Friday, 9am to 5pm PST",
    "signature": "Best,\nGilbert Knight\nUniversity of Oregon | Mathematics & Finance",
    "today_sent": 7,
    "total_sent": 32,
    "last_reset_date": date.today().isoformat(),
}
_templates: dict[str, dict] = {
    t["tier"]: {"id": str(uuid.uuid4()), "user_id": DEV_USER_ID, **t}
    for t in DEFAULT_TEMPLATES
}


def get_all_contacts(user_id: str) -> list:
    return sorted(_contacts.values(), key=lambda c: c["created_at"], reverse=True)


def create_contact(user_id: str, data: dict) -> dict:
    from contacts import detect_tier
    contact = {
        "id": str(uuid.uuid4()),
        "user_id": DEV_USER_ID,
        "status": "Cold",
        "created_at": datetime.utcnow().isoformat(),
        "generated_email": None,
        "generated_subject": None,
        "sent_at": None,
        "replied_at": None,
        "follow_up_due": None,
        "gmail_thread_id": None,
        **data,
    }
    if not contact.get("tier"):
        contact["tier"] = detect_tier(contact.get("title", ""))
    _contacts[contact["id"]] = contact
    return copy.deepcopy(contact)


def update_contact(user_id: str, contact_id: str, updates: dict) -> dict | None:
    if contact_id not in _contacts:
        return None
    _contacts[contact_id].update(updates)
    return copy.deepcopy(_contacts[contact_id])


def delete_contact(user_id: str, contact_id: str):
    _contacts.pop(contact_id, None)


def bulk_upsert_contacts(user_id: str, contacts: list[dict]) -> dict:
    existing_emails = {c["email"] for c in _contacts.values()}
    added = 0
    for c in contacts:
        if c["email"] not in existing_emails:
            contact_id = str(uuid.uuid4())
            _contacts[contact_id] = {
                "id": contact_id,
                "status": "Cold",
                "created_at": datetime.utcnow().isoformat(),
                "generated_email": None,
                "generated_subject": None,
                "sent_at": None,
                "replied_at": None,
                "follow_up_due": None,
                "gmail_thread_id": None,
                **c,
            }
            existing_emails.add(c["email"])
            added += 1
    return {"added": added, "skipped": len(contacts) - added}


def get_settings(user_id: str) -> dict:
    return copy.deepcopy(_settings)


def update_settings(user_id: str, updates: dict) -> dict:
    _settings.update(updates)
    return copy.deepcopy(_settings)


def get_templates(user_id: str) -> dict:
    return copy.deepcopy(_templates)


def update_template(user_id: str, tier: str, updates: dict) -> dict | None:
    if tier not in _templates:
        return None
    _templates[tier].update(updates)
    return copy.deepcopy(_templates[tier])


def get_stats(user_id: str) -> dict:
    contacts = list(_contacts.values())
    today = date.today().isoformat()
    if _settings.get("last_reset_date") != today:
        _settings["today_sent"] = 0
        _settings["last_reset_date"] = today
    return {
        "total_contacts": len(contacts),
        "cold": sum(1 for c in contacts if c["status"] == "Cold"),
        "contacted": sum(1 for c in contacts if c["status"] == "Contacted"),
        "replied": sum(1 for c in contacts if c["status"] == "Replied"),
        "warm": sum(1 for c in contacts if c["status"] == "Warm"),
        "meeting_scheduled": sum(1 for c in contacts if c["status"] == "Meeting Scheduled"),
        "closed": sum(1 for c in contacts if c["status"] == "Referral"),
        "total_sent": _settings.get("total_sent", 0),
        "today_sent": _settings.get("today_sent", 0),
        "daily_cap": _settings.get("daily_cap", 50),
    }


def increment_sent(user_id: str):
    today = date.today().isoformat()
    if _settings.get("last_reset_date") != today:
        _settings["today_sent"] = 0
        _settings["last_reset_date"] = today
    _settings["today_sent"] = _settings.get("today_sent", 0) + 1
    _settings["total_sent"] = _settings.get("total_sent", 0) + 1
