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
    get_templates, update_template, get_stats, increment_sent, detect_tier,
)
import apollo
import gcal
from email_gen import generate_email, generate_batch, compose_free, apply_font
from timezone_lookup import location_to_timezone, local_to_utc
from gmail import (
    get_auth_url, exchange_code, get_gmail_service,
    is_gmail_connected, rate_limited_send, scan_replies, send_email,
    import_recruiting_folder,
)
import scheduler

app = FastAPI(title="Ducks In a Row API")


def _prepare_scheduled(email: dict) -> dict:
    """Runs just before a scheduled email sends, so its availability reflects the calendar at that moment."""
    user_id = email.get("user_id", "")
    tz_id = location_to_timezone(email.get("location", ""))
    settings = get_settings(user_id)
    return {**email, "body": apply_font(gcal.fill_availability(email["body"], user_id, settings, tz_id), settings)}


def _scheduled_sent(email: dict, result: dict):
    """Store the Gmail thread so reply scanning can find replies to scheduled emails."""
    if email.get("test") or not email.get("id"):
        return
    update_contact(email["user_id"], email["id"], {"gmail_thread_id": (result or {}).get("thread_id")})


def _scheduled_failed(email: dict, error: Exception):
    """The contact was marked Contacted when scheduled; undo that so it doesn't look sent."""
    if email.get("test") or not email.get("id"):
        return
    contact = next((c for c in get_all_contacts(email["user_id"]) if c["id"] == email["id"]), None)
    if contact and contact.get("status") == "Contacted" and not contact.get("gmail_thread_id"):
        update_contact(email["user_id"], email["id"], {
            "status": "Cold", "sent_at": None, "follow_up_due": None,
            "notes": ((contact.get("notes") or "") + f"\n\nScheduled send failed: {error}").strip(),
        })

@app.on_event("startup")
def _start_scheduler():
    scheduler.configure(
        service_factory=get_gmail_service, send_fn=send_email, prepare_fn=_prepare_scheduled,
        on_sent_fn=_scheduled_sent, on_failed_fn=_scheduled_failed,
    )
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
    # exclude_unset (not exclude_none) so an explicit null clears a field, e.g. removing a meeting
    changes = updates.model_dump(exclude_unset=True)
    result = update_contact(user.id, contact_id, changes)
    if not result:
        raise HTTPException(status_code=404, detail="Contact not found")
    if "meeting_at" in changes or "meeting_end" in changes:
        try:
            event_id = gcal.sync_meeting(user.id, result)
            if event_id != result.get("google_event_id"):
                result = update_contact(user.id, contact_id, {"google_event_id": event_id}) or result
        except Exception as e:
            # The meeting is saved either way; the calendar copy just didn't sync
            print(f"[calendar] meeting sync failed: {e}")
            result = {**result, "calendar_error": str(e)}
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
            if avail and not settings.get("live_availability"):
                context_parts.append(f"My availability: {avail}")
            context = "\n".join(context_parts)

            result = compose_free(personalized_prompt, context)
            from email_gen import append_signature, with_availability_placeholder
            body = append_signature(with_availability_placeholder(result["body"], settings), settings)
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


def _redirect_for_test(email: dict, user_email: str) -> dict:
    """Test mode: deliver to the user instead of the contact, marked with who it was meant for."""
    banner = (f'<p style="color:#888;font-size:11px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">'
              f'[TEST MODE → would have gone to {email["to"]}]</p>')
    return {
        **email,
        "to": user_email,
        "subject": f"[TEST → {email['to']}] {email['subject']}",
        "body": banner + email["body"],
        "bcc": None,
        "test": True,
    }


