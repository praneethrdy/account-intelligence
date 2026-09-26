import type { Priority } from '../types';
import { Icon } from './Icon';

const ICON: Record<Priority, string> = { HIGH: 'flame', MEDIUM: 'activity', LOW: 'pause' };
const LABEL: Record<Priority, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

/** Priority is always shown as icon + text, never color alone. */
export function PriorityBadge({ priority, size = 'md' }: { priority: Priority; size?: 'md' | 'lg' }) {
  return (
    <span className={`badge badge-${priority.toLowerCase()} badge-${size}`}>
      <Icon name={ICON[priority]} size={size === 'lg' ? 14 : 12} strokeWidth={2.4} />
      {LABEL[priority]}
      {size === 'lg' ? ' priority' : ''}
    </span>
  );
}
