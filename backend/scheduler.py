"""
Background scheduler for deferred email sends.
Emails queued with a future send_at time are stored in Supabase (scheduled_emails),
so they survive backend restarts; a background thread checks every 30s and sends
whatever is due, including anything that came due while the backend was off.
In DEV_MODE (no Supabase) the queue is kept in memory instead.
"""
import os
import threading
import time
import uuid
from datetime import datetime, timezone

from db import supabase, DEV_MODE

_lock = threading.Lock()
_memory_queue: list[dict] = []  # DEV_MODE only: [{send_at, to, subject, body, ...}]

_service_factory = None    # set by main.py on startup: fn(user_id) -> gmail service
_send_fn = None            # set by main.py: fn(service, **kwargs) -> dict
_prepare_fn = None         # set by main.py: fn(email) -> email, run just before sending
_on_sent_fn = None         # set by main.py: fn(email, result), after a successful send
_on_failed_fn = None       # set by main.py: fn(email, error), after a failed send


def configure(service_factory, send_fn, prepare_fn=None, on_sent_fn=None, on_failed_fn=None):
    global _service_factory, _send_fn, _prepare_fn, _on_sent_fn, _on_failed_fn
    _service_factory = service_factory
    _send_fn = send_fn
    _prepare_fn = prepare_fn
    _on_sent_fn = on_sent_fn
    _on_failed_fn = on_failed_fn


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def enqueue(email: dict, send_at: datetime):
    """email needs user_id; its "id" is the contact id. send_at is UTC (naive or aware)."""
    if DEV_MODE:
        with _lock:
            _memory_queue.append({"send_at": _utc(send_at), "_row_id": str(uuid.uuid4()), **email})
        return
    payload = {k: v for k, v in email.items() if k not in ("scheduled_time",)}
    supabase.table("scheduled_emails").insert({
        "user_id": email["user_id"],
        "contact_id": email.get("id"),
        "send_at": _utc(send_at).isoformat(),
        "payload": payload,
    }).execute()


def _summary(row_id: str, send_at: str, payload: dict) -> dict:
    return {
        "id": row_id, "send_at": send_at, "to": payload.get("to"), "subject": payload.get("subject"),
        "contact_id": payload.get("id"), "test": bool(payload.get("test")),
    }


def get_scheduled(user_id: str) -> list[dict]:
    if DEV_MODE:
        with _lock:
            return [_summary(e["_row_id"], e["send_at"].isoformat(), e) for e in _memory_queue]
    rows = supabase.table("scheduled_emails").select("id, send_at, payload") \
        .eq("user_id", user_id).eq("status", "pending").order("send_at").execute().data or []
    return [_summary(r["id"], r["send_at"], r["payload"]) for r in rows]


def cancel(user_id: str, row_id: str) -> dict | None:
    """Cancel a pending scheduled email. Returns its payload, or None if it already went out or isn't the user's."""
    if DEV_MODE:
        with _lock:
            for e in _memory_queue:
                if e["_row_id"] == row_id:
                    _memory_queue.remove(e)
                    return e
        return None
    res = supabase.table("scheduled_emails").update({"status": "cancelled"}) \
        .eq("id", row_id).eq("user_id", user_id).eq("status", "pending").execute()
    return res.data[0]["payload"] if res.data else None


def queue_size(user_id: str) -> int:
    return len(get_scheduled(user_id))


def _due_emails() -> list[dict]:
    """Take every due email off the queue. In Supabase each row is claimed (pending -> sending)
    before it's sent, so a row can never be sent twice."""
    now = datetime.now(timezone.utc)
    if DEV_MODE:
        with _lock:
            due = [e for e in _memory_queue if e["send_at"] <= now]
            _memory_queue[:] = [e for e in _memory_queue if e["send_at"] > now]
        return due
    rows = supabase.table("scheduled_emails").select("id, payload") \
        .eq("status", "pending").lte("send_at", now.isoformat()).order("send_at").limit(50).execute().data or []
    claimed = []
    for r in rows:
        res = supabase.table("scheduled_emails").update({"status": "sending"}) \
            .eq("id", r["id"]).eq("status", "pending").execute()
        if res.data:
            claimed.append({**r["payload"], "_row_id": r["id"]})
    return claimed


def _mark(email: dict, status: str, error: str = None):
    if DEV_MODE or "_row_id" not in email:
        return
    update = {"status": status, "error": error}
    if status == "sent":
        update["sent_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("scheduled_emails").update(update).eq("id", email["_row_id"]).execute()


def _tick():
    if _service_factory is None or _send_fn is None:
        return
    dev_redirect = os.getenv("ADMIN_EMAIL", "gilbert.knight@gmail.com")

    for email in _due_emails():
        try:
            if _prepare_fn:
                email = _prepare_fn(email)
            service = _service_factory(email.get("user_id", ""))
            to = dev_redirect if DEV_MODE else email["to"]
            subject = f"[SCHEDULED DEV → {email['to']}] {email['subject']}" if DEV_MODE else email["subject"]
            result = _send_fn(
                service=service,
                to=to,
                subject=subject,
                body=email["body"],
                firm=email.get("firm", ""),
                attachment_paths=email.get("attachment_paths", []),
                bcc=None if DEV_MODE else email.get("bcc"),
            )
            _mark(email, "sent")
            if _on_sent_fn:
                _on_sent_fn(email, result)
            print(f"[scheduler] Sent scheduled email to {email.get('to')}")
        except Exception as e:
            _mark(email, "failed", str(e)[:500])
            if _on_failed_fn:
                try:
                    _on_failed_fn(email, e)
                except Exception as hook_error:
                    print(f"[scheduler] failure hook error: {hook_error}")
            print(f"[scheduler] Failed to send scheduled email to {email.get('to')}: {e}")


def _recover_interrupted():
    """Rows left 'sending' by a crash mid-send go back to pending (rare; may resend one email)."""
    if DEV_MODE:
        return
    supabase.table("scheduled_emails").update({"status": "pending"}).eq("status", "sending").execute()


def _loop():
    while True:
        try:
            _tick()
        except Exception as e:
            print(f"[scheduler] tick error: {e}")
        time.sleep(30)


def start():
    try:
        _recover_interrupted()
    except Exception as e:
        print(f"[scheduler] recovery error: {e}")
    t = threading.Thread(target=_loop, daemon=True)
    t.start()
