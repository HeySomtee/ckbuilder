import { observeSelectControls } from '/select-controls.js';
import { renderAdmin } from '/admin.mjs';
import { renderSetup } from '/setup.mjs';
import { renderEvidence } from '/evidence.mjs';
import {
  catalog,
  getDraft,
  getApplied,
  applyDraft,
  saveDraft,
  resetDraft,
  loadSavedDrafts,
  amountCents,
  totalCents,
  dollars,
  escapeHtml,
  deletedPreview,
  loadDeletedPreviews,
  deletePreview,
} from '/config.mjs';

const paths = {
  trophy:
    'M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8m-10 0h12',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3Z',
  markets: 'M4 20V9m8 11V4m8 16v-8M2 21h20',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  five: 'm8 3 4 2 4-2 5 5-3 3-2-2v12H8V9l-2 2-3-3Z',
  lock: 'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0v4',
  calendar: 'M4 5h16v16H4Zm3-3v6m10-6v6M4 11h16',
  share: 'M12 16V3m-5 5 5-5 5 5M5 13H3v8h18v-8h-2',
  info: 'M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-4 10 3 3 5-6',
  chevron: 'm9 5 7 7-7 7',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  more: 'M4 11v2m8-2v2m8-2v2',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
};
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.info}"/></svg>`;
let prizeAmounts = [25, 15, 10];
const awardFor = (rank) => prizeAmounts[rank - 1] ?? 0;
const params = new URLSearchParams(location.search);
const allowed = [
  'open',
  'registered',
  'live',
  'full',
  'finalizing',
  'finished',
  'finished-player',
  'finished-inactive',
  'paid',
];
let kind = params.get('kind') === 'five' ? 'five' : 'predictions';
let state = allowed.includes(params.get('state')) ? params.get('state') : 'finished';
let view = params.get('view') === 'admin' ? 'admin' : 'player';
let adminPanel = ['setup', 'monitor', 'evidence'].includes(params.get('admin'))
  ? params.get('admin')
  : 'setup';
const setupUi = {
  step: ['basics', 'fixtures', 'prizes', 'review'].includes(params.get('step'))
    ? params.get('step')
    : 'fixtures',
  search: '',
  league: 'all',
  selectedOnly: false,
};
let setupError = '';
let deleteReview = null;
const creating = new Set();
loadDeletedPreviews();
loadSavedDrafts();
const config = () => getApplied(kind);
const prizeTotal = () => dollars(totalCents(config()));
const prizesLabel = () => prizeAmounts.map((n) => '$' + n).join(' / ');
let tab = ['play', 'leaderboard', 'rules'].includes(params.get('tab')) ? params.get('tab') : 'play';
let selected = new Set();
let squadSaved = false;
let returnFocus;
const finished = () => state.startsWith('finished') || state === 'paid';
const hasEntry = () => (kind === 'five' ? squadSaved : selected.size > 0);
const inactive = () => (state === 'registered' && !hasEntry()) || state === 'finished-inactive';
const pointsFor = (points) =>
  ['open', 'registered', 'full'].includes(state)
    ? 0
    : state === 'live'
      ? kind === 'five'
        ? Math.floor(points / 2)
        : Math.floor(points / 6) * 3
      : points;
const title = () => escapeHtml(config().name);
const date = () => escapeHtml(config().registrationDeadline.replace('T', ' · ')) + ' WAT';
const fiveDeadline = () =>
  config().gameweekId === '11' ? '21 Nov · 12:00 WAT' : 'the official FPL deadline';
const live = () => ['live', 'full', 'finalizing'].includes(state);
const roster = [
  {
    name: 'TouchlineTactician',
    initials: 'TT',
    score: 15,
    five: 74,
    time: '20 Nov, 18:42',
    tone: 'mint',
  },
  { name: 'Somtee', initials: 'SO', score: 12, five: 68, time: '20 Nov, 19:05', tone: 'coral' },
  { name: 'BoxToBox', initials: 'BB', score: 12, five: 68, time: '20 Nov, 20:18', tone: 'blue' },
  { name: 'TheAwayEnd', initials: 'AE', score: 9, five: 61, time: '20 Nov, 20:35', tone: 'purple' },
  { name: 'PitchPerfect', initials: 'PP', score: 9, five: 57, time: '21 Nov, 09:12', tone: 'gold' },
  { name: 'ExtraTime', initials: 'ET', score: 9, five: 57, time: '21 Nov, 10:04', tone: 'blue' },
  { name: 'HalfSpace', initials: 'HS', score: 6, five: 49, time: '21 Nov, 10:16', tone: 'mint' },
  { name: 'NorthStand', initials: 'NS', score: 3, five: 32, time: '21 Nov, 10:21', tone: 'purple' },
];
let fixtures = catalog.slice(0, 5);
const predictionPoints = (fixture, index) =>
  ['open', 'registered', 'full'].includes(state) ||
  (state === 'live' && index > 1) ||
  (state === 'finished-player' && index > 0)
    ? 0
    : fixture.points;
const myPredictionPoints = () =>
  fixtures.reduce((total, fixture, index) => total + predictionPoints(fixture, index), 0);
const avatar = (r) => `<span class="avatar tone-${r.tone}">${r.initials}</span>`;
const badge = (text, tone = '') =>
  `<span class="badge ${tone ? 'badge--' + tone : ''}">${text}</span>`;
const statusLabel = () =>
  finished()
    ? 'Finished'
    : {
        open: 'Open for entries',
        registered: 'Open for entries',
        live: 'Live',
        full: 'Entry closed',
        finalizing: 'Finalizing',
      }[state];
