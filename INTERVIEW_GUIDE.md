# Interview Guide: AI Account Intelligence & Next-Best-Action Engine

How to use this guide:

- **Sections 1–3** are what you *say*: the plain-language explanation, the
  opening script, and how the system works end to end. Know these cold.
- **Section 4** is the live demo script.
- **Sections 5–15** are the ammunition for "why did you…" follow-ups.
- **Section 18** is a one-page cheat sheet of every number worth remembering.

---

## 1. The project in plain words

**The problem.** A B2B sales rep owns dozens or hundreds of company accounts.
Every day those companies leave small traces: someone visits the pricing
page, opens an email, downloads a whitepaper, requests a demo, or the
company posts six engineering jobs. No human can watch all of that. So reps
either chase the wrong accounts or miss the one that's ready to buy.

**What the product does.** It collects those traces ("signals") per account
and answers two questions for the rep:

1. **Which account should I focus on right now?** Every account gets a
   **0–100 score** and a **HIGH / MEDIUM / LOW priority**.
2. **What should I do next?** Every account gets a **next best action**
   (schedule a demo, contact a decision-maker, send a personalized email,
   nurture, or monitor), a **named person to contact**, and an
   **AI-written summary and outreach draft**.

On top of that, it explains itself:

- **Score breakdown:** exactly which rules produced each point.
- **What changed?** "Acme went 61 → 86 (+25) since yesterday, and here are
  the four timestamped signals that caused it."
- **Timeline:** every signal, including the ones that were ignored and why.

**The one sentence to remember:**
> *Rules decide the numbers and the action; AI only writes the words, and
> only from facts the rules already computed.*

**Who would use it:** sales reps (daily focus list), sales managers
(pipeline review: "why is this account HIGH?"), and marketing (which
campaigns create real buying intent vs. noise).

---

## 2. How to open (30–45 seconds, memorize the shape not the words)

> "I built a B2B account intelligence tool, the kind of engine behind ABM
> platforms like 6sense. Sales reps have too many accounts to track
> manually, so the product ingests behavioral signals (website visits,
> email engagement, demo requests, hiring activity) and produces three
> things for each account: an **explainable 0-to-100 score** from a
> deterministic rules engine, a **plain-English explanation of what changed
> since yesterday and why**, and a **next-best-action recommendation** like
> 'contact this VP, here's why, here's what to say.'
>
> The scoring and the action logic are pure backend rules. I deliberately
> did *not* let an LLM touch the numbers, because a sales VP won't trust a
> score they can't audit. The LLM's only job is to read that structured
> evidence and write the summary and outreach email, with hard grounding
> rules so it can't invent people or facts. If the AI provider is down,
> every other feature keeps working.
>
> It's React and TypeScript on the front, FastAPI and SQLite on the back,
> 113 backend tests, and it's deployed on Vercel and Render."

Then stop talking and let them ask questions.

---

## 3. How the system works end to end

### 3.1 Architecture

```
 Browser (React + TypeScript, Vite build)
    │  fetch /api/...            ← never sees the OpenRouter key
    ▼
 Vercel  ── serves the static site; rewrites /api/* to the backend
    │
    ▼
 Render  ── FastAPI (Python 3.12)
    │        routes/accounts.py      HTTP layer, validation (Pydantic)
    │        services/scoring.py     Fit + Intent + Engagement + Recency
    │        services/changes.py     "What changed?" attribution
    │        services/personas.py    job title → persona, contact ranking
    │        services/product_interest.py
    │        services/recommendations.py   next-best-action rules
    │        services/intelligence.py      assembles all of the above
    │        services/ai_analyst.py        OpenRouter call + grounding
    ├──► SQLite (SQLAlchemy): accounts, contacts, activities, score snapshots
    └──► OpenRouter (openrouter/free) ── only on "Analyze Account"
```

**Data model (four tables):**

| Table | Holds | Notable detail |
|---|---|---|
| `accounts` | company name, industry, employee count, website | feeds the Fit score |
| `contacts` | people at the account + job title | title → persona |
| `activities` | every signal: type, timestamp, metadata | unique `dedupe_key` blocks duplicates |
| `account_scores` | score snapshots over time | powers history and "What changed?" |

