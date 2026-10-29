import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicMarket } from '../predictions/api';
import { displayShannons } from '../predictions/draft';
import type { Outcome } from '../predictions/draft';
import { outcomes } from './api';
import type { Market } from './api';
import { TeamBadge } from '../../components/team-badge';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import { Notice } from '../../components/notice';
import { useNow } from '../../lib/use-now';
import { getEntryAvailability } from '../direct/availability-api';
import { PoolChart } from './pool-chart';
import { currentPool, getPublicPools, poolLabel } from './pools';
import './match-room.css';
import { MatchIntelligence, PoolComposition } from './intelligence';
import { fixtureLabel, settlementLabel } from './status';

export function MarketDetail({
  id,
  onBack,
  onPick,
  selected,
}: {
  id: string;
  onBack: () => void;
  onPick: (market: Market, outcome: Outcome) => void;
  selected?: Outcome;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useQuery({
    queryKey: ['public-market', id],
    queryFn: ({ signal }) => getPublicMarket(id, signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const payment = useQuery({
    queryKey: ['match-payment', detail.data?.market.matchId],
    queryFn: ({ signal }) => getEntryAvailability(detail.data!.market.matchId, signal),
    enabled: !!detail.data,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const now = useNow(true);
  const pool = useQuery({
    queryKey: ['direct-pool', detail.data?.market.matchId],
    queryFn: async ({ signal }) => (await getPublicPools([detail.data!.market.matchId], signal))[0],
    enabled: !!detail.data,
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.state === 'loading' ? 3_000 : 20_000),
    refetchIntervalInBackground: false,
    retry: false,
  });
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [detail.data?.market.id]);
  const data = detail.data;
  if (!data)
    return (
      <section className="glass detail-state">
        <button className="quiet" onClick={onBack}>
          Back to markets
        </button>
        <h1 aria-busy={detail.isPending}>
          {detail.isPending && <CellLoader variant="wave" />}
          {detail.isPending ? 'Loading your match...' : 'This market could not be loaded'}
        </h1>
        {detail.isError && (
          <Notice
            title="Try loading the match again"
            tone="attention"
            actions={
              <button aria-busy={detail.isFetching} onClick={() => void detail.refetch()}>
                {detail.isFetching && <CellLoader variant="orbit" />}
                Retry market
              </button>
            }
          >
            {detail.error.message}
          </Notice>
        )}
      </section>
    );
  const { market, terms } = data;
  const accepting =
    data.accepting &&
    now < Date.parse(terms.closesAt) &&
    now < Date.parse(terms.kickoff) &&
    !detail.isError;
  const state = accepting ? 'Open for predictions' : fixtureLabel(market, now);
  const dateLabel = new Date(market.kickoff).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const names = { home: 'Home', draw: 'Draw', away: 'Away' };
  return (
    <section className="market-detail match-room" aria-label="Market detail">
      <div className="match-breadcrumb">
        <button className="quiet" onClick={onBack}>
          ← Back to markets
        </button>
        <span>{market.competition}</span>
        <span>Match market</span>
      </div>
      <header className="glass match-scoreboard">
        <div className="detail-match-meta">
          <span className={`detail-status ${accepting ? 'is-open' : ''}`}>
            <i aria-hidden="true" />
            {state}
          </span>
          <time dateTime={market.kickoff}>{dateLabel} · Local time</time>
        </div>
        <div className="match-identity">
          <TeamBadge logo={market.homeLogo} code={market.homeCode} side="home" />
          <div>
            <p className="eyebrow">{market.competition} · FULL TIME RESULT</p>
            <h1 ref={heading} tabIndex={-1}>
              {market.home} <span>vs</span> {market.away}
            </h1>
            <p>
              {market.score
                ? `${market.home} ${market.score.home} : ${market.score.away} ${market.away}`
                : '90 minutes. Three outcomes. Your call.'}
            </p>
          </div>
          <TeamBadge logo={market.awayLogo} code={market.awayCode} side="away" />
        </div>
        <div className="match-facts">
          <span>
            <Icon name="shield" /> CKB testnet
          </span>
          <span>{settlementLabel(pool.isError ? undefined : pool.data, now)}</span>
          <span>Regulation time only</span>
        </div>
      </header>
      {detail.isError && (
        <Notice
          title="Match refresh paused"
          tone="attention"
          actions={<button onClick={() => void detail.refetch()}>Retry market</button>}
        >
          Refresh this match before adding another prediction. Your existing slip is saved.
        </Notice>
      )}
      <div className="match-room-grid">
        <div className="match-analysis">
          <PoolChart
            key={market.id}
            market={market}
            pool={pool.isError ? undefined : currentPool(pool.data, now)}
            loading={pool.isPending}
          />
          <MatchIntelligence
            market={market}
            pool={pool.isError ? undefined : currentPool(pool.data, now)}
          />
          <section className="glass match-explainer">
            <h2>From your call to the final whistle</h2>
            <div>
              <p>
                <span>01</span>
                <strong>Choose your side</strong>Home, draw or away. Add other matches to the same
                slip.
              </p>
              <p>
                <span>02</span>
                <strong>Review one payment</strong>Check the stake, refundable storage and network
                fee before signing.
              </p>
              <p>
                <span>03</span>
                <strong>Collect your return</strong>Each prediction settles on its own. Follow it in
                My activity.
              </p>
            </div>
          </section>
        </div>
        <div className="match-side-column">
          <aside className="glass match-order" aria-label="Choose your prediction">
            <p className="eyebrow">MAKE YOUR CALL</p>
            <h2>Who takes it?</h2>
            <p>Choose an outcome to open your slip.</p>
            <div className="detail-outcomes">
              {outcomes.map((side) => (
                <button
                  key={side}
                  className="outcome-glass"
                  data-outcome={side}
                  aria-pressed={selected === side}
                  disabled={!accepting}
                  onClick={() => onPick(market, side)}
                >
                  <span>{names[side]}</span>
                  <strong>
                    {poolLabel(
                      pool.isError ? undefined : pool.data,
                      side,
                      side === 'home' ? '1' : side === 'draw' ? 'X' : '2',
                    )}
                  </strong>
                  {selected === side && (
                    <i className="outcome-selected" aria-hidden="true">
                      ✓
                    </i>
                  )}
                </button>
              ))}
            </div>
            <div className="match-outcome-key">
              <span>1 · {market.home}</span>
              <span>X · Draw</span>
              <span>2 · {market.away}</span>
            </div>
            {pool.data?.state === 'ready' && (
              <p className="pool-share-caption">
                Pool share: each side's stake divided by the total pool. Returns change as
                predictions arrive.
              </p>
            )}
            {!accepting ? (
              <Notice title="Predictions are closed">
                You can still view this market and follow existing predictions in My activity.
              </Notice>
            ) : payment.isError ? (
              <Notice
                title="Payment check needs a retry"
                tone="attention"
                actions={
                  <button aria-busy={payment.isFetching} onClick={() => void payment.refetch()}>
                    {payment.isFetching && <CellLoader variant="orbit" />}
                    Check again
                  </button>
                }
              >
                Your slip is safe. We could not check availability for this match.
              </Notice>
            ) : payment.isPending ? (
              <p className="match-availability" role="status">
                <CellLoader variant="wave" />
                Checking payment availability...
              </p>
            ) : payment.data?.available ? (
              <Notice
                title={
                  payment.data.state === 'available'
                    ? 'Market setup is on us'
                    : 'Ready for your prediction'
                }
              >
                {payment.data.state === 'available'
                  ? 'Your first bet opens the market in the same payment. Streak covers setup.'
                  : 'Add your pick and review the payment in your slip.'}
              </Notice>
            ) : (
              <Notice
                title={
                  payment.data?.state === 'confirming' || payment.data?.state === 'reserved'
                    ? 'A payment is being confirmed'
                    : 'Payment is temporarily unavailable'
                }
                tone="attention"
                actions={
                  <button aria-busy={payment.isFetching} onClick={() => void payment.refetch()}>
                    {payment.isFetching && <CellLoader variant="orbit" />}
                    Check again
                  </button>
                }
              >
                You can save your pick while availability refreshes.
              </Notice>
            )}
            <dl className="match-payment-facts">
              <div>
                <dt>Minimum stake</dt>
                <dd>
                  {payment.data?.minimum
                    ? `${displayShannons(payment.data.minimum)} tCKB`
                    : 'Shown at review'}
                </dd>
              </div>
              <div>
                <dt>Recoverable storage</dt>
                <dd>
                  {payment.data?.storage
                    ? `${displayShannons(payment.data.storage)} tCKB / pick`
                    : 'Shown at review'}
                </dd>
              </div>
              <div>
                <dt>Network fee</dt>
                <dd>Exact amount at review</dd>
              </div>
              <div>
                <dt>Predictions close</dt>
                <dd>
                  {new Date(
                    Math.min(Date.parse(terms.closesAt), Date.parse(terms.kickoff)),
                  ).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
            </dl>
            <details className="detail-settlement">
              <summary>
                How settlement works <span aria-hidden="true">+</span>
              </summary>
              <p>
                The configured football reporter supplies the full-time result. Winning positions
                share the losing pool after the contract's fees. Your payment review shows the exact
                terms before you sign.
              </p>
              <p>
                If no valid result is submitted within six hours after scheduled kickoff, the market
                can be cancelled. Once cancellation is confirmed, you can claim your stake and
                storage back without pool fees.
              </p>
              <p>Testnet CKB has no monetary value.</p>
            </details>
            <a className="market-link" href={`/index.html#market/${encodeURIComponent(market.id)}`}>
              View legacy ledger activity <Icon name="arrow" />
            </a>
          </aside>
          <PoolComposition
            market={market}
            pool={pool.isError ? undefined : currentPool(pool.data, now)}
          />
        </div>
      </div>
    </section>
  );
}