function myResult() {
  if (inactive()) return { rank: 24, points: 0, label: 'No squad saved', active: false };
  if (state === 'registered') return { rank: 22, points: 0, active: true };
  if (state === 'finished-player')
    return { rank: 8, points: kind === 'five' ? 32 : myPredictionPoints(), active: true };
  return { rank: 2, points: kind === 'five' ? pointsFor(68) : myPredictionPoints(), active: true };
}
function syncControls() {
  for (const [id, value] of [
    ['kind', kind],
    ['scenario', state],
    ['view', view],
  ]) {
    const el = document.getElementById(id);
    if (el.value !== value) {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    }
  }
  history.replaceState(
    null,
    '',
    `?kind=${kind}&state=${state}&view=${view}&tab=${tab}&admin=${adminPanel}&step=${setupUi.step}`,
  );
}
function shell() {
  return `<aside class="sidebar"><a class="wordmark" href="?state=finished"><img src="/brand/on-form-wordmark.svg" alt="Streak"/></a><span class="nav-label">YOUR TOUCHLINE</span><button class="nav-item" data-action="sample-nav">${icon('home')}Overview</button><button class="nav-item" data-action="sample-nav">${icon('markets')}Markets</button><button class="nav-item" data-action="sample-nav">${icon('activity')}Matchday</button><span class="nav-label">COMPETITIONS</span>${competitionNavigation()}<span class="nav-label">YOUR SPACE</span><button class="nav-item" data-action="sample-nav">${icon('activity')}My activity</button><button class="nav-item" data-action="sample-nav">${icon('user')}My account</button><button class="nav-item admin-nav ${view === 'admin' ? 'active' : ''}" data-action="toggle-admin">${icon('shield')}${view === 'admin' ? 'Player view' : 'Competition admin'}</button><div class="sidebar-note"><span class="online-dot"></span> CKB Pudge testnet<small>Play with testnet tokens.</small></div></aside>
  <div class="app-body"><header class="topbar"><img class="mobile-brand" src="/brand/on-form-wordmark.svg" alt="Streak"/><span class="crumb">Competitions <span>/</span> ${view === 'admin' ? 'Manage competition' : title()}</span><button class="account-chip" data-action="account">${avatar({ initials: 'SO', tone: 'coral' })}<span>Somtee</span>${icon('chevron')}</button></header><main id="main" tabindex="-1">${view === 'admin' ? adminPage() : playerPage()}</main><footer class="page-footer">Free to join. Play with tCKB. Campaign prizes paid in mainnet CKB.<span>Illustrative fixtures and results for design review.</span></footer></div>
  <nav class="mobile-nav" aria-label="Mobile navigation"><button data-action="sample-nav">${icon('home')}Overview</button><button data-action="sample-nav">${icon('markets')}Markets</button><button class="active" data-action="competitions">${icon('trophy')}Competitions</button><button data-action="sample-nav">${icon('user')}Account</button></nav>`;
}
function playerPage() {
  if (deletedPreview(kind)) return deletedPage();
  const end = finished();
  return `<div class="competition-heading"><div><div class="eyebrow">THE FOUNDING PLAYERS SERIES ${badge(statusLabel(), end ? 'neutral' : state === 'finalizing' ? 'amber' : 'mint')}</div><h1>${title()}<span>.</span></h1><p>${escapeHtml(config().description)}</p></div><div class="prize-mini">${icon('trophy')}<div><strong>$${prizeTotal()} <span>in CKB</span></strong><small>Top ${prizeAmounts.length} · ${prizesLabel()}</small></div></div></div>
  ${end ? finishHero() : entryBanner()}
  <div class="section-tabs" role="tablist" aria-label="Competition sections">${[
    ['play', end ? 'Results' : kind === 'five' ? 'My five' : 'Play'],
    ['leaderboard', end ? 'Final leaderboard' : 'Leaderboard'],
    ['rules', 'Rules & prizes'],
  ]
    .map(
      ([key, label]) =>
        `<button role="tab" aria-selected="${tab === key}" aria-controls="tab-content" id="tab-${key}" data-tab="${key}" class="${tab === key ? 'active' : ''}">${label}${key === 'leaderboard' ? '<span class="tab-count">24</span>' : ''}</button>`,
    )
    .join(
      '',
    )}<span class="tabs-meta">${end ? 'Final scores' : state === 'finalizing' ? 'Checking final results' : '24 registered'}</span></div>
  <section id="tab-content" role="tabpanel" aria-labelledby="tab-${tab}" tabindex="0">${tab === 'rules' ? rules() : tab === 'leaderboard' ? fullLeaderboard() : end ? finishedContent() : playContent()}</section>`;
}
function entryBanner() {
  if (state === 'open')
    return `<div class="entry-banner"><div class="entry-info"><span class="small-icon">${icon('calendar')}</span><div><strong>${kind === 'five' ? `Gameweek ${escapeHtml(config().gameweekId)}` : `${fixtures.length} selected fixtures`}</strong><small>Join before ${date()} · Free entry</small></div></div><button class="btn btn--primary" data-action="join">Join competition ${icon('arrow')}</button></div>`;
  if (state === 'finalizing')
    return `<div class="entry-banner finalizing"><div class="entry-info"><span class="cells" aria-hidden="true"><i></i><i></i><i></i></span><div><strong>The football is finished. One final check.</strong><small>Results are provisional while scores and entries are verified.</small></div></div>${badge('Awards pending', 'amber')}</div>`;
  return `<div class="entry-banner"><div class="entry-info"><span class="small-icon">${icon(state === 'full' ? 'lock' : 'check')}</span><div><strong>${state === 'registered' ? 'You’re on the leaderboard' : state === 'full' ? 'Entries are now closed' : 'You’re in. Keep your eye on the table.'}</strong><small>${state === 'registered' ? `Rank ${myResult().rank} · 0 points · ` + (hasEntry() ? (kind === 'five' ? 'Your squad is saved. Edit it until the deadline.' : 'Your first call is recorded.') : kind === 'five' ? 'Save your five before the deadline.' : 'Make your first qualifying prediction.') : state === 'full' ? 'Follow the results and your position below.' : `Your rank: #2 · ${myResult().points} points so far`}</small></div></div>${badge(state === 'full' ? 'Locked' : 'Registered', 'mint')}</div>`;
}
function finishHero() {
  const mine = myResult(),
    winner = mine.active && awardFor(mine.rank) > 0,
    paid = state === 'paid';
  return `<section class="finish-hero ${winner ? 'is-winner' : ''}" aria-label="Your final result"><div class="finish-art" aria-hidden="true">${icon(winner ? 'trophy' : 'check')}<span class="art-orbit"></span><span class="art-orbit second"></span></div><div class="finish-copy"><span class="eyebrow">${winner ? 'YOU FINISHED IN A PRIZE PLACE' : 'FULL TIME. THANKS FOR PLAYING.'}</span><h2>${winner ? 'A place among the best.' : !mine.active ? 'On the list. Next time, on the pitch.' : 'Every call was part of the story.'}</h2><p>${winner ? 'Your place is confirmed. Here’s how your matchweek finished.' : !mine.active ? 'You registered but didn’t enter. Your place remains on the final leaderboard.' : 'Your results are in. See your final position and the calls that got you there.'}</p><div class="finish-stats"><div><small>YOUR RANK</small><strong>#${mine.rank}<span> / 24</span></strong></div><div><small>TOTAL POINTS</small><strong>${mine.points}<span> pts</span></strong></div><div><small>${winner ? 'YOUR AWARD' : 'ENTRY STATUS'}</small><strong class="${winner ? 'mint' : ''}">${winner ? `$${awardFor(mine.rank)} <span>in CKB</span>` : !mine.active ? 'Registered' : 'Completed'}</strong></div></div></div><div class="award-note">${winner ? `${badge(paid ? 'Prize paid' : 'Payout pending', paid ? 'mint' : 'amber')}<p>${paid ? 'Your prize is marked as paid in this preview.' : 'Your award is confirmed. We’ll ask you to verify your mainnet address before payout.'}</p><button class="btn btn--subtle" data-action="${paid ? 'payment' : 'award'}">${paid ? 'View prize details' : 'View my award'} ${icon('arrow')}</button>` : `${badge('Competition finished')}<p>${!mine.active ? '0 points · Did not participate' : 'You can revisit every result below.'}</p><button class="btn btn--subtle" data-tab="leaderboard">See final standings ${icon('arrow')}</button>`}</div></section>`;
}
function rows() {
  const mine = myResult();
  const sampleTotal = fixtures.reduce((sum, f) => sum + f.points, 0);
  const sampleScores = [
    fixtures.length * 3,
    sampleTotal,
    sampleTotal,
    ...[3, 3, 3, 6, 9].map((offset) => Math.max(0, sampleTotal - offset)),
  ];
  const active = roster.map((r, i) => ({
    ...r,
    rank: i + 1,
    points:
      kind === 'five'
        ? pointsFor(r.five)
        : Math.min(pointsFor(sampleScores[i]), state === 'live' ? 6 : fixtures.length * 3),
    you: state !== 'open' && i + 1 === mine.rank,
  }));
  if (!inactive() && state !== 'open' && state !== 'registered')
    active[mine.rank - 1].points = mine.points;
  if (inactive() || state === 'finished-player' || ['open', 'registered'].includes(state))
    active[1] = { ...active[1], name: 'SecondHalf', initials: 'SH', you: false };
  if (state === 'finished-player')
    active[7] = { ...active[7], name: 'Somtee', initials: 'SO', you: true };
  if (state === 'registered' && hasEntry())
    active.push({
      name: 'Somtee',
      initials: 'SO',
      tone: 'coral',
      rank: 22,
      points: 0,
      you: true,
      time: 'Just now',
    });
  const noEntry = [
    { name: 'CornerFlag', initials: 'CF', tone: 'neutral', rank: 23, points: 0, noEntry: true },
    {
      name: inactive() ? 'Somtee' : 'SundayLeague',
      initials: inactive() ? 'SO' : 'SL',
      tone: inactive() ? 'coral' : 'neutral',
      rank: 24,
      points: 0,
      noEntry: true,
      you: inactive(),
    },
  ];
  if (state === 'registered') return [...active.map((r) => ({ ...r, points: 0 })), ...noEntry];
  return [...active, ...noEntry];
}
function board(compact = false) {
  const list = compact ? rows().filter((r) => !r.noEntry && awardFor(r.rank) > 0) : rows();
  return `<div class="leaderboard-table table-wrap"><table class="data-table"><thead><tr><th class="rank-col">#</th><th>Player</th>${!compact ? `<th class="time-col">${kind === 'five' ? 'Final squad saved' : 'Last qualifying call'}</th>` : ''}<th class="number">Points</th><th class="number">${finished() ? 'Award' : 'Status'}</th></tr></thead><tbody>${list.map((r, i) => `${!compact && r.rank === 23 ? '<tr class="group-divider"><td colspan="5">Registered · no participation</td></tr>' : ''}<tr class="${r.you ? 'your-row' : ''} ${r.noEntry ? 'inactive-row' : ''}"><td class="rank-col ${awardFor(r.rank) > 0 ? 'rank-winning' : ''}">${String(r.rank).padStart(2, '0')}</td><td><button class="player-link" data-player="${r.rank}">${avatar(r)}<span>${r.name}${r.you ? '<small>You</small>' : ''}</span></button></td>${!compact ? `<td class="time-col muted mono">${r.noEntry ? 'No entry' : r.time}</td>` : ''}<td class="number points">${r.points}</td><td class="number">${r.noEntry ? '<span class="muted">Registered</span>' : finished() && awardFor(r.rank) > 0 ? `<span class="prize-cell">$${awardFor(r.rank)} <small>in CKB</small></span>` : finished() ? '<span class="muted">Completed</span>' : badge(state === 'registered' ? 'Entered' : 'Playing', 'mint')}</td></tr>`).join('')}</tbody></table></div>`;
}
function finishedContent() {
  return `<div class="results-grid"><section class="panel winners-panel"><div class="section-heading"><div><span class="eyebrow">THE PRIZE PLACES</span><h2>Well played, everyone.</h2></div><span class="award-icon">${icon('trophy')}</span></div>${board(true)}<div class="panel-footer"><span>Same points? Earlier final entry ranks first.</span><button class="text-btn" data-tab="leaderboard">All 24 players ${icon('arrow')}</button></div></section><section class="panel personal-results"><div class="section-heading"><div><span class="eyebrow">YOUR MATCHWEEK</span><h2>${kind === 'five' ? 'Your final five' : 'Your calls, settled.'}</h2></div>${badge(`${myResult().points} pts`, 'mint')}</div>${inactive() ? emptyEntry() : kind === 'five' ? squadSummary() : predictionSummary()}<button class="btn btn--subtle full-width" data-action="breakdown">View points breakdown ${icon('arrow')}</button></section></div><div class="archive-note">${icon('shield')}<span>Final results are preserved here. Prize payments are tracked separately.</span><button class="text-btn" data-action="share">Share competition ${icon('share')}</button></div>`;
}
function fullLeaderboard() {
  return `<section class="panel"><div class="section-heading"><div><span class="eyebrow">EVERY PLAYER HAS A PLACE</span><h2>${finished() ? 'Final standings' : 'The competition table'}</h2><p>24 registered · ${finished() ? 'Scores finalized' : 'Scores update as results are verified'}</p></div>${badge(finished() ? 'Final' : 'Provisional', finished() ? 'mint' : 'amber')}</div>${board()}<div class="panel-footer"><span>${kind === 'five' ? 'Equal points are decided by the earlier final squad save.' : 'Equal points are decided by the earlier last qualifying prediction.'} Registered non-participants stay at the bottom. This preview shows the first eight and last two places.</span></div></section>`;
}
function predictionSummary() {
  const beforeResults = ['open', 'registered', 'full'].includes(state);
  return `<div class="call-list">${fixtures
    .map((f, i) => {
      const pending = beforeResults || (state === 'live' && i > 1);
      const missed = state === 'finished-player' && i > 0;
      const pts = predictionPoints(f, i);
      const detail = pending
        ? state === 'registered'
          ? selected.has(i)
            ? 'Entry recorded · awaiting kickoff'
            : 'No campaign entry yet'
          : 'Awaiting result'
        : missed
          ? 'No qualifying entry'
          : `${f.pick} · Final ${f.result}`;
      return `<div class="call-row"><span class="result-dot ${pts ? 'won' : 'lost'}">${icon(pending ? 'clock' : pts ? 'check' : 'close')}</span><div><strong>${f.home} <span>v</span> ${f.away}</strong><small>${detail}</small></div><b class="${pts ? 'mint' : 'muted'}">${pts ? '+3' : '0'}</b></div>`;
    })
    .join('')}</div>`;
}
function squadSummary() {
  const points =
    state === 'finished-player'
      ? [6, 2, 12, 5, 7]
      : state === 'live'
        ? [3, 4, 12, 6, 9]
        : ['open', 'registered', 'full'].includes(state)
          ? [0, 0, 0, 0, 0]
          : [6, 9, 24, 11, 18];
  return `<div class="call-list">${[
    ['Raya', 'GK'],
    ['Gabriel', 'DEF'],
    ['Palmer', 'MID · Captain'],
    ['Saka', 'MID'],
    ['Haaland', 'FWD'],
  ]
    .map(
      ([name, pos], i) =>
        `<div class="call-row"><span class="shirt">${icon('five')}</span><div><strong>${name}</strong><small>${pos}</small></div><b class="mint">${points[i]}</b></div>`,
    )
    .join('')}</div>`;
}
function emptyEntry() {
  return `<div class="empty-entry">${icon(kind === 'five' ? 'five' : 'markets')}<h3>You had a place, but no entry.</h3><p>${kind === 'five' ? 'No squad was saved before the deadline.' : 'No qualifying campaign prediction was placed.'} You remain ranked #24 with 0 points.</p>${badge('Registered · did not participate')}</div>`;
}
function fixtureCard(f, i) {
  const closed = state === 'full' || state === 'finalizing' || (state === 'live' && i < 2),
    full = f.count === 32 || state === 'full';
  const picked = selected.has(i) || state === 'live',
    done = state === 'finalizing' || (state === 'live' && i < 2);
  return `<article class="fixture-card"><div class="fixture-top"><span>${f.day} <b>·</b> ${f.time} WAT</span>${badge(done ? 'Final' : full ? 'Full' : f.count >= 25 ? 'Filling fast' : 'Open', done ? 'neutral' : full ? 'neutral' : f.count >= 25 ? 'amber' : 'mint')}</div><div class="teams"><span class="club tone-${f.tones[0]}">${f.h}</span><div><strong>${f.home}</strong><small>vs</small><strong>${f.away}</strong></div><span class="club tone-${f.tones[1]}">${f.a}</span></div><div class="capacity"><div><span>${state === 'full' ? 32 : f.count}<span class="muted"> / 32 slots filled</span></span><strong>${full ? 'No places left' : 32 - f.count + ' left'}</strong></div><progress max="32" value="${state === 'full' ? 32 : f.count}" aria-label="${f.home} market slots filled"></progress></div>${done ? `<div class="fixture-result">Final ${f.result} ${state === 'live' ? badge('+3 pts', 'mint') : badge('Points under review', 'amber')}</div>` : picked ? `<div class="fixture-result">${icon('check')} Your campaign call is recorded ${badge('Pending result')}</div>` : `<div class="outcomes">${['Home', 'Draw', 'Away'].map((choice) => `<button data-pick="${i}" data-choice="${choice}" ${full || closed ? 'disabled' : ''}>${choice}</button>`).join('')}</div>`}</article>`;
}
function playContent() {
  return `<div class="play-grid"><section><div class="section-heading no-padding"><div><h2>${kind === 'five' ? 'Your squad, your call.' : `${fixtures.length} fixtures. Make them count.`}</h2><p>${kind === 'five' ? `Gameweek ${escapeHtml(config().gameweekId)} · Picks close ${fiveDeadline()}` : 'One qualifying call per fixture. Correct call +3 points.'}</p></div></div>${kind === 'five' ? fivePitch() : `<div class="fixture-grid">${fixtures.map(fixtureCard).join('')}</div><p class="capacity-note">${icon('info')} Last checked just now. Slots include all market predictions. Adding a pick does not reserve a place.</p>`}</section><aside class="play-aside"><section class="panel"><div class="section-heading"><h2>Your competition</h2>${icon('trophy')}</div><div class="my-standing"><div><small>RANK</small><strong>${state === 'open' ? 'Not joined' : '#' + myResult().rank}</strong></div><div><small>POINTS</small><strong>${state === 'open' ? '0' : myResult().points}</strong></div></div><div class="progress-step">${icon(state === 'open' ? 'user' : 'check')}<div><strong>${state === 'open' ? 'Join the competition' : 'Registration complete'}</strong><small>${state === 'open' ? 'Free entry with your Streak account' : 'Your name is already on the table'}</small></div></div><div class="progress-step">${icon('clock')}<div><strong>${kind === 'five' ? 'Save your final five' : 'Place your campaign calls'}</strong><small>${state === 'registered' && !hasEntry() ? 'No entry yet. You’re ranked with 0 points.' : 'Follow your points here after kickoff'}</small></div></div><button class="btn btn--subtle full-width" data-tab="leaderboard">See the leaderboard ${icon('arrow')}</button></section><section class="prize-aside"><span class="eyebrow">A LITTLE EXTRA TO PLAY FOR</span><h3>${prizeAmounts.length} winning places.</h3><p>A $${prizeTotal()} CKB prize pool. See the award for each place.</p><button class="text-btn" data-tab="rules">See prize rules ${icon('arrow')}</button></section></aside></div>`;
}
function fivePitch() {
  const empty = (state === 'registered' && !squadSaved) || state === 'open';
  const playerPoints =
    state === 'live' ? [9, 12, 6, 4, 3] : state === 'full' ? [0, 0, 0, 0, 0] : [18, 24, 11, 9, 6];
  const players = [
    ['Haaland', 'FWD'],
    ['Palmer', 'MID · C'],
    ['Saka', 'MID'],
    ['Gabriel', 'DEF'],
    ['Raya', 'GK'],
  ].map((p, i) => [...p, playerPoints[i]]);
  return `<div class="panel squad-panel"><div class="pitch"><div class="pitch-box top"></div><div class="pitch-circle"></div><div class="pitch-box bottom"></div><div class="pitch-line"></div><div class="squad-slots">${players.map(([name, pos, points], i) => `<button class="squad-player slot-${i}" data-action="${empty ? 'squad' : 'breakdown'}">${icon(empty ? 'user' : 'five')}<strong>${empty ? 'Choose ' + pos.split(' ')[0] : name}</strong><small>${empty ? pos : live() ? points + ' pts' : pos}</small></button>`).join('')}</div></div><div class="squad-action"><div><strong>${empty ? 'Build a five worth backing.' : 'Your five are saved.'}</strong><small>${empty ? '1 GK · 1 DEF · 2 MID · 1 FWD · Pick a captain' : live() ? 'Locked squad · scores are provisional' : 'Final squad saved 20 Nov, 19:05 WAT'}</small></div><button class="btn btn--primary" data-action="${live() ? 'breakdown' : 'squad'}">${live() ? 'View points' : empty ? 'Pick my five' : 'Edit my five'} ${icon('arrow')}</button></div></div>`;
}
function rules() {
  return `<div class="rules-grid"><section class="panel rules-panel"><span class="eyebrow">THE SHORT VERSION</span><h2>Football first. Clear rules.</h2>${[
    [
      'Join, then play',
      'Registration puts you on the leaderboard immediately. If you don’t participate, you remain at the bottom with 0 points.',
    ],
    [
      kind === 'five' ? 'Build your five' : 'Only the selected fixtures count',
      kind === 'five'
        ? `Save a valid squad and captain before the official deadline. This competition uses Streak Five scoring and Gameweek ${escapeHtml(config().gameweekId)}.`
        : 'Use the campaign cards or the ordinary Markets page. Your first qualifying paid prediction on each selected fixture counts after registration; stake size does not affect campaign points.',
    ],
    [
      'The points',
      kind === 'five'
        ? 'Follow each player’s points and your captain’s multiplier. Scores remain provisional until the gameweek is finalized.'
        : 'Correct result: 3 points. Wrong or missed result: 0. Pending or refunded late predictions do not earn points.',
    ],
    [
      'Same points? Earlier wins.',
      kind === 'five'
        ? 'The earlier save of your final squad and captain ranks higher. Unchanged saves and retries do not reset the timestamp.'
        : 'The earlier last qualifying campaign prediction ranks higher. Duplicate and non-campaign predictions do not change this time.',
    ],
    [
      kind === 'five' ? 'Your deadline' : 'Limited places in each market',
      kind === 'five'
        ? `The chosen gameweek follows its official FPL deadline. Your saved final squad and captain count.`
        : 'Each prediction market has 32 position slots, including predictions outside the campaign. Joining or adding a pick does not reserve one.',
    ],
  ]
    .map(
      ([h, p], i) =>
        `<div class="rule"><span>${String(i + 1).padStart(2, '0')}</span><div><h3>${h}</h3><p>${p}</p></div></div>`,
    )
    .join(
      '',
    )}</section><section class="panel reward-rules"><span class="reward-trophy">${icon('trophy')}</span><h2>$${prizeTotal()} in CKB</h2><p>${prizeAmounts.length} prize places · ${prizesLabel()}.</p><div class="reward-slots">${prizeAmounts.map((amount, index) => `<div><span>Place ${index + 1}</span><strong>$${amount} <small>in CKB</small></strong></div>`).join('')}</div><p class="muted">Planned campaign rewards will be held in a dedicated organizer-controlled mainnet wallet, separate from testnet game funds. Final payouts require organizer approval. Winners verify a mainnet receiving address before payout.</p><p class="muted">Token amounts, payout date and exceptional match rules must be published before the live campaign opens.</p></section></div>`;
}
function competitionNavigation() {
  return ['predictions', 'five']
    .filter((item) => !deletedPreview(item))
    .map(
      (item) =>
        `<button class="nav-item ${kind === item ? 'active' : ''}" data-kind="${item}">${icon(item === 'five' ? 'five' : 'trophy')}<span>${escapeHtml(getApplied(item).name)}<small>${kind === item ? statusLabel() : item === 'five' ? `Gameweek ${escapeHtml(getApplied(item).gameweekId)}` : 'Prediction challenge'}</small></span></button>`,
    )
    .join('');
}
function deletionControl() {
  return `<button class="btn btn--delete-outline" data-action="delete-review">${icon('trash')}Delete competition</button>`;
}
function deletedPage() {
  const removed = deletedPreview(kind);
  return `<section class="panel deleted-competition"><span class="deleted-icon">${icon('trash')}</span><span class="eyebrow">COMPETITION DELETED</span><h1>${escapeHtml(removed.name)}</h1><p>This competition is no longer listed or accepting registrations.</p><p class="muted">Predictions, Five squads, payment recovery and existing awards are preserved independently.</p>${view === 'admin' ? `<button class="btn btn--primary" data-action="new-competition">Create another competition ${icon('arrow')}</button>` : ''}<small>Design preview only. No live competition or financial record has changed.</small></section>`;
}
function deletionIsCurrent() {
  return (
    deleteReview &&
    view === 'admin' &&
    kind === deleteReview.kind &&
    !deletedPreview(kind) &&
    state === deleteReview.state &&
    JSON.stringify(config()) === deleteReview.snapshot
  );
}
function showDeletionStep(step) {
  if (!deletionIsCurrent()) {
    closeModal();
    notice('The competition changed. Review its details before deleting.');
    return;
  }
  const name = escapeHtml(deleteReview.name);
  deleteReview.step = step;
  if (step === 1) {
    modal(
      'Delete this competition?',
      `<span class="badge badge--amber">STEP 1 OF 2 · REVIEW</span><div class="delete-target">${icon('trophy')}<strong>${name}</strong><small>${kind === 'five' ? `Streak Five · Gameweek ${escapeHtml(config().gameweekId)}` : `${fixtures.length} selected fixtures`}</small></div><p>It will disappear from competition listings and stop accepting new registrations.</p><ul class="delete-effects"><li>Its results and deletion history remain in the admin archive.</li><li>Existing predictions, squads and payment recovery stay intact.</li><li>Deleting the listing does not cancel any prizes already owed.</li></ul><p class="muted">Next, you will type the competition name to confirm. This preview only changes sample data.</p>`,
      `<div class="delete-actions"><button class="btn" data-action="close">Keep competition</button><button class="btn btn--delete-outline" data-action="delete-next">Continue ${icon('arrow')}</button></div>`,
    );
  } else {
    modal(
      'Confirm deletion',
      `<span class="badge badge--amber">STEP 2 OF 2 · CONFIRM</span><p>Type the exact competition name below.</p><div class="delete-name">${name}</div><label class="field-label" for="delete-name-input">Competition name<input id="delete-name-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="delete-match" /></label><p id="delete-match" class="delete-match" aria-live="polite">Use the same letters, capitals and spaces.</p><p class="muted">This removes the competition listing. Financial records and existing obligations are retained.</p>`,
      `<div class="delete-actions"><button class="btn" data-action="delete-back">${icon('back')}Back</button><button class="btn btn--danger" data-action="delete-confirm" disabled>${icon('trash')}Delete competition</button></div>`,
    );
    document.getElementById('delete-name-input').focus({ preventScroll: true });
  }
}
function adminPage() {
  return `<div class="studio-admin-header"><nav class="studio-navigation" aria-label="Competition administration">${[
    ['setup', 'Set up'],
    ['monitor', 'Manage'],
    ['evidence', 'Evidence'],
  ]
    .map(
      ([key, label]) =>
        `<button data-admin-panel="${key}" aria-pressed="${adminPanel === key}" class="${adminPanel === key ? 'active' : ''}">${icon(key === 'setup' ? 'trophy' : key === 'monitor' ? 'user' : 'activity')}${label}</button>`,
    )
    .join(
      '',
    )}</nav>${!deletedPreview(kind) ? deletionControl() : ''}</div><div id="admin-content">${adminContent()}</div>`;
}
function adminContent() {
  if (deletedPreview(kind) && !(creating.has(kind) && adminPanel === 'setup')) return deletedPage();
  if (adminPanel === 'setup')
    return renderSetup({
      kind,
      draft: getDraft(kind),
      ui: setupUi,
      catalog,
      icon,
      error: setupError,
    });
  if (adminPanel === 'evidence') return renderEvidence({ kind, icon, config: config() });
  return renderAdmin({ kind, state, icon, config: config() });
}
function refreshSetup(restore) {
  const node = document.getElementById('admin-content');
  if (!node) return;
  node.innerHTML = adminContent();
  syncControls();
  if (restore) {
    const fields = [...node.querySelectorAll('[data-setup-field]')];
    const field = fields.find(
      (n) =>
        n.dataset.setupField === restore.field &&
        (!restore.id || n.dataset.prizeId === restore.id) &&
        (!restore.value || n.type !== 'radio' || n.value === restore.value),
    );
    if (field) {
      field.focus({ preventScroll: true });
      if (typeof restore.start === 'number' && ['text', 'search', 'textarea'].includes(field.type))
        field.setSelectionRange(restore.start, restore.end);
    }
  }
}
function setupAction(button) {
  const draft = getDraft(kind),
    action = button.dataset.setupAction;
  setupError = '';
  if (action === 'step') setupUi.step = button.dataset.step;
  else if (action === 'toggle-fixture') {
    const id = button.dataset.id;
    if (!catalog.some((f) => f.id === id && f.eligible)) return;
    draft.fixtureIds = draft.fixtureIds.includes(id)
      ? draft.fixtureIds.filter((x) => x !== id)
      : [...draft.fixtureIds, id];
  } else if (action === 'selected-only') setupUi.selectedOnly = !setupUi.selectedOnly;
  else if (action === 'select-visible') {
    const search = setupUi.search.trim().toLowerCase();
    const visible = catalog.filter(
      (f) =>
        f.eligible &&
        (setupUi.league === 'all' || f.league === setupUi.league) &&
        (!setupUi.selectedOnly || draft.fixtureIds.includes(f.id)) &&
        `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(search),
    );
    draft.fixtureIds = [...new Set([...draft.fixtureIds, ...visible.map((f) => f.id)])];
  } else if (action === 'add-prize')
    draft.prizes.push({ id: 'place-' + crypto.randomUUID(), amount: '10' });
  else if (action === 'remove-prize')
    draft.prizes = draft.prizes.filter((p) => p.id !== button.dataset.id);
  else if (action === 'preset-prizes')
    draft.prizes = (
      button.dataset.preset === 'equal' ? ['10', '10', '10', '10', '10'] : ['25', '15', '10']
    ).map((amount, i) => ({ id: 'place-' + i, amount }));
  else if (action === 'save-draft') {
    notice(
      saveDraft(kind)
        ? 'Design draft saved in this browser.'
        : 'Draft remains in this tab; browser storage is unavailable.',
    );
    return;
  } else if (action === 'reset') {
    resetDraft(kind);
    setupUi.search = '';
    setupUi.league = 'all';
    setupUi.selectedOnly = false;
    notice('Sample settings restored.');
  } else if (action === 'apply-preview') {
    setupError = applyDraft(kind);
    if (!setupError) {
      creating.delete(kind);
      view = 'player';
      state = 'open';
      tab = 'play';
      selected = new Set();
      squadSaved = false;
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      notice('Your settings are shown in the player preview. Nothing was published.');
      return;
    }
  }
  refreshSetup();
  const selector =
    action === 'toggle-fixture'
      ? `[data-setup-action="toggle-fixture"][data-id="${CSS.escape(button.dataset.id)}"]`
      : action === 'step'
        ? `[data-setup-action="step"][data-step="${setupUi.step}"]`
        : action === 'add-prize'
          ? '[data-setup-action="add-prize"]'
          : null;
  if (selector) document.querySelector(selector)?.focus({ preventScroll: true });
}
function setupInput(e) {
  const field = e.target.dataset.setupField;
  if (!field || view !== 'admin' || adminPanel !== 'setup') return;
  if (e.type === 'input' && ['radio', 'select-one', 'datetime-local'].includes(e.target.type))
    return;
  if (e.type === 'change' && !['radio', 'select-one', 'datetime-local'].includes(e.target.type))
    return;
  const draft = getDraft(kind),
    value = e.target.value;
  const restore = {
    field,
    id: e.target.dataset.prizeId,
    value,
    start: e.target.selectionStart,
    end: e.target.selectionEnd,
  };
  if (field === 'search' || field === 'league') setupUi[field] = value;
  else if (field === 'prize') {
    const p = draft.prizes.find((p) => p.id === restore.id);
    if (p) p.amount = value.slice(0, 12);
  } else if (['name', 'description', 'registrationDeadline', 'gameweekId'].includes(field))
    draft[field] = value;
  setupError = '';
  refreshSetup(restore);
}
document.addEventListener('input', setupInput);
document.addEventListener('change', setupInput);
function render() {
  fixtures = catalog.filter((f) => config().fixtureIds.includes(f.id));
  prizeAmounts = config().prizes.map((p) => (amountCents(p.amount) ?? 0) / 100);
  syncControls();
  document.getElementById('app').innerHTML = shell();
}
function notice(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (node.hidden = true), 4000);
}
function modal(title, body, footer = '') {
  const d = document.getElementById('detail');
  if (!d.open) returnFocus = document.activeElement;
  d.innerHTML = `<header><div><span class="eyebrow">STREAK COMPETITIONS</span><h2 id="dialog-title">${title}</h2></div><button class="icon-btn" aria-label="Close dialog" data-action="close">${icon('close')}</button></header><div class="dialog-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}`;
  if (!d.open) d.showModal();
}
function closeModal() {
  document.getElementById('detail').close();
  if (returnFocus?.isConnected) returnFocus.focus();
}
document.addEventListener('change', (e) => {
  if (!['kind', 'scenario', 'view'].includes(e.target.id)) return;
  if (e.target.id === 'kind') kind = e.target.value;
  if (e.target.id === 'scenario') {
    state = e.target.value;
    selected = new Set();
    squadSaved = false;
    tab = 'play';
  }
  if (e.target.id === 'view') view = e.target.value;
  render();
});
document.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.dataset.setupAction) return setupAction(button);
  if (button.dataset.adminPanel) {
    adminPanel = button.dataset.adminPanel;
    return render();
  }
  if (
    !button.dataset.action &&
    !button.dataset.kind &&
    !button.dataset.tab &&
    !button.dataset.player &&
    button.dataset.pick === undefined
  )
    return;
  if (button.dataset.kind) {
    kind = button.dataset.kind;
    tab = 'play';
    return render();
  }
  if (button.dataset.tab) {
    tab = button.dataset.tab;
    render();
    document.getElementById('tab-' + tab)?.focus();
    return;
  }
  if (button.dataset.player) {
    const r = rows().find((r) => r.rank === Number(button.dataset.player));
    modal(
      r.name,
      `<div class="detail-score">${avatar(r)}<div><strong>#${r.rank} · ${r.points} points</strong><p>${r.noEntry ? 'Registered but did not participate.' : kind === 'five' ? 'Final squad saved ' + r.time : 'Last qualifying prediction ' + r.time}</p></div></div>${r.noEntry ? '<p>No entry was placed. Registration is preserved on the final leaderboard.</p>' : r.you ? (kind === 'five' ? squadSummary() : predictionSummary()) : '<p>Verified points determine rank first. Equal points are ordered by the earlier final entry.</p>'}`,
    );
    return;
  }
  if (button.dataset.pick !== undefined) {
    if (state === 'open')
      return modal(
        'Join ' + title(),
        '<p>Join free to appear on the leaderboard, then make your calls.</p>',
        `<button class="btn btn--primary" data-action="confirm-join">Join in preview ${icon('arrow')}</button>`,
      );
    const f = fixtures[Number(button.dataset.pick)];
    modal(
      'Your prediction slip',
      `<span class="badge badge--mint">${f.home} v ${f.away}</span><h3>${button.dataset.choice === 'Draw' ? 'Match to end in a draw' : button.dataset.choice === 'Home' ? f.home + ' to win' : f.away + ' to win'}</h3><p>100 tCKB stake + 321 tCKB refundable storage. The real app will review the network fee and ask for wallet approval.</p><p class="muted">In the app, this opens the existing prediction slip used by Markets, with its normal stake editing, review, wallet approval and payment tracking. This standalone preview sends nothing.</p>`,
      `<button class="btn btn--primary" data-action="close">Back to competition ${icon('back')}</button>`,
    );
    return;
  }
  switch (button.dataset.action) {
    case 'delete-review':
      if (view !== 'admin' || deletedPreview(kind)) return;
      deleteReview = {
        kind,
        name: config().name,
        snapshot: JSON.stringify(config()),
        state,
        step: 1,
      };
      showDeletionStep(1);
      break;
    case 'delete-next':
      if (deleteReview?.step === 1) showDeletionStep(2);
      break;
    case 'delete-back':
      if (deleteReview?.step === 2) showDeletionStep(1);
      break;
    case 'delete-confirm': {
      if (!deletionIsCurrent()) return showDeletionStep(1);
      if (
        deleteReview.step !== 2 ||
        document.getElementById('delete-name-input')?.value !== deleteReview.name
      )
        return;
      const result = deletePreview(kind, deleteReview.name);
      if (!result) return showDeletionStep(1);
      closeModal();
      creating.delete(kind);
      selected = new Set();
      squadSaved = false;
      render();
      document.getElementById('main').focus();
      notice(
        result.persisted
          ? 'Sample competition deleted. No live records changed.'
          : 'Deleted in this tab. Browser storage is unavailable.',
      );
      break;
    }
    case 'new-competition':
      if (view !== 'admin' || !deletedPreview(kind)) return;
      resetDraft(kind);
      creating.add(kind);
      adminPanel = 'setup';
      setupUi.step = 'basics';
      setupError = '';
      render();
      document.getElementById('setup-name')?.focus();
      break;
    case 'close':
      closeModal();
      break;
    case 'join':
      modal(
        'Join ' + title(),
        `<p>Make your mark on the matchweek. You’ll appear on the leaderboard as soon as you join.</p><label class="field-label">Display name<input value="Somtee" readonly /></label><div class="join-rules">${icon('check')} Free entry · ${kind === 'five' ? `Gameweek ${escapeHtml(config().gameweekId)}` : `${fixtures.length} selected fixtures`}<br/>${icon('trophy')} ${prizeAmounts.length} prize places: ${prizesLabel()} in CKB</div><p class="muted">Joining confirms the competition rules. No wallet request or real registration is made in this preview.</p>`,
        `<button class="btn btn--primary" data-action="confirm-join">Join in preview ${icon('arrow')}</button>`,
      );
      break;
    case 'confirm-join':
      closeModal();
      state = 'registered';
      tab = 'leaderboard';
      render();
      notice('You’re registered and ranked #24. Your points start at 0.');
      break;
    case 'breakdown':
      modal(
        kind === 'five' ? 'Your player points' : 'Your prediction points',
        inactive() ? emptyEntry() : kind === 'five' ? squadSummary() : predictionSummary(),
      );
      break;
    case 'award':
      modal(
        'Your second-place award',
        `<div class="award-amount">$${awardFor(myResult().rank)} <span>in CKB</span></div>${badge('Payout pending', 'amber')}<p>Rank #2 is final. Your prize has not been marked as paid.</p><label class="field-label">Mainnet CKB receiving address<input placeholder="ckb1…" disabled/></label><p class="muted">The live app will ask you to confirm your receiving address while signed in. Address submission is unavailable in this design preview.</p>`,
      );
      break;
    case 'payment':
      modal(
        'Prize payment details',
        `${badge('Paid · sample state', 'mint')}<p>Winner: Somtee · Award: $${awardFor(myResult().rank)} worth of mainnet CKB.</p><p class="muted">This is a sample payment state. No funds were sent and no explorer transaction is fabricated.</p>`,
      );
      break;
    case 'payout-preview':
      modal(
        'Competition prize payments',
        `${badge(state === 'paid' ? `1 of ${prizeAmounts.length} awards paid` : 'Awaiting payout', state === 'paid' ? 'mint' : 'amber')}<p>${prizeAmounts.length} awards totalling $${prizeTotal()} equivalent in mainnet CKB. Winners must confirm their receiving addresses before payment.</p><p class="muted">This is a sample payment state. No funds were sent and no explorer transaction is fabricated.</p>`,
      );
      break;
    case 'squad':
      modal(
        'Your Five squad',
        squadSummary() +
          `<p class="muted">The live competition opens the existing squad editor on Gameweek ${escapeHtml(config().gameweekId)}. This preview shows a sample complete squad.</p>`,
        `<button class="btn btn--primary" data-action="save-squad">Preview saved squad ${icon('check')}</button>`,
      );
      break;
    case 'save-squad':
      squadSaved = true;
      closeModal();
      render();
      notice('Sample squad saved. No live gameweek was changed.');
      break;
    case 'toggle-admin':
      view = view === 'admin' ? 'player' : 'admin';
      render();
      break;
    case 'admin-finalize':
      modal(
        'Finalize competition',
        `<p>Finalization locks the verified standings and the three awards. Prize payment is a separate step.</p><p class="muted">This preview only switches the displayed state.</p>`,
        `<button class="btn btn--primary" data-action="confirm-finalize">Preview final standings ${icon('check')}</button>`,
      );
      break;
    case 'confirm-finalize':
      closeModal();
      state = 'finished';
      render();
      break;
    case 'share':
      navigator.clipboard
        ?.writeText(location.href)
        .then(() => notice('Local preview link copied.'))
        .catch(() => notice('Copy this page’s local URL to share the preview.'));
      break;
    case 'competitions':
      modal(
        'Your competitions',
        ['predictions', 'five']
          .filter((item) => !deletedPreview(item))
          .map(
            (item) =>
              `<button class="competition-link" data-action="switch-${item}">${icon(item === 'five' ? 'five' : 'trophy')}${escapeHtml(getApplied(item).name)} ${icon('arrow')}</button>`,
          )
          .join('') || '<p>No competitions are listed.</p>',
      );
      break;
    case 'switch-predictions':
    case 'switch-five':
      kind = button.dataset.action === 'switch-five' ? 'five' : 'predictions';
      closeModal();
      tab = 'play';
      render();
      break;
    case 'evidence-export': {
      const csv =
        'SYNTHETIC DESIGN PREVIEW - NOT GRANT EVIDENCE\nnetwork,data_mode,transaction_id,status,stake_tckb\ntestnet,synthetic,DEMO-TX-01,confirmed,500\ntestnet,synthetic,DEMO-TX-02,confirmed,200\n';
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SYNTHETIC-streak-evidence-preview.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice('Sample export only. Do not use it as grant evidence.');
      break;
    }
    case 'export': {
      const blob = new Blob(
        [
          'SYNTHETIC DESIGN PREVIEW - NOT PAYOUT INSTRUCTIONS\nRank,Player,Points\n' +
            rows()
              .map((r) => `${r.rank},${r.name},${r.points}`)
              .join('\n'),
        ],
        { type: 'text/csv' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'streak-preview-standings.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice('Sample standings exported.');
      break;
    }
    default:
      notice('Design preview: use the competition and state controls above.');
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'delete-name-input' && deleteReview?.step === 2) {
    const matches = deletionIsCurrent() && e.target.value === deleteReview.name;
    document.querySelector('[data-action="delete-confirm"]').disabled = !matches;
    document.getElementById('delete-match').textContent = matches
      ? 'Name matches. You can delete this competition.'
      : e.target.value
        ? 'The name does not match yet.'
        : 'Use the same letters, capitals and spaces.';
  }
  if (e.target.matches('[data-admin-search]')) {
    const q = e.target.value.toLowerCase();
    document
      .querySelectorAll('tr[data-admin-row]')
      .forEach((row) => (row.hidden = !row.textContent.toLowerCase().includes(q)));
  }
});
document.getElementById('detail').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.getElementById('detail').addEventListener('close', () => {
  deleteReview = null;
  if (returnFocus?.isConnected) returnFocus.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.target.getAttribute('role') !== 'tab') return;
  const keys = ['play', 'leaderboard', 'rules'];
  let index = keys.indexOf(e.target.dataset.tab);
  if (e.key === 'ArrowRight') index = (index + 1) % 3;
  else if (e.key === 'ArrowLeft') index = (index + 2) % 3;
  else if (e.key === 'Home') index = 0;
  else if (e.key === 'End') index = 2;
  else return;
  e.preventDefault();
  tab = keys[index];
  render();
  document.getElementById('tab-' + tab).focus();
});
render();
observeSelectControls(document.body);
