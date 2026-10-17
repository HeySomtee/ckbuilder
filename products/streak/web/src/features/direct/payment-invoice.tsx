import { useEffect, useRef, useState } from 'react';
import { displayShannons } from '../predictions/draft';
import type { BatchReview } from './batch-client';
import './payment-invoice.css';

const money = (value: string | bigint) => `${displayShannons(value)} tCKB`;

export function PaymentSummary({
  principal,
  storage,
  review,
  active,
}: {
  principal: bigint | null;
  storage: bigint | null;
  review: BatchReview | null;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fee = review ? BigInt(review.feeShannons) : null;
  const total = review
    ? BigInt(review.totalShannons)
    : principal !== null && storage !== null
      ? principal + storage
      : null;
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    if (open && active && !element.open) element.showModal();
    if ((!open || !active) && element.open) element.close();
  }, [open, active]);
  return (
    <>
      <div className="compact-cost-top">
        <div className="slip-total">
          <span>Stakes</span>
          <strong>{principal === null ? 'Check amounts' : money(principal)}</strong>
        </div>
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          Costs &amp; refundable storage <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="compact-wallet-total">
        <span>
          Wallet total{' '}
          <small>
            {review
              ? 'Network fee included'
              : storage === null
                ? 'Checking storage and fees'
                : 'Estimate · plus network fee at review'}
          </small>
        </span>
        <strong>{total === null ? 'Available at review' : money(total)}</strong>
      </div>
      <dialog
        ref={panel}
        className="payment-cost-dialog"
        aria-label="Cost breakdown"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
          if (active) trigger.current?.focus({ preventScroll: true });
        }}
      >
        <header>
          <div>
            <span className="eyebrow">YOUR WALLET PAYMENT</span>
            <h3>Your payment, explained.</h3>
          </div>
          <button aria-label="Close cost breakdown" onClick={() => setOpen(false)}>
            ×
          </button>
        </header>
        <section className="compact-invoice" aria-label="Payment breakdown">
          <dl>
            <div>
              <dt>Your stakes</dt>
              <dd>{principal === null ? 'Check amounts' : money(principal)}</dd>
            </div>
            <div>
              <dt>
                Storage deposit <span className="invoice-refundable">Refundable</span>
              </dt>
              <dd>{storage === null ? 'Checking…' : money(storage)}</dd>
            </div>
          </dl>
          <p>
            Returned when you claim after settlement, win or lose. A network fee applies to the
            claim.
          </p>
          <dl>
            <div>
              <dt>Network fee</dt>
              <dd>{fee === null ? 'Calculated at review' : money(fee)}</dd>
            </div>
            <div className="compact-invoice-total">
              <dt>Total from your wallet</dt>
              <dd>
                {total === null ? 'Available at review' : money(total)}
                {!review && total !== null ? ' + fee' : ''}
              </dd>
            </div>
          </dl>
          {review && BigInt(review.sponsorReserveShannons) > 0n && (
            <p>
              Market setup is on Streak. We cover {money(review.sponsorReserveShannons)} separately.
            </p>
          )}
        </section>
        <button className="quiet" onClick={() => setOpen(false)}>
          Got it
        </button>
      </dialog>
    </>
  );
}
