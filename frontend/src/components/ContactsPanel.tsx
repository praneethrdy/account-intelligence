import type { ContactsResponse } from '../types';
import { Icon } from './Icon';
import { Card, EmptyState } from './States';

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ContactsPanel({ data }: { data: ContactsResponse }) {
  const primary = data.primaryContact;
  const others = data.contacts.filter((c) => c !== data.contacts[0]);
  return (
    <Card title="Who should I contact?" icon="users" subtitle="Ranked by persona and recent engagement">
      {data.contacts.length === 0 ? (
        <EmptyState title="No relevant contact identified." icon="users">
          No contacts are on file for this account, and none will be invented. Source a technical evaluator or economic buyer first.
        </EmptyState>
      ) : (
        <>
          {primary && (
            <div className="primary-contact">
              <span className="avatar avatar-person avatar-primary" aria-hidden="true">
                {initials(primary.name)}
                {primary.engaged && <span className="presence" />}
              </span>
              <div className="primary-body">
                <span className="eyebrow">Most relevant persona</span>
                <div className="primary-name">{primary.name}</div>
                <div className="muted">{primary.jobTitle ?? 'Title unknown'}</div>
                <div className="chip-row">
                  <span className="tag tag-persona">{primary.persona}</span>
                  {primary.isDecisionMaker && (
                    <span className="tag tag-dm">
                      <Icon name="check" size={11} /> Decision-maker
                    </span>
                  )}
                  {primary.engaged && <span className="tag tag-engaged">● Engaged recently</span>}
                </div>
              </div>
            </div>
          )}
          {data.decisionMakerMessage && (
            <div className="notice notice-warn" role="note">
              <Icon name="alert" size={14} /> {data.decisionMakerMessage}
            </div>
          )}
          {others.length > 0 && (
            <ul className="contact-list">
              {others.map((c) => (
                <li key={c.id ?? c.name} className="contact-row">
                  <span className="avatar avatar-sm avatar-person" aria-hidden="true">
                    {initials(c.name)}
                    {c.engaged && <span className="presence" />}
                  </span>
                  <div className="contact-main">
                    <div className="contact-name">{c.name}</div>
                    <div className="muted small">{c.jobTitle ?? 'Title unknown'}</div>
                  </div>
                  <span className={`tag ${c.isDecisionMaker ? 'tag-dm' : 'tag-persona'}`}>{c.persona}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
