import type { CSSProperties } from 'react';

/** Shared Recharts tooltip styling; colors come from CSS tokens so dark mode just works. */
export const tooltipStyle: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
};

export const axisTick = { fill: 'var(--text-muted)', fontSize: 12 };
