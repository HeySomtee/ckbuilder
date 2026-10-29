import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import type { DirectClient, Review } from './client';
import type { Descriptor, Point } from './protocol';
import type {
  ActivitySnapshot as MarketSnapshot,
  ActivityPosition as Position,
} from '../../../../shared/activity-wire';
import type { Account } from '../account/api';
import {
  activityGroups,
  activityIndexQuery,
  activityIndexKey,
  refreshActivityIndex,
} from './activity-index';
import type { JournalRecord } from './journal';
import type { Market } from '../markets/api';
import { getPublicMarket } from '../predictions/api';
import { activityQuery } from './activity-query';
import { displayShannons } from '../predictions/draft';
import { TeamBadge } from '../../components/team-badge';
import { Notice } from '../../components/notice';
import { BusyState } from '../../components/busy-state';
import { CellLoader } from '../../components/cell-loader';
import { Icon } from '../../components/icon';
import { PaymentButtonState } from './payment-progress';
import { useNow } from '../../lib/use-now';
import {
  activityState,
  activityPositionKey,
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
  account,
  onRecoveryChange,
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
  claimStage,
  notice,
  error,
  onRefresh,
}: {
  account: Account | null;
  onRecoveryChange: (active: boolean) => void;
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
  claimStage?: string;
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
  const [retryingEmptyRead, setRetryingEmptyRead] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const now = useNow(true);
  const queryClient = useQueryClient();
  const [chainRecovery, setChainRecovery] = useState(false);
  function selectRecovery(active: boolean) {
    setChainRecovery(active);
    onRecoveryChange(active);
  }
  const indexed = useInfiniteQuery(activityIndexQuery(queryClient, account));
  const index = indexed.data?.pages[0];
  const groups = activityGroups(indexed.data?.pages);
  const hasIndex = !!index?.available;
  const recover = chainRecovery;
  const chosen = recover ? descriptors.slice(0, limit) : groups.map((g) => g.descriptor);
  const observations = useQueries({
    queries: recover
      ? chosen.map((descriptor) => activityQuery(queryClient, client, ownerHash, descriptor))
      : [],
  });
  const fixtures = useQueries({
    queries: chosen.map((descriptor) => ({
      queryKey: ['public-market', `m-${descriptor.fixtureId}`],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getPublicMarket(`m-${descriptor.fixtureId}`, signal),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const data: Observation[] = chosen.map((descriptor, index) => {
    const read = observations[index],
      fixture = fixtures[index].data?.market;
    const group = groups[index];
    return {
      descriptor,
      snapshot: recover ? read.data : group.snapshot,
      market:
        fixture?.matchId === descriptor.fixtureId &&
        Date.parse(fixture.kickoff) === descriptor.cutoffMs
          ? fixture
          : undefined,
      error: (
        recover
          ? read.isError || (read.dataUpdatedAt > 0 && now - read.dataUpdatedAt > 120_000)
          : group.stale
      )
        ? 'This market is catching up with CKB.'
        : undefined,
    };
  });
  const observed = {
    data,
    isFetching: recover
      ? observations.some((q) => q.isFetching)
      : indexed.isFetching || !!index?.updating,
    isPending: recover
      ? (sourcesLoading || observations.some((q) => q.isPending)) &&
        !observations.some((q) => q.data)
      : indexed.isPending ||
        (groups.length === 0 && index?.updatedAt === null && index.coverage === 'indexing'),
    isError: recover
      ? observations.some((q) => q.isError)
      : indexed.isError || index?.available === false,
  };
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
          key: activityPositionKey(o.descriptor, position),
        }))
      : [],
  );
  const stale =
    observed.isError || (recover && sourceIssue) || !!observed.data?.some((o) => o.error);
  const incomplete =
    stale ||
    (recover ? descriptors.length > limit || sourcesLoading : index?.coverage !== 'complete') ||
    !!observed.data?.some(
      (o) => o.error || o.snapshot?.uncertainty || o.snapshot?.historyComplete === false,
    );
  const ready = rows.filter(
    (r) =>
      r.position.status === 'claimable' &&
      !pendingClaim(r.position, r.descriptor, records) &&
      !r.snapshot.uncertainty &&
      !r.error &&
      returnParts(r.position),
  );
  const readyTotal = ready.reduce((sum, r) => sum + returnParts(r.position)!.total, 0n);
  const summary = !recover && hasIndex ? index.summary : undefined;
  const emptyReadFailure =
    ((!recover && retryingEmptyRead) || (!observed.isPending && stale)) &&
    (recover || !hasIndex) &&
    !data.some((o) => o.snapshot);
  const [retained, setRetained] = useState<Row | null>(null);
  const freshCurrent = rows.find((r) => r.key === selected);
  const current = freshCurrent ?? (retained?.key === selected ? retained : undefined);
  const currentStale = !freshCurrent || !!current?.error;
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
    setRetained(r);
    setSelected(r.key);
  }
  function switchTab(next: 'open' | 'history') {
    setTab(next);
    setFilter('all');
  }
  const refreshIndex = useMutation({
    mutationFn: () => refreshActivityIndex(),
    retry: false,
    onSettled: () => {
      if (account) void queryClient.invalidateQueries({ queryKey: activityIndexKey(account) });
    },
  });
  const refresh = () => {
    if (!recover && account) {
      refreshIndex.mutate();
      return;
    }
    onRefresh();
    void queryClient.invalidateQueries({ queryKey: ['direct-private', ownerHash, 'activity'] });
  };
  const refreshPending = recover
    ? observations.some((q) => q.isFetching)
    : indexed.isFetching || refreshIndex.isPending;
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
        {!emptyReadFailure && (
          <button
            className="quiet activity-collect"
            aria-busy={refreshPending}
            onClick={refresh}
            disabled={(!account && !client) || refreshPending}
          >
            {refreshPending ? <PaymentButtonState label="Updating activity" /> : 'Refresh activity'}
          </button>
        )}
      </header>
      {working && !selected && (
        <BusyState
          label={signing ? (claimStage ?? 'Checking your return') : 'Preparing your return'}
          detail="You can keep browsing this page. Your transfer progress stays here."
        />
      )}
      {(!account && !recover) || (recover && !client) ? (
        <section className="glass activity-empty">
          {connectionPending && connecting ? (
            <BusyState
              label={account ? 'Connecting your wallet' : 'Opening your account'}
              detail="Your saved activity stays separate from wallet approvals."
            />
          ) : (
            <>
              <h2>Your matchday history starts here</h2>
              <p>
                {account
                  ? 'Connect your wallet to recover positions directly from CKB.'
                  : 'Sign in to see your saved predictions and returns.'}
              </p>
            </>
          )}
          <button className="connect" disabled={connecting} onClick={onConnect}>
            {connecting ? (
              <PaymentButtonState label="Connecting..." />
            ) : account ? (
              'Connect wallet'
            ) : (
              'Sign in with wallet'
            )}
          </button>
          {!account && client && (
            <button className="quiet" onClick={() => selectRecovery(true)}>
              Recover from chain
            </button>
          )}
        </section>
      ) : (
        <>
          {emptyReadFailure ? (
            <section className="activity-retry-card" aria-labelledby="activity-retry-title">
              <span className="activity-retry-icon">
                <Icon name="activity" />
              </span>
              <div className="activity-retry-copy" role="status">
                <h2 id="activity-retry-title">Let’s bring your activity back.</h2>
                <p>We couldn’t load your predictions just now. Try again in a moment.</p>
              </div>
              <button
                className="activity-collect"
                aria-busy={refreshPending || retryingEmptyRead}
                disabled={refreshPending || retryingEmptyRead}
                onClick={() => {
                  if (recover) refresh();
                  else {
                    setRetryingEmptyRead(true);
                    void indexed.refetch().then(
                      () => setRetryingEmptyRead(false),
                      () => setRetryingEmptyRead(false),
                    );
                  }
                }}
              >
                {refreshPending || retryingEmptyRead ? (
                  <PaymentButtonState label="Trying again" />
                ) : (
                  'Retry activity'
                )}
              </button>
              <details className="activity-recovery-options">
                <summary>
                  Recovery options <Icon name="chevron-down" />
                </summary>
                <p>
                  You can review payments saved in this browser or check your wallet’s positions
                  directly on CKB. A direct check can take longer.
                </p>
                <div className="activity-recovery-actions">
                  <button
                    className="quiet"
                    aria-expanded={showPayments}
                    onClick={() => setShowPayments(!showPayments)}
                  >
                    {showPayments ? 'Hide saved payments' : 'Review saved payments'}
                  </button>
                  {recover ? (
                    account && (
                      <button className="quiet" onClick={() => selectRecovery(false)}>
                        Back to saved activity
                      </button>
                    )
                  ) : (
                    <button className="quiet" onClick={() => selectRecovery(true)}>
                      Recover from chain
                    </button>
                  )}
                </div>
                {showPayments &&
                  (recovery ?? (
                    <button className="quiet" disabled={connecting} onClick={onConnect}>
                      {connecting ? (
                        <PaymentButtonState label="Connecting wallet..." />
                      ) : (
                        'Connect wallet for saved payment recovery'
                      )}
                    </button>
                  ))}
              </details>
            </section>
          ) : (
            <>
              <div className="activity-summary" aria-label="Verified activity summary">
                <div>
                  <span>Open predictions</span>
                  <strong
                    className={observed.isPending ? 'activity-skeleton' : ''}
                    aria-label={observed.isPending ? 'Loading open predictions' : undefined}
                  >
                    {observed.isPending ? (
                      <CellLoader variant="wave" />
                    ) : (
                      (summary?.open ?? rows.filter((r) => !isHistory(r.position)).length)
                    )}
                  </strong>
                  <small>{incomplete ? 'In checked markets' : 'Following your next result'}</small>
                </div>
                <div>
                  <span>{incomplete ? 'Last checked returns' : 'Ready to collect'}</span>
                  <strong
                    className={observed.isPending ? 'activity-skeleton' : ''}
                    aria-label={observed.isPending ? 'Loading returns' : undefined}
                  >
                    {observed.isPending ? (
                      <CellLoader variant="wave" />
                    ) : (
                      money(summary?.collectibleShannons ?? readyTotal)
                    )}
                  </strong>
                  <button
                    onClick={() => {
                      switchTab('history');
                      setFilter(incomplete ? 'all' : 'collect');
                    }}
                  >
                    {incomplete
                      ? 'Review saved returns'
                      : `View ${summary?.claimable ?? ready.length} claims`}{' '}
                    <span aria-hidden="true">↗</span>
                  </button>
                  <small>Includes refundable storage, before network fees</small>
                </div>
                <div>
                  <span>Completed predictions</span>
                  <strong
                    className={observed.isPending ? 'activity-skeleton' : ''}
                    aria-label={observed.isPending ? 'Loading completed predictions' : undefined}
                  >
                    {observed.isPending ? (
                      <CellLoader variant="wave" />
                    ) : (
                      (summary?.completed ?? rows.filter((r) => isCollected(r.position)).length)
                    )}
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
              {showPayments && (
                <div>
                  {recovery ?? (
                    <button className="quiet" disabled={connecting} onClick={onConnect}>
                      {connecting ? (
                        <PaymentButtonState label="Connecting wallet..." />
                      ) : (
                        'Connect wallet for saved payment recovery'
                      )}
                    </button>
                  )}
                </div>
              )}
              {notice && <Notice title={notice} dismissible />}
              {!recover && (indexed.isError || index?.available === false) && (
                <Notice
                  title="Couldn’t refresh activity"
                  dismissible
                  actions={
                    <>
                      <button onClick={() => void indexed.refetch()}>Retry activity</button>
                      <button onClick={() => selectRecovery(true)}>Recover from chain</button>
                    </>
                  }
                >
                  Showing your last saved activity. Returns are checked again before collection.
                </Notice>
              )}
              {recover && (
                <Notice
                  title="Checking directly on CKB"
                  actions={
                    account ? (
                      <button
                        onClick={() => {
                          selectRecovery(false);
                          void indexed.refetch();
                        }}
                      >
                        Back to saved activity
                      </button>
                    ) : undefined
                  }
                >
                  Recovery checks each available market. Your signed transactions remain saved.
                </Notice>
              )}
              {refreshIndex.isError && (
                <Notice title="Activity refresh could not start" dismissible>
                  {refreshIndex.error.message}
                </Notice>
              )}
              {stale && (recover || (!indexed.isError && index?.available !== false)) && (
                <Notice
                  title="Some markets are still catching up"
                  dismissible
                  actions={
                    <>
                      <button onClick={refresh}>Retry checks</button>
                      {!recover && (
                        <button onClick={() => selectRecovery(true)}>Recover from chain</button>
                      )}
                    </>
                  }
                >
                  Your previous activity stays visible. Each return is checked separately before
                  collection.
                </Notice>
              )}
              {(observed.isFetching || (recover && sourcesLoading)) && (
                <div className="activity-progress" role="status">
                  <CellLoader variant="wave" />
                  <span>
                    {recover ? 'Finding your predictions' : 'Updating your saved activity'}{' '}
                    <small>
                      {recover
                        ? `${observations.filter((q) => q.data).length} of ${chosen.length} markets checked`
                        : 'You can keep browsing while records catch up.'}
                    </small>
                  </span>
                </div>
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
                  <button
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
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
                                : state === 'verifying' || state === 'submitted'
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
                    {observed.isPending ? (
                      <BusyState
                        label={recover ? 'Finding your predictions' : 'Opening your activity'}
                        detail={
                          recover
                            ? 'Your positions will appear as each market is checked.'
                            : 'Your saved records appear here while recent changes are checked.'
                        }
                      />
                    ) : (
                      <>
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
                      </>
                    )}
                    {tab === 'open' && (
                      <a className="quiet" href="/season/">
                        Explore markets ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
              {recover && descriptors.length > limit && (
                <button
                  className="quiet activity-more"
                  disabled={observed.isFetching}
                  onClick={() => setLimit((n) => n + 8)}
                >
                  Check eight more markets ({Math.min(limit, descriptors.length)} of{' '}
                  {descriptors.length})
                </button>
              )}
              {!recover && indexed.hasNextPage && (
                <button
                  className="quiet activity-more"
                  disabled={indexed.isFetchingNextPage}
                  onClick={() => void indexed.fetchNextPage()}
                >
                  {indexed.isFetchingNextPage ? (
                    <PaymentButtonState label="Loading more predictions..." />
                  ) : (
                    'Show more predictions'
                  )}
                </button>
              )}
              <p className="activity-coverage">
                {recover
                  ? 'Direct recovery covers the available market definitions.'
                  : index?.updatedAt
                    ? `Saved activity updated ${new Date(index.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`
                    : 'Preparing your saved activity.'}{' '}
                {incomplete ? 'Some records are still catching up. ' : ''}Every collection gets a
                fresh chain check. Payment confirmation and entry acceptance are tracked separately.
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
        </>
      )}
      {error && !selected && (
        <Notice title="Let's get this sorted" tone="attention" dismissible>
          {error}
        </Notice>
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
              {currentStale && (
                <p className="activity-message">
                  Last verified snapshot. Current chain status is unavailable, so collection is
                  paused.
                </p>
              )}
              <div className="activity-detail-fixture">
                <div>
                  <TeamBadge
                    logo={current.market?.homeLogo ?? null}
                    code={current.market?.homeCode ?? 'H'}
                    side="home"
                  />
                  <strong>
                    {current.market?.home ?? current.descriptor.label.split(/\s+v(?:s)?\s+/i)[0]}
                  </strong>
                </div>
                <div className="activity-detail-score">
                  <strong>
                    {current.market?.score
                      ? `${current.market.score.home} : ${current.market.score.away}`
                      : 'vs'}
                  </strong>
                  <small>{current.market?.fixtureStatus ?? 'Prediction'}</small>
                </div>
                <div>
                  <TeamBadge
                    logo={current.market?.awayLogo ?? null}
                    code={current.market?.awayCode ?? 'A'}
                    side="away"
                  />
                  <strong>
                    {current.market?.away ??
                      current.descriptor.label.split(/\s+v(?:s)?\s+/i)[1] ??
                      'Away'}
                  </strong>
                </div>
              </div>
              <div className="activity-detail-pick">
                <span>{pickName(current)}</span>
                <strong>{money(current.position.principalShannons)}</strong>
              </div>
              <h3>{stateLabels[rowState(current)]}</h3>
              <ol className="activity-timeline">
                <li>
                  {current.position.status === 'submitted'
                    ? 'Payment submitted; awaiting CKB confirmation'
                    : 'Payment confirmed on CKB'}
                </li>
                <li>
                  {['submitted', 'pending-validation'].includes(current.position.status)
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
                      currentStale ||
                      !!current.snapshot.uncertainty ||
                      !!selectedPending ||
                      now >= currentReview.expiresAt
                    }
                    onClick={onSign}
                  >
                    {signing ? (
                      <PaymentButtonState label={claimStage ?? 'Checking your return...'} />
                    ) : now >= currentReview.expiresAt ? (
                      'Review expired'
                    ) : (
                      'Sign claim in wallet'
                    )}
                  </button>
                  <button
                    className="quiet"
                    disabled={working}
                    onClick={() => {
                      onDismissReview();
                      if (now >= currentReview.expiresAt)
                        onClaim(current.descriptor, current.position.outPoint);
                    }}
                  >
                    {now >= currentReview.expiresAt ? 'Refresh review' : 'Back to details'}
                  </button>
                </section>
              )}
              {!currentReview && ready.includes(current) && (
                <button
                  className="activity-collect"
                  aria-busy={working}
                  disabled={working}
                  onClick={() =>
                    client ? onClaim(current.descriptor, current.position.outPoint) : onConnect()
                  }
                >
                  {working ? (
                    <PaymentButtonState label="Preparing wallet approval..." />
                  ) : !client ? (
                    connecting ? (
                      <PaymentButtonState label="Connecting wallet..." />
                    ) : (
                      'Connect wallet to collect'
                    )
                  ) : (
                    collectionLabel(rowState(current))
                  )}
                </button>
              )}
              {selectedPending && (
                <p className="activity-message">
                  A signed transfer is saved. Close this panel and open Payments & recovery to check
                  it without creating a second claim.
                </p>
              )}
              {notice && <Notice title={notice} dismissible />}
              {error && (
                <Notice title="Let's get this sorted" tone="attention" dismissible>
                  {error}
                </Notice>
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
          ) : selected && observed.isFetching ? (
            <BusyState
              label="Checking prediction"
              detail="This position is being refreshed. You can close this panel while it updates."
            />
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
