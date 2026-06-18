import anthropic
import os
from dotenv import load_dotenv
from contacts import load_data

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))


def build_prompt(contact: dict, template: dict, settings: dict) -> str:
    first_name = contact["name"].strip().split()[0]
    availability = settings.get("availability", "").strip()
    availability_line = f"\n\nI am generally available {availability}." if availability else ""
    return template["prompt"].format(
        name=first_name,
        firm=contact["firm"],
        availability_line=availability_line,
    )


def build_subject(template: dict) -> str:
    return template["subject"]


def generate_email(contact: dict, templates: dict, settings: dict = None) -> dict:
    if settings is None:
        settings = load_data().get("settings", {})
    tier = contact.get("tier", "analyst_associate")
    template = templates.get(tier, templates["analyst_associate"])
    prompt = build_prompt(contact, template, settings)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )

    body = message.content[0].text.strip()
    subject = build_subject(template)
    return {"subject": subject, "body": body}


def generate_batch(contacts: list[dict], templates: dict, settings: dict = None) -> list[dict]:
    if settings is None:
        settings = load_data().get("settings", {})
    results = []
    for contact in contacts:
        try:
            result = generate_email(contact, templates, settings)
            results.append({"id": contact["id"], "success": True, **result})
        except Exception as e:
            results.append({"id": contact["id"], "success": False, "error": str(e)})
    return results
