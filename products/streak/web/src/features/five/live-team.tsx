import { useState } from 'react';
import type { FiveRound, Player } from './api';
import { Jersey, Modal, positions } from './presentation';
import { PlayerProfile } from './player-profile';
import './live-team.css';

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
  const squad = (own?.players ?? []).flatMap((id) => {
    const p = round.terms.players.find((p) => p.id === id);
    return p ? [p] : [];
  });
  const observed = squad.filter((p) => round.scores[p.id] !== undefined).length;
  const total = squad.reduce(
    (sum, p) => sum + (round.scores[p.id]?.points ?? 0) * (p.id === own?.captain ? 2 : 1),
    0,
  );
  const final = round.state === 'final';
  const used = new Set<string>();
  const score = player ? round.scores[player.id] : undefined;
  const multiplier = player?.id === own?.captain ? 2 : 1;
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
        <div className="five-pitch">
          {positions.map((pos, i) => {
            const p = squad.find((p) => p.position === pos && !used.has(p.id));
            if (!p) return null;
            used.add(p.id);
            const points = round.scores[p.id];
            const captain = p.id === own.captain;
            return (
              <div className={`five-slot slot-${i}`} data-position={pos} key={p.id}>
                <button
                  className="five-pitch-player"
                  aria-label={`View ${p.name} gameweek points`}
                  onClick={() => setPlayer(p)}
                >
                  <Jersey player={p} />
                  <strong>{p.name}</strong>
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
        <footer>
          <span>
            {observed} of {squad.length} players have points updates. Captain doubled.
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
          <div className="five-live-breakdown">
            <h3>
              {score
                ? `${score.points * multiplier} points${multiplier === 2 ? ' · Captain ×2' : ''}`
                : 'Awaiting points'}
            </h3>
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
                    Player score {score.points} × 2 = {score.points * 2} points for your team.
                  </p>
                )}
              </>
            ) : (
              <p>No player score has arrived yet. This is not a confirmed zero.</p>
            )}
            <p>
              {final
                ? 'Final gameweek score.'
                : 'Provisional Streak Five score. Updates as match data arrives.'}
            </p>
          </div>
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
