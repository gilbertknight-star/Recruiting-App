import base64
import os
import time
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
]

CREDS_FILE = Path(__file__).parent / "credentials.json"
TOKEN_FILE = Path(__file__).parent / "token.json"


def get_gmail_service():
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def get_or_create_label(service, label_name: str, parent_id: str = None) -> str:
    labels = service.users().labels().list(userId="me").execute().get("labels", [])
    for label in labels:
        if label["name"] == label_name:
            return label["id"]
    body = {"name": label_name, "labelListVisibility": "labelShow", "messageListVisibility": "show"}
    created = service.users().labels().create(userId="me", body=body).execute()
    return created["id"]


def send_email(
    service,
    to: str,
    subject: str,
    body: str,
    firm: str,
    sender_name: str,
    resume_path: str = None,
    scheduled_time: datetime = None,
) -> dict:
    recruiting_label_id = get_or_create_label(service, "Recruiting")
    firm_label_name = f"Recruiting/{firm}" if firm else "Recruiting/Other"
    firm_label_id = get_or_create_label(service, firm_label_name)

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
            thread = service.users().threads().get(
                userId="me", id=contact["gmail_thread_id"]
            ).execute()
            messages = thread.get("messages", [])
            if len(messages) > 1:
                updated.append({"id": contact["id"], "status": "Replied", "replied_at": datetime.utcnow().isoformat()})
        except Exception:
            pass
    return updated


def rate_limited_send(service, emails: list[dict], per_minute: int = 10, daily_cap: int = 50, today_sent: int = 0):
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
                sender_name=email.get("sender_name", ""),
                resume_path=email.get("resume_path"),
                scheduled_time=email.get("scheduled_time"),
            )
            results.append({"id": email["id"], "success": True, **result})
            sent_this_batch += 1
            time.sleep(interval)
        except Exception as e:
            results.append({"id": email["id"], "success": False, "error": str(e)})

    return results
