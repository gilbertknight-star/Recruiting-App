"""Email attachments (resume, reports) stored in Supabase Storage, so any server running the
backend can attach them, not just the computer they were picked on.

Settings.attachments holds references: "storage://<user_id>/<id>-<filename>" for uploaded files.
Older plain file paths still work when the file exists on the machine doing the sending."""
import mimetypes
import re
import uuid
from pathlib import Path

from db import supabase

BUCKET = "attachments"
PREFIX = "storage://"
_cache: dict[str, bytes] = {}   # files are small; avoid re-downloading for every email in a batch


def _ensure_bucket():
    if not any(b.name == BUCKET for b in supabase.storage.list_buckets()):
        supabase.storage.create_bucket(BUCKET, options={"public": False})


def display_name(ref: str) -> str:
    """'storage://abc/1a2b3c4d-Gilbert Knight - Resume.pdf' -> 'Gilbert Knight - Resume.pdf'"""
    if ref.startswith(PREFIX):
        return re.sub(r"^[0-9a-f]{8}-", "", ref.rsplit("/", 1)[-1])
    return Path(ref.replace("\\", "/")).name


def upload(user_id: str, filename: str, data: bytes) -> str:
    _ensure_bucket()
    safe = re.sub(r"[^\w.\- ]+", "_", Path(filename).name).strip() or "attachment"
    key = f"{user_id}/{uuid.uuid4().hex[:8]}-{safe}"
    content_type = mimetypes.guess_type(safe)[0] or "application/octet-stream"
    supabase.storage.from_(BUCKET).upload(key, data, {"content-type": content_type})
    return PREFIX + key


def load(ref: str) -> tuple[str, bytes]:
    """(filename, bytes) for an attachment reference or a local path."""
    if ref.startswith(PREFIX):
        if ref not in _cache:
            _cache[ref] = supabase.storage.from_(BUCKET).download(ref[len(PREFIX):])
        return display_name(ref), _cache[ref]
    p = Path(ref)
    if not p.exists():
        raise FileNotFoundError(f"Attachment not found on this computer: {ref}. Re-upload it in Settings.")
    return p.name, p.read_bytes()


def delete(ref: str):
    if ref.startswith(PREFIX):
        supabase.storage.from_(BUCKET).remove([ref[len(PREFIX):]])
        _cache.pop(ref, None)
