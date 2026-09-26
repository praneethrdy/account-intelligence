import { emit } from '../services/events';
import { relativeTime, signed } from '../services/format';
import type { ChangeDriver, WhatChanged as WhatChangedT } from '../types';
import { ACTIVITY_ICON, Icon } from './Icon';
import { ScoreDelta } from './ScoreDelta';
import { Card } from './States';

function driverIcon(d: ChangeDriver): string {
  if (d.activityType) return ACTIVITY_ICON[d.activityType] ?? 'activity';
  if (d.kind === 'recency') return 'clock';
  if (d.kind === 'fit') return 'building';
  if (d.kind === 'decay') return 'history';
  return 'info';
}

export function WhatChanged({ data }: { data: WhatChangedT }) {
  if (!data.hasPrevious) {
    return (
      <Card title="What changed?" icon="trending-up" className="what-changed">
        <p className="muted">{data.explanation}</p>
      </Card>
    );
  }
  const maxAbs = Math.max(1, ...data.drivers.map((d) => Math.abs(d.points)));
  return (
    <Card
      title="What changed?"
      icon="trending-up"
      subtitle={
        data.previousAt
          ? `Compared with the score from ${relativeTime(data.previousAt)} · click a signal to find it in the timeline`
          : undefined
      }
      className="what-changed"
    >
      <div className="wc-compare">
        <div className="wc-cell">
          <span className="eyebrow">Yesterday</span>
          <span className="wc-num wc-prev">{data.previousScore}</span>
        </div>
        <span className="wc-arrow" aria-hidden="true">
          <Icon name="arrow-right" size={20} />
        </span>
        <div className="wc-cell">
          <span className="eyebrow">Today</span>
          <span className="wc-num">{data.currentScore}</span>
        </div>
        <div className="wc-cell wc-change">
          <span className="eyebrow">Change</span>
          <span className="wc-num wc-delta">
            <ScoreDelta delta={data.delta} pill={false} />
          </span>
        </div>
      </div>

      {data.drivers.length > 0 ? (
        <ul className="drivers" aria-label="Signals responsible for the change">
          {data.drivers.map((d, i) => {
            const clickable = d.activityId != null;
            const Tag = clickable ? 'button' : 'div';
            return (
            <li key={i}>
              <Tag
                className={`driver driver-${d.points >= 0 ? 'up' : 'down'} ${clickable ? 'driver-link' : ''}`}
                {...(clickable
                  ? { onClick: () => emit('highlight-activity', { id: d.activityId as number }), type: 'button' as const }
                  : {})}
              >
              <span className="driver-icon" aria-hidden="true">
                <Icon name={driverIcon(d)} size={15} />
              </span>
              <div className="driver-body">
                <div className="driver-label">
                  <span>{d.label}</span>
                  <span className="driver-pts num">{signed(d.points)}</span>
                </div>
                <div className="driver-bar" aria-hidden="true">
                  <div style={{ width: `${(Math.abs(d.points) / maxAbs) * 100}%` }} />
                </div>
                <div className="driver-meta">
                  {d.timestamp && <span>{relativeTime(d.timestamp)}</span>}
                  {d.note && <span>{d.note}</span>}
                  {clickable && (
                    <span className="driver-jump">
                      <Icon name="crosshair" size={12} /> Show in timeline
                    </span>
                  )}
                </div>
              </div>
              </Tag>
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">No score-moving signals since the previous snapshot.</p>
      )}

      <div className="wc-explanation">
        <span className="wc-explanation-icon" aria-hidden="true">
          <Icon name="info" size={16} />
        </span>
        <div>
          <span className="eyebrow">Why it changed</span>
          {data.explanation}
        </div>
      </div>
    </Card>
  );
}