@app.post("/send")
def send_emails(req: SendRequest, user=Depends(get_current_user)):
    settings = get_settings(user.id)
    stats = get_stats(user.id)
    daily_cap = settings.get("daily_cap", 50)
    # Test mode sends everything to the user and leaves contacts and send counts untouched
    test_mode = bool(settings.get("test_mode"))

    if not test_mode and stats["today_sent"] >= daily_cap:
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
            email = {
                "id": cid,
                "user_id": user.id,
                "to": c["email"],
                "subject": c.get("generated_subject", ""),
                "body": c["generated_email"],  # availability is filled in by the scheduler at send time
                "firm": c.get("firm", ""),
                "location": c.get("location", ""),
                "attachment_paths": [p for p in settings.get("attachments", []) if p],
                "bcc": (settings.get("bcc_email") or "").strip() or None,
            }
            scheduler.enqueue(_redirect_for_test(email, user.email) if test_mode else email, send_at)
            if not test_mode:
                update_contact(user.id, cid, {
                    "status": "Contacted",
                    "sent_at": send_at.isoformat(),
                    "follow_up_due": (date.today() + timedelta(days=7)).isoformat(),
                })
                increment_sent(user.id)
            results.append({"id": cid, "success": True, "scheduled": True, "send_at": send_at.isoformat(), "test": test_mode})
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
        email = {
            "id": cid,
            "user_id": user.id,
            "to": c["email"],
            "subject": c.get("generated_subject", ""),
            "body": apply_font(gcal.fill_availability(c["generated_email"], user.id, settings, location_to_timezone(c.get("location", ""))), settings),
            "firm": c.get("firm", ""),
            "attachment_paths": [p for p in settings.get("attachments", []) if p],
            "bcc": (settings.get("bcc_email") or "").strip() or None,
            "scheduled_time": scheduled_time,
            "location": c.get("location", ""),
        }
        emails_to_send.append(_redirect_for_test(email, user.email) if test_mode else email)

    service = get_gmail_service(user.id)
    results = rate_limited_send(
        service, emails_to_send,
        per_minute=settings.get("emails_per_minute", 10),
        daily_cap=daily_cap,
        today_sent=0 if test_mode else stats["today_sent"],
    )

    if test_mode:
        return [{**r, "test": True} for r in results]

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
        body=apply_font(gcal.fill_availability(req.body, user.id, settings, settings.get("avail_timezone") or "America/Los_Angeles"), settings),
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


@app.post("/gmail/import-recruiting")
def import_from_recruiting(user=Depends(get_current_user)):
    service = get_gmail_service(user.id)
    extracted = import_recruiting_folder(service, user.email)
    existing = {c["email"].lower(): c for c in get_all_contacts(user.id)}

    imported, updated, skipped = 0, 0, 0
    for contact in extracted:
        email_key = contact["email"].lower()
        if email_key in existing:
            c = existing[email_key]
            patch = {}
            if not c.get("firm") and contact.get("firm"):
                patch["firm"] = contact["firm"]
            if not c.get("title") and contact.get("title"):
                patch["title"] = contact["title"]
            if contact.get("notes"):
                existing_notes = c.get("notes", "")
                patch["notes"] = (existing_notes + "\n\n" + contact["notes"]).strip() if existing_notes else contact["notes"]
            if not c.get("gmail_thread_id") and contact.get("gmail_thread_id"):
                patch["gmail_thread_id"] = contact["gmail_thread_id"]
                patch["status"] = contact["status"]
            if patch:
                update_contact(user.id, c["id"], patch)
                updated += 1
            else:
                skipped += 1
        else:
            create_contact(user.id, {
                "name": contact["name"],
                "email": contact["email"],
                "firm": contact.get("firm", ""),
                "title": contact.get("title", ""),
                "notes": contact.get("notes", ""),
                "status": contact["status"],
                "gmail_thread_id": contact.get("gmail_thread_id"),
            })
            imported += 1

    return {"imported": imported, "updated": updated, "skipped": skipped, "total_scanned": len(extracted)}


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


# --- Apollo ---

class ApolloSearchRequest(BaseModel):
    firm: str
    titles: Optional[list[str]] = None
    seniorities: Optional[list[str]] = None
    locations: Optional[list[str]] = None
    page: int = 1
    per_page: int = 25


class ApolloRevealRequest(BaseModel):
    apollo_ids: list[str]


@app.post("/apollo/search")
def apollo_search(req: ApolloSearchRequest, user=Depends(get_current_user)):
    try:
        return apollo.search_people(req.firm, req.titles, req.seniorities, req.locations, req.page, req.per_page)
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/apollo/reveal")
def apollo_reveal(req: ApolloRevealRequest, user=Depends(get_current_user)):
    if not req.apollo_ids:
        raise HTTPException(status_code=400, detail="No people selected")
    try:
        revealed = apollo.reveal_people(req.apollo_ids)
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {**_import_apollo_people(user.id, revealed), "people": revealed}


