import base64
import json
import os
import time
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from db import supabase, DEV_MODE

DEV_USER_ID = "dev-user"

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
]

CREDS_FILE = Path(__file__).parent / "credentials.json"


def get_auth_url(user_id: str) -> str:
    redirect_uri = os.getenv("GMAIL_REDIRECT_URI", "http://localhost:8000/gmail/callback")
    flow = Flow.from_client_secrets_file(str(CREDS_FILE), scopes=SCOPES, redirect_uri=redirect_uri)
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=user_id)
    return auth_url


def exchange_code(code: str, user_id: str):
    redirect_uri = os.getenv("GMAIL_REDIRECT_URI", "http://localhost:8000/gmail/callback")
    flow = Flow.from_client_secrets_file(str(CREDS_FILE), scopes=SCOPES, redirect_uri=redirect_uri)
    flow.fetch_token(code=code)
    creds = flow.credentials
    token_json = creds.to_json()
    existing = supabase.table("gmail_tokens").select("user_id").eq("user_id", user_id).execute()
    if existing.data:
        supabase.table("gmail_tokens").update({"token_json": token_json, "updated_at": datetime.utcnow().isoformat()}).eq("user_id", user_id).execute()
    else:
        supabase.table("gmail_tokens").insert({"user_id": user_id, "token_json": token_json}).execute()


DEV_TOKEN_FILE = Path(__file__).parent / "dev_token.json"

