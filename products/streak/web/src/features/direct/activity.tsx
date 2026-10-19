import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DirectClient, Review } from './client';
import type { Descriptor, Point } from './protocol';
import type { MarketSnapshot, Position } from './discovery';
import type { JournalRecord } from './journal';
import type { Market } from '../markets/api';
import { getPublicMarket } from '../predictions/api';
import { displayShannons } from '../predictions/draft';
import { TeamBadge } from '../../components/team-badge';
import { useNow } from '../../lib/use-now';
import {
  activityState,
  collectionLabel,
  descriptorKey,
  isCollected,
  isHistory,
  pendingClaim,
  returnParts,
  stateLabels,
} from './activity-model';
import './activity.css';

const money = (n: string | bigint) => `${displayShannons(BigInt(n))} tCKB`;
const explorer = (hash: string) => `https://pudge.explorer.nervos.org/transaction/${hash}`;
type Observation = {
  descriptor: Descriptor;
  snapshot?: MarketSnapshot;
  market?: Market;
  error?: string;
};
type Row = Observation & { snapshot: MarketSnapshot; position: Position; key: string };

export function Activity({
  client,
  ownerHash,
  descriptors,
  records,
  sourceIssue,
  sourcesLoading,
  onConnect,
  connecting,
  connectionPending,
  recovery,
  onClaim,
  review,
  onSign,
  onDismissReview,
  working,
  signing,
  notice,
  error,
  onRefresh,
}: {
  client?: DirectClient;
  ownerHash?: string;
  descriptors: Descriptor[];
  records: readonly JournalRecord[];
  sourceIssue: boolean;
  sourcesLoading: boolean;
  onConnect: () => void;
  connecting: boolean;
  connectionPending: boolean;
  recovery: ReactNode;
  onClaim: (d: Descriptor, p: Point) => void;
  review: Review | null;
  onSign: () => void;
  onDismissReview: () => void;
  working: boolean;
  signing: boolean;
  notice: string;
  error?: string;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'open' | 'history'>('open');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(8);
  const [selected, setSelected] = useState<string | null>(null);
  const [showPayments, setShowPayments] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const now = useNow(true);
  const queryClient = useQueryClient();
  const chosen = descriptors.slice(0, limit);
  const queryKey = ['direct-private', ownerHash, 'activity', chosen.map(descriptorKey)];
  const observed = useQuery({
    queryKey,
    enabled: !!client,
    queryFn: async ({ signal }): Promise<Observation[]> => {
      const output: Observation[] = [];
      const previous = queryClient.getQueryData<Observation[]>(queryKey);
      // Three bounded readers; a failed market never erases other verified positions.
      for (let offset = 0; offset < chosen.length; offset += 3) {
        signal.throwIfAborted();
        const batch = await Promise.all(
          chosen.slice(offset, offset + 3).map(async (descriptor) => {
            const [chain, fixture] = await Promise.allSettled([
              client!.discover(descriptor),
              getPublicMarket(`m-${descriptor.fixtureId}`, signal),
            ]);
            const market =
              fixture.status === 'fulfilled' &&
              fixture.value.market.matchId === descriptor.fixtureId &&
              Date.parse(fixture.value.market.kickoff) === descriptor.cutoffMs
                ? fixture.value.market
                : undefined;
            return chain.status === 'fulfilled'
              ? { descriptor, snapshot: chain.value, market }
              : {
                  ...previous?.find(
                    (o) => descriptorKey(o.descriptor) === descriptorKey(descriptor),
                  ),
                  descriptor,
                  market,
                  error:
                    chain.reason instanceof Error
                      ? chain.reason.message
                      : 'Chain read unavailable.',
                };
          }),
        );
        signal.throwIfAborted();
        output.push(...batch);
      }
      return output;
    },
    staleTime: 30_000,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const rows: Row[] = (observed.data ?? []).flatMap((o) =>
    o.snapshot
      ? o.snapshot.positions.map((position) => ({
          ...o,
          snapshot: o.snapshot!,
          position,
          key: `${descriptorKey(o.descriptor)}:${position.id}`,
        }))
      : [],
  );
  const stale =
    observed.isError ||
    sourceIssue ||
    !!observed.data?.some((o) => o.error) ||
    (observed.dataUpdatedAt > 0 && now - observed.dataUpdatedAt > 120_000);
  const incomplete =
    stale ||
    descriptors.length > limit ||
    sourcesLoading ||
    !!observed.data?.some((o) => o.error || o.snapshot?.uncertainty);
  const ready = rows.filter(
    (r) =>
      r.position.status === 'claimable' &&
      !pendingClaim(r.position, r.descriptor, records) &&
      !r.snapshot.uncertainty &&
      !stale &&
      returnParts(r.position),
  );
  const readyTotal = ready.reduce((sum, r) => sum + returnParts(r.position)!.total, 0n);
  const current = rows.find((r) => r.key === selected);
  const rowState = (r: Row) =>
    activityState(r.position, r.snapshot, r.market?.fixtureStatus, r.descriptor.cutoffMs, now);
  const pickName = (r: Row) =>
    r.position.outcome === 1
      ? 'Draw'
      : `${r.position.outcome === 0 ? (r.market?.home ?? 'Home') : (r.market?.away ?? 'Away')} to win`;
  const listed = rows
    .filter((r) => (tab === 'history') === isHistory(r.position))
    .filter((r) => {
      const state = rowState(r);
      const matches =
        filter === 'all' || (filter === 'collect' ? ready.includes(r) : state === filter);
      return (
        matches &&
        `${r.descriptor.label} ${pickName(r)}`.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => b.descriptor.cutoffMs - a.descriptor.cutoffMs);
  const selectedPending = current && pendingClaim(current.position, current.descriptor, records);
  const parts = current && returnParts(current.position);
  const currentReview =
    current &&
    review?.kind === 'claim' &&
    descriptorKey(review.descriptor) === descriptorKey(current.descriptor)
      ? review
      : null;
  function close() {
    setSelected(null);
    onDismissReview();
  }
  function open(r: Row) {
    onDismissReview();
    setSelected(r.key);
  }
  function switchTab(next: 'open' | 'history') {
    setTab(next);
    setFilter('all');
  }
  const refresh = () => {
    onRefresh();
    void observed.refetch();
  };
  const filters =
    tab === 'open'
      ? [
          ['all', 'All'],
          ['live', 'In play'],
          ['upcoming', 'Upcoming'],
          ['settling', 'Settling'],
        ]
      : [
          ['all', 'All'],
          ['collect', 'To collect'],
          ['won', 'Won'],
          ['lost', 'Lost'],
          ['refund', 'Refunded'],
        ];
  return (
    <section className="activity-ledger" aria-label="My activity">
      <header className="activity-heading">
        <div>
          <p className="eyebrow">YOUR MATCHDAY, ON RECORD</p>
          <h1 ref={heading} tabIndex={-1}>
            My activity.
          </h1>
          <p>Your calls. Their results. Every return accounted for.</p>
        </div>
        <button className="quiet" onClick={refresh} disabled={!client || observed.isFetching}>
          {observed.isFetching ? 'Checking chain...' : 'Refresh activity'}
        </button>
      </header>
      {!client ? (
        <section className="glass activity-empty">
          <h2>
            {connectionPending ? 'Loading your predictions' : 'Your matchday history starts here'}
          </h2>
          <p>Connect your wallet to follow open bets and collect returns.</p>
          <button className="connect" disabled={connecting} onClick={onConnect}>
            {connecting
              ? 'Connecting...'
              : connectionPending
                ? 'Retry wallet checks'
                : 'Connect wallet'}
          </button>
        </section>
      ) : (
        <>
          <div className="activity-summary" aria-label="Verified activity summary">
            <div>
              <span>Open predictions</span>
              <strong>
                {observed.isPending || stale
                  ? 'Checking'
                  : rows.filter((r) => !isHistory(r.position)).length}
              </strong>
              <small>{incomplete ? 'In checked markets' : 'Following your next result'}</small>
            </div>
            <div>
              <span>Ready to collect</span>
              <strong>{observed.isPending || stale ? 'Checking' : money(readyTotal)}</strong>
              <button
                onClick={() => {
                  switchTab('history');
                  setFilter('collect');
                }}
              >
                View {ready.length} claims <span aria-hidden="true">↗</span>
              </button>
              <small>Includes refundable storage, before network fees</small>
            </div>
            <div>
              <span>Completed predictions</span>
              <strong>
                {observed.isPending || stale
                  ? 'Checking'
                  : rows.filter((r) => isCollected(r.position)).length}
              </strong>
              <small>Return collected</small>
            </div>
          </div>
          <button
            className="activity-payment-strip"
            aria-expanded={showPayments}
            onClick={() => setShowPayments(!showPayments)}
          >
            <span className="activity-payment-icon" aria-hidden="true">
              ↗
            </span>
            <span>
              <strong>Payments & recovery</strong>
              <small>Follow saved payments separately from accepted bets.</small>
            </span>
            <span>{showPayments ? 'Hide' : 'View'} →</span>
          </button>
          <div hidden={!showPayments}>{recovery}</div>
          {notice && (
            <p className="activity-message" role="status">
              {notice}
            </p>
          )}
          {incomplete && (
            <p className="activity-message">
              {stale
                ? 'Some information could not be refreshed. Claims are paused until checks recover.'
                : 'Showing verified positions from checked markets. More history may still be available.'}
            </p>
          )}
          <div className="activity-toolbar">
            <div className="activity-tabs" role="tablist" aria-label="Prediction history">
              {(['open', 'history'] as const).map((value, index) => (
                <button
                  key={value}
                  id={`activity-${value}-tab`}
                  role="tab"
                  tabIndex={tab === value ? 0 : -1}
                  aria-selected={tab === value}
                  aria-controls="activity-list"
                  onKeyDown={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault();
                      const next =
                        event.key === 'Home'
                          ? 'open'
                          : event.key === 'End'
                            ? 'history'
                            : index === 0
                              ? 'history'
                              : 'open';
                      switchTab(next);
                      document.getElementById(`activity-${next}-tab`)?.focus();
                    }
                  }}
                  onClick={() => switchTab(value)}
                >
                  {value === 'open' ? 'Open bets' : 'History'}{' '}
                  <small>
                    {rows.filter((r) => (value === 'history') === isHistory(r.position)).length}
                  </small>
                </button>
              ))}
            </div>
            <label className="activity-search">
              <span className="sr-only">Search predictions</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a match or pick"
                maxLength={120}
              />
            </label>
          </div>
          <div className="activity-filters" role="group" aria-label="Filter predictions">
            {filters.map(([value, label]) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <div
            id="activity-list"
            className="activity-list glass"
            role="tabpanel"
            aria-labelledby={`activity-${tab}-tab`}
            aria-busy={observed.isFetching}
          >
            {listed.map((r) => {
              const state = rowState(r),
                pending = pendingClaim(r.position, r.descriptor, records),
                collected = isCollected(r.position);
              return (
                <article className="activity-bet" key={r.key}>
                  <div className="activity-fixture">
                    <small>
                      {r.market?.competition ?? 'CKB prediction'} ·{' '}
                      {new Date(r.descriptor.cutoffMs).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                    <div>
                      {r.market ? (
                        <>
                          <TeamBadge
                            logo={r.market.homeLogo}
                            code={r.market.homeCode}
                            side="home"
                          />
                          <strong>{r.market.home}</strong>
                          <span>vs</span>
                          <TeamBadge
                            logo={r.market.awayLogo}
                            code={r.market.awayCode}
                            side="away"
                          />
                          <strong>{r.market.away}</strong>
                        </>
                      ) : (
                        <strong>{r.descriptor.label}</strong>
                      )}
                    </div>
                    <span
                      className="activity-pick"
                      data-outcome={['home', 'draw', 'away'][r.position.outcome]}
                    >
                      {pickName(r)}
                    </span>
                  </div>
                  <div className="activity-stake">
                    <small>Stake</small>
                    <strong>{money(r.position.principalShannons)}</strong>
                  </div>
                  <div className="activity-result">
                    <strong data-state={state}>{stateLabels[state]}</strong>
                    <small>
                      {collected
                        ? 'Collected'
                        : pending
                          ? 'Checking saved transfer'
                          : r.position.status === 'claimable'
                            ? 'Return available'
                            : state === 'verifying'
                              ? 'Payment is not yet an accepted bet'
                              : state === 'settling'
                                ? 'Waiting for on-chain settlement'
                                : 'Independent prediction'}
                    </small>
                  </div>
                  <button
                    className={ready.includes(r) ? 'activity-collect' : 'quiet'}
                    onClick={() => open(r)}
                  >
                    {ready.includes(r) ? collectionLabel(state) : 'Details'}{' '}
                    <span aria-hidden="true">↗</span>
                  </button>
                </article>
              );
            })}
            {listed.length === 0 && (
              <div className="activity-empty">
                <h2>
                  {observed.isPending
                    ? 'Checking your positions'
                    : search || filter !== 'all'
                      ? 'No matching predictions'
                      : incomplete
                        ? 'No positions found in the markets checked'
                        : tab === 'open'
                          ? 'Your next call starts here'
                          : 'Your settled predictions will appear here'}
                </h2>
                <p>
                  {observed.isPending
                    ? 'Reading confirmed market state from CKB.'
                    : 'Payments, accepted entries and settled results are tracked separately.'}
                </p>
                {tab === 'open' && (
                  <a className="quiet" href="/season/">
                    Explore markets ↗
                  </a>
                )}
              </div>
            )}
          </div>
          {descriptors.length > limit && (
            <button
              className="quiet activity-more"
              disabled={observed.isFetching}
              onClick={() => setLimit((n) => n + 8)}
            >
              Check eight more markets ({Math.min(limit, descriptors.length)} of{' '}
              {descriptors.length})
            </button>
          )}
          <p className="activity-coverage">
            History covers available market definitions and bounded, verified chain records. Older
            markets missing from the operator registry may need a recovery backup. A payment
            confirmation alone does not confirm entry acceptance.
          </p>
          {observed.data
            ?.filter((o) => o.error || o.snapshot?.uncertainty)
            .map((o) => (
              <details className="activity-read-issue" key={descriptorKey(o.descriptor)}>
                <summary>{o.descriptor.label}: incomplete chain read</summary>
                <p>{o.error ?? o.snapshot?.uncertainty}</p>
              </details>
            ))}
        </>
      )}
      {error && (
        <p className="activity-message" role="alert">
          {error}
        </p>
      )}
      <dialog
        className="activity-drawer"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        aria-labelledby="activity-detail-title"
      >
        <div className="activity-drawer-content">
          <header>
            <div>
              <p className="eyebrow">PREDICTION DETAILS</p>
              <h2 id="activity-detail-title">
                {current?.descriptor.label ?? 'Checking prediction'}
              </h2>
            </div>
            <button
              className="quiet"
              aria-label="Close prediction details"
              onClick={close}
              autoFocus
            >
              ×
            </button>
          </header>
          {current ? (
            <>
              {stale && (
                <p className="activity-message">
                  Last verified snapshot. Current chain status is unavailable, so collection is
                  paused.
                </p>
              )}
              <div className="activity-detail-score">
                <strong>
                  {current.market?.score
                    ? `${current.market.score.home} : ${current.market.score.away}`
                    : 'vs'}
                </strong>
                <small>{current.market?.fixtureStatus ?? 'Fixture status unavailable'}</small>
              </div>
              <div className="activity-detail-pick">
                <span>{pickName(current)}</span>
                <strong>{money(current.position.principalShannons)}</strong>
              </div>
              <h3>{stateLabels[rowState(current)]}</h3>
              <ol className="activity-timeline">
                <li>Payment confirmed on CKB</li>
                <li>
                  {current.position.status === 'pending-validation'
                    ? 'Entry acceptance is being verified'
                    : ['refund-required', 'refunded'].includes(current.position.status)
                      ? 'Entry did not qualify; refund path'
                      : 'Entry accepted'}
                </li>
                <li>
                  {current.position.status === 'refunded'
                    ? 'Late entry refunded automatically'
                    : isHistory(current.position)
                      ? 'Market settled; return verified'
                      : 'Awaiting contract settlement'}
                </li>
                <li>
                  {isCollected(current.position)
                    ? 'Return collected'
                    : selectedPending
                      ? 'Saved transfer is being checked'
                      : 'Collection follows settlement'}
                </li>
              </ol>
              {parts && (
                <section className="activity-return">
                  <h3>{isCollected(current.position) ? 'Collected return' : 'Your return'}</h3>
                  <dl>
                    <div>
                      <dt>Prediction return</dt>
                      <dd>{money(parts.prediction)}</dd>
                    </div>
                    <div>
                      <dt>Refundable storage</dt>
                      <dd>{money(parts.storage)}</dd>
                    </div>
                    <div className="activity-total">
                      <dt>Total before network fee</dt>
                      <dd>{money(parts.total)}</dd>
                    </div>
                  </dl>
                  <p>
                    Storage is your original cell deposit, returned even when your prediction loses.
                    It is included in this total.
                  </p>
                </section>
              )}
              {currentReview && (
                <section className="activity-claim-review" aria-label="Review claim">
                  <h3>Bring your CKB home.</h3>
                  <dl>
                    <div>
                      <dt>Return to wallet</dt>
                      <dd>{money(currentReview.payoutShannons ?? '0')}</dd>
                    </div>
                    <div>
                      <dt>Network fee</dt>
                      <dd>{money(currentReview.feeShannons)}</dd>
                    </div>
                    <div>
                      <dt>Net wallet increase</dt>
                      <dd>
                        {money(
                          BigInt(currentReview.payoutShannons ?? '0') -
                            BigInt(currentReview.feeShannons),
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    The full return includes storage. A separate wallet input pays the network fee.
                  </p>
                  <button
                    className="activity-collect"
                    aria-busy={signing}
                    disabled={
                      working ||
                      stale ||
                      observed.isFetching ||
                      !!current.snapshot.uncertainty ||
                      !!selectedPending ||
                      now >= currentReview.expiresAt
                    }
                    onClick={onSign}
                  >
                    {signing
                      ? 'Waiting for wallet approval...'
                      : now >= currentReview.expiresAt
                        ? 'Review expired'
                        : 'Sign claim in wallet'}
                  </button>
                  <button className="quiet" disabled={working} onClick={onDismissReview}>
                    Back to details
                  </button>
                </section>
              )}
              {!currentReview && ready.includes(current) && (
                <button
                  className="activity-collect"
                  aria-busy={working}
                  disabled={working || observed.isFetching}
                  onClick={() => onClaim(current.descriptor, current.position.outPoint)}
                >
                  {working ? 'Preparing wallet approval...' : collectionLabel(rowState(current))}
                </button>
              )}
              {selectedPending && (
                <p className="activity-message">
                  A signed transfer is saved. Close this panel and open Payments & recovery to check
                  it without creating a second claim.
                </p>
              )}
              {notice && (
                <p role="status" className="activity-message">
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" className="activity-message">
                  {error}
                </p>
              )}
              <details className="activity-chain-details">
                <summary>Transaction details</summary>
                <a
                  href={explorer(current.position.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View position transaction ↗
                </a>
                {current.position.claimTransactionHash && (
                  <a
                    href={explorer(current.position.claimTransactionHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View collection transaction ↗
                  </a>
                )}
                <a
                  href={explorer(current.descriptor.creationTxHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View market creation ↗
                </a>
              </details>
            </>
          ) : (
            <p className="activity-message">
              This position is being refreshed. Close the panel and refresh activity if it remains
              unavailable.
            </p>
          )}
        </div>
      </dialog>
    </section>
  );
}
