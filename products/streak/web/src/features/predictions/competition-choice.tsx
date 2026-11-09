import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CampaignSummary } from '../../../../shared/campaign-wire';
import type { DraftStore, Pick } from './draft';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import './competition-choice.css';

export function CompetitionChoice({
  pick,
  campaigns,
  ready,
  loading,
  onRetry,
  accountId,
  store,
  disabled,
  label,
}: {
  pick: Pick;
  campaigns: readonly CampaignSummary[];
  ready: boolean;
  accountId?: string;
  loading?: boolean;
  onRetry?: () => void;
  store: DraftStore;
  disabled: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const relevant = campaigns.filter(
    (item) =>
      item.joined &&
      item.kind === 'predictions' &&
      ['open', 'live'].includes(item.state) &&
      item.joinedFixtureIds?.includes(pick.matchId),
  );
  const explicit = relevant.filter((item) => item.predictionEntryPolicy === 'explicit-entry-v3');
  const used = (item: CampaignSummary) => item.qualifyingFixtureIds?.includes(pick.matchId);
  const pending = (item: CampaignSummary) => item.pendingFixtureIds?.includes(pick.matchId);
  const available = explicit.filter((item) => !used(item) && !pending(item));
  const legacy = relevant.filter(
    (item) => item.predictionEntryPolicy !== 'explicit-entry-v3' && !used(item),
  );
  const wrongAccount = !!pick.competition && pick.competition.accountId !== accountId;
  const selected = wrongAccount
    ? []
    : explicit.filter((item) => !used(item) && pick.competition?.ids.includes(item.id));
  const missing =
    !wrongAccount &&
    !!pick.competition?.ids.some((id) => !campaigns.some((item) => item.id === id));
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [accountId]);
  // A confirmed first entry makes a later draft regular automatically. Never remove
  // a pending choice because a refresh is delayed or because another tab signed it.
  useEffect(() => {
    if (!ready || disabled || !accountId || pick.competition?.accountId !== accountId) return;
    const ids = pick.competition.ids.filter(
      (id) =>
        !campaigns.find((item) => item.id === id)?.qualifyingFixtureIds?.includes(pick.matchId),
    );
    if (ids.length !== pick.competition.ids.length) store.competitions(pick.lineId, accountId, ids);
  }, [ready, disabled, accountId, campaigns, pick, store]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  if (!accountId) return null;
  if (!ready)
    return (
      <span className="competition-choice-note">
        {loading ? (
          <>
            <CellLoader /> Checking competition choices
          </>
        ) : (
          <>
            Competition choices could not refresh. Saved choices are retained.{' '}
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </span>
    );
  const title =
    selected.length === 1
      ? selected[0].name
      : selected.length
        ? `${selected.length} competitions`
        : 'Regular prediction';
  return (
    <div className="competition-choice">
      {available.length || wrongAccount || missing || selected.length ? (
        <button
          ref={trigger}
          type="button"
          className={`competition-choice-trigger${selected.length ? ' is-selected' : ''}`}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-label={`Where this pick counts: ${label}`}
          onClick={() => {
            setChosen(selected.map((item) => item.id));
            setOpen(true);
          }}
        >
          <Icon name={selected.length ? 'shield' : 'markets'} />
          <span>
            <strong>{wrongAccount || missing ? 'Review competition choices' : title}</strong>
            <small>
              {selected.length
                ? 'Counts for points · tap to change'
                : 'Choose where this pick counts'}
            </small>
          </span>
          <Icon name="chevron-down" />
        </button>
      ) : (
        <div className="competition-choice-note">
          <span className="competition-choice-dot" />
          Regular prediction
          {relevant.some(pending) ? (
            <small>Earlier entry pending</small>
          ) : relevant.some(used) ? (
            <small>Competition entry already used</small>
          ) : null}
        </div>
      )}
      {legacy.map((item) => (
        <small className="competition-choice-legacy" key={item.id}>
          Automatic entry: {item.name}. Its published rules apply.
        </small>
      ))}
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="competition-choice-dialog"
            aria-labelledby={`choice-${pick.lineId}`}
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <header>
              <div>
                <span className="eyebrow">YOUR PICK. YOUR CHOICE.</span>
                <h2 id={`choice-${pick.lineId}`}>Where should it count?</h2>
                <p>{label}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close competition choices"
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="competition-choice-body">
              <p>
                One payment. The same returns. Choose competitions for points, or keep this
                prediction regular.
              </p>
              {wrongAccount && (
                <p role="status">
                  This slip came from another account. Save your choices for this wallet.
                </p>
              )}
              <label className={`competition-choice-option${!chosen.length ? ' is-chosen' : ''}`}>
                <input type="checkbox" checked={!chosen.length} onChange={() => setChosen([])} />
                <span>
                  <strong>Regular prediction</strong>
                  <small>No points in competitions with optional entry.</small>
                </span>
              </label>
              <div className="competition-choice-caption">
                COMPETITIONS YOU JOINED <span>Select one or more</span>
              </div>
              {explicit.map((item) => (
                <label
                  key={item.id}
                  className={`competition-choice-option${chosen.includes(item.id) ? ' is-chosen' : ''}${used(item) || pending(item) ? ' is-unavailable' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(item.id)}
                    disabled={!!used(item) || !!pending(item)}
                    onChange={(event) =>
                      setChosen((ids) =>
                        event.target.checked
                          ? [...ids, item.id]
                          : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {used(item)
                        ? 'Already entered · further bets are regular'
                        : pending(item)
                          ? 'Entry reserved · check your saved payment'
                          : '3 points for a correct call · one entry per fixture'}
                    </small>
                  </span>
                  {(used(item) || pending(item)) && <Icon name={used(item) ? 'check' : 'shield'} />}
                </label>
              ))}
              {legacy.length > 0 && (
                <p>
                  Earlier competitions use automatic entry. Choosing Regular here does not change
                  their published rules.
                </p>
              )}
              <p className="competition-choice-footnote">
                Your choice is saved with the payment before signing. Regular predictions keep the
                same payouts and storage refunds.
              </p>
            </div>
            <footer>
              <button type="button" className="quiet" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="connect"
                onClick={() => {
                  if (
                    store.competitions(
                      pick.lineId,
                      accountId,
                      chosen.filter(
                        (id) =>
                          !explicit
                            .find((item) => item.id === id)
                            ?.qualifyingFixtureIds?.includes(pick.matchId),
                      ),
                    )
                  )
                    close();
                }}
              >
                Save choices
              </button>
            </footer>
          </dialog>,
          document.body,
        )}
    </div>
  );
}
