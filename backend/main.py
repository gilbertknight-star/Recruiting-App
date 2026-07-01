import os
from datetime import datetime, date, timedelta
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from auth import get_current_user, require_admin
from db import supabase, ensure_user_defaults, DEV_MODE
from contacts import (
    get_all_contacts, create_contact, update_contact, delete_contact,
    bulk_upsert_contacts, parse_csv, get_settings, update_settings,
    get_templates, update_template, get_stats, increment_sent,
)
from email_gen import generate_email, generate_batch, compose_free
from timezone_lookup import location_to_timezone, local_to_utc
from gmail import (
    get_auth_url, exchange_code, get_gmail_service,
    is_gmail_connected, rate_limited_send, scan_replies, send_email,
)
import scheduler

app = FastAPI(title="Recruiting Bot API")

@app.on_event("startup")
def _start_scheduler():
    scheduler.configure(service_factory=get_gmail_service, send_fn=send_email)
    scheduler.start()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Dev Mode ---

@app.get("/dev-mode")
def dev_mode_status():
    return {"dev": DEV_MODE}


# --- Auth ---

@app.get("/me")
def get_me(user=Depends(get_current_user)):
    ensure_user_defaults(user.id)
    return {"id": user.id, "email": user.email}


@app.post("/invite")
def invite_user(email: str, user=Depends(require_admin)):
    try:
        supabase.auth.admin.invite_user_by_email(email)
        return {"invited": email}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Contacts ---

@app.get("/contacts")
def list_contacts(user=Depends(get_current_user)):
    return get_all_contacts(user.id)


class NewContact(BaseModel):
    name: str
    email: str
    title: str
    firm: str
    linkedin_url: Optional[str] = ""
    school: Optional[str] = ""
    location: Optional[str] = ""
    notes: Optional[str] = ""
    tier: Optional[str] = None


@app.post("/contacts")
def add_contact(contact: NewContact, user=Depends(get_current_user)):
    return create_contact(user.id, contact.model_dump())


@app.post("/contacts/upload")
async def upload_csv(file: UploadFile = File(...), user=Depends(get_current_user)):
    content = await file.read()
    contacts = parse_csv(content, user.id)
    return bulk_upsert_contacts(user.id, contacts)


class ContactUpdate(BaseModel):
    status: Optional[str] = None
    tier: Optional[str] = None
    alumni: Optional[str] = None
    level: Optional[str] = None
    notes: Optional[str] = None
    follow_up_due: Optional[str] = None
    meeting_at: Optional[str] = None
    meeting_end: Optional[str] = None
    generated_email: Optional[str] = None
    generated_subject: Optional[str] = None


