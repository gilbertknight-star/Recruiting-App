import os
import httpx
from dotenv import load_dotenv

load_dotenv()

APOLLO_API_KEY = os.getenv("APOLLO_API_KEY", "")
# Off switch for anything that spends Apollo credits; only "true" turns it on
APOLLO_ALLOW_CREDITS = os.getenv("APOLLO_ALLOW_CREDITS", "false").lower() == "true"
BASE_URL = "https://api.apollo.io/api/v1"

SENIORITY_OPTIONS = ["entry", "senior", "manager", "director", "vp", "partner", "c_suite", "owner"]


class ApolloError(Exception):
    pass


def _post(endpoint: str, payload: dict) -> dict:
    if not APOLLO_API_KEY:
        raise ApolloError("APOLLO_API_KEY is not set in backend/.env")
    res = httpx.post(
        f"{BASE_URL}/{endpoint}",
        json=payload,
        headers={"Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": APOLLO_API_KEY},
        timeout=30,
    )
    if res.status_code >= 400:
        raise ApolloError(f"Apollo {res.status_code}: {res.text[:300]}")
    return res.json()


def search_people(firm: str, titles: list[str] = None, seniorities: list[str] = None,
                  locations: list[str] = None, page: int = 1, per_page: int = 25) -> dict:
    """Free search (no credits). Last names are obfuscated and emails are not returned."""
    payload = {"q_organization_name": firm, "page": page, "per_page": per_page}
    if titles:
        payload["person_titles"] = titles
    if seniorities:
        payload["person_seniorities"] = seniorities
    if locations:
        payload["person_locations"] = locations
    data = _post("mixed_people/api_search", payload)
    people = [
        {
            "apollo_id": p.get("id"),
            "first_name": p.get("first_name") or "",
            "last_name": p.get("last_name_obfuscated") or "",
            "title": p.get("title") or "",
            "firm": (p.get("organization") or {}).get("name") or "",
            "has_email": bool(p.get("has_email")),
        }
        for p in data.get("people", [])
    ]
    return {
        "total": data.get("total_entries", 0), "page": page, "per_page": per_page,
        "people": people, "credits_enabled": APOLLO_ALLOW_CREDITS,
    }


def list_saved_lists() -> list[dict]:
    """Apollo lists (labels) that hold saved contacts."""
    if not APOLLO_API_KEY:
        raise ApolloError("APOLLO_API_KEY is not set in backend/.env")
    res = httpx.get(f"{BASE_URL}/labels", headers={"X-Api-Key": APOLLO_API_KEY}, timeout=30)
    if res.status_code >= 400:
        raise ApolloError(f"Apollo {res.status_code}: {res.text[:300]}")
    labels = res.json() if isinstance(res.json(), list) else res.json().get("labels", [])
    return [
        {"id": l["id"], "name": l.get("name", ""), "count": l.get("cached_count", 0)}
        for l in labels if l.get("modality") == "contacts"
    ]


def _saved_contact(c: dict) -> dict:
    location = ", ".join(x for x in (c.get("city"), c.get("state")) if x)
    return {
        "apollo_id": c.get("id"),
        "name": c.get("name") or f"{c.get('first_name', '')} {c.get('last_name', '')}".strip(),
        "email": c.get("email") or "",
        "email_status": c.get("email_status") or "",
        "title": c.get("title") or "",
        "firm": c.get("organization_name") or (c.get("organization") or {}).get("name") or "",
        "linkedin_url": c.get("linkedin_url") or "",
        "location": location,
        "list_ids": c.get("label_ids") or [],
    }


def search_saved(keywords: str = "", list_id: str = "", page: int = 1, per_page: int = 25,
                 titles: list[str] = None, seniorities: list[str] = None) -> dict:
    """Contacts already saved in the Apollo account. No credits: they were revealed when saved."""
    payload = {"page": page, "per_page": per_page, "sort_by_field": "contact_created_at", "sort_ascending": False}
    if keywords:
        payload["q_keywords"] = keywords
    if list_id:
        payload["contact_label_ids"] = [list_id]
    if titles:
        payload["person_titles"] = titles
    if seniorities:
        payload["person_seniorities"] = seniorities
    data = _post("contacts/search", payload)
    pagination = data.get("pagination") or {}
    return {
        "total": pagination.get("total_entries", 0),
        "page": page,
        "per_page": per_page,
        "people": [_saved_contact(c) for c in data.get("contacts", [])],
    }


def all_saved(keywords: str = "", list_id: str = "", titles: list[str] = None,
              seniorities: list[str] = None) -> list[dict]:
    """Every saved contact matching the filters, 100 per page."""
    people, page = [], 1
    while True:
        res = search_saved(keywords, list_id, page, 100, titles, seniorities)
        people += res["people"]
        if not res["people"] or len(people) >= res["total"]:
            return people
        page += 1


def reveal_people(apollo_ids: list[str]) -> list[dict]:
    """Enrich people by Apollo ID to get full name, email and LinkedIn. Uses Apollo credits."""
    if not APOLLO_ALLOW_CREDITS:
        raise ApolloError("Paid Apollo lookups are turned off. Set APOLLO_ALLOW_CREDITS=true in backend/.env to allow them.")
    revealed = []
    for i in range(0, len(apollo_ids), 10):  # bulk_match takes up to 10 per call
        batch = apollo_ids[i:i + 10]
        data = _post("people/bulk_match", {
            "details": [{"id": pid} for pid in batch],
            "reveal_personal_emails": False,
        })
        for p in data.get("matches") or []:
            if not p:
                continue
            org = p.get("organization") or {}
            location = ", ".join(x for x in (p.get("city"), p.get("state")) if x)
            revealed.append({
                "apollo_id": p.get("id"),
                "name": p.get("name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip(),
                "email": p.get("email") or "",
                "email_status": p.get("email_status") or "",
                "title": p.get("title") or "",
                "firm": org.get("name") or "",
                "linkedin_url": p.get("linkedin_url") or "",
                "location": location,
            })
    return revealed
