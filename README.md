# AI Account Intelligence & Next-Best-Action Engine

A full-stack B2B account-intelligence product. It turns raw customer signals into an explainable account score, shows **what changed and why**, identifies **who to contact**, recommends a **deterministic next best action**, and uses an LLM (via OpenRouter) to **interpret the evidence and draft personalized outreach**.

```
Signals → Score → What Changed? → Why Does It Matter? → Who Should I Contact? → What Should I Do? → What Should I Say?
```

---

## 1. Project overview

| Layer | What it does |
|---|---|
| **Dashboard** | Summary cards (total / high / medium / low), an account table with score, score change, priority, latest buying signal and recommended action. Filter by priority; sort by score, score change or recent activity. |
| **Account intelligence page** | Score gauge and priority, **What Changed?** (yesterday vs today with per-signal attribution), score breakdown, score history, activity trend, chronological timeline, ranked contacts and personas, likely product interest, next best action, and the **AI Account Analyst**. |
| **Backend** | FastAPI, SQLAlchemy and SQLite. A deterministic scoring engine, change attribution, persona mapping, product-interest inference, a next-best-action rules engine, and a grounded AI analyst with full failure handling. |

## 2. Business problem

Sales teams have more accounts than time. Intent data, web activity, email engagement and firmographic triggers are scattered, and reps can't tell which accounts are heating up *right now*, why, or what to do about it. Black-box "AI scores" aren't trusted because nobody can explain them.

This product answers one question with evidence:

> Which account should we focus on right now, why is it important, what changed recently, who should we contact, and what should we do and say next?

## 3. Product workflow

```
Account data ─► Activity / signals ─► Deterministic score (fit + intent + engagement + recency)
   ─► Priority (HIGH / MEDIUM / LOW) ─► What changed? (exact per-signal attribution)
   ─► Why it matters (deterministic narrative) ─► Relevant persona (ranked contacts)
   ─► Likely product interest ─► AI analysis (interpretation only)
   ─► Next best action (rules engine) ─► Personalized outreach (AI draft)
```

**Design principle:** numbers and decisions are deterministic and explainable. The AI only *interprets* and *personalizes*. If the AI is down, every other feature keeps working.

## 4. Architecture

```
┌──────────────── React + Vite + TS (port 5173) ───────────────┐
│ pages/ DashboardPage, AccountDetailPage                       │
│ components/ table, cards, Recharts charts, timeline, AI panel │
│ services/api.ts ── fetch("/api/...") ── Vite dev proxy ──┐    │
└──────────────────────────────────────────────────────────┼────┘
                                                           ▼
┌──────────────── FastAPI (port 8000) ─────────────────────────┐
│ routes/accounts.py       REST endpoints + Pydantic schemas   │
│ services/scoring.py      pure deterministic scoring engine   │
│ services/changes.py      "What changed?" attribution         │
│ services/personas.py     title → persona, contact ranking    │
│ services/product_interest.py  product inference from signals │
│ services/recommendations.py   next-best-action rules engine  │
│ services/intelligence.py      assembles all of the above     │
│ services/ai_analyst.py   OpenRouter client, grounding, parse │
│ models/ (SQLAlchemy)  →  SQLite (account_intel.db)           │
└──────────────────────────────────────────────┬───────────────┘
                                               ▼ server-side only
                                  OpenRouter  (model: openrouter/free)
```

The OpenRouter key exists only in the backend process. The React app never calls OpenRouter.

```
project/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app, CORS, health
│   │   ├── config.py          env settings + ICP definition
│   │   ├── database/          engine, session, init
│   │   ├── models/            Account, Contact, Activity, AccountScore
│   │   ├── schemas/           Pydantic request/response models (camelCase JSON)
│   │   ├── routes/            REST endpoints
│   │   ├── services/          scoring, changes, personas, product interest,
│   │   │                      recommendations, intelligence, AI analyst
│   │   ├── tests/             pytest suite (113 tests)
│   │   └── seed.py            demo dataset
│   └── requirements.txt
├── frontend/
│   └── src/{components,pages,services,types,hooks,styles}
├── .env.example
└── README.md
```

## 5. Tech stack

- **Frontend:** React 18, Vite 5, TypeScript, plain CSS (light and dark themes), Recharts
- **Backend:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2
- **Database:** SQLite
- **AI:** OpenRouter chat completions, model `openrouter/free` (configurable)

## 6. Database model

