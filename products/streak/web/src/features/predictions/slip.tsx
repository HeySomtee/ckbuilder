import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getPublicMarket } from './api';
import { DRAFT_KEY, displayShannons, totalShannons } from './draft';
import type { DraftStore } from './draft';
import type { Account } from '../account/api';
import { useNow } from '../../lib/use-now';
import { TeamBadge } from '../../components/team-badge';
const BatchCheckout = lazy(() =>
  import('../direct/batch-ui').then((module) => ({ default: module.BatchCheckout })),
);

export function PredictionSlip({
  store,
  open,
  onOpen,
  onDismiss,
  accountKey,
  account,
  accountReady,
  onSignIn,
  signInPending,
}: {
  store: DraftStore;
  open: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  accountKey: string;
  account: Account | null;
  accountReady: boolean;
  onSignIn: () => void;
  signInPending: boolean;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { draft } = snapshot;
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const dock = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusFrame = useRef(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [checkoutWorking, setCheckoutWorking] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  useEffect(() => {
    if (open) setCheckoutOpened(true);
  }, [open]);
  const editingDisabled = snapshot.blocked || snapshot.conflict || checkoutWorking;
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
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === DRAFT_KEY || event.key === null) store.externalChange();
    };
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('storage', storage);
    };
  }, [store, accountKey]);
  useEffect(
    () => () => {
      cancelAnimationFrame(focusFrame.current);
    },
    [],
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
      title.current?.focus({ preventScroll: true });
    }
    if (!open && element.open) element.close();
  }, [open]);
  function dismiss() {
    cancelAnimationFrame(focusFrame.current);
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
            <button onClick={dismiss} aria-label="Close prediction slip" title="Close slip">
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
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
              const label = market ? `${market.home} vs ${market.away}` : `Market ${pick.marketId}`;
              const invalidAmount = totalShannons([pick]) === null;
              const errorId = `pick-errors-${pick.lineId}`;
              const allowedPresets = ['100', '200', '500'];
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
                      disabled={editingDisabled}
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
                          disabled={editingDisabled}
                          value={pick.amountCkb}
                          aria-invalid={invalidAmount}
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
                            disabled={editingDisabled}
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
                  </div>
                </article>
              );
            })}
          </div>
          {draft.picks.length > 0 && (
            <button className="slip-add-more" onClick={dismiss}>
              <span aria-hidden="true">+</span> Add more matches
            </button>
          )}
        </div>
        <footer className="slip-footer">
          {confirmClear ? (
            <div className="notice" role="alert">
              <p>Discard every prediction in this saved slip?</p>
              <div className="slip-choices">
                <button
                  disabled={checkoutWorking}
                  onClick={() => {
                    store.clear();
                    setConfirmClear(false);
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
          <Suspense fallback={<p role="status">Loading payment...</p>}>
            {checkoutOpened && (
              <BatchCheckout
                onDismiss={dismiss}
                store={store}
                account={account}
                accountReady={accountReady}
                onSignIn={onSignIn}
                signInPending={signInPending}
                active={open}
                onBusy={setCheckoutWorking}
              />
            )}
          </Suspense>

          <div className="slip-footer-meta">
            <span className="slip-save-state">
              {snapshot.saved ? 'Saved on this device' : 'Draft in this tab'}
            </span>
            {draft.picks.length > 0 && (
              <button
                className="clear-slip"
                disabled={checkoutWorking}
                onClick={() => setConfirmClear(true)}
              >
                Clear slip
              </button>
            )}
          </div>
        </footer>
      </dialog>
    </>
  );
}
