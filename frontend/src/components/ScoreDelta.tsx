import { signed } from '../services/format';
import { Icon } from './Icon';

export function ScoreDelta({ delta, hasPrevious = true, suffix, pill = true }: {
  delta: number;
  hasPrevious?: boolean;
  suffix?: string;
  pill?: boolean;
}) {
  if (!hasPrevious) return <span className="delta delta-flat">New</span>;
  const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat';
  return (
    <span className={`delta ${cls} ${pill ? 'delta-pill' : ''}`}>
      {delta !== 0 && <Icon name={delta > 0 ? 'trending-up' : 'trending-down'} size={14} strokeWidth={2.4} />}
      {signed(delta)}
      {suffix ? <span className="delta-suffix"> {suffix}</span> : null}
    </span>
  );
}