| Table | Columns |
|---|---|
| `accounts` | `id, name, industry, employee_count, website, target_industry, created_at` |
| `contacts` | `id, account_id, name, job_title, persona, email` |
| `activities` | `id, account_id, activity_type, timestamp, metadata (JSON), dedupe_key` with a **unique `(account_id, dedupe_key)`** constraint |
| `account_scores` | `id, account_id, fit_score, intent_score, engagement_score, recency_score, total_score, calculated_at`: historical snapshots |

- `target_industry` is a boolean ICP flag. If it's null, the engine derives it from the ICP industry list.
- `dedupe_key` is a hash of type, timestamp and metadata, so exact duplicates cannot be stored twice.
- A new score snapshot is written whenever the live score differs from the latest snapshot: on seed, on activity ingestion, and on read. This keeps a full score history.

Supported activity types: `WEBSITE_VISIT, PRODUCT_PAGE_VIEW, PRICING_PAGE_VIEW, CONTENT_DOWNLOAD, EMAIL_OPEN, EMAIL_CLICK, DEMO_REQUEST, DECISION_MAKER_ENGAGEMENT, COMPANY_EXPANSION, HIRING_ACTIVITY`.

## 7. Scoring logic

`Total (0–100) = Fit (0–30) + Intent (0–30) + Engagement (0–20) + Recency (0–20)`. Every component is clamped, and the total is clamped to `0 ≤ score ≤ 100`.

**Fit (max 30).** Ideal customer profile: industries Technology, Financial Services, Healthcare, Manufacturing; size 200–5,000 employees.
- Target industry → +15
- Target company size → +15

**Intent (max 30).** Counted within a rolling 30-day window. Each type has a per-type cap so repeated activity can't dominate.

| Signal | Points | Max counted |
|---|---|---|
| DEMO_REQUEST | 15 | 1 |
| PRICING_PAGE_VIEW | 8 | 2 |
| PRODUCT_PAGE_VIEW | 4 | 3 |
| CONTENT_DOWNLOAD | 3 | 3 |
| HIRING_ACTIVITY *(trigger)* | 5 | 1 |
| COMPANY_EXPANSION *(trigger)* | 5 | 1 |

Hiring and expansion are company trigger events that signal a buying window, so they count as intent.

**Engagement (max 20).** Same 30-day window.

| Signal | Points | Max counted |
|---|---|---|
| EMAIL_OPEN | 2 | 3 |
| EMAIL_CLICK | 4 | 2 |
| CONTENT_DOWNLOAD | 3 | 3 |
| DECISION_MAKER_ENGAGEMENT | 8 | 2 |
| WEBSITE_VISIT | 1 | 5 |

**Recency (max 20).** Based on the most recent *meaningful* activity, calculated from real timestamps. Email opens are excluded because privacy proxies and bots make them unreliable.

| Most recent activity | Points |
|---|---|
| ≤ 24 hours | 20 |
| ≤ 3 days | 15 |
| ≤ 7 days | 10 |
| ≤ 14 days | 5 |
| older | 0 |

**Priority:** 80–100 → HIGH, 50–79 → MEDIUM, 0–49 → LOW.

**What changed.** The current score is compared with the latest snapshot taken at least 24 hours earlier. The delta is attributed exactly:
- new activities are replayed in chronological order, and each one gets its *marginal* intent + engagement points (cap effects shown as "Worth +8 normally; limited by score caps")
- plus recency delta, fit delta, signals that aged out of the window, and any residual
- the drivers always sum to the real delta

The narrative ("The account became significantly more active, with new buying signals (intent up from 0 to 16)…") is generated deterministically from stored data.

**Personas.** Job titles map to personas with ordered rules. Examples: VP Engineering, CTO, CISO, CIO and Head of Data → *Technical Evaluator*; CFO → *Economic Buyer*; CEO and COO → *Executive Sponsor*; Procurement Manager → *Procurement*; other managers and directors → *Influencer*. Contacts are ranked by persona weight, with a large boost for contacts who appear in recent activity metadata (i.e. they actually engaged).

**Product interest.** Weighted evidence per product (Cloud Integration, Cybersecurity, Data Analytics) comes from activity metadata: an explicit `product` field, or keyword matches in pages, titles and campaigns, weighted by signal strength. Below the evidence threshold, or on a tie, the result is **"Insufficient signals"**. Nothing is guessed.

**Next best action** (first matching rule wins):
1. No activity in the 30-day window → `MONITOR_ACCOUNT`
2. Demo request in the window → `SCHEDULE_DEMO` (with the actual requester if known)
3. HIGH priority and intent ≥ 15 and a decision-maker exists → `CONTACT_DECISION_MAKER` (e.g. "Contact VP Engineering")
   - no decision-maker → `SEND_PERSONALIZED_EMAIL` to the best available contact, noting "No decision-maker persona identified."
