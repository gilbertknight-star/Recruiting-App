import json
import csv
import io
import uuid
from datetime import date, datetime
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "contacts.json"

TIER_KEYWORDS = {
    "analyst": "analyst_associate",
    "associate": "analyst_associate",
    "vp": "vp",
    "vice president": "vp",
    "director": "vp",
    "n/a": "n_a",
    "md": "md_partner",
    "managing director": "md_partner",
    "partner": "md_partner",
    "principal": "md_partner",
    "head": "md_partner",
}

STATUS_FLOW = ["Cold", "Contacted", "Replied", "Warm", "Meeting Scheduled", "Closed"]


def load_data() -> dict:
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_data(data: dict):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)


def detect_tier(title: str) -> str:
    title_lower = title.lower()
    for keyword, tier in TIER_KEYWORDS.items():
        if keyword in title_lower:
            return tier
    return "analyst_associate"


def parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    contacts = []
    for row in reader:
        name = row.get("Name", "").strip()
        email = row.get("Email", "").strip()
        if not name or not email:
            continue
        title = row.get("Title", "").strip()
        contacts.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "title": title,
            "firm": row.get("Firm", "").strip(),
            "email": email,
            "linkedin_url": row.get("LinkedIn URL", "").strip(),
            "school": row.get("School", "").strip(),
            "location": row.get("Location", "").strip(),
            "notes": row.get("Notes", "").strip(),
            "tier": detect_tier(title),
            "status": "Cold",
            "sent_at": None,
            "replied_at": None,
            "follow_up_due": None,
            "gmail_thread_id": None,
            "generated_email": None,
            "generated_subject": None,
            "created_at": datetime.utcnow().isoformat(),
        })
    return contacts


def get_all_contacts() -> list[dict]:
    return load_data()["contacts"]


def upsert_contacts(new_contacts: list[dict]) -> dict:
    data = load_data()
    existing_emails = {c["email"] for c in data["contacts"]}
    added = 0
    for c in new_contacts:
        if c["email"] not in existing_emails:
            data["contacts"].append(c)
            existing_emails.add(c["email"])
            added += 1
    save_data(data)
    return {"added": added, "skipped": len(new_contacts) - added}


def update_contact(contact_id: str, updates: dict) -> dict | None:
    data = load_data()
    for i, c in enumerate(data["contacts"]):
        if c["id"] == contact_id:
            data["contacts"][i].update(updates)
            save_data(data)
            return data["contacts"][i]
    return None


def get_daily_sent_count() -> int:
    data = load_data()
    today = date.today().isoformat()
    if data["stats"]["last_reset_date"] != today:
        data["stats"]["today_sent"] = 0
        data["stats"]["last_reset_date"] = today
        save_data(data)
    return data["stats"]["today_sent"]


def increment_sent_count():
    data = load_data()
    today = date.today().isoformat()
    if data["stats"]["last_reset_date"] != today:
        data["stats"]["today_sent"] = 0
        data["stats"]["last_reset_date"] = today
    data["stats"]["today_sent"] += 1
    data["stats"]["total_sent"] += 1
    save_data(data)


def get_stats() -> dict:
    data = load_data()
    contacts = data["contacts"]
    today = date.today().isoformat()
    if data["stats"]["last_reset_date"] != today:
        data["stats"]["today_sent"] = 0
        data["stats"]["last_reset_date"] = today
        save_data(data)
    return {
        "total_contacts": len(contacts),
        "cold": sum(1 for c in contacts if c["status"] == "Cold"),
        "contacted": sum(1 for c in contacts if c["status"] == "Contacted"),
        "replied": sum(1 for c in contacts if c["status"] == "Replied"),
        "warm": sum(1 for c in contacts if c["status"] == "Warm"),
        "meeting_scheduled": sum(1 for c in contacts if c["status"] == "Meeting Scheduled"),
        "closed": sum(1 for c in contacts if c["status"] == "Closed"),
        "total_sent": data["stats"]["total_sent"],
        "today_sent": data["stats"]["today_sent"],
        "daily_cap": data["settings"]["daily_cap"],
    }
