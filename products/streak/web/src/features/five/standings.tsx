import { useRef, useState } from 'react';
import { Icon } from '../../components/icon';
import type { FiveRound, Player } from './api';
import { money } from './api';
import { Modal } from './presentation';
import { PlayerPoints, SquadPitch, squadPoints } from './live-team';
import './standings.css';

export function managerName(name: string) {
  return name && name !== 'Player' ? name : 'Unnamed manager';
}

export function FiveStandings({ round, now }: { round: FiveRound; now: number }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null),
    pointsBack = useRef<HTMLButtonElement | null>(null),
    pitchPanel = useRef<HTMLElement | null>(null);
  const locked =
    (round.state !== 'open' && round.state !== 'draft') || now >= Date.parse(round.terms.lockAt);
  const final = round.state === 'final';
  const ranked = locked && round.standings.length > 0;
  const rows = ranked ? round.standings : round.entries;
  const filtered = rows.filter((entry) =>
    `${managerName(entry.name)} ${entry.walletLabel ?? ''}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const index = rows.findIndex((entry) => entry.id === selectedId);
  const selected = rows[index];
  const entry = round.entries.find((item) => item.id === selectedId);
  const privateSquad = !locked && entry?.id !== round.ownId;
  const canRead = entry?.players && !privateSquad;
  const points = entry && canRead ? squadPoints(round, entry) : null;
  const player: Player | undefined =
    canRead && entry.players?.includes(playerId ?? '')
      ? round.terms.players.find((item) => item.id === playerId)
      : undefined;
  const close = () => {
    setSelectedId(null);
    setPlayerId(null);
  };
  const move = (direction: number) => {
    setSelectedId(rows[index + direction]?.id ?? null);
    setPlayerId(null);
  };
  const own = rows.find((item) => item.id === round.ownId);
  const open = (id: string, trigger: HTMLElement) => {
    opener.current = trigger;
    setSelectedId(id);
    setPlayerId(null);
  };
  const rank = ranked ? index + 1 : null;
  return (
    <section className="glass five-standings five-manager-table">
      <header>
        <div>
          <p className="eyebrow">THE WEEKEND TABLE</p>
          <h2>{final ? 'Final standings' : locked ? 'Live standings' : 'The team sheet'}</h2>
          <small>
            {final
              ? 'Final scores'
              : locked
                ? 'Provisional points · Updates automatically'
                : 'Squads stay private until the deadline.'}
            {round.scoresAt && locked ? ` · ${new Date(round.scoresAt).toLocaleString()}` : ''}
          </small>
        </div>
        <span className="five-tag">
          {rows.length} manager{rows.length === 1 ? '' : 's'}
        </span>
      </header>
      {rows.length > 0 && (
        <div className="five-standings-tools">
          <label className="five-manager-search">
            <Icon name="search" />
            <input
              aria-label="Find a manager or wallet"
              placeholder="Find a manager or wallet"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={96}
            />
          </label>
          {own && (
            <button
              className="btn"
              onClick={(event) => {
                setSearch('');
                open(own.id, event.currentTarget);
              }}
            >
              My position{ranked ? ` · #${rows.findIndex((item) => item.id === own.id) + 1}` : ''}
            </button>
          )}
        </div>
      )}
      {rows.length ? (
        <>
          <div className="five-table-labels" aria-hidden="true">
            <span>#</span>
            <span>Manager</span>
            <span>{locked ? 'Points / reward' : 'Team'}</span>
            <span />
          </div>
          <div className="five-manager-rows">
            {filtered.map((item) => {
              const standing = round.standings.find((score) => score.id === item.id);
              const saved = round.entries.find((record) => record.id === item.id);
              const observed = saved?.players?.some((id) => round.scores[id] !== undefined);
              const reward = final ? (round.rewards[item.id] ?? '0') : '0';
              return (
                <button
                  key={item.id}
                  className={`five-manager-row ${item.id === round.ownId ? 'own' : ''}`}
                  aria-label={`View ${managerName(item.name)} squad`}
                  onClick={(event) => open(item.id, event.currentTarget)}
                >
                  <span className="five-manager-rank">
                    {ranked ? rows.findIndex((record) => record.id === item.id) + 1 : '–'}
                  </span>
                  <span className="five-manager-identity">
                    <strong>
                      {managerName(item.name)}
                      {item.id === round.ownId && <em>You</em>}
                    </strong>
                    <small>{item.walletLabel || 'Wallet label unavailable'}</small>
                  </span>
                  <span className="five-manager-result">
                    <strong>
                      {!locked
                        ? 'Saved'
                        : standing && (!standing.pending || observed)
                          ? `${standing.points} pts`
                          : 'Pending'}
                    </strong>
                    {BigInt(reward) > 0n ? (
                      <small>{money(reward)} tCKB allocated</small>
                    ) : locked && !final && observed ? (
                      <small>Provisional</small>
                    ) : null}
                  </span>
                  <span className="five-chevron-next">
                    <Icon name="chevron-down" />
                  </span>
                </button>
              );
            })}
          </div>
          {!filtered.length && <p role="status">No managers match that name or wallet label.</p>}
          <p className="five-standings-footnote">
            Tap a manager to view their five.{' '}
            {final
              ? 'Allocated rewards are separate from payment confirmation.'
              : 'Player points include the captain multiplier.'}
          </p>
        </>
      ) : (
        <p>Be the first to put your football instinct on the team sheet.</p>
      )}
      {selected && (
        <Modal
          title={`${managerName(selected.name)}'s five`}
          className="five-squad-dialog"
          returnFocus={opener.current}
          backLabel="Back to standings"
          onBack={close}
          onClose={close}
        >
          <div className="five-squad-identity">
            <div>
              <p className="eyebrow">
                {round.terms.name} · {final ? 'FINAL' : locked ? 'LIVE POINTS' : 'PICKS OPEN'}
              </p>
              <h3>
                {managerName(selected.name)}
                {selected.id === round.ownId && <span className="five-tag">You</span>}
              </h3>
              <small>
                {selected.walletLabel || 'Wallet label unavailable'}
                {rank ? ` · Rank #${rank}` : ''}
              </small>
            </div>
            <div className="five-live-total">
              <strong>{points?.observed ? points.total : '–'}</strong>
              <span>
                {points?.observed
                  ? final
                    ? 'final points'
                    : 'provisional points'
                  : 'Awaiting points'}
              </span>
            </div>
          </div>
          {canRead && entry ? (
            <div className="five-squad-layout" data-player-open={!!player}>
              <section className="five-squad-pitch-panel" ref={pitchPanel}>
                <SquadPitch
                  round={round}
                  entry={entry}
                  onPlayer={(p) => {
                    setPlayerId(p.id);
                    requestAnimationFrame(() => {
                      if (window.matchMedia('(max-width: 760px)').matches) {
                        pointsBack.current?.focus();
                        pointsBack.current?.scrollIntoView({ block: 'nearest' });
                      }
                    });
                  }}
                  selectedId={playerId ?? undefined}
                />
                <p>
                  {points?.observed} of {points?.count} players updated. Captain scores double.
                </p>
              </section>
              <aside className="five-squad-points-panel" aria-label="Player point breakdown">
                {player ? (
                  <>
                    <button
                      ref={pointsBack}
                      className="btn five-return-pitch"
                      onClick={() => {
                        setPlayerId(null);
                        requestAnimationFrame(() => {
                          const button = [
                            ...(pitchPanel.current?.querySelectorAll<HTMLButtonElement>(
                              '.five-pitch-player',
                            ) ?? []),
                          ].find((node) => node.dataset.playerId === player.id);
                          button?.focus();
                        });
                      }}
                    >
                      <span className="five-chevron-back">
                        <Icon name="chevron-down" />
                      </span>
                      Back to squad
                    </button>
                    <PlayerPoints round={round} entry={entry} player={player} />
                  </>
                ) : (
                  <div className="five-squad-help">
                    <Icon name="five" />
                    <h3>Every shirt tells a story.</h3>
                    <p>
                      Tap a player to see appearances, goals, clean sheets and their gameweek
                      points.
                    </p>
                    <span className="five-tag">C = double points</span>
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="five-squad-private">
              <Icon name="shield" />
              <h3>
                {privateSquad
                  ? 'Their game plan stays private.'
                  : 'Squad details are not available yet.'}
              </h3>
              <p>
                {privateSquad
                  ? `Come back after the deadline: ${new Date(round.terms.lockAt).toLocaleString()}. You can view your own saved squad now.`
                  : 'Close this panel and refresh the gameweek to try again.'}
              </p>
            </div>
          )}
          {final && BigInt(round.rewards[selected.id] ?? '0') > 0n && (
            <p className="five-squad-allocation">
              {money(round.rewards[selected.id])} tCKB allocated · Payment status is separate.
            </p>
          )}
          <footer className="five-squad-navigation">
            <button className="btn" disabled={index <= 0} onClick={() => move(-1)}>
              <span className="five-chevron-back">
                <Icon name="chevron-down" />
              </span>
              Previous
            </button>
            <small>
              {index + 1} of {rows.length}
            </small>
            <button className="btn" disabled={index >= rows.length - 1} onClick={() => move(1)}>
              Next
              <span className="five-chevron-next">
                <Icon name="chevron-down" />
              </span>
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
