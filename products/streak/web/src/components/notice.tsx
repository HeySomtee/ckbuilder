import type { ReactNode } from 'react';
import './notice.css';

export function Notice({
  title,
  children,
  actions,
  tone = 'info',
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'info' | 'attention';
}) {
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
    </div>
  );
}
