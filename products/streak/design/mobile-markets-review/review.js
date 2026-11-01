import { observeSelectControls } from '/select-controls.js';
observeSelectControls(document.body);
const $ = (id) => document.getElementById(id);
const fixtures = [
  {
    league: 'Premier League',
    code: 'PL',
    home: 'Arsenal',
    away: 'Chelsea',
    h: 'ARS',
    a: 'CHE',
    colors: ['red', 'blue'],
    time: '17:30',
    state: 'open',
    rank: 1,
    odds: ['2.10', '3.40', '3.60'],
  },
  {
    league: 'Premier League',
    code: 'PL',
    home: 'Manchester City',
    away: 'Liverpool',
    h: 'MCI',
    a: 'LIV',
    colors: ['sky', 'red'],
    time: '20:00',
    state: 'open',
    rank: 2,
    odds: ['1.95', '3.60', '3.90'],
  },
  {
    league: 'Serie A',
    code: 'SA',
    home: 'AC Milan',
    away: 'Inter',
    h: 'MIL',
    a: 'INT',
    colors: ['red', 'blue'],
    time: '15:00',
    state: 'locked',
    rank: 4,
    odds: ['2.80', '3.10', '2.50'],
  },
  {
    league: 'Champions League',
    code: 'CL',
    home: 'Real Madrid',
    away: 'Bayern München',
    h: 'RMA',
    a: 'BAY',
    colors: ['gold', 'red'],
    time: '20:00',
    state: 'results',
    rank: 3,
    odds: ['2.20', '3.50', '3.20'],
  },
];
let status = 'all';
function render() {
  const query = $('search-input').value.toLowerCase().trim();
  const rows = fixtures
    .filter(
      (f) =>
        (status === 'all' || f.state === status) &&
        ($('league').value === 'all' || f.league === $('league').value) &&
        `${f.home} ${f.away} ${f.league}`.toLowerCase().includes(query),
    )
    .sort((a, b) =>
      $('sort').value === 'kickoff' ? a.time.localeCompare(b.time) : a.rank - b.rank,
    );
  $('count').textContent = `${rows.length} ${rows.length === 1 ? 'fixture' : 'fixtures'}`;
  $('empty').hidden = rows.length > 0;
  $('clear-search').hidden = !query;
  let previousLeague = '';
  $('fixtures').innerHTML = rows
    .map((f) => {
      const heading =
        previousLeague === f.league
          ? ''
          : `<div class="league-heading"><span class="league-emblem">${f.code}</span><div><h3>${f.league}</h3><small>Illustrative matchday</small></div><svg><use href="#chevron"/></svg></div>`;
      previousLeague = f.league;
      return `${heading}<article class="fixture"><div class="fixture-top"><div class="kickoff">${f.state === 'results' ? 'FT' : f.time}<small>${f.state === 'results' ? '2 – 1' : 'SAMPLE'}</small></div><div class="teams"><div class="team"><span class="crest ${f.colors[0]}">${f.h}</span>${f.home}</div><div class="team"><span class="crest ${f.colors[1]}">${f.a}</span>${f.away}</div></div><span class="fixture-status">${f.state.toUpperCase()}</span></div>${f.state === 'open' ? `<div class="odds" aria-label="Illustrative prices, not actionable">${f.odds.map((price, i) => `<span class="odd"><small>${['1', 'X', '2'][i]}</small>${price}</span>`).join('')}</div>` : `<p class="odds-note">${f.state === 'locked' ? 'Picks closed for this fixture.' : 'Final result · illustrative only'}</p>`}</article>`;
    })
    .join('');
}
document.querySelectorAll('[data-status]').forEach((button) =>
  button.addEventListener('click', () => {
    status = button.dataset.status;
    document
      .querySelectorAll('[data-status]')
      .forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    render();
  }),
);
$('league').addEventListener('change', render);
$('sort').addEventListener('change', render);
$('search-input').addEventListener('input', render);
$('clear-search').addEventListener('click', () => {
  $('search-input').value = '';
  render();
  $('search-input').focus();
});
$('reset-filters').addEventListener('click', () => {
  $('search-input').value = '';
  $('league').value = 'all';
  $('league').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-status="all"]').click();
});
let exitTimer, removeTimer, artworkTimer;
const intro = $('intro'),
  app = $('app');
function finishIntro() {
  clearTimeout(exitTimer);
  clearTimeout(artworkTimer);
  intro.classList.add('leaving');
  app.inert = false;
  removeTimer = setTimeout(
    () => {
      intro.hidden = true;
    },
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
  );
}
function replayIntro() {
  clearTimeout(exitTimer);
  clearTimeout(removeTimer);
  clearTimeout(artworkTimer);
  intro.hidden = false;
  intro.classList.remove('leaving');
  app.inert = true;
  const old = $('intro-logo');
  const logo = old.cloneNode();
  logo.onload = () => {
    clearTimeout(artworkTimer);
    exitTimer = setTimeout(
      finishIntro,
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 2200,
    );
  };
  logo.onerror = finishIntro;
  logo.src = `/brand/on-form-splash.svg?replay=${Date.now()}`;
  old.replaceWith(logo);
  artworkTimer = setTimeout(finishIntro, 3000);
}
document
  .querySelectorAll('.replay')
  .forEach((button) => button.addEventListener('click', replayIntro));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !intro.hidden) finishIntro();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !intro.hidden) finishIntro();
});
render();
replayIntro();
