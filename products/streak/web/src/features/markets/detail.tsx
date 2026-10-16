import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicMarket } from '../predictions/api';
import { displayShannons } from '../predictions/draft';
import type { Outcome } from '../predictions/draft';
import { outcomes, formatCkb } from './api';
import type { Market } from './api';
import { TeamBadge } from '../../components/team-badge';
import { useNow } from '../../lib/use-now';

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
  const accepting =
    data.accepting &&
    now < Date.parse(terms.closesAt) &&
    now < Date.parse(terms.kickoff) &&
    !detail.isError;
  const labels = { home: market.home, draw: 'Draw', away: market.away };
  return (
    <section className="market-detail" aria-label="Market detail">
      <button className="quiet detail-back" onClick={onBack}>
        ← Back to markets
      </button>
      {detail.isError && (
        <div className="notice error" role="alert">
          The refresh failed. Review is unavailable until this market refreshes.{' '}
          <button onClick={() => void detail.refetch()}>Retry market</button>
        </div>
      )}
      <div className="glass detail-match">
        <div className="card-top">
          <span>{market.competition}</span>
          <span className="status">
            {accepting
              ? 'Open for predictions'
              : market.fixtureStatus === 'scheduled'
                ? 'Locked'
                : market.fixtureStatus}
          </span>
        </div>
        <p className="detail-kickoff">
          <time dateTime={market.kickoff}>
            {new Date(market.kickoff).toLocaleString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>{' '}
          · Your local time
        </p>
        <h1 ref={heading} tabIndex={-1}>
          {market.home} <span>vs</span> {market.away}
        </h1>
        <div className="detail-crests" aria-hidden="true">
          <TeamBadge
            key={market.homeLogo}
            logo={market.homeLogo}
            code={market.homeCode}
            side="home"
          />
          <span>VS</span>
          <TeamBadge
            key={market.awayLogo}
            logo={market.awayLogo}
            code={market.awayCode}
            side="away"
          />
        </div>
        <h2>What’s your call?</h2>
        <p className="muted">Choose one outcome. Each prediction settles independently.</p>
        <div className="detail-outcomes">
          {outcomes.map((outcome) => (
            <button
              key={outcome}
              aria-pressed={selected === outcome}
              disabled={!accepting}
              onClick={() => onPick(market, outcome)}
            >
              <span>{labels[outcome]}</span>
              <strong>{Math.round(market.prices[outcome] * 100)}%</strong>
              <small>of the current pool</small>
            </button>
          ))}
        </div>
        {!accepting && (
          <p className="notice">
            This market is not accepting new predictions. You can still inspect its pool and rules.
          </p>
        )}
        <div className="detail-stats">
          <div>
            <span>Total pool</span>
            <strong>{formatCkb(market.totalPoolCkb)} tCKB</strong>
          </div>
          <div>
            <span>Predictions</span>
            <strong>{market.totalBets}</strong>
          </div>
        </div>
        <p className="muted">Pool percentages are not fixed odds or guaranteed returns.</p>
      </div>
      <section className="glass detail-rules">
        <p className="eyebrow">BEFORE YOU PICK</p>
        <h2>Know the market.</h2>
        <dl>
          <div>
            <dt>Current ledger stake limits</dt>
            <dd>
              {displayShannons(terms.minimumShannons)} to {displayShannons(terms.maximumShannons)}{' '}
              tCKB
            </dd>
          </div>
          <div>
            <dt>Protocol / creator fees</dt>
            <dd>
              {terms.protocolFeeBps / 100}% / {terms.creatorFeeBps / 100}% of the losing pool
            </dd>
          </div>
          <div>
            <dt>Predictions close</dt>
            <dd>
              {new Date(
                Math.min(Date.parse(terms.closesAt), Date.parse(terms.kickoff)),
              ).toLocaleString('en-GB')}
            </dd>
          </div>
        </dl>
        <p>
          Winning positions share the losing pool after fees. These fees are not an extra percentage
          added to your draft total. Void markets refund stakes under the existing ledger rules.
        </p>
        <p>
          These markets currently use Streak’s custodial treasury and account ledger. The configured
          football reporter supplies results. Direct wallet-to-market payments are being integrated
          separately.
        </p>
        <div className="notice">
          The new slip saves and reviews predictions only. It does not place a bet or move funds.
        </div>
        <a className="market-link" href={`/index.html#market/${encodeURIComponent(market.id)}`}>
          Open legacy market activity →
        </a>
      </section>
    </section>
  );
}
