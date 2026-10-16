import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { getPublicMarket, reviewDraft } from './api';
import type { PublicMarket } from './api';
import { DRAFT_KEY, displayShannons, totalShannons } from './draft';
import type { Draft, DraftStore } from './draft';
import { useNow } from '../../lib/use-now';

export function PredictionSlip({
  store,
  open,
  onOpen,
  onDismiss,
  accountKey,
}: {
  store: DraftStore;
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  accountKey: string;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { draft } = snapshot;
  const stamp = JSON.stringify(draft);
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const dock = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const now = useNow(open);
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
  }, [store, accountKey]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : dock.current;
      element.showModal();
      title.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);
  function dismiss() {
    pending.current?.abort();
    onDismiss();
    setConfirmClear(false);
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected
        ? opener.current
        : (dock.current ?? document.getElementById('main'));
      target?.focus();
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
          <span>{draft.picks.length || 'Your'} predictions</span>
          <strong>{total === null ? 'Check amounts' : `${displayShannons(total)} tCKB`}</strong>
          <span>Open slip ↑</span>
        </button>
      )}
      <dialog
        ref={dialog}
        className="prediction-slip"
        aria-labelledby="slip-title"
        onCancel={(event) => {
          event.preventDefault();
          dismiss();
        }}
      >
        <header className="slip-head">
          <div>
            <p className="eyebrow">YOUR NEXT CALL</p>
            <h2 ref={title} id="slip-title" tabIndex={-1}>
              Prediction slip <span>{draft.picks.length}/8</span>
            </h2>
          </div>
          <div className="slip-controls">
            <button onClick={dismiss} aria-label="Minimize slip">
              − <span>Minimize</span>
            </button>
            <button onClick={dismiss} aria-label="Close slip">
              × <span>Close</span>
            </button>
          </div>
        </header>
        <div className="slip-body">
          <p className="slip-save-state">
            {snapshot.saved ? 'Draft saved on this device.' : 'Draft in this tab.'} Nothing has been
            placed.
          </p>
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
          {draft.picks.map((pick, index) => {
            const query = details[index];
            const detail = query.data;
            const market = detail?.market;
            const errors = current?.lines[index]?.errors ?? [];
            const label = market ? `${market.home} vs ${market.away}` : `Market ${pick.marketId}`;
            return (
              <article key={pick.lineId} className="slip-pick">
                <div className="slip-pick-heading">
                  <div>
                    <span className="eyebrow">{market?.competition ?? 'FIXTURE'}</span>
                    <h3>{label}</h3>
                  </div>
                  <button
                    disabled={snapshot.blocked || snapshot.conflict}
                    aria-label={`Remove ${label}`}
                    onClick={() => store.remove(pick.lineId)}
                  >
                    ×
                  </button>
                </div>
                {query.isPending && <p role="status">Loading fixture rules...</p>}
                {query.isError && (
                  <p className="pick-error">
                    Fixture details are unavailable. Your pick is retained.{' '}
                    <button onClick={() => void query.refetch()}>Retry fixture</button>
                  </p>
                )}
                <p className="slip-choice">
                  {pick.outcome === 'draw'
                    ? 'Draw'
                    : `${pick.outcome === 'home' ? (market?.home ?? 'Home') : (market?.away ?? 'Away')} to win`}
                </p>
                <label className="stake-input">
                  Stake (tCKB)
                  <input
                    aria-label={`Stake for ${label}`}
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={32}
                    disabled={snapshot.blocked || snapshot.conflict}
                    value={pick.amountCkb}
                    aria-invalid={errors.length > 0 || totalShannons([pick]) === null}
                    onChange={(event) => store.amount(pick.lineId, event.target.value)}
                  />
                </label>
                {detail && (
                  <small>
                    Current ledger limits: {displayShannons(detail.terms.minimumShannons)} to{' '}
                    {displayShannons(detail.terms.maximumShannons)} tCKB. Fees:{' '}
                    {detail.terms.protocolFeeBps / 100}% protocol +{' '}
                    {detail.terms.creatorFeeBps / 100}% creator, deducted from the losing pool.
                  </small>
                )}
                {detail &&
                  (!detail.accepting ||
                    now >= Date.parse(detail.terms.closesAt) ||
                    now >= Date.parse(detail.terms.kickoff)) && (
                    <p className="pick-error">This market is no longer accepting predictions.</p>
                  )}
                {errors.map((error) => (
                  <p className="pick-error" key={error}>
                    {error}
                  </p>
                ))}
              </article>
            );
          })}
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
          ) : (
            draft.picks.length > 0 && (
              <button className="quiet" onClick={() => setConfirmClear(true)}>
                Clear slip
              </button>
            )
          )}
        </div>
        <footer className="slip-footer">
          <div className="slip-total">
            <span>Stake subtotal</span>
            <strong>{total === null ? 'Check amounts' : `${displayShannons(total)} tCKB`}</strong>
          </div>
          <p>Each prediction settles independently.</p>
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
                        ? 'Draft checked. No bets placed and no funds moved.'
                        : 'Some predictions need attention. All picks are retained.'}
            </p>
          )}
          <button
            className="review-button"
            disabled={
              !draft.picks.length ||
              total === null ||
              snapshot.blocked ||
              snapshot.conflict ||
              review.isPending
            }
            onClick={() => review.mutate({ draft: structuredClone(draft), stamp, accountKey })}
          >
            {review.isPending ? 'Checking every prediction...' : 'Review predictions'}
          </button>
          <small>
            Review only, no stake reserved. Payment, network fees and storage will be added in a
            later step.
          </small>
        </footer>
      </dialog>
    </>
  );
}
