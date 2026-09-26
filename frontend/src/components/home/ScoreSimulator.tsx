import { useMemo, useState } from 'react';
import { RECENCY, PRESETS, RULES, SIGNAL_ORDER, emptyCounts, simulate, type SignalKey, type SimInput } from '../../services/scoringModel';
import { ACTION_ICON, ACTIVITY_ICON, Icon } from '../Icon';
import { PriorityBadge } from '../PriorityBadge';
import { ScoreGauge } from '../ScoreGauge';

function worth(key: SignalKey): string {
  const r = RULES[key];
  const parts: string[] = [];
  if (r.intent) parts.push(`Intent +${r.intent[0]} (max ${r.intent[1]}×)`);
  if (r.engagement) parts.push(`Engagement +${r.engagement[0]} (max ${r.engagement[1]}×)`);
  return parts.join(' · ');
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={`${label} count`}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0} aria-label={`Remove one ${label}`}>
        −
      </button>
      <span className="num" aria-live="polite">
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(999, value + 1))} aria-label={`Add one ${label}`}>
        +
      </button>
    </div>
  );
}

export function ScoreSimulator() {
  const [input, setInput] = useState<SimInput>(PRESETS[0].input);
  const [preset, setPreset] = useState<string | null>(PRESETS[0].key);
  const result = useMemo(() => simulate(input), [input]);

  const update = (patch: Partial<SimInput>) => {
    setPreset(null);
    setInput((i) => ({ ...i, ...patch }));
  };
  const setCount = (key: SignalKey, n: number) => update({ counts: { ...input.counts, [key]: n } });

  const parts = [
    { key: 'fit', label: 'Fit', v: result.fit, max: 30 },
    { key: 'intent', label: 'Intent', v: result.intent, max: 30, raw: result.intentRaw },
    { key: 'engagement', label: 'Engagement', v: result.engagement, max: 20, raw: result.engagementRaw },
    { key: 'recency', label: 'Recency', v: result.recency, max: 20 },
  ];

  return (
    <div className="sim">
      <div className="sim-presets" role="group" aria-label="Scenario presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`sim-preset ${preset === p.key ? 'is-active' : ''}`}
            onClick={() => {
              setPreset(p.key);
              setInput(p.input);
            }}
            aria-pressed={preset === p.key}
          >
            <span className="sim-preset-label">{p.label}</span>
            <span className="sim-preset-hint">{p.hint}</span>
          </button>
        ))}
        <button
          className="sim-preset sim-reset"
          onClick={() => update({ counts: emptyCounts(), industryMatch: false, sizeMatch: false, hasDecisionMaker: false, recency: 'older' })}
        >
          <span className="sim-preset-label">
            <Icon name="refresh" size={13} /> Reset
          </span>
          <span className="sim-preset-hint">Start from zero</span>
        </button>
      </div>

      <div className="sim-grid">
        <div className="sim-controls">
          <div className="sim-block">
            <div className="sim-block-head">
              <span className="eyebrow">1 · Firmographic fit</span>
              <span className="sim-block-pts num">{result.fit}/30</span>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={input.industryMatch} onChange={(e) => update({ industryMatch: e.target.checked })} />
              <span className="toggle-ui" aria-hidden="true" />
              <span>Target industry <span className="muted">(+15)</span></span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={input.sizeMatch} onChange={(e) => update({ sizeMatch: e.target.checked })} />
              <span className="toggle-ui" aria-hidden="true" />
              <span>200–5,000 employees <span className="muted">(+15)</span></span>
            </label>
          </div>

          <div className="sim-block">
            <div className="sim-block-head">
              <span className="eyebrow">2 · Signals in the last 30 days</span>
            </div>
            <ul className="sim-signals">
              {SIGNAL_ORDER.map((key) => {
                const isCapped = result.capped.includes(key);
                return (
                  <li key={key} className={input.counts[key] > 0 ? 'is-on' : ''}>
                    <span className="sim-signal-icon" aria-hidden="true">
                      <Icon name={ACTIVITY_ICON[key]} size={14} />
                    </span>
                    <span className="sim-signal-text">
                      <span className="sim-signal-label">
                        {RULES[key].label}
                        {isCapped && <span className="cap-tag">capped</span>}
                      </span>
                      <span className="sim-signal-worth">{worth(key)}</span>
                    </span>
                    <Stepper value={input.counts[key]} onChange={(n) => setCount(key, n)} label={RULES[key].label} />
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sim-block">
            <div className="sim-block-head">
              <span className="eyebrow">3 · Most recent meaningful activity</span>
              <span className="sim-block-pts num">{result.recency}/20</span>
            </div>
            <div className="segmented segmented-sm sim-recency" role="group" aria-label="Recency">
              {RECENCY.map((r) => (
                <button key={r.key} className={input.recency === r.key ? 'is-active' : ''} aria-pressed={input.recency === r.key} onClick={() => update({ recency: r.key })}>
                  {r.label}
                </button>
              ))}
            </div>
            <label className="toggle">
              <input type="checkbox" checked={input.hasDecisionMaker} onChange={(e) => update({ hasDecisionMaker: e.target.checked })} />
              <span className="toggle-ui" aria-hidden="true" />
              <span>Decision-maker contact on file</span>
            </label>
          </div>
        </div>

        <div className="sim-output" aria-live="polite">
          <div className="sim-score">
            <ScoreGauge score={result.total} size={160} />
            <PriorityBadge priority={result.priority} size="lg" />
          </div>
          <div className="sim-parts">
            {parts.map((p) => (
              <div key={p.key} className="sim-part">
                <div className="sim-part-head">
                  <span>{p.label}</span>
                  <span className="num">
                    <strong>{p.v}</strong>
                    <span className="muted">/{p.max}</span>
                  </span>
                </div>
                <div className="part-bar" aria-hidden="true">
                  <span style={{ width: `${(p.v / p.max) * 100}%` }} />
                </div>
                {p.raw !== undefined && p.raw > p.max && (
                  <div className="sim-part-note">
                    Raw {p.raw} → capped at {p.max}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={`sim-action action-${result.action.toLowerCase()}`}>
            <span className="sim-action-icon" aria-hidden="true">
              <Icon name={ACTION_ICON[result.action]} size={18} />
            </span>
            <div>
              <span className="eyebrow">Next best action</span>
              <div className="sim-action-label">{result.actionLabel}</div>
              <div className="sim-action-why">{result.actionWhy}</div>
            </div>
          </div>
          {result.capped.length > 0 && (
            <div className="sim-caps">
              <div className="sim-caps-head">
                <Icon name="shield" size={14} /> Anti-gaming caps in effect
              </div>
              <ul>
                {result.capped.map((k) => {
                  const r = RULES[k];
                  const max = Math.max(r.intent?.[1] ?? 0, r.engagement?.[1] ?? 0);
                  const n = input.counts[k];
                  return (
                    <li key={k}>
                      {r.label}: <strong>{max}</strong> of {n} counted, <strong>{n - max}</strong> ignored
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {input.counts.EMAIL_OPEN > 0 && result.recency === 0 && input.recency !== 'older' && (
            <div className="sim-note">
              <Icon name="info" size={13} /> Email opens alone never refresh recency, because bots and privacy proxies trigger them.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
