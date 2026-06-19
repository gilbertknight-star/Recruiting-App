import csv
import io
import uuid
from datetime import date, datetime
from db import supabase

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


def detect_tier(title: str) -> str:
    title_lower = title.lower()
    for keyword, tier in TIER_KEYWORDS.items():
        if keyword in title_lower:
            return tier
    return "analyst_associate"


def get_all_contacts(user_id: str) -> list:
    res = supabase.table("contacts").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return res.data or []


def create_contact(user_id: str, data: dict) -> dict:
    data["user_id"] = user_id
    if not data.get("tier"):
        data["tier"] = detect_tier(data.get("title", ""))
    res = supabase.table("contacts").insert(data).execute()
    return res.data[0]


def update_contact(user_id: str, contact_id: str, updates: dict) -> dict | None:
    res = supabase.table("contacts").update(updates).eq("id", contact_id).eq("user_id", user_id).execute()
    return res.data[0] if res.data else None


def delete_contact(user_id: str, contact_id: str):
    supabase.table("contacts").delete().eq("id", contact_id).eq("user_id", user_id).execute()


def parse_csv(content: bytes, user_id: str) -> list[dict]:
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
            "user_id": user_id,
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
        })
    return contacts


def bulk_upsert_contacts(user_id: str, contacts: list[dict]) -> dict:
    if not contacts:
        return {"added": 0, "skipped": 0}
    existing_res = supabase.table("contacts").select("email").eq("user_id", user_id).execute()
    existing_emails = {c["email"] for c in (existing_res.data or [])}
    new_contacts = [c for c in contacts if c["email"] not in existing_emails]
    if new_contacts:
        supabase.table("contacts").insert(new_contacts).execute()
    return {"added": len(new_contacts), "skipped": len(contacts) - len(new_contacts)}


def get_settings(user_id: str) -> dict:
    res = supabase.table("settings").select("*").eq("user_id", user_id).execute()
    return res.data[0] if res.data else {}


def update_settings(user_id: str, updates: dict) -> dict:
    res = supabase.table("settings").update(updates).eq("user_id", user_id).execute()
    return res.data[0] if res.data else {}


def get_templates(user_id: str) -> dict:
    res = supabase.table("templates").select("*").eq("user_id", user_id).execute()
    return {t["tier"]: t for t in (res.data or [])}


def update_template(user_id: str, tier: str, updates: dict) -> dict | None:
    res = supabase.table("templates").update(updates).eq("user_id", user_id).eq("tier", tier).execute()
    return res.data[0] if res.data else None


def get_stats(user_id: str) -> dict:
    contacts = get_all_contacts(user_id)
    settings = get_settings(user_id)
    today = date.today().isoformat()

    today_sent = settings.get("today_sent", 0)
    last_reset = settings.get("last_reset_date")
    if last_reset != today:
        supabase.table("settings").update({"today_sent": 0, "last_reset_date": today}).eq("user_id", user_id).execute()
        today_sent = 0

    return {
        "total_contacts": len(contacts),
        "cold": sum(1 for c in contacts if c["status"] == "Cold"),
        "contacted": sum(1 for c in contacts if c["status"] == "Contacted"),
        "replied": sum(1 for c in contacts if c["status"] == "Replied"),
        "warm": sum(1 for c in contacts if c["status"] == "Warm"),
        "meeting_scheduled": sum(1 for c in contacts if c["status"] == "Meeting Scheduled"),
        "closed": sum(1 for c in contacts if c["status"] == "Closed"),
        "total_sent": settings.get("total_sent", 0),
        "today_sent": today_sent,
        "daily_cap": settings.get("daily_cap", 50),
    }


def increment_sent(user_id: str):
    settings = get_settings(user_id)
    today = date.today().isoformat()
    today_sent = settings.get("today_sent", 0) if settings.get("last_reset_date") == today else 0
    supabase.table("settings").update({
        "today_sent": today_sent + 1,
        "total_sent": settings.get("total_sent", 0) + 1,
        "last_reset_date": today,
    }).eq("user_id", user_id).execute()