@app.patch("/contacts/{contact_id}")
def patch_contact(contact_id: str, updates: ContactUpdate, user=Depends(get_current_user)):
    result = update_contact(user.id, contact_id, updates.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Contact not found")
    return result


@app.delete("/contacts/{contact_id}")
def remove_contact(contact_id: str, user=Depends(get_current_user)):
    delete_contact(user.id, contact_id)
    return {"deleted": True}


# --- Email Generation ---

@app.post("/generate/{contact_id}")
def generate_for_contact(contact_id: str, user=Depends(get_current_user)):
    contacts = get_all_contacts(user.id)
    contact = next((c for c in contacts if c["id"] == contact_id), None)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    templates = get_templates(user.id)
    settings = get_settings(user.id)
    result = generate_email(contact, templates, settings)
    update_contact(user.id, contact_id, {"generated_email": result["body"], "generated_subject": result["subject"]})
    return result


class ComposeRequest(BaseModel):
    prompt: str
    context: str = ""

@app.post("/compose")
def compose_endpoint(req: ComposeRequest, user=Depends(get_current_user)):
    return compose_free(req.prompt, req.context)


@app.post("/generate/batch")
def generate_batch_endpoint(user=Depends(get_current_user)):
    contacts = [c for c in get_all_contacts(user.id) if not c.get("generated_email")]
    templates = get_templates(user.id)
    settings = get_settings(user.id)
    results = generate_batch(contacts, templates, settings)
    for r in results:
        if r["success"]:
            update_contact(user.id, r["id"], {"generated_email": r["body"], "generated_subject": r["subject"]})
    return {"generated": sum(1 for r in results if r["success"]), "failed": sum(1 for r in results if not r["success"])}


class CustomBatchRequest(BaseModel):
    prompt: str
    contact_ids: list[str]

@app.post("/generate/batch/custom")
def generate_batch_custom_endpoint(req: CustomBatchRequest, user=Depends(get_current_user)):
    all_contacts = {c["id"]: c for c in get_all_contacts(user.id)}
    contacts = [all_contacts[cid] for cid in req.contact_ids if cid in all_contacts and not all_contacts[cid].get("generated_email")]
    settings = get_settings(user.id)
    results = []
    for contact in contacts:
        try:
            first_name = contact["name"].strip().split()[0]
            personalized_prompt = req.prompt \
                .replace("{name}", first_name) \
                .replace("{firm}", contact.get("firm", "")) \
                .replace("{title}", contact.get("title", ""))

            context_parts = []
            if contact.get("title"):
                context_parts.append(f"Title: {contact['title']}")
            if contact.get("location"):
                context_parts.append(f"Location: {contact['location']}")
            if contact.get("school"):
                context_parts.append(f"School connection: {contact['school']}")
            if contact.get("notes"):
                context_parts.append(f"Notes: {contact['notes']}")
            avail = settings.get("availability", "").strip()
            if avail:
                context_parts.append(f"My availability: {avail}")
            context = "\n".join(context_parts)

            result = compose_free(personalized_prompt, context)
            from email_gen import append_signature
            body = append_signature(result["body"], settings)
            update_contact(user.id, contact["id"], {"generated_email": body})
            results.append({"id": contact["id"], "success": True})
        except Exception as e:
            results.append({"id": contact["id"], "success": False, "error": str(e)})
    return {"generated": sum(1 for r in results if r["success"]), "failed": sum(1 for r in results if not r["success"])}


# --- Sending ---

class SendRequest(BaseModel):
    contact_ids: list[str]
    scheduled_time: Optional[str] = None       # legacy: single UTC ISO string
    schedule_date: Optional[str] = None         # e.g. "2026-06-21"
    schedule_time: Optional[str] = None         # e.g. "09:00"  — per-contact local time


@app.post("/send")
def send_emails(req: SendRequest, user=Depends(get_current_user)):
    settings = get_settings(user.id)
    stats = get_stats(user.id)
    daily_cap = settings.get("daily_cap", 50)

    if stats["today_sent"] >= daily_cap:
        raise HTTPException(status_code=429, detail=f"Daily cap of {daily_cap} reached")

    all_contacts = {c["id"]: c for c in get_all_contacts(user.id)}
    now = datetime.utcnow()
    results = []

    print(f"[send] attachments in settings: {settings.get('attachments')}")
    # --- Scheduled send: enqueue and return immediately ---
    if req.schedule_date and req.schedule_time:
        for cid in req.contact_ids:
            c = all_contacts.get(cid)
            if not c or not c.get("generated_email") or c.get("tier") == "md_partner":
                continue
            tz_id = location_to_timezone(c.get("location", ""))
            send_at = local_to_utc(req.schedule_date, req.schedule_time, tz_id)
            if send_at <= now:
                raise HTTPException(
                    status_code=400,
                    detail=f"Scheduled time {req.schedule_time} on {req.schedule_date} is already in the past ({tz_id}). Pick a future time or date."
                )
            scheduler.enqueue({
                "id": cid,
                "user_id": user.id,
                "to": c["email"],
                "subject": c.get("generated_subject", ""),
                "body": c["generated_email"],
                "firm": c.get("firm", ""),
                "attachment_paths": [p for p in settings.get("attachments", []) if p],
            }, send_at)
            update_contact(user.id, cid, {
                "status": "Contacted",
                "sent_at": send_at.isoformat(),
                "follow_up_due": (date.today() + timedelta(days=7)).isoformat(),
            })
            increment_sent(user.id)
            results.append({"id": cid, "success": True, "scheduled": True, "send_at": send_at.isoformat()})
        return results

    # --- Immediate send ---
    emails_to_send = []
    for cid in req.contact_ids:
        c = all_contacts.get(cid)
        if not c or not c.get("generated_email") or c.get("tier") == "md_partner":
            continue
        scheduled_time = None
        if req.scheduled_time:
            scheduled_time = datetime.fromisoformat(req.scheduled_time)
        emails_to_send.append({
            "id": cid,
            "to": c["email"],
            "subject": c.get("generated_subject", ""),
            "body": c["generated_email"],
            "firm": c.get("firm", ""),
            "attachment_paths": [p for p in settings.get("attachments", []) if p],
            "scheduled_time": scheduled_time,
            "location": c.get("location", ""),
        })

    service = get_gmail_service(user.id)
    results = rate_limited_send(
        service, emails_to_send,
        per_minute=settings.get("emails_per_minute", 10),
        daily_cap=daily_cap,
        today_sent=stats["today_sent"],
    )

    for r in results:
        if r["success"]:
            update_contact(user.id, r["id"], {
                "status": "Contacted",
                "sent_at": datetime.utcnow().isoformat(),
                "gmail_thread_id": r.get("thread_id"),
                "follow_up_due": (date.today() + timedelta(days=7)).isoformat(),
            })
            increment_sent(user.id)

    return results


# --- Test send ---

class TestSendRequest(BaseModel):
    subject: str
    body: str
    to: Optional[str] = None   # defaults to the logged-in user's email

@app.post("/send-test")
def send_test_email(req: TestSendRequest, user=Depends(get_current_user)):
    settings = get_settings(user.id)
    recipient = req.to or user.email
    service = get_gmail_service(user.id)
    send_email(
        service=service,
        to=recipient,
        subject=f"[TEST] {req.subject}",
        body=req.body,
        firm="",
        attachment_paths=[p for p in settings.get("attachments", []) if p],
    )
    return {"sent_to": recipient}


# --- Reply Scanning ---

@app.post("/scan-replies")
def scan_for_replies(user=Depends(get_current_user)):
    contacts = get_all_contacts(user.id)
    service = get_gmail_service(user.id)
    updated = scan_replies(service, contacts)
    for u in updated:
        update_contact(user.id, u["id"], {"status": u["status"], "replied_at": u["replied_at"]})
    return {"updated": len(updated)}


# --- Gmail OAuth ---

@app.get("/gmail/auth-url")
def gmail_auth_url(user=Depends(get_current_user)):
    url = get_auth_url(user.id)
    return {"url": url}


@app.get("/gmail/callback")
def gmail_callback(code: str = Query(...), state: str = Query(...)):
    exchange_code(code, state)
    return RedirectResponse(url=f"{FRONTEND_URL}/settings?gmail=connected")


@app.get("/gmail/status")
def gmail_status(user=Depends(get_current_user)):
    return {"connected": is_gmail_connected(user.id)}


# --- File browser ---

@app.get("/browse-file")
def browse_file(user=Depends(get_current_user)):
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.wm_attributes('-topmost', True)
    path = filedialog.askopenfilename(
        title="Select attachment",
        filetypes=[("PDF files", "*.pdf"), ("Word documents", "*.docx"), ("All files", "*.*")],
    )
    root.destroy()
    if not path:
        return {"path": None}
    return {"path": path.replace("/", "\\")}


# --- Scheduled queue status ---

@app.get("/scheduled")
def get_scheduled(user=Depends(get_current_user)):
    return {"queued": scheduler.get_scheduled(), "count": scheduler.queue_size()}


# --- Stats & Settings ---

@app.get("/stats")
def dashboard_stats(user=Depends(get_current_user)):
    return get_stats(user.id)


class SettingsUpdate(BaseModel):
    daily_cap: Optional[int] = None
    emails_per_minute: Optional[int] = None
    sender_name: Optional[str] = None
    sender_school: Optional[str] = None
    availability: Optional[str] = None
    linkedin_url: Optional[str] = None
    signature: Optional[str] = None
    attachments: Optional[list[str]] = None


@app.get("/settings")
def get_user_settings(user=Depends(get_current_user)):
    return get_settings(user.id)


@app.patch("/settings")
def patch_settings(updates: SettingsUpdate, user=Depends(get_current_user)):
    return update_settings(user.id, updates.model_dump(exclude_none=True))


class TemplateUpdate(BaseModel):
    prompt: Optional[str] = None
    subject: Optional[str] = None
    tone: Optional[str] = None
    max_words: Optional[int] = None


@app.get("/templates")
def get_user_templates(user=Depends(get_current_user)):
    return get_templates(user.id)


@app.patch("/templates/{tier}")
def patch_template(tier: str, updates: TemplateUpdate, user=Depends(get_current_user)):
    result = update_template(user.id, tier, updates.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result
