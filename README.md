# Recruiting Bot

A personal cold email outreach tool built for IB/finance recruiting. Automates email personalization via Claude AI and sends through Gmail API. Built to be shared with the University of Oregon Investment Group.

---

## Who This Is For

Built by Gilbert Knight, freshman at University of Oregon (Mathematics & Finance). Goal: aggressive networking outreach this summer (June–August 2026) before IB interviews open in fall/winter. Target is 30–50 emails/day to analysts, associates, VPs, and MDs at target banks.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (email/password, invite-only capable) |
| AI | Claude API (claude-sonnet-4-6) |
| Email | Gmail API (OAuth per user) |

---

## Project Structure

```
Recruiting Bot/
├── backend/
│   ├── main.py          # FastAPI routes (all auth-protected)
│   ├── auth.py          # JWT middleware, admin check
│   ├── db.py            # Supabase client, user default seeding
│   ├── contacts.py      # All contact/settings/template DB operations
│   ├── email_gen.py     # Claude API email generation
│   ├── gmail.py         # Gmail OAuth flow, send, reply scanning
│   ├── credentials.json # Google OAuth app credentials (NOT in git)
│   ├── .env             # API keys (NOT in git)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx    # Stats, pipeline, reply scan
│   │   │   ├── Contacts.jsx     # Contact table, add/edit, generate, send
│   │   │   ├── EmailStudio.jsx  # AI prompt editor per tier
│   │   │   ├── Settings.jsx     # Gmail connect, daily cap, profile
│   │   │   ├── Login.jsx        # Sign in / sign up
│   │   │   └── Admin.jsx        # Invite users (admin only)
│   │   ├── components/
│   │   │   ├── AddContactModal.jsx
│   │   │   ├── EmailPreview.jsx
│   │   │   ├── TierBadge.jsx
│   │   │   └── StatusBadge.jsx
│   │   ├── context/AuthContext.jsx
│   │   ├── api/client.js        # Axios wrapper with Supabase auth headers
│   │   └── lib/supabase.js      # Supabase client
│   ├── .env             # Supabase keys (NOT in git)
│   └── .env.example
└── start.bat            # Starts both servers + opens browser
```

---

## Supabase Schema

Four tables, all row-level security enabled (users only see their own data):

- **contacts** — all contact info, status, generated emails, sent timestamps, gmail thread IDs
- **templates** — AI prompts per tier (analyst_associate, vp, md_partner, n_a)
- **settings** — daily cap, sender name/school, availability, resume path, send counts
- **gmail_tokens** — per-user Gmail OAuth tokens

---

## Tier System

Auto-detected from job title, manually overridable:

| Tier | Auto-send | Review required |
|---|---|---|
| Analyst / Associate | Yes | Optional |
| VP / Director | After review | Yes |
| MD / Partner | Never | Yes — user sends manually |
| N/A | Yes | Optional |

---

## Contact Pipeline

`Cold → Contacted → Replied → Warm → Meeting Scheduled → Closed`

Reply scanning auto-updates status by checking Gmail thread for new messages.

---

## Email Format

Emails follow a strict 5-paragraph structure (not one block of text):

1. Greeting (first name only)
2. Intro — name, school, major
3. Reason for reaching out — learn about their path at [firm], ask for 15-min chat
4. Attachments mention (resume + OIG report)
5. Sign-off

Subject line: `UOregon Freshman - Gilbert Knight`

Templates are fully editable per tier in Email Studio. The `{name}`, `{firm}`, and `{availability_line}` variables are injected at generation time.

---

## Rate Limiting

- Default: 50 emails/day, 10/minute
- Gmail free tier cap: 500/day
- Recommended max: 50–75/day to avoid spam flags

---

## Setup (New Machine)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Git

### Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (copy from `.env.example` and fill in):
```
CLAUDE_API_KEY=sk-ant-...
SUPABASE_URL=https://nwxqvvizerqtqxslyjsw.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
ADMIN_EMAIL=gilbert.knight@gmail.com
GMAIL_REDIRECT_URI=http://localhost:8000/gmail/callback
```

Copy `credentials.json` (Google OAuth app credentials) into `backend/`. Get this from the original machine or Google Cloud Console.

### Frontend
```powershell
cd frontend
npm install
```

Create `frontend/.env` (copy from `.env.example` and fill in):
```
VITE_SUPABASE_URL=https://nwxqvvizerqtqxslyjsw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:8000
VITE_ADMIN_EMAIL=gilbert.knight@gmail.com
```

### Run
Double-click `start.bat` — opens backend, frontend, and browser automatically.

---

## Gmail Setup (Per User)

1. Log in to the app
2. Go to Settings → click **Connect Gmail**
3. Authorize with your Gmail account
4. Token is stored in Supabase — no local file needed

---

## Git Workflow

- `main` — stable, tested checkpoint
- `dev` — active development branch

Always work on `dev`, merge to `main` when stable:
```powershell
git checkout dev
# make changes, commit
git checkout main
git merge dev
git push
```

---

## Keys & Credentials Reference

| Secret | Where it lives | Notes |
|---|---|---|
| `CLAUDE_API_KEY` | `backend/.env` | Anthropic console |
| `SUPABASE_SERVICE_KEY` | `backend/.env` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | `backend/.env` + `frontend/.env` | Supabase → Settings → API |
| `credentials.json` | `backend/` | Google Cloud Console → OAuth credentials |
| Gmail token | Supabase `gmail_tokens` table | Created automatically on first Gmail connect |

None of these are in git. Never commit them.

---

## Current Status (as of June 2026)

- [x] Full contact management (add, edit, delete, CSV bulk import)
- [x] Claude AI email generation per contact
- [x] Gmail send with rate limiting and daily cap
- [x] Auto-label sent emails in Gmail under Recruiting/{Firm}
- [x] Reply scanning — auto-updates status when contact replies
- [x] Follow-up due dates (7 days after send)
- [x] Supabase auth + multi-user support
- [x] Per-user Gmail OAuth
- [x] Invite-only signup capability
- [x] Dashboard with pipeline stats

## Planned (not built yet)
- [ ] Deploy to Vercel + Railway (free tier)
- [ ] Apollo API integration for contact sourcing
- [ ] Automated follow-up emails
- [ ] Reply sentiment analysis
- [ ] Kanban pipeline view
- [ ] Schedule send
- [ ] A/B template testing
