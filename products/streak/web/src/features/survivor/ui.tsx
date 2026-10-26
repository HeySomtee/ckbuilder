import { GameTestPanel } from '../games-test/panel';
import { gamesDataMode } from '../../lib/games-data';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import type { Account } from '../account/api';
import { Icon } from '../../components/icon';
import { FixtureRun } from '../../components/fixture-run';
import { actSurvivor, decimalAmount, loadSurvivor, money, toShannons } from './api';
import type { Competition, SurvivorData, Team } from './api';
import './survivor.css';

const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
function Crest({ team }: { team: Team }) {
  return team.logo ? (
    <img
      className="survivor-crest"
      src={team.logo}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="survivor-crest">{team.code}</span>
  );
}
function Rulebook({ competition }: { competition?: Competition | null }) {
  return (
    <div className="survivor-rulebook">
      <ol>
        <li>
          Pick one team to win each round. You can change your choice until the common deadline.
        </li>
        <li>
          A draw, loss or missed pick ends your run. A team you have used cannot be picked again.
        </li>
        <li>Everyone else's picks stay private until the round locks, including from the admin.</li>
        <li>
          Results remain provisional until six hours after the round's last scheduled kickoff.
          Changed kickoffs or teams make a fixture unavailable and void its picks. Unresolved
          fixtures also void at the deadline: you advance and get that team back.
        </li>
        <li>
          If every actual pick loses or draws, those players survive. Their teams stay used. Missed
          picks are never rescued.
        </li>
        <li>
          The last survivor wins. At the end of the published schedule, remaining survivors are
          joint winners. The same applies if no legal next round exists for everyone, or service
          recovery misses the next opening deadline.
        </li>
        <li>
          Fewer than two opening entrants or everyone missing their pick cancels the competition.
          Finalized results are permanent; corrections before finalization are applied.
        </li>
      </ol>
      <p>
        One entry per account. Free entry does not move funds. Any listed prize is the host's
        announcement, not an escrowed or claimable balance. Joint winners share the announced prize
        equally; any smallest-unit remainder stays unallocated until the host arranges awards.
      </p>
      {competition && (
        <details>
          <summary>The full published schedule</summary>
          {competition.rounds.map((r, i) => (
            <div className="survivor-schedule" key={r.key}>
              <strong>
                Round {i + 1}: {r.label}
              </strong>
              <span>Pick by {date(r.lockAt)}</span>
              <span>Final results: {date(r.resolveAt)}</span>
              <small>{r.fixtures.map((f) => `${f.home.name} vs ${f.away.name}`).join(' · ')}</small>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
function Artwork({ teams }: { teams: Team[] }) {
  return (
    <div className="survivor-art" aria-hidden="true">
      <i />
      <i />
      <i />
      <div className="survivor-diamond">
        <Icon name="shield" />
      </div>
      {teams.slice(0, 3).map((team, i) => (
        <span className={`survivor-orbit team-${i}`} key={team.id}>
          <Crest team={team} />
        </span>
      ))}
      <span className="survivor-art-caption">PLAY THE LONG GAME.</span>
    </div>
  );
}
export default function SurvivorPage({
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
  const client = useQueryClient();
  const [selection, setSelection] = useState(
    () => new URLSearchParams(location.search).get('competition') ?? '',
  );
  const [tab, setTab] = useState('pick');
  const [chosen, setChosen] = useState('');
  const [notice, setNotice] = useState('');
  const [dialogMode, setDialogMode] = useState<'rules' | 'join' | 'admin' | 'delete'>('rules');
  const [deleteTarget, setDeleteTarget] = useState<Competition | null>(null);
  const [editing, setEditing] = useState<Competition | null>(null);
  const [entryMode, setEntryMode] = useState<'free' | 'paid'>('free');
  const [setupTarget, setSetupTarget] = useState('');
  const setup = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const viewEpoch = useRef(0);
  const identity = account?.id ?? null;
  const key = ['private', 'survivor', identity ?? 'public', selection, gamesDataMode];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void client.cancelQueries({ queryKey: ['private', 'survivor', identity ?? 'public'] });
      client.removeQueries({ queryKey: ['private', 'survivor', identity ?? 'public'] });
    };
  }, [client, identity]);
  const verifyIdentity = (data: SurvivorData) => {
    if (data.viewerId !== identity)
      throw Error('Your account changed. Refresh your session before continuing.');
    return data;
  };
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => verifyIdentity(await loadSurvivor(selection, signal)),
    enabled: accountReady,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const action = useMutation({
    mutationFn: async (body: unknown) => {
      const epoch = viewEpoch.current,
        cacheKey = [...key];
      return {
        data: verifyIdentity(await actSurvivor(body)),
        epoch,
        cacheKey,
        deleted:
          typeof body === 'object' && body !== null && 'action' in body && body.action === 'delete',
        created:
          typeof body === 'object' && body !== null && 'action' in body && body.action === 'create',
      };
    },
    retry: false,
    onSuccess: ({ data, epoch, cacheKey, deleted, created }) => {
      if (!alive.current) return;
      if (created && data.detail)
        client.setQueryData(
          ['private', 'survivor', identity ?? 'public', data.detail.id, gamesDataMode],
          data,
        );
      else client.setQueryData(cacheKey, data);
      if (deleted || created)
        void client.invalidateQueries({ queryKey: ['private', 'survivor', identity ?? 'public'] });
      if (epoch !== viewEpoch.current) return;
      setChosen('');
      dialog.current?.close();
      if (deleted || created) {
        const nextId = data.detail?.id ?? '';
        if (created) setSetupTarget(nextId);
        client.removeQueries({ queryKey: ['private', 'survivor', identity ?? 'public'] });
        client.setQueryData(
          ['private', 'survivor', identity ?? 'public', nextId, gamesDataMode],
          data,
        );
        setSelection(nextId);
        const url = new URL(location.href);
        if (nextId) url.searchParams.set('competition', nextId);
        else url.searchParams.delete('competition');
        history.replaceState(null, '', url);
      }
      setNotice(
        deleted
          ? 'Competition deleted.'
          : created
            ? 'Draft saved. Review the details below before opening entries.'
            : 'Saved. Your competition is up to date.',
      );
    },
  });
  const data = query.data,
    c = data?.detail,
    round = c?.rounds[c.currentRound];
  useEffect(() => {
    if (setupTarget && c?.id === setupTarget && c.state === 'draft' && setup.current) {
      setup.current.focus({ preventScroll: true });
      setup.current.scrollIntoView({ block: 'start' });
      setSetupTarget('');
    }
  }, [setupTarget, c?.id, c?.state]);
  const own = c?.entries.find((e) => e.id === c.ownId);
  const saved = own?.picks[String(c?.currentRound)];
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Use server time anchored at receipt, rather than trusting the user's clock offset.
  const serverNow = data ? Date.parse(data.now) + Math.max(0, clock - query.dataUpdatedAt) : clock;
  const open =
    !!round &&
    round.state === 'scheduled' &&
    serverNow < Date.parse(round.lockAt) &&
    ['open', 'running'].includes(c?.state ?? '');
  const canPick = open && own?.status === 'active';
  const busy = action.isPending || query.isError || query.isPending;
  const publishing =
    action.isPending &&
    typeof action.variables === 'object' &&
    action.variables !== null &&
    'action' in action.variables &&
    action.variables.action === 'publish';
  const show = (mode: typeof dialogMode) => {
    if (!action.isPending) action.reset();
    setDialogMode(mode);
    dialog.current?.showModal();
  };
  const changeCompetition = (id: string) => {
    viewEpoch.current++;
    setSelection(id);
    setChosen('');
    setTab('pick');
    setNotice('');
    action.reset();
    const url = new URL(location.href);
    url.searchParams.set('competition', id);
    history.replaceState(null, '', url);
  };
  const allTeams = round?.fixtures.flatMap((f) => [f.home, f.away]) ?? [];
  const selectedTeam = chosen || saved?.teamId || '';
  const pickName = (teamId: string) =>
    c?.rounds
      .flatMap((r) => r.fixtures.flatMap((f) => [f.home, f.away]))
      .find((t) => t.id === teamId)?.name ?? 'Team';
  function submitAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const mode = form.get('mode');
      action.mutate({
        action: editing ? 'edit' : 'create',
        id: editing?.id ?? String(form.get('requestId')),
        terms: {
          name: form.get('name'),
          mode,
          feeShannons: mode === 'free' ? '0' : toShannons(String(form.get('fee'))),
          prizeShannons: toShannons(String(form.get('prize'))),
          limit: Number(form.get('limit')),
        },
        roundKeys: form.getAll('round'),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Check the competition terms.');
    }
  }
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const adminOpen = (existing: Competition | null) => {
    setEditing(existing);
    setEntryMode(existing?.terms.mode ?? 'free');
    setRequestId(crypto.randomUUID());
    setNotice('');
    show('admin');
  };
  return (
    <div className="survivor-page">
      <GameTestPanel
        admin={data?.admin === true}
        game="survivor"
        id={c?.id}
        round={c?.currentRound}
        state={c?.state}
        busy={action.isPending}
        run={(body) => action.mutate(body)}
      />
      <header className="survivor-intro">
        <div>
          <span className="eyebrow">ONE TEAM. EVERY ROUND.</span>
          <h1>
            Streak Survivor<span>.</span>
          </h1>
          <p>Know when to play your strongest hand.</p>
        </div>
        {data?.admin ? (
          <button className="survivor-create" onClick={() => adminOpen(null)}>
            <span className="survivor-create-icon" aria-hidden="true">
              +
            </span>
            Create competition
          </button>
        ) : (
          <span className="survivor-tag">Premier League</span>
        )}
      </header>
      {(query.error || action.error) && (
        <div className="survivor-notice" role="alert">
          <strong>Let's get this back on track.</strong>
          <p>{(action.error ?? query.error)?.message}</p>
          <button
            onClick={() => {
              action.reset();
              void query.refetch();
            }}
          >
            Refresh competition
          </button>
        </div>
      )}
      {notice && (
        <p className="survivor-notice" role="status">
          {notice}
        </p>
      )}
      {query.isPending && (
        <div className="glass survivor-empty" aria-busy="true">
          Loading the Survivor board…
        </div>
      )}
      {data && !c && (
        <section className="glass survivor-empty">
          <Icon name="shield" />
          <h2>The next long game starts here.</h2>
          <p>
            No competition is open yet. Once the host publishes a round, you can join and choose
            your first winner.
          </p>
          <button className="quiet" onClick={() => show('rules')}>
            How Survivor works
          </button>
        </section>
      )}
      {c?.state === 'draft' && data?.admin && (
        <section
          className="glass survivor-setup"
          ref={setup}
          tabIndex={-1}
          aria-label={`Set up ${c.terms.name}`}
        >
          <div className="survivor-setup-heading">
            <div>
              <span className="eyebrow">HOST WORKSPACE · PRIVATE DRAFT</span>
              <h2>{c.terms.name}</h2>
            </div>
            <span className="survivor-tag">Not open for entries</span>
          </div>
          <ol className="survivor-setup-steps" aria-label="Competition setup progress">
            <li>
              <b>1</b>
              <span>Draft saved</span>
            </li>
            <li aria-current="step">
              <b>2</b>
              <span>Review & publish</span>
            </li>
            <li>
              <b>3</b>
              <span>Join & pick</span>
            </li>
          </ol>
          <div className="survivor-setup-summary">
            <div>
              <small>ENTRY</small>
              <strong>
                {c.terms.mode === 'free' ? 'Free to play' : `${money(c.terms.feeShannons)} entry`}
              </strong>
              <span>Up to {c.terms.limit} players</span>
            </div>
            <div>
              <small>HOST-ANNOUNCED PRIZE</small>
              <strong>{money(c.terms.prizeShannons)}</strong>
              <span>Arranged by you, not held by Streak</span>
            </div>
            <div>
              <small>FIRST PICK DEADLINE</small>
              <strong>{date(c.rounds[0].lockAt)}</strong>
              <span>
                {c.rounds.length} {c.rounds.length === 1 ? 'round' : 'rounds'} scheduled · Local
                time
              </span>
            </div>
          </div>
          <div className="survivor-setup-publish">
            <div>
              <h3>
                {c.terms.mode !== 'free'
                  ? 'Paid entry is not available yet'
                  : serverNow >= Date.parse(c.rounds[0].lockAt)
                    ? 'Choose a future opening round'
                    : 'Ready to open entries?'}
              </h3>
              <p id="survivor-publish-help">
                {c.terms.mode !== 'free'
                  ? 'Keep this as a paid draft, or edit it to use free entry. Entry-fee collection is not implemented, so this draft cannot be published.'
                  : serverNow >= Date.parse(c.rounds[0].lockAt)
                    ? 'The first pick deadline has passed. Edit the draft and choose upcoming rounds before publishing.'
                    : 'Publishing makes this competition visible to everyone and locks its rules and schedule. You can then join and choose your first team.'}
              </p>
            </div>
            <div className="survivor-actions">
              <button
                className="survivor-primary"
                disabled={
                  busy || c.terms.mode !== 'free' || serverNow >= Date.parse(c.rounds[0].lockAt)
                }
                aria-describedby="survivor-publish-help"
                aria-busy={publishing}
                onClick={() => action.mutate({ action: 'publish', id: c.id })}
              >
                {publishing && <span className="survivor-spinner" aria-hidden="true" />}
                {publishing ? 'Publishing competition…' : 'Publish free competition'}
              </button>
              <button className="quiet" disabled={busy} onClick={() => adminOpen(c)}>
                Edit draft
              </button>
            </div>
          </div>
          <details className="survivor-setup-schedule">
            <summary>
              Review {c.rounds.length} scheduled {c.rounds.length === 1 ? 'round' : 'rounds'}
              <Icon name="chevron-down" />
            </summary>
            {c.rounds.map((r, i) => (
              <div className="survivor-schedule" key={r.key}>
                <strong>
                  Round {i + 1}: {r.label}
                </strong>
                <span>Pick by {date(r.lockAt)}</span>
                <small>
                  {r.fixtures.map((f) => `${f.home.name} vs ${f.away.name}`).join(' · ')}
                </small>
              </div>
            ))}
          </details>
          <div className="survivor-setup-footer">
            <button className="quiet" onClick={() => show('rules')}>
              Competition rules
            </button>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => {
                setDeleteTarget(c);
                show('delete');
              }}
            >
              Delete competition
            </button>
          </div>
        </section>
      )}
      {data && data.competitions.length > 0 && (
        <section className="survivor-competitions" aria-label="Competitions">
          <div className="survivor-section-head">
            <div>
              <span className="eyebrow">FIND YOUR NEXT RUN</span>
              <h2>Competitions</h2>
            </div>
          </div>
          <div className="survivor-competition-list">
            {data.competitions.map((item) => (
              <button
                type="button"
                className="glass survivor-competition-card"
                key={item.id}
                aria-pressed={c?.id === item.id}
                onClick={() => {
                  changeCompetition(item.id);
                  setSetupTarget(item.state === 'draft' ? item.id : '');
                }}
              >
                <span className="survivor-tag">
                  {item.state === 'draft'
                    ? 'Draft · not published'
                    : item.state === 'open'
                      ? 'Open for entries'
                      : item.state === 'running'
                        ? 'In play'
                        : item.state === 'complete'
                          ? 'Finished'
                          : 'Cancelled'}
                </span>
                <strong>{item.terms.name}</strong>
                <span>
                  {item.terms.mode === 'free' ? 'Free entry' : 'Paid entry · draft only'} ·{' '}
                  {money(item.terms.prizeShannons)} announced prize
                </span>
                <span className="survivor-competition-link">
                  {item.state === 'draft'
                    ? 'Review setup'
                    : item.state === 'open'
                      ? 'View & join'
                      : 'View competition'}{' '}
                  <Icon name="arrow" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {c && round && c.state !== 'draft' && (
        <>
          <section className="glass survivor-hero">
            <div className="survivor-hero-copy">
              <span className="eyebrow">{c.terms.name.toUpperCase()} · BY STREAK</span>
              <h2>
                Win this week.
                <br />
                <em>Think three ahead.</em>
              </h2>
              <p>
                One team to win. One chance to stay in.
                <br />
                Once you use a team, it is off your board.
              </p>
              <div className="survivor-actions">
                {data.admin && (
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => {
                      setDeleteTarget(c);
                      show('delete');
                    }}
                  >
                    Delete competition
                  </button>
                )}
                {!own && c.state === 'open' && open ? (
                  <button
                    className="survivor-primary"
                    disabled={!accountReady || signInPending || c.entries.length >= c.terms.limit}
                    onClick={() => (account ? show('join') : onSignIn())}
                  >
                    {signInPending
                      ? 'Connecting…'
                      : c.entries.length >= c.terms.limit
                        ? 'Competition full'
                        : account
                          ? 'Review free entry'
                          : 'Sign in to join'}{' '}
                    <Icon name="arrow" />
                  </button>
                ) : (
                  <span className="survivor-tag">
                    {own?.status === 'winner'
                      ? 'You survived.'
                      : own?.status === 'out'
                        ? 'Your run is complete'
                        : own
                          ? 'Your entry is in'
                          : c.state === 'cancelled'
                            ? 'Competition cancelled'
                            : 'Entries closed'}
                  </span>
                )}
                <button className="quiet" onClick={() => show('rules')}>
                  How it works
                </button>
              </div>
            </div>
            <Artwork teams={allTeams} />
            <div className="survivor-stats">
              <div>
                <small>HOST-ANNOUNCED PRIZE</small>
                <b>{money(c.terms.prizeShannons)}</b>
                <span>Not escrowed or paid</span>
              </div>
              <div>
                <small>ENTRY</small>
                <b>{c.terms.mode === 'free' ? 'Free to play' : money(c.terms.feeShannons)}</b>
                <span>
                  {c.terms.mode === 'free'
                    ? 'No entry payment'
                    : 'Draft only. Payments not enabled.'}
                </span>
              </div>
              <div>
                <small>THE FIELD</small>
                <b>
                  {c.entries.length} / {c.terms.limit}
                </b>
                <span>{c.entries.filter((e) => e.status !== 'out').length} still standing</span>
              </div>
              <div>
                <small>
                  ROUND {c.currentRound + 1} OF {c.rounds.length}
                </small>
                <b>
                  {open
                    ? 'Picks open'
                    : round.state === 'final'
                      ? 'Round complete'
                      : 'Picks locked'}
                </b>
                <span>{date(round.lockAt)}</span>
              </div>
            </div>
          </section>
          {c.reason && (
            <div className="survivor-notice">
              <strong>
                {c.state === 'complete' ? 'The final whistle.' : 'Competition update'}
              </strong>
              <p>{c.reason} Any host award is handled separately from this game result.</p>
            </div>
          )}
          <div className="survivor-layout">
            <section className="survivor-game">
              <div className="survivor-tabs" aria-label="Survivor views">
                {[
                  ['pick', 'Your team board'],
                  ['board', 'Survivor board'],
                  ['history', 'Your run'],
                ].map(([id, title]) => (
                  <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
                    {title}
                  </button>
                ))}
              </div>
              {tab === 'pick' && (
                <>
                  <div className="survivor-section-head">
                    <div>
                      <span className="eyebrow">
                        ROUND {c.currentRound + 1} · {round.label}
                      </span>
                      <h3>{open ? 'Who keeps you in?' : 'The picks are in.'}</h3>
                      <p>
                        {open
                          ? 'Choose carefully. Today’s safe pick might be next week’s lifeline.'
                          : `Final results by ${date(round.resolveAt)}. Picks remain visible below.`}
                      </p>
                    </div>
                    {own && <span className="survivor-tag">{own.used.length} teams played</span>}
                  </div>
                  <div className="survivor-team-grid">
                    {round.fixtures.flatMap((fixture) =>
                      [fixture.home, fixture.away].map((team) => {
                        const opponent = fixture.home.id === team.id ? fixture.away : fixture.home;
                        const used = own?.used.includes(team.id) && saved?.teamId !== team.id;
                        const next = c.rounds
                          .slice(c.currentRound)
                          .flatMap((r) => r.fixtures)
                          .filter((f) => f.home.id === team.id || f.away.id === team.id)
                          .slice(0, 3);
                        return (
                          <button
                            className="survivor-team glass"
                            key={team.id}
                            data-used={used ? 'true' : 'false'}
                            aria-pressed={selectedTeam === team.id}
                            disabled={
                              !canPick ||
                              used ||
                              round.voidFixtures.includes(fixture.id) ||
                              action.isPending
                            }
                            onClick={() => setChosen(team.id)}
                          >
                            <span className="survivor-team-top">
                              <Crest team={team} />
                              <span className="survivor-team-status">
                                {round.voidFixtures.includes(fixture.id)
                                  ? 'FIXTURE CHANGED'
                                  : used
                                    ? 'ALREADY USED'
                                    : selectedTeam === team.id
                                      ? saved?.teamId === team.id
                                        ? 'SAVED ✓'
                                        : 'SELECTED'
                                      : 'AVAILABLE'}
                              </span>
                            </span>
                            <strong>{team.name}</strong>
                            <span>
                              vs {opponent.name} · {fixture.home.id === team.id ? 'Home' : 'Away'}
                            </span>
                            <small>{date(fixture.kickoff)}</small>
                            <FixtureRun
                              label="Next fixtures in this competition"
                              fixtures={next.map((f) => ({
                                opponent: f.home.id === team.id ? f.away.code : f.home.code,
                                opponentName: f.home.id === team.id ? f.away.name : f.home.name,
                                home: f.home.id === team.id,
                                kickoff: f.kickoff,
                              }))}
                            />
                          </button>
                        );
                      }),
                    )}
                  </div>
                  {own && (
                    <div className="survivor-pickbar">
                      <div>
                        <small>{saved ? 'YOUR SAVED PICK' : 'YOUR CHOICE'}</small>
                        <strong>
                          {selectedTeam ? pickName(selectedTeam) : 'Choose a team above'}
                        </strong>
                        <span>
                          {open
                            ? 'Private until the round locks'
                            : saved
                              ? 'Locked for this round'
                              : 'No pick was saved'}
                        </span>
                      </div>
                      <button
                        className="survivor-primary"
                        disabled={
                          busy || !canPick || !selectedTeam || selectedTeam === saved?.teamId
                        }
                        onClick={() =>
                          action.mutate({
                            action: 'pick',
                            id: c.id,
                            round: c.currentRound,
                            teamId: selectedTeam,
                          })
                        }
                      >
                        {action.isPending
                          ? 'Saving your pick…'
                          : selectedTeam === saved?.teamId
                            ? 'Pick saved'
                            : 'Save my pick'}
                      </button>
                    </div>
                  )}
                </>
              )}
              {tab === 'board' && (
                <div className="glass survivor-standings">
                  <div className="survivor-section-head">
                    <h3>Still in the game.</h3>
                    <span>{c.entries.length} entrants</span>
                  </div>
                  {c.entries.length === 0 ? (
                    <p>Be the first to join this competition.</p>
                  ) : (
                    c.entries.map((entry) => (
                      <div className="survivor-standing" key={entry.id}>
                        <span className="survivor-avatar">
                          {entry.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>
                            {entry.name}
                            {entry.id === own?.id ? ' · You' : ''}
                          </strong>
                          <small>{entry.used.length} teams played</small>
                        </div>
                        <span>
                          {entry.picks[String(c.currentRound)]
                            ? pickName(entry.picks[String(c.currentRound)].teamId)
                            : open
                              ? 'Pick hidden'
                              : 'No pick'}
                        </span>
                        <b>
                          {entry.status === 'winner'
                            ? 'Winner'
                            : entry.status === 'out'
                              ? 'Run ended'
                              : 'Surviving'}
                        </b>
                      </div>
                    ))
                  )}
                </div>
              )}
              {tab === 'history' && (
                <div className="glass survivor-history">
                  <h3>Every choice tells a story.</h3>
                  {!own ? (
                    <p>Join a competition to start your run.</p>
                  ) : (
                    c.rounds.slice(0, c.currentRound + 1).map((r, i) => {
                      const p = own.picks[String(i)];
                      return (
                        <div className="survivor-history-row" key={r.key}>
                          <span className="survivor-round-number">{i + 1}</span>
                          <div>
                            <strong>
                              {p
                                ? pickName(p.teamId)
                                : own.missedRound === i
                                  ? 'Missed pick'
                                  : 'Your next decision'}
                            </strong>
                            <span>
                              {r.label} · {date(r.lockAt)}
                            </span>
                          </div>
                          <b>
                            {p?.result === 'void'
                              ? 'Advanced · team restored'
                              : p?.result === 'rescued'
                                ? 'All-loss rescue'
                                : p?.result === 'won'
                                  ? 'Survived'
                                  : p?.result === 'lost'
                                    ? 'Eliminated'
                                    : p
                                      ? r.state === 'scheduled'
                                        ? 'Saved'
                                        : 'Awaiting result'
                                      : own.missedRound === i
                                        ? 'Eliminated'
                                        : 'No pick'}
                          </b>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
            <aside className="survivor-aside">
              <section className="glass">
                <span className="eyebrow">THE ART OF SURVIVING</span>
                <h3>
                  Your best team.
                  <br />
                  Or your best timing?
                </h3>
                <p>
                  A favourite now could be your lifeline later. Look at the next opponent before you
                  lock it in.
                </p>
                <ol>
                  <li>
                    <strong>Pick a winner</strong>
                    <span>Draws and losses put you out.</span>
                  </li>
                  <li>
                    <strong>Spend your teams wisely</strong>
                    <span>No repeats in this competition.</span>
                  </li>
                  <li>
                    <strong>Outlast the rest</strong>
                    <span>Play for the long run.</span>
                  </li>
                </ol>
              </section>
              <section className="glass">
                <span className="eyebrow">YOUR RESERVE</span>
                <h3>{own ? `${own.used.length} teams played.` : 'A fresh start.'}</h3>
                <div className="survivor-reserve">
                  {allTeams.map((team) => (
                    <span
                      key={team.id}
                      data-used={own?.used.includes(team.id)}
                      title={`${team.name}${own?.used.includes(team.id) ? ': played' : ': available'}`}
                    >
                      <Crest team={team} />
                    </span>
                  ))}
                </div>
                <p>Faded teams have been used. A void restores your team.</p>
              </section>
            </aside>
          </div>
        </>
      )}
      <dialog ref={dialog} className="survivor-dialog" aria-labelledby="survivor-dialog-title">
        <header>
          <div>
            <span className="eyebrow">STREAK SURVIVOR</span>
            <h2 id="survivor-dialog-title">
              {dialogMode === 'delete'
                ? 'Delete this competition?'
                : dialogMode === 'admin'
                  ? editing
                    ? 'Edit your draft.'
                    : 'Create the long game.'
                  : dialogMode === 'join'
                    ? 'Your run starts here.'
                    : 'Simple to play. Hard to last.'}
            </h2>
          </div>
          <button aria-label="Close Survivor dialog" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </header>
        <div className="survivor-dialog-body">
          {action.error && (
            <p className="survivor-notice" role="alert">
              {action.error.message}
            </p>
          )}
          {notice && dialogMode === 'admin' && <p role="status">{notice}</p>}
          {dialogMode === 'rules' && <Rulebook competition={c} />}
          {dialogMode === 'delete' && deleteTarget && data?.admin && (
            <>
              <p>
                <strong>{deleteTarget.terms.name}</strong>
              </p>
              <p>
                {deleteTarget.entries.length
                  ? 'This competition has entrants. Their entries and results must be kept, so it cannot be deleted.'
                  : 'This removes the competition from Streak. It has no entrants. This cannot be undone.'}
              </p>
              <div className="survivor-actions">
                <button className="quiet" onClick={() => dialog.current?.close()}>
                  Keep competition
                </button>
                {!deleteTarget.entries.length && (
                  <button
                    className="survivor-primary"
                    disabled={busy}
                    onClick={() => action.mutate({ action: 'delete', id: deleteTarget.id })}
                  >
                    {action.isPending ? 'Deleting competition…' : 'Confirm deletion'}
                  </button>
                )}
              </div>
            </>
          )}
          {dialogMode === 'join' && c && (
            <>
              <div className="survivor-entry-summary">
                <strong>{c.terms.name}</strong>
                <b>Free entry</b>
                <span>
                  {c.entries.length} of {c.terms.limit} places filled
                </span>
                <span>First pick locks {date(c.rounds[0].lockAt)}</span>
              </div>
              <Rulebook competition={c} />
              <button
                className="survivor-primary"
                disabled={busy}
                onClick={() => action.mutate({ action: 'join', id: c.id, termsHash: c.termsHash })}
              >
                {action.isPending ? 'Securing your place…' : 'Accept rules and join free'}
              </button>
            </>
          )}
          {dialogMode === 'admin' && data?.admin && (
            <form key={requestId} onSubmit={submitAdmin}>
              <input type="hidden" name="requestId" value={requestId} />
              <label>
                Competition name
                <input
                  name="name"
                  required
                  minLength={3}
                  maxLength={64}
                  defaultValue={editing?.terms.name ?? ''}
                  placeholder="The long game"
                />
              </label>
              <div className="survivor-form-grid">
                <label>
                  Entry
                  <select
                    aria-label="Entry mode"
                    name="mode"
                    value={entryMode}
                    onChange={(event) =>
                      setEntryMode(event.target.value === 'paid' ? 'paid' : 'free')
                    }
                  >
                    <option value="free">Free entry</option>
                    <option value="paid">Paid entry (draft only)</option>
                  </select>
                </label>
                <label>
                  Entry fee (tCKB)
                  <input
                    name="fee"
                    inputMode="decimal"
                    disabled={entryMode === 'free'}
                    defaultValue={editing ? decimalAmount(editing.terms.feeShannons) : '100'}
                  />
                </label>
                <label>
                  Announced prize (tCKB)
                  <input
                    name="prize"
                    inputMode="decimal"
                    required
                    defaultValue={editing ? decimalAmount(editing.terms.prizeShannons) : '0'}
                  />
                </label>
                <label>
                  Maximum entrants
                  <input
                    name="limit"
                    type="number"
                    min="2"
                    max="256"
                    required
                    defaultValue={editing?.terms.limit ?? 64}
                  />
                </label>
              </div>
              <p className="survivor-notice">
                {entryMode === 'paid'
                  ? 'Paid entry cannot open yet. You can save your plans as a draft, or choose free entry to publish now.'
                  : 'Free entry needs no wallet payment. Any prize is arranged by you separately.'}
              </p>
              <fieldset>
                <legend>Choose your rounds</legend>
                <p>
                  Choose the complete schedule before opening entries. Each round includes all 20
                  clubs, with no repeat fixture per club.
                </p>
                {!data.slates.length && (
                  <p className="survivor-notice">
                    No complete upcoming Premier League round is available from the feed yet.
                    Refresh after the schedule updates.
                  </p>
                )}
                {data.slates.map((s) => (
                  <label className="survivor-round-choice" key={s.key}>
                    <input
                      type="checkbox"
                      name="round"
                      value={s.key}
                      defaultChecked={editing?.rounds.some((r) => r.key === s.key)}
                    />
                    <span>
                      <strong>{s.label}</strong>
                      <small>
                        Lock {date(s.lockAt)} · Results {date(s.resolveAt)}
                      </small>
                      <small>{s.fixtures.length} fixtures</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                className="survivor-primary"
                disabled={action.isPending || !data.slates.length}
              >
                {action.isPending ? 'Saving competition…' : 'Save draft'}
              </button>
              <p>
                {entryMode === 'free'
                  ? 'Next: review your competition and publish it to open entries.'
                  : 'Your draft stays private until free entry is selected and you publish it.'}
              </p>
            </form>
          )}
        </div>
      </dialog>
    </div>
  );
}