def _import_apollo_people(user_id: str, people: list[dict]) -> dict:
    """Add Apollo people with an email to Contacts, skipping emails already there."""
    new_contacts = [{
        "user_id": user_id,
        "name": p["name"],
        "email": p["email"],
        "title": p.get("title", ""),
        "firm": p.get("firm", ""),
        "linkedin_url": p.get("linkedin_url", ""),
        "location": p.get("location", ""),
        "school": "",
        "notes": f"Source: Apollo (email {p.get('email_status') or 'unknown'})",
        "tier": detect_tier(p.get("title", "")),
        "status": "Cold",
    } for p in people if p.get("email")]
    result = bulk_upsert_contacts(user_id, new_contacts)
    return {**result, "no_email": [p["name"] for p in people if not p.get("email")]}


class ApolloSavedSearchRequest(BaseModel):
    keywords: str = ""
    list_id: str = ""
    titles: Optional[list[str]] = None
    seniorities: Optional[list[str]] = None
    page: int = 1
    per_page: int = 25


class ApolloSavedImportRequest(BaseModel):
    people: Optional[list[dict]] = None
    all: bool = False
    keywords: str = ""
    list_id: str = ""
    titles: Optional[list[str]] = None
    seniorities: Optional[list[str]] = None


@app.get("/apollo/lists")
def apollo_lists(user=Depends(get_current_user)):
    try:
        return apollo.list_saved_lists()
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/apollo/saved")
def apollo_saved(req: ApolloSavedSearchRequest, user=Depends(get_current_user)):
    try:
        return apollo.search_saved(req.keywords, req.list_id, req.page, req.per_page, req.titles, req.seniorities)
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/apollo/saved/import")
def apollo_saved_import(req: ApolloSavedImportRequest, user=Depends(get_current_user)):
    try:
        people = (apollo.all_saved(req.keywords, req.list_id, req.titles, req.seniorities)
                  if req.all else (req.people or []))
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not people:
        raise HTTPException(status_code=400, detail="No people selected")
    return _import_apollo_people(user.id, people)


# --- Google Calendar ---

@app.get("/calendar/events")
def calendar_events(start: str, end: str, user=Depends(get_current_user)):
    """Events from the user's Google Calendar between two ISO dates (UTC)."""
    try:
        return gcal.list_events(user.id, datetime.fromisoformat(start[:19]), datetime.fromisoformat(end[:19]), get_settings(user.id))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Couldn't read Google Calendar: {e}")


@app.get("/calendar/list")
def calendar_list(user=Depends(get_current_user)):
    """The user's Google calendars, with which ones the app reads (Settings.calendar_ids, or Google's checked ones)."""
    settings = get_settings(user.id)
    try:
        calendars = gcal.list_calendars(user.id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Couldn't read your calendar list. Reconnect Gmail in Settings. ({e})")
    chosen = {c["id"] for c in gcal.chosen_calendars(user.id, settings)}
    return [{**c, "used": c["id"] in chosen} for c in calendars]


@app.get("/calendar/availability-preview")
def availability_preview(location: str = "", user=Depends(get_current_user)):
    """The availability text an email to someone in `location` would get right now."""
    settings = get_settings(user.id)
    text = gcal.fill_availability(gcal.AVAILABILITY_TOKEN, user.id, settings, location_to_timezone(location))
    return {"text": text}


# --- Scheduled queue status ---

@app.get("/scheduled")
def get_scheduled(user=Depends(get_current_user)):
    queued = scheduler.get_scheduled(user.id)
    return {"queued": queued, "count": len(queued)}


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
    bcc_email: Optional[str] = None
    test_mode: Optional[bool] = None
    live_availability: Optional[bool] = None
    avail_timezone: Optional[str] = None
    avail_start_hour: Optional[int] = None
    avail_end_hour: Optional[int] = None
    avail_days_ahead: Optional[int] = None
    avail_min_minutes: Optional[int] = None
    avail_max_days: Optional[int] = None
    email_font: Optional[str] = None
    email_font_size: Optional[int] = None
    calendar_ids: Optional[list[str]] = None


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
