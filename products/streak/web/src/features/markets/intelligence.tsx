import { useQuery } from '@tanstack/react-query';
import { CellLoader } from '../../components/cell-loader';
import { getMatchIntelligence } from './intelligence-api';
import type { TeamForm } from './intelligence-api';
import type { Market } from './api';
import { outcomes } from './api';
import { currentPool, poolShares } from './pools';
import type { DirectPool } from './pools';
import { useNow } from '../../lib/use-now';
import { displayShannons } from '../predictions/draft';
import './terminal.css';

function TeamRead({ team, name, side }: { team?: TeamForm; name: string; side: string }) {
  return (
    <article className="terminal-team" data-side={side}>
      <div>
        <strong>{team?.name ?? name}</strong>
        <span>{team ? `#${team.rank}` : 'Table pending'}</span>
      </div>
      {team ? (
        <>
          <p>
            <b>{team.points}</b> pts <i />
            {team.played} played <i />
            {team.goalsFor}:{team.goalsAgainst} goals
          </p>
          <div className="form-line">
            <span>LAST FIVE</span>
            <div>
              {team.form.split('').map((result, i) => (
                <span
                  key={i}
                  className={`form-result form-${result}`}
                  title={result === 'W' ? 'Win' : result === 'D' ? 'Draw' : 'Loss'}
                >
                  {result}
                </span>
              ))}
            </div>
            <small>
              {team.won}W {team.drawn}D {team.lost}L
            </small>
          </div>
        </>
      ) : (
        <p>Standings have not been provided for this fixture.</p>
      )}
    </article>
  );
}
export function MatchIntelligence({ market, pool }: { market: Market; pool?: DirectPool }) {
  const now = useNow(true);
  const query = useQuery({
    queryKey: ['match-intelligence', market.id],
    queryFn: ({ signal }) => getMatchIntelligence(market.id, market.matchId, signal),
    staleTime: 30_000,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.frozen ? false : q.state.data?.refreshing ? 5_000 : 60_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;
  const latest = currentPool(pool, now);
  const crowd = latest?.state === 'ready' ? poolShares(latest.totals) : null;
  const names = { home: market.home, draw: 'Draw', away: market.away };
  return (
    <section className="glass terminal-panel intelligence-panel" aria-label="Match intelligence">
      <header className="terminal-panel-head">
        <div>
          <span className="terminal-kicker">THE MATCH, IN NUMBERS</span>
          <h2>Market vs Machine</h2>
        </div>
        <span className="terminal-state">
          {!data?.frozen && query.isFetching ? <CellLoader variant="orbit" /> : <i />}
          {data?.frozen ? 'KICKOFF SNAPSHOT' : query.isFetching ? 'UPDATING' : 'PRE-MATCH'}
        </span>
      </header>
      {query.isPending ? (
        <div className="terminal-skeleton" role="status">
          <span>Reading the match...</span>
          <i />
          <i />
          <i />
        </div>
      ) : !data ? (
        <div className="terminal-empty">
          <p>Match intelligence is taking a moment.</p>
          <button aria-busy={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching && <CellLoader variant="orbit" />}
            Retry intelligence
          </button>
        </div>
      ) : (
        <>
          <div
            className="signal-table"
            role="table"
            aria-label="Crowd, model and bookmaker comparison"
          >
            <div role="row" className="signal-table-head">
              <span role="columnheader">OUTCOME</span>
              <span role="columnheader">POOL</span>
              <span role="columnheader">MODEL</span>
              <span role="columnheader">BOOKS</span>
            </div>
            {outcomes.map((side) => (
              <div role="row" key={side} data-outcome={side}>
                <strong role="rowheader">{names[side]}</strong>
                <span role="cell">{crowd ? `${crowd[side].toFixed(1)}%` : '-'}</span>
                <span role="cell" className="model-value">
                  {data.machine ? `${(data.machine.probabilities[side] * 100).toFixed(1)}%` : '-'}
                </span>
                <span role="cell">
                  {data.books ? `${(data.books.probabilities[side] * 100).toFixed(1)}%` : '-'}
                </span>
              </div>
            ))}
          </div>
          <div className="terminal-read-grid">
            <article>
              <span className="terminal-kicker">MODEL READ</span>
              <strong>{data.machine?.advice || 'No forecast available'}</strong>
              <p>{data.machine?.comment || 'Provider model, separate from the pool.'}</p>
            </article>
            <article>
              <span className="terminal-kicker">BOOK CONSENSUS</span>
              <strong>
                {data.books ? `${data.books.count} bookmakers` : 'No bookmaker coverage'}
              </strong>
              <p>
                {data.books
                  ? `${(data.books.margin * 100).toFixed(1)}% mean margin · normalized probabilities`
                  : 'Bookmaker prices are unavailable for this fixture.'}
              </p>
            </article>
          </div>
          <div className="terminal-form-grid">
            <TeamRead team={data.home} name={market.home} side="home" />
            <TeamRead team={data.away} name={market.away} side="away" />
          </div>
          <section className="head-to-head" aria-label="Recent head-to-head meetings">
            <header>
              <h3>Last {data.meetings.length || 'five'} meetings</h3>
              <span>HEAD TO HEAD</span>
            </header>
            {data.meetings.length ? (
              data.meetings.map((match, i) => (
                <div className="meeting-row" key={`${match.date}-${i}`}>
                  <time dateTime={match.date}>
                    {new Date(match.date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </time>
                  <span className={match.homeGoals > match.awayGoals ? 'meeting-winner' : ''}>
                    {match.home}
                  </span>
                  <strong>
                    <b>{match.homeGoals}</b>
                    <span>:</span>
                    <b>{match.awayGoals}</b>
                  </strong>
                  <span className={match.awayGoals > match.homeGoals ? 'meeting-winner' : ''}>
                    {match.away}
                  </span>
                </div>
              ))
            ) : (
              <p className="terminal-empty">No previous meetings provided for this fixture.</p>
            )}
          </section>
          {(query.isError || data.warnings.length > 0) && (
            <p className="terminal-data-note">
              {query.isError
                ? 'Refresh delayed. Showing the last available match intelligence.'
                : data.warnings.join(' ')}
            </p>
          )}
          <footer className="terminal-provenance">
            <span>
              {data.frozen ? 'FROZEN AT KICKOFF' : 'API-FOOTBALL'} ·{' '}
              {new Date(data.fetchedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>Forecasts are not guarantees</span>
          </footer>
        </>
      )}
    </section>
  );
}
export function PoolComposition({ market, pool }: { market: Market; pool?: DirectPool }) {
  const shares = pool?.state === 'ready' ? poolShares(pool.totals) : null;
  const total =
    pool?.state === 'ready' && pool.totals
      ? pool.totals.reduce((sum, n) => sum + BigInt(n), 0n)
      : null;
  return (
    <section
      className="glass terminal-panel pool-composition"
      aria-label="On-chain pool composition"
    >
      <header className="terminal-panel-head">
        <h2>Inside the pool</h2>
        <span className="terminal-kicker">PRINCIPAL ONLY</span>
      </header>
      <div className="composition-total">
        <strong>{total !== null ? displayShannons(total) : '-'}</strong>
        <span>tCKB staked</span>
      </div>
      <div className="composition-bar" aria-hidden="true">
        {outcomes.map((side) => (
          <i
            key={side}
            data-outcome={side}
            style={{ flex: shares?.[side] ?? 1, opacity: shares ? 1 : 0.2 }}
          />
        ))}
      </div>
      {outcomes.map((side, i) => (
        <div className="composition-row" key={side} data-outcome={side}>
          <span>
            <i />
            {side === 'home' ? market.homeCode : side === 'away' ? market.awayCode : 'DRAW'}
          </span>
          <b>{pool?.state === 'ready' && pool.totals ? displayShannons(pool.totals[i]) : '-'}</b>
          <small>{shares ? `${Number(shares[side].toFixed(1))}%` : '-'}</small>
        </div>
      ))}
      <p className="terminal-data-note">
        Storage deposits and Streak's market reserves are excluded.
      </p>
    </section>
  );
}
