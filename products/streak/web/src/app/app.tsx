import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCompetitions, getMarkets, outcomes } from '../features/markets/api';
import type { Market, MarketSort } from '../features/markets/api';
import { getAccount, signIn, signOut } from '../features/account/api';
import { WalletOverview, WalletSummary } from '../features/account/wallet-ui';
import { Icon } from '../components/icon';
import { DayNavigation, useCalendarToday } from '../features/markets/day-navigation';
import { moveDay, parseDay } from '../features/markets/calendar';
import { weekend } from '../features/markets/weekend';
import { TeamBadge } from '../components/team-badge';
import { MarketDetail } from '../features/markets/detail';
import { createDraftStore } from '../features/predictions/draft';
import type { Outcome } from '../features/predictions/draft';
import { PredictionSlip } from '../features/predictions/slip';
import { Brand } from '../components/brand';
import { followMarket, marketHref, navigateMarket, useMarketRoute } from '../lib/market-route';
import { navigateActivity, useDirectRoute } from '../lib/direct-route';
import { useSectionRoute, sectionHref, followSection } from '../lib/section-route';
import { AppNavigation } from './navigation';
import { SectionPage } from './sections';
import { getAtomicEntryEnabled } from '../features/direct/availability-api';
import { Notice } from '../components/notice';
import { BusyState } from '../components/busy-state';
import { CellLoader } from '../components/cell-loader';
import { poolLabel } from '../features/markets/pools';
import { usePools } from '../features/markets/use-pools';
import { fixtureLabel, settlementLabel } from '../features/markets/status';
import '../design-system/predictions.css';
import {
  assertWalletAccount,
  disconnectWallet,
  getWalletState,
  subscribeWallet,
  restoreWallet,
} from '../lib/wallet';

const DirectPage = lazy(() => import('../features/direct/ui'));
const SurvivorPage = lazy(() => import('../features/survivor/ui'));
const FivePage = lazy(() => import('../features/five/ui'));