### 3.2 What happens when you open an account page

1. The browser requests `GET /api/accounts/1/intelligence`.
2. FastAPI loads the account, its contacts and its activities.
3. **Scoring** (`scoring.py`) is a pure function of (account, activities,
   now). It drops future-dated and duplicate signals, keeps the last 30
   days, applies per-type caps, and returns Fit/Intent/Engagement/Recency
   with a human-readable reason for every point.
4. **Snapshot sync:** if the live score differs from the latest stored
   snapshot, a new snapshot is written. That's how score history builds up.
5. **What changed?** (`changes.py`) finds the snapshot from at least 24h ago
   and explains the difference, driver by driver, summing exactly to the
   delta.
6. **Personas** (`personas.py`) map each contact's title to a persona and
   rank contacts, boosting anyone who personally engaged.
7. **Product interest** (`product_interest.py`) guesses the product line,
   or says "Insufficient signals" if the evidence is thin or tied.
8. **Next best action** (`recommendations.py`) walks an ordered rule list;
   the first matching rule wins.
9. Everything is returned as one JSON response (camelCase), and React
   renders the header, breakdown chart, What Changed, timeline, contacts
   and action card.

No AI has been called at this point. The whole page is deterministic.

### 3.3 What happens when you click "Analyze Account"

1. `POST /api/accounts/1/analyze`.
2. The backend builds a **structured JSON payload**: account facts, the
   score and its maximums, up to 15 scored activities, the real contacts,
   the likely product, the score change, and the *already decided* next
   action.
3. It sends that with a strict system prompt to OpenRouter. The key lives
   only in the backend's environment.
4. It parses the reply defensively, validates it with Pydantic, applies a
   post-check (for example, no contacts means no persona gets named), and
   returns it.
5. On any failure it retries once if the error is transient, then returns
   HTTP 200 with `status: "unavailable"` and the UI shows a calm fallback.
   The score and action are still on screen.

### 3.4 What happens when you log a new signal

1. `POST /api/accounts/{id}/activities` with a type, timestamp and metadata.
2. A dedupe fingerprint is computed. If it already exists → **409
   Conflict** ("This exact signal was already recorded").
3. Otherwise → **201**, the account is rescored, a snapshot is written, and
   the response carries the before/after score, which the UI shows as a
   toast: *"Score 17 → 52 (+35). Priority is now MEDIUM…"*

---

## 4. The live demo (5–7 minutes): show, don't tell

**Where to run it:**
- **Deployed:** open the Vercel link (under *Domains* in the Vercel project).
  **Open it a minute early.** The free Render backend sleeps after ~15
  minutes idle and takes 30–60 seconds to wake. Each restart reloads fresh
  demo data, so "today" and "yesterday" are always correct.
- **Local:** run the backend (`uvicorn app.main:app --port 8000`) and the
  frontend (`npm run dev`), then open `http://localhost:5173`. Reseed first
  (`python -m app.seed`) so the relative dates are fresh.

The app has three places: **Overview** (`/`, explains how it thinks),
**Accounts dashboard** (`/accounts`), and an **account page**
(`/accounts/:id`).

**Part 1: the Overview page (≈2 min). This proves you understand the product.**

1. Read the headline question out loud: *"Which account should sales focus
   on right now, and what should they do next?"* Point at the floating live
   card: *"This is real data. Acme moved +25 since yesterday."*
2. Scroll to **How it works**. Let the 7-step walkthrough auto-play, or click
   steps 2 → 3 → 6 → 7. Say: *"Six of these seven steps are deterministic.
   Only the last one uses AI, and every step shows live backend data, not a
   mockup."*
3. Scroll to the **score simulator**, the highest-impact minute of the demo:
   - **Acme · yesterday** → **61**. *"Marketing engagement only, no buying
     intent."*
   - **Acme · today** → **86**. *"Add a pricing visit, a technical doc, a
     hiring signal and VP engagement. That's the +25, and the next action
     flips to Contact decision-maker."*
   - **Bot spam** → **41**. *"240 fake signals, but the per-type caps count
     only 2 of 40 pricing views and 5 of 200 visits. You can't game it."*
   - Turn off *Decision-maker contact on file* on the Acme preset: the
     action falls back to *Send personalized email*.

