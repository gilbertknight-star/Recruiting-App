import copy
import uuid
from datetime import date, datetime
from db import DEFAULT_TEMPLATES

DEV_USER_ID = "dev-user"

_contacts: dict[str, dict] = {}
_settings: dict = {
    "user_id": DEV_USER_ID,
    "daily_cap": 50,
    "emails_per_minute": 10,
    "sender_name": "Gilbert Knight",
    "sender_school": "University of Oregon",
    "resume_attachment_path": "",
    "availability": "Monday through Friday, 9am to 5pm PST",
    "today_sent": 0,
    "total_sent": 0,
    "last_reset_date": None,
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
        "closed": sum(1 for c in contacts if c["status"] == "Closed"),
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
