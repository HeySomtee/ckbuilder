import { useState } from 'react';
import { Icon } from '../../components/icon';
import { Notice } from '../../components/notice';
import { CellLoader } from '../../components/cell-loader';
import type { Outcome } from '../predictions/draft';
import type { CampaignDetail, CampaignFixture, CampaignStanding, CampaignSummary } from './api';
import { Badge, ckb, dateTime, Dialog, label, Standings, Trophy } from './presentation';

export function CampaignList({
  campaigns,
  admin,
  onSelect,
  onCreate,
}: {
  campaigns: CampaignSummary[];
  admin: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState<'active' | 'finished'>('active');
  const shown = campaigns.filter((c) =>
    filter === 'finished'
      ? c.state === 'finished' || c.state === 'deleted'
      : c.state !== 'finished' && c.state !== 'deleted',
  );
  return (
    <>
      <header className="campaign-heading">
        <div>
          <span className="campaign-eyebrow">THE COMPETITIONS</span>
          <h1>Your matchweek. Your moment.</h1>
          <p>Play the games you know. Make your way up the table.</p>
        </div>
        {admin && (
          <button type="button" className="btn primary" onClick={onCreate}>
            <Trophy /> Create competition
          </button>
        )}
      </header>
      <div className="campaign-tabs" aria-label="Competition filter">
        <button
          type="button"
          aria-pressed={filter === 'active'}
          onClick={() => setFilter('active')}
        >
          Open & live
        </button>
        <button
          type="button"
          aria-pressed={filter === 'finished'}
          onClick={() => setFilter('finished')}
        >
          Finished
        </button>
      </div>
      <div className="campaign-list">
        {shown.map((c) => (
          <button
            type="button"
            key={c.id}
            className="campaign-list-card"
            onClick={() => onSelect(c.id)}
          >
            <span className="campaign-card-meta">
              <span>{c.kind === 'five' ? 'STREAK FIVE' : 'PREDICTIONS'}</span>
              <Badge tone={c.state === 'open' ? 'mint' : ''}>{label(c.state)}</Badge>
            </span>
            <h2>{c.name}</h2>
            <p>{c.description}</p>
            <div className="campaign-list-prize">
              <Trophy />
              <strong>
                {ckb(c.prizeTotalShannons)} <small>CKB</small>
              </strong>
              <span>
                {c.prizePlaces} prize {c.prizePlaces === 1 ? 'place' : 'places'}
              </span>
            </div>
            <footer>
              <span>{c.joined ? 'You are registered' : `${c.registeredCount} registered`}</span>
              <Icon name="arrow" />
            </footer>
            {c.rehearsal && <Badge>Rehearsal</Badge>}
          </button>
        ))}
      </div>
      {!shown.length && (
        <div className="campaign-empty">
          <Trophy />
          <h2>
            {filter === 'finished'
              ? 'The final tables will live here.'
              : 'The next challenge is on its way.'}
          </h2>
          <p>
            {filter === 'finished'
              ? 'Finished competitions keep their results and prize progress.'
              : 'There are no competitions in this view yet.'}
          </p>
        </div>
      )}
    </>
  );
}

function FixtureCard({
  fixture,
  detail,
  now,
  pending,
  onPick,
}: {
  fixture: CampaignFixture;
  detail: CampaignDetail;
  now: number;
  pending: string | null;
  onPick: (fixture: CampaignFixture, outcome: Outcome) => void;
}) {
  const own = detail.own?.calls.find((call) => call.fixtureId === fixture.fixtureId);
  const full = fixture.occupied !== null && fixture.occupied >= fixture.capacity;
  const locked =
    now >= Date.parse(fixture.cutoffAt) ||
    ['draft', 'finished', 'finalizing', 'deleted'].includes(detail.state);
  const unavailable = full || locked || pending !== null;
  return (
    <article className="campaign-match-card">
      <div className="campaign-card-meta">
        <span>{fixture.league}</span>
        <Badge tone={own ? 'mint' : ''}>
          {own ? 'Qualifying pick' : full ? 'Full' : locked ? 'Locked' : 'Open'}
        </Badge>
      </div>
      <time dateTime={fixture.kickoffAt}>{dateTime(fixture.kickoffAt)}</time>
      <div className="campaign-match-teams">
        <strong>{fixture.home}</strong>
        <span>vs</span>
        <strong>{fixture.away}</strong>
      </div>
      {own ? (
        <div className="campaign-call-status">
          <span>
            {[fixture.home, 'Draw', fixture.away][own.outcome]}
            {own.outcome === 1 ? '' : ' to win'}
          </span>
          <Badge tone={own.status === 'correct' ? 'mint' : ''}>
            {own.status === 'pending'
              ? 'Awaiting result'
              : own.status === 'void'
                ? 'Void · 0 pts'
                : `${own.points} pts`}
          </Badge>
        </div>
      ) : (
        <div className="campaign-outcomes">
          {(['home', 'draw', 'away'] as const).map((outcome) => (
            <button
              type="button"
              key={outcome}
              disabled={unavailable}
              onClick={() => onPick(fixture, outcome)}
              aria-label={`${outcome === 'home' ? fixture.home : outcome === 'away' ? fixture.away : 'Draw'}${outcome === 'draw' ? '' : ' to win'}`}
            >
              {pending === fixture.fixtureId ? (
                <CellLoader />
              ) : outcome === 'home' ? (
                'Home'
              ) : outcome === 'away' ? (
                'Away'
              ) : (
                'Draw'
              )}
            </button>
          ))}
        </div>
      )}
      <div className="campaign-capacity">
        <span>
          {fixture.occupied === null
            ? 'Spaces being checked'
            : `${fixture.occupied} / ${fixture.capacity} spaces filled`}
        </span>
        {fixture.occupied !== null && fixture.capacity > 0 && (
          <progress
            value={Math.min(fixture.occupied, fixture.capacity)}
            max={fixture.capacity}
            aria-label={`${fixture.occupied} of ${fixture.capacity} market spaces filled`}
          />
        )}
        <small>
          {fixture.updatedAt
            ? `Checked ${dateTime(fixture.updatedAt)}`
            : 'Final availability is checked in your slip.'}
        </small>
      </div>
    </article>
  );
}

function OwnCalls({ detail }: { detail: CampaignDetail }) {
  if (!detail.own?.participated)
    return (
      <div className="campaign-empty compact">
        <Icon name="account" />
        <h3>Registered, with a place on the table.</h3>
        <p>
          {detail.state === 'finished'
            ? 'No qualifying entry was recorded for this competition.'
            : 'Your points will appear after your first qualifying entry.'}
        </p>
      </div>
    );
  return (
    <div className="campaign-call-list">
      {detail.own.calls.map((call) => {
        const fixture = detail.fixtures.find((f) => f.fixtureId === call.fixtureId);
        return (
          <div key={call.fixtureId}>
            <span>
              <strong>
                {fixture ? `${fixture.home} vs ${fixture.away}` : 'Competition match'}
              </strong>
              <small>
                {call.status === 'pending'
                  ? 'Awaiting verified result'
                  : call.status === 'correct'
                    ? 'Correct prediction'
                    : call.status === 'void'
                      ? 'Void match'
                      : 'Incorrect prediction'}
              </small>
            </span>
            <strong>{call.status === 'pending' ? 'Pending' : `${call.points} pts`}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function CampaignPlay({
  detail,
  authenticated,
  now,
  pending,
  pickPending,
  onJoin,
  onSignIn,
  signInPending,
  onPick,
  onOpenFive,
  onAddress,
  onPage,
}: {
  detail: CampaignDetail;
  authenticated: boolean;
  now: number;
  pending: boolean;
  pickPending: string | null;
  onJoin: () => void;
  onSignIn: () => void;
  signInPending: boolean;
  onPick: (fixture: CampaignFixture, outcome: Outcome) => void;
  onOpenFive: (roundId: string) => void;
  onAddress: () => void;
  onPage: (offset: number) => void;
}) {
  const [tab, setTab] = useState<'play' | 'leaderboard' | 'rules'>('play');
  const [person, setPerson] = useState<CampaignStanding | null>(null);
  const finished =
      detail.state === 'finished' || (detail.state === 'deleted' && detail.awards.length > 0),
    own = detail.own;
  const ownAward = detail.awards.find(
    (award) => award.publicId !== null && award.publicId === own?.publicId,
  );
  const joinClosed = detail.state !== 'open' || now >= Date.parse(detail.registrationClosesAt);
  const awards = detail.awards;
  return (
    <>
      <header className="campaign-heading">
        <div>
          <div className="campaign-eyebrow">
            {detail.kind === 'five' ? 'STREAK FIVE' : 'MATCH PREDICTIONS'}{' '}
            <Badge tone={detail.state === 'open' ? 'mint' : ''}>{label(detail.state)}</Badge>
            {detail.rehearsal && <Badge>Rehearsal</Badge>}
          </div>
          <h1>{detail.name}</h1>
          <p>{detail.description}</p>
        </div>
        <div className="campaign-heading-prize">
          <Trophy />
          <strong>
            {ckb(detail.prizeTotalShannons)} <small>CKB</small>
          </strong>
          <span>{detail.prizePlaces} prize places</span>
        </div>
      </header>
      {detail.rehearsal && (
        <Notice title="Rehearsal competition">
          This competition is excluded from community statistics. Its awards are for testing only.
          No mainnet rewards are paid and no payout addresses are collected.
        </Notice>
      )}
      {detail.state === 'deleted' && (
        <Notice title="Competition archived">
          Existing results and prizes remain available here. Registration is closed.
        </Notice>
      )}
      {detail.notice && (
        <Notice
          title={
            detail.scoreStatus === 'unavailable' || detail.scoreStatus === 'review-required'
              ? 'Scores need another check'
              : 'Competition update'
          }
          tone={
            detail.scoreStatus === 'unavailable' || detail.scoreStatus === 'review-required'
              ? 'attention'
              : 'info'
          }
        >
          {detail.notice}
        </Notice>
      )}
      {finished ? (
        <section className="campaign-finish-hero" aria-label="Competition final result">
          <div className="campaign-finish-icon">
            <Trophy />
          </div>
          <div>
            <span className="campaign-eyebrow">
              {ownAward ? 'YOU FINISHED IN A PRIZE PLACE' : 'FULL TIME'}
            </span>
            <h2>
              {ownAward
                ? 'A place among the best.'
                : own
                  ? own.participated
                    ? 'Every call was part of the story.'
                    : 'On the list. Next time, on the pitch.'
                  : 'Well played, everyone.'}
            </h2>
            <p>Final standings are preserved here. Prize payment is tracked separately.</p>
            {own && (
              <dl className="campaign-result-stats">
                <div>
                  <dt>Your rank</dt>
                  <dd>
                    #{own.rank} <small>/ {detail.registeredCount}</small>
                  </dd>
                </div>
                <div>
                  <dt>Total points</dt>
                  <dd>{own.points}</dd>
                </div>
                <div>
                  <dt>{ownAward ? 'Your award' : 'Entry status'}</dt>
                  <dd>
                    {ownAward
                      ? `${ckb(ownAward.amountShannons)} CKB`
                      : own.participated
                        ? 'Completed'
                        : 'Registered'}
                  </dd>
                </div>
              </dl>
            )}
          </div>
          {ownAward && (
            <div className="campaign-award-status">
              <Badge tone={ownAward.status === 'paid' ? 'mint' : 'amber'}>
                {detail.rehearsal
                  ? 'Rehearsal award'
                  : ownAward.status === 'paid'
                    ? 'Prize paid'
                    : ownAward.status === 'submitted'
                      ? 'Payment confirming'
                      : ownAward.status === 'ready'
                        ? 'Ready for payout'
                        : 'Address needed'}
              </Badge>
              <p>
                {detail.rehearsal
                  ? 'Recorded for testing only. No mainnet payment.'
                  : ownAward.status === 'paid'
                    ? 'Your prize transaction is confirmed.'
                    : 'The organizer approves mainnet prize payouts.'}
              </p>
              {!detail.rehearsal && ['address-needed', 'ready'].includes(ownAward.status) && (
                <button className="btn" type="button" onClick={onAddress}>
                  {ownAward.status === 'ready'
                    ? 'Review receiving address'
                    : 'Add receiving address'}
                </button>
              )}
              {!detail.rehearsal && ownAward.transactionHash && (
                <a
                  href={`https://explorer.nervos.org/transaction/${encodeURIComponent(ownAward.transactionHash)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View prize transaction <Icon name="arrow" />
                </a>
              )}
            </div>
          )}
        </section>
      ) : (
        <div className="campaign-entry-strip">
          <div>
            <strong>
              {own
                ? `You are registered · Rank #${own.rank}`
                : joinClosed
                  ? 'Registration has closed'
                  : 'A place on the table is yours to take.'}
            </strong>
            <small>
              {own
                ? `${own.points} points${!own.participated ? ' · No qualifying entry yet' : ''}`
                : `Registration closes ${dateTime(detail.registrationClosesAt)}`}
            </small>
          </div>
          {!own && !joinClosed && (
            <button
              className="btn primary"
              type="button"
              disabled={pending || signInPending}
              onClick={authenticated ? onJoin : onSignIn}
            >
              {(pending || signInPending) && <CellLoader />}
              {authenticated ? 'Join competition' : 'Sign in to join'}
            </button>
          )}
        </div>
      )}
      <div className="campaign-tabs" aria-label="Competition sections">
        {(['play', 'leaderboard', 'rules'] as const).map((key) => (
          <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {key === 'play'
              ? finished
                ? 'Results'
                : detail.kind === 'five'
                  ? 'My five'
                  : 'Play'
              : key === 'leaderboard'
                ? finished
                  ? 'Final leaderboard'
                  : 'Leaderboard'
                : 'Rules & prizes'}
          </button>
        ))}
        <span>{detail.registeredCount} registered</span>
      </div>
      {tab === 'play' &&
        (finished ? (
          <div className="campaign-results-grid">
            <section className="campaign-panel">
              <div className="campaign-panel-heading">
                <span className="campaign-eyebrow">THE PRIZE PLACES</span>
                <h2>Well played, everyone.</h2>
              </div>
              {awards.length ? (
                <div className="campaign-award-list">
                  {awards.map((award) => (
                    <div key={award.place}>
                      <span className="campaign-place">#{award.place}</span>
                      <strong>{award.publicId ? award.name : 'Unawarded'}</strong>
                      <span>
                        {ckb(award.amountShannons)} <small>CKB</small>
                        {!award.publicId && <small>No qualifying recipient</small>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="campaign-empty compact">
                  <p>No awards were allocated.</p>
                </div>
              )}
              <button
                className="btn campaign-panel-action"
                type="button"
                onClick={() => setTab('leaderboard')}
              >
                All final standings <Icon name="arrow" />
              </button>
            </section>
            <section className="campaign-panel">
              <div className="campaign-panel-heading">
                <span className="campaign-eyebrow">YOUR MATCHWEEK</span>
                <h2>{detail.kind === 'five' ? 'Your final five' : 'Your calls, settled.'}</h2>
              </div>
              {detail.kind === 'five' ? (
                <div className="campaign-five-card">
                  <Icon name="five" />
                  <h3>{detail.gameweek?.name ?? 'Streak Five'}</h3>
                  <p>
                    {own?.participated
                      ? `${own.points} final points. Open your saved team to see each player.`
                      : 'No qualifying team was recorded for you.'}
                  </p>
                  {detail.fiveRoundId && (
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => onOpenFive(detail.fiveRoundId!)}
                    >
                      View team & player points <Icon name="arrow" />
                    </button>
                  )}
                </div>
              ) : own ? (
                <OwnCalls detail={detail} />
              ) : (
                <div className="campaign-empty compact">
                  <p>You did not register for this competition.</p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="campaign-play-grid">
            <section>
              <div className="campaign-section-intro">
                <h2>
                  {detail.kind === 'five'
                    ? 'Your squad, your call.'
                    : `${detail.fixtures.length} fixtures. Make them count.`}
                </h2>
                <p>
                  {detail.kind === 'five'
                    ? `${detail.gameweek?.name ?? 'Streak Five'} · Picks close ${dateTime(detail.gameweek?.lockAt ?? null)}`
                    : 'Correct result: 3 points. Stake size does not affect the leaderboard.'}
                </p>
              </div>
              {detail.kind === 'five' ? (
                <div className="campaign-five-card">
                  <Icon name="five" />
                  <h3>
                    {own?.participated ? 'Your team is in the game.' : 'Five players. One captain.'}
                  </h3>
                  <p>
                    {own?.participated
                      ? `${own.points} points so far. Follow your saved team and each player as matches progress.`
                      : 'Build your team in the Streak Five game. Your saved squad counts here once you have registered.'}
                  </p>
                  {detail.fiveRoundId && (
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => onOpenFive(detail.fiveRoundId!)}
                    >
                      {own?.participated ? 'View my team' : 'Pick my five'} <Icon name="arrow" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="campaign-market-grid">
                    {detail.fixtures.map((fixture) => (
                      <FixtureCard
                        key={fixture.fixtureId}
                        fixture={fixture}
                        detail={detail}
                        now={now}
                        pending={pickPending}
                        onPick={onPick}
                      />
                    ))}
                  </div>
                  <p className="campaign-small">
                    Market spaces include predictions outside this competition. Registration and
                    adding a pick do not reserve a space. The existing slip checks availability
                    before payment.
                  </p>
                </>
              )}
            </section>
            <aside className="campaign-panel campaign-live-table">
              <div className="campaign-panel-heading">
                <h2>The standings</h2>
                <Badge>{detail.scoreStatus === 'final' ? 'Final' : 'Updating'}</Badge>
              </div>
              <Standings entries={detail.leaderboard.slice(0, 5)} compact />
              <button
                className="btn campaign-panel-action"
                type="button"
                onClick={() => setTab('leaderboard')}
              >
                See the leaderboard <Icon name="arrow" />
              </button>
            </aside>
          </div>
        ))}
      {tab === 'leaderboard' && (
        <section className="campaign-panel">
          <div className="campaign-panel-heading">
            <h2>{finished ? 'Final standings' : 'The leaderboard'}</h2>
            <p>
              {detail.scoreStatus === 'final' ? 'Final scores' : 'Provisional scores'}
              {detail.verifiedAt ? ` · Checked ${dateTime(detail.verifiedAt)}` : ''}
            </p>
          </div>
          <Standings entries={detail.leaderboard} onSelect={setPerson} />
          <div className="campaign-pagination">
            <span>
              {detail.leaderboardTotal
                ? `${detail.leaderboardOffset + 1}-${Math.min(detail.leaderboardOffset + detail.leaderboard.length, detail.leaderboardTotal)} of ${detail.leaderboardTotal}`
                : 'No registrations yet'}
            </span>
            <button
              className="btn"
              type="button"
              disabled={detail.leaderboardOffset === 0}
              onClick={() =>
                onPage(
                  Math.max(0, detail.leaderboardOffset - Math.max(1, detail.leaderboard.length)),
                )
              }
            >
              Previous
            </button>
            <button
              className="btn"
              type="button"
              disabled={
                detail.leaderboardOffset + detail.leaderboard.length >= detail.leaderboardTotal ||
                detail.leaderboard.length === 0
              }
              onClick={() => onPage(detail.leaderboardOffset + detail.leaderboard.length)}
            >
              Next
            </button>
          </div>
          <p className="campaign-small">
            Registered players with no qualifying entry stay at the bottom. Ties between
            participants use the earlier{' '}
            {detail.kind === 'five'
              ? 'meaningful final squad save'
              : 'confirmed final qualifying prediction'}
            .
            {detail.kind === 'predictions' && ' Ties in one block follow transaction/output order.'}
          </p>
        </section>
      )}
      {tab === 'rules' && (
        <div className="campaign-results-grid">
          <section className="campaign-panel campaign-rulebook">
            <h2>The game plan</h2>
            <h3>1. Join the competition</h3>
            <p>
              Registration is free. Join before {dateTime(detail.registrationClosesAt)}. You get a
              ranked entry immediately.
            </p>
            <h3>2. Make your picks</h3>
            <p>
              {detail.kind === 'five'
                ? `Use the existing Streak Five squad builder for ${detail.gameweek?.name ?? 'the selected gameweek'}. Picks lock ${dateTime(detail.gameweek?.lockAt ?? null)}.`
                : 'Only the listed fixtures count. Your first qualifying paid prediction per fixture earns 3 points for a correct result, or 0 for an incorrect or missed match. Stake size does not affect points. A pending payment is not yet a qualifying prediction.'}
            </p>
            <h3>3. Follow the table</h3>
            <p>
              Scores remain provisional until verified.{' '}
              {detail.kind === 'five'
                ? 'The earlier meaningful final squad save breaks a points tie.'
                : 'Earlier confirmed final qualifying prediction wins; ties in one block follow transaction/output order.'}{' '}
              Non-participants stay at the bottom.
            </p>
            <h3>4. Collect your award</h3>
            <p>
              {detail.rehearsal
                ? 'Rehearsal awards are test records. No mainnet rewards are paid and no payout addresses are collected.'
                : 'Final winners confirm a mainnet CKB receiving address. The organizer approves prize payments separately. Playing predictions uses testnet tCKB; these campaign prizes use mainnet CKB.'}
            </p>
          </section>
          <section className="campaign-panel campaign-prize-rules">
            <Trophy />
            <h2>{ckb(detail.prizeTotalShannons)} CKB</h2>
            <p>{detail.prizePlaces} winning places</p>
            <div className="campaign-award-list">
              {detail.draft.prizes.map((prize) => (
                <div key={prize.place}>
                  <strong>Place {prize.place}</strong>
                  <span>
                    {ckb(prize.amountShannons)} CKB
                    {prize.usdReference && <small>${prize.usdReference} reference</small>}
                  </span>
                </div>
              ))}
            </div>
            <p>
              Exact CKB amounts above are the published prizes. Dollar references do not change
              those amounts. Funds are controlled by the organizer's dedicated rewards wallet.
            </p>
          </section>
        </div>
      )}
      {person && (
        <Dialog title={person.name} onClose={() => setPerson(null)}>
          <div className="campaign-person-result">
            <strong>#{person.rank}</strong>
            <span>{person.points} points</span>
          </div>
          <p>
            {person.participated
              ? `Tie-break time: ${dateTime(person.tieBreakAt)}`
              : 'Registered with no qualifying entry. This player remains on the table.'}
          </p>
          {person.own && detail.kind === 'predictions' && <OwnCalls detail={detail} />}
        </Dialog>
      )}
    </>
  );
}
