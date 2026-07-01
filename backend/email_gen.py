import anthropic
import os
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))


def build_prompt(contact: dict, template: dict, settings: dict) -> str:
    first_name = contact["name"].strip().split()[0]

    availability = settings.get("availability", "").strip()
    availability_line = f"I am generally available {availability}." if availability else ""

    school = contact.get("school", "").strip()
    school_line = f"I am a student at {school}." if school else ""

    notes = contact.get("notes", "").strip()
    notes_line = notes if notes else ""

    location = contact.get("location", "").strip()
    location_line = f"They are based in {location}." if location else ""

    return template["prompt"].format(
        name=first_name,
        firm=contact["firm"],
        title=contact.get("title", "").strip(),
        school_line=school_line,
        notes_line=notes_line,
        availability_line=availability_line,
        location_line=location_line,
    )


def _plain_to_html(text: str) -> str:
    paragraphs = text.strip().split('\n\n')
    return ''.join(f'<p style="margin:0 0 12px 0">{p.replace(chr(10), "<br>")}</p>' for p in paragraphs)


def append_signature(body: str, settings: dict) -> str:
    sig = settings.get("signature", "").strip()
    linkedin_url = settings.get("linkedin_url", "").strip()
    if sig and linkedin_url:
        import re
        sig = re.sub(
            r'href="https?://(?:www\.)?linkedin\.com/in/[^"]*"',
            f'href="{linkedin_url}"',
            sig,
        )
    if not body.strip().startswith('<'):
        body = _plain_to_html(body)
    sep = '<p style="margin:16px 0 4px 0;color:#666">--</p>'
    content = f"{body}{sep}{sig}" if sig else body
    return f'<div style="font-family:sans-serif;font-size:14px;line-height:1.6">{content}</div>'


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
    body = append_signature(message.content[0].text.strip(), settings)
    return {"subject": template["subject"], "body": body}


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
