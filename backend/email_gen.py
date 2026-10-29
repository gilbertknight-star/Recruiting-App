import anthropic
import os
from dotenv import load_dotenv
from usage import log_claude

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))


def build_prompt(contact: dict, template: dict, settings: dict) -> str:
    first_name = contact["name"].strip().split()[0]

    availability = settings.get("availability", "").strip()
    availability_line = f"I am generally available {availability}." if availability else ""
    if settings.get("live_availability"):
        availability_line = ""  # live times are added as their own paragraph and filled in at send time

    school = contact.get("school", "").strip()
    school_line = f"I am a student at {school}." if school else ""

    notes = contact.get("notes", "").strip()
    notes_line = notes if notes else ""

    location = contact.get("location", "").strip()
    location_line = f"They are based in {location}." if location else ""

    return template["prompt"].format_map(_Blank(
        name=first_name,
        firm=contact["firm"],
        title=contact.get("title", "").strip(),
        school_line=school_line,
        notes_line=notes_line,
        availability_line=availability_line,
        location_line=location_line,
    ))


# Font choices offered in Settings, with web-safe fallbacks; Arial matches Gmail's default compose font
FONT_STACKS = {
    "Aptos": "Aptos,Arial,Helvetica,sans-serif",
    "Arial": "Arial,Helvetica,sans-serif",
    "Times New Roman": "'Times New Roman',Times,serif",
    "Georgia": "Georgia,'Times New Roman',serif",
    "Garamond": "Garamond,'Times New Roman',serif",
    "Calibri": "Calibri,Arial,sans-serif",
    "Verdana": "Verdana,Geneva,sans-serif",
    "Helvetica": "Helvetica,Arial,sans-serif",
}
# Paragraph gap of one line, like pressing Enter twice in Outlook
P_STYLE = "margin:0 0 1em 0"


def body_style(settings: dict) -> str:
    """Matches how Outlook writes mail: size in points, black text, normal line spacing."""
    font = FONT_STACKS.get(settings.get("email_font") or "Aptos", FONT_STACKS["Aptos"])
    size = settings.get("email_font_size") or 12
    return f"font-family:{font};font-size:{size}pt;line-height:normal;color:#000000"


def apply_font(body: str, settings: dict) -> str:
    """Restyle the email's outer wrapper with the current font setting, so drafts written
    before a font change still send in the chosen font."""
    import re
    return re.sub(r'^(\s*<div style=")[^"]*font-family:[^"]*(")', lambda m: m.group(1) + body_style(settings) + m.group(2), body, count=1)


def _plain_to_html(text: str) -> str:
    paragraphs = text.strip().split('\n\n')
    return ''.join(f'<p style="{P_STYLE}">{p.replace(chr(10), "<br>")}</p>' for p in paragraphs)


def clean_signature(sig: str, linkedin_url: str) -> str:
    """Tidy the saved signature: drop blank lines at the edges, remove paragraph margins,
    and make sure there's a clickable LinkedIn link."""
    import re
    sig = sig.strip()
    if not sig:
        return ""
    # Blank lines right after the opening tag or right before the closing tag
    sig = re.sub(r'^(<(?:p|div)[^>]*>)(\s*<br\s*/?>)+', r'\1', sig)
    sig = re.sub(r'(<br\s*/?>\s*)+(</(?:p|div)>)$', r'\2', sig)
    # A wrapping <p> brings default margins that push the signature away from the "--"
    if re.match(r'^<p(\s[^>]*)?>', sig) and sig.endswith('</p>'):
        sig = re.sub(r'^<p(\s[^>]*)?>', '<div style="margin:0">', sig)[:-4] + '</div>'
    if linkedin_url:
        if re.search(r'linkedin\.com/in/', sig):
            sig = re.sub(r'href="https?://(?:www\.)?linkedin\.com/in/[^"]*"', f'href="{linkedin_url}"', sig)
        else:
            link = f'<br><a href="{linkedin_url}" style="color:#1a73e8;text-decoration:none">LinkedIn</a>'
            sig = sig[:-6] + link + '</div>' if sig.endswith('</div>') else sig + link
    return sig


def append_signature(body: str, settings: dict) -> str:
    sig = clean_signature(settings.get("signature") or "", (settings.get("linkedin_url") or "").strip())
    if not body.strip().startswith('<'):
        body = _plain_to_html(body)
    sep = '<div style="margin:1em 0 0 0">--</div>'
    content = f"{body}{sep}{sig}" if sig else body
    return f'<div style="{body_style(settings)}">{content}</div>'


def generate_email(contact: dict, templates: dict, settings: dict) -> dict:
    alumni = contact.get("alumni")
    tier = alumni if alumni and alumni in templates else contact.get("tier", "analyst_associate")
    template = templates.get(tier, templates.get("analyst_associate", {}))
    if not template:
        raise Exception("No template found for tier")
    prompt = build_prompt(contact, template, settings)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    log_claude(message, "draft email")
    body = append_signature(with_availability_placeholder(message.content[0].text.strip(), settings), settings)
    return {"subject": template["subject"], "body": body}


