import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import './payment-progress.css';

export type PaymentStage =
  | 'preparing'
  | 'ready'
  | 'authorizing'
  | 'sending'
  | 'checking'
  | 'confirming'
  | 'confirmed'
  | 'attention'
  | 'not-sent';
const copy: Record<PaymentStage, [string, string]> = {
  preparing: ['Preparing your payment', 'Checking funds and market availability.'],
  ready: ['Your payment is ready', 'Open your slip to check the total.'],
  authorizing: ['Preparing wallet approval', 'Checking the payment before your wallet signs.'],
  sending: ['Completing your signed payment', 'Your signature is saved. You can keep exploring.'],
  checking: ['Checking your payment', 'Waiting for a verified network update.'],
  confirming: ['Predictions on the network', 'Waiting for confirmation. Keep exploring.'],
  confirmed: ['Payment confirmed. You’re all set.', 'Follow your predictions in My activity.'],
  attention: ['Your payment needs attention', 'Open for the saved status and recovery options.'],
  'not-sent': ['Payment not sent', 'Your picks are saved. Open for details.'],
};
export function PaymentProgress({
  stage,
  count,
  children,
  onOpen,
  onDismiss,
  hidden,
  operationKey,
}: {
  stage: PaymentStage;
  count: number;
  children?: ReactNode;
  onOpen: () => void;
  onDismiss?: () => void;
  hidden: boolean;
  operationKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [operationKey]);
  const [title, description] = copy[stage];
  const moving = ['preparing', 'authorizing', 'sending', 'checking', 'confirming'].includes(stage);
  return createPortal(
    <aside
      className="payment-progress"
      data-stage={stage}
      hidden={hidden}
      aria-label="Payment progress"
    >
      {expanded && !hidden && (
        <div className="payment-progress-details">
          <header>
            <span>PAYMENT TRACKER</span>
            <button onClick={() => setExpanded(false)} aria-label="Collapse payment details">
              ×
            </button>
          </header>
          {children}
          <button className="quiet" onClick={onOpen}>
            {stage === 'ready' ? 'Review payment in slip' : 'Open prediction slip'}
          </button>
          {onDismiss && (
            <button className="quiet" onClick={onDismiss}>
              Dismiss update
            </button>
          )}
        </div>
      )}
      <button
        className="payment-progress-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="payment-orbit" aria-hidden="true">
          {stage === 'confirmed' ? (
            '✓'
          ) : stage === 'attention' || stage === 'not-sent' ? (
            '!'
          ) : moving && !hidden ? (
            <CellLoader />
          ) : (
            <Icon name="wallet" />
          )}
        </span>
        <span className="payment-progress-copy">
          <strong role="status">{title}</strong>
          <small>
            {count} {count === 1 ? 'prediction' : 'predictions'} · {description}
          </small>
        </span>
        <span className="payment-progress-chevron" aria-hidden="true">
          <Icon name={expanded ? 'chevron-down' : 'chevron-up'} />
        </span>
      </button>
    </aside>,
    document.body,
  );
}

export function PaymentButtonState({
  label,
  variant = 'orbit',
}: {
  label: string;
  variant?: 'orbit' | 'wave';
}) {
  return (
    <span className="payment-button-state" aria-live="polite">
      <CellLoader variant={variant} />
      <span>{label}</span>
    </span>
  );
}