function MarketCard({
  market,
  onPick,
  selected,
}: {
  market: Market;
  onPick: (market: Market, outcome: Outcome) => void;
  selected?: Outcome;
}) {
  const labels = { home: 'Home', draw: 'Draw', away: 'Away' };
  return (
    <article className="glass market-card">
      <div className="card-top">
        <span className="competition">
          {market.competitionLogo && (
            <img
              src={market.competitionLogo}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          )}
          {market.competition}
        </span>
        <span
          className={`status ${market.fixtureStatus === 'final' ? 'resolved' : market.fixtureStatus}`}
        >
          {fixtureLabel(market)}
        </span>
      </div>
      <time dateTime={market.kickoff}>
        {new Date(market.kickoff).toLocaleString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
      <a
        className="teams"
        href={market.available ? marketHref(market.id) : undefined}
        aria-label={
          market.available ? `Match details for ${market.home} vs ${market.away}` : undefined
        }
        onClick={(event) => {
          if (market.available) followMarket(event, market.id);
        }}
      >
        <div>
          <TeamBadge
            key={market.homeLogo}
            logo={market.homeLogo}
            code={market.homeCode}
            side="home"
          />
          <h2>{market.home}</h2>
        </div>
        <span className="versus">
          {market.score ? `${market.score.home} : ${market.score.away}` : 'vs'}
        </span>
        <div>
          <TeamBadge
            key={market.awayLogo}
            logo={market.awayLogo}
            code={market.awayCode}
            side="away"
          />
          <h2>{market.away}</h2>
        </div>
      </a>
      {market.available ? (
        <>
          <div className="percentages" aria-label="Current pool percentages">
            {outcomes.map((side) => (
              <button
                key={side}
                className="outcome-glass"
                data-outcome={side}
                aria-label={`Add ${labels[side]} for ${market.home} vs ${market.away}`}
                aria-pressed={selected === side}
                disabled={market.status !== 'open' || market.fixtureStatus !== 'scheduled'}
                onClick={() => onPick(market, side)}
              >
                <span>{labels[side]}</span>
                <strong>
                  {poolLabel(
                    market.directPool,
                    side,
                    side === 'home' ? '1' : side === 'draw' ? 'X' : '2',
                  )}
                </strong>
                {selected === side && (
                  <i className="pick-check" aria-hidden="true">
                    ✓
                  </i>
                )}
              </button>
            ))}
          </div>
          <div className="card-meta">
            <span>
              {market.fixtureStatus === 'final' || market.fixtureStatus === 'cancelled'
                ? settlementLabel(market.directPool)
                : market.directPool?.state === 'ready'
                  ? 'On-chain pool share'
                  : market.directPool?.state === 'uninitialized' &&
                      market.fixtureStatus === 'scheduled' &&
                      Date.parse(market.kickoff) > Date.now()
                    ? 'Be the first to predict'
                    : 'Predictions closed or pool updating'}
            </span>
            <a
              className="card-details-link"
              href={marketHref(market.id)}
              onClick={(event) => followMarket(event, market.id)}
              aria-label={`View market: ${market.home} vs ${market.away}`}
            >
              View market <Icon name="arrow" />
            </a>
          </div>
        </>
      ) : (
        <div className="schedule-only">
          <strong>Fixture on the schedule</strong>
          <p>No prediction market is available for this match.</p>
        </div>
      )}
    </article>
  );
}

export function App() {
  const client = useQueryClient();
  const wallet = useSyncExternalStore(subscribeWallet, getWalletState);
  useEffect(
    () =>
      subscribeWallet(() => {
        void client.cancelQueries({ queryKey: ['direct-private'] });
        client.removeQueries({ queryKey: ['direct-private'] });
      }),
    [client],
  );
  const marketId = useMarketRoute();
  const directRoute = useDirectRoute();
  const directEntry = !!directRoute && !['wallet', 'activity'].includes(directRoute);
  const entryMode = useQuery({
    queryKey: ['atomic-entry-mode'],
    queryFn: ({ signal }) => getAtomicEntryEnabled(signal),
    enabled: directEntry,
    retry: false,
    staleTime: 15_000,
  });
  const currentEntry = directEntry && entryMode.data === true;
  const section = useSectionRoute();
  const activePage =
    directRoute === 'wallet' || directRoute === 'activity'
      ? directRoute
      : directRoute || marketId
        ? 'markets'
        : (section ?? 'markets');
  const [draftStore] = useState(createDraftStore);
  const draftState = useSyncExternalStore(draftStore.subscribe, draftStore.getSnapshot);
  const [slipOpen, setSlipOpen] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState('');
  function pick(market: Market, outcome: Outcome) {
    if (
      market.status !== 'open' ||
      market.fixtureStatus !== 'scheduled' ||
      Date.now() >= Math.min(Date.parse(market.closesAt), Date.parse(market.kickoff))
    ) {
      setSelectionNotice(
        'This market has closed. Refresh its details before choosing a prediction.',
      );
      return;
    }
    const picks = draftStore.getSnapshot().draft.picks;
    const existing = picks.find((pick) => pick.matchId === market.matchId);
    const openSlip = picks.length === 0 || existing?.outcome === outcome;
    const added = draftStore.select(market.id, market.matchId, outcome);
    setSelectionNotice(
      added
        ? `Prediction added: ${market.home} vs ${market.away}. ${draftStore.getSnapshot().draft.picks.length} in your slip.`
        : 'This prediction could not be added. Open your slip for details.',
    );
    if (openSlip || !added) setSlipOpen(true);
  }
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<MarketSort>('featured');
  const [competition, setCompetition] = useState('');
  const [date, setDate] = useState(() => {
    const value = new URLSearchParams(location.search).get('date') ?? 'today';
    return value === 'weekend' || parseDay(value) ? value : 'today';
  });
  const today = useCalendarToday();
  const dates = weekend(0, today);
  const from =
    status === 'live'
      ? moveDay(today, -1)
      : date === 'weekend'
        ? dates.start
        : (parseDay(date) ?? today);
  const to =
    status === 'live' ? moveDay(today, 1) : date === 'weekend' ? dates.end : moveDay(from, 1);
  const selectDate = (value: string) => {
    setDate(value);
    if (status === 'live') setStatus('all');
    const url = new URL(location.href);
    if (value === 'today') url.searchParams.delete('date');
    else url.searchParams.set('date', value);
    history.replaceState(null, '', url);
  };
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const account = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => getAccount(signal),
    retry: false,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (account.isSuccess) void restoreWallet(account.data?.walletAddress);
  }, [account.isSuccess, account.data?.walletAddress]);
  useEffect(() => {
    if (!account.isSuccess) return;
    // A cached read belongs to a verified session, even when no signer is connected.
    client.removeQueries({
      predicate: (query) =>
        query.queryKey[0] === 'private' &&
        query.queryKey[1] === 'activity-index' &&
        (query.queryKey[3] !== account.data?.id ||
          query.queryKey[4] !== account.data?.walletAddress),
    });
  }, [client, account.isSuccess, account.data?.id, account.data?.walletAddress]);
  useEffect(() => {
    const accountId = account.data?.id;
    const address = account.data?.walletAddress;
    if (!accountId || !address) return;
    const lifetime = new AbortController();
    const current = () => {
      const authenticated = client.getQueryData<Awaited<ReturnType<typeof getAccount>>>([
        'account',
      ]);
      return (
        !lifetime.signal.aborted &&
        authenticated?.id === accountId &&
        authenticated.walletAddress === address
      );
    };
    void import('../features/direct/activity-index')
      .then(({ activityIndexQuery }) =>
        client.prefetchInfiniteQuery(
          activityIndexQuery(
            client,
            { id: accountId, walletAddress: address },
            current,
            lifetime.signal,
          ),
        ),
      )
      .catch(() => {
        // Optional preparation never blocks the shell. Activity retains its own
        // explicit loading, retry and recovery states if this read cannot finish.
      });
    return () => lifetime.abort();
  }, [client, account.data?.id, account.data?.walletAddress]);
  useEffect(() => {
    const connection = wallet.connection;
    if (!connection || !account.data) return;
    void assertWalletAccount(connection, account.data.walletAddress).catch((error: unknown) => {
      disconnectWallet(
        error instanceof Error ? error.message : 'Your wallet account changed. Connect again.',
        connection,
      );
    });
  }, [wallet.connection, account.data]);
  const [signInStage, setSignInStage] = useState('Connecting wallet');
  const login = useMutation({
    mutationFn: () => signIn(setSignInStage),
    retry: false,
    onSuccess: async (authenticated) => {
      await client.cancelQueries({ queryKey: ['account'] });
      client.removeQueries({ queryKey: ['private'] });
      client.removeQueries({ queryKey: ['direct-private'] });
      client.setQueryData(['account'], authenticated);
    },
  });
  const logout = useMutation({
    mutationFn: signOut,
    retry: false,
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: ['account'] });
      await client.cancelQueries({ queryKey: ['private'] });
      await client.cancelQueries({ queryKey: ['direct-private'] });
      client.removeQueries({ queryKey: ['private'] });
      client.removeQueries({ queryKey: ['direct-private'] });
      client.setQueryData(['account'], null);
    },
  });
  const feed = useInfiniteQuery({
    enabled: !marketId && !directRoute && !section,
    queryKey: ['markets', status, query, fromIso, toIso, sort, competition],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getMarkets(status, query, pageParam, fromIso, toIso, signal, sort, competition),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const markets = [
    ...new Map(
      feed.data?.pages.flatMap((page) => page.markets).map((market) => [market.id, market]),
    ).values(),
  ];
  const count = feed.data?.pages[0]?.total;
  const leagueFeed = useQuery({
    queryKey: ['fixture-competitions'],
    queryFn: ({ signal }) => getCompetitions(signal),
    enabled: !marketId && !directRoute && !section,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const competitions = [
    ...new Map(
      [...(leagueFeed.data ?? []), ...(feed.data?.pages[0]?.competitions ?? [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const pools = usePools(markets.map((m) => m.matchId));
  const accountAction = account.data ? (
    <button
      className="quiet"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      aria-busy={logout.isPending}
    >
      {logout.isPending && <CellLoader variant="orbit" />}
      {logout.isPending ? 'Signing out…' : 'Sign out'}
    </button>
  ) : (
    <button
      className="connect"
      onClick={() => login.mutate()}
      disabled={login.isPending || account.isPending}
      aria-busy={login.isPending || account.isPending}
    >
      {login.isPending || account.isPending ? (
        <CellLoader variant="orbit" />
      ) : (
        <Icon name="wallet" />
      )}
      {login.isPending ? signInStage : 'Sign in with wallet'}
    </button>
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="rail">
        <a
          href={sectionHref('overview')}
          className="wordmark"
          aria-label="Streak overview"
          onClick={(event) => followSection(event, 'overview')}
        >
          <Brand />
        </a>
        <AppNavigation active={activePage} />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a
            className="mobile-brand"
            href={sectionHref('overview')}
            aria-label="Streak overview"
            onClick={(event) => followSection(event, 'overview')}
          >
            <Brand />
          </a>
          <span className="breadcrumb">
            Your touchline <span>/</span>{' '}
            <strong>
              {directRoute === 'wallet'
                ? 'My Account'
                : directRoute === 'activity'
                  ? 'My activity'
                  : directRoute
                    ? 'Prediction'
                    : section === 'overview'
                      ? 'Overview'
                      : section === 'five'
                        ? 'Streak Five'
                        : section === 'survivor'
                          ? 'Streak Survivor'
                          : section === 'matchday'
                            ? 'Matchday'
                            : section === 'clubhouse'
                              ? 'Clubhouse'
                              : 'Markets'}
            </strong>
          </span>
          <div className="account-actions">
            <WalletSummary account={account.data ?? null} accountReady={!account.isPending} />
            {accountAction}
          </div>
        </header>
        <div className="network-strip">
          <span>
            <img src="/ckb-mark.png" width="11" height="11" alt="" /> CKB Pudge testnet
          </span>
          {/* <span>No real-money stakes</span> */}
        </div>
        <main id="main" tabIndex={-1}>
          {(login.isError || logout.isError || account.isError) && (
            <div className="notice error" role="alert">
              {logout.isError
                ? 'Sign-out failed. Your session may still be active. Please retry.'
                : (login.error?.message ?? 'Unable to check your session.')}
              {account.isError && (
                <button onClick={() => void account.refetch()}>Retry account</button>
              )}
            </div>
          )}
          {selectionNotice && (
            <p
              className={
                selectionNotice.startsWith('Prediction added') ? 'sr-only' : 'notice error'
              }
              role="status"
            >
              {selectionNotice}
            </p>
          )}
          {section && section !== 'survivor' && section !== 'five' && !directRoute && !marketId && (
            <SectionPage section={section} onPick={pick} picks={draftState.draft.picks} />
          )}
          {section === 'survivor' && !directRoute && !marketId && (
            <Suspense fallback={<BusyState label="Opening Survivor" />}>
              <SurvivorPage
                key={`survivor:${account.data?.id ?? 'public'}:${wallet.revision}`}
                account={account.data ?? null}
                accountReady={!account.isPending}
                onSignIn={() => login.mutate()}
                signInPending={login.isPending}
              />
            </Suspense>
          )}
          {section === 'five' && !directRoute && !marketId && (
            <Suspense fallback={<BusyState label="Opening Streak Five" />}>
              <FivePage
                key={`five:${account.data?.id ?? 'public'}`}
                account={account.data ?? null}
                accountReady={!account.isPending}
                onSignIn={() => login.mutate()}
                signInPending={login.isPending}
              />
            </Suspense>
          )}
          {directRoute === 'wallet' && (
            <WalletOverview
              account={account.data ?? null}
              accountReady={!account.isPending}
              onSignIn={() => login.mutate()}
              signInPending={login.isPending}
              onActivity={navigateActivity}
              onRecovery={navigateActivity}
            />
          )}
          {directEntry &&
            (entryMode.data === undefined || (entryMode.isError && !currentEntry)) && (
              <Notice
                title={entryMode.isError ? 'Unable to open payment' : 'Opening your match'}
                tone={entryMode.isError ? 'attention' : 'info'}
                actions={
                  entryMode.isError ? (
                    <button
                      aria-busy={entryMode.isFetching}
                      onClick={() => void entryMode.refetch()}
                    >
                      {entryMode.isFetching && <CellLoader variant="orbit" />}
                      Try again
                    </button>
                  ) : undefined
                }
              >
                {!entryMode.isError && <CellLoader variant="wave" />}
                {entryMode.isError
                  ? 'Your picks are saved. Retry to check the available checkout.'
                  : 'Checking the current payment flow.'}
              </Notice>
            )}
          {directRoute &&
            (directRoute === 'activity' ||
              (directEntry && entryMode.data === false && !entryMode.isError)) && (
              <Suspense
                fallback={
                  <BusyState
                    label={
                      directRoute === 'activity' ? 'Opening your activity' : 'Opening prediction'
                    }
                    detail="Your saved predictions stay with you."
                  />
                }
              >
                <DirectPage
                  key={`${directRoute}:${account.data?.id ?? 'guest'}:${directRoute === 'activity' ? (account.data?.walletAddress ?? 'session') : wallet.revision}`}
                  marketId={directRoute === 'activity' ? undefined : directRoute}
                  activityOnly={directRoute === 'activity'}
                  draftStore={draftStore}
                  account={account.data ?? null}
                  accountReady={!account.isPending}
                  onAuthenticate={() => login.mutate()}
                  authenticating={login.isPending}
                  draftPick={draftState.draft.picks.find((row) => row.marketId === directRoute)}
                />
              </Suspense>
            )}
          {((marketId && !directRoute) || currentEntry) && (
            <MarketDetail
              key={currentEntry ? directRoute : marketId}
              id={(currentEntry ? directRoute : marketId)!}
              onBack={() => navigateMarket(null)}
              onPick={pick}
              selected={
                draftState.draft.picks.find(
                  (row) => row.marketId === (currentEntry ? directRoute : marketId),
                )?.outcome
              }
            />
          )}
          <div hidden={!!marketId || !!directRoute || !!section}>
            <div className="page-title">
              <div>
                <p className="eyebrow">THE PREDICTION MARKETS</p>
                <h1>You know the game.</h1>
                <p>Choose a fixture. Make your call. Follow it to the final whistle.</p>
              </div>
              <span className="pilot-badge">Early access</span>
            </div>
            {!marketId && !directRoute && !section && (
              <DayNavigation
                value={date}
                today={today}
                live={status === 'live'}
                onChange={selectDate}
                onLive={() => {
                  selectDate('today');
                  setStatus(status === 'live' ? 'all' : 'live');
                }}
              />
            )}
            <div className="market-tools">
              <div className="filters" role="group" aria-label="Market status">
                {[
                  ['all', 'All fixtures'],
                  ['open', 'Open'],
                  ['closed', 'Locked'],
                  ['resolved', 'Results'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="search">
                <Icon name="search" />
                <input
                  aria-label="Search teams or competitions"
                  placeholder="Find your next match"
                  maxLength={80}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            <div className="feed-meta" aria-live="polite">
              <label className="fixture-sort fixture-league">
                League
                {!competitions.length && leagueFeed.isPending && <CellLoader variant="orbit" />}
                <select
                  aria-label="Filter by league"
                  value={competition}
                  onChange={(event) => setCompetition(event.target.value)}
                >
                  <option value="">
                    {!competitions.length && leagueFeed.isPending
                      ? 'Loading leagues…'
                      : !competitions.length && leagueFeed.isError
                        ? 'Leagues unavailable'
                        : 'All leagues'}
                  </option>
                  {competition && !competitions.some((item) => item.id === competition) && (
                    <option value={competition}>Selected league</option>
                  )}
                  {competitions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {leagueFeed.isError && competitions.length === 0 && (
                  <button
                    className="quiet"
                    aria-busy={leagueFeed.isFetching}
                    onClick={() => void leagueFeed.refetch()}
                  >
                    {leagueFeed.isFetching && <CellLoader variant="orbit" />}
                    Retry leagues
                  </button>
                )}
              </label>
              <label className="fixture-sort">
                Sort by
                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value === 'kickoff' ? 'kickoff' : 'featured')
                  }
                >
                  <option value="featured">Big games first</option>
                  <option value="kickoff">Kickoff time</option>
                </select>
              </label>
              <span>
                {count === undefined
                  ? 'Finding fixtures'
                  : `${count} ${count === 1 ? 'fixture' : 'fixtures'}`}
              </span>
              <span>
                {feed.isFetching && <CellLoader variant="orbit" />}
                {feed.isFetching
                  ? 'Updating…'
                  : feed.dataUpdatedAt
                    ? `Updated ${new Date(feed.dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
              </span>
            </div>
            {feed.data && !feed.data.pages[0].covered && (
              <div className="notice" role="status">
                The full schedule for these dates is not confirmed. Showing the available fixtures
                from connected competitions.
              </div>
            )}
            {feed.isError && (
              <div className="notice error" role="alert">
                <div>
                  <strong>
                    {markets.length
                      ? 'Showing the last loaded markets'
                      : 'We could not load the markets'}
                  </strong>
                  <p>
                    {markets.length
                      ? 'Prices may have changed. Refresh before making a prediction.'
                      : feed.error.message}
                  </p>
                </div>
                <button
                  onClick={() => void feed.refetch()}
                  disabled={feed.isFetching}
                  aria-busy={feed.isFetching}
                >
                  {feed.isFetching && <CellLoader variant="orbit" />}
                  Retry markets
                </button>
              </div>
            )}
            {feed.isPending && (
              <div className="market-grid" aria-label="Loading markets" aria-busy="true">
                {[0, 1, 2].map((id) => (
                  <div key={id} className="glass skeleton">
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            )}
            {!feed.isPending && !feed.isError && markets.length === 0 && (
              <div className="glass empty">
                <Icon name="markets" />
                <h2>
                  {query
                    ? 'No matching fixtures'
                    : feed.data?.pages[0].covered
                      ? 'No fixtures in this view'
                      : 'Schedule not fully available'}
                </h2>
                <p>
                  {query
                    ? 'Try another team or competition.'
                    : 'Check another tab, or come back when the next fixtures open.'}
                </p>
                <button
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                    setCompetition('');
                  }}
                >
                  Browse all fixtures
                </button>
              </div>
            )}
            {markets.length > 0 && (
              <div className="market-grid">
                {markets.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={{ ...market, directPool: pools.get(market.matchId) }}
                    onPick={pick}
                    selected={
                      draftState.draft.picks.find((row) => row.matchId === market.matchId)?.outcome
                    }
                  />
                ))}
              </div>
            )}
            {feed.hasNextPage && (
              <div className="load-more">
                <button
                  disabled={feed.isFetching}
                  aria-busy={feed.isFetchingNextPage}
                  onClick={() => void feed.fetchNextPage()}
                >
                  {feed.isFetchingNextPage && <CellLoader variant="orbit" />}
                  {feed.isFetchingNextPage ? 'Loading…' : 'Show more fixtures'}
                </button>
              </div>
            )}
            <footer>
              Fixtures in your local time, from connected competitions. Testnet CKB has no monetary
              value.
            </footer>
          </div>
        </main>
      </div>
      <AppNavigation active={activePage} mobile />
      <PredictionSlip
        store={draftStore}
        open={slipOpen}
        onOpen={() => setSlipOpen(true)}
        onDismiss={() => setSlipOpen(false)}
        onAddMatches={() => navigateMarket(null)}
        account={account.data ?? null}
        accountReady={!account.isPending}
        onSignIn={() => login.mutate()}
        signInPending={login.isPending}
        signInStage={signInStage}
        signInError={login.error?.message}
        accountKey={
          account.isPending
            ? 'pending'
            : account.isError
              ? 'unavailable'
              : (account.data?.id ?? 'guest')
        }
      />
    </>
  );
}
