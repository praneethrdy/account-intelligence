# Interview Guide — Deep Explanation of This Project

This is written so you can defend every design decision under follow-up
questioning, not just describe what the app does. Read section 1 first — it's
the script. Everything after it is ammunition for "why did you..." questions.

---

## 1. How to open (30–45 seconds, memorize the shape not the words)

> "I built a B2B account intelligence tool — think of it as the engine behind
> something like 6sense or an ABM platform. Sales reps have too many accounts
> to track manually, so the product ingests behavioral signals — website
> visits, email engagement, demo requests, hiring activity — and produces
> three things for each account: an **explainable 0-to-100 score** computed
> by a deterministic rules engine, a **plain-English explanation of what
> changed since yesterday and why**, and a **next-best-action recommendation**
> like 'contact this VP, here's why, here's what to say.' The scoring and the
> action logic are pure backend rules — I deliberately did *not* let an LLM
> touch the numbers, because a sales VP won't trust a score they can't audit.
> The LLM's only job is to read that structured evidence and write the
> human-facing summary and outreach email, with hard grounding rules so it
> can't invent people or facts. And the whole thing degrades gracefully — if
> the AI provider is down, every other feature keeps working."

Then stop talking and let them ask questions. Don't dump the whole README.

---

## 1b. The live demo (5–7 minutes): show, don't tell

The app has three places: **Overview** (`/`, explains how it thinks),
**Accounts dashboard** (`/accounts`), and an **account page**
(`/accounts/:id`). Reseed first (`python -m app.seed`) so "today" and
"yesterday" are accurate.

**Part 1: the Overview page (≈2 min). This proves you understand the product.**

1. Open `http://localhost:5173`. Read the headline question out loud:
   *"Which account should sales focus on right now, and what should they do
   next?"* Point at the floating live card: *"This is real data. Acme moved
   +25 since yesterday."*
2. Scroll to **How it works**. Let the 7-step walkthrough auto-play, or click
   steps 2 → 3 → 6 → 7. Say: *"Six of these seven steps are deterministic. Only
   the last one uses AI, and every step here is showing live data from the
   backend, not a mockup."*
3. Scroll to the **score simulator**, the highest-impact minute of the demo:
   - Click **Acme · yesterday** → **61**. *"Marketing engagement only, no
     buying intent."*
   - Click **Acme · today** → **86**. *"Add a pricing visit, a technical doc,
     a hiring signal and VP engagement. That's the +25, and the next action
     flips to Contact decision-maker."*
   - Click **Bot spam** → **41**. *"240 fake signals, but the per-type caps
     count only 2 of 40 pricing views and 5 of 200 visits. This is why you
     can't game it."*
   - Turn off *Decision-maker contact on file* on the Acme preset and point
     out the action falls back to *Send personalized email*.

**Part 2: the real product (≈3 min).**

4. Click **Open live dashboard**. Point at the **Focus now** banner and the
   priority cards. **Hover** a row: *"a preview with the breakdown and top
   changes, loaded lazily and cached."* Change **Sort** to *Score change* and
   let them see the rows animate into place.
5. Open **Acme Technologies**. Show **What changed?**: 61 → 86 and the four
   drivers. **Click a driver**: the timeline jumps to that exact event and
   highlights it. *"Every point is traceable to a real, timestamped signal."*
6. Click **Intent** next to the score ring. The breakdown card flashes and
   shows exactly which rules produced 16/30.
7. Point at **Who should I contact?** (Sarah Chen, Technical Evaluator,
   engaged) and the **Next best action** card.
8. Click **Analyze Account**. While it loads: *"Now I hand that structured
   evidence to an LLM and ask for the summary and outreach draft, but it
   never touches the score."* Show the result and the *AI-generated
   analysis* label.

**Part 3: prove it's live, not scripted (≈1 min).**