**Part 2: the real product (≈3 min).**

4. Click **Open live dashboard**. Point at the **Focus now** banner and the
   priority cards. **Hover** a row: *"a preview with the breakdown and top
   changes, loaded lazily and cached."* Change **Sort** to *Score change*
   and let them watch the rows animate into place.
5. Open **Acme Technologies**. Show **What changed?**: 61 → 86 and the four
   drivers. **Click a driver**: the timeline jumps to that exact event and
   highlights it. *"Every point is traceable to a real, timestamped signal."*
6. Click **Intent** next to the score ring. The breakdown card shows exactly
   which rules produced the intent points.
7. Point at **Who should I contact?** and the **Next best action** card.
8. Click **Analyze Account**. While it loads: *"Now I hand that structured
   evidence to an LLM for the summary and outreach draft, but it never
   touches the score."* Show the result and its *AI-generated analysis*
   label. (Free models can take 5–40 seconds. If it fails, that's a demo of
   the fallback, so say so.)

**Part 3: prove it's live, not scripted (≈1 min).**

9. Press **Ctrl+K**, type `keystone`, Enter. Score **17**, *Monitor account*.
10. Click **Log a signal** → **Demo request** → submit. The toast reads
    *"Score 17 → 52 (+35). Priority is now MEDIUM. Next best action:
    Schedule demo…"* *"The real backend just rescored the account, wrote a
    snapshot, and recomputed What Changed."*
11. Submit the same signal again: *"This exact signal was already
    recorded."* *"Duplicates are rejected at the database level, so a
    retried webhook can't inflate a score."*
12. (Optional) Toggle dark mode. Open **Cobalt Security Labs** or **Lumen
    Media Co** to show the honest empty states.

Short on time? Do steps 3, 5 and 10: scoring, explainability and live
rescoring in under two minutes.

---

## 5. The single biggest design decision

**Decision: separate deterministic scoring from AI generation.**

If asked "why didn't you just have an LLM score the account?":

- **Auditability.** A VP of Sales needs to defend a number in a pipeline
  review. "The LLM said 86" isn't defensible. "Fit 30/30 because they're in
  our target industry and size range, Intent from a pricing visit and a
  hiring signal, Engagement from a VP engaging directly" is.
- **Reproducibility.** Same data in, same score out, every time. LLM output
  varies between runs, and you can't build a trustworthy dashboard on a
  number that changes when you refresh.
- **Cost and latency.** Scoring 10,000 accounts nightly with an LLM call
  each is slow and expensive. A pure Python function is microseconds and
  free.
