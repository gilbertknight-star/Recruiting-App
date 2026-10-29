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
MAX_SEARCHES_MORE = 10    # "Find more" or a single deal type digs deeper
MAX_DEALS = 15

# People at a company who work directly with its bankers
CLIENT_TITLES = ["Chief Financial Officer", "CFO", "VP Finance", "Vice President of Finance",
                 "Head of Corporate Development", "Corporate Development", "Treasurer", "Chief Executive Officer"]

_dev_deals: dict[str, dict] = {}


class DealSearchError(Exception):
    pass


# "Find more" can narrow a search to one kind of deal; big banks do far more deals than one search covers
FOCUS = {
    "": "",
    "mna": "Only look for M&A: mergers, acquisitions, divestitures and spin-offs. Announcements name advisors near the end, e.g. \"{bank} is serving as financial advisor to\".",
    "equity": "Only look for equity offerings: IPOs, follow-on offerings and convertible notes, where {bank} is a bookrunner or underwriter.",
    "debt": "Only look for debt deals: bond and notes offerings, term loans and credit facilities, where {bank} is a bookrunner, arranger or underwriter.",
}


def _prompt(bank: str, days: int, focus: str = "", skip: list[str] = None) -> str:
    since = (date.today() - timedelta(days=days)).isoformat()
    focus_line = FOCUS.get(focus, "").format(bank=bank)
    skip_line = (f"Skip these companies, which are already on the list: {', '.join(skip)}. Find different deals."
                 if skip else "")
    return f"""Find deals announced since {since} (the last {days} days) where {bank} was a financial advisor, underwriter or placement agent.

Look at press releases (Business Wire, PR Newswire, GlobeNewswire, company newsrooms), SEC filings, and {bank}'s own news or transactions pages.
Large banks work on many deals, so run several different searches before concluding there are few: vary the wording, search by
sector (technology, healthcare, energy, industrials, consumer, financials), by month, and on individual newswire sites. Don't
put whole sentences in quotes; search terms like: {bank} financial advisor acquisition announced. The bank may be named by its
legal entity (for example Citigroup Global Markets, J.P. Morgan Securities, Goldman Sachs & Co., BofA Securities, Morgan
Stanley & Co.). Include deals where {bank} is one of several advisors.
{focus_line}
{skip_line}

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


def research_deals(bank: str, days: int = 90, focus: str = "", skip: list[str] = None) -> list[dict]:
    """Ask Claude, with web search, for the bank's recent deals. focus narrows to one deal type;
    skip lists companies already found so a repeat search turns up new ones."""
    messages = [{"role": "user", "content": _prompt(bank, days, focus, skip)}]
    for _ in range(4):  # a long search can pause mid-turn; resume it a few times at most
        try:
            response = client.beta.messages.create(
                model=MODEL,
                max_tokens=16000,
                output_config={"effort": "medium"},
                tools=[{"type": "web_search_20260209", "name": "web_search",
                        "max_uses": MAX_SEARCHES_MORE if (focus or skip) else MAX_SEARCHES}],
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


def extract_from_link(url: str) -> dict:
    """Read one deal announcement (press release, filing, article) and pull out the deal's details."""
    prompt = f"""Read this deal announcement: {url}

Respond with only this JSON inside <deal> tags, no other text. "bank" is the investment bank named as financial advisor,
underwriter or placement agent (if several, the one listed first), and "company" is that bank's client: the seller or target
if it advised that side, the buyer if it advised the buyer, the issuer for an IPO or financing.
<deal>
{{"bank": "", "company": "", "counterparty": "", "deal_type": "M&A sell-side | M&A buy-side | IPO | Debt financing | Equity financing | Restructuring | Other",
  "bank_role": "", "announced_date": "YYYY-MM-DD", "summary": "one sentence", "other_banks": ["other advisors named, with roles"]}}
</deal>"""
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=8000,
            output_config={"effort": "low"},
            tools=[{"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 2}],
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIStatusError as e:
        raise DealSearchError(f"Claude API error {e.status_code}: {e.message}")
    except anthropic.APIConnectionError:
        raise DealSearchError("Couldn't reach the Claude API. Check your internet connection.")
    log_claude(response, "read deal link")
    if response.stop_reason == "refusal":
        raise DealSearchError("Claude declined to read this page.")
    text = "".join(b.text for b in response.content if b.type == "text")
    m = re.search(r"<deal>\s*(\{.*\})\s*</deal>", text, re.DOTALL)
    try:
        d = json.loads(m.group(1)) if m else {}
    except json.JSONDecodeError:
        d = {}
    if not d.get("company"):
        raise DealSearchError("Couldn't find a deal on that page. Fill in the details by hand instead.")
    announced = (d.get("announced_date") or "").strip()
    return {
        "bank": (d.get("bank") or "").strip(),
        "company": d["company"].strip(),
        "counterparty": (d.get("counterparty") or "").strip(),
        "deal_type": (d.get("deal_type") or "").strip(),
        "bank_role": (d.get("bank_role") or "").strip(),
        "announced_date": announced if re.fullmatch(r"\d{4}-\d{2}-\d{2}", announced) else "",
        "summary": (d.get("summary") or "").strip(),
        "source_url": url,
        "other_banks": d.get("other_banks") or [],
    }


def _brief_prompt(deal: dict) -> str:
    who = f"{deal['company']}" + (f" and {deal['counterparty']}" if deal.get("counterparty") else "")
    return f"""Research this deal and write a briefing for a college student preparing to network with people involved.

Deal: {deal.get('summary') or ''}
Company (the bank's client): {deal['company']}
Other party: {deal.get('counterparty') or 'unknown'}
Bank: {deal['bank']}, {deal.get('bank_role') or 'advisor'}
Announced: {deal.get('announced_date') or 'unknown'}
{('Known source: ' + deal['source_url']) if deal.get('source_url') else ''}

Search for the announcement and coverage of {who}. Only state facts your sources support; say "not disclosed" when something isn't public.

Respond with only this JSON inside <brief> tags, no other text:
<brief>
{{"headline": "one line: who did what with whom",
  "overview": "2-4 sentences on what the deal is",
  "terms": ["key terms as short lines: value, price per share or multiple, consideration, financing, expected close"],
  "rationale": "2-3 sentences on why the companies did it",
  "timeline": ["YYYY-MM-DD - event"],
  "advisors": ["Firm - role (who they advised)"],
  "people": ["Name, title - role in the deal (executives quoted or named)"],
  "talking_points": ["3-4 specific, informed things a student could mention or ask about when reaching out to someone at {deal['company']} or {deal['bank']}"]}}
</brief>"""


def _collect_sources(content) -> list[dict]:
    """Every page the search touched: cited pages first, then other results, de-duplicated by URL."""
    cited, seen, other = [], set(), []
    for block in content:
        for c in getattr(block, "citations", None) or []:
            url = getattr(c, "url", None)
            if url and url not in seen:
                seen.add(url)
                cited.append({"url": url, "title": getattr(c, "title", "") or url, "cited": True})
        if block.type == "web_search_tool_result" and isinstance(block.content, list):
            for r in block.content:
                url = getattr(r, "url", None)
                if url and url not in seen:
                    seen.add(url)
                    other.append({"url": url, "title": getattr(r, "title", "") or url, "cited": False})
    return cited + other


def research_brief(deal: dict) -> tuple[dict, list[dict]]:
    """Claude + web search writes a briefing on one deal. Returns (brief, sources)."""
    messages = [{"role": "user", "content": _brief_prompt(deal)}]
    content = []
    for _ in range(4):
        try:
            response = client.beta.messages.create(
                model=MODEL,
                max_tokens=16000,
                output_config={"effort": "medium"},
                tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 4}],
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                messages=messages,
            )
        except anthropic.APIStatusError as e:
            raise DealSearchError(f"Claude API error {e.status_code}: {e.message}")
        except anthropic.APIConnectionError:
            raise DealSearchError("Couldn't reach the Claude API. Check your internet connection.")
        log_claude(response, "deal brief")
        content += list(response.content)
        if response.stop_reason == "refusal":
            raise DealSearchError("Claude declined to research this deal.")
        if response.stop_reason != "pause_turn":
            break
        messages.append({"role": "assistant", "content": response.content})
    text = "".join(b.text for b in content if b.type == "text")
    m = re.search(r"<brief>\s*(\{.*\})\s*</brief>", text, re.DOTALL) or re.search(r"(\{.*\})", text, re.DOTALL)
    try:
        brief = json.loads(m.group(1)) if m else {}
    except json.JSONDecodeError:
        brief = {}
    if not brief:
        raise DealSearchError("Couldn't put together a brief for this deal. Try again.")
    return brief, _collect_sources(content)


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