9. Press **Ctrl+K**, type `keystone`, Enter. Score **17**, *Monitor account*.
10. Click **Log a signal** → **Demo request** → submit. The toast reads
    *"Score 17 → 52 (+35). Priority is now MEDIUM. Next best action: Schedule
    demo…"* *"The real backend just rescored the account, wrote a snapshot,
    and recomputed What Changed."*
11. Submit the same signal again: *"This exact signal was already recorded."*
    *"Duplicates are rejected at the database level, so a retried webhook
    can't inflate a score."*
12. (Optional) Click the theme icon to show dark mode. Open **Cobalt Security
    Labs** or **Lumen Media Co** to show the honest empty states.

If you're short on time, do steps 3, 5 and 10. That's scoring, explainability
and live rescoring in under two minutes.

---

## 2. The "why" behind the single biggest design decision

**Decision: separate deterministic scoring from AI generation.**

If asked "why didn't you just have GPT/Claude score the account?" — this is
the answer that shows product judgment, not just coding ability:

- **Auditability.** A VP of Sales reviewing a pipeline forecast needs to be
  able to point at a number and defend it in a QBR. "The LLM said 86" is not
  a defensible answer. "Fit 30/30 because they're in our target industry and
  size range, Intent 16/30 from a pricing visit + hiring signal, Engagement
  20/20 from a VP directly engaging" is defensible.
- **Determinism / reproducibility.** Run the same activity data through the
  scorer twice, get the same number. LLMs are non-deterministic even at
  temperature 0 in practice (different tokenization, provider-side sampling
  quirks). You cannot build a trustworthy dashboard on a non-reproducible
  number.
- **Cost and latency.** Scoring 10,000 accounts nightly via an LLM call each
  is slow and expensive. A pure-Python function is microseconds and free.
- **Testability.** I have 113 unit tests asserting exact score values (e.g.
  "given these activities, fit=30, intent=16, total=86"). You cannot write
  that test against an LLM's output.
- **Where AI *does* add value:** turning "Fit 30, Intent 16, Engagement 20"
  into a paragraph a human enjoys reading, and drafting personalized prose
  that references the *specific* evidence — that's a genuine LLM strength
  (synthesis and tone), and a genuine rules-engine weakness.

This is the single most important thing to communicate: **I used AI where it
has comparative advantage (language) and rules where correctness and trust
matter (numbers and decisions).**

---

## 3. Walk through the scoring formula like you designed it from scratch

```
Total (0–100) = Fit (0–30) + Intent (0–30) + Engagement (0–20) + Recency (0–20)
```

Be ready to explain *why these four buckets and why these weights*:

- **Fit (30 pts)** — firmographic match to the Ideal Customer Profile
  (industry in {Technology, Financial Services, Healthcare, Manufacturing},
  size 200–5,000 employees). This answers "*could* they ever buy from us,"
  independent of behavior. It's capped at 30 because fit alone should never
  make an account "hot" — a perfect-fit account that's never engaged is not
  more urgent than an imperfect-fit account requesting a demo today.
- **Intent (30 pts)** — explicit buying signals: pricing page views (8pts),
  demo requests (15pts, the strongest single signal), content downloads,
  and — a deliberate choice — **hiring/expansion activity counts as intent**
  (a company hiring 6 cloud engineers is a real buying trigger, not just
  "engagement"). Each signal type has a **per-type cap** (e.g. only the
  first 2 pricing views count) specifically to defeat gaming — otherwise a
  bot or an over-eager marketer refreshing a page 50 times would push a
  cold account to HIGH priority.
- **Engagement (20 pts)** — softer signals (email opens/clicks, website
  visits) plus a heavily-weighted signal: **decision-maker engagement (8
  pts)**. A VP opening your product page is worth more than a random visitor
  doing the same thing — but I only know it's a VP because I cross-reference
  the activity's contact metadata against the persona-mapped contact list.