4. HIGH or MEDIUM with engagement ≥ 6 or intent ≥ 8 → `SEND_PERSONALIZED_EMAIL`
5. A single weak signal → `MONITOR_ACCOUNT`; otherwise → `NURTURE_ACCOUNT`

## 8. AI architecture

`POST /api/accounts/{id}/analyze` builds a structured, factual payload:

```json
{ "account": {}, "score": {}, "recentActivities": [], "contacts": [],
  "likelyProduct": "", "scoreChange": {}, "deterministicNextAction": {} }
```

It sends the payload to OpenRouter (`OPENROUTER_MODEL`, default `openrouter/free`) and expects this JSON back:

```json
{ "summary": "", "whyImportant": "", "likelyNeed": "", "recommendedPersona": "",
  "nextBestAction": "", "reasonForAction": "", "personalizedMessage": "" }
```

**Grounding**
- The system prompt forbids inventing people, activities, company facts, product usage, pricing, previous conversations, outcomes or requirements.
- The model must write "Insufficient evidence from available account signals." when the data doesn't support a field.
- The score and deterministic action are passed in as fixed facts.
- A post-validation guard prevents a named persona when the account has no contacts.
- The UI labels all output **"AI-generated analysis"** and shows the deterministic recommendation separately.

**Robust parsing.** The parser handles code fences, surrounding prose, `<think>` blocks and snake_case keys. Missing optional fields are filled with the insufficient-evidence sentence. Missing required fields count as malformed output.

**Failure handling.** Missing key, auth errors, 402 credits, 429 rate limits, 5xx, timeouts, network errors, empty output, invalid shape and malformed JSON all return HTTP 200 with `status: "unavailable"`, an `errorCode`, and the deterministic next action. Transient errors are retried once. The UI then shows:

> **AI analysis is currently unavailable.** Account scoring and deterministic recommendations are still available.

TLS verification uses the operating system's trust store (via `truststore`), so it works behind corporate proxies or with OS-installed root CAs without disabling verification.

## 9. Edge-case handling

| Case | Behavior |
|---|---|
| No activities | Recency 0, `MONITOR_ACCOUNT`, "No meaningful activity detected. Insufficient signals to determine buying intent." |
| Old activities | More than 14 days old → 0 recency. More than 30 days → excluded from intent and engagement, and marked "no longer scored" on the timeline. |
| Repeated activities | Per-type counting caps plus component caps. The score can never exceed 100. |
| Duplicate activities | DB unique constraint on the dedupe key, the API returns **409**, and the scoring engine dedupes defensively. The seed deliberately inserts 3 duplicates, which are skipped. |
| Future timestamps | Excluded from scoring (5-minute clock-skew tolerance), never boost recency, flagged ⚠ on the timeline, and shown in a page-level notice. |
| No contacts | "No relevant contact identified." No contact is invented, and the AI persona is constrained. |
| No decision-maker | "No decision-maker persona identified." An alternative action goes to the best available contact. |
| No product signals | "Likely product interest: Insufficient signals". |
| Missing optional fields | Missing website, employee count, industry, job title or metadata render as "unknown" and score 0 for that rule. |
| Invalid account ID | HTTP **404** from every endpoint, and a friendly "Account not found" page. |
| Empty database | "No accounts available." empty state with seeding instructions. |
| Score boundaries | Every component is clamped, and `0 ≤ total ≤ 100` is enforced and tested. |
| AI failure or malformed response | Fallback message. All deterministic intelligence keeps working. |

## 10. Setup instructions

Prerequisites: **Python 3.11+** and **Node 18+**.

```bash
# from the project root
cp .env.example .env          # then put your OpenRouter key in .env
```

**Backend**
```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate      macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed            # creates the SQLite DB and loads the demo dataset
```

**Frontend**
```bash
cd frontend
npm install
```

## 11. Environment variables

| Variable | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | – | Server-side only. Without it, the AI panel shows the fallback. |
| `OPENROUTER_MODEL` | `openrouter/free` | Any OpenRouter model id. |
| `OPENROUTER_TIMEOUT_SECONDS` | `45` | Per attempt. |
| `DATABASE_URL` | `sqlite:///backend/account_intel.db` | |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | |

Variables are read from the real environment first, then `./.env`, then `backend/.env`. `.env` is git-ignored.

## 12. Running the backend

