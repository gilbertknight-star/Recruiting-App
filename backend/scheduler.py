"""
Background scheduler for deferred email sends.
Emails queued with a future send_at time are held here;
a background thread checks every 30s and fires them when due.
"""
import threading
import time
from datetime import datetime

_lock = threading.Lock()
_queue: list[dict] = []   # [{send_at, to, subject, body, firm, attachment_paths, user_id, contact_id}]
_callbacks: list = []      # registered send functions [(fn, user_id)]

_service_factory = None    # set by main.py on startup: fn(user_id) -> gmail service
_send_fn = None            # set by main.py: fn(service, **kwargs) -> dict


def configure(service_factory, send_fn):
    global _service_factory, _send_fn
    _service_factory = service_factory
    _send_fn = send_fn


def enqueue(email: dict, send_at: datetime):
    with _lock:
        _queue.append({"send_at": send_at, **email})


def queue_size() -> int:
    with _lock:
        return len(_queue)


def get_scheduled() -> list[dict]:
    with _lock:
        return [{"send_at": e["send_at"].isoformat(), "to": e["to"], "subject": e["subject"]} for e in _queue]


def _tick():
    global _queue
    if _service_factory is None or _send_fn is None:
        return
    now = datetime.utcnow()
    with _lock:
        due = [e for e in _queue if e["send_at"] <= now]
        _queue = [e for e in _queue if e["send_at"] > now]

    import os
    dev_mode = os.getenv("DEV_MODE", "false").lower() == "true"
    dev_redirect = os.getenv("ADMIN_EMAIL", "gilbert.knight@gmail.com")

    for email in due:
        try:
            service = _service_factory(email.get("user_id", ""))
            to = dev_redirect if dev_mode else email["to"]
            subject = f"[SCHEDULED DEV → {email['to']}] {email['subject']}" if dev_mode else email["subject"]
            _send_fn(
                service=service,
                to=to,
                subject=subject,
                body=email["body"],
                firm=email.get("firm", ""),
                attachment_paths=email.get("attachment_paths", []),
            )
            print(f"[scheduler] Sent scheduled email to {email.get('to')}")
        except Exception as e:
            print(f"[scheduler] Failed to send scheduled email to {email.get('to')}: {e}")


def _loop():
    while True:
        time.sleep(30)
        try:
            _tick()
        except Exception as e:
            print(f"[scheduler] tick error: {e}")


def start():
    t = threading.Thread(target=_loop, daemon=True)
    t.start()
