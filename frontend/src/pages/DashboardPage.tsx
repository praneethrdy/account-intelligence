import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountTable } from '../components/AccountTable';
import { ACTION_ICON, ACTIVITY_ICON, Icon, avatarStyle } from '../components/Icon';
import { PriorityBadge } from '../components/PriorityBadge';
import { ScoreRing } from '../components/ScoreBar';
import { ScoreDelta } from '../components/ScoreDelta';
import { DashboardSkeleton } from '../components/Skeletons';
import { EmptyState, ErrorState } from '../components/States';
import { SummaryCards } from '../components/SummaryCards';
import { useAsync } from '../hooks/useAsync';
import { navigate } from '../hooks/useRoute';
import { api } from '../services/api';
import { relativeTime } from '../services/format';
import type { AccountListItem, PriorityFilter, SortKey } from '../types';

const FILTERS: PriorityFilter[] = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'score_change', label: 'Score change' },
  { key: 'recent_activity', label: 'Recent activity' },
];

/** The single account most worth acting on right now: biggest positive mover among High/Medium. */
function pickSpotlight(accounts: AccountListItem[]): AccountListItem | null {
  const movers = accounts.filter((a) => a.scoreChange.delta > 0 && a.priority !== 'LOW');
  if (movers.length === 0) return accounts.find((a) => a.priority === 'HIGH') ?? null;
  return movers.reduce((best, a) => (a.scoreChange.delta > best.scoreChange.delta ? a : best));
}

function Spotlight({ account }: { account: AccountListItem }) {
  return (
    <section className="spotlight" aria-label="Focus now">
      <div className="spotlight-glow" aria-hidden="true" />
      <div className="spotlight-main">
        <span className="spotlight-eyebrow">
          <Icon name="zap" size={14} /> Focus now · biggest mover
        </span>
        <div className="spotlight-identity">
          <span className="avatar avatar-brand avatar-lg" style={avatarStyle(account.name)} aria-hidden="true">
            {account.name.charAt(0)}
          </span>
          <div>
            <h2 className="spotlight-name">{account.name}</h2>
            <div className="spotlight-meta">{account.industry ?? 'Industry unknown'}</div>
            {account.latestSignal && (
              <div className="spotlight-signal">
                <Icon name={ACTIVITY_ICON[account.latestSignal.activityType] ?? 'activity'} size={14} />
                <span>
                  {account.latestSignal.title} · {relativeTime(account.latestSignal.timestamp)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="spotlight-stats">
        <div className="spotlight-stat">
          <span className="eyebrow">Score</span>
          <ScoreRing score={account.score} size={52} />
        </div>
        <div className="spotlight-stat">
          <span className="eyebrow">Since yesterday</span>
          <ScoreDelta delta={account.scoreChange.delta} hasPrevious={account.scoreChange.hasPrevious} />
        </div>
        <div className="spotlight-stat">
          <span className="eyebrow">Priority</span>
          <PriorityBadge priority={account.priority} />
        </div>
      </div>
      <div className="spotlight-action">
        <span className="eyebrow">Next best action</span>
        <div className="spotlight-action-label">
          <Icon name={ACTION_ICON[account.recommendedAction.action]} size={16} />
          {account.recommendedAction.label}
        </div>
        <button className="btn btn-primary" onClick={() => navigate(`/accounts/${account.id}`)}>
          Open account <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const [priority, setPriority] = useState<PriorityFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('score');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the table search (unless the user is already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const { data, error, loading, reload } = useAsync(() => api.listAccounts(priority, sort), [priority, sort]);
  // Spotlight is computed over all accounts, independent of the table filter.
  const all = useAsync(() => api.listAccounts('ALL', 'score_change'), []);
  const spotlight = useMemo(() => (all.data ? pickSpotlight(all.data.accounts) : null), [all.data]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.accounts;
    return data.accounts.filter((a) => `${a.name} ${a.industry ?? ''}`.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Account-based selling</span>
          <h1 className="page-title">Account priorities</h1>
          <p className="page-subtitle">Which accounts should sales focus on right now, and what should they do next?</p>
        </div>
      </div>

      {error && !data && <ErrorState title="Couldn’t load accounts" message={error.message} onRetry={reload} />}

      {data && data.summary.total === 0 && (
        <EmptyState title="No accounts available." icon="inbox">
          <p>Load the demo dataset to explore the product:</p>
          <pre className="code-block">cd backend{'\n'}python -m app.seed</pre>
          <button className="btn btn-secondary" onClick={reload}>
            Refresh
          </button>
        </EmptyState>
      )}

      {data && data.summary.total > 0 && (
        <>
          {spotlight && <Spotlight account={spotlight} />}
          <SummaryCards summary={data.summary} active={priority} onSelect={setPriority} />

          <section className="card table-card">
            <div className="toolbar">
              <div className="segmented" role="group" aria-label="Filter by priority">
                {FILTERS.map((f) => (
                  <button key={f} className={priority === f ? 'is-active' : ''} aria-pressed={priority === f} onClick={() => setPriority(f)}>
                    {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="toolbar-right">
                <label className="search">
                  <Icon name="search" size={15} />
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Search accounts or industries"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search accounts"
                    onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
                  />
                  {!query && <kbd className="search-kbd">/</kbd>}
                </label>
                <label className="sort-select">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    {SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className={loading ? 'is-refreshing' : ''}>
              {visible.length === 0 ? (
                <EmptyState title={query ? `No accounts match “${query}”.` : 'No accounts match this filter.'} icon="search">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setQuery('');
                      setPriority('ALL');
                    }}
                  >
                    Clear filters
                  </button>
                </EmptyState>
              ) : (
                <AccountTable accounts={visible} sort={sort} onSort={setSort} />
              )}
            </div>
          </section>
        </>
      )}

      {loading && !data && <DashboardSkeleton />}
    </div>
  );
}
