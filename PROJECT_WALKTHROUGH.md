# Project Walkthrough — How to Explain This Project

Use this as your talk track for a demo, interview, or presentation.

---

## 1. The one-sentence pitch

> "It's an AI-powered account intelligence tool for B2B sales. It turns raw
> customer activity — website visits, emails, demo requests, hiring signals —
> into an explainable 0–100 account score, shows the rep exactly what changed
> and why, who to contact, and what to do next. The score and recommendations
> are rule-based and fully explainable; AI is only used to write the
> human-facing summary and a personalized outreach message."

## 2. The problem it solves

Sales reps cover dozens or hundreds of accounts and can't manually track who's
"heating up." Most "AI lead scoring" tools are black boxes — a number appears
with no explanation, so reps don't trust it and don't act on it.

This product answers one question with **evidence, not a black box**:

> "Which account should I focus on right now, why does it matter, what
> changed, who do I contact, and what do I say?"

## 3. The end-to-end workflow

```
Account data (firmographics)
        ↓
Activity signals (website visits, emails, demo requests, hiring, etc.)
        ↓
Deterministic score = Fit + Intent + Engagement + Recency   (0–100, rule-based)
        ↓
Priority = HIGH / MEDIUM / LOW
        ↓
"What Changed?" — exact point-by-point attribution vs. yesterday's score
        ↓
"Why does it matter?" — plain-English explanation generated from real signals
        ↓
Relevant persona — who on the buying committee is engaged (ranked contacts)
        ↓
Likely product interest — inferred from the content of their activity
        ↓
Next Best Action — rule-based recommendation (contact, email, demo, nurture, monitor)
        ↓
AI Account Analyst — an LLM (via OpenRouter) interprets all of the above
        ↓
Personalized outreach message — ready to send, grounded only in real data
```

**The key design principle to say out loud:** the *score* and the *core next
action* are 100% deterministic (plain Python rules) — never invented by AI.
The AI only *interprets and writes*, and it's explicitly instructed to never
invent people, activities, or facts. If the AI is down, the entire product
(score, priority, timeline, contacts, next action) keeps working — only the
AI summary/message panel shows a graceful fallback.

## 4. Architecture (for a technical audience)

```
React + Vite + TypeScript (port 5173)
   │  dashboard, account detail page, charts (Recharts)
   │  calls /api/... via a Vite dev proxy
   ▼
FastAPI + SQLAlchemy + SQLite (port 8000)
   │  scoring.py        → deterministic fit/intent/engagement/recency engine
   │  changes.py         → "What changed?" attribution
   │  personas.py         → job title → persona, contact ranking
   │  product_interest.py → infers likely product from activity content
   │  recommendations.py  → next-best-action rules engine
   │  ai_analyst.py        → OpenRouter client, grounding, JSON parsing, fallback
   ▼
OpenRouter API (model: openrouter/free) — called server-side only
   the API key never reaches the browser
```

## 5. The scoring logic (say this part slowly — it's the credibility part)

```
Total Score (0–100) = Fit (0–30) + Intent (0–30) + Engagement (0–20) + Recency (0–20)
```

- **Fit (30 pts):** does the account match our ideal customer profile —
  industry (Tech, FinServ, Healthcare, Manufacturing) and company size
  (200–5,000 employees)?
- **Intent (30 pts):** buying signals like pricing page visits, demo
  requests, hiring for relevant roles — each capped so repeated activity
  can't inflate the score unfairly.
- **Engagement (20 pts):** email opens/clicks, content downloads, and
  especially engagement from a decision-maker (worth the most).
- **Recency (20 pts):** how fresh is the most *meaningful* activity — email
  opens don't count here because they're unreliable (bots, privacy proxies).

Priority bands: **80–100 = HIGH, 50–79 = MEDIUM, 0–49 = LOW.**

## 6. Live demo script (5 minutes)

1. **Open the dashboard.** Point at the "Focus now" spotlight banner —
   *"the system already tells me who to look at first."*
2. **Point at the summary cards** — 15 accounts, 5 high priority.
3. **Click on Acme Technologies** (the hero account, score 86, +25 since
   yesterday).
4. **Show "What Changed?"** — *"Yesterday it was 61, today it's 86. Here's
   exactly which four signals caused that +25, with real timestamps — not a
   guess."*
5. **Scroll to "Who should I contact?"** — *"Sarah Chen, VP Engineering, is
   flagged as a Technical Evaluator and has already engaged — this isn't
   invented, it's ranked from real contact data."*
6. **Point at "Likely product interest"** — *"Cloud Integration, high
   confidence, and here's the actual evidence list."*
7. **Point at "Next Best Action"** — *"Contact VP Engineering — this came
   from a deterministic rules engine, not the AI."*
8. **Click "Analyze Account."** While it loads: *"Now I hand all of that
   evidence to an LLM and ask it to write a summary and a personalized
   outreach message — but I never let it touch the score."*
9. **Show the AI result** — summary, why it matters, the outreach message —
   labeled clearly as "AI-generated analysis."
10. **(Optional) Show a failure case** — open an account with no contacts or
    no activity (e.g. Cobalt Security Labs, Lumen Media Co) to show the
    honest empty states: *"No relevant contact identified"* /
    *"No meaningful activity detected"* — **nothing is ever invented.**

## 7. Anticipated questions and how to answer them

- **"Why not let the AI do the scoring?"** — Trust and explainability. Sales
  leaders won't act on a number they can't audit. A rules engine can be
  inspected, tested, and defended in a QBR; an LLM score can't.
- **"What happens if OpenRouter is down or rate-limited?"** — The API
  returns `status: "unavailable"` with a reason code, and the UI shows
  *"AI analysis is currently unavailable. Account scoring and deterministic
  recommendations are still available."* Nothing else on the page breaks.
- **"How do you stop the AI from making things up?"** — The system prompt
  explicitly forbids inventing people, activities, or facts; only real
  contacts from the database can be named; and a post-validation guard
  blocks a persona recommendation when there are literally no contacts on
  file.
- **"Is this real data?"** — It's a seeded demo dataset (15 realistic B2B
  accounts, ~26 contacts, ~107 activities) built to exercise every edge
  case: no activity, old activity, duplicate activity, missing fields,
  future timestamps, no decision-maker, etc.

## 8. One-line summary if you only have 10 seconds

> "Deterministic, explainable scoring tells you *who* and *why*; AI is only
> used to help you *say it well*."
