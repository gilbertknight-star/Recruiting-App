"""Recruiting tracker: application deadlines and to-dos (Supabase, or in memory in DEV_MODE)."""
import uuid
from datetime import datetime

from db import supabase, DEV_MODE

APPLICATION_STATUSES = ["Not started", "In progress", "Submitted", "Interviewing", "Offer", "Rejected"]

_dev: dict[str, dict[str, dict]] = {"applications": {}, "todos": {}}


def _list(table: str, user_id: str, order: str) -> list[dict]:
    if DEV_MODE:
        return sorted(_dev[table].values(), key=lambda r: (r.get(order) is None, r.get(order) or ""))
    return supabase.table(table).select("*").eq("user_id", user_id).order(order, nullsfirst=False).execute().data or []


def _create(table: str, user_id: str, data: dict) -> dict:
    if DEV_MODE:
        row = {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": datetime.utcnow().isoformat(), **data}
        _dev[table][row["id"]] = row
        return row
    return supabase.table(table).insert({**data, "user_id": user_id}).execute().data[0]


def _update(table: str, user_id: str, row_id: str, updates: dict) -> dict | None:
    if DEV_MODE:
        if row_id not in _dev[table]:
            return None
        _dev[table][row_id].update(updates)
        return _dev[table][row_id]
    res = supabase.table(table).update(updates).eq("id", row_id).eq("user_id", user_id).execute()
    return res.data[0] if res.data else None


def _delete(table: str, user_id: str, row_id: str):
    if DEV_MODE:
        _dev[table].pop(row_id, None)
        return
    supabase.table(table).delete().eq("id", row_id).eq("user_id", user_id).execute()


def list_applications(user_id: str) -> list[dict]:
    return _list("applications", user_id, "deadline")


def create_application(user_id: str, data: dict) -> dict:
    return _create("applications", user_id, data)


def update_application(user_id: str, app_id: str, updates: dict) -> dict | None:
    return _update("applications", user_id, app_id, updates)


def delete_application(user_id: str, app_id: str):
    _delete("applications", user_id, app_id)


def list_todos(user_id: str) -> list[dict]:
    return _list("todos", user_id, "created_at")


def create_todo(user_id: str, data: dict) -> dict:
    return _create("todos", user_id, data)


def update_todo(user_id: str, todo_id: str, updates: dict) -> dict | None:
    return _update("todos", user_id, todo_id, updates)


def delete_todo(user_id: str, todo_id: str):
    _delete("todos", user_id, todo_id)
