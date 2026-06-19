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


def append_signature(body: str, settings: dict) -> str:
    sig = settings.get("signature", "").strip()
    if not sig:
        return body
    # Both may be HTML or plain text — use HR separator
    sep = '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">'
    return f"{body}{sep}{sig}"


def generate_email(contact: dict, templates: dict, settings: dict) -> dict:
    tier = contact.get("tier", "analyst_associate")
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