```bash
cd backend
uvicorn app.main:app --port 8000        # API docs at http://localhost:8000/docs
```

**Endpoints**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/accounts?priority=ALL\|HIGH\|MEDIUM\|LOW&sort=score\|score_change\|recent_activity&order=desc` | Account list and summary counts |
| GET | `/api/accounts/{id}` | Account, current score, score change |
| GET | `/api/accounts/{id}/activities` | Raw activities (newest first) |
| POST | `/api/accounts/{id}/activities` | Ingest a signal (201; **409** on exact duplicate; 422 on invalid type) |
| GET | `/api/accounts/{id}/score` | Breakdown, explanations, history, data-quality flags |
| GET | `/api/accounts/{id}/timeline` | Described timeline, with excluded items flagged |
| GET | `/api/accounts/{id}/contacts` | Ranked contacts and personas |
| GET | `/api/accounts/{id}/intelligence` | Everything the detail page needs |
| POST | `/api/accounts/{id}/next-action` | Deterministic next best action |
| POST | `/api/accounts/{id}/analyze` | AI analysis (or structured fallback) |
| GET | `/api/health` | Status and whether AI is configured (never the key) |

## 13. Running the frontend

```bash
cd frontend
npm run dev          # http://localhost:5173 (proxies /api → :8000)
npm run build        # type-check + production build
```

## 14. Running tests

```bash
cd backend
python -m pytest -q
```

113 tests cover:
- **Scoring:** each component, caps, recency bands and boundaries, total, priority thresholds, and the 61 → 86 hero progression
- **Edge cases:** none, old, repeated, future and duplicate activities (engine and DB); no contacts; no decision-maker; missing data; product inference
- **Recommendations:** every action path
- **AI:** missing key, timeout, rate limit, provider/auth/network errors, HTTP status mapping, malformed/empty/unexpected output, successful parse, payload shape, grounding guard
- **API:** every endpoint, filters, sorting, 404s, 409s, empty DB, snapshot history

Tests use an isolated temporary database and never call the real OpenRouter API.

## 15. Demo flow

> Re-run `python -m app.seed` shortly before a demo. All timestamps are relative to seed time, so "today" and "yesterday" stay accurate.

1. Open **http://localhost:5173**. The **Overview** page explains the product: a live pipeline walkthrough, an interactive score simulator (try *Acme · yesterday* → *Acme · today* to reproduce 61 → 86), design principles, architecture and edge cases.
2. Click **Open live dashboard** (or go to `/accounts`). The dashboard shows 15 accounts: 5 High, 4 Medium, 6 Low.
2. Sort by **Score change**. **Acme Technologies** comes first with **↑ +25**.
3. Open Acme: **86 / 100**, **HIGH PRIORITY**, **↑ +25 since yesterday**.
4. **What changed?**: Yesterday **61** → Today **86**, driven by
   - +8 Pricing page visit
   - +6 Technical document download
   - +6 VP Engineering engagement
   - +5 Hiring activity
5. Review the **timeline**, newest first.
6. **Who should I contact?**: **Sarah Chen, VP Engineering**, *Technical Evaluator*, decision-maker, engaged recently.
7. **Likely product interest**: **Cloud Integration** (high confidence), with evidence.
8. **Next best action**: **Contact VP Engineering**, with reasons.
9. Click **Analyze Account**. You'll see "Analyzing account…", then an AI summary, why the account matters, the likely need, the recommended persona and action, and a **personalized outreach message**, all labeled *AI-generated analysis*.

Edge cases to show in the demo:

| Account | Scenario |
|---|---|
| Northwind | demo request → Schedule demo |
| Helix | strong decision-maker engagement |
| Stratus | repeated activity, capped |
| Cobalt | no contacts |
| BlueRiver | no decision-maker |
| Trident | triggers only, no product signal |
| Pinnacle | old activity |
| Evergreen | missing fields |
| Lumen | no activity |
| Keystone | insufficient activity |
| Nimbus | future-dated activity |

Also try `/accounts/9999` to see the 404 page.

## 16. Future improvements

- Real signal ingestion: webhooks from marketing automation, CRM and intent providers, plus identity resolution from contact to account
- Configurable ICP and scoring weights per team, with backtesting against won and lost deals
- Time-decayed signal weights instead of step windows; per-persona engagement weighting
- Buying-committee coverage metrics and multi-threading recommendations
- Caching and streaming AI responses; storing analyses with feedback (👍/👎) for evaluation
- CRM write-back (tasks, sequences), Slack alerts on large score jumps
- Authentication, multi-tenant data isolation, Postgres, Alembic migrations
