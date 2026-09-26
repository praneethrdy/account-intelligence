import { useEffect, useRef, useState } from 'react';
import { on } from '../services/events';
import { dayLabel, timeLabel } from '../services/format';
import type { TimelineItem } from '../types';
import { ACTIVITY_ICON, Icon } from './Icon';
import { Card, EmptyState } from './States';

type Filter = 'all' | 'intent' | 'engagement' | 'trigger';

const CATEGORY_LABEL: Record<TimelineItem['category'], string> = {
  intent: 'Intent',
  engagement: 'Engagement',
  trigger: 'Trigger',
  other: 'Other',
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'intent', label: 'Intent' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'trigger', label: 'Triggers' },
];

const INITIAL = 12;

export function Timeline({ items, message }: { items: TimelineItem[]; message: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [highlight, setHighlight] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Jump-to-signal from "What changed?": reset filters, expand, scroll, pulse.
  useEffect(
    () =>
      on('highlight-activity', ({ id }) => {
        setFilter('all');
        setExpanded(true);
        setHighlight(id);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            rootRef.current
              ?.querySelector(`[data-activity-id="${id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }),
        );
      }),
    [],
  );

  useEffect(() => {
    if (highlight == null) return;
    const t = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(t);
  }, [highlight]);

  if (items.length === 0) {
    return (
      <Card title="Account timeline" icon="activity">
        <EmptyState title="No meaningful activity detected." icon="activity">
          {message?.replace('No meaningful activity detected. ', '') ?? 'Insufficient signals to determine buying intent.'}
        </EmptyState>
      </Card>
    );
  }

  const counts: Record<Filter, number> = {
    all: items.length,
    intent: items.filter((i) => i.category === 'intent').length,
    engagement: items.filter((i) => i.category === 'engagement').length,
    trigger: items.filter((i) => i.category === 'trigger').length,
  };
  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const visible = expanded ? filtered : filtered.slice(0, INITIAL);
  const groups: { day: string; items: TimelineItem[] }[] = [];
  for (const item of visible) {
    const day = dayLabel(item.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <div ref={rootRef}>
      <Card
        title="Account timeline"
        icon="activity"
        subtitle={`${items.length} activities · newest first`}
        actions={
          <div className="chip-filter" role="group" aria-label="Filter timeline">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? 'is-active' : ''} chip-${f.key}`}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                disabled={counts[f.key] === 0}
              >
                {f.label}
                <span className="chip-count">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <p className="muted small">No {filter} signals for this account.</p>
        ) : (
          <div className="timeline">
            {groups.map((g) => (
              <div key={g.day} className="tl-group">
                <div className="tl-day">{g.day}</div>
                <ol className="tl-list">
                  {g.items.map((item) => (
                    <li
                      key={item.id}
                      data-activity-id={item.id}
                      className={`tl-item tl-${item.category} ${item.countedInScore ? '' : 'tl-excluded'} ${
                        highlight === item.id ? 'is-highlighted' : ''
                      }`}
                    >
                      <span className="tl-node" aria-hidden="true">
                        <Icon name={ACTIVITY_ICON[item.activityType] ?? 'activity'} size={14} />
                      </span>
                      <div className="tl-content">
                        <div className="tl-row">
                          <span className="tl-title">{item.title}</span>
                          <span className="tl-time">{timeLabel(item.timestamp)}</span>
                        </div>
                        {item.detail && <div className="tl-detail">{item.detail}</div>}
                        <div className="tl-tags">
                          <span className={`tag tag-${item.category}`}>{CATEGORY_LABEL[item.category]}</span>
                          {item.excludedReason && (
                            <span className={`tag ${item.isFuture ? 'tag-warn' : 'tag-muted'}`}>
                              {item.isFuture && <Icon name="alert" size={11} />}
                              {item.excludedReason}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        {filtered.length > INITIAL && (
          <button className="btn btn-ghost btn-block" onClick={() => setExpanded((e) => !e)}>
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
            {expanded ? 'Show fewer' : `Show all ${filtered.length} activities`}
          </button>
        )}
      </Card>
    </div>
  );
}
