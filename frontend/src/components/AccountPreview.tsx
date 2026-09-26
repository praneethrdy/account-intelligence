import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { signed } from '../services/format';
import type { AccountListItem, Intelligence } from '../types';
import { ACTION_ICON, Icon } from './Icon';

interface Props {
  account: AccountListItem;
  anchor: DOMRect;
}

const CARD_W = 340;

/** Floating hover card: score parts, top change drivers and next action, fetched lazily. */
export function AccountPreview({ account, anchor }: Props) {
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [failed, setFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    setIntel(null);
    setFailed(false);
    api
      .intelligenceCached(account.id)
      .then((d) => alive && setIntel(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [account.id]);

  // Measure the real card, then place it below the row or flip above when there isn't room.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 0;
    const below = anchor.bottom + h + 12 <= window.innerHeight || anchor.top - h - 12 < 8;
    const top = below ? anchor.bottom + 6 : anchor.top - h - 6;
    const left = Math.min(Math.max(8, anchor.left + 12), window.innerWidth - CARD_W - 12);
    setPos({ top: Math.max(8, top), left, below });
  }, [anchor, intel, failed]);

  const s = intel?.score.current;
  const drivers = intel?.whatChanged.drivers.filter((d) => d.points !== 0).slice(0, 3) ?? [];

  return createPortal(
    <div
      ref={cardRef}
      className="preview"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: CARD_W, visibility: pos ? 'visible' : 'hidden' }}
      role="tooltip"
    >
      <div className="preview-head">
        <div>
          <div className="preview-name">{account.name}</div>
          <div className="preview-sub">
            Score <strong>{account.score}</strong>
            {account.scoreChange.hasPrevious && (
              <span className={account.scoreChange.delta >= 0 ? 'delta-up' : 'delta-down'}>
                {' '}
                ({signed(account.scoreChange.delta)} since yesterday)
              </span>
            )}
          </div>
        </div>
      </div>

      {!intel && !failed && (
        <div className="preview-loading">
          <div />
          <div />
          <div />
        </div>
      )}
      {failed && <p className="muted small">Preview unavailable.</p>}

      {s && intel && (
        <>
          <div className="preview-parts">
            {(
              [
                ['Fit', s.fit, 30],
                ['Intent', s.intent, 30],
                ['Engagement', s.engagement, 20],
                ['Recency', s.recency, 20],
              ] as const
            ).map(([label, v, max]) => (
              <div key={label} className="part">
                <span className="part-label">{label}</span>
                <span className="part-bar" aria-hidden="true">
                  <span style={{ width: `${(v / max) * 100}%` }} />
                </span>
                <span className="part-value num">
                  {v}
                  <span className="muted">/{max}</span>
                </span>
              </div>
            ))}
          </div>

          {drivers.length > 0 && (
            <div className="preview-section">
              <span className="eyebrow">Top changes</span>
              <ul className="preview-drivers">
                {drivers.map((d, i) => (
                  <li key={i}>
                    <span className={`num ${d.points > 0 ? 'delta-up' : 'delta-down'}`}>{signed(d.points)}</span> {d.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="preview-action">
            <Icon name={ACTION_ICON[intel.nextBestAction.action]} size={14} />
            <span>{intel.nextBestAction.label}</span>
          </div>
          <div className="preview-foot">
            {intel.productInterest.product !== 'Insufficient signals' && (
              <span>Interest: {intel.productInterest.product}</span>
            )}
            <span className="preview-open">Click row to open →</span>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
