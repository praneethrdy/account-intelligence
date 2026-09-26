import { emit } from '../services/events';
import { formatNumber, hostname, relativeTime } from '../services/format';
import type { Account, ScoreBreakdown, ScoreChange } from '../types';
import { Icon, avatarStyle } from './Icon';
import { PriorityBadge } from './PriorityBadge';
import { ScoreDelta } from './ScoreDelta';
import { ScoreGauge } from './ScoreGauge';

interface Props {
  account: Account;
  score: ScoreBreakdown;
  change: ScoreChange;
  lastActivityAt: string | null;
}

function Fact({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="fact">
      <span className="fact-icon" aria-hidden="true">
        <Icon name={icon} size={15} />
      </span>
      <div className="fact-text">
        <span className="fact-label">{label}</span>
        <span className="fact-value">{children}</span>
      </div>
    </div>
  );
}

export function AccountHeader({ account, score, change, lastActivityAt }: Props) {
  const site = hostname(account.website);
  return (
    <section className="account-hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-left">
        <div className="hero-identity">
          <span className="avatar avatar-brand avatar-xl" style={avatarStyle(account.name)} aria-hidden="true">
            {account.name.charAt(0)}
          </span>
          <div className="hero-titles">
            <span className="page-eyebrow">Account intelligence</span>
            <h1 className="hero-name">{account.name}</h1>
            <div className="hero-badges">
              <PriorityBadge priority={score.priority} size="lg" />
              {change.hasPrevious ? (
                <ScoreDelta delta={change.delta} suffix="since yesterday" />
              ) : (
                <span className="muted small">No earlier score to compare</span>
              )}
            </div>
          </div>
        </div>
        <div className="facts">
          <Fact icon="building" label="Industry">{account.industry ?? 'Unknown'}</Fact>
          <Fact icon="users" label="Employees">
            {account.employeeCount != null ? formatNumber(account.employeeCount) : 'Employee count unknown'}
          </Fact>
          <Fact icon="globe" label="Website">
            {site && account.website ? (
              <a href={account.website} target="_blank" rel="noreferrer noopener">
                {site} <Icon name="external" size={11} />
              </a>
            ) : (
              <span className="muted">No website on file</span>
            )}
          </Fact>
          <Fact icon="clock" label="Last activity">{lastActivityAt ? relativeTime(lastActivityAt) : 'None recorded'}</Fact>
        </div>
      </div>
      <div className="hero-score">
        <ScoreGauge score={score.total} />
        <div className="hero-score-parts">
          {(
            [
              ['fit', 'Fit', score.fit, 30],
              ['intent', 'Intent', score.intent, 30],
              ['engagement', 'Engagement', score.engagement, 20],
              ['recency', 'Recency', score.recency, 20],
            ] as const
          ).map(([key, label, v, max]) => (
            <button
              key={label}
              className="part part-btn"
              onClick={() => emit('focus-score-component', { key })}
              title={`See how ${label} was calculated`}
            >
              <span className="part-label">{label}</span>
              <span className="part-bar" aria-hidden="true">
                <span style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span className="part-value num">
                {v}<span className="muted">/{max}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
