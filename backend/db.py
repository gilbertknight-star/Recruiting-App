import os
from dotenv import load_dotenv

load_dotenv()

DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if DEV_MODE:
    supabase = None
else:
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

DEFAULT_TEMPLATES = [
    {
        "tier": "analyst_associate",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "professional but warm",
        "max_words": 100,
    },
    {
        "tier": "vp",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "professional and brief",
        "max_words": 100,
    },
    {
        "tier": "md_partner",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "concise and respectful",
        "max_words": 100,
    },
    {
        "tier": "n_a",
        "prompt": "Write a cold networking email from Gilbert Knight. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI'm reaching out because I'm hoping to learn more about your path and your experience at {firm}. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect for a brief chat and hear your perspective.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "UOregon Freshman - Gilbert Knight",
        "tone": "professional but warm",
        "max_words": 100,
    },
    {
        "tier": "uoig_alum",
        "prompt": "Write a warm networking email from Gilbert Knight to a University of Oregon Investment Group (UOIG) alumnus. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon — I'm currently a Senior Analyst at the Oregon Investment Group.\n\nI came across your profile and wanted to reach out as a fellow UOIG member. I'd love to hear about your experience at {firm} and any advice you might have for someone earlier in their career. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "Fellow UOIG Member - Gilbert Knight",
        "tone": "warm and collegial",
        "max_words": 120,
    },
    {
        "tier": "uo_alum",
        "prompt": "Write a warm networking email from Gilbert Knight to a University of Oregon alumnus. Output ONLY the email body, exactly in this format with blank lines between each paragraph:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a freshman at the University of Oregon studying Mathematics and Finance.\n\nI came across your profile and as a fellow Duck I wanted to reach out. I'd love to hear about your experience at {firm} and any advice you might have. If you have a few minutes in the coming weeks, I'd really appreciate the chance to connect.\n\nI have attached my resume and a recent report for the Oregon Investment Group.{availability_line}\n\nDo not add any other sentences, do not change the structure, do not add a subject line. Only personalize by using the correct name and firm.",
        "subject": "Fellow Duck - Gilbert Knight",
        "tone": "warm and collegial",
        "max_words": 120,
    },
    # Follow-ups. Sent as replies in the original Gmail thread when there is one, so the subject
    # below is only used when there's no earlier email to reply to.
    # Client side: someone at a company a bank advised on a recent deal
    {
        "tier": "client_referral",
        "prompt": "Write a cold networking email from Gilbert Knight to {name}, {title} at {firm}. {firm} recently worked with {bank}: {deal} Output ONLY the email body with blank lines between paragraphs:\n\nHello {name},\n\nMy name is Gilbert Knight, and I'm a student at the University of Oregon studying Mathematics and Finance and a member of the University of Oregon Investment Group.\n\nOne or two sentences: congratulate them on the deal, and say he's recruiting for investment banking and would love to hear what working with {bank} was like from the company's side, and any advice they have.\n\nAsk whether they'd have 15 minutes for a brief call in the coming weeks.\n\nBest,\nGilbert\n\nKeep it under 120 words. Do not ask for a referral or an introduction. Do not add a subject line.",
        "subject": "UO student - your work with {bank}",
        "tone": "respectful and concise",
        "max_words": 120,
    },
    # Client-side follow-ups: the reconnect is where the referral ask belongs
    {
        "tier": "client_followup_cold",
        "prompt": "Write a short, polite follow-up email from Gilbert Knight to {name}, {title} at {firm}. He emailed {days_since} days ago about {firm}'s recent work with {bank} ({deal}) and hasn't heard back; this is follow-up number {followup_number}. Output ONLY the email body with blank lines between paragraphs:\n\nHello {name},\n\nOne or two friendly sentences bumping his earlier note: he'd still value hearing about the deal and working with {bank} from the company's side, even in a quick 15-minute call.\n\nBest,\nGilbert\n\nDo not apologize repeatedly, do not guilt-trip, do not mention scheduling flexibility, do not ask for a referral, and do not add a subject line.",
        "subject": "Following up - Gilbert Knight",
        "tone": "polite and brief",
        "max_words": 70,
    },
    {
        "tier": "client_followup_warm",
        "prompt": "Write a warm follow-up email from Gilbert Knight to {name}, {title} at {firm}, whom he has already spoken with about {firm}'s work with {bank} ({deal}). {notes_line} Output ONLY the email body with blank lines between paragraphs:\n\nHello {name},\n\nThank them again for their time and perspective on the deal, mentioning something specific from the notes if there is anything.\n\nA one-sentence update on his investment banking recruiting.\n\nAsk, politely and without pressure, whether there's anyone on the {bank} team they'd suggest he speak with, and say he'd be grateful for an introduction if they're comfortable making one.\n\nBest,\nGilbert\n\nKeep it under 120 words. Do not add a subject line.",
        "subject": "Thank you - Gilbert Knight",
        "tone": "warm and appreciative",
        "max_words": 120,
    },
    {
        "tier": "followup_cold",
        "prompt": "Write a short, polite follow-up email from Gilbert Knight to {name} at {firm}. They haven't replied to his networking email from {days_since} days ago; this is follow-up number {followup_number}. Output ONLY the email body with blank lines between paragraphs:\n\nHello {name},\n\nOne or two friendly sentences bumping his earlier note, saying he'd still love to hear about their path and experience at {firm} and would be grateful for even 15 minutes.\n\nBest,\nGilbert\n\nDo not apologize repeatedly, do not guilt-trip, do not mention scheduling flexibility, do not add a subject line, and word it differently from a generic template.",
        "subject": "Following up - Gilbert Knight",
        "tone": "polite and brief",
        "max_words": 70,
    },
    {
        "tier": "followup_warm",
        "prompt": "Write a warm reconnect email from Gilbert Knight to {name} at {firm}, whom he has already spoken with. {notes_line} Output ONLY the email body with blank lines between paragraphs:\n\nHello {name},\n\nThank them again for taking the time to chat, mentioning something specific from the notes if there is anything.\n\nA one-sentence update on what Gilbert has been working on in recruiting and the University of Oregon Investment Group.\n\nAsk whether they'd be open to catching up briefly again in the coming weeks.\n\nBest,\nGilbert\n\nDo not add a subject line.",
        "subject": "Checking in - Gilbert Knight",
        "tone": "warm and appreciative",
        "max_words": 120,
    },
]


def ensure_user_defaults(user_id: str):
    if DEV_MODE:
        return
    existing = supabase.table("settings").select("id").eq("user_id", user_id).execute()
    if not existing.data:
        supabase.table("settings").insert({"user_id": user_id}).execute()

    for tmpl in DEFAULT_TEMPLATES:
        existing_tmpl = supabase.table("templates").select("id").eq("user_id", user_id).eq("tier", tmpl["tier"]).execute()
        if not existing_tmpl.data:
            supabase.table("templates").insert({"user_id": user_id, **tmpl}).execute()
