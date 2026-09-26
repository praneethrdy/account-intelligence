import type { DashboardSummary, PriorityFilter } from '../types';
import { Icon } from './Icon';

interface Props {
  summary: DashboardSummary;
  active: PriorityFilter;
  onSelect: (p: PriorityFilter) => void;
}

export function SummaryCards({ summary, active, onSelect }: Props) {
  const cards: { key: PriorityFilter; label: string; value: number; hint: string; icon: string }[] = [
    { key: 'ALL', label: 'Total accounts', value: summary.total, hint: 'In your territory', icon: 'layers' },
    { key: 'HIGH', label: 'High priority', value: summary.high, hint: 'Score 80–100 · act now', icon: 'flame' },
    { key: 'MEDIUM', label: 'Medium priority', value: summary.medium, hint: 'Score 50–79 · engage', icon: 'activity' },
    { key: 'LOW', label: 'Low priority', value: summary.low, hint: 'Score 0–49 · nurture', icon: 'pause' },
  ];
  return (
    <div className="stat-grid">
      {cards.map((c, i) => {
        const share = summary.total ? Math.round((c.value / summary.total) * 100) : 0;
        return (
          <button
            key={c.key}
            className={`stat-card stat-${c.key.toLowerCase()} ${active === c.key ? 'is-active' : ''}`}
            onClick={() => onSelect(c.key)}
            aria-pressed={active === c.key}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className="stat-top">
              <span className="stat-label">{c.label}</span>
              <span className="stat-icon" aria-hidden="true">
                <Icon name={c.icon} size={16} />
              </span>
            </span>
            <span className="stat-value">{c.value}</span>
            <span className="stat-meter" aria-hidden="true">
              <span style={{ width: `${c.key === 'ALL' ? 100 : share}%` }} />
            </span>
            <span className="stat-hint">
              {c.key === 'ALL' ? c.hint : `${share}% of accounts · ${c.hint.split(' · ')[1]}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
