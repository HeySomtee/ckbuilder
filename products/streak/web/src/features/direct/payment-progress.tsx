import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import { useProgressPosition } from './use-progress-position';
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
  terminal,
}: {
  stage: PaymentStage;
  count: number;
  children?: ReactNode;
  onOpen: () => void;
  onDismiss?: () => void;
  hidden: boolean;
  operationKey: string;
  terminal: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [title, description] = copy[stage];
  const moving = ['preparing', 'authorizing', 'sending', 'checking', 'confirming'].includes(stage);
  const pending = moving || (stage === 'attention' && !terminal);
  useEffect(() => setExpanded(false), [operationKey]);
  // Dismiss presentation only. A new operation or status can surface again;
  // the checkout continues monitoring and retains its recovery journal.
  useEffect(() => setDismissed(false), [operationKey, stage]);
  function minimize() {
    setExpanded(false);
    toggle.current?.focus();
  }
  function dismiss() {
    if (pending) return minimize();
    (
      document.querySelector<HTMLElement>('.prediction-dock') ?? document.getElementById('main')
    )?.focus();
    setExpanded(false);
    setDismissed(true);
    onDismiss?.();
  }
  const baseInvisible = hidden || (dismissed && !pending);
  const position = useProgressPosition(pending && !expanded && !baseInvisible);
  const invisible = baseInvisible || position.blocked;
  return createPortal(
    <aside
      ref={position.host}
      style={position.style}
      className={`payment-progress${pending ? ' is-pending' : ''}${expanded ? ' is-expanded' : ''}`}
      data-stage={stage}
      hidden={invisible}
      aria-label="Payment progress"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      {expanded && !invisible && (
        <div className="payment-progress-details">
          <header>
            <span>PAYMENT TRACKER</span>
            <button
              className="payment-progress-dismiss"
              onClick={pending ? minimize : dismiss}
              aria-label={pending ? 'Minimize payment progress' : 'Dismiss update'}
            >
              <Icon name={pending ? 'chevron-down' : 'close'} />
            </button>
          </header>
          {children}
          <button className="quiet" onClick={onOpen}>
            {stage === 'ready' ? 'Review payment in slip' : 'Open prediction slip'}
          </button>
        </div>
      )}
      <div className="payment-progress-row">
        <button
          ref={toggle}
          className="payment-progress-toggle"
          onClick={(event) => {
            if (!position.consumeDragClick(event.detail)) setExpanded(!expanded);
          }}
          onPointerDown={position.onPointerDown}
          onPointerMove={position.onPointerMove}
          onPointerUp={position.onPointerUp}
          onPointerCancel={position.onPointerCancel}
          onLostPointerCapture={position.onLostPointerCapture}
          onKeyDown={position.onKeyDown}
          aria-expanded={expanded}
          aria-label={expanded ? 'Minimize payment progress' : 'Expand payment progress'}
          aria-describedby={position.movable ? 'payment-position-help' : undefined}
        >
          <span className="payment-orbit" aria-hidden="true">
            {stage === 'confirmed' ? (
              '✓'
            ) : stage === 'attention' || stage === 'not-sent' ? (
              '!'
            ) : moving && !invisible ? (
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
        {!expanded && !pending && (
          <button
            className="payment-progress-dismiss"
            onClick={dismiss}
            aria-label="Dismiss update"
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {position.movable && (
        <span id="payment-position-help" className="sr-only">
          Drag to move, or use arrow keys to choose a corner. Activate to view payment details.
        </span>
      )}
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
