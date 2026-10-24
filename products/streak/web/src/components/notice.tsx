import { useState } from 'react';
import type { ReactNode } from 'react';
import './notice.css';

export function Notice({
  title,
  children,
  actions,
  tone = 'info',
  dismissible = false,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'info' | 'attention';
  dismissible?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const identity = `${title}:${typeof children === 'string' ? children : ''}`;
  if (dismissible && dismissed === identity) return null;
  return (
    <div className={`feedback-card ${tone}`} role={tone === 'attention' ? 'alert' : 'status'}>
      <span className="feedback-icon" aria-hidden="true">
        {tone === 'attention' ? '!' : 'i'}
      </span>
      <div className="feedback-content">
        <strong>{title}</strong>
        {children && <div className="feedback-description">{children}</div>}
        {actions && <div className="feedback-actions">{actions}</div>}
      </div>
      {dismissible && (
        <button
          className="feedback-dismiss"
          aria-label="Dismiss notification"
          onClick={() => setDismissed(identity)}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
