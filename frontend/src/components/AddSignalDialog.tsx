import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../services/api';
import type { Contact } from '../types';
import { ACTIVITY_ICON, Icon } from './Icon';

interface Props {
  open: boolean;
  accountId: number;
  accountName: string;
  contacts: Contact[];
  onClose: () => void;
  onCreated: () => void;
}

type FieldKind = 'product' | 'page' | 'title' | 'campaign' | 'contact' | 'detail' | 'context';

interface TypeSpec {
  type: string;
  label: string;
  worth: string;
  fields: FieldKind[];
}

// Mirrors the backend scoring tables so the dialog can preview each signal's value.
const TYPES: TypeSpec[] = [
  { type: 'DEMO_REQUEST', label: 'Demo request', worth: 'Intent +15', fields: ['contact', 'product'] },
  { type: 'PRICING_PAGE_VIEW', label: 'Pricing page view', worth: 'Intent +8', fields: ['product'] },
  { type: 'DECISION_MAKER_ENGAGEMENT', label: 'Decision-maker engagement', worth: 'Engagement +8', fields: ['contact', 'context', 'product'] },
  { type: 'PRODUCT_PAGE_VIEW', label: 'Product page view', worth: 'Intent +4', fields: ['product'] },
  { type: 'CONTENT_DOWNLOAD', label: 'Content download', worth: 'Intent +3 · Engagement +3', fields: ['title', 'product'] },
  { type: 'HIRING_ACTIVITY', label: 'Hiring activity', worth: 'Intent +5', fields: ['detail'] },
  { type: 'COMPANY_EXPANSION', label: 'Company expansion', worth: 'Intent +5', fields: ['detail'] },
  { type: 'EMAIL_CLICK', label: 'Email click', worth: 'Engagement +4', fields: ['campaign'] },
  { type: 'EMAIL_OPEN', label: 'Email open', worth: 'Engagement +2', fields: ['campaign'] },
  { type: 'WEBSITE_VISIT', label: 'Website visit', worth: 'Engagement +1', fields: ['page'] },
];

const PRODUCTS = ['Cloud Integration', 'Cybersecurity', 'Data Analytics'];
const WHEN: { key: string; label: string; minutesAgo: number }[] = [
  { key: 'now', label: 'Just now', minutesAgo: 0 },
  { key: '1h', label: '1 hour ago', minutesAgo: 60 },
  { key: '1d', label: 'Yesterday', minutesAgo: 60 * 26 },
  { key: '10d', label: '10 days ago', minutesAgo: 60 * 24 * 10 },
];

export function AddSignalDialog({ open, accountId, accountName, contacts, onClose, onCreated }: Props) {
  const [type, setType] = useState(TYPES[1].type);
  const [when, setWhen] = useState('now');
  const [product, setProduct] = useState(PRODUCTS[0]);
  const [text, setText] = useState('');
  const [contactId, setContactId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  const spec = useMemo(() => TYPES.find((t) => t.type === type) ?? TYPES[0], [type]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    requestAnimationFrame(() => firstRef.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    setText('');
    setError(null);
  }, [type]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const minutes = WHEN.find((w) => w.key === when)?.minutesAgo ?? 0;
    const ts = new Date(Date.now() - minutes * 60_000);
    ts.setSeconds(0, 0);
    const meta: Record<string, string> = {};
    const trimmed = text.trim();
    if (spec.fields.includes('product')) meta.product = product;
    if (spec.fields.includes('page')) meta.page = trimmed || '/';
    if (spec.fields.includes('title')) meta.title = trimmed || `${product} guide`;
    if (spec.fields.includes('campaign')) meta.campaign = trimmed || 'Manual entry';
    if (spec.fields.includes('detail')) meta.detail = trimmed || 'Logged manually';
    if (spec.fields.includes('context')) meta.context = trimmed || `${product} product page`;
    if (spec.type === 'CONTENT_DOWNLOAD') meta.asset_type = 'technical document';
    if (spec.fields.includes('contact') && contactId) {
      const c = contacts.find((x) => String(x.id) === contactId);
      if (c) {
        meta.contact_name = c.name;
        if (c.jobTitle) meta.contact_title = c.jobTitle;
        if (c.email) meta.contact_email = c.email;
      }
    }
    try {
      await api.createActivity(accountId, { activityType: spec.type, timestamp: ts.toISOString(), metadata: meta });
      onCreated();
      onClose();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 409
          ? 'This exact signal was already recorded. Duplicates are rejected so they can’t inflate the score.'
          : (err as Error).message,
      );
      setBusy(false);
    }
  };

  const textField = spec.fields.find((f) => ['page', 'title', 'campaign', 'detail', 'context'].includes(f));
  const textLabel: Record<string, [string, string]> = {
    page: ['Page URL', '/pricing'],
    title: ['Asset title', 'Cloud Integration Architecture Guide'],
    campaign: ['Campaign', 'Q4 Product Newsletter'],
    detail: ['Detail', 'Hiring 10 platform engineers'],
    context: ['Engaged with', 'Cloud Integration product page'],
  };

  return createPortal(
    <div className="overlay" onMouseDown={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-signal-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="dialog-head">
          <div>
            <h2 id="add-signal-title">Log a signal</h2>
            <p className="muted small">
              Add a real activity to <strong>{accountName}</strong>. The deterministic engine rescores it instantly.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="type-grid" role="radiogroup" aria-label="Signal type">
          {TYPES.map((t, i) => (
            <button
              type="button"
              key={t.type}
              ref={i === 0 ? firstRef : undefined}
              role="radio"
              aria-checked={t.type === type}
              className={`type-card ${t.type === type ? 'is-active' : ''}`}
              onClick={() => setType(t.type)}
            >
              <span className="type-icon" aria-hidden="true">
                <Icon name={ACTIVITY_ICON[t.type] ?? 'activity'} size={15} />
              </span>
              <span className="type-text">
                <span className="type-label">{t.label}</span>
                <span className="type-worth">{t.worth}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="form-grid">
          {spec.fields.includes('contact') && (
            <label className="field">
              <span>Contact</span>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">{contacts.length ? 'Not attributed to a contact' : 'No contacts on file'}</option>
                {contacts.map((c) => (
                  <option key={c.id ?? c.name} value={String(c.id)}>
                    {c.name}
                    {c.jobTitle ? ` — ${c.jobTitle}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {spec.fields.includes('product') && (
            <label className="field">
              <span>Product</span>
              <select value={product} onChange={(e) => setProduct(e.target.value)}>
                {PRODUCTS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          {textField && (
            <label className="field field-wide">
              <span>{textLabel[textField][0]}</span>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={textLabel[textField][1]} />
            </label>
          )}
          <div className="field field-wide">
            <span>When</span>
            <div className="segmented segmented-sm" role="group" aria-label="When did it happen">
              {WHEN.map((w) => (
                <button type="button" key={w.key} className={when === w.key ? 'is-active' : ''} aria-pressed={when === w.key} onClick={() => setWhen(w.key)}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="dialog-hint">
          <Icon name="info" size={14} />
          <span>
            Worth up to <strong>{spec.worth}</strong>. Per-type caps and component maximums may reduce the actual change.
          </span>
        </div>

        {error && (
          <div className="notice notice-warn" role="alert">
            <Icon name="alert" size={14} /> {error}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon name={busy ? 'refresh' : 'plus'} size={15} className={busy ? 'spin' : ''} />
            {busy ? 'Scoring…' : 'Add signal & rescore'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
