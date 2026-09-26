import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { shortDate } from '../services/format';
import type { TrendPoint } from '../types';
import { axisTick, tooltipStyle } from './chartTheme';
import { Card } from './States';

// Fixed categorical order (validated palette slots 1–3); color follows the series.
const SERIES = [
  { key: 'intent', label: 'Intent signals', color: 'var(--series-1)' },
  { key: 'engagement', label: 'Engagement', color: 'var(--series-2)' },
  { key: 'trigger', label: 'Company triggers', color: 'var(--series-3)' },
] as const;

export function ActivityTrendChart({ trend }: { trend: TrendPoint[] }) {
  const total = trend.reduce((s, d) => s + d.intent + d.engagement + d.trigger, 0);
  const data = trend.map((d) => ({ ...d, label: shortDate(`${d.date}T12:00:00`) }));
  return (
    <Card icon="bar-chart" title="Activity trend" subtitle="Signals per day, last 14 days">
      {total === 0 ? (
        <p className="muted small">No activity in the last 14 days.</p>
      ) : (
        <div className="chart-box" style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="22%">
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ ...axisTick, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--axis)' }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--hover-wash)' }} contentStyle={tooltipStyle} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
              {SERIES.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId="a"
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
