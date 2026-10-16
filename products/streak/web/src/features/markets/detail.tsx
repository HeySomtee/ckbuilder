import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicMarket } from '../predictions/api';
import { displayShannons } from '../predictions/draft';
import type { Outcome } from '../predictions/draft';
import { outcomes, formatCkb } from './api';
import type { Market } from './api';
import { TeamBadge } from '../../components/team-badge';
import { useNow } from '../../lib/use-now';
import { directHref, followDirect } from '../../lib/direct-route';
import { useDirectCatalogue, useDemandAvailability } from '../direct/availability';
import { acceptsPayment } from '../direct/availability-api';

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
  const now = useNow(true);
  const catalogue = useDirectCatalogue();
  const demand = useDemandAvailability(detail.data ? [detail.data.market.matchId] : []);
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
        <h1>{detail.isPending ? 'Loading your match...' : 'This market could not be loaded'}</h1>
        {detail.isError && (
          <>
            <p role="alert">{detail.error.message}</p>
            <button onClick={() => void detail.refetch()}>Retry market</button>
          </>
        )}
      </section>
    );
  const { market, terms } = data;
  const contract =
    (!catalogue.isError
      ? catalogue.data?.find((row) => row.fixtureId === market.matchId && row.entryEnabled)
      : undefined) ?? demand.data?.find((row) => row.fixtureId === market.matchId);
  const payable = !!contract && acceptsPayment(contract, now);
  const accepting =
    data.accepting &&
    now < Date.parse(terms.closesAt) &&
    now < Date.parse(terms.kickoff) &&
    !detail.isError;
  const labels = { home: market.home, draw: 'Draw', away: market.away };
  const marketState = accepting
    ? 'Open for predictions'
    : market.status === 'resolved'
      ? 'Resolved'
      : market.status === 'void'
        ? 'Void'
        : market.fixtureStatus === 'scheduled'
          ? 'Locked'
          : market.fixtureStatus;
  const closesAt = new Date(Math.min(Date.parse(terms.closesAt), Date.parse(terms.kickoff)));
  return (
    <section className="market-detail" aria-label="Market detail">
      <div className="detail-page-head">
        <div>
          <p className="eyebrow">{market.competition}</p>
          <h1 ref={heading} tabIndex={-1}>
            {market.home} vs {market.away}
          </h1>
          <p>The match, the crowd and your call.</p>
          {payable && (
            <a className="quiet" href={directHref(id)} onClick={(event) => followDirect(event, id)}>
              Open wallet payment ↗
            </a>
          )}
        </div>
        <button className="quiet detail-back" onClick={onBack}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M19 12H5m6-6-6 6 6 6" />
          </svg>
          Back to markets
        </button>
      </div>
      {detail.isError && (
        <div className="notice error" role="alert">
          The refresh failed. Review is unavailable until this market refreshes.{' '}
          <button onClick={() => void detail.refetch()}>Retry market</button>
        </div>
      )}
      <div className="detail-layout">
        <div className="detail-context">
          <div className="glass detail-match">
            <div className="detail-match-meta">
              <span className={`detail-status ${accepting ? 'is-open' : ''}`}>
                <i aria-hidden="true" />
                {marketState}
              </span>
              <time dateTime={market.kickoff}>
                {new Date(market.kickoff).toLocaleString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <div className="detail-crests">
              <div className="detail-team">
                <TeamBadge
                  key={market.homeLogo}
                  logo={market.homeLogo}
                  code={market.homeCode}
                  side="home"
                />
                <strong>{market.home}</strong>
              </div>
              <div className="detail-versus">
                <small>{market.fixtureStatus === 'scheduled' ? 'PRE-MATCH' : 'MATCH'}</small>
                <span>vs</span>
              </div>
              <div className="detail-team">
                <TeamBadge
                  key={market.awayLogo}
                  logo={market.awayLogo}
                  code={market.awayCode}
                  side="away"
                />
                <strong>{market.away}</strong>
              </div>
            </div>
            <div className="detail-stats">
              <div>
                <span>Legacy pool</span>
                <strong>{formatCkb(market.totalPoolCkb)} tCKB</strong>
              </div>
              <div>
                <span>Predictions</span>
                <strong>{market.totalBets}</strong>
              </div>
            </div>
            <p className="detail-local-time">Kickoff shown in your local time.</p>
          </div>
          <section className="glass detail-pool">
            <p className="eyebrow">THE CROWD'S CALL</p>
            <h2>How the pool is leaning.</h2>
            <p>These percentages describe the legacy ledger pool, not the direct contract pool.</p>
            <div className="detail-pool-rows">
              {outcomes.map((outcome) => (
                <div className={`detail-pool-row ${outcome}`} key={outcome}>
                  <div>
                    <span>{labels[outcome]}</span>
                    <strong>{Math.round(market.prices[outcome] * 100)}%</strong>
                  </div>
                  <div className="detail-pool-track" aria-hidden="true">
                    <span style={{ width: `${market.prices[outcome] * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <small>Pool percentages are not fixed odds or guaranteed returns.</small>
          </section>
        </div>
        <aside className="glass detail-rules">
          <p className="eyebrow">WHAT'S YOUR CALL?</p>
          <h2>Pick your side.</h2>
          <p>Choose one outcome. Build your slip with independent predictions.</p>
          <p className="notice" role="status">
            {catalogue.isError
              ? 'Payment availability could not be checked. Your draft remains saved.'
              : catalogue.isPending
                ? 'Checking payment availability...'
                : payable
                  ? contract?.funding === 'sponsored'
                    ? 'Your first prediction opens this market in the same transaction. Streak covers the 3,050 tCKB setup reserve. You pay your stake, 321 tCKB recoverable storage and the network fee.'
                    : 'Funded contract. Choose a side, then continue to payment in your slip. Wallet review checks remaining space and time. Minimum 100 tCKB plus 321 tCKB recoverable storage and a network fee.'
                  : 'This fixture is available for saved picks only. It has no open funded contract for payment.'}
          </p>
          <div className="detail-outcomes">
            {outcomes.map((outcome) => (
              <button
                key={outcome}
                aria-pressed={selected === outcome}
                disabled={!accepting}
                onClick={() => onPick(market, outcome)}
              >
                <span>{outcome === 'home' ? 'Home' : outcome === 'draw' ? 'Draw' : 'Away'}</span>
                <strong>{Math.round(market.prices[outcome] * 100)}%</strong>
                {selected === outcome && (
                  <svg
                    className="detail-selected"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="m4 8 3 3 5-6" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          {!accepting && (
            <p className="notice">
              This market is not accepting new predictions. You can still inspect its pool and
              rules.
            </p>
          )}
          <dl className="detail-terms">
            <div>
              <dt>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Predictions close
              </dt>
              <dd>
                <time dateTime={closesAt.toISOString()}>
                  {closesAt.toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>{' '}
                · Local time
              </dd>
            </div>
            <div>
              <dt>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M4 6h14a2 2 0 0 1 2 2v11H4V6Zm0 0 12-3v3M16 11h4v4h-4z" />
                </svg>
                Legacy stake limits
              </dt>
              <dd>
                {displayShannons(terms.minimumShannons)} to {displayShannons(terms.maximumShannons)}{' '}
                tCKB per prediction.
              </dd>
            </div>
            <div>
              <dt>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6l8-3Z" />
                  <path d="m8 11 3 3 5-5" />
                </svg>
                Legacy pool fees
              </dt>
              <dd>
                {terms.protocolFeeBps / 100}% protocol + {terms.creatorFeeBps / 100}% creator,
                deducted from the losing pool.
              </dd>
            </div>
          </dl>
          <details className="detail-settlement">
            <summary>
              Settlement and fee rules <span aria-hidden="true">+</span>
            </summary>
            <p>
              Winning positions share the losing pool after fees. These fees are not added to your
              draft total. Void markets refund stakes under the existing ledger rules.
            </p>
            <p>
              These markets currently use Streak's custodial treasury and account ledger. The
              configured football reporter supplies results. Funded testnet contracts have separate
              pools and rules, shown in full during wallet payment.
            </p>
          </details>
          <p className="detail-draft-note">
            Saving a pick does not place a bet. On funded matches, continue from the slip to review
            and sign a wallet payment. Follow confirmation in Activity.
          </p>
          <a className="market-link" href={`/index.html#market/${encodeURIComponent(market.id)}`}>
            Open legacy market activity <span aria-hidden="true">↗</span>
          </a>
        </aside>
      </div>
    </section>
  );
}
