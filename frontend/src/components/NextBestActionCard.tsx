import { useState } from 'react';
import type { NextAction } from '../types';
import { ACTION_ICON, Icon } from './Icon';
import { useToast } from './Toast';

export function NextBestActionCard({ action }: { action: NextAction }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const strong = action.action === 'CONTACT_DECISION_MAKER' || action.action === 'SCHEDULE_DEMO';
  const email = action.target?.email;

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast({ variant: 'success', title: 'Email copied', body: email });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className={`nba ${strong ? 'nba-strong' : 'nba-soft'}`} aria-label="Next best action">
      <div className="nba-top">
        <span className="nba-eyebrow">
          <Icon name="target" size={14} /> Next best action
        </span>
        <code className="nba-code">{action.action}</code>
      </div>
      <div className="nba-hero">
        <span className="nba-icon" aria-hidden="true">
          <Icon name={ACTION_ICON[action.action]} size={22} />
        </span>
        <div className="nba-label">{action.label}</div>
      </div>
      {action.target && (
        <div className="nba-target">
          <div>
            <div className="nba-target-name">{action.target.name}</div>
            <div className="nba-target-meta">
              {action.target.jobTitle ?? 'Title unknown'} · {action.target.persona}
            </div>
          </div>
          {email && (
            <button className="nba-copy" onClick={copyEmail} title={`Copy ${email}`}>
              <Icon name={copied ? 'check' : 'mail'} size={14} />
              {copied ? 'Copied' : 'Copy email'}
            </button>
          )}
        </div>
      )}
      <p className="nba-why">{action.explanation}</p>
      {action.notes.map((n) => (
        <div key={n} className="nba-note" role="note">
          <Icon name="alert" size={14} /> {n}
        </div>
      ))}
      <ul className="nba-reasons">
        {action.reasons.map((r) => (
          <li key={r}>
            <Icon name="check" size={13} /> {r}
          </li>
        ))}
      </ul>
      <div className="nba-foot">Deterministic recommendation · backend rules engine</div>
    </section>
  );
}
