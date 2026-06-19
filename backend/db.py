import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Service role client — bypasses RLS, backend use only
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

DEFAULT_TEMPLATES = [
    {
        "tier": "analyst_associate",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nBest,\nGilbert\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "professional but warm",
        "max_words": 100,
    },
    {
        "tier": "vp",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nBest,\nGilbert\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "professional and brief",
        "max_words": 100,
    },
    {
        "tier": "md_partner",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nBest,\nGilbert\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "concise and respectful",
        "max_words": 100,
    },
    {
        "tier": "n_a",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nBest,\nGilbert\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "professional but warm",
        "max_words": 100,
    },
]


def ensure_user_defaults(user_id: str):
    """Create default settings and templates for a new user if they don't exist."""
    existing = supabase.table("settings").select("id").eq("user_id", user_id).execute()
    if not existing.data:
        supabase.table("settings").insert({"user_id": user_id}).execute()

    for tmpl in DEFAULT_TEMPLATES:
        existing_tmpl = supabase.table("templates").select("id").eq("user_id", user_id).eq("tier", tmpl["tier"]).execute()
        if not existing_tmpl.data:
            supabase.table("templates").insert({"user_id": user_id, **tmpl}).execute()