- **Recency (20 pts)** — a step function (24h=20, 3d=15, 7d=10, 14d=5,
  older=0) rather than a smooth decay curve. I chose steps over decay for
  *interpretability*: "recency is 15 because the last real activity was 2
  days ago" is instantly understandable in a UI tooltip; a continuous decay
  formula is not. **Email opens are explicitly excluded from recency** —
  they're notoriously unreliable (Apple Mail Privacy Protection and other
  proxies auto-open tracking pixels), so I don't want a bot-triggered pixel
  making a dead account look "fresh."

Priority bands (HIGH 80-100 / MEDIUM 50-79 / LOW 0-49) are a simple
threshold — if asked "how did you pick 80/50," the honest answer is "these
are reasonable, configurable defaults for a demo; in production I'd back-test
thresholds against actual win-rates by score decile."

---

## 4. Be ready to explain "What Changed?" — this is the most technically interesting part

The naive way to build "what changed" is to just diff two numbers. I built
**exact point-by-point attribution** instead — every score delta is broken
into named drivers (e.g. "+8 Pricing page visit, +6 VP Engineering
engagement, +5 Hiring activity") that **mathematically sum to the real
delta**. This is harder than it sounds because of *interaction effects*:

- If an account already has 2 pricing-page views counted (hitting the
  per-type cap) and a 3rd comes in, that 3rd view contributes **0 points** —
  but it still needs to *appear* in the timeline with an honest explanation
  ("limited by score caps"), not silently disappear.
- Signals can **age out** of the 30-day rolling window between yesterday and
  today, which can make the score go *down* even with new positive activity
  — I attribute that separately as "older signals aged out."
- I recompute what *yesterday's* score would have been using the exact same
  scoring function with `as_of=yesterday`, rather than trusting a possibly
  stale stored snapshot, so fit-score changes (e.g. a firmographic data
  correction) get attributed too, not just activity.
- Any leftover, unattributed delta is bucketed as "other adjustments" rather
  than silently dropped — so the numbers always reconcile exactly. This was
  a conscious testability requirement: I have a test that asserts
  `sum(driver.points for driver in drivers) == actual_delta` for the hero
  account.

If asked "why does this matter" — because a sales rep who sees "+25" with no
explanation doesn't trust it, but "+25, and here are the four exact reasons,
each with a timestamp" is something they'll act on immediately.

---

## 5. The AI grounding strategy — expect deep questions here

This is the part most likely to get grilled, because "how do you stop the
LLM from hallucinating" is the classic AI-integration interview question.

**Layers of defense, in order:**

1. **Structured input only.** The model never sees free text or the raw
   database — it receives a strict JSON payload I construct server-side:
   account facts, the score breakdown, up to 15 real recent activities, the
   real contact list, and the *already-computed* deterministic next action.
   It cannot invent data it was never given.
2. **Explicit negative instructions in the system prompt** — a hard list:
   "Do NOT invent people, activities, company facts, product usage, pricing,
   previous conversations, business outcomes, or customer requirements." I
   also require it to write a fixed phrase — *"Insufficient evidence from
   available account signals"* — whenever a field isn't supported by the
   data, rather than guessing.
3. **The model is told its own output must be *consistent* with the
   deterministic next action**, not free to invent its own recommendation.
   I pass `deterministicNextAction` into the prompt explicitly.
4. **Post-generation validation (code, not prompting).** If the account
   genuinely has zero contacts, I overwrite `recommendedPersona` server-side
   regardless of what the model said, so even if it ignored the prompt and
   named a fictional VP, the UI never shows it. This is the most important
   lesson: **prompting is a request, not a guarantee — the only real
   safety net is deterministic code that runs after the model.**
5. **Robust parsing, not blind trust.** The model's response has to survive
   markdown code fences, leading prose ("Here's the analysis:"), snake_case
   vs. camelCase key drift, and even `<think>` reasoning blocks some models
   emit — I strip/parse all of that defensively before validating it against
   a Pydantic schema.
6. **The UI never lets AI content masquerade as fact.** Every AI section is
   visually labeled "AI-generated analysis" and sits next to, never
   replacing, the deterministic score and action panel.

**Failure handling** — be ready to list the specific failure modes I coded
for, because "did you actually handle X or just say you did" is a common
gotcha: missing API key, HTTP 401/403 (bad key), 402 (no credits), 429 (rate
limit, retried once with backoff), 5xx (retried once), network/timeout
errors, empty completion text, non-JSON completion text, JSON that's missing
required fields, and JSON that has the right fields but the wrong types. All
of these collapse to a single response shape: `status: "unavailable"` with an
`errorCode`, HTTP 200 (not 500 — the endpoint didn't fail, the AI feature
degraded), and the UI shows: *"AI analysis is currently unavailable. Account
scoring and deterministic recommendations are still available."*

---

## 6. Be ready to explain the Next-Best-Action rules engine as an actual decision tree

Say it as an ordered priority list, because that's literally how it's coded
(first matching rule wins):

1. No activity in the last 30 days → **Monitor** (nothing to act on yet).
2. A demo was explicitly requested → **Schedule Demo**, targeted at the
   actual requester if their contact metadata is present, otherwise the best
   available decision-maker.
3. Score is HIGH and Intent ≥ 15 and a decision-maker contact exists →
   **Contact Decision-Maker** by name and title.
4. Same situation but *no* decision-maker on file → falls back to **Send
   Personalized Email** to the best available contact, and the UI explicitly
   surfaces *"No decision-maker persona identified"* rather than pretending
   one exists.
5. Medium engagement/intent but not yet urgent → **Send Personalized
   Email**.
6. Very thin, low-value signal only → **Monitor**.
7. Everything else weak → **Nurture Account**.

The interesting engineering point: **every branch has an explicit "what if
the ideal data is missing" fallback** — no contacts, no decision-maker, no
activity at all — because real CRM data is never clean, and a demo that only
works on the happy path isn't a demo of production thinking.

---

## 7. Persona mapping and contact ranking — a smaller but good talking point

Job titles are free text in the real world ("VP, Engineering" vs "VP
Engineering" vs "Vice President of Engineering"), so I mapped titles to five
personas (Technical Evaluator, Economic Buyer, Executive Sponsor, Influencer,
Procurement) using ordered regex rules, not exact string matching. Contacts
are then ranked by a weighted score: persona importance, **plus a large boost
if that contact's name/email actually appears in recent activity metadata**
(meaning they personally engaged) — so an engaged Engineering Manager can
rank above an unengaged CFO. This is a small piece but it shows I thought
about "ranking," not just "categorizing."

---

## 8. Product-interest inference — explain the honesty mechanism

Rather than always guessing a product, I require a **minimum evidence
threshold** (a point total *and* a minimum number of distinct signals) before
committing to a product, and I explicitly check for **ties** between the top
two candidates. Below threshold or on a tie → the UI shows *"Insufficient
signals"* rather than a low-confidence guess. This mirrors the same
philosophy as everything else in the app: **silence is better than a
confident-sounding wrong answer.**

---

## 9. Edge cases — have 3–4 memorized cold, don't just say "I handled edge cases"

Pick whichever land best for your audience:

- **Duplicate activities:** the database has a unique constraint on a hash
  of (account, type, timestamp, metadata) — so literally the same event
  can't be double-counted even if an upstream integration retries a webhook.
  I tested this at both the DB layer (IntegrityError) and the scoring-engine
  layer (defensive dedup even if duplicates somehow got stored).
- **Future timestamps:** a demo dataset had a data-quality bug I deliberately
  kept in (Nimbus Education has a demo request dated in the future) to prove
  the app doesn't let bad upstream data give an account artificial recency
  points — it's excluded from scoring and flagged with a warning banner.
- **Score boundary tests:** I stress-tested with hundreds of stacked
  high-value activities to prove the total mathematically cannot exceed 100
  or go below 0, regardless of how much (fake or real) activity floods in.
- **Missing optional data:** an account with no website, no employee count,
  and a contact with no job title still renders a complete, non-broken page
  — every "unknown" field has a specific, honest microcopy string instead of
  `null`, `undefined`, or a blank space.

---

## 10. Testing story — say the number, then say *what kind* of tests

"113 backend tests, all passing, no network calls to the real AI provider in
the test suite — I use `monkeypatch` to inject failures at the exact seam
where the AI call happens, so I can assert the fallback behavior for every
one of those ~10 failure modes without ever needing a live API key in CI."
Categories: scoring math (exact expected values, not just "score > 0"),
edge cases, recommendation branches, AI grounding/parsing/fallback, and full
API-level tests (status codes, 404s on invalid IDs, 409s on duplicate
activity posts).

Be precise about the frontend: the 113 automated tests are **backend**
tests. I verified the UI end to end by driving it in a real Chrome browser
with scripted checks (every filter, sort, dialog, the AI fallback, mobile
width, no console errors). Those scripts aren't part of the repo, so don't
claim a committed frontend test suite. If asked, say adding Playwright tests
to CI is the obvious next step.

---

## 11. Frontend/architecture talking points

**Stack and structure**
- React + TypeScript + Vite, plain CSS with light/dark theme tokens (no UI
  framework dependency), a deliberate choice to show CSS fundamentals
  rather than lean entirely on a component library.
- Recharts for the score history, activity trend and the clickable score
  breakdown. Colors come from CSS variables, so dark mode works without
  duplicating chart code, and the chart palette follows a validated,
  colorblind-safe order.
- The Vite dev server proxies `/api/*` to FastAPI, so the browser **never
  talks to OpenRouter and never sees the API key**.
- Routing is a ~20-line custom hook on the History API (`/`, `/accounts`,
  `/accounts/:id`) instead of react-router: three routes don't justify a
  dependency.

**The Overview page and simulator (expect a question here)**
- The Overview page exists to show *product understanding*: the problem, a
  7-step pipeline walkthrough fed by **live** backend data, design
  principles, architecture and edge cases.
- The score simulator runs a **client-side mirror** of the backend rules
  (`frontend/src/services/scoringModel.ts`) so it can respond instantly
  while you toggle inputs. Its presets reproduce the real engine's numbers
  exactly (Acme 61 → 86). See the "why duplicate the logic" question in
  section 12.

**Interaction engineering (good for "tell me about the frontend")**
- **Animated re-sorting** uses the FLIP technique: measure row positions
  before and after a re-sort, then animate the difference with the Web
  Animations API. No animation library needed.
- **Hover previews** fetch account intelligence lazily after a short hover
  delay and cache it per session. The cache is cleared whenever a new signal
  is logged, so previews never go stale.
- **Cross-component interactions** (click a "What changed?" driver → the
  timeline scrolls to and highlights that event; click *Intent* in the
  header → the breakdown selects that tab) use a small typed event bus
  instead of prop-drilling through the page.
- **Command palette** (Ctrl+K) with fuzzy matching and full keyboard
  navigation; `/` focuses the table search.
- **Accessibility and polish**: skeleton loaders that match the real layout,
  toasts in an `aria-live` region, priority shown as icon + text (never color
  alone), `prefers-reduced-motion` honoured, and a tiny inline script that
  applies the saved theme before first paint so there's no light/dark flash.

---

## 12. Hard questions to pre-empt

**"Isn't this just if/else statements, not real 'AI'?"**
> "The scoring and recommendation logic is deterministic by design — that's
> the point, not a limitation. The AI is genuinely doing what LLMs are
> uniquely good at: reading structured evidence and producing fluent,
> personalized natural language. If I'd used an LLM for the scoring, I'd
> have a less trustworthy, less testable, slower, and more expensive product
> for no real benefit — the *judgment* of where to apply AI is the point I
> want this project to demonstrate."

**"What would you change for a real production version?"**
> "Three things: (1) replace the step-function recency score with a
> back-tested decay curve calibrated against real win/loss data instead of
> my own defaults, (2) move from SQLite to Postgres with proper migrations
> (Alembic) and add authentication/multi-tenancy, (3) add a feedback loop —
> let reps thumbs-up/down the AI's outreach draft and log that, since that's
> the actual signal you'd use to improve prompt quality over time."

**"How would this scale to 100,000 accounts?"**
> "The scoring function is pure and O(n) in activity count per account, so
> it's already cheap — I'd move it to a scheduled batch job (nightly or
> event-triggered on new-activity webhooks) writing score snapshots, instead
> of recomputing on every page load like the demo does. The AI call is the
> expensive part, so that stays on-demand, per-rep-click, never batch — you
> don't want to burn LLM spend analyzing accounts nobody's looking at."

**"Why SQLite and not Postgres?"**
> "Zero-setup for a take-home/demo context — anyone can clone this and run
> it with no external service. The schema and SQLAlchemy layer don't assume
> SQLite-specific features, so swapping the connection string to Postgres is
> close to a one-line change."

**"Why does the simulator duplicate the scoring logic in the frontend? Isn't that drift waiting to happen?"**
> "Yes, and I'd say that's the honest trade-off. The simulator needs to
> react on every click, and it's an explainer, not the product: every real
> score shown anywhere else comes from the backend. I kept the mirror small
> and table-driven and checked it against the backend's actual numbers
> (the Acme presets reproduce 61 and 86 exactly). In production I'd remove
> the duplication by either exposing a `POST /api/score/simulate` endpoint
> that runs the real engine, or by serving the rule tables from the backend
> as JSON so both sides read one source of truth, plus a test that fails if
> they diverge."

**"Tell me about a bug you hit and how you debugged it."**
> Pick one; all three are real:
> - **The invisible tooltip.** The hover preview passed its check but never
>   showed up on screen. I measured its actual position and walked up its
>   parent elements: a card's entrance animation left a `transform` on it,
>   and a transformed parent redefines what `position: fixed` is relative
>   to. So the card was being drawn about 600px lower than intended. The fix
>   was rendering the preview and dialog through a React portal on
>   `document.body`, then measuring the real card height before deciding
>   whether to open it above or below the row.
> - **AI calls failing with a "network error" while curl worked.** The real
>   error was a TLS certificate verification failure: this machine's root
>   certificate lives in the Windows certificate store, which curl uses but
>   Python's bundled CA list doesn't. I fixed it with `truststore`, so Python
>   verifies against the OS trust store. Certificate verification stays on;
>   I never disabled it.
> - **A duplicated score snapshot.** Posting an activity created two history
>   points instead of one. Two snapshots shared the same timestamp and
>   `max()` picked the older one, so the code thought the score had changed
>   again. I fixed it with an explicit tie-break on id.

**"What was the hardest part?"**
> Good honest answer: "Getting the 'What Changed' attribution to mathematically
> reconcile — handling per-type score caps, the 30-day rolling window, and
> signals aging out, while still producing a clean list of human-readable
> reasons that sum exactly to the real delta. It's the kind of feature that
> looks simple in the UI but has real interaction-effect complexity
> underneath, and I think that gap — between what looks simple and what
> engineering that simplicity actually took — is exactly what's worth
> talking about in an interview."

---

## 13. If they ask you to whiteboard/extend it live

Good, safe things to sketch on request:
- "Add a new signal type" → show it only needs an entry in
  `INTENT_POINTS`/`ENGAGEMENT_POINTS` plus a per-type cap, no other code
  changes — demonstrates the scorer is table-driven, not hardcoded per-type.
  Be upfront that today you'd also add it to the simulator's mirror table
  (`scoringModel.ts`) and the "Log a signal" dialog, which is exactly why a
  single shared rules source is on the improvement list.
- "Add a new next-best-action" → walk through inserting a new branch in the
  ordered rule list, and note you'd add a test asserting it doesn't shadow
  an earlier, higher-priority rule.
- "How would you A/B test scoring weights?" → store the weight config as
  data (already halfway there — it's a few constants at the top of
  `scoring.py`), version it, and log which config produced which score per
  account so you can compare cohorts.
