import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMarkets, formatCkb, outcomes } from '../features/markets/api';
import type { Market, MarketSort } from '../features/markets/api';
import { getAccount, signIn, signOut } from '../features/account/api';
import { Icon } from '../components/icon';
import { weekend } from '../features/markets/weekend';
import { TeamBadge } from '../components/team-badge';
import { MarketDetail } from '../features/markets/detail';
import { createDraftStore } from '../features/predictions/draft';
import type { Outcome } from '../features/predictions/draft';
import { PredictionSlip } from '../features/predictions/slip';
import { followMarket, marketHref, navigateMarket, useMarketRoute } from '../lib/market-route';
import { directHref, followDirect, navigateDirect, useDirectRoute } from '../lib/direct-route';
import '../design-system/predictions.css';

const DirectPage = lazy(() => import('../features/direct/ui'));

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
        <span className={`status ${market.status}`}>
          {!market.available
            ? market.fixtureStatus
            : market.status === 'closed'
              ? 'Locked'
              : market.status === 'void'
                ? 'Voided'
                : market.status}
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
        aria-label={market.available ? 'View market' : undefined}
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
        <span className="versus">vs</span>
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
                aria-label={`Add ${labels[side]} for ${market.home} vs ${market.away}`}
                aria-pressed={selected === side}
                disabled={market.status !== 'open' || market.fixtureStatus !== 'scheduled'}
                onClick={() => onPick(market, side)}
              >
                <span>{labels[side]}</span>
                <strong>{Math.round(market.prices[side] * 100)}%</strong>
                {selected === side && (
                  <i className="pick-check" aria-hidden="true">
                    ✓
                  </i>
                )}
              </button>
            ))}
          </div>
          <div className="pool-bar" aria-hidden="true">
            {outcomes.map((side) => (
              <span key={side} className={side} style={{ flex: market.prices[side] }} />
            ))}
          </div>
          <div className="card-meta">
            <span>{formatCkb(market.totalPoolCkb)} tCKB pooled</span>
            <span>{market.totalBets} predictions</span>
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
  const marketId = useMarketRoute();
  const directRoute = useDirectRoute();
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
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<number | null>(null);
  const dates = weekend(week);
  const from = day === null ? dates.start : dates.days[day];
  const to =
    day === null ? dates.end : new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
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
  const login = useMutation({
    mutationFn: signIn,
    retry: false,
    onSuccess: async () => {
      client.removeQueries({ queryKey: ['private'] });
      client.removeQueries({ queryKey: ['direct-private'] });
      await client.invalidateQueries({ queryKey: ['account'] });
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
    enabled: !marketId && !directRoute,
    queryKey: ['markets', status, query, fromIso, toIso, sort],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getMarkets(status, query, pageParam, fromIso, toIso, signal, sort),
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
  const accountAction = account.data ? (
    <button className="quiet" onClick={() => logout.mutate()} disabled={logout.isPending}>
      {logout.isPending ? 'Signing out…' : 'Sign out'}
    </button>
  ) : (
    <button
      className="connect"
      onClick={() => login.mutate()}
      disabled={login.isPending || account.isPending}
    >
      <Icon name="wallet" />
      {login.isPending ? 'Connecting…' : 'Sign in with wallet'}
    </button>
  );
  return (
    <>
      <a className="skip" href="#main">
        Skip to markets
      </a>
      <aside className="rail">
        <a href="/season/" className="wordmark">
          <img src="/mark.svg" alt="" width="34" height="34" />
          streak<span className="dot">.</span>
        </a>
        <p className="eyebrow">YOUR TOUCHLINE</p>
        <nav aria-label="Main navigation">
          <a href="/season/" aria-current={!directRoute ? 'page' : undefined}>
            <Icon name="markets" />
            Markets
          </a>
          <a href={directHref()} onClick={(event) => followDirect(event)}>
            <Icon name="activity" />
            My activity
          </a>
          <a
            href={directHref()}
            onClick={(event) => followDirect(event)}
            aria-current={directRoute === 'wallet' ? 'page' : undefined}
          >
            <Icon name="wallet" />
            Wallet
          </a>
        </nav>
        <div className="rail-note">
          <Icon name="shield" />
          <strong>Your next chapter.</strong>
          <p>A new matchday experience, built around your game.</p>
          <span>CKB testnet</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Your touchline <span>/</span>{' '}
            <strong>{directRoute ? 'Testnet wallet' : 'Markets'}</strong>
          </span>
          <div className="account-actions">
            {account.data && <span className="username">{account.data.username}</span>}
            {accountAction}
          </div>
        </header>
        <div className="network-strip">
          <span>
            <i /> CKB Pudge testnet
          </span>
          <span>No real-money stakes</span>
        </div>
        <main id="main" tabIndex={-1}>
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
          {directRoute && (
            <Suspense
              fallback={
                <section className="glass detail-state">
                  <h1>Opening your testnet wallet...</h1>
                  <p>Your saved predictions are safe.</p>
                </section>
              }
            >
              <DirectPage
                key={`${directRoute}:${account.data?.id ?? 'guest'}`}
                marketId={directRoute === 'wallet' ? undefined : directRoute}
                account={account.data ?? null}
                accountReady={!account.isPending}
                draftPick={draftState.draft.picks.find((row) => row.marketId === directRoute)}
              />
            </Suspense>
          )}
          {marketId && !directRoute && (
            <MarketDetail
              key={marketId}
              id={marketId}
              onBack={() => navigateMarket(null)}
              onPick={pick}
              selected={draftState.draft.picks.find((row) => row.marketId === marketId)?.outcome}
            />
          )}
          <div hidden={!!marketId || !!directRoute}>
            <div className="page-title">
              <div>
                <p className="eyebrow">THE PREDICTION MARKETS</p>
                <h1>You know the game.</h1>
                <p>Choose a fixture. Make your call. Follow it to the final whistle.</p>
              </div>
              <span className="pilot-badge">Early access</span>
            </div>
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
            <section className="weekend-picker" aria-label="Matchweek">
              <div className="week-navigation">
                <button
                  disabled={week <= -1}
                  aria-label="Previous weekend"
                  onClick={() => {
                    setWeek(week - 1);
                    setDay(null);
                  }}
                >
                  ‹
                </button>
                <div>
                  <strong>
                    {week === 0 ? 'This matchweek' : week === 1 ? 'Next matchweek' : 'Matchweek'}
                  </strong>
                  <span>
                    {dates.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} –{' '}
                    {dates.days[3].toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <button
                  disabled={week >= 2}
                  aria-label="Next weekend"
                  onClick={() => {
                    setWeek(week + 1);
                    setDay(null);
                  }}
                >
                  ›
                </button>
              </div>
              <div className="day-filters" role="group" aria-label="Matchweek day">
                <button aria-pressed={day === null} onClick={() => setDay(null)}>
                  All days
                </button>
                {dates.days.map((date, index) => (
                  <button key={index} aria-pressed={day === index} onClick={() => setDay(index)}>
                    {date.toLocaleDateString('en-GB', { weekday: 'short' })}{' '}
                    <span>{date.getDate()}</span>
                  </button>
                ))}
              </div>
            </section>
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
                <button onClick={() => void feed.refetch()} disabled={feed.isFetching}>
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
                    market={market}
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
                <button disabled={feed.isFetching} onClick={() => void feed.fetchNextPage()}>
                  {feed.isFetchingNextPage ? 'Loading…' : 'Show more fixtures'}
                </button>
              </div>
            )}
            <section className="glass trust-note">
              <Icon name="shield" />
              <div>
                <h2>A clearer view of every prediction.</h2>
                <p>
                  These markets use the existing Streak treasury-backed ledger. Pool percentages are
                  not fixed odds. Your balance and withdrawals remain in Wallet.
                </p>
              </div>
              <a href="/index.html#wallet">
                Open Wallet <Icon name="arrow" />
              </a>
            </section>
            <footer>
              Friday through Monday, in your local time. Fixtures from connected competitions.
              Testnet CKB has no monetary value. The new prediction slip saves drafts and checks
              current rules. Funded testnet markets offer a separate single-prediction transaction.
            </footer>
          </div>
        </main>
      </div>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <a href="/season/" aria-current={!directRoute ? 'page' : undefined}>
          <Icon name="markets" />
          Markets
        </a>
        <a href={directHref()} onClick={(event) => followDirect(event)}>
          <Icon name="activity" />
          Activity
        </a>
        <a
          href={directHref()}
          onClick={(event) => followDirect(event)}
          aria-current={directRoute === 'wallet' ? 'page' : undefined}
        >
          <Icon name="wallet" />
          Wallet
        </a>
      </nav>
      <PredictionSlip
        store={draftStore}
        open={slipOpen}
        onOpen={() => setSlipOpen(true)}
        onDismiss={() => setSlipOpen(false)}
        onDirect={(id) => {
          setSlipOpen(false);
          navigateDirect(id);
        }}
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
