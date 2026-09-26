import { useEffect, useState } from 'react';
import { PipelineExplorer } from '../components/home/PipelineExplorer';
import { ScoreSimulator } from '../components/home/ScoreSimulator';
import { Icon } from '../components/Icon';
import { useCountUp } from '../hooks/useCountUp';
import { navigate } from '../hooks/useRoute';
import { api } from '../services/api';
import type { AccountListResponse, Intelligence, TimelineResponse } from '../types';

function Stat({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value, 1100);
  return (
    <div className="hero-stat">
      <span className="hero-stat-value">{shown}</span>
      <span className="hero-stat-label">{label}</span>
    </div>
  );
}

const PROBLEMS = [
  { icon: 'layers', title: 'Too many accounts', body: 'Reps cover hundreds of accounts and can’t manually track who is heating up today.' },
  { icon: 'activity', title: 'Signals are scattered', body: 'Web visits, email engagement, intent and hiring data live in different tools with no single view.' },
  { icon: 'alert', title: 'Black-box scores', body: '“AI score: 86” with no explanation doesn’t get trusted, so it doesn’t get acted on.' },
];

const PRINCIPLES = [
  { icon: 'gauge', title: 'Deterministic where trust matters', body: 'Scores and next actions are pure rules: reproducible, testable, auditable in a pipeline review.' },
  { icon: 'sparkles', title: 'AI where language matters', body: 'The LLM only interprets structured evidence and drafts outreach. It never touches a number.' },
  { icon: 'shield', title: 'Never invent data', body: 'No contacts? The UI says so. Weak evidence? “Insufficient signals.” Silence beats a confident guess.' },
  { icon: 'refresh', title: 'Degrade gracefully', body: 'If the AI is down, rate-limited or returns garbage, everything except the AI panel keeps working.' },
  { icon: 'trending-up', title: 'Explain every point', body: 'Every score change is attributed to real signals, and the drivers always sum to the delta.' },
  { icon: 'crosshair', title: 'Resist gaming', body: 'Per-type caps, dedupe keys and future-timestamp checks stop spam or bad data from inflating scores.' },
];

const EDGE_CASES = [
  ['No activity', 'Recency 0, “Monitor account”'],
  ['Old activity', '> 14 days: 0 recency; > 30 days: not scored'],
  ['Repeated signals', 'Per-type caps; total can never exceed 100'],
  ['Exact duplicates', 'DB unique key; API returns 409'],
  ['Future timestamps', 'Excluded from scoring and flagged'],
  ['No contacts', '“No relevant contact identified”'],
  ['No decision-maker', 'Falls back to the best available contact'],
  ['No product signals', '“Insufficient signals”, never a guess'],
  ['Missing fields', 'Renders “unknown”, scores 0 for that rule'],
  ['AI failure', 'Friendly fallback; scoring unaffected'],
];

