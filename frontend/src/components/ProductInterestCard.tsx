import type { ProductInterest } from '../types';
import { Icon } from './Icon';
import { Card } from './States';

const ICON: Record<string, string> = {
  'Cloud Integration': 'cloud',
  Cybersecurity: 'shield',
  'Data Analytics': 'bar-chart',
};

export function ProductInterestCard({ data }: { data: ProductInterest }) {
  const insufficient = data.product === 'Insufficient signals';
  const max = Math.max(1, ...Object.values(data.scores));
  return (
    <Card title="Likely product interest" icon="package" subtitle="Inferred from actual account activity">
      {insufficient ? (
        <div className="product-empty">
          <span className="product-icon product-icon-muted" aria-hidden="true">
            <Icon name="package" size={20} />
          </span>
          <div>
            <div className="product-name muted">Insufficient signals</div>
            <p className="muted small">Not enough product-specific activity to infer interest. Nothing is guessed.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="product-hero">
            <span className="product-icon" aria-hidden="true">
              <Icon name={ICON[data.product] ?? 'package'} size={22} />
            </span>
            <div>
              <div className="product-name">{data.product}</div>
              <span className={`tag tag-conf-${data.confidence}`}>{data.confidence} confidence</span>
            </div>
          </div>
          <div className="product-bars">
            {Object.entries(data.scores).map(([name, v]) => (
              <div key={name} className={`product-bar-row ${name === data.product ? 'is-top' : ''}`}>
                <span className="product-bar-name">
                  <Icon name={ICON[name] ?? 'package'} size={13} /> {name}
                </span>
                <div className="product-bar" aria-hidden="true">
                  <div style={{ width: `${(v / max) * 100}%` }} />
                </div>
                <span className="small num muted">{v}</span>
              </div>
            ))}
          </div>
          <div className="eyebrow evidence-head">Evidence</div>
          <ul className="evidence">
            {data.evidence.map((e, i) => (
              <li key={i}>
                <Icon name="check" size={12} /> <span>{e}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
