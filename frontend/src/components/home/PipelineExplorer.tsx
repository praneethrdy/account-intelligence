import { useEffect, useState } from 'react';
import { navigate } from '../../hooks/useRoute';
import { relativeTime, signed } from '../../services/format';
import type { Intelligence, TimelineResponse } from '../../types';
import { ACTION_ICON, ACTIVITY_ICON, Icon } from '../Icon';
import { PriorityBadge } from '../PriorityBadge';

interface Props {
  intel: Intelligence | null;
  timeline: TimelineResponse | null;
}

const STEPS = [
  { key: 'signals', icon: 'activity', title: 'Collect signals', blurb: 'Website, email, content, demo requests and company triggers, each stored with a timestamp and metadata.' },
  { key: 'score', icon: 'gauge', title: 'Score deterministically', blurb: 'Fit + Intent + Engagement + Recency = 0–100. Pure rules with caps, so it is reproducible and auditable.' },
  { key: 'changed', icon: 'trending-up', title: 'Explain what changed', blurb: 'Compare with yesterday’s snapshot and attribute every point of the delta to a real signal.' },
  { key: 'why', icon: 'info', title: 'Why it matters', blurb: 'Turn the drivers into a plain-English narrative and infer the likely product from activity content.' },
  { key: 'who', icon: 'users', title: 'Who to contact', blurb: 'Map job titles to buying personas and rank contacts, boosting the ones who actually engaged.' },
  { key: 'action', icon: 'target', title: 'Decide the next action', blurb: 'An ordered rules engine picks one of five actions, with an explicit fallback for missing data.' },
  { key: 'ai', icon: 'sparkles', title: 'Write the message (AI)', blurb: 'An LLM turns the structured evidence into a summary and outreach draft, grounded only in real data.' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

function StepDetail({ step, intel, timeline }: { step: StepKey; intel: Intelligence; timeline: TimelineResponse | null }) {
  const s = intel.score.current;
  const wc = intel.whatChanged;
  switch (step) {
    case 'signals':
      return (
        <ul className="pe-signals">
          {(timeline?.items ?? []).slice(0, 5).map((i) => (
            <li key={i.id}>
              <span className={`pe-sig-icon tl-${i.category}`} aria-hidden="true">
                <Icon name={ACTIVITY_ICON[i.activityType] ?? 'activity'} size={14} />
              </span>
              <span className="pe-sig-text">
                <span>{i.title}</span>
                <span className="muted small">{i.detail}</span>
              </span>
              <span className="muted small">{relativeTime(i.timestamp)}</span>
            </li>
          ))}
        </ul>
      );
    case 'score':
      return (
        <div className="pe-score">
          <div className="pe-total">
            <span className="pe-total-num">{s.total}</span>
            <span className="muted">/ 100</span>
            <PriorityBadge priority={s.priority} />
          </div>
          <div className="pe-eq">
            {(
              [
                ['Fit', s.fit, 30],
                ['Intent', s.intent, 30],
                ['Engagement', s.engagement, 20],
                ['Recency', s.recency, 20],
              ] as const
            ).map(([l, v, m], idx) => (
              <span key={l} className="pe-eq-part">
                {idx > 0 && <span className="pe-plus">+</span>}
                <span className="pe-chip">
                  <strong>{v}</strong>
                  <span className="muted">/{m}</span>
                  <span className="pe-chip-label">{l}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      );
    case 'changed':
      return (
        <div>
          <div className="pe-delta">
            <span className="pe-delta-prev">{wc.previousScore ?? '—'}</span>
            <Icon name="arrow-right" size={18} />
            <span className="pe-delta-now">{wc.currentScore}</span>
            <span className={`pe-delta-chip ${wc.delta >= 0 ? 'up' : 'down'}`}>{signed(wc.delta)}</span>
          </div>
          <ul className="pe-drivers">
            {wc.drivers.slice(0, 4).map((d, i) => (
              <li key={i}>
                <span className={`num ${d.points >= 0 ? 'delta-up' : 'delta-down'}`}>{signed(d.points)}</span>
                {d.label}
              </li>
            ))}
          </ul>
          <p className="pe-footnote">The drivers always add up exactly to the real delta, including cap effects.</p>
        </div>
      );
    case 'why':
      return (
        <div>
          <blockquote className="pe-quote">{wc.explanation}</blockquote>
          <div className="pe-product">
            <span className="eyebrow">Likely product interest</span>
            <strong>{intel.productInterest.product}</strong>
            {intel.productInterest.confidence !== 'none' && <span className="tag tag-conf-high">{intel.productInterest.confidence} confidence</span>}
          </div>
        </div>
      );
    case 'who': {
      const c = intel.contacts.primaryContact;
      return c ? (
        <div className="pe-contact">
          <span className="avatar avatar-primary avatar-person" aria-hidden="true">
            {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </span>
          <div>
            <strong>{c.name}</strong>
            <div className="muted">{c.jobTitle}</div>
            <div className="chip-row">
              <span className="tag tag-persona">{c.persona}</span>
              {c.isDecisionMaker && <span className="tag tag-dm">Decision-maker</span>}
              {c.engaged && <span className="tag tag-engaged">● Engaged recently</span>}
            </div>
          </div>
        </div>
      ) : (
        <p className="muted">No relevant contact identified, and none is invented.</p>
      );
    }
    case 'action':
      return (
        <div className="pe-action">
          <span className="pe-action-icon" aria-hidden="true">
            <Icon name={ACTION_ICON[intel.nextBestAction.action]} size={20} />
          </span>
          <div>
            <strong className="pe-action-label">{intel.nextBestAction.label}</strong>
            <p>{intel.nextBestAction.explanation}</p>
          </div>
        </div>
      );
    case 'ai':
      return (
        <div className="pe-ai">
          <ul className="pe-guards">
            <li><Icon name="check" size={13} /> Receives structured facts only, never raw database rows</li>
            <li><Icon name="check" size={13} /> Forbidden from inventing people, activities, pricing or outcomes</li>
            <li><Icon name="check" size={13} /> Must stay consistent with the deterministic next action</li>
            <li><Icon name="check" size={13} /> Output is validated in code; the UI falls back gracefully if the AI fails</li>
          </ul>
          <button className="btn btn-ai" onClick={() => navigate(`/accounts/${intel.account.id}`)}>
            <Icon name="sparkles" size={15} /> Try “Analyze Account” on {intel.account.name}
          </button>
        </div>
      );
  }
}

export function PipelineExplorer({ intel, timeline }: Props) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!playing || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4500);
    return () => clearInterval(t);
  }, [playing]);

  const step = STEPS[active];
  return (
    <div className="pe">
      <ol className="pe-steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button
              className={`pe-step ${i === active ? 'is-active' : ''} ${i < active ? 'is-done' : ''} ${s.key === 'ai' ? 'is-ai' : ''}`}
              onClick={() => {
                setActive(i);
                setPlaying(false);
              }}
              aria-current={i === active ? 'step' : undefined}
            >
              <span className="pe-step-num">{i + 1}</span>
              <span className="pe-step-title">{s.title}</span>
              {i === active && playing && <span className="pe-progress" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ol>
      <div className="pe-panel" key={step.key}>
        <div className="pe-panel-head">
          <span className={`pe-panel-icon ${step.key === 'ai' ? 'is-ai' : ''}`} aria-hidden="true">
            <Icon name={step.icon} size={20} />
          </span>
          <div>
            <span className="eyebrow">
              Step {active + 1} of {STEPS.length} {step.key === 'ai' ? '· AI' : '· deterministic'}
            </span>
            <h3>{step.title}</h3>
            <p className="muted">{step.blurb}</p>
          </div>
          <button className="icon-btn pe-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'} title={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={15} />
          </button>
        </div>
        <div className="pe-live">
          <span className="pe-live-tag">
            <span className="status-dot" /> Live example · {intel?.account.name ?? 'loading…'}
          </span>
          {intel ? <StepDetail step={step.key} intel={intel} timeline={timeline} /> : <div className="preview-loading"><div /><div /><div /></div>}
        </div>
        <div className="pe-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => { setPlaying(false); setActive((a) => (a - 1 + STEPS.length) % STEPS.length); }}>
            <Icon name="arrow-left" size={14} /> Previous
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPlaying(false); setActive((a) => (a + 1) % STEPS.length); }}>
            Next <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
