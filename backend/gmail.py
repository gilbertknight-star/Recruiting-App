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
from db import supabase

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


def get_gmail_service(user_id: str):
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


def send_email(service, to: str, subject: str, body: str, firm: str, resume_path: str = None, scheduled_time: datetime = None) -> dict:
    recruiting_label_id = get_or_create_label(service, "Recruiting")
    firm_label_id = get_or_create_label(service, f"Recruiting/{firm}" if firm else "Recruiting/Other")

    msg = MIMEMultipart()
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    if resume_path and Path(resume_path).exists():
        with open(resume_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{Path(resume_path).name}"')
        msg.attach(part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    send_body = {"raw": raw, "labelIds": [recruiting_label_id, firm_label_id]}
    if scheduled_time:
        send_body["sendAt"] = scheduled_time.strftime("%Y-%m-%dT%H:%M:%SZ")

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


def rate_limited_send(service, emails: list[dict], per_minute: int = 10, daily_cap: int = 50, today_sent: int = 0) -> list[dict]:
    results = []
    sent_this_batch = 0
    interval = 60.0 / per_minute
    for email in emails:
        if today_sent + sent_this_batch >= daily_cap:
            results.append({"id": email["id"], "success": False, "error": "Daily cap reached"})
            continue
        try:
            result = send_email(
                service=service,
                to=email["to"],
                subject=email["subject"],
                body=email["body"],
                firm=email.get("firm", ""),
                resume_path=email.get("resume_path"),
                scheduled_time=email.get("scheduled_time"),
            )
            results.append({"id": email["id"], "success": True, **result})
            sent_this_batch += 1
            time.sleep(interval)
        except Exception as e:
            results.append({"id": email["id"], "success": False, "error": str(e)})
    return results