- **Testability.** 113 tests assert exact values ("given these activities,
  total = 86"). You can't write that test against an LLM.
- **Where AI *does* add value:** turning numbers into a paragraph a human
  wants to read, and drafting outreach that references the specific
  evidence. That's synthesis and tone, a real LLM strength and a real
  rules-engine weakness.

**The takeaway:** *AI where it has the advantage (language), rules where
correctness and trust matter (numbers and decisions).*

---

## 6. The scoring formula, explained like you designed it

```
Total (0–100) = Fit (0–30) + Intent (0–30) + Engagement (0–20) + Recency (0–20)
Priority: HIGH 80–100 · MEDIUM 50–79 · LOW 0–49
```

**Fit (30): could they ever buy from us?**
- +15 if the industry is a target (Technology, Financial Services,
  Healthcare, Manufacturing).
- +15 if the company has 200–5,000 employees.
- Capped at 30 on purpose: a perfect-fit account that has never engaged
  should not outrank an average-fit account requesting a demo today.

**Intent (30): are they showing buying behaviour?** Points per signal, and
the maximum number of that signal type that counts:

| Signal | Points | Counts at most |
|---|---|---|
| Demo request | 15 | 1 |
| Pricing page view | 8 | 2 |
| Product page view | 4 | 3 |
| Content download | 3 | 3 |
| Hiring activity | 5 | 1 |
| Company expansion | 5 | 1 |

Hiring and expansion count as **intent** deliberately: a company hiring six
cloud engineers is a real buying trigger, not just "engagement."

**Engagement (20): are they paying attention to us?**

| Signal | Points | Counts at most |
|---|---|---|
| Decision-maker engagement | 8 | 2 |
| Email click | 4 | 2 |
| Content download | 3 | 3 |
| Email open | 2 | 3 |
| Website visit | 1 | 5 |

**Recency (20): how fresh is the latest meaningful signal?**
- ≤ 24h = 20 · ≤ 3 days = 15 · ≤ 7 days = 10 · ≤ 14 days = 5 · older = 0.
- A step function rather than smooth decay, for interpretability: "recency
  is 15 because the last real activity was 2 days ago" fits in a tooltip.
- **Email opens never count for recency.** Privacy proxies (such as Apple
  Mail Privacy Protection) auto-open tracking pixels, so an open is not
  proof a human was there.

**Rules that apply to every signal:**
- Only the **last 30 days** count for intent and engagement.
- **Per-type caps** stop repetition from dominating (the bot-spam preset:
  240 signals, score 41).
- **Future timestamps** (more than 5 minutes ahead, to allow for clock
  skew) are excluded and flagged.
- **Duplicates** are removed by fingerprint.

**"How did you pick 80/50?"** Honest answer: "Reasonable, configurable
defaults for a demo. In production I'd back-test thresholds against real
win rates by score decile."

---

## 7. "What changed?": the most technically interesting part

The naive version diffs two numbers. This version does **exact
attribution**: every point of the delta is assigned to a named driver, and
the drivers **sum exactly to the real delta**.

**How it works:**

1. **Pick the comparison point:** the most recent stored snapshot that is
   **at least 24 hours old** (ties broken by id, so it's deterministic).
2. **Recompute components at that moment** with the same scoring function,
   then attribute:
   - **Fit change:** fit now − fit then (e.g. an employee count correction).
   - **Recency change:** recency now − recency then.
   - **New signals:** replay the new activities **in chronological order**
     and credit each one with the **marginal** intent + engagement points it
     added. Order matters because of caps: if two pricing views already
     count, a third gets **0 points**, and it still appears in the timeline
     marked "limited by score caps" instead of vanishing.
   - **Aged-out signals:** activity that fell out of the 30-day window
     since then, which can pull the score *down* even when new activity
     arrived.
   - **Other adjustments:** any residual against the stored snapshot (e.g.
     a rule change), so the numbers always reconcile rather than silently
     drifting.
3. A test asserts `sum(driver.points) == delta` for the hero account.

**Why it matters:** a rep who sees "+25" with no reason doesn't trust it.
"+25, here are the four reasons, each with a timestamp" is something they
act on.

---

## 8. The AI grounding strategy: expect deep questions

"How do you stop the LLM from hallucinating?" is the classic question.
Answer with layers:

1. **Structured input only.** The model never sees the database or free
   text: it gets a JSON payload built server-side from facts that were
   already computed. It can't cite data it was never given.
2. **Explicit negative rules in the system prompt:** do not invent people,
   titles, activities, company facts, product usage, pricing, past
   conversations or outcomes. When a field isn't supported, write exactly
   *"Insufficient evidence from available account signals."*
3. **Consistency with the rules engine:** the prompt includes
   `deterministicNextAction` and requires the AI's recommendation to agree
   with it.
4. **Post-generation checks in code.** If the account has no contacts, the
   backend overwrites `recommendedPersona`, whatever the model said.
   *Prompting is a request, not a guarantee; the real safety net is code
   that runs after the model.*
5. **Defensive parsing.** Handles code fences, leading prose, snake_case vs
   camelCase keys, and `<think>` reasoning blocks, then validates with a
   Pydantic schema.
6. **Honest UI.** AI content is labelled "AI-generated analysis" and sits
   *next to* the deterministic score and action, never replacing them.

**Failure handling, name them specifically:** missing key, 401/403 (bad
key), 402 (no credits), 429 (rate limit), 5xx and network/timeout errors
(retried once), empty reply, non-JSON reply, JSON missing required fields,
wrong types. All of them return **HTTP 200** with `status: "unavailable"`
and an `errorCode`. The endpoint didn't fail; one feature degraded. The UI
says: *"AI analysis is currently unavailable. Account scoring and
deterministic recommendations are still available."*

**Security:** the OpenRouter key exists only in the backend's environment
(a secret on Render; a local env var in development). It's never in the
repo, never in the React bundle, and `/api/health` reports only whether a
key is configured, never the key itself.

---

## 9. The next-best-action rules engine

It's an ordered list, and the first matching rule wins:

1. No activity in the last 30 days → **Monitor**.
2. A demo was requested → **Schedule demo**, targeted at the requester if
   known, otherwise the best decision-maker.
3. HIGH score, strong intent, and a decision-maker on file → **Contact
   decision-maker** by name and title.
4. Same, but *no* decision-maker → **Send personalized email** to the best
   available contact, and the UI says *"No decision-maker persona
   identified"* instead of pretending.
5. Medium engagement or intent → **Send personalized email**.
6. Everything weaker → **Nurture account**, or **Monitor** when the signal
   is very thin.

**The engineering point:** every branch has a fallback for missing data (no
contacts, no decision-maker, no activity), because real CRM data is never
clean.

---

## 10. Persona mapping and contact ranking

Job titles are messy ("VP, Engineering", "VP Engineering", "Vice President
of Engineering"), so ordered regex rules map them to five personas:
Technical Evaluator, Economic Buyer, Executive Sponsor, Influencer,
Procurement. Contacts are then **ranked**: persona importance plus a large
boost if that person **personally engaged** recently (found in activity
metadata). So an engaged engineering manager can outrank an unengaged CFO.
The point: *ranking*, not just categorizing.

---

## 11. Product-interest inference: the honesty mechanism

A product is only named if the evidence passes a **minimum threshold**
(points and number of distinct signals) and the top two candidates are
**not tied**. Otherwise the UI shows *"Insufficient signals."* Same
philosophy as everywhere else: *silence beats a confident wrong answer.*

---

## 12. Edge cases: have 3–4 memorized cold

- **Duplicate activities:** a unique database constraint on a fingerprint
  of (account, type, timestamp, metadata) means a retried webhook can't
  double-count. The API returns 409. The scorer also dedupes defensively.
- **Future timestamps:** Nimbus Education deliberately has a demo request
  dated in the future. It's excluded from scoring and flagged, so bad
  upstream data can't fake recency.
- **Score bounds:** hundreds of stacked signals can't push the total above
  100 or below 0.
- **Missing data:** an account with no website, no employee count, or a
  contact with no title still renders a complete page with honest copy
  instead of `null` or blanks.
- **No activity / no contacts:** Cobalt Security Labs and Lumen Media Co
  show clean empty states and sensible actions.

---

## 13. Testing story: say the number, then the kind

"113 backend tests, all passing, and none of them call the real AI
provider. I monkeypatch the single function that makes the HTTP call, so I
can simulate every failure mode without a live key."

Categories: exact scoring math, edge cases, every recommendation branch,
What Changed reconciliation, AI parsing/grounding/fallback, and API tests
(status codes, 404 on unknown ids, 409 on duplicates).

**Be precise about the frontend:** the 113 automated tests are backend
tests. I verified the UI end to end in a real Chrome browser with scripted
checks (filters, sorting, dialogs, the AI fallback, mobile width, no
console errors), but those scripts aren't in the repo. The obvious next
step is Playwright tests in CI.

---

## 14. Frontend and architecture talking points

**Stack and structure**
- React + TypeScript + Vite, plain CSS with light/dark theme tokens (no UI
  framework): a deliberate choice to show CSS fundamentals.
- Recharts for score history, activity trend and the clickable breakdown.
  Colours come from CSS variables, so dark mode needs no duplicate chart
  code.
- The browser only ever calls `/api/*` on its own origin. Locally Vite
  proxies that to FastAPI; in production Vercel rewrites it to Render. The
  browser **never talks to OpenRouter and never sees the key**.
- Routing is a ~20-line hook on the History API (`/`, `/accounts`,
  `/accounts/:id`): three routes don't justify react-router.

**The Overview page and simulator**
- The Overview page exists to show *product understanding*: the problem, a
  7-step pipeline walkthrough fed by live backend data, design principles,
  architecture and edge cases.
- The simulator runs a **client-side mirror** of the scoring rules
  (`frontend/src/services/scoringModel.ts`) so it responds instantly. Its
  presets reproduce the real engine exactly (Acme 61 → 86). See the "why
  duplicate the logic" question in section 16.

**Interaction engineering**
- **Animated re-sorting** with the FLIP technique: measure row positions
  before and after, animate the difference with the Web Animations API.
- **Hover previews** load lazily after a short delay and are cached; the
  cache clears when a new signal is logged.
- **Cross-component links** (click a What Changed driver → the timeline
  scrolls to that event) use a small typed event bus instead of
  prop-drilling.
- **Command palette** (Ctrl+K) with fuzzy matching and full keyboard
  support; `/` focuses the search.
- **Accessibility and polish:** skeleton loaders, toasts in an `aria-live`
  region, priority as icon + text (never colour alone),
  `prefers-reduced-motion` honoured, and an inline script that applies the
  saved theme before first paint so there's no flash.

---

## 15. Deployment: how it runs without my laptop

```
GitHub (main) ──push──► Vercel  builds frontend/ → static site + /api rewrite
              └──push──► Render  builds backend/  → FastAPI (render.yaml Blueprint)
```

- **Frontend on Vercel:** root directory `frontend`. `frontend/vercel.json`
  rewrites `/api/*` to the Render backend and everything else to
  `index.html`, so deep links like `/accounts/1` work on refresh.
- **Backend on Render:** defined as code in `render.yaml` (Python 3.12,
  health check `/api/health`). Secrets (`OPENROUTER_API_KEY`) are entered
  in the Render dashboard, never committed.
- **Free-tier trade-offs, stated honestly:** the backend sleeps after ~15
  minutes idle (30–60s cold start), and the disk is ephemeral, so
  `AUTO_SEED=true` reloads the demo data on each start. Signals logged in
  the demo last until the next restart. For persistence: Postgres or a paid
  disk.
- **Continuous deployment:** every push to `main` redeploys both.

**Why not host the backend on Vercel too?** Vercel runs Python as
serverless functions with no persistent local disk, so SQLite would reset
between invocations. Render runs a normal long-lived server.

**Deployment bug story (good real example):** the deployed site loaded but
showed no data. I debugged it layer by layer:
1. The deployment URL returned Vercel's **login page**: deployment
   protection was on. Disabled it for the project.
2. The backend returned no **CORS** header for the site's origin. I made
   origin matching tolerant of trailing slashes and allowed this project's
   Vercel domains.
3. The built JavaScript contained no backend URL: the build-time variable
   `VITE_API_BASE_URL` wasn't set, so the app called `/api` on Vercel and
   got HTML back. Instead of relying on that variable, I added a Vercel
   **rewrite** from `/api/*` to Render. Now the browser calls its own
   origin, so there's no CORS in the normal path and no build-time config
   to forget.
Each step was verified from the command line (page title, CORS header,
inspecting the built bundle) before moving to the next.

---

## 16. Hard questions to pre-empt

**"Isn't this just if/else statements, not real AI?"**
> "The scoring and recommendations are deterministic by design; that's the
> point, not a limitation. The AI does what LLMs are uniquely good at:
> reading structured evidence and writing fluent, personalized language.
> Using an LLM for scoring would give a less trustworthy, less testable,
> slower and more expensive product. Choosing where to apply AI is the
> judgment this project demonstrates."

**"What would you change for production?"**
> "(1) Calibrate weights and recency against real win/loss data instead of
> my defaults. (2) Postgres with Alembic migrations, plus authentication
> and multi-tenancy. (3) A feedback loop: reps rate the AI's drafts, which
> is the signal you'd use to improve prompts over time."

**"How would this scale to 100,000 accounts?"**
> "Scoring is a pure function, linear in the number of activities per
> account, so it's already cheap. I'd move it to a batch or event-driven
> job that writes snapshots, instead of recomputing on page load. The AI
> call is the expensive part, so it stays on demand, per click: no point
> paying to analyze accounts nobody's looking at."

**"Why SQLite and not Postgres?"**
> "Zero setup for a demo: clone and run. Nothing in the SQLAlchemy layer is
> SQLite-specific, so switching is close to a one-line connection-string
> change."

**"Why does the simulator duplicate the scoring logic in the frontend?"**
> "It's a deliberate trade-off. The simulator must respond on every click,
> and it's an explainer, not the product: every real score comes from the
> backend. I kept the mirror small and table-driven and checked it against
> the backend (the Acme presets reproduce 61 and 86 exactly). In production
> I'd remove the duplication with a `POST /api/score/simulate` endpoint or
> by serving the rule tables as JSON, plus a test that fails if they
> diverge."

**"Tell me about a bug you hit and how you debugged it."** Pick one; all are
real:
> - **The invisible tooltip.** The hover preview never appeared on screen.
>   A card's entrance animation left a `transform` on a parent, and a
>   transformed parent changes what `position: fixed` is relative to, so
>   the preview was drawn ~600px too low. Fix: render it through a React
>   portal on `document.body` and measure its real height before placing
>   it.
> - **AI calls failing with "network error" while curl worked.** It was a
>   TLS verification failure: the machine's root certificate was in the
>   Windows store, which curl uses but Python's bundled CA list doesn't.
>   Fixed with `truststore` so Python uses the OS trust store; verification
>   stayed on.
> - **A duplicated score snapshot.** Logging one activity created two
>   history points: two snapshots shared a timestamp and `max()` picked the
>   older one. Fixed with an explicit tie-break on id.
> - **The deployed site showing no data.** See section 15: login wall →
>   CORS → missing build-time URL, fixed with a Vercel rewrite.

**"What was the hardest part?"**
> "Making What Changed reconcile exactly: per-type caps, the 30-day window
> and signals aging out, while still producing a short list of
> human-readable reasons that sum to the real delta. It looks simple in the
> UI, and the gap between how simple it looks and what it took is exactly
> what's worth talking about."

---

## 17. If they ask you to extend it live

- **"Add a new signal type"** → add an entry to `INTENT_POINTS` or
  `ENGAGEMENT_POINTS` and its cap in `scoring.py`; the scorer is
  table-driven. Be upfront that you'd also update the simulator mirror
  (`scoringModel.ts`) and the Log-a-signal dialog, which is why a single
  shared rules source is on the improvement list.
- **"Add a new next-best-action"** → insert a branch in the ordered rule
  list in `recommendations.py`, and add a test proving it doesn't shadow a
  higher-priority rule.
- **"How would you A/B test scoring weights?"** → store the weights as
  versioned config (they're already constants at the top of `scoring.py`),
  log which version produced each score, and compare conversion by cohort.

---

## 18. Cheat sheet

| Thing | Value |
|---|---|
| Score | Fit 30 + Intent 30 + Engagement 20 + Recency 20 = 100 |
| Priority | HIGH ≥ 80 · MEDIUM 50–79 · LOW < 50 |
| Fit | +15 target industry · +15 for 200–5,000 employees |
| Biggest signals | Demo request 15 · Pricing view 8 · Decision-maker engagement 8 |
| Recency | ≤24h 20 · ≤3d 15 · ≤7d 10 · ≤14d 5 · else 0 (email opens excluded) |
| Signal window | 30 days · future tolerance 5 minutes |
| What Changed baseline | latest snapshot ≥ 24h old |
| Hero account | Acme Technologies 61 → 86 (+25) |
| Live-demo account | Keystone: 17 → 52 (+35) after a demo request |
| Bot-spam preset | 240 signals → score 41 |
| Demo data | 15 accounts · 26 contacts · 107 activities |
| Tests | 113 backend (pytest), no live AI calls |
| AI | OpenRouter `openrouter/free`, retry once, failures → HTTP 200 `unavailable` |
| Stack | React · TypeScript · Vite · Recharts / FastAPI · Pydantic · SQLAlchemy · SQLite |
| Hosting | Vercel (frontend + `/api` rewrite) · Render (backend, `render.yaml`) |
