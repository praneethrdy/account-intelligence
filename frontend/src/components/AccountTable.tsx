import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { navigate, useLinkHandler } from '../hooks/useRoute';
import { prefersReducedMotion } from '../services/events';
import { formatNumber, relativeTime } from '../services/format';
import type { AccountListItem, SortKey } from '../types';
import { AccountPreview } from './AccountPreview';
import { ACTION_ICON, ACTIVITY_ICON, Icon, avatarStyle } from './Icon';
import { PriorityBadge } from './PriorityBadge';
import { ScoreRing } from './ScoreBar';
import { ScoreDelta } from './ScoreDelta';

interface Props {
  accounts: AccountListItem[];
  sort: SortKey;
  onSort: (s: SortKey) => void;
}

function SortHeader({ label, k, sort, onSort }: { label: string; k: SortKey; sort: SortKey; onSort: (s: SortKey) => void }) {
  const active = sort === k;
  return (
    <th aria-sort={active ? 'descending' : 'none'}>
      <button className={`th-sort ${active ? 'is-active' : ''}`} onClick={() => onSort(k)}>
        {label}
        <span aria-hidden="true" className="th-caret">
          {active ? '↓' : '↕'}
        </span>
      </button>
    </th>
  );
}

const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function AccountTable({ accounts, sort, onSort }: Props) {
  const onLink = useLinkHandler();
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const lastRects = useRef(new Map<number, number>());
  const hoverTimer = useRef<number | undefined>(undefined);
  const [preview, setPreview] = useState<{ account: AccountListItem; rect: DOMRect } | null>(null);

  // FLIP: animate rows from their previous position to the new one on re-order.
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const next = new Map<number, number>();
    rowRefs.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top;
      next.set(id, top);
      const prev = lastRects.current.get(id);
      if (reduce) return;
      if (prev === undefined) {
        if (lastRects.current.size > 0) {
          el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
            duration: 280,
            easing: 'ease-out',
          });
        }
        return;
      }
      const dy = prev - top;
      if (Math.abs(dy) > 1) {
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
          duration: 420,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
    });
    lastRects.current = next;
  }, [accounts]);

  const setRowRef = useCallback(
    (id: number) => (el: HTMLTableRowElement | null) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    },
    [],
  );

  const startHover = (a: AccountListItem, e: React.MouseEvent<HTMLTableRowElement>) => {
    if (!canHover()) return;
    const row = e.currentTarget;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setPreview({ account: a, rect: row.getBoundingClientRect() });
    }, 380);
  };

  const endHover = () => {
    window.clearTimeout(hoverTimer.current);
    setPreview(null);
  };

  return (
    <div className="table-wrap" onScroll={endHover}>
      <table className="table">
        <thead>
          <tr>
            <th>Account</th>
            <th className="num">Employees</th>
            <SortHeader label="Score" k="score" sort={sort} onSort={onSort} />
            <SortHeader label="Change" k="score_change" sort={sort} onSort={onSort} />
            <th>Priority</th>
            <SortHeader label="Latest signal" k="recent_activity" sort={sort} onSort={onSort} />
            <th>Recommended action</th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr
              key={a.id}
              ref={setRowRef(a.id)}
              className="row-link"
              onClick={() => navigate(`/accounts/${a.id}`)}
              onMouseEnter={(e) => startHover(a, e)}
              onMouseLeave={endHover}
            >
              <td>
                <a
                  href={`/accounts/${a.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLink(e);
                  }}
                  className="account-link"
                >
                  <span className="avatar avatar-brand" style={avatarStyle(a.name)} aria-hidden="true">
                    {a.name.charAt(0)}
                  </span>
                  <span className="account-text">
                    <span className="account-name">{a.name}</span>
                    <span className="account-industry">{a.industry ?? 'Industry unknown'}</span>
                  </span>
                </a>
              </td>
              <td className="num muted">{formatNumber(a.employeeCount)}</td>
              <td>
                <ScoreRing score={a.score} />
              </td>
              <td>
                <ScoreDelta delta={a.scoreChange.delta} hasPrevious={a.scoreChange.hasPrevious} />
              </td>
              <td>
                <PriorityBadge priority={a.priority} />
              </td>
              <td className="signal-cell">
                {a.latestSignal ? (
                  <span className="signal">
                    <span className="signal-icon" aria-hidden="true">
                      <Icon name={ACTIVITY_ICON[a.latestSignal.activityType] ?? 'activity'} size={14} />
                    </span>
                    <span className="signal-text">
                      <span className="signal-title">{a.latestSignal.title}</span>
                      <span className="signal-time">{relativeTime(a.latestSignal.timestamp)}</span>
                    </span>
                  </span>
                ) : (
                  <span className="muted small">No activity yet</span>
                )}
              </td>
              <td>
                <span className={`action-chip action-${a.recommendedAction.action.toLowerCase()}`}>
                  <Icon name={ACTION_ICON[a.recommendedAction.action]} size={14} />
                  <span>{a.recommendedAction.label}</span>
                </span>
              </td>
              <td className="row-go" aria-hidden="true">
                <Icon name="arrow-right" size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview && <AccountPreview account={preview.account} anchor={preview.rect} />}
    </div>
  );
}
