import anthropic
import os
from dotenv import load_dotenv

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
    return {"subject": template["subject"], "body": message.content[0].text.strip()}


def generate_batch(contacts: list[dict], templates: dict, settings: dict) -> list[dict]:
    results = []
    for contact in contacts:
        try:
            result = generate_email(contact, templates, settings)
            results.append({"id": contact["id"], "success": True, **result})
        except Exception as e:
            results.append({"id": contact["id"], "success": False, "error": str(e)})
    return results
