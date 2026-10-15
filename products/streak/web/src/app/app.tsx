import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMarkets, formatCkb, outcomes } from '../features/markets/api';
import type { Market } from '../features/markets/api';
import { getAccount, signIn, signOut } from '../features/account/api';
import { Icon } from '../components/icon';
import { weekend } from '../features/markets/weekend';

function TeamBadge({
  logo,
  code,
  side,
}: {
  logo: string | null;
  code: string;
  side: 'home' | 'away';
}) {
  const [failed, setFailed] = useState(false);
  return logo && !failed ? (
    <img
      className="team-logo"
      src={logo}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={`crest ${side}`}>{code.slice(0, 4)}</span>
  );
}
function MarketCard({ market }: { market: Market }) {
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
      <div className="teams">
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
      </div>
      {market.available ? (
        <>
          <div className="percentages" aria-label="Current pool percentages">
            {outcomes.map((side) => (
              <div key={side}>
                <span>{labels[side]}</span>
                <strong>{Math.round(market.prices[side] * 100)}%</strong>
              </div>
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
          <a className="market-link" href={`/#market/${encodeURIComponent(market.id)}`}>
            View market <Icon name="arrow" />
          </a>
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
  const [status, setStatus] = useState('all');
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
      await client.invalidateQueries({ queryKey: ['account'] });
    },
  });
  const logout = useMutation({
    mutationFn: signOut,
    retry: false,
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: ['account'] });
      await client.cancelQueries({ queryKey: ['private'] });
      client.removeQueries({ queryKey: ['private'] });
      client.setQueryData(['account'], null);
    },
  });
  const feed = useInfiniteQuery({
    queryKey: ['markets', status, query, fromIso, toIso],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getMarkets(status, query, pageParam, fromIso, toIso, signal),
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
          <span>S</span>streak<span className="dot">.</span>
        </a>
        <p className="eyebrow">YOUR TOUCHLINE</p>
        <nav aria-label="Main navigation">
          <a href="/season/" aria-current="page">
            <Icon name="markets" />
            Markets
          </a>
          <a href="/#portfolio">
            <Icon name="activity" />
            My activity
          </a>
          <a href="/#wallet">
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
            Your touchline <span>/</span> <strong>Markets</strong>
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
          <div className="page-title">
            <div>
              <p className="eyebrow">THE PREDICTION MARKETS</p>
              <h1>You know the game.</h1>
              <p>Find your fixture. Read the room. Make your call.</p>
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
                <MarketCard key={market.id} market={market} />
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
            <a href="/#wallet">
              Open Wallet <Icon name="arrow" />
            </a>
          </section>
          <footer>
            Friday through Monday, in your local time. Fixtures from connected competitions. Testnet
            CKB has no monetary value. Market details open in the current app while the new
            prediction flow is being built.
          </footer>
        </main>
      </div>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <a href="/season/" aria-current="page">
          <Icon name="markets" />
          Markets
        </a>
        <a href="/#portfolio">
          <Icon name="activity" />
          Activity
        </a>
        <a href="/#wallet">
          <Icon name="wallet" />
          Wallet
        </a>
      </nav>
    </>
  );
}
