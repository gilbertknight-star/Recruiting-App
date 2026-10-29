import os
import re
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
import tracker
import deals
from email_gen import generate_email, generate_batch, compose_free, apply_font, _plain_text
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


def _unmark_contacted(email: dict, note: str = ""):
    """A scheduled contact is marked Contacted up front; put it back to Cold when the email never goes out."""
    if email.get("test") or not email.get("id"):
        return
    contact = next((c for c in get_all_contacts(email["user_id"]) if c["id"] == email["id"]), None)
    if contact and contact.get("status") == "Contacted" and not contact.get("gmail_thread_id"):
        update = {"status": "Cold", "sent_at": None, "follow_up_due": None}
        if note:
            update["notes"] = ((contact.get("notes") or "") + f"\n\n{note}").strip()
        update_contact(email["user_id"], email["id"], update)


def _scheduled_failed(email: dict, error: Exception):
    _unmark_contacted(email, f"Scheduled send failed: {error}")

@app.on_event("startup")
def _start_scheduler():
    scheduler.configure(
        service_factory=get_gmail_service, send_fn=send_email, prepare_fn=_prepare_scheduled,
        on_sent_fn=_scheduled_sent, on_failed_fn=_scheduled_failed,
    )
    # Only one machine should send scheduled emails: the always-on server. Set RUN_SCHEDULER=false
    # on any other copy of the backend (e.g. the laptop) so it never sends them too.
    if os.getenv("RUN_SCHEDULER", "true").lower() == "true":
        scheduler.start()
    else:
        print("[scheduler] RUN_SCHEDULER=false: not sending scheduled emails from this machine")

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
    is_practice: Optional[bool] = False


@app.post("/contacts")
def add_contact(contact: NewContact, user=Depends(get_current_user)):
    data = contact.model_dump()
    # Adding yourself makes a practice contact: sends and tracking work, but nothing counts
    if (data.get("email") or "").strip().lower() == (user.email or "").lower():
        data["is_practice"] = True
    return create_contact(user.id, data)


@app.post("/contacts/upload")
async def upload_csv(file: UploadFile = File(...), user=Depends(get_current_user)):
    content = await file.read()
    contacts = parse_csv(content, user.id)
    return bulk_upsert_contacts(user.id, contacts)


class ContactUpdate(BaseModel):
    # Profile fields, so the Edit contact form can change them (e.g. adding an email later)
    name: Optional[str] = None
    email: Optional[str] = None
    title: Optional[str] = None
    firm: Optional[str] = None
    linkedin_url: Optional[str] = None
    school: Optional[str] = None
    location: Optional[str] = None
    followup_email: Optional[str] = None
    followup_subject: Optional[str] = None
    is_practice: Optional[bool] = None
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
    """Test mode: deliver to the user instead of the contact. Subject and body are left exactly as the
    contact would see them (the greeting shows who each one was for)."""
    return {
        **email,
        "to": user_email,
        # BCC stays on so a test also shows the copy arriving in your school inbox
        "test": True,
    }


_FIRM_SUFFIXES = re.compile(
    r"\b(inc|llc|lp|llp|ltd|plc|co|corp|corporation|company|group|holdings|securities|partners|& co)\b\.?", re.IGNORECASE)


