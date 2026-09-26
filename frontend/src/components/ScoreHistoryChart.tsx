import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { shortDate } from '../services/format';
import type { ScorePoint } from '../types';
import { axisTick, tooltipStyle } from './chartTheme';
import { Card } from './States';

export function ScoreHistoryChart({ history }: { history: ScorePoint[] }) {
  const data = history.map((h) => ({ ...h, t: new Date(h.calculatedAt).getTime() }));
  return (
    <Card icon="history" title="Score history" subtitle="Snapshots of the account score over time">
      {data.length < 2 ? (
        <p className="muted small">Not enough history yet. The chart appears once there are two or more score snapshots.</p>
      ) : (
        <div className="chart-box" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => shortDate(new Date(t).toISOString())}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: 'var(--axis)' }}
                minTickGap={24}
              />
              <YAxis domain={[0, 100]} ticks={[0, 50, 80, 100]} tick={axisTick} tickLine={false} axisLine={false} />
              <ReferenceLine
                y={80}
                stroke="var(--axis)"
                strokeDasharray="4 4"
                label={{ value: 'High', position: 'right', fill: 'var(--text-muted)', fontSize: 11 }}
              />
              <ReferenceLine
                y={50}
                stroke="var(--axis)"
                strokeDasharray="4 4"
                label={{ value: 'Medium', position: 'right', fill: 'var(--text-muted)', fontSize: 11 }}
              />
              <Tooltip
                cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                contentStyle={tooltipStyle}
                labelFormatter={(t) =>
                  new Date(t as number).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                }
                formatter={(v: number, _n, item) => {
                  const p = item.payload as ScorePoint;
                  return [`${v}  (fit ${p.fit} · intent ${p.intent} · engagement ${p.engagement} · recency ${p.recency})`, 'Score'];
                }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
