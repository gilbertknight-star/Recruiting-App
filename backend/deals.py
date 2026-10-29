"""Client-side sourcing: find recent deals a bank advised on, using Claude with web search.
The companies the bank advised become leads for client-referral outreach."""
import json
import os
import re
from datetime import date, timedelta

import anthropic
from dotenv import load_dotenv

from db import supabase, DEV_MODE
from usage import log_claude

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))
MODEL = "claude-opus-5-5"
MAX_SEARCHES = 6          # caps web-search spend per lookup
MAX_DEALS = 15

# People at a company who work directly with its bankers
CLIENT_TITLES = ["Chief Financial Officer", "CFO", "VP Finance", "Vice President of Finance",
                 "Head of Corporate Development", "Corporate Development", "Treasurer", "Chief Executive Officer"]

_dev_deals: dict[str, dict] = {}


class DealSearchError(Exception):
    pass


def _prompt(bank: str, days: int) -> str:
    since = (date.today() - timedelta(days=days)).isoformat()
    return f"""Find deals announced since {since} (the last {days} days) where {bank} was a financial advisor, underwriter or placement agent.

Look at press releases (Business Wire, PR Newswire, GlobeNewswire, company newsrooms), SEC filings, and {bank}'s own news or transactions pages.

For each deal, "company" is {bank}'s client: the company whose executives worked with {bank}'s bankers. If {bank} advised the seller or target, that's the seller/target; if it advised the buyer, that's the buyer; for an IPO or financing, it's the issuer.

Include a deal only if a source you found explicitly names {bank} in an advisory or underwriting role. Return at most {MAX_DEALS} deals, most recent first. If you find none, return an empty list.

Respond with only this, no other text:
<deals>
[{{"company": "...", "counterparty": "... or empty", "deal_type": "M&A sell-side | M&A buy-side | IPO | Debt financing | Equity financing | Restructuring | Other",
  "bank_role": "e.g. exclusive financial advisor to the seller", "announced_date": "YYYY-MM-DD",
  "summary": "one sentence describing the deal", "source_url": "the page that names {bank}"}}]
</deals>"""


def _parse(text: str) -> list[dict]:
    m = re.search(r"<deals>\s*(\[.*?\])\s*</deals>", text, re.DOTALL) or re.search(r"(\[\s*\{.*\}\s*\])", text, re.DOTALL)
    if not m:
        return []
    try:
        items = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []
    deals = []
    for d in items if isinstance(items, list) else []:
        company = (d.get("company") or "").strip()
        if not company:
            continue
        announced = (d.get("announced_date") or "").strip()
        deals.append({
            "company": company,
            "counterparty": (d.get("counterparty") or "").strip(),
            "deal_type": (d.get("deal_type") or "").strip(),
            "bank_role": (d.get("bank_role") or "").strip(),
            "announced_date": announced if re.fullmatch(r"\d{4}-\d{2}-\d{2}", announced) else None,
            "summary": (d.get("summary") or "").strip(),
            "source_url": (d.get("source_url") or "").strip(),
        })
    return deals[:MAX_DEALS]


def research_deals(bank: str, days: int = 90) -> list[dict]:
    """Ask Claude, with web search, for the bank's recent deals."""
    messages = [{"role": "user", "content": _prompt(bank, days)}]
    for _ in range(4):  # a long search can pause mid-turn; resume it a few times at most
        try:
            response = client.beta.messages.create(
                model=MODEL,
                max_tokens=16000,
                output_config={"effort": "medium"},
                tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": MAX_SEARCHES}],
                # If a safety check declines the request, Anthropic re-runs it on a suitable fallback model
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                messages=messages,
            )
        except anthropic.APIStatusError as e:
            raise DealSearchError(f"Claude API error {e.status_code}: {e.message}")
        except anthropic.APIConnectionError:
            raise DealSearchError("Couldn't reach the Claude API. Check your internet connection.")
        log_claude(response, "find deals")
        if response.stop_reason == "refusal":
            raise DealSearchError("Claude declined this search. Try a different bank name.")
        if response.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": response.content})
    text = "".join(b.text for b in response.content if b.type == "text")
    return _parse(text)


def save_deals(user_id: str, bank: str, deals: list[dict]) -> list[dict]:
    """Store new deals, skipping ones already saved for this bank (same company and date)."""
    existing = {(d["company"].lower(), d.get("announced_date")) for d in list_deals(user_id, bank)}
    fresh = [d for d in deals if (d["company"].lower(), d["announced_date"]) not in existing]
    if not fresh:
        return []
    rows = [{**d, "bank": bank, "user_id": user_id} for d in fresh]
    if DEV_MODE:
        import uuid
        for r in rows:
            r["id"] = str(uuid.uuid4())
            r["status"] = "new"
            _dev_deals[r["id"]] = r
        return rows
    return supabase.table("deals").insert(rows).execute().data or []


def list_deals(user_id: str, bank: str = "") -> list[dict]:
    if DEV_MODE:
        return [d for d in _dev_deals.values() if not bank or d["bank"].lower() == bank.lower()]
    q = supabase.table("deals").select("*").eq("user_id", user_id)
    if bank:
        q = q.ilike("bank", bank)
    return q.order("announced_date", desc=True, nullsfirst=False).execute().data or []


def update_deal(user_id: str, deal_id: str, updates: dict) -> dict | None:
    if DEV_MODE:
        if deal_id in _dev_deals:
            _dev_deals[deal_id].update(updates)
        return _dev_deals.get(deal_id)
    res = supabase.table("deals").update(updates).eq("id", deal_id).eq("user_id", user_id).execute()
    return res.data[0] if res.data else None


def delete_deal(user_id: str, deal_id: str):
    if DEV_MODE:
        _dev_deals.pop(deal_id, None)
        return
    supabase.table("deals").delete().eq("id", deal_id).eq("user_id", user_id).execute()
