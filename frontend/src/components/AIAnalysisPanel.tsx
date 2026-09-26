import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { AnalyzeResponse } from '../types';
import { Icon } from './Icon';
import { Card } from './States';
import { useToast } from './Toast';

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: AnalyzeResponse }
  | { kind: 'failed'; reason: string };

const SECTIONS: { key: keyof NonNullable<AnalyzeResponse['analysis']>; title: string; icon: string }[] = [
  { key: 'summary', title: 'Summary', icon: 'file' },
  { key: 'whyImportant', title: 'Why this account matters', icon: 'zap' },
  { key: 'likelyNeed', title: 'Likely need', icon: 'package' },
  { key: 'recommendedPersona', title: 'Recommended persona', icon: 'user-check' },
  { key: 'nextBestAction', title: 'Recommended action', icon: 'target' },
  { key: 'reasonForAction', title: 'Reason for action', icon: 'info' },
];

function Fallback({ reason }: { reason?: string | null }) {
  return (
    <div className="ai-fallback" role="alert">
      <div className="ai-fallback-title">
        <Icon name="alert" size={16} /> AI analysis is currently unavailable.
      </div>
      <p>Account scoring and deterministic recommendations are still available.</p>
      {reason && <p className="small ai-fallback-reason">Reason: {reason}</p>}
    </div>
  );
}

export function AIAnalysisPanel({ accountId, aiConfigured }: { accountId: number; aiConfigured: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  useEffect(() => setPhase({ kind: 'idle' }), [accountId]);

  const run = async () => {
    setPhase({ kind: 'loading' });
    setCopied(false);
    try {
      const result = await api.analyze(accountId);
      setPhase({ kind: 'done', result });
      toast(
        result.status === 'ok'
          ? { variant: 'ai', title: 'AI analysis ready', body: 'Summary, reasoning and an outreach draft were generated.' }
          : { variant: 'error', title: 'AI analysis unavailable', body: 'Deterministic intelligence is still shown.' },
      );
    } catch (e) {
      setPhase({ kind: 'failed', reason: (e as Error).message });
      toast({ variant: 'error', title: 'AI analysis unavailable', body: 'Deterministic intelligence is still shown.' });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ variant: 'success', title: 'Outreach message copied', body: 'Paste it into your email client.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the text is still selectable */
    }
  };

  const result = phase.kind === 'done' ? phase.result : null;
  const analysis = result?.status === 'ok' ? result.analysis : null;
  const loading = phase.kind === 'loading';

  return (
    <Card
      className="ai-card"
      icon="sparkles"
      title="AI Account Analyst"
      subtitle="Interprets the deterministic intelligence and drafts outreach, grounded only in this account's stored data."
      actions={
        <button className="btn btn-ai" onClick={run} disabled={loading}>
          <Icon name={loading ? 'refresh' : 'sparkles'} size={15} className={loading ? 'spin' : ''} />
          {loading ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze Account'}
        </button>
      }
    >
      {phase.kind === 'idle' && (
        <div className="ai-idle">
          <div className="ai-idle-art" aria-hidden="true">
            <Icon name="sparkles" size={26} strokeWidth={1.6} />
          </div>
          <div>
            <p className="ai-idle-title">Get an AI read on this account</p>
            <p className="muted small">
              A summary, why it matters now, the likely need, who to approach and a ready-to-send outreach draft.
            </p>
            {!aiConfigured && (
              <p className="small muted">No OpenRouter key is configured on the server. Analysis will fall back gracefully.</p>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="ai-loading" role="status" aria-live="polite">
          <div className="ai-loading-head">
            <span className="spinner" aria-hidden="true" />
            <span>Analyzing account...</span>
          </div>
          <div className="skeleton-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-card">
                <div />
                <div />
                <div />
              </div>
            ))}
          </div>
        </div>
      )}

      {phase.kind === 'failed' && <Fallback reason={phase.reason} />}
      {result && result.status === 'unavailable' && (
        <Fallback reason={result.message?.match(/\(([^)]+)\)\s*$/)?.[1] ?? result.errorCode} />
      )}

      {analysis && result && (
        <div className="ai-result">
          <div className="ai-label">
            <span className="tag tag-ai">
              <Icon name="sparkles" size={12} /> AI-generated analysis
            </span>
            <span className="muted small">
              {result.model ? `Model: ${result.model}` : ''} · Review before sending
            </span>
          </div>
          <div className="ai-sections">
            {SECTIONS.map((s) => (
              <section key={s.key} className="ai-section">
                <h3>
                  <Icon name={s.icon} size={13} /> {s.title}
                </h3>
                <p>{analysis[s.key]}</p>
              </section>
            ))}
          </div>
          <section className="ai-message">
            <div className="ai-message-head">
              <h3>
                <Icon name="mail" size={13} /> Personalized outreach message
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(analysis.personalizedMessage)}>
                <Icon name={copied ? 'check' : 'copy'} size={13} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <blockquote>{analysis.personalizedMessage}</blockquote>
          </section>
          {result.groundingNotes.length > 0 && (
            <ul className="grounding">
              {result.groundingNotes.map((n) => (
                <li key={n}>
                  <Icon name="shield" size={12} /> {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
