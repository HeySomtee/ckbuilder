import { useState } from 'react';
import { gamesDataMode } from '../../lib/games-data';
import './panel.css';

export function GameTestPanel({
  admin,
  game,
  id,
  round = 0,
  state,
  busy,
  run,
}: {
  admin: boolean;
  game: 'five' | 'survivor';
  id?: string;
  round?: number;
  state?: string;
  busy: boolean;
  run: (body: Record<string, unknown>) => void;
}) {
  const [scenario, setScenario] = useState('mixed');
  if (!admin || gamesDataMode !== 'test') return null;
  const act = (control: string) =>
    run({
      action: 'testControl',
      control,
      id: control === 'start' ? `test-${crypto.randomUUID()}` : id,
      round,
      scenario,
    });
  return (
    <aside className="game-test-panel" aria-label="Game testing controls">
      <div className="game-test-caption">
        <div>
          <strong>Local test controls</strong>
          <p>Dummy players and results. Real testnet transfers. The admin controls deadlines.</p>
        </div>
      </div>
      {admin && (
        <div className="game-test-actions">
          {game === 'five' && (
            <button className="btn primary" disabled={busy} onClick={() => act('start')}>
              Start new test gameweek
            </button>
          )}
          {id && !['final', 'complete', 'cancelled', 'draft'].includes(state ?? '') && (
            <>
              <button
                className="btn"
                disabled={busy || state === 'locked'}
                onClick={() => act('close')}
              >
                {game === 'five' ? 'Close picks & bids now' : 'Close picks now'}
              </button>
              {game === 'survivor' && (
                <label>
                  Result scenario
                  <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                    <option value="mixed">Mixed results</option>
                    <option value="home">Home teams win</option>
                    <option value="away">Away teams win</option>
                    <option value="draw">All draws</option>
                    <option value="void">All fixtures void</option>
                  </select>
                </label>
              )}
              <button className="btn" disabled={busy} onClick={() => act('results')}>
                {game === 'five' ? 'Apply dummy results' : 'Resolve & open next round'}
              </button>
              {game === 'five' && (
                <button className="btn" disabled={busy} onClick={() => act('finalize')}>
                  Finalize prizes
                </button>
              )}
            </>
          )}
          {busy && (
            <span className="game-test-working" role="status">
              <i aria-hidden="true" />
              Updating test round…
            </span>
          )}
        </div>
      )}
      {game === 'survivor' && (
        <small>
          Use Create competition to choose the dummy rounds. Two signed-in entrants are needed.
          Survivor entry is free; its announced prize is not an automatic wallet payout.
        </small>
      )}
    </aside>
  );
}
