import { CellLoader } from '../../components/cell-loader';
import { gamesDataMode } from '../../lib/games-data';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadPlayer } from './scouting-api';
import type { Player } from './api';
import { FixtureRun } from '../../components/fixture-run';
export const compactNumber = (n: number) =>
  Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export function PlayerProfile({
  player,
  selected,
  canSelect,
  onSelect,
}: {
  player: Player;
  selected: boolean;
  canSelect: boolean;
  onSelect: () => void;
}) {
  const [tab, setTab] = useState('history');
  const query = useQuery({
    queryKey: ['five-player-profile', player.id, gamesDataMode],
    queryFn: ({ signal }) => loadPlayer(player.id, signal),
    staleTime: 60000,
    retry: 1,
  });
  const d = query.data,
    p = d?.player;
  return (
    <div className="five-profile">
      <div className="five-profile-identity">
        <span className="five-profile-number">{player.position}</span>
        <div>
          <p>{p?.fullName ?? player.name}</p>
          <span>
            {player.team} · {(player.cost / 10).toFixed(1)} credits this round
          </span>
        </div>
      </div>
      {query.isPending && (
        <div className="five-loading" role="status">
          <CellLoader variant="wave" />
          Loading player history
        </div>
      )}
      {query.isError && (
        <div className="five-message" role="status">
          History is temporarily unavailable.
          <button aria-busy={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching && <CellLoader variant="orbit" />}
            Try again
          </button>
        </div>
      )}
      {p && (
        <>
          <FixtureRun fixtures={d.fixtures.slice(0, 3)} />
          {p.news && (
            <p className="five-player-news">
              {p.news}
              {p.chance !== null ? ` · ${p.chance}% chance of playing` : ''}
            </p>
          )}
          <div className="five-profile-stats">
            {[
              ['FPL form', p.form.toFixed(1)],
              ['FPL points', p.totalPoints],
              ['Pts / game', p.pointsPerGame.toFixed(1)],
              ['Selected', `${p.selectedPercent}%`],
              ['Transfers in', compactNumber(p.transfersIn)],
              ['Transfers out', compactNumber(p.transfersOut)],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="five-form-chart" aria-label="Recent match points under Streak Five rules">
            {d.history
              .slice(0, 6)
              .reverse()
              .map((h) => (
                <div key={h.fixtureId}>
                  <b>{h.fivePoints}</b>
                  <i
                    style={{ height: Math.max(5, Math.min(65, Math.abs(h.fivePoints) * 4)) }}
                    data-negative={h.fivePoints < 0}
                  />
                  <small>GW{h.event}</small>
                </div>
              ))}
          </div>
          <p className="five-profile-note">
            Recent points use Five rules, before captain doubling. FPL form, ownership and transfers
            describe the FPL community.
          </p>
          <nav className="five-profile-tabs" aria-label="Player information">
            <button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
              Match history
            </button>
            <button aria-pressed={tab === 'fixtures'} onClick={() => setTab('fixtures')}>
              Upcoming fixtures
            </button>
          </nav>
          {tab === 'history' ? (
            <div className="five-history-scroll">
              <table>
                <caption className="sr-only">Recent match statistics</caption>
                <thead>
                  <tr>
                    <th>GW / Opp.</th>
                    <th>Min</th>
                    <th>G</th>
                    <th>A</th>
                    <th>FPL</th>
                    <th>Five</th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.slice(0, 15).map((h) => (
                    <tr key={h.fixtureId}>
                      <td>
                        <b>{h.event}</b> {h.opponent} <small>({h.home ? 'H' : 'A'})</small>
                      </td>
                      <td>{h.minutes}</td>
                      <td>{h.goals}</td>
                      <td>{h.assists}</td>
                      <td>{h.fplPoints}</td>
                      <td>
                        <strong>{h.fivePoints}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.history.length && <p>No completed matches yet this season.</p>}
            </div>
          ) : (
            <div className="five-upcoming">
              {d.fixtures.map((f, i) => (
                <div key={i}>
                  <span>GW{f.event ?? 'TBC'}</span>
                  <strong>
                    {f.opponent} ({f.home ? 'H' : 'A'})
                  </strong>
                  <small>
                    {f.kickoff
                      ? new Date(f.kickoff).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Date TBC'}
                  </small>
                  <b
                    data-difficulty={f.difficulty}
                    aria-label={`Fixture difficulty ${f.difficulty} of 5`}
                  >
                    {f.difficulty}
                  </b>
                </div>
              ))}
              {!d.fixtures.length && <p>No upcoming fixtures confirmed.</p>}
            </div>
          )}
          <div className="five-season-line">
            {p.minutes.toLocaleString()} minutes · {p.goals} goals · {p.assists} assists ·{' '}
            {p.cleanSheets} clean sheets
          </div>
        </>
      )}
      <button className="btn primary five-profile-select" disabled={!canSelect} onClick={onSelect}>
        {selected ? 'Remove from my five' : 'Add to my five'}
      </button>
    </div>
  );
}
