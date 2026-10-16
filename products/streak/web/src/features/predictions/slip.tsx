import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { getPublicMarket, reviewDraft } from './api';
import type { PublicMarket } from './api';
import { DRAFT_KEY, displayShannons, totalShannons } from './draft';
import type { Draft, DraftStore } from './draft';
import { useNow } from '../../lib/use-now';
import { TeamBadge } from '../../components/team-badge';
import { createGenieMotion } from '../../lib/genie-motion';
import {
  useDirectCatalogue,
  useProvisioningAvailability,
  useDemandAvailability,
} from '../direct/availability';
import { acceptsPayment, preparationMessage } from '../direct/availability-api';

export function PredictionSlip({
  store,
  open,
  onOpen,
  onDismiss,
  accountKey,
  onDirect,
}: {
  store: DraftStore;
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  accountKey: string;
  onDirect?: (marketId: string) => void;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { draft } = snapshot;
  const stamp = JSON.stringify(draft);
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const dock = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusFrame = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [motion] = useState(createGenieMotion);
  const now = useNow(open);
  const catalogue = useDirectCatalogue(open);
  const demand = useDemandAvailability(
    draft.picks.map((pick) => pick.matchId),
    open,
  );
  const provisioning = useProvisioningAvailability(open && draft.picks.length > 0);
  const availableFor = (matchId: string) =>
    (!catalogue.isError &&
      catalogue.data?.some((row) => row.fixtureId === matchId && acceptsPayment(row, now))) ||
    (!demand.isError &&
      demand.data?.some((row) => row.fixtureId === matchId && acceptsPayment(row, now)));
  function pay(marketId: string) {
    if (snapshot.blocked || snapshot.conflict) return;
    dismiss();
    onDirect?.(marketId);
  }
  const details = useQueries({
    queries: draft.picks.map((pick) => ({
      queryKey: ['public-market', pick.marketId],
      queryFn: ({ signal }: { signal: AbortSignal }) => getPublicMarket(pick.marketId, signal),
      enabled: open,
      staleTime: 15_000,
      refetchInterval: open ? 30_000 : (false as const),
      refetchIntervalInBackground: false,
      retry: 1,
    })),
  });
  const review = useMutation({
    mutationFn: async (input: { draft: Draft; stamp: string; accountKey: string }) => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      const result = await reviewDraft(input.draft, controller.signal);
      if (controller.signal.aborted) throw Error('Review cancelled. Your predictions are safe.');
      return { ...input, result, signal: controller.signal };
    },
    onSuccess: (data) => {
      if (data.signal.aborted || data.stamp !== JSON.stringify(store.getSnapshot().draft)) return;
      for (const line of data.result.lines)
        if (line.detail) {
          const observed = line.detail;
          client.setQueryData<PublicMarket>(['public-market', line.marketId], (cached) =>
            cached && cached.evaluatedAt >= observed.evaluatedAt ? cached : observed,
          );
        }
    },
    retry: false,
  });
  useEffect(() => {
    motion.cancel();
    const unsubscribe = store.subscribe(() => pending.current?.abort());
    const storage = (event: StorageEvent) => {
      if (event.key === DRAFT_KEY || event.key === null) store.externalChange();
    };
    window.addEventListener('storage', storage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', storage);
      pending.current?.abort();
    };
  }, [store, accountKey, motion]);
  useEffect(
    () => () => {
      cancelAnimationFrame(focusFrame.current);
      motion.dispose();
    },
    [motion],
  );
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      cancelAnimationFrame(focusFrame.current);
      opener.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : dock.current;
      element.showModal();
      if (dock.current) motion.restore(element, dock.current);
      title.current?.focus({ preventScroll: true });
    }
    if (!open && element.open) element.close();
  }, [open, motion]);
  function dismiss() {
    cancelAnimationFrame(focusFrame.current);
    pending.current?.abort();
    if (dialog.current && dock.current) motion.minimize(dialog.current, dock.current);
    else motion.cancel();
    onDismiss();
    setConfirmClear(false);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = 0;
      if (!dialog.current || dialog.current.open) return;
      const target = dock.current?.isConnected
        ? dock.current
        : opener.current?.isConnected
          ? opener.current
          : document.getElementById('main');
      target?.focus({ preventScroll: true });
    });
  }
  const total = totalShannons(draft.picks);
  const current =
    review.data?.stamp === stamp &&
    review.data.accountKey === accountKey &&
    !review.data.signal.aborted &&
    !snapshot.blocked &&
    !snapshot.conflict
      ? review.data.result
      : null;
  const changedTerms =
    !!current &&
    current.lines.some(
      (line, index) =>
        details[index]?.data && line.detail?.termsId !== details[index].data?.termsId,
    );
  const expired =
    !!current && (now >= current.expiresAt || performance.now() >= current.expiresMonotonic);
  const unavailable = details.some((query) => query.isError || query.isPending);
  const closed = details.some((query) => query.data && !query.data.accepting);
  const accepted = !!current?.valid && !expired && !changedTerms && !unavailable && !closed;
  const currentError =
    review.isError &&
    review.variables?.stamp === stamp &&
    review.variables.accountKey === accountKey;
  const surfaceVersion = details
    .map((detail) => `${detail.dataUpdatedAt}:${detail.status}`)
    .join(':');
  useEffect(() => {
    if (open && dialog.current) motion.warm(dialog.current);
  }, [
    open,
    stamp,
    surfaceVersion,
    current,
    currentError,
    expired,
    changedTerms,
    unavailable,
    closed,
    confirmClear,
    review.isPending,
    snapshot.warning,
    snapshot.saved,
    snapshot.blocked,
    snapshot.conflict,
    accountKey,
    motion,
  ]);
  return (
    <>
      {(draft.picks.length > 0 || snapshot.blocked || snapshot.conflict || snapshot.warning) && (
        <button
          ref={dock}
          className="prediction-dock"
          onClick={(event) => {
            event.currentTarget.focus();
            onOpen();
          }}
        >
          <span className="dock-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
              <path d="M9 8h6M9 12h6" />
            </svg>
            <span className="dock-count">{draft.picks.length}</span>
          </span>
          <span className="dock-copy">
            <strong>
              {draft.picks.length || 'Your'}{' '}
              {draft.picks.length === 1 ? 'prediction' : 'predictions'} in your slip
            </strong>
            <small>
              {total === null ? 'Check amounts' : `${displayShannons(total)} tCKB`} ·{' '}
              {snapshot.saved ? 'Saved draft' : 'Draft in this tab'}
            </small>
          </span>
          <svg
            className="dock-arrow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m6 14 6-6 6 6" />
          </svg>
        </button>
      )}
      <dialog
        ref={dialog}
        className="prediction-slip"
        aria-label="Prediction slip"
        onCancel={(event) => {
          event.preventDefault();
          dismiss();
        }}
      >
        <header className="slip-head">
          <div className="slip-controls">
            <button onClick={dismiss} aria-label="Minimize slip">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M3 8h10" />
              </svg>
              <span>Minimize</span>
            </button>
          </div>
          <div>
            <p className="eyebrow">YOUR PREDICTION SLIP</p>
            <h2 ref={title} id="slip-title" tabIndex={-1}>
              Make your calls.
            </h2>
          </div>
        </header>
        <div className="slip-body">
          <div className="slip-summary">
            <span className="slip-count">{draft.picks.length}</span>
            <div>
              <strong>
                {draft.picks.length === 1
                  ? 'One pick to start.'
                  : `${draft.picks.length} picks. Your call.`}
              </strong>
              <p>Every prediction settles independently.</p>
            </div>
            <span className="slip-capacity">{draft.picks.length}/8</span>
          </div>
          {snapshot.warning && (
            <div className="notice" role="alert">
              <p>{snapshot.warning}</p>
              {snapshot.blocked && (
                <button onClick={() => setConfirmClear(true)}>Start a new slip</button>
              )}
              {snapshot.conflict && (
                <div className="slip-choices">
                  <button onClick={() => store.loadOtherTab()}>Load other tab’s slip</button>
                  <button onClick={() => store.keepThisTab()}>Keep this slip</button>
                </div>
              )}
            </div>
          )}
          {draft.picks.length === 0 && (
            <div className="slip-empty">
              <h3>A weekend of possibilities.</h3>
              <p>Choose home, draw or away on a market to start your slip.</p>
              <button onClick={dismiss}>Explore matches</button>
            </div>
          )}
          <div className="slip-picks">
            {draft.picks.map((pick, index) => {
              const query = details[index];
              const detail = query.data;
              const market = detail?.market;
              const errors = current?.lines[index]?.errors ?? [];
              const label = market ? `${market.home} vs ${market.away}` : `Market ${pick.marketId}`;
              const invalidAmount = totalShannons([pick]) === null;
              const errorId = `pick-errors-${pick.lineId}`;
              const allowedPresets = detail
                ? ['100', '200', '500'].filter((amount) => {
                    const shannons = BigInt(amount) * 100_000_000n;
                    return (
                      shannons >= BigInt(detail.terms.minimumShannons) &&
                      shannons <= BigInt(detail.terms.maximumShannons)
                    );
                  })
                : [];
              return (
                <article key={pick.lineId} className="slip-pick">
                  <div className="slip-pick-heading">
                    <div>
                      <span className="eyebrow">
                        {market ? (
                          <time dateTime={market.kickoff}>
                            {new Date(market.kickoff).toLocaleString('en-GB', {
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        ) : (
                          'FIXTURE'
                        )}
                      </span>
                      <h3>{label}</h3>
                    </div>
                    <button
                      disabled={snapshot.blocked || snapshot.conflict}
                      aria-label={`Remove ${label}`}
                      onClick={() => store.remove(pick.lineId)}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        aria-hidden="true"
                      >
                        <path d="m4 4 8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                  {query.isPending && <p role="status">Loading fixture rules...</p>}
                  {query.isError && (
                    <p className="pick-error">
                      Fixture details are unavailable. Your pick is retained.{' '}
                      <button onClick={() => void query.refetch()}>Retry fixture</button>
                    </p>
                  )}
                  <div className="slip-pick-choice">
                    {market && (
                      <span className="slip-crests" aria-hidden="true">
                        <TeamBadge
                          key={`home:${market.homeLogo ?? market.homeCode}`}
                          logo={market.homeLogo}
                          code={market.homeCode}
                          side="home"
                        />
                        <TeamBadge
                          key={`away:${market.awayLogo ?? market.awayCode}`}
                          logo={market.awayLogo}
                          code={market.awayCode}
                          side="away"
                        />
                      </span>
                    )}
                    <span className="slip-choice">
                      {pick.outcome === 'draw'
                        ? 'Draw'
                        : `${pick.outcome === 'home' ? (market?.home ?? 'Home') : (market?.away ?? 'Away')} to win`}
                    </span>
                  </div>
                  <div className="slip-pick-stake">
                    <label className="stake-label">
                      <span>Your stake</span>
                      <span className="stake-input">
                        <input
                          aria-label={`Stake for ${label}`}
                          inputMode="decimal"
                          autoComplete="off"
                          maxLength={32}
                          disabled={snapshot.blocked || snapshot.conflict}
                          value={pick.amountCkb}
                          aria-invalid={errors.length > 0 || invalidAmount}
                          aria-describedby={errorId}
                          onChange={(event) => store.amount(pick.lineId, event.target.value)}
                        />
                        <span aria-hidden="true">tCKB</span>
                      </span>
                    </label>
                    {allowedPresets.length > 0 && (
                      <div
                        className="stake-presets"
                        role="group"
                        aria-label={`Stake shortcuts for ${label}`}
                      >
                        {allowedPresets.map((amount) => (
                          <button
                            key={amount}
                            disabled={snapshot.blocked || snapshot.conflict}
                            aria-pressed={pick.amountCkb === amount}
                            aria-label={`Stake ${amount} tCKB on ${label}`}
                            onClick={() => store.amount(pick.lineId, amount)}
                          >
                            {amount}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {detail && (
                    <details className="slip-pick-terms">
                      <summary>
                        Limits &amp; pool fees{' '}
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          aria-hidden="true"
                        >
                          <path d="m4 6 4 4 4-4" />
                        </svg>
                      </summary>
                      <small>
                        Ledger limits: {displayShannons(detail.terms.minimumShannons)} to{' '}
                        {displayShannons(detail.terms.maximumShannons)} tCKB. Fees:{' '}
                        {detail.terms.protocolFeeBps / 100}% protocol +{' '}
                        {detail.terms.creatorFeeBps / 100}% creator, deducted from the losing pool.
                      </small>
                    </details>
                  )}
                  <div id={errorId}>
                    {invalidAmount && (
                      <p className="pick-error">Enter an amount with up to 8 decimal places.</p>
                    )}
                    {detail &&
                      (!detail.accepting ||
                        now >= Date.parse(detail.terms.closesAt) ||
                        now >= Date.parse(detail.terms.kickoff)) && (
                        <p className="pick-error">
                          This market is no longer accepting predictions.
                        </p>
                      )}
                    {errors.map((error) => (
                      <p className="pick-error" key={error}>
                        {error}
                      </p>
                    ))}
                  </div>
                  <p className="slip-payment-note">
                    {catalogue.isError
                      ? 'Payment availability could not be checked.'
                      : catalogue.isPending
                        ? 'Checking payment availability...'
                        : availableFor(pick.matchId)
                          ? 'Payment is available. Streak covers setup for new markets. Wallet review shows your stake, 321 tCKB recoverable storage and the exact network fee.'
                          : preparationMessage(
                              provisioning.isError ? null : provisioning.data,
                              pick.matchId,
                              now,
                            )}
                  </p>
                  {draft.picks.length > 1 && availableFor(pick.matchId) && onDirect && (
                    <button
                      className="connect"
                      disabled={snapshot.blocked || snapshot.conflict || invalidAmount}
                      onClick={() => pay(pick.marketId)}
                    >
                      Pay this prediction
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {draft.picks.length > 0 && (
            <button className="slip-add-more" onClick={dismiss}>
              <span aria-hidden="true">+</span> Add more matches
            </button>
          )}
          {(catalogue.isError || provisioning.isError) && (
            <button
              className="quiet"
              disabled={catalogue.isFetching || provisioning.isFetching}
              onClick={() => {
                void catalogue.refetch();
                void provisioning.refetch();
              }}
            >
              Retry availability
            </button>
          )}
          <details className="slip-draft-check">
            <summary>Check saved picks against legacy market rules</summary>
            {currentError && (
              <p className="pick-error" role="alert">
                Review could not finish. Your picks are retained. Try again.
              </p>
            )}
            {current && (
              <p className={accepted ? 'review-ok' : 'pick-error'} role="status">
                {expired
                  ? 'This review expired. Review again for current rules.'
                  : unavailable
                    ? 'Fixture details could not be verified. Refresh and review again.'
                    : changedTerms
                      ? 'Market rules changed. Review again.'
                      : current.valid && closed
                        ? 'A market has closed. Review again for current availability.'
                        : current.valid
                          ? 'Saved picks checked against legacy rules. Use wallet payment above to place an available prediction.'
                          : 'Some predictions need attention. All picks are retained.'}
              </p>
            )}
            <button
              className="quiet"
              disabled={
                !draft.picks.length ||
                total === null ||
                snapshot.blocked ||
                snapshot.conflict ||
                review.isPending
              }
              onClick={() => review.mutate({ draft: structuredClone(draft), stamp, accountKey })}
            >
              {review.isPending ? 'Checking every prediction...' : 'Check saved picks'}
              {!review.isPending && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              )}
            </button>
            <small>
              This optional check uses legacy ledger rules. Wallet payment checks contract rules
              separately.
            </small>
          </details>
        </div>
        <footer className="slip-footer">
          {confirmClear ? (
            <div className="notice" role="alert">
              <p>Discard every prediction in this saved slip?</p>
              <div className="slip-choices">
                <button
                  onClick={() => {
                    pending.current?.abort();
                    store.clear();
                    setConfirmClear(false);
                    review.reset();
                  }}
                >
                  Clear all predictions
                </button>
                <button onClick={() => setConfirmClear(false)}>Keep predictions</button>
              </div>
            </div>
          ) : null}
          <div className="slip-total">
            <span>Stake subtotal</span>
            <strong>{total === null ? 'Check amounts' : `${displayShannons(total)} tCKB`}</strong>
          </div>
          <p className="slip-payment-note">
            {draft.picks.length > 1
              ? 'Combined payment is not available yet. You can pay an available prediction individually above. Every other pick stays saved.'
              : 'Next: connect your wallet, review the full cost, then sign your payment.'}
          </p>
          <small>
            Saved picks can include predictions you already paid for. Check Activity before paying
            again.
          </small>
          {draft.picks.length === 1 && onDirect && (
            <button
              className="review-button"
              disabled={
                !availableFor(draft.picks[0].matchId) ||
                total === null ||
                snapshot.blocked ||
                snapshot.conflict
              }
              onClick={() => pay(draft.picks[0].marketId)}
            >
              Continue to payment
            </button>
          )}

          <div className="slip-footer-meta">
            <span className="slip-save-state">
              {snapshot.saved ? 'Saved on this device' : 'Draft in this tab'}
            </span>
            {draft.picks.length > 0 && (
              <button className="clear-slip" onClick={() => setConfirmClear(true)}>
                Clear slip
              </button>
            )}
          </div>
        </footer>
      </dialog>
    </>
  );
}
