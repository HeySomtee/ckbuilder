import { GameTestPanel } from '../games-test/panel';
import { gamesDataMode } from '../../lib/games-data';
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent, ReactNode, RefObject } from 'react';
import type { Account } from '../account/api';
import { actFive, loadFive, money, shannons } from './api';
import type { FiveData, FiveRound, Player } from './api';
import './five.css';
import './game.css';
import { useNow } from '../../lib/use-now';
import { Sponsorship } from './sponsorship';
import { SponsorAuction } from './auction';
import { RewardsPanel } from './rewards-panel';
import { loadScouting, loadSchedule } from './scouting-api';
import { FixtureRun } from '../../components/fixture-run';
import { PlayerProfile, compactNumber } from './player-profile';
import {
  BackToSquad,
  SponsorCredit,
  SponsorShowcase,
  WorkspaceTabs,
  type WorkspaceTab,
} from './workspace';
import './workspace.css';
const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const positions = ['FWD', 'MID', 'MID', 'DEF', 'GK'];
function Jersey({ player }: { player: Player }) {
  const palette = ['#a4c9d9', '#d87b77', '#aca1ce', '#7eaf99', '#d1bb82'];
  const color =
    palette[Array.from(player.teamId).reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
  return (
    <svg className="five-jersey" viewBox="0 0 80 80" aria-hidden="true">
      <path
        d="M24 7L7 20 17 38 26 33 23 72Q40 78 57 72L54 33 63 38 73 20 56 7Q40 19 24 7Z"
        fill={color}
      />
      <path d="M24 7Q40 25 56 7" fill="none" stroke="#eef0e8" strokeWidth="3" />
      <image href="/ckb-mark.png" x="46" y="24" width="9" height="9" />
      <text x="40" y="51" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">
        {player.team.slice(0, 3).toUpperCase()}
      </text>
    </svg>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null),
    titleId = useId();
  useEffect(() => {
    const origin = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  return (
    <dialog
      className="five-dialog"
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Rulebook() {
  return (
    <div className="five-rulebook">
      <p>
        Pick 1 goalkeeper, 1 defender, 2 midfielders and 1 forward within 40 credits. Maximum two
        players per club. Your captain scores double, including deductions.
      </p>
      <p>
        Appearance: 1 point, or 2 for 60+ minutes. Goals: GK/DEF 6, MID 5, FWD 4. Assists: 3. Clean
        sheets after 60 minutes: GK/DEF 4, MID 1. Goalkeepers: 1 per 3 saves, 5 per penalty saved.
        GK/DEF lose 1 per 2 conceded. Yellow −1, red −3, own goal −2, missed penalty −2.
      </p>
      <p>
        One eligible fixture per player. No substitutes. Confirmed non-appearance is zero; missing
        data remains pending. Squads stay private until the deadline. One entry per account and
        wallet does not prove one person.
      </p>
      <p>
        Sponsored rounds share only their confirmed pool among the configured top percentage of
        entries, rounded up, including everyone tied at the cutoff. Only positive final scores
        qualify. Rewards are proportional to qualifying points; sub-shannon rounding stays in the
        pool. No qualifiers means no allocation. Free rounds remain playable without a sponsor.
      </p>
      <p>
        Testnet only. No cash value. Player scores are provisional until verified results are
        finalized after the correction window. Finalized awards do not change. Streak holds
        sponsored funds in a dedicated testnet rewards wallet and covers payout network fees.
        Cancelled rounds or rounds without a qualifying winner return contributions as claimable
        balances. Small balances accumulate until they reach the wallet cell minimum.
      </p>
      <p>
        Sponsor auctions combine each wallet’s funded top-ups. The highest total wins; the earliest
        accepted total wins a tie. Bidding closes at the squad deadline, with 30 minutes for 24
        chain confirmations. Losing and late-confirming bids are refunded automatically. Only the
        winning bid funds the pool. Existing community-funded gameweeks keep their original
        contribution rules.
      </p>
    </div>
  );
}
function Builder({
  round,
  pending,
  onSave,
  onSignIn,
  authenticated,
  scoutingAvailable,
  now,
  squadControl,
}: {
  squadControl: RefObject<(() => void) | null>;
  now: number;
  scoutingAvailable: boolean;
  round: FiveRound;
  pending: boolean;
  onSave: (players: string[], captain: string) => Promise<void>;
  onSignIn: () => void;
  authenticated: boolean;
}) {
  const own = round.entries.find((e) => e.id === round.ownId);
  const [ids, setIds] = useState<string[]>(own?.players ?? []),
    [captain, setCaptain] = useState(own?.captain ?? '');
  const [filter, setFilter] = useState('ALL'),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('form');
  const [profile, setProfile] = useState<Player | null>(null),
    [mobilePanel, setMobilePanel] = useState('squad'),
    [captainPicker, setCaptainPicker] = useState(false);
  const squadButton = useRef<HTMLButtonElement>(null);
  const backToSquad = () => {
    setProfile(null);
    setCaptainPicker(false);
    setMobilePanel('squad');
    requestAnimationFrame(() => {
      squadButton.current?.focus();
      squadButton.current?.scrollIntoView({ block: 'nearest' });
    });
  };
  useImperativeHandle(squadControl, () => backToSquad);
  const scout = useQuery({
    queryKey: ['five-scouting', gamesDataMode],
    queryFn: ({ signal }) => loadScouting(signal),
    enabled: scoutingAvailable,
    staleTime: 60000,
    retry: 1,
  });
  const stats = new Map(scout.data?.players.map((p) => [p.id, p]));
  const schedule = useQuery({
    queryKey: ['five-fixture-outlook', gamesDataMode],
    queryFn: ({ signal }) => loadSchedule(signal),
    enabled: scoutingAvailable,
    staleTime: 60000,
    retry: false,
  });
  const [error, setError] = useState(''),
    [review, setReview] = useState(false),
    [limit, setLimit] = useState(40);
  const selected = ids
    .map((id) => round.terms.players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const cost = selected.reduce((n, p) => n + p.cost, 0),
    locked = round.state !== 'open' || now >= Date.parse(round.terms.lockAt);
  const complete = selected.length === 5 && ids.includes(captain) && cost <= 400;
  const unchanged =
    !!own &&
    captain === own.captain &&
    ids.length === own.players?.length &&
    ids.every((id) => own.players?.includes(id));
  const missing =
    selected.length < 5
      ? `Pick ${5 - selected.length} more player${selected.length === 4 ? '' : 's'} to complete your five.`
      : !ids.includes(captain)
        ? 'Choose a captain before saving your five.'
        : cost > 400
          ? 'Your squad exceeds the 40-credit budget.'
          : '';
  const choose = (p: Player) => {
    if (locked || pending) return;
    setError('');
    if (ids.includes(p.id)) {
      setIds(ids.filter((id) => id !== p.id));
      if (captain === p.id) setCaptain('');
      return;
    }
    if (
      selected.filter((q) => q.position === p.position).length >= (p.position === 'MID' ? 2 : 1)
    ) {
      setError(`Your ${p.position} slots are full. Remove a player to swap.`);
      return;
    }
    if (cost + p.cost > 400) {
      setError('This player would take you over 40 credits.');
      return;
    }
    if (selected.filter((q) => q.teamId === p.teamId).length >= 2) {
      setError('Choose no more than two players from a club.');
      return;
    }
    setIds([...ids, p.id]);
  };
  const shown = round.terms.players
    .filter(
      (p) =>
        (filter === 'ALL' || p.position === filter) &&
        `${p.name} ${p.team}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === 'price') return a.cost - b.cost;
      if (sort === 'name') return a.name.localeCompare(b.name);
      const av = stats.get(a.id),
        bv = stats.get(b.id);
      const field =
        sort === 'points'
          ? 'totalPoints'
          : sort === 'in'
            ? 'transfersIn'
            : sort === 'out'
              ? 'transfersOut'
              : 'form';
      return (bv?.[field] ?? 0) - (av?.[field] ?? 0) || a.name.localeCompare(b.name);
    });
  const used = new Set<string>();
  return (
    <div className="five-builder" data-mobile-panel={mobilePanel}>
      <div className="five-builder-toolbar">
        <nav aria-label="Team builder view">
          <button
            ref={squadButton}
            aria-pressed={mobilePanel === 'squad'}
            onClick={() => setMobilePanel('squad')}
          >
            My five <b>{ids.length}/5</b>
          </button>
          <button
            aria-pressed={mobilePanel === 'players'}
            onClick={() => setMobilePanel('players')}
          >
            Players
          </button>
        </nav>
        <div>
          <span>
            Bank <b>{((400 - cost) / 10).toFixed(1)}</b>
          </span>
          <span>
            Captain <b>{selected.find((p) => p.id === captain)?.name ?? 'Choose'}</b>
          </span>
        </div>
      </div>
      {error && (
        <div className="five-message five-builder-error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <section className="five-squad">
        <div className="glass five-pitch-card">
          <header>
            <div>
              <p className="eyebrow">YOUR TEAM SHEET</p>
              <h2>My squad</h2>
            </div>
            <span className="five-tag">{locked ? 'Locked' : `${ids.length} / 5`}</span>
          </header>
          <div className="five-pitch">
            {positions.map((pos, i) => {
              const p = selected.find((p) => p.position === pos && !used.has(p.id));
              if (p) used.add(p.id);
              return (
                <div className={`five-slot slot-${i}`} data-position={pos} key={i}>
                  {p ? (
                    <>
                      <button
                        className="five-pitch-player"
                        aria-label={'View ' + p.name + ' profile'}
                        onClick={() => setProfile(p)}
                      >
                        <Jersey player={p} />
                        <strong>{p.name}</strong>
                      </button>
                      <small>
                        {p.position} · {(p.cost / 10).toFixed(1)} CR
                      </small>
                      <button
                        className={`five-captain ${captain === p.id ? 'selected' : ''}`}
                        aria-label={`Captain ${p.name}`}
                        aria-pressed={captain === p.id}
                        disabled={locked || pending}
                        onClick={() => setCaptain(p.id)}
                      >
                        C
                      </button>
                      <button
                        className="five-remove"
                        aria-label={`Remove ${p.name}`}
                        disabled={locked || pending}
                        onClick={() => choose(p)}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <button
                      className="five-empty"
                      disabled={locked}
                      onClick={() => {
                        setFilter(pos);
                        setMobilePanel('players');
                        requestAnimationFrame(() =>
                          document.getElementById('five-search')?.focus(),
                        );
                      }}
                    >
                      <span>+</span>
                      {pos}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!locked && (
            <div className="five-captain-guide">
              <span className="five-captain-token">C</span>
              <div>
                <strong>
                  {ids.includes(captain)
                    ? `${selected.find((p) => p.id === captain)?.name} wears the armband`
                    : 'One more call: choose your captain'}
                </strong>
                <p>Tap C beside a shirt. Double points, including deductions.</p>
              </div>
              <button
                type="button"
                disabled={!selected.length || pending}
                onClick={() => setCaptainPicker(true)}
              >
                {ids.includes(captain) ? 'Change' : 'Choose'}
              </button>
            </div>
          )}
        </div>
        <div className="glass five-budget">
          <div>
            <span>Budget remaining</span>
            <strong>
              {((400 - cost) / 10).toFixed(1)} <small>/ 40 credits</small>
            </strong>
          </div>
          <button
            className="btn primary"
            disabled={pending || locked || !complete || unchanged}
            aria-describedby="five-save-hint"
            onClick={() => (authenticated ? setReview(true) : onSignIn())}
          >
            {pending ? (
              <>
                <span className="five-spinner" />
                Saving your five
              </>
            ) : locked ? (
              'Squad locked'
            ) : authenticated ? (
              own ? (
                unchanged ? (
                  'Changes saved'
                ) : (
                  'Save changes'
                )
              ) : (
                'Review your five'
              )
            ) : (
              'Sign in to save'
            )}
          </button>
          <p id="five-save-hint" role="status">
            {locked
              ? 'Picks are locked for this gameweek.'
              : missing ||
                (unchanged
                  ? 'All changes saved.'
                  : own
                    ? 'Your previous team stays entered until you save these changes.'
                    : 'Five picked. Captain chosen. You are ready.')}
          </p>
          <small>Free entry. No wallet payment.</small>
        </div>
        {review && (
          <Modal
            title={own ? 'Save your changes?' : 'Your five, ready to go.'}
            onClose={() => setReview(false)}
          >
            {selected.map((p) => (
              <div className="five-summary-row" key={p.id}>
                <span>
                  {p.name}
                  {captain === p.id ? ' · Captain ×2' : ''}
                  <small>
                    {p.team} · {p.position}
                  </small>
                </span>
                <strong>{(p.cost / 10).toFixed(1)}</strong>
              </div>
            ))}
            <p>Entries close {date(round.terms.lockAt)}. Your squad stays private until then.</p>
            <button
              className="btn primary"
              disabled={pending}
              onClick={async () => {
                setError('');
                try {
                  await onSave(ids, captain);
                  setReview(false);
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : 'Unable to save. Your draft is retained.',
                  );
                }
              }}
            >
              {pending ? (
                <>
                  <span className="five-spinner" />
                  Saving your five
                </>
              ) : own ? (
                'Save changes'
              ) : (
                'Save my five'
              )}
            </button>
            {error && <p role="alert">{error}</p>}
          </Modal>
        )}
        {captainPicker && (
          <Modal title="Who gets the armband?" onClose={() => setCaptainPicker(false)}>
            <p>Choose one of your five. Your captain scores double, including deductions.</p>
            {selected.map((player) => (
              <button
                className="five-captain-option"
                key={player.id}
                disabled={locked || pending}
                aria-pressed={captain === player.id}
                onClick={() => {
                  setCaptain(player.id);
                  setCaptainPicker(false);
                }}
              >
                <span>
                  {player.name}
                  <small>{player.position}</small>
                </span>
                <strong>{captain === player.id ? 'Captain' : 'Make captain'}</strong>
              </button>
            ))}
            <BackToSquad onClick={backToSquad} />
          </Modal>
        )}
      </section>
      <section className="glass five-scout">
        <BackToSquad onClick={backToSquad} />
        <header>
          <p className="eyebrow">THE SCOUTING ROOM</p>
          <h2>Player market</h2>
        </header>
        <input
          id="five-search"
          aria-label="Search players"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(40);
          }}
          placeholder="Search a player or club"
        />
        <div className="five-filters">
          <div>
            {['ALL', 'GK', 'DEF', 'MID', 'FWD'].map((p) => (
              <button
                key={p}
                aria-pressed={filter === p}
                onClick={() => {
                  setFilter(p);
                  setLimit(40);
                }}
              >
                {p === 'ALL' ? 'All' : p}
              </button>
            ))}
          </div>
          <select aria-label="Sort players" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="form">Highest form</option>
            <option value="points">Total points</option>
            <option value="in">Transfers in</option>
            <option value="out">Transfers out</option>
            <option value="price">Lowest price</option>
            <option value="name">Name</option>
          </select>
        </div>
        {scout.isPending && scoutingAvailable && (
          <p className="five-scout-status" role="status">
            <span className="five-spinner" />
            Updating player stats
          </p>
        )}
        {scout.isError && (
          <p className="five-scout-status" role="status">
            Scouting stats are delayed. Your squad is available.{' '}
            <button onClick={() => void scout.refetch()}>Retry stats</button>
          </p>
        )}
        <div className="five-player-heading">
          <span>PLAYER</span>
          <span>CR</span>
          <span>FORM</span>
          <span>PTS</span>
          <span>IN</span>
          <span>OUT</span>
          <span />
        </div>
        {schedule.isError && (
          <p className="five-scout-status" role="status">
            Fixture outlook is delayed.{' '}
            <button onClick={() => void schedule.refetch()}>Retry fixtures</button>
          </p>
        )}
        <div className="five-player-list">
          {shown.slice(0, limit).map((p) => {
            const stat = stats.get(p.id);
            return (
              <div className="five-player" key={p.id}>
                <button
                  className="five-player-info"
                  aria-label={'View ' + p.name + ' profile'}
                  onClick={() => setProfile(p)}
                >
                  <Jersey player={p} />
                  <span>
                    <strong>
                      {p.name}
                      {stat && stat.status !== 'a' && (
                        <i
                          className="five-availability-dot"
                          title={stat.news || 'Availability concern'}
                        />
                      )}
                    </strong>
                    <small>
                      {stat?.teamCode ?? p.team} · {p.position}
                    </small>
                    {schedule.isPending && scoutingAvailable ? (
                      <span className="five-fixture-loading" aria-label="Loading next fixtures">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <FixtureRun fixtures={schedule.data?.teams[p.teamId] ?? []} />
                    )}
                  </span>
                </button>
                <b className="five-price" data-label="CR">
                  {(p.cost / 10).toFixed(1)}
                </b>
                <span className="five-stat" data-label="Form">
                  {stat?.form.toFixed(1) ?? '–'}
                </span>
                <span className="five-stat" data-label="Pts">
                  {stat?.totalPoints ?? '–'}
                </span>
                <span className="five-stat transfer-in" data-label="In">
                  {stat ? compactNumber(stat.transfersIn) : '–'}
                </span>
                <span className="five-stat transfer-out" data-label="Out">
                  {stat ? compactNumber(stat.transfersOut) : '–'}
                </span>
                <button
                  className="five-add"
                  aria-label={(ids.includes(p.id) ? 'Remove' : 'Add') + ' ' + p.name}
                  disabled={locked || pending}
                  onClick={() => choose(p)}
                >
                  {ids.includes(p.id) ? '✓' : '+'}
                </button>
              </div>
            );
          })}
          {!shown.length && <p>No players match this search.</p>}
        </div>
        {shown.length > limit && (
          <button onClick={() => setLimit(limit + 40)}>Show more players</button>
        )}
        <footer>
          {round.terms.players.length} players · Prices fixed this round. Form, points and transfers
          are FPL scouting stats; Five scoring is separate.
        </footer>
      </section>
      {profile && (
        <Modal title={profile.name} onClose={() => setProfile(null)}>
          <PlayerProfile
            player={profile}
            selected={ids.includes(profile.id)}
            canSelect={!locked && !pending}
            onSelect={() => {
              choose(profile);
              setProfile(null);
            }}
          />
          <BackToSquad onClick={backToSquad} />
        </Modal>
      )}
    </div>
  );
}
function Admin({
  data,
  onAction,
  pending,
  onClose,
}: {
  data: FiveData;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  pending: boolean;
  onClose: () => void;
}) {
  const r = data.detail;
  const [draftId] = useState(() => crypto.randomUUID());
  const [event, setEvent] = useState(1),
    [json, setJson] = useState(''),
    [error, setError] = useState('');
  const [name, setName] = useState(r?.terms.name ?? ''),
    [limit, setLimit] = useState(r?.terms.limit ?? 100),
    [percent, setPercent] = useState((r?.terms.qualifyingBps ?? 500) / 100);
  const [sponsorship, setSponsorship] = useState(r?.terms.sponsorship ?? false),
    [minimum, setMinimum] = useState(
      r ? money(r.terms.minimumShannons).replaceAll(',', '') : '100',
    );
  const [sponsorshipMode, setSponsorshipMode] = useState(r?.terms.sponsorshipMode ?? 'community');
  const run = async (body: Record<string, unknown>) => {
    setError('');
    try {
      await onAction(body);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save. Your draft is retained.');
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (r?.state === 'draft')
        run({
          action: 'edit',
          id: r.id,
          revision: r.revision,
          terms: {
            ...r.terms,
            name,
            limit,
            qualifyingBps: Math.round(percent * 100),
            sponsorship,
            sponsorshipMode,
            minimumShannons: shannons(minimum),
          },
        });
      else run({ action: 'create', id: draftId, terms: JSON.parse(json) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the gameweek details.');
    }
  };
  return (
    <Modal
      title={r?.state === 'draft' ? 'Set up this gameweek' : 'Create a gameweek'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="five-admin-form">
        {r?.state === 'draft' ? (
          <>
            <label>
              Gameweek name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                required
              />
            </label>
            <div className="five-form-grid">
              <label>
                Entry limit
                <input
                  type="number"
                  min="2"
                  max="1000"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </label>
              <label>
                Winning percentage
                <input
                  type="number"
                  min="1"
                  max="50"
                  step=".01"
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="five-checkbox">
              <input
                type="checkbox"
                checked={sponsorship}
                onChange={(e) => setSponsorship(e.target.checked)}
              />
              Allow community sponsorship
            </label>
            {sponsorship && (
              <label>
                Sponsorship format
                <select
                  value={sponsorshipMode}
                  onChange={(e) => setSponsorshipMode(e.target.value as 'community' | 'auction')}
                >
                  <option value="auction">Highest bidder wins</option>
                  <option value="community">Shared community contributions</option>
                </select>
              </label>
            )}
            <label>
              Minimum contribution (tCKB)
              <input
                inputMode="decimal"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
            </label>
            <p>
              Sponsorship is optional. Transfers become available when the dedicated rewards worker
              is active. Logos and public recognition are optional.
            </p>
            <p>
              Entry deadline: {date(r.terms.lockAt)}. Terms and prices become fixed when published.
            </p>
            <button className="btn primary" disabled={pending}>
              Save settings
            </button>
          </>
        ) : (
          <>
            <p>
              Import an upcoming EPL gameweek from an approved data source, then review the frozen
              catalogue and rules before publishing.
            </p>
            <label>
              FPL gameweek
              <input
                type="number"
                min="1"
                max="38"
                value={event}
                onChange={(e) => setEvent(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!data.feedAvailable || pending}
              onClick={() => run({ action: 'import', id: draftId, event })}
            >
              Import player catalogue
            </button>
            {!data.feedAvailable && (
              <p>FPL access is not enabled. Configure approved data access before importing.</p>
            )}
            <details>
              <summary>Import your own licensed catalogue</summary>
              <label>
                Gameweek manifest (JSON)
                <textarea
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  maxLength={500000}
                  rows={8}
                  required
                />
              </label>
              <p>
                Include terms, deadlines and player prices. No sample player data is supplied as a
                production fallback.
              </p>
              <button className="btn" disabled={pending}>
                Create draft
              </button>
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
export default function FivePage({
  account,
  accountReady,
  onSignIn,
  signInPending,
}: {
  account: Account | null;
  accountReady: boolean;
  onSignIn: () => void;
  signInPending: boolean;
}) {
  const [tab, setTab] = useState<WorkspaceTab>('team');
  const squadControl = useRef<(() => void) | null>(null);
  const [sponsorRound, setSponsorRound] = useState<FiveRound | null>(null);
  const backToTeam = () => {
    setTab('team');
    squadControl.current?.();
    requestAnimationFrame(() => {
      document.getElementById('five-tab-team')?.focus();
      document.getElementById('five-tab-team')?.scrollIntoView({ block: 'nearest' });
    });
  };
  const client = useQueryClient(),
    [selection, setSelection] = useState(''),
    [modal, setModal] = useState<
      'rules' | 'admin' | 'scores' | 'finalize' | 'sponsor' | 'cancel' | null
    >(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState(''),
    [rawScores, setRawScores] = useState(''),
    [scoreSource, setScoreSource] = useState(''),
    [complete, setComplete] = useState(false);
  const identity = account?.id ?? 'guest';
  const key = ['private', 'five', identity, selection, gamesDataMode];
  const clock = useNow(true),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const data = await loadFive(selection, signal);
      if ((data.viewerId ?? 'guest') !== identity)
        throw Error('Your sign-in changed. Refresh before continuing.');
      return data;
    },
    enabled: accountReady,
    staleTime: 15000,
    retry: 1,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: async (v: {
      body: Record<string, unknown>;
      key: string[];
      identity: string;
      selection: string;
    }) => {
      const data = await actFive(v.body);
      if ((data.viewerId ?? 'guest') !== v.identity)
        throw Error('Your sign-in changed. Refresh before continuing.');
      return data;
    },
    onSuccess: (data, v) => {
      if (!live.current) return;
      client.setQueryData(v.key, data);
      if (selection === v.selection && identity === v.identity)
        setMessage(v.body.action === 'enter' ? '' : 'Saved. Your gameweek is up to date.');
      if (
        v.body.action === 'testControl' &&
        v.body.control === 'start' &&
        selection === v.selection &&
        identity === v.identity
      )
        setSelection(data.detail?.id ?? '');
      void client.invalidateQueries({ queryKey: ['private', 'five', v.identity] });
    },
    onError: (error, v) => {
      if (live.current && identity === v.identity && selection === v.selection)
        setMessage(error.message);
    },
  });
  const data = query.data,
    r = data?.detail;
  const activeSponsorRound = r?.id === sponsorRound?.id ? r : sponsorRound;
  const openSponsorship = () => {
    if (!account) {
      onSignIn();
      return;
    }
    if (r) {
      setSponsorRound(r);
      setModal('sponsor');
    }
  };
  const actionAsync = async (body: Record<string, unknown>) => {
    await mutation.mutateAsync({ body, key, identity, selection });
  };
  const action = (body: Record<string, unknown>) =>
    mutation.mutate({ body, key, identity, selection });
  const [modalError, setModalError] = useState('');
  const modalAction = async (body: Record<string, unknown>) => {
    setModalError('');
    try {
      await actionAsync(body);
      if (live.current) setModal(null);
    } catch (e) {
      if (live.current)
        setModalError(e instanceof Error ? e.message : 'Unable to save. Your inputs are retained.');
    }
  };
  const serverNow = data ? Date.parse(data.now) + Math.max(0, clock - query.dataUpdatedAt) : 0;
  return (
    <div
      className="five-page"
      onClickCapture={(event) => {
        // WebKit does not focus pointer-activated buttons; preserve the real dialog opener.
        if (event.target instanceof Element) event.target.closest('button')?.focus();
      }}
    >
      <header className="five-page-heading">
        <div>
          <p className="eyebrow">PREMIER LEAGUE · FANTASY</p>
          <h1>
            Streak <em>Five.</em>
          </h1>
        </div>
        {gamesDataMode === 'test' && <span className="five-test-indicator">Test playground</span>}
      </header>
      <WorkspaceTabs value={tab} onChange={setTab} />
      <section
        id="five-panel-more"
        role="tabpanel"
        aria-labelledby="five-tab-more"
        hidden={tab !== 'more'}
      >
        <BackToSquad onClick={backToTeam} />{' '}
        <GameTestPanel
          admin={data?.admin === true}
          game="five"
          id={r?.id}
          state={r?.state}
          busy={mutation.isPending}
          run={action}
        />
        <div className="five-actions">
          <button className="btn" onClick={() => setModal('rules')}>
            How it works
          </button>
          {data?.admin && !data.testMode && (
            <button className="btn primary" onClick={() => setModal('admin')}>
              {data.automation?.enabled
                ? 'Gameweek controls'
                : r?.state === 'draft'
                  ? 'Manage draft'
                  : '+ Create gameweek'}
            </button>
          )}
        </div>
        {data && r && (
          <>
            {' '}
            {data.admin && !data.testMode && !data.automation?.enabled && (
              <div className="five-admin-bar">
                {r.state === 'draft' ? (
                  <button
                    className="btn primary"
                    disabled={mutation.isPending}
                    onClick={() => action({ action: 'publish', id: r.id, termsHash: r.termsHash })}
                  >
                    Publish gameweek
                  </button>
                ) : r.state !== 'final' && r.state !== 'cancelled' ? (
                  <>
                    <button
                      className="btn"
                      disabled={mutation.isPending || r.state === 'open' || !data.feedAvailable}
                      onClick={() => action({ action: 'sync', id: r.id })}
                    >
                      Refresh player scores
                    </button>
                    <button
                      className="btn"
                      disabled={mutation.isPending || r.state === 'open'}
                      onClick={() => setModal('scores')}
                    >
                      Import score revision
                    </button>
                    <button
                      className="btn"
                      disabled={mutation.isPending || r.state === 'open'}
                      onClick={() => setModal('finalize')}
                    >
                      Finalize round
                    </button>
                  </>
                ) : null}
                <button
                  className="btn"
                  disabled={mutation.isPending || r.state === 'final' || r.state === 'cancelled'}
                  onClick={() => setModal('cancel')}
                >
                  Cancel gameweek
                </button>
                <small>
                  Rules are fixed after publishing. Scores remain provisional until finalization.
                </small>
              </div>
            )}
          </>
        )}
      </section>
      {data?.automation?.enabled && data.automation.state === 'delayed' && (
        <div className="five-message" role="status">
          {data.automation.message}
        </div>
      )}
      {message && (
        <div className="five-message" role="status">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
      {query.isPending && (
        <div className="five-loading" role="status">
          <span className="five-spinner" />
          Loading gameweeks
        </div>
      )}
      {query.error && (
        <div className="glass five-empty-state">
          <h2>Let’s get your team sheet back.</h2>
          <p>{query.error.message}</p>
          <button className="btn" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {data && !r && (
        <section className="glass five-empty-state">
          <p className="eyebrow">A NEW WAY TO PLAY THE WEEKEND</p>
          <h2>The next five starts here.</h2>
          <p>
            {data.automation?.enabled
              ? 'The next EPL gameweek is being prepared automatically. Your team sheet will appear here when the schedule is ready.'
              : 'No gameweek is open yet. Entry is free, with or without a sponsor.'}
          </p>
          {!account && (
            <button className="btn" disabled={signInPending} onClick={onSignIn}>
              Sign in
            </button>
          )}
        </section>
      )}
      {data && r && (
        <>
          <div className="five-round-bar">
            <label>
              <span className="sr-only">Gameweek</span>
              <select
                aria-label="Gameweek"
                value={r.id}
                onChange={(e) => {
                  setSelection(e.target.value);
                  setMessage('');
                }}
              >
                {data.rounds.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} · {q.state}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {r.entries.length} / {r.terms.limit} entries
            </span>
            <span>
              {r.state === 'open'
                ? `Pick by ${date(r.terms.lockAt)}`
                : r.state === 'final'
                  ? 'Final scores'
                  : r.state === 'draft'
                    ? 'Draft · only admins can see this'
                    : 'Squads locked'}
            </span>
          </div>
          <section
            id="five-panel-team"
            role="tabpanel"
            aria-labelledby="five-tab-team"
            hidden={tab !== 'team'}
          >
            <SponsorCredit round={r} onOpen={() => setTab('sponsors')} />{' '}
            <Builder
              squadControl={squadControl}
              now={serverNow}
              scoutingAvailable={data.feedAvailable}
              key={`${identity}:${r.id}`}
              round={r}
              pending={mutation.isPending}
              authenticated={!!account}
              onSignIn={onSignIn}
              onSave={(players, captain) =>
                actionAsync({ action: 'enter', id: r.id, players, captain, termsHash: r.termsHash })
              }
            />
          </section>
          <section
            id="five-panel-standings"
            role="tabpanel"
            aria-labelledby="five-tab-standings"
            hidden={tab !== 'standings'}
          >
            <BackToSquad onClick={backToTeam} />{' '}
            <section className="glass five-standings">
              <header>
                <p className="eyebrow">THE WEEKEND TABLE</p>
                <h2>{r.state === 'final' ? 'Final standings' : 'Leaderboard'}</h2>
                <small>
                  {r.scoreRevision
                    ? `Score revision ${r.scoreRevision} · ${r.scoresAt ? date(r.scoresAt) : ''}`
                    : 'Scores appear after the deadline.'}
                </small>
              </header>
              {r.standings.length ? (
                r.standings.map((e, i) => (
                  <details className="five-standing-detail" key={e.id}>
                    <summary className={`five-standing ${e.id === r.ownId ? 'own' : ''}`}>
                      <span>{i + 1}</span>
                      <strong>
                        {e.name}
                        {e.id === r.ownId ? ' · You' : ''}
                      </strong>
                      <span>{e.pending ? 'Pending' : `${e.points} pts`}</span>
                      {r.state === 'final' && BigInt(r.rewards[e.id] ?? '0') > 0n && (
                        <small>{money(r.rewards[e.id])} tCKB allocated</small>
                      )}
                    </summary>
                    <div className="five-score-breakdown">
                      {r.entries
                        .find((entry) => entry.id === e.id)
                        ?.players?.map((id) => {
                          const player = r.terms.players.find((p) => p.id === id),
                            score = r.scores[id];
                          const captain =
                            r.entries.find((entry) => entry.id === e.id)?.captain === id;
                          return (
                            <div key={id}>
                              <strong>
                                {player?.name ?? 'Player'}
                                {captain ? ' · Captain ×2' : ''}
                              </strong>
                              <span>
                                {score
                                  ? `${score.points * (captain ? 2 : 1)} pts`
                                  : 'Awaiting confirmed statistics'}
                              </span>
                              {score && (
                                <small>
                                  {score.lines
                                    .map((l) => `${l.label} ${l.points > 0 ? '+' : ''}${l.points}`)
                                    .join(' · ')}
                                </small>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </details>
                ))
              ) : (
                <p>
                  {r.entries.length
                    ? 'Squads and standings stay private until the gameweek locks.'
                    : 'Be the first to put your football instinct on the team sheet.'}
                </p>
              )}
            </section>
          </section>
          <section
            id="five-panel-sponsors"
            role="tabpanel"
            aria-labelledby="five-tab-sponsors"
            hidden={tab !== 'sponsors'}
          >
            <BackToSquad onClick={backToTeam} />{' '}
            {r.auction ? (
              <SponsorAuction round={r} available={data.fundingAvailable} onBid={openSponsorship} />
            ) : (
              <section className="five-prize glass">
                <div>
                  <p className="eyebrow">
                    {r.poolShannons === '0'
                      ? 'PLAY FOR THE FOOTBALL'
                      : 'COMMUNITY-FUNDED PRIZE POOL'}
                  </p>
                  <h2>
                    {r.poolShannons === '0' ? 'Free to play' : `${money(r.poolShannons)} tCKB`}
                  </h2>
                  <p>
                    {r.poolShannons === '0'
                      ? 'No prize pool yet. Sponsor the gameweek to add one.'
                      : `Top ${r.terms.qualifyingBps / 100}% share the pool in proportion to their final points. Cutoff ties qualify.`}
                  </p>
                </div>
                {r.terms.sponsorship && (
                  <button
                    className="btn"
                    onClick={openSponsorship}
                    disabled={!data.fundingAvailable || r.state !== 'open'}
                  >
                    Sponsor this gameweek
                  </button>
                )}
                <small>Testnet · No cash value</small>
              </section>
            )}
            <SponsorShowcase round={r} />
          </section>
          <section
            id="five-panel-activity"
            role="tabpanel"
            aria-labelledby="five-tab-activity"
            hidden={tab !== 'activity'}
          >
            <BackToSquad onClick={backToTeam} />{' '}
            <RewardsPanel
              data={data}
              pending={mutation.isPending}
              action={action}
              onContinue={openSponsorship}
            />
            {!r.ownSponsorships.length && !data.rewardsAccount && (
              <p className="five-message">
                Your sponsor bids, confirmations and rewards will appear here.
              </p>
            )}
          </section>
        </>
      )}
      {modal === 'sponsor' && activeSponsorRound && account && (
        <Modal
          title={activeSponsorRound.auction ? 'Bid for the sponsor spot' : 'Sponsor this gameweek'}
          onClose={() => setModal(null)}
        >
          <Sponsorship
            key={`${identity}:${activeSponsorRound.id}`}
            round={activeSponsorRound}
            account={account}
            onData={(data) => {
              if (data.viewerId !== account.id)
                throw Error('Your sign-in changed. Refresh before continuing.');
              if (!live.current) return;
              if (data.detail)
                client.setQueryData(
                  ['private', 'five', account.id, data.detail.id, gamesDataMode],
                  data,
                );
              void client.invalidateQueries({ queryKey: ['private', 'five', account.id] });
            }}
          />
          <BackToSquad
            onClick={() => {
              setModal(null);
              backToTeam();
            }}
          />
        </Modal>
      )}
      {modal === 'cancel' && r && (
        <Modal title="Cancel this gameweek?" onClose={() => setModal(null)}>
          <p>
            Entries close immediately. Confirmed contributions become claimable refunds; pending
            payments are still reconciled. This cannot be undone.
          </p>
          <label>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={240} />
          </label>
          <button
            className="btn primary"
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => void modalAction({ action: 'cancel', id: r.id, reason })}
          >
            Confirm cancellation
          </button>
          {modalError && <p role="alert">{modalError}</p>}
        </Modal>
      )}
      {modal === 'rules' && (
        <Modal title="Small squad. Clear rules." onClose={() => setModal(null)}>
          <Rulebook />
        </Modal>
      )}
      {modal === 'admin' && data && !data.automation?.enabled && (
        <Admin
          data={data}
          onAction={actionAsync}
          pending={mutation.isPending}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'admin' && data?.automation?.enabled && (
        <Modal title="Gameweek controls" onClose={() => setModal(null)}>
          <div className="five-admin-form">
            <p>
              EPL gameweeks open, lock, update and finalize automatically. No player imports or
              weekly publishing needed.
            </p>
            <p>
              Each new round is free, with an optional sponsor auction. The highest funded total
              wins and funds the prize pool; other bids are refunded automatically. The top 5% share
              the pool and the minimum top-up is 100 tCKB. Rules and player prices freeze when the
              round opens. Previously opened community-funded rounds keep their rules.
            </p>
            <p>
              Last schedule check:{' '}
              {data.automation.lastSyncedAt ? date(data.automation.lastSyncedAt) : 'Checking'}
            </p>
            {r && (
              <button
                className="btn"
                disabled={r.state === 'final' || r.state === 'cancelled'}
                onClick={() => setModal('cancel')}
              >
                Cancel gameweek
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === 'scores' && r && (
        <Modal title="Import a score revision" onClose={() => setModal(null)}>
          <form
            className="five-admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                void modalAction({
                  action: 'scores',
                  id: r.id,
                  stats: JSON.parse(rawScores),
                  source: scoreSource,
                  complete,
                });
              } catch {
                setModalError('The score file is not valid JSON.');
              }
            }}
          >
            <p>
              Import verified match statistics keyed by player ID. Missing players stay pending;
              this replaces the previous snapshot.
            </p>
            <label>
              Source and revision
              <input
                required
                value={scoreSource}
                onChange={(e) => setScoreSource(e.target.value)}
                maxLength={240}
              />
            </label>
            <label>
              Player statistics JSON
              <textarea
                rows={8}
                required
                value={rawScores}
                onChange={(e) => setRawScores(e.target.value)}
                maxLength={500000}
              />
            </label>
            <label className="five-checkbox">
              <input
                type="checkbox"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
              />
              All eligible fixtures and records are final
            </label>
            <button className="btn primary" disabled={mutation.isPending}>
              Save score revision
            </button>
            {modalError && <p role="alert">{modalError}</p>}
          </form>
        </Modal>
      )}
      {modal === 'finalize' && r && (
        <Modal title="Finalize this gameweek?" onClose={() => setModal(null)}>
          <p>
            This freezes the scores and prize allocation. Review all player records first. Earliest
            finalization: {date(r.terms.finalizeAfter)}.
          </p>
          <p>
            {r.scoresComplete
              ? 'The current snapshot is marked complete.'
              : 'The current snapshot is incomplete and cannot be finalized.'}
          </p>
          <button
            className="btn primary"
            disabled={!r.scoresComplete || mutation.isPending}
            onClick={() => {
              void modalAction({ action: 'finalize', id: r.id, revision: r.revision });
            }}
          >
            Confirm final scores
          </button>
          {modalError && <p role="alert">{modalError}</p>}
        </Modal>
      )}
    </div>
  );
}