def with_availability_placeholder(text: str, settings: dict) -> str:
    """Add the live-availability placeholder paragraph; it's replaced with calendar times when the email sends."""
    if not settings.get("live_availability"):
        return text
    from gcal import AVAILABILITY_TOKEN
    paragraphs = text.strip().split("\n\n")
    # Keep "Best,\nGilbert" (or similar) as the last thing before the signature
    if len(paragraphs) > 1 and SIGN_OFF.match(paragraphs[-1].strip()):
        return "\n\n".join(paragraphs[:-1] + [AVAILABILITY_TOKEN, paragraphs[-1]])
    return f"{text}\n\n{AVAILABILITY_TOKEN}"


import re as _re
SIGN_OFF = _re.compile(
    r"^(best|best regards|warm regards|kind regards|regards|thanks|thank you|many thanks|sincerely|cheers|all the best)[,!.]?(\s*\n.*)?$",
    _re.IGNORECASE | _re.DOTALL,
)


WARM_STATUSES = {"Replied", "Warm", "Meeting Scheduled", "Referral"}


def followup_kind(contact: dict) -> str:
    """'followup_warm' for people who've replied or met with you, otherwise 'followup_cold'."""
    return "followup_warm" if contact.get("status") in WARM_STATUSES else "followup_cold"


def _plain_text(html: str) -> str:
    import re
    text = re.sub(r"<br\s*/?>|</p>|</div>", "\n", html or "")
    return re.sub(r"<[^>]+>", "", text).replace("&nbsp;", " ").replace("&amp;", "&").strip()


def generate_followup(contact: dict, templates: dict, settings: dict) -> dict:
    """Draft the next follow-up for a contact with the matching follow-up template."""
    from datetime import datetime, timezone
    kind = followup_kind(contact)
    template = templates.get(kind)
    if not template:
        raise Exception(f"No {kind} template. Open Email Studio once to create it.")
    sent_at = contact.get("last_followup_at") or contact.get("sent_at")
    days_since = 7
    if sent_at:
        sent = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
        days_since = max(1, (datetime.now(timezone.utc) - (sent if sent.tzinfo else sent.replace(tzinfo=timezone.utc))).days)
    notes = (contact.get("notes") or "").strip()
    values = {
        "name": contact["name"].strip().split()[0],
        "firm": contact.get("firm", ""),
        "title": contact.get("title", ""),
        "days_since": days_since,
        "followup_number": (contact.get("followup_count") or 0) + 1,
        "notes_line": f"Notes from earlier conversations: {notes}" if notes else "",
        "location_line": "", "school_line": "", "availability_line": "",
    }
    prompt = template["prompt"].format_map(_Blank(values))
    original = _plain_text(contact.get("generated_email") or "")
    if original:
        prompt += f"\n\nFor context only (don't repeat it), this was Gilbert's original email:\n{original[:1500]}"
    earlier = contact.get("followup_history") or []
    if earlier:
        joined = "\n---\n".join(earlier[-3:])
        prompt += ("\n\nGilbert already sent these follow-ups. Do not reuse their opening line or phrasing "
                   f"(for example avoid 'in case it got buried' if it appears below):\n{joined}")
    if settings.get("live_availability"):
        prompt += "\n\nDon't mention times, scheduling flexibility or availability; a short line with his open times is added automatically."
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    log_claude(message, "draft follow-up")
    text = message.content[0].text.strip()
    if settings.get("live_availability"):
        # A one-sentence version of the times keeps a nudge short; placed before the sign-off
        from gcal import AVAILABILITY_SHORT_TOKEN
        paragraphs = text.split("\n\n")
        at = len(paragraphs) - 1 if len(paragraphs) > 1 and SIGN_OFF.match(paragraphs[-1].strip()) else len(paragraphs)
        text = "\n\n".join(paragraphs[:at] + [AVAILABILITY_SHORT_TOKEN] + paragraphs[at:])
    body = append_signature(text, settings)
    return {"subject": template.get("subject", ""), "body": body, "kind": kind}


class _Blank(dict):
    """format_map helper: {Name} works like {name}, and unknown {placeholders} become empty instead of raising."""
    def __missing__(self, key):
        return self.get(key.lower(), "")


def compose_free(prompt: str, context: str) -> dict:
    full_prompt = f"{prompt.strip()}"
    if context.strip():
        full_prompt = f"Context about the recipient: {context.strip()}\n\n{prompt.strip()}"
    full_prompt += "\n\nWrite only the email body — no subject line, no extra commentary."
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": full_prompt}],
    )
    log_claude(message, "custom draft")
    return {"body": message.content[0].text.strip()}


def generate_batch(contacts: list[dict], templates: dict, settings: dict) -> list[dict]:
    results = []
    for contact in contacts:
        try:
            result = generate_email(contact, templates, settings)
            results.append({"id": contact["id"], "success": True, **result})
        except Exception as e:
            results.append({"id": contact["id"], "success": False, "error": str(e)})
    return results
