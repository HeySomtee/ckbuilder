import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icon';

export interface CampaignToast {
  id: string;
  title: string;
  description?: string;
  tone?: 'info' | 'attention';
  action?: ReactNode;
}

function Toast({ item, onDismiss }: { item: CampaignToast; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || item.tone === 'attention' || item.action) return;
    const timer = window.setTimeout(() => onDismiss(item.id), 10000);
    return () => window.clearTimeout(timer);
  }, [item.id, item.tone, item.action, paused, onDismiss]);
  return (
    <div
      className={`campaign-toast ${item.tone ?? 'info'}`}
      role={item.tone === 'attention' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span className="campaign-toast-icon" aria-hidden="true">
        <Icon name={item.tone === 'attention' ? 'alert' : 'check'} />
      </span>
      <div className="campaign-toast-content">
        <strong>{item.title}</strong>
        {item.description && <p>{item.description}</p>}
        {item.action && <div className="campaign-toast-actions">{item.action}</div>}
      </div>
      <button
        className="campaign-toast-close"
        type="button"
        aria-label={`Dismiss ${item.title}`}
        onClick={() => onDismiss(item.id)}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

export function ToastViewport({ items }: { items: CampaignToast[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const dismiss = useCallback((id: string) => setDismissed((previous) => [...previous, id]), []);
  const visible = items.filter((item) => !dismissed.includes(item.id)).slice(0, 2);
  const hasVisible = visible.length > 0;
  const [overlay, setOverlay] = useState<{
    dialog: HTMLDialogElement | null;
    expandedPayment: boolean;
  }>({ dialog: null, expandedPayment: false });
  const identities = JSON.stringify(items.map((item) => item.id));
  useEffect(() => {
    const active: string[] = JSON.parse(identities);
    setDismissed((previous) => {
      const retained = previous.filter((id) => active.includes(id));
      return retained.length === previous.length ? previous : retained;
    });
  }, [identities]);
  useEffect(() => {
    if (!hasVisible) return;
    const update = () => {
      const opened = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      const dialog = opened.item(opened.length - 1);
      const expandedPayment = !!document.querySelector(
        '.payment-progress.is-expanded:not([hidden])',
      );
      setOverlay((previous) =>
        previous.dialog === dialog && previous.expandedPayment === expandedPayment
          ? previous
          : { dialog, expandedPayment },
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class'],
    });
    return () => observer.disconnect();
  }, [hasVisible]);
  // Payment dialogs own their interaction layer. Keep campaign notices out of it.
  const { dialog, expandedPayment } = overlay;
  if ((dialog && !dialog.classList.contains('campaign-dialog')) || (!dialog && expandedPayment))
    return null;
  if (!visible.length) return null;
  return createPortal(
    <div className="campaign-toast-stack" aria-label="Competition notifications">
      {visible.map((item) => (
        <Toast key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>,
    dialog ?? document.body,
  );
}