def get_gmail_service(user_id: str):
    if DEV_MODE:
        if not DEV_TOKEN_FILE.exists():
            raise Exception("Dev Gmail token not found. Run setup_dev_gmail.py to authorize.")
        token_data = json.loads(DEV_TOKEN_FILE.read_text())
        creds = Credentials.from_authorized_user_info(token_data, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            DEV_TOKEN_FILE.write_text(creds.to_json())
        return build("gmail", "v1", credentials=creds)

    res = supabase.table("gmail_tokens").select("token_json").eq("user_id", user_id).execute()
    if not res.data:
        raise Exception("Gmail not connected. Please authorize Gmail in Settings.")
    token_data = json.loads(res.data[0]["token_json"])
    creds = Credentials.from_authorized_user_info(token_data, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        supabase.table("gmail_tokens").update({"token_json": creds.to_json(), "updated_at": datetime.utcnow().isoformat()}).eq("user_id", user_id).execute()
    return build("gmail", "v1", credentials=creds)


def is_gmail_connected(user_id: str) -> bool:
    if DEV_MODE:
        return True
    res = supabase.table("gmail_tokens").select("user_id").eq("user_id", user_id).execute()
    return bool(res.data)


def get_or_create_label(service, label_name: str) -> str:
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label["name"] == label_name:
            return label["id"]
    body = {"name": label_name, "labelListVisibility": "labelShow", "messageListVisibility": "show"}
    created = service.users().labels().create(userId="me", body=body).execute()
    return created["id"]


def send_email(service, to: str, subject: str, body: str, firm: str, attachment_paths: list = None, scheduled_time: datetime = None) -> dict:
    recruiting_label_id = get_or_create_label(service, "Recruiting")
    firm_label_id = get_or_create_label(service, f"Recruiting/{firm}" if firm else "Recruiting/Other")

    # Wrap plain text in basic HTML if not already HTML
    if body.strip().startswith('<'):
        html_body = body
    else:
        paragraphs = body.split('\n\n')
        html_body = ''.join(f'<p style="margin:0 0 12px 0">{p.replace(chr(10), "<br>")}</p>' for p in paragraphs)
        html_body = f'<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#000">{html_body}</div>'

    msg = MIMEMultipart('mixed')
    msg["To"] = to
    msg["Subject"] = subject
    alt = MIMEMultipart('alternative')
    alt.attach(MIMEText(html_body, "html"))
    msg.attach(alt)

    for path in (attachment_paths or []):
        p = Path(path)
        print(f"[attach] path={path!r} exists={p.exists()} resolved={p.resolve()}")
        if not p.exists():
            raise FileNotFoundError(f"Attachment not found: {path}")
        with open(p, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{p.name}"')
        msg.attach(part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    send_body = {"raw": raw, "labelIds": [recruiting_label_id, firm_label_id]}

    result = service.users().messages().send(userId="me", body=send_body).execute()
    return {"message_id": result["id"], "thread_id": result.get("threadId")}


def scan_replies(service, contacts: list[dict]) -> list[dict]:
    updated = []
    for contact in contacts:
        if contact["status"] != "Contacted" or not contact.get("gmail_thread_id"):
            continue
        try:
            thread = service.users().threads().get(userId="me", id=contact["gmail_thread_id"]).execute()
            if len(thread.get("messages", [])) > 1:
                updated.append({"id": contact["id"], "status": "Replied", "replied_at": datetime.utcnow().isoformat()})
        except Exception:
            pass
    return updated


def _decode_body(msg_part: dict) -> str:
    data = msg_part.get("body", {}).get("data", "")
    if data:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
    for part in msg_part.get("parts", []):
        text = _decode_body(part)
        if text:
            return text
    return ""


def _header(msg: dict, name: str) -> str:
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def import_recruiting_folder(service, my_email: str) -> list[dict]:
    """
    Scans the Recruiting Gmail label and returns a list of contact dicts with
    extracted name, email, and a conversation summary as notes.
    """
    import anthropic as _anthropic
    import re

    ai = _anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))

    # Find the Recruiting label ID
    labels_resp = service.users().labels().list(userId="me").execute()
    recruiting_id = next(
        (l["id"] for l in labels_resp.get("labels", []) if l["name"].lower() == "recruiting"),
        None,
    )
    if not recruiting_id:
        return []

    # Get all threads in the label (up to 200)
    threads_resp = service.users().threads().list(
        userId="me", labelIds=[recruiting_id], maxResults=200
    ).execute()
    thread_items = threads_resp.get("threads", [])

    results = []
    for item in thread_items:
        try:
            thread = service.users().threads().get(
                userId="me", id=item["id"], format="full"
            ).execute()
            messages = thread.get("messages", [])
            if not messages:
                continue

            # Find the outbound message to determine who we emailed
            contact_email = None
            contact_name = None
            for msg in messages:
                from_addr = _header(msg, "from")
                if my_email.lower() in from_addr.lower():
                    to_addr = _header(msg, "to")
                    # Parse "Name <email>" or just "email"
                    m = re.match(r'"?([^"<]+)"?\s*<([^>]+)>', to_addr)
                    if m:
                        contact_name = m.group(1).strip()
                        contact_email = m.group(2).strip()
                    else:
                        contact_email = to_addr.strip()
                    break

            if not contact_email:
                # Fallback: whoever is NOT us in the thread
                for msg in messages:
                    from_addr = _header(msg, "from")
                    if my_email.lower() not in from_addr.lower():
                        m = re.match(r'"?([^"<]+)"?\s*<([^>]+)>', from_addr)
                        if m:
                            contact_name = m.group(1).strip()
                            contact_email = m.group(2).strip()
                        else:
                            contact_email = from_addr.strip()
                        break

            if not contact_email:
                continue

            # Build a transcript of the thread (cap at ~3000 chars to save tokens)
            transcript_parts = []
            for msg in messages[:6]:
                sender = _header(msg, "from")
                body = _decode_body(msg.get("payload", {}))[:800]
                transcript_parts.append(f"FROM: {sender}\n{body.strip()}")
            transcript = "\n\n---\n\n".join(transcript_parts)[:3000]

            # Ask Claude to extract firm, title, and a short note
            prompt = f"""You are parsing an email thread from a college student's IB recruiting outreach.

Email thread:
{transcript}

Extract the following as JSON (use null if unknown):
{{
  "firm": "company name",
  "title": "their job title",
  "notes": "2-3 sentence summary of the conversation status and any useful context"
}}

Respond with only the JSON object."""

            resp = ai.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text.strip()
            # Strip markdown code fences if present
            raw = re.sub(r"^```json\s*|^```\s*|```$", "", raw, flags=re.MULTILINE).strip()
            extracted = json.loads(raw)

            # Determine status from thread length
            has_reply = any(
                my_email.lower() not in _header(msg, "from").lower()
                for msg in messages
            )
            status = "Replied" if has_reply else "Contacted"

            results.append({
                "name": contact_name or contact_email.split("@")[0].replace(".", " ").title(),
                "email": contact_email,
                "firm": extracted.get("firm") or "",
                "title": extracted.get("title") or "",
                "notes": extracted.get("notes") or "",
                "status": status,
                "gmail_thread_id": item["id"],
            })
        except Exception:
            continue

    return results


DEV_REDIRECT_EMAIL = os.getenv("ADMIN_EMAIL", "gilbert.knight@gmail.com")

def rate_limited_send(service, emails: list[dict], per_minute: int = 10, daily_cap: int = 50, today_sent: int = 0) -> list[dict]:
    import scheduler

    if DEV_MODE:
        results = []
        for email in emails:
            scheduled_time = email.get("scheduled_time")
            if scheduled_time and scheduled_time > datetime.utcnow():
                scheduler.enqueue({**email, "user_id": DEV_USER_ID}, scheduled_time)
                results.append({"id": email["id"], "success": True, "scheduled": True, "send_at": scheduled_time.isoformat()})
                continue
            try:
                dev_banner = f'<p style="color:#888;font-size:11px;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">[DEV MODE → {email.get("to", "?")}]</p>'
                result = send_email(
                    service=service,
                    to=DEV_REDIRECT_EMAIL,
                    subject=f"[DEV → {email.get('to', '?')}] {email['subject']}",
                    body=f"{dev_banner}{email['body']}",
                    firm=email.get("firm", ""),
                    attachment_paths=email.get("attachment_paths", []),
                )
                results.append({"id": email["id"], "success": True, **result, "dev": True})
            except Exception as e:
                results.append({"id": email["id"], "success": False, "error": str(e)})
        return results

    results = []
    sent_this_batch = 0
    interval = 60.0 / per_minute
    for email in emails:
        if today_sent + sent_this_batch >= daily_cap:
            results.append({"id": email["id"], "success": False, "error": "Daily cap reached"})
            continue
        scheduled_time = email.get("scheduled_time")
        if scheduled_time and scheduled_time > datetime.utcnow():
            scheduler.enqueue({**email}, scheduled_time)
            results.append({"id": email["id"], "success": True, "scheduled": True, "send_at": scheduled_time.isoformat()})
            sent_this_batch += 1
            continue
        try:
            result = send_email(
                service=service,
                to=email["to"],
                subject=email["subject"],
                body=email["body"],
                firm=email.get("firm", ""),
                attachment_paths=email.get("attachment_paths", []),
            )
            results.append({"id": email["id"], "success": True, **result})
            sent_this_batch += 1
            time.sleep(interval)
        except Exception as e:
            results.append({"id": email["id"], "success": False, "error": str(e)})
    return results
