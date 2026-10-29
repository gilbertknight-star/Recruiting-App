"""Track what the app spends: Claude tokens/dollars and Apollo credits, per user."""
from contextvars import ContextVar
from datetime import datetime, timezone

from db import supabase, DEV_MODE

# Set by auth.get_current_user so calls deep in the code can be attributed without passing user ids around
current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)

# Anthropic API list prices, $ per million tokens (input, output)
CLAUDE_PRICES = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


def _price(model: str) -> tuple[float, float]:
    # Responses can carry a dated id (claude-haiku-4-5-20251001); match on the base name
    return next((p for name, p in CLAUDE_PRICES.items() if (model or "").startswith(name)), CLAUDE_PRICES["claude-sonnet-4-6"])


def _insert(row: dict):
    if DEV_MODE:
        return
    user_id = current_user_id.get()
    if not user_id:
        return
    try:
        supabase.table("api_usage").insert({**row, "user_id": user_id}).execute()
    except Exception as e:
        print(f"[usage] couldn't record usage: {e}")  # never break the real request over bookkeeping


def log_claude(response, action: str):
    """Record one Claude API call from its response.usage."""
    u = response.usage
    inp = (u.input_tokens or 0) + (getattr(u, "cache_creation_input_tokens", 0) or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0)
    out = u.output_tokens or 0
    in_price, out_price = _price(response.model)
    cost = ((u.input_tokens or 0) * in_price
            + (getattr(u, "cache_creation_input_tokens", 0) or 0) * in_price * 1.25
            + (getattr(u, "cache_read_input_tokens", 0) or 0) * in_price * 0.1
            + out * out_price) / 1_000_000
    # Web search is billed per search on top of tokens: $10 per 1,000
    searches = getattr(getattr(u, "server_tool_use", None), "web_search_requests", 0) or 0
    cost += searches * 0.01
    _insert({"provider": "claude", "action": action, "model": response.model,
             "input_tokens": inp, "output_tokens": out, "cost_usd": round(cost, 6)})


def log_apollo(credits: int, action: str):
    """Record Apollo credits spent (1 per person revealed)."""
    if credits > 0:
        _insert({"provider": "apollo", "action": action, "credits": credits})


def summary(user_id: str, apollo_cost_per_credit: float = 0) -> dict:
    """Totals for this month and all time, by provider and by action."""
    rows = supabase.table("api_usage").select("provider, action, input_tokens, output_tokens, credits, cost_usd, created_at") \
        .eq("user_id", user_id).execute().data or []
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def totals(items):
        claude = [r for r in items if r["provider"] == "claude"]
        apollo = [r for r in items if r["provider"] == "apollo"]
        credits = sum(r["credits"] for r in apollo)
        by_action: dict = {}
        for r in claude:
            a = by_action.setdefault(r["action"], {"calls": 0, "cost_usd": 0.0})
            a["calls"] += 1
            a["cost_usd"] += float(r["cost_usd"])
        return {
            "claude_calls": len(claude),
            "claude_input_tokens": sum(r["input_tokens"] for r in claude),
            "claude_output_tokens": sum(r["output_tokens"] for r in claude),
            "claude_cost_usd": round(sum(float(r["cost_usd"]) for r in claude), 4),
            "claude_by_action": {k: {"calls": v["calls"], "cost_usd": round(v["cost_usd"], 4)} for k, v in by_action.items()},
            "apollo_credits": credits,
            "apollo_cost_usd": round(credits * float(apollo_cost_per_credit or 0), 2),
        }

    this_month = [r for r in rows if datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")) >= month_start]
    return {"this_month": totals(this_month), "all_time": totals(rows)}
