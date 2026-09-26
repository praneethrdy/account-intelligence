import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, icon = '○' }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="state state-empty">
      <div className="state-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="state-title">{title}</div>
      {children && <div className="state-body">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, children }: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="state state-error" role="alert">
      <div className="state-icon" aria-hidden="true">
        <Icon name="alert" size={22} />
      </div>
      <div className="state-title">{title}</div>
      {message && <div className="state-body">{message}</div>}
      <div className="state-actions">
        {onRetry && (
          <button className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = '', icon }: {
  icon?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <div className="card-heading">
            {icon && (
              <span className="card-icon" aria-hidden="true">
                <Icon name={icon} size={16} />
              </span>
            )}
            <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
