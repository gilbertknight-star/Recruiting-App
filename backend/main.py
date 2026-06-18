from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import json

from contacts import (
    parse_csv, upsert_contacts, get_all_contacts, update_contact,
    get_stats, get_daily_sent_count, increment_sent_count, load_data, save_data
)
from email_gen import generate_email, generate_batch
from gmail import get_gmail_service, rate_limited_send, scan_replies

app = FastAPI(title="Recruiting Bot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Contacts ---

@app.get("/contacts")
def list_contacts():
    return get_all_contacts()


class NewContact(BaseModel):
    name: str
    email: str
    title: str
    firm: str
    linkedin_url: Optional[str] = ""
    school: Optional[str] = ""
    location: Optional[str] = ""
    notes: Optional[str] = ""
    tier: Optional[str] = "analyst_associate"

@app.post("/contacts")
def create_contact(contact: NewContact):
    import uuid
    from datetime import datetime
    from contacts import load_data, save_data
    data = load_data()
    existing_emails = {c["email"] for c in data["contacts"]}
    if contact.email in existing_emails:
        raise HTTPException(status_code=409, detail="Contact with this email already exists")
    new = {
        "id": str(uuid.uuid4()),
        "name": contact.name,
        "email": contact.email,
        "title": contact.title,
        "firm": contact.firm,
        "linkedin_url": contact.linkedin_url or "",
        "school": contact.school or "",
        "location": contact.location or "",
        "notes": contact.notes or "",
        "tier": contact.tier or "analyst_associate",
        "status": "Cold",
        "sent_at": None,
        "replied_at": None,
        "follow_up_due": None,
        "gmail_thread_id": None,
        "generated_email": None,
        "generated_subject": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    data["contacts"].append(new)
    save_data(data)
    return new

@app.post("/contacts/upload")
async def upload_csv(file: UploadFile = File(...)):
    content = await file.read()
    contacts = parse_csv(content)
    result = upsert_contacts(contacts)
    return result


class ContactUpdate(BaseModel):
    status: Optional[str] = None
    tier: Optional[str] = None
    notes: Optional[str] = None
    follow_up_due: Optional[str] = None


@app.patch("/contacts/{contact_id}")
def patch_contact(contact_id: str, updates: ContactUpdate):
    result = update_contact(contact_id, updates.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Contact not found")
    return result


@app.delete("/contacts/{contact_id}")
def delete_contact(contact_id: str):
    data = load_data()
    before = len(data["contacts"])
    data["contacts"] = [c for c in data["contacts"] if c["id"] != contact_id]
    if len(data["contacts"]) == before:
        raise HTTPException(status_code=404, detail="Contact not found")
    save_data(data)
    return {"deleted": True}


# --- Email Generation ---

@app.post("/generate/{contact_id}")
def generate_for_contact(contact_id: str):
    data = load_data()
    contact = next((c for c in data["contacts"] if c["id"] == contact_id), None)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    result = generate_email(contact, data["templates"], data["settings"])
    update_contact(contact_id, {
        "generated_email": result["body"],
        "generated_subject": result["subject"],
    })
    return result


@app.post("/generate/batch")
def generate_batch_endpoint():
    data = load_data()
    cold_contacts = [c for c in data["contacts"] if c["status"] == "Cold" and not c.get("generated_email")]
    results = generate_batch(cold_contacts, data["templates"], data["settings"])
    for r in results:
        if r["success"]:
            update_contact(r["id"], {
                "generated_email": r["body"],
                "generated_subject": r["subject"],
            })
    return {"generated": len([r for r in results if r["success"]]), "failed": len([r for r in results if not r["success"]])}


# --- Sending ---

class SendRequest(BaseModel):
    contact_ids: list[str]
    scheduled_time: Optional[str] = None


@app.post("/send")
def send_emails(req: SendRequest):
    data = load_data()
    settings = data["settings"]
    today_sent = get_daily_sent_count()
    daily_cap = settings["daily_cap"]

    if today_sent >= daily_cap:
        raise HTTPException(status_code=429, detail=f"Daily cap of {daily_cap} reached")

    contacts_map = {c["id"]: c for c in data["contacts"]}
    emails_to_send = []

    for cid in req.contact_ids:
        c = contacts_map.get(cid)
        if not c or not c.get("generated_email"):
            continue
        if c["tier"] == "md_partner":
            continue  # MD/Partner never auto-sent
        emails_to_send.append({
            "id": cid,
            "to": c["email"],
            "subject": c["generated_subject"],
            "body": c["generated_email"],
            "firm": c["firm"],
            "sender_name": settings["sender_name"],
            "resume_path": settings.get("resume_attachment_path"),
            "scheduled_time": datetime.fromisoformat(req.scheduled_time) if req.scheduled_time else None,
        })

    service = get_gmail_service()
    results = rate_limited_send(
        service, emails_to_send,
        per_minute=settings["emails_per_minute"],
        daily_cap=daily_cap,
        today_sent=today_sent,
    )

    for r in results:
        if r["success"]:
            from datetime import date, timedelta
            update_contact(r["id"], {
                "status": "Contacted",
                "sent_at": datetime.utcnow().isoformat(),
                "gmail_thread_id": r.get("thread_id"),
                "follow_up_due": (date.today() + timedelta(days=7)).isoformat(),
            })
            increment_sent_count()

    return results


# --- Reply Scanning ---

@app.post("/scan-replies")
def scan_for_replies():
    contacts = get_all_contacts()
    service = get_gmail_service()
    updated = scan_replies(service, contacts)
    for u in updated:
        update_contact(u["id"], {"status": u["status"], "replied_at": u["replied_at"]})
    return {"updated": len(updated)}


# --- Stats & Settings ---

@app.get("/stats")
def get_dashboard_stats():
    return get_stats()


class SettingsUpdate(BaseModel):
    daily_cap: Optional[int] = None
    emails_per_minute: Optional[int] = None
    sender_name: Optional[str] = None
    sender_school: Optional[str] = None
    resume_attachment_path: Optional[str] = None
    availability: Optional[str] = None


@app.patch("/settings")
def update_settings(updates: SettingsUpdate):
    data = load_data()
    data["settings"].update(updates.model_dump(exclude_none=True))
    save_data(data)
    return data["settings"]


@app.get("/settings")
def get_settings():
    return load_data()["settings"]


class TemplateUpdate(BaseModel):
    prompt: Optional[str] = None
    subject: Optional[str] = None
    tone: Optional[str] = None
    max_words: Optional[int] = None


@app.patch("/templates/{tier}")
def update_template(tier: str, updates: TemplateUpdate):
    data = load_data()
    if tier not in data["templates"]:
        raise HTTPException(status_code=404, detail="Template tier not found")
    data["templates"][tier].update(updates.model_dump(exclude_none=True))
    save_data(data)
    return data["templates"][tier]


@app.get("/templates")
def get_templates():
    return load_data()["templates"]
