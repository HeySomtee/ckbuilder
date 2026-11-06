import { useState } from 'react';
import type { FiveRound, Player } from './api';
import { Jersey, Modal, positions } from './presentation';
import { PlayerProfile } from './player-profile';
import './live-team.css';

export type SquadEntry = FiveRound['entries'][number];
export function savedSquad(round: FiveRound, entry: SquadEntry) {
  return (entry.players ?? []).flatMap((id) => {
    const player = round.terms.players.find((p) => p.id === id);
    return player ? [player] : [];
  });
}
export function squadPoints(round: FiveRound, entry: SquadEntry) {
  const squad = savedSquad(round, entry);
  return {
    observed: squad.filter((p) => round.scores[p.id] !== undefined).length,
    total: squad.reduce(
      (sum, p) => sum + (round.scores[p.id]?.points ?? 0) * (p.id === entry.captain ? 2 : 1),
      0,
    ),
    count: squad.length,
  };
}

/** Saved entries and the existing score snapshot are the sole source for every pitch. */
export function SquadPitch({
  round,
  entry,
  onPlayer,
  selectedId,
}: {
  round: FiveRound;
  entry: SquadEntry;
  onPlayer: (player: Player) => void;
  selectedId?: string;
}) {
  const squad = savedSquad(round, entry),
    used = new Set<string>();
  return (
    <div className="five-pitch">
      {positions.map((pos, i) => {
        const player = squad.find((p) => p.position === pos && !used.has(p.id));
        if (!player) return null;
        used.add(player.id);
        const points = round.scores[player.id],
          captain = player.id === entry.captain;
        return (
          <div className={`five-slot slot-${i}`} data-position={pos} key={player.id}>
            <button
              className="five-pitch-player"
              aria-label={`View ${player.name} gameweek points`}
              data-player-id={player.id}
              aria-pressed={selectedId === player.id}
              onClick={() => onPlayer(player)}
            >
              <Jersey player={player} />
              <strong>{player.name}</strong>
            </button>
            {captain && (
              <span className="five-live-captain" aria-label="Captain, double points">
                C
              </span>
            )}
            <span className="five-live-player-points" data-pending={!points}>
              {points ? `${points.points * (captain ? 2 : 1)} pts` : 'Awaiting points'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PlayerPoints({
  round,
  entry,
  player,
}: {
  round: FiveRound;
  entry: SquadEntry;
  player: Player;
}) {
  const score = round.scores[player.id],
    multiplier = player.id === entry.captain ? 2 : 1;
  return (
    <div className="five-live-breakdown">
      <p className="eyebrow">
        {player.position} · {player.team}
      </p>
      <h3>{player.name}</h3>
      <p className="five-player-score">
        {score
          ? `${score.points * multiplier} points${multiplier === 2 ? ' · Captain ×2' : ''}`
          : 'Awaiting points'}
      </p>
      {score ? (
        <>
          {score.lines.map((line, i) => (
            <div key={i}>
              <span>{line.label}</span>
              <strong>
                {line.points > 0 ? '+' : ''}
                {line.points}
              </strong>
            </div>
          ))}
          {multiplier === 2 && (
            <p>
              Player score {score.points} × 2 = {score.points * 2} points for this team.
            </p>
          )}
        </>
      ) : (
        <p>No player score has arrived yet. This is not a confirmed zero.</p>
      )}
      <p>
        {round.state === 'final'
          ? 'Final gameweek score.'
          : 'Provisional Streak Five score. Updates as match data arrives.'}
      </p>
    </div>
  );
}

/** Only the saved entry is rendered here. Unsaved builder picks never become live scores. */
export function LiveTeam({
  round,
  authenticated,
  scoutingAvailable,
}: {
  round: FiveRound;
  authenticated: boolean;
  scoutingAvailable: boolean;
}) {
  const [player, setPlayer] = useState<Player | null>(null);
  const own = round.entries.find((e) => e.id === round.ownId);
  if (!own)
    return (
      <section className="glass five-empty-state">
        <h2>{authenticated ? 'No team entered this gameweek' : 'Sign in to see your team'}</h2>
        <p>
          {authenticated
            ? 'Picks have closed. You can follow the standings and pick a fresh five for the next deadline.'
            : 'Your saved five and gameweek points stay here after the deadline.'}
        </p>
      </section>
    );
  const { observed, total, count } = squadPoints(round, own),
    final = round.state === 'final';
  return (
    <section className="five-live-team" aria-label="Your gameweek points">
      <div className="glass five-pitch-card">
        <header>
          <div>
            <p className="eyebrow">{final ? 'FINAL POINTS' : 'GAMEWEEK POINTS'}</p>
            <h2>{round.terms.name}</h2>
            <small>
              {final
                ? 'Final scores'
                : round.state === 'cancelled'
                  ? 'Gameweek cancelled'
                  : 'Provisional · Updates automatically'}
            </small>
          </div>
          <div className="five-live-total" aria-live="polite" aria-atomic="true">
            <strong>{observed ? total : '–'}</strong>
            <span>{observed ? 'points' : 'Awaiting points'}</span>
          </div>
        </header>
        <SquadPitch round={round} entry={own} onPlayer={setPlayer} />
        <footer>
          <span>
            {observed} of {count} players have points updates. Captain doubled.
          </span>
          <span>
            {round.scoresAt
              ? `Last updated ${new Date(round.scoresAt).toLocaleString()}`
              : 'Waiting for the first player updates.'}
          </span>
          {!final && (
            <span>Missing points stay pending. Scores can change before finalization.</span>
          )}
        </footer>
      </div>
      {player && (
        <Modal title={`${player.name} · ${round.terms.name}`} onClose={() => setPlayer(null)}>
          <PlayerPoints round={round} entry={own} player={player} />
          {scoutingAvailable && (
            <PlayerProfile
              player={player}
              selected
              canSelect={false}
              readOnly
              onSelect={() => {}}
            />
          )}
        </Modal>
      )}
    </section>
  );
}