def _firm_key(firm: str) -> str:
    """'Jefferies LLC', 'Jefferies & Co.' and 'jefferies' all count as the same firm."""
    key = _FIRM_SUFFIXES.sub("", (firm or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", key).strip()


def _next_weekday(d: date) -> date:
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _firm_day_counts(user_id: str, contacts: list[dict], tz_name: str) -> dict:
    """How many emails each firm already has on each day: sent (from contacts) plus still-scheduled ones."""
    import pytz
    tz = pytz.timezone(tz_name)
    counts: dict = {}

    def add(firm, when):
        if not firm or not when:
            return
        dt = datetime.fromisoformat(str(when).replace("Z", "+00:00"))
        dt = dt if dt.tzinfo else pytz.utc.localize(dt)
        k = (_firm_key(firm), dt.astimezone(tz).date())
        counts[k] = counts.get(k, 0) + 1

    for c in contacts:
        if not c.get("is_practice"):
            add(c.get("firm"), c.get("sent_at"))
    for item in scheduler.get_scheduled(user_id):
        if not item.get("test"):
            add(next((c.get("firm") for c in contacts if c["id"] == item.get("contact_id")), ""), item["send_at"])
    return counts


@app.post("/send")
def send_emails(req: SendRequest, user=Depends(get_current_user)):
    import pytz
    settings = get_settings(user.id)
    stats = get_stats(user.id)
    daily_cap = settings.get("daily_cap", 50)
    # Test mode sends everything to the user and leaves contacts and send counts untouched
    test_mode = bool(settings.get("test_mode"))

    if not test_mode and stats["today_sent"] >= daily_cap:
        raise HTTPException(status_code=429, detail=f"Daily cap of {daily_cap} reached")

    all_contacts = {c["id"]: c for c in get_all_contacts(user.id)}
    now = datetime.utcnow()
    my_tz = settings.get("avail_timezone") or "America/Los_Angeles"
    today = datetime.now(pytz.timezone(my_tz)).date()
    firm_limit = settings.get("firm_daily_limit")
    firm_limit = 3 if firm_limit is None else firm_limit  # 0 turns the safeguard off
    if test_mode:
        firm_limit = 0  # every test copy goes to you, so there's no firm to protect; deliver them all now

    chosen = [all_contacts[cid] for cid in req.contact_ids
              if cid in all_contacts and all_contacts[cid].get("generated_email") and all_contacts[cid].get("email")
              and all_contacts[cid].get("tier") != "md_partner"]

    # --- Plan: which day each email goes out, so no firm gets more than firm_limit a day ---
    first_day = date.fromisoformat(req.schedule_date) if (req.schedule_date and req.schedule_time) else today
    counts = _firm_day_counts(user.id, list(all_contacts.values()), my_tz) if firm_limit else {}
    plan = []  # (contact, day, position among this batch's emails to that firm that day)
    batch: dict = {}
    for c in chosen:
        day = first_day
        key = _firm_key(c.get("firm"))
        if firm_limit and not c.get("is_practice"):
            while counts.get((key, day), 0) >= firm_limit:
                day = _next_weekday(day)
            counts[(key, day)] = counts.get((key, day), 0) + 1
        # Only emails from this batch are spaced out; a single email keeps the exact time you picked,
        # even if that firm already got email earlier in the day
        batch[(key, day)] = batch.get((key, day), 0) + 1
        plan.append((c, day, batch[(key, day)]))

    def build(c, body):
        email = {
            "id": c["id"],
            "user_id": user.id,
            "to": c["email"],
            "subject": c.get("generated_subject", ""),
            "body": body,
            "firm": c.get("firm", ""),
            "location": c.get("location", ""),
            "attachment_paths": [p for p in settings.get("attachments", []) if p],
            "bcc": (settings.get("bcc_email") or "").strip() or None,
        }
        return _redirect_for_test(email, user.email) if test_mode else email

    results = []
    send_now = []
    for c, day, position in plan:
        moved = day != first_day
        if not moved and first_day == today and not (req.schedule_date and req.schedule_time):
            send_now.append(c)
            continue
        # Scheduled: the chosen time, or 9:00am for emails pushed to a later day; same-firm emails
        # on one day go out 20 minutes apart instead of all at once
        tz_id = location_to_timezone(c.get("location", ""))
        base_time = req.schedule_time if (req.schedule_time and not moved) else "09:00"
        send_at = local_to_utc(day.isoformat(), base_time, tz_id) + timedelta(minutes=20 * (position - 1))
        if send_at <= now and not moved:
            raise HTTPException(
                status_code=400,
                detail=f"Scheduled time {req.schedule_time} on {req.schedule_date} is already in the past ({tz_id}). Pick a future time or date."
            )
        # Availability is filled in by the scheduler at send time
        scheduler.enqueue(build(c, c["generated_email"]), send_at)
        if not test_mode:
            update_contact(user.id, c["id"], {
                "status": "Contacted",
                "sent_at": send_at.isoformat(),
                "follow_up_due": (send_at.date() + timedelta(days=7)).isoformat(),
            })
            if not c.get("is_practice"):
                increment_sent(user.id)
        results.append({"id": c["id"], "success": True, "scheduled": True, "spread": moved,
                        "send_at": send_at.isoformat(), "firm": c.get("firm", ""), "test": test_mode})

    if not send_now:
        return results

    # --- Immediate send ---
    emails_to_send = [
        {**build(c, apply_font(gcal.fill_availability(c["generated_email"], user.id, settings,
                                                      location_to_timezone(c.get("location", ""))), settings)),
         "scheduled_time": datetime.fromisoformat(req.scheduled_time) if req.scheduled_time else None}
        for c in send_now
    ]
    service = get_gmail_service(user.id)
    sent = rate_limited_send(
        service, emails_to_send,
        per_minute=settings.get("emails_per_minute", 10),
        daily_cap=daily_cap,
        today_sent=0 if test_mode else stats["today_sent"],
    )

    if test_mode:
        return results + [{**r, "test": True} for r in sent]

    for r in sent:
        if r["success"]:
            update_contact(user.id, r["id"], {
                "status": "Contacted",
                "sent_at": datetime.utcnow().isoformat(),
                "gmail_thread_id": r.get("thread_id"),
                "follow_up_due": (date.today() + timedelta(days=7)).isoformat(),
            })
            if not all_contacts.get(r["id"], {}).get("is_practice"):
                increment_sent(user.id)

    return results + sent


# --- Follow-ups ---

class FollowupRequest(BaseModel):
    contact_ids: list[str]


@app.post("/followups/generate")
def generate_followups(req: FollowupRequest, user=Depends(get_current_user)):
    """Draft the next follow-up for each contact: 'no reply' or 'reconnect' depending on their status."""
    from email_gen import generate_followup
    templates = get_templates(user.id)
    settings = get_settings(user.id)
    contacts = {c["id"]: c for c in get_all_contacts(user.id)}
    results = []
    for cid in req.contact_ids:
        c = contacts.get(cid)
        if not c:
            continue
        try:
            draft = generate_followup(c, templates, settings)
            update_contact(user.id, cid, {"followup_email": draft["body"], "followup_subject": draft["subject"]})
            results.append({"id": cid, "success": True, "kind": draft["kind"]})
        except Exception as e:
            results.append({"id": cid, "success": False, "error": str(e)})
    return results


@app.post("/followups/send")
def send_followups(req: FollowupRequest, user=Depends(get_current_user)):
    """Send drafted follow-ups as replies in each contact's Gmail thread (a new email if there isn't one),
    then schedule the next one a week out. Test Mode sends them to you instead and changes nothing."""
    import time
    from gmail import thread_reply_info
    settings = get_settings(user.id)
    test_mode = bool(settings.get("test_mode"))
    contacts = {c["id"]: c for c in get_all_contacts(user.id)}
    service = get_gmail_service(user.id)
    interval = 60.0 / max(1, settings.get("emails_per_minute") or 10)
    results = []
    for cid in req.contact_ids:
        c = contacts.get(cid)
        if not c or not c.get("followup_email") or not c.get("email"):
            results.append({"id": cid, "success": False, "error": "No follow-up drafted or no email address"})
            continue
        email = {
            "id": cid, "user_id": user.id, "to": c["email"],
            "subject": c.get("followup_subject") or "Following up",
            "body": apply_font(gcal.fill_availability(c["followup_email"], user.id, settings, location_to_timezone(c.get("location", ""))), settings),
            "bcc": (settings.get("bcc_email") or "").strip() or None,
        }
        reply_to = None
        if test_mode:
            email = _redirect_for_test(email, user.email)
        elif c.get("gmail_thread_id"):
            reply_to = thread_reply_info(service, c["gmail_thread_id"])
        try:
            sent = send_email(
                service=service, to=email["to"], subject=email["subject"], body=email["body"],
                firm=c.get("firm", ""), bcc=email.get("bcc"), reply_to=reply_to,
            )
            if not test_mode:
                update_contact(user.id, cid, {
                    "followup_email": None, "followup_subject": None,
                    # Last few follow-ups as plain text, so the next draft words itself differently
                    "followup_history": ((c.get("followup_history") or []) + [_plain_text(c["followup_email"]).split("\n--")[0][:800]])[-5:],
                    "followup_count": (c.get("followup_count") or 0) + 1,
                    "last_followup_at": datetime.utcnow().isoformat(),
                    "follow_up_due": (date.today() + timedelta(days=7)).isoformat(),
                    "gmail_thread_id": c.get("gmail_thread_id") or sent.get("thread_id"),
                })
                if not c.get("is_practice"):
                    increment_sent(user.id)
            results.append({"id": cid, "success": True, "threaded": bool(reply_to), "test": test_mode})
        except Exception as e:
            results.append({"id": cid, "success": False, "error": str(e)})
        time.sleep(interval)
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
        bcc=(settings.get("bcc_email") or "").strip() or None,
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

@app.post("/attachments")
async def upload_attachment(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Upload a file (e.g. your resume) to storage and attach it to every email."""
    import attachments
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Attachments must be under 10 MB")
    ref = attachments.upload(user.id, file.filename or "attachment", data)
    current = [a for a in (get_settings(user.id).get("attachments") or []) if a]
    update_settings(user.id, {"attachments": current + [ref]})
    return {"ref": ref, "name": attachments.display_name(ref), "attachments": current + [ref]}


@app.delete("/attachments")
def remove_attachment(ref: str, user=Depends(get_current_user)):
    import attachments
    current = [a for a in (get_settings(user.id).get("attachments") or []) if a and a != ref]
    update_settings(user.id, {"attachments": current})
    try:
        attachments.delete(ref)
    except Exception as e:
        print(f"[attachments] couldn't delete {ref}: {e}")
    return {"attachments": current}


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
    firm: str = ""
    name: str = ""
    titles: Optional[list[str]] = None
    seniorities: Optional[list[str]] = None
    locations: Optional[list[str]] = None
    page: int = 1
    per_page: int = 25


class ApolloRevealRequest(BaseModel):
    apollo_ids: list[str]
    deal_id: Optional[str] = None   # set when finding people for a client-side deal


@app.post("/apollo/search")
def apollo_search(req: ApolloSearchRequest, user=Depends(get_current_user)):
    if not req.firm.strip() and not req.name.strip():
        raise HTTPException(status_code=400, detail="Enter a name or a firm")
    try:
        return apollo.search_people(req.firm.strip(), req.titles, req.seniorities, req.locations, req.page, req.per_page, req.name.strip())
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

    return {**_import_apollo_people(user.id, revealed, _deal_fields(user.id, req.deal_id)), "people": revealed}


def _deal_fields(user_id: str, deal_id: Optional[str]) -> dict:
    """Contact fields that mark someone as a client-side lead from a specific deal."""
    if not deal_id:
        return {}
    deal = next((d for d in deals.list_deals(user_id) if d["id"] == deal_id), None)
    if not deal:
        return {}
    summary = deal.get("summary") or f"{deal['bank']} advised {deal['company']}"
    return {"contact_type": "client", "deal_id": deal_id, "deal_bank": deal["bank"], "deal_summary": summary}


def _import_apollo_people(user_id: str, people: list[dict], extra: dict = None) -> dict:
    """Add Apollo people with an email to Contacts, skipping emails already there.
    extra: fields to set on every new contact (e.g. client-side deal info)."""
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
        **(extra or {}),
    } for p in people if p.get("email")]
    result = bulk_upsert_contacts(user_id, new_contacts)
    return {**result, "no_email": [p["name"] for p in people if not p.get("email")]}


class ApolloSavedSearchRequest(BaseModel):
    keywords: str = ""   # a person's name (Apollo also matches title/company words)
    firm: str = ""
    list_id: str = ""
    titles: Optional[list[str]] = None
    seniorities: Optional[list[str]] = None
    page: int = 1
    per_page: int = 25


class ApolloSavedImportRequest(BaseModel):
    people: Optional[list[dict]] = None
    all: bool = False
    keywords: str = ""
    firm: str = ""
    list_id: str = ""
    titles: Optional[list[str]] = None
    seniorities: Optional[list[str]] = None


class LinkedInLookupRequest(BaseModel):
    url: str
    use_credit: bool = False   # only after the user confirms spending 1 Apollo credit


@app.post("/apollo/linkedin")
def apollo_linkedin(req: LinkedInLookupRequest, user=Depends(get_current_user)):
    """Add someone from their LinkedIn URL: check Contacts, then saved Apollo contacts (both free),
    then, only if asked and allowed, a paid Apollo lookup."""
    target = apollo.normalize_linkedin(req.url)
    if not target:
        raise HTTPException(status_code=400, detail="That doesn't look like a LinkedIn profile link (linkedin.com/in/...)")
    guess = {"name": apollo.name_from_linkedin(req.url), "linkedin_url": f"https://www.{target}/"}

    existing = next((c for c in get_all_contacts(user.id) if apollo.normalize_linkedin(c.get("linkedin_url", "")) == target), None)
    if existing:
        return {"source": "contacts", "contact": existing}

    try:
        saved = apollo.find_saved_by_linkedin(req.url)
        if saved:
            return {"source": "saved", "person": saved, **_import_apollo_people(user.id, [saved])}
        if not req.use_credit:
            return {"source": "not_found", "guess": guess, "credits_enabled": apollo.APOLLO_ALLOW_CREDITS}
        person = apollo.reveal_by_linkedin(req.url)
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not person:
        return {"source": "not_found", "guess": guess, "credits_enabled": apollo.APOLLO_ALLOW_CREDITS, "credit_tried": True}
    return {"source": "apollo", "person": person, **_import_apollo_people(user.id, [person])}


@app.get("/apollo/lists")
def apollo_lists(user=Depends(get_current_user)):
    try:
        return apollo.list_saved_lists()
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/apollo/saved")
def apollo_saved(req: ApolloSavedSearchRequest, user=Depends(get_current_user)):
    try:
        return apollo.search_saved(req.keywords, req.list_id, req.page, req.per_page, req.titles, req.seniorities, req.firm.strip())
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/apollo/saved/import")
def apollo_saved_import(req: ApolloSavedImportRequest, user=Depends(get_current_user)):
    try:
        people = (apollo.all_saved(req.keywords, req.list_id, req.titles, req.seniorities, req.firm.strip())
                  if req.all else (req.people or []))
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not people:
        raise HTTPException(status_code=400, detail="No people selected")
    return _import_apollo_people(user.id, people)


# --- Client side: deals ---

class DealSearchRequest(BaseModel):
    bank: str
    days: int = 90
    focus: str = ""        # "", "mna", "equity" or "debt"
    more: bool = False     # skip companies already found for this bank


class DealUpdate(BaseModel):
    status: Optional[str] = None


@app.post("/deals/search")
def search_deals(req: DealSearchRequest, user=Depends(get_current_user)):
    """Research the bank's recent deals with Claude + web search (about $1), save new ones."""
    bank = req.bank.strip()
    if not bank:
        raise HTTPException(status_code=400, detail="Enter a bank")
    try:
        skip = [d["company"] for d in deals.list_deals(user.id, bank)] if req.more else None
        found = deals.research_deals(bank, max(7, min(req.days, 365)), req.focus, skip)
    except deals.DealSearchError as e:
        raise HTTPException(status_code=502, detail=str(e))
    added = deals.save_deals(user.id, bank, found)
    return {"found": len(found), "added": len(added), "deals": deals.list_deals(user.id, bank)}


class DealIn(BaseModel):
    bank: str
    company: str
    counterparty: str = ""
    deal_type: str = ""
    bank_role: str = ""
    announced_date: Optional[str] = None
    summary: str = ""
    source_url: str = ""


@app.post("/deals")
def add_deal(body: DealIn, user=Depends(get_current_user)):
    """Add a deal by hand (or after filling it from a link)."""
    if not body.bank.strip() or not body.company.strip():
        raise HTTPException(status_code=400, detail="Enter the bank and the company")
    deal = {**body.model_dump(), "bank": body.bank.strip(), "company": body.company.strip(),
            "announced_date": body.announced_date or None}
    added = deals.save_deals(user.id, deal.pop("bank"), [deal])
    if not added:
        raise HTTPException(status_code=409, detail="That deal is already on your list")
    return added[0]


class DealLinkRequest(BaseModel):
    url: str


@app.post("/deals/extract")
def extract_deal(req: DealLinkRequest, user=Depends(get_current_user)):
    """Read a press release or article and pre-fill the Add deal form (about $0.05)."""
    if not req.url.strip().startswith("http"):
        raise HTTPException(status_code=400, detail="Paste a full link starting with http")
    try:
        return deals.extract_from_link(req.url.strip())
    except deals.DealSearchError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/deals")
def get_deals(bank: str = "", user=Depends(get_current_user)):
    return deals.list_deals(user.id, bank)


@app.get("/deals/client-titles")
def deal_client_titles(user=Depends(get_current_user)):
    return deals.CLIENT_TITLES


@app.patch("/deals/{deal_id}")
def patch_deal(deal_id: str, updates: DealUpdate, user=Depends(get_current_user)):
    result = deals.update_deal(user.id, deal_id, updates.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Deal not found")
    return result


class DealBriefRequest(BaseModel):
    refresh: bool = False


@app.post("/deals/{deal_id}/brief")
def deal_brief(deal_id: str, req: DealBriefRequest, user=Depends(get_current_user)):
    """AI briefing on a deal with its sources. Saved after the first run (about $0.50), so reopening is free."""
    deal = next((d for d in deals.list_deals(user.id) if d["id"] == deal_id), None)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if deal.get("brief") and not req.refresh:
        return deal
    try:
        brief, sources = deals.research_brief(deal)
    except deals.DealSearchError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return deals.update_deal(user.id, deal_id, {
        "brief": brief, "brief_sources": sources, "brief_at": datetime.utcnow().isoformat(),
    })


class DealPerson(BaseModel):
    apollo_id: str
    first_name: str = ""
    last_name: str = ""
    title: str = ""
    firm: str = ""


class DealContactsRequest(BaseModel):
    people: list[DealPerson]


@app.post("/deals/{deal_id}/contacts")
def add_deal_contacts(deal_id: str, req: DealContactsRequest, user=Depends(get_current_user)):
    """Save people found for a deal as client contacts, without spending credits. Their email and full
    last name come later from 'Get contact info' (or by editing the contact)."""
    extra = _deal_fields(user.id, deal_id)
    if not extra:
        raise HTTPException(status_code=404, detail="Deal not found")
    return _save_found_people(user.id, req.people, extra, "Found through Apollo for a client-side deal. Use Get contact info for their email.")


@app.post("/contacts/from-apollo")
def add_found_contacts(req: DealContactsRequest, user=Depends(get_current_user)):
    """Save people from Find People as banker contacts, without spending credits (same as the client side)."""
    return _save_found_people(user.id, req.people, {}, "Found through Apollo. Use Get contact info for their email.")


def _save_found_people(user_id: str, people: list[DealPerson], extra: dict, note: str) -> dict:
    existing = {c.get("apollo_id") for c in get_all_contacts(user_id) if c.get("apollo_id")}
    added, skipped = [], 0
    for p in people:
        if p.apollo_id in existing:
            skipped += 1
            continue
        existing.add(p.apollo_id)
        added.append(create_contact(user_id, {
            "name": f"{p.first_name} {p.last_name}".strip(),
            "email": "",
            "title": p.title,
            "firm": p.firm,
            "apollo_id": p.apollo_id,
            "notes": note,
            "status": "Cold",
            **extra,
        }))
    return {"added": len(added), "skipped": skipped}


class RevealContactsRequest(BaseModel):
    contact_ids: list[str]


@app.post("/contacts/retier")
def retier_contacts(user=Depends(get_current_user)):
    """Reset every contact's tier from their saved title. Free: no Apollo calls."""
    changed = []
    for c in get_all_contacts(user.id):
        tier = detect_tier(c["title"]) if c.get("title") else None
        if tier and tier != c.get("tier"):
            update_contact(user.id, c["id"], {"tier": tier})
            changed.append({"name": c["name"], "title": c["title"], "from": c.get("tier"), "to": tier})
    return {"changed": changed}


@app.post("/contacts/reveal")
def reveal_contacts(req: RevealContactsRequest, user=Depends(get_current_user)):
    """Fill in full name, email, LinkedIn and current title for saved contacts that came from Apollo
    (1 credit each). A new title also resets the tier to match it."""
    contacts = {c["id"]: c for c in get_all_contacts(user.id) if c["id"] in req.contact_ids and c.get("apollo_id")}
    if not contacts:
        raise HTTPException(status_code=400, detail="None of these contacts came from Apollo")
    try:
        found = {p["apollo_id"]: p for p in apollo.reveal_people([c["apollo_id"] for c in contacts.values()])}
    except apollo.ApolloError as e:
        raise HTTPException(status_code=502, detail=str(e))
    updated = 0
    for c in contacts.values():
        p = found.get(c["apollo_id"])
        if p:
            updates = {k: v for k, v in {
                "name": p["name"], "email": p["email"], "linkedin_url": p["linkedin_url"], "location": p["location"],
                "title": p.get("title"),
            }.items() if v}
            if updates.get("title"):
                updates["tier"] = detect_tier(updates["title"])
            update_contact(user.id, c["id"], updates)
            updated += 1
    return {"updated": updated, "not_found": len(contacts) - updated}


@app.get("/deals/overview")
def deals_overview(user=Depends(get_current_user)):
    """Client dashboard: each bank's deals with how far outreach has gone on each."""
    all_deals = deals.list_deals(user.id)
    clients = [c for c in get_all_contacts(user.id) if c.get("contact_type") == "client" and not c.get("is_practice")]
    by_deal: dict = {}
    for c in clients:
        by_deal.setdefault(c.get("deal_id"), []).append(c)
    banks: dict = {}
    for d in all_deals:
        people = by_deal.get(d["id"], [])
        row = {
            **{k: d.get(k) for k in ("id", "company", "counterparty", "deal_type", "announced_date", "status", "summary")},
            "has_brief": bool(d.get("brief")),
            "contacts": len(people),
            "emailed": sum(1 for p in people if p.get("sent_at")),
            "replied": sum(1 for p in people if p.get("status") in ("Replied", "Warm", "Meeting Scheduled", "Referral")),
        }
        b = banks.setdefault(d["bank"], {"bank": d["bank"], "deals": []})
        b["deals"].append(row)
    out = []
    for b in banks.values():
        ds = b["deals"]
        out.append({**b, **{k: sum(x[k] for x in ds) for k in ("contacts", "emailed", "replied")},
                    "deal_count": len(ds), "pursuing": sum(1 for x in ds if x["status"] == "pursuing")})
    return sorted(out, key=lambda b: b["bank"].lower())


@app.delete("/deals/{deal_id}")
def remove_deal(deal_id: str, user=Depends(get_current_user)):
    deals.delete_deal(user.id, deal_id)
    return {"deleted": True}


# --- API usage & cost ---

@app.get("/usage")
def api_usage(user=Depends(get_current_user)):
    import usage
    settings = get_settings(user.id)
    return usage.summary(user.id, settings.get("apollo_cost_per_credit") or 0)


# --- Application deadlines & to-dos ---

class ApplicationIn(BaseModel):
    firm: str
    program: Optional[str] = ""
    deadline: Optional[str] = None   # "YYYY-MM-DD"
    status: Optional[str] = "Not started"
    link: Optional[str] = ""
    notes: Optional[str] = ""


class ApplicationUpdate(BaseModel):
    firm: Optional[str] = None
    program: Optional[str] = None
    deadline: Optional[str] = None
    status: Optional[str] = None
    link: Optional[str] = None
    notes: Optional[str] = None


class TodoIn(BaseModel):
    text: str
    due: Optional[str] = None        # "YYYY-MM-DD"


class TodoUpdate(BaseModel):
    text: Optional[str] = None
    due: Optional[str] = None
    done: Optional[bool] = None


@app.get("/applications")
def list_applications(user=Depends(get_current_user)):
    return tracker.list_applications(user.id)


@app.post("/applications")
def add_application(body: ApplicationIn, user=Depends(get_current_user)):
    if body.status and body.status not in tracker.APPLICATION_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")
    return tracker.create_application(user.id, body.model_dump())


@app.patch("/applications/{app_id}")
def edit_application(app_id: str, updates: ApplicationUpdate, user=Depends(get_current_user)):
    changes = updates.model_dump(exclude_unset=True)  # explicit null clears a deadline
    if changes.get("status") and changes["status"] not in tracker.APPLICATION_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")
    result = tracker.update_application(user.id, app_id, changes)
    if not result:
        raise HTTPException(status_code=404, detail="Application not found")
    return result


@app.delete("/applications/{app_id}")
def remove_application(app_id: str, user=Depends(get_current_user)):
    tracker.delete_application(user.id, app_id)
    return {"deleted": True}


@app.get("/todos")
def list_todos(user=Depends(get_current_user)):
    return tracker.list_todos(user.id)


@app.post("/todos")
def add_todo(body: TodoIn, user=Depends(get_current_user)):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="To-do can't be empty")
    return tracker.create_todo(user.id, {"text": body.text.strip(), "due": body.due or None})


@app.patch("/todos/{todo_id}")
def edit_todo(todo_id: str, updates: TodoUpdate, user=Depends(get_current_user)):
    result = tracker.update_todo(user.id, todo_id, updates.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="To-do not found")
    return result


@app.delete("/todos/{todo_id}")
def remove_todo(todo_id: str, user=Depends(get_current_user)):
    tracker.delete_todo(user.id, todo_id)
    return {"deleted": True}


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

@app.delete("/scheduled/{scheduled_id}")
def cancel_scheduled(scheduled_id: str, user=Depends(get_current_user)):
    email = scheduler.cancel(user.id, scheduled_id)
    if not email:
        raise HTTPException(status_code=404, detail="That email already sent or was cancelled")
    _unmark_contacted({**email, "user_id": user.id})
    return {"cancelled": True}


@app.post("/scheduled/cancel-all")
def cancel_all_scheduled(user=Depends(get_current_user)):
    cancelled = 0
    for item in scheduler.get_scheduled(user.id):
        email = scheduler.cancel(user.id, item["id"])
        if email:
            _unmark_contacted({**email, "user_id": user.id})
            cancelled += 1
    return {"cancelled": cancelled}


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
    apollo_cost_per_credit: Optional[float] = None
    firm_daily_limit: Optional[int] = None


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
