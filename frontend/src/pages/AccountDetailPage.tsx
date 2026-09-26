import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountHeader } from '../components/AccountHeader';
import { ActivityTrendChart } from '../components/ActivityTrendChart';
import { AddSignalDialog } from '../components/AddSignalDialog';
import { AIAnalysisPanel } from '../components/AIAnalysisPanel';
import { ContactsPanel } from '../components/ContactsPanel';
import { Icon } from '../components/Icon';
import { NextBestActionCard } from '../components/NextBestActionCard';
import { ProductInterestCard } from '../components/ProductInterestCard';
import { ScoreBreakdownChart } from '../components/ScoreBreakdownChart';
import { ScoreHistoryChart } from '../components/ScoreHistoryChart';
import { DetailSkeleton } from '../components/Skeletons';
import { ErrorState } from '../components/States';
import { Timeline } from '../components/Timeline';
import { useToast } from '../components/Toast';
import { WhatChanged } from '../components/WhatChanged';
import { useAsync } from '../hooks/useAsync';
import { navigate, useLinkHandler } from '../hooks/useRoute';
import { api, ApiError } from '../services/api';
import { signed } from '../services/format';

export function AccountDetailPage({ id }: { id: number }) {
  const onLink = useLinkHandler();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const pending = useRef<{ score: number; action: string; priority: string } | null>(null);
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([api.intelligence(id), api.timeline(id)]).then(([intel, timeline]) => ({ intel, timeline })),
    [id],
  );

  // After a new signal is logged and data reloads, report the before → after result.
  useEffect(() => {
    if (!data || loading || !pending.current) return;
    const before = pending.current;
    pending.current = null;
    const now = data.intel.score.current;
    const delta = now.total - before.score;
    const actionChanged = data.intel.nextBestAction.label !== before.action;
    toast({
      variant: delta > 0 ? 'success' : 'info',
      title: delta === 0 ? `Signal added · score unchanged at ${now.total}` : `Score ${before.score} → ${now.total} (${signed(delta)})`,
      body:
        (now.priority !== before.priority ? `Priority is now ${now.priority}. ` : '') +
        (actionChanged
          ? `Next best action: ${data.intel.nextBestAction.label}.`
          : delta === 0
            ? 'Caps or maximums already reached for this signal type.'
            : 'Timeline and “What changed?” updated.'),
    });
  }, [data, loading, toast]);

  const onCreated = useCallback(() => {
    if (data) {
      pending.current = {
        score: data.intel.score.current.total,
        action: data.intel.nextBestAction.label,
        priority: data.intel.score.current.priority,
      };
    }
    reload();
  }, [data, reload]);

  const back = (
    <a href="/accounts" onClick={onLink} className="back-link">
      <Icon name="arrow-left" size={14} /> All accounts
    </a>
  );

  if (loading && !data) {
    return (
      <div className="page">
        {back}
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="page">
        {back}
        <ErrorState
          title={notFound ? 'Account not found' : 'Couldn’t load this account'}
          message={
            notFound
              ? `There is no account with ID ${id}. It may have been removed, or the link is incorrect.`
              : error?.message
          }
          onRetry={notFound ? undefined : reload}
        >
          <button className="btn btn-primary" onClick={() => navigate('/accounts')}>
            Back to dashboard
          </button>
        </ErrorState>
      </div>
    );
  }

  const { intel, timeline } = data;
  return (
    <div className={`page ${loading ? 'is-updating' : ''}`}>
      <div className="page-toolbar">
        {back}
        <button className="btn btn-secondary" onClick={() => setDialogOpen(true)}>
          <Icon name="plus" size={15} /> Log a signal
        </button>
      </div>
      <AccountHeader
        account={intel.account}
        score={intel.score.current}
        change={intel.score.change}
        lastActivityAt={timeline.items.find((i) => !i.isFuture)?.timestamp ?? null}
      />

      {!intel.signalStatus.hasMeaningfulActivity && (
        <div className="notice notice-info" role="note">
          <Icon name="info" size={15} />
          <span>
            <strong>No meaningful activity detected.</strong> Insufficient signals to determine buying intent. Try{' '}
            <button className="link-btn" onClick={() => setDialogOpen(true)}>
              logging a signal
            </button>{' '}
            to see the engine react.
          </span>
        </div>
      )}
      {intel.score.dataQuality.futureActivities > 0 && (
        <div className="notice notice-warn" role="note">
          <Icon name="alert" size={15} /> {intel.score.dataQuality.futureActivities} activit
          {intel.score.dataQuality.futureActivities === 1 ? 'y has' : 'ies have'} a future timestamp and{' '}
          {intel.score.dataQuality.futureActivities === 1 ? 'was' : 'were'} excluded from scoring.
        </div>
      )}

      <div className="detail-grid">
        <div className="col-main">
          <WhatChanged data={intel.whatChanged} />
          <div className="two-col">
            <ScoreBreakdownChart components={intel.score.components} />
            <ScoreHistoryChart history={intel.score.history} />
          </div>
          <AIAnalysisPanel accountId={id} aiConfigured={intel.aiConfigured} />
          <ActivityTrendChart trend={intel.activityTrend} />
          <Timeline items={timeline.items} message={timeline.message} />
        </div>
        <aside className="col-side">
          <NextBestActionCard action={intel.nextBestAction} />
          <ContactsPanel data={intel.contacts} />
          <ProductInterestCard data={intel.productInterest} />
        </aside>
      </div>

      <AddSignalDialog
        open={dialogOpen}
        accountId={id}
        accountName={intel.account.name}
        contacts={intel.contacts.contacts}
        onClose={() => setDialogOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}
