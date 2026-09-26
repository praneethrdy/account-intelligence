import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { on } from '../services/events';
import type { ScoreComponent } from '../types';
import { Icon } from './Icon';
import { Card } from './States';

const RULES: Record<ScoreComponent['key'], string> = {
  fit: 'Target industry +15 · target size (200–5,000 employees) +15',
  intent: 'Demo 15 · pricing 8 · product page 4 · content 3 · hiring/expansion 5 — per-type caps, last 30 days',
  engagement: 'Decision-maker 8 · email click 4 · content 3 · email open 2 · visit 1 — per-type caps, last 30 days',
  recency: '≤24h 20 · ≤3d 15 · ≤7d 10 · ≤14d 5 · older 0 (email opens ignored)',
};

/** Points per component vs. its maximum. Click a bar or pill to see how it was calculated. */
export function ScoreBreakdownChart({ components }: { components: ScoreComponent[] }) {
  const [selected, setSelected] = useState<ScoreComponent['key']>('intent');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      on('focus-score-component', ({ key }) => {
        setSelected(key);
        const el = cardRef.current;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('flash');
        void el.offsetWidth; // restart the animation
        el.classList.add('flash');
      }),
    [],
  );

  const data = components.map((c) => ({
    key: c.key,
    name: c.label,
    pct: c.max ? Math.round((c.points / c.max) * 100) : 0,
    label: `${c.points} / ${c.max}`,
  }));
  const current = components.find((c) => c.key === selected) ?? components[0];

  return (
    <div ref={cardRef} className="breakdown-wrap">
      <Card icon="gauge" title="Score breakdown" subtitle="Click a component to see exactly how it was calculated">
        <div className="chart-box" style={{ height: 172 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 2, right: 4, bottom: 2, left: 0 }} barCategoryGap={12}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                yAxisId="name"
                type="category"
                dataKey="name"
                width={92}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--text-secondary)', fontSize: 13 }}
              />
              <YAxis
                yAxisId="value"
                orientation="right"
                type="category"
                dataKey="label"
                width={56}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--text-primary)', fontSize: 12.5, fontWeight: 600 }}
              />
              <Bar
                yAxisId="name"
                dataKey="pct"
                radius={[0, 4, 4, 0]}
                background={{ fill: 'var(--track)', radius: 4 }}
                barSize={14}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(d: { key?: ScoreComponent['key'] }) => d?.key && setSelected(d.key)}
              >
                {data.map((d) => (
                  <Cell key={d.key} fill="var(--series-1)" fillOpacity={d.key === selected ? 1 : 0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pill-tabs" role="tablist" aria-label="Score components">
          {components.map((c) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={c.key === selected}
              className={`pill-tab ${c.key === selected ? 'is-active' : ''}`}
              onClick={() => setSelected(c.key)}
            >
              {c.label}
              <span className="num">
                {c.points}/{c.max}
              </span>
            </button>
          ))}
        </div>

        <div className="breakdown-panel" role="tabpanel" key={current.key}>
          <div className="breakdown-rule">
            <Icon name="info" size={13} /> {RULES[current.key]}
          </div>
          <ul className="breakdown-lines">
            {current.lines.map((l, i) => {
              const m = l.match(/^([+-]\d+)\s+(.*)$/);
              return (
                <li key={i}>
                  {m ? (
                    <>
                      <span className={`bl-pts num ${m[1] === '+0' ? 'is-zero' : ''}`}>{m[1]}</span>
                      <span>{m[2]}</span>
                    </>
                  ) : (
                    <>
                      <span className="bl-pts bl-note" aria-hidden="true">
                        <Icon name="chevron-right" size={12} />
                      </span>
                      <span>{l}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </div>
  );
}