export function HomePage() {
  const [list, setList] = useState<AccountListResponse | null>(null);
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listAccounts('ALL', 'score_change')
      .then(async (l) => {
        if (!alive) return;
        setList(l);
        const hero = l.accounts.find((a) => a.name === 'Acme Technologies') ?? l.accounts[0];
        if (!hero) return;
        const [i, t] = await Promise.all([api.intelligence(hero.id), api.timeline(hero.id)]);
        if (alive) {
          setIntel(i);
          setTimeline(t);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const topMover = list?.accounts[0];

  return (
    <div className="home">
      {/* Hero ------------------------------------------------------------ */}
      <section className="home-hero">
        <div className="home-hero-text">
          <span className="home-kicker">
            <Icon name="zap" size={13} /> AI Account Intelligence & Next-Best-Action Engine
          </span>
          <h1>
            Which account should sales focus on <span className="grad-text">right now</span>, and what should they do next?
          </h1>
          <p className="home-lead">
            This product turns raw buying signals into an <strong>explainable score</strong>, tells reps{' '}
            <strong>what changed and why</strong>, <strong>who to contact</strong>, and drafts <strong>what to say</strong>, with
            deterministic rules for every number and AI only for the words.
          </p>
          <div className="home-cta">
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/accounts')}>
              Open live dashboard <Icon name="arrow-right" size={16} />
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => scrollTo('how-it-works')}>
              See how it works
            </button>
          </div>
          {list && list.summary.total > 0 && (
            <div className="hero-stats">
              <Stat value={list.summary.total} label="accounts scored" />
              <Stat value={list.summary.high} label="high priority" />
              <Stat value={113} label="backend tests" />
            </div>
          )}
        </div>

        <div className="home-hero-visual" aria-hidden={!topMover}>
          {topMover ? (
            <button className="hero-card" onClick={() => navigate(`/accounts/${topMover.id}`)}>
              <span className="hero-card-kicker">
                <span className="status-dot" /> Live · biggest mover today
              </span>
              <span className="hero-card-name">{topMover.name}</span>
              <span className="hero-card-row">
                <span className="hero-card-score">{topMover.score}</span>
                <span className="hero-card-delta">
                  <Icon name="trending-up" size={16} /> {topMover.scoreChange.delta >= 0 ? '+' : ''}
                  {topMover.scoreChange.delta} since yesterday
                </span>
              </span>
              <span className="hero-card-steps">
                <span><Icon name="activity" size={13} /> {topMover.latestSignal?.title ?? 'New activity'}</span>
                <span><Icon name="target" size={13} /> {topMover.recommendedAction.label}</span>
              </span>
              <span className="hero-card-open">
                Open account <Icon name="arrow-right" size={14} />
              </span>
            </button>
          ) : (
            <div className="hero-card hero-card-empty">
              <span className="muted">Start the backend and seed the demo data to see live accounts here.</span>
            </div>
          )}
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
        </div>
      </section>

      {/* Problem --------------------------------------------------------- */}
      <section className="home-section">
        <div className="section-head">
          <span className="page-eyebrow">The problem</span>
          <h2>Sales teams drown in signals but starve for direction</h2>
        </div>
        <div className="problem-grid">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="problem-card">
              <span className="problem-icon" aria-hidden="true">
                <Icon name={p.icon} size={18} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline -------------------------------------------------------- */}
      <section className="home-section" id="how-it-works">
        <div className="section-head">
          <span className="page-eyebrow">How it works</span>
          <h2>From raw signal to a message a rep can send</h2>
          <p className="section-sub">Seven steps, six of them deterministic. Click any step; each one shows real data from the hero account.</p>
        </div>
        <PipelineExplorer intel={intel} timeline={timeline} />
      </section>

      {/* Simulator ------------------------------------------------------- */}
      <section className="home-section" id="simulator">
        <div className="section-head">
          <span className="page-eyebrow">Try the scoring model</span>
          <h2>Change the inputs, watch the score and action respond</h2>
          <p className="section-sub">
            The same rules the backend uses. Load <em>Acme · yesterday</em> (61) then <em>Acme · today</em> (86) to reproduce the
            +25 jump, or <em>Bot spam</em> to watch the caps absorb 240 fake signals.
          </p>
        </div>
        <ScoreSimulator />
      </section>

      {/* Principles ------------------------------------------------------ */}
      <section className="home-section">
        <div className="section-head">
          <span className="page-eyebrow">Design principles</span>
          <h2>The decisions behind the product</h2>
        </div>
        <div className="principle-grid">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="principle-card">
              <span className="principle-icon" aria-hidden="true">
                <Icon name={p.icon} size={17} />
              </span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture ---------------------------------------------------- */}
      <section className="home-section">
        <div className="section-head">
          <span className="page-eyebrow">Architecture</span>
          <h2>Where each responsibility lives</h2>
        </div>
        <div className="arch">
          <div className="arch-col">
            <div className="arch-box arch-fe">
              <span className="arch-tag">Frontend</span>
              <strong>React + Vite + TypeScript</strong>
              <span>Dashboard, account intelligence, Recharts, command palette</span>
            </div>
          </div>
          <div className="arch-arrow" aria-hidden="true">
            <span>/api/*</span>
            <Icon name="arrow-right" size={20} />
          </div>
          <div className="arch-col arch-be-col">
            <div className="arch-box arch-be">
              <span className="arch-tag">Backend · FastAPI + Pydantic</span>
              <div className="arch-engines">
                <span><Icon name="gauge" size={13} /> Scoring engine</span>
                <span><Icon name="trending-up" size={13} /> Change attribution</span>
                <span><Icon name="users" size={13} /> Persona ranking</span>
                <span><Icon name="package" size={13} /> Product inference</span>
                <span><Icon name="target" size={13} /> Next-action rules</span>
                <span className="is-ai"><Icon name="sparkles" size={13} /> AI analyst + grounding</span>
              </div>
            </div>
            <div className="arch-row">
              <div className="arch-box arch-db">
                <span className="arch-tag">SQLite · SQLAlchemy</span>
                <span>Accounts · Contacts · Activities · Score snapshots</span>
              </div>
              <div className="arch-box arch-ai">
                <span className="arch-tag">OpenRouter</span>
                <span>openrouter/free · key stays server-side</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Edge cases ------------------------------------------------------ */}
      <section className="home-section">
        <div className="section-head">
          <span className="page-eyebrow">Real-world data is messy</span>
          <h2>Edge cases handled on purpose</h2>
        </div>
        <div className="edge-grid">
          {EDGE_CASES.map(([title, body]) => (
            <div key={title} className="edge-card">
              <Icon name="check" size={14} />
              <div>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA ------------------------------------------------------------- */}
      <section className="home-final">
        <h2>See it on real accounts</h2>
        <p>15 seeded B2B accounts covering every scenario above, plus a live AI analyst.</p>
        <div className="home-cta">
          <button className="btn btn-light btn-lg" onClick={() => navigate('/accounts')}>
            Open the dashboard <Icon name="arrow-right" size={16} />
          </button>
          {topMover && (
            <button className="btn btn-outline-light btn-lg" onClick={() => navigate(`/accounts/${topMover.id}`)}>
              Jump to {topMover.name}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
