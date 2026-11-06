import { observeSelectControls } from '/select-controls.js';

const paths = {
  back: '<path d="m14 6-6 6 6 6M8 12h12"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-8H9v8H3Z"/>',
  chart: '<path d="M3 21h18M6 17V9m6 8V3m6 14V6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  shield: '<path d="m12 3 9 4v6c0 4-6 8-9 9-3-1-9-5-9-9V7Z"/><path d="m8 12 3 3 5-6"/>',
  shirt: '<path d="m8 3-6 4 3 5 2-1v10h10V11l2 1 3-5-6-4c-1 3-7 3-8 0Z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  wallet: '<path d="M20 8V4H3v16h18V8H3"/><path d="M21 12h-6v5h6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  trophy:
    '<path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shirt}</svg>`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
document
  .querySelectorAll('[data-icon]')
  .forEach((node) => node.insertAdjacentHTML('afterbegin', icon(node.dataset.icon)));
observeSelectControls(document.body);

// Entirely illustrative scores. No player API, wallet, database or storage calls.
const players = {
  jackson: {
    name: 'N. Jackson',
    club: 'CHE',
    kit: 'blue',
    position: 'FWD',
    points: 6,
    lines: [
      ['Appearance', 2],
      ['Goals', 4],
    ],
  },
  tavernier: {
    name: 'Tavernier',
    club: 'BOU',
    kit: 'red-black',
    position: 'MID',
    points: 3,
    lines: [
      ['Appearance', 2],
      ['Clean sheet', 1],
    ],
  },
  rice: {
    name: 'Rice',
    club: 'ARS',
    kit: 'red',
    position: 'MID',
    points: 6,
    lines: [
      ['Appearance', 2],
      ['Assist', 3],
      ['Clean sheet', 1],
    ],
  },
  calafiori: {
    name: 'Calafiori',
    club: 'ARS',
    kit: 'red',
    position: 'DEF',
    points: 6,
    lines: [
      ['Appearance', 2],
      ['Clean sheet', 4],
    ],
  },
  donnarumma: {
    name: 'Donnarumma',
    club: 'MCI',
    kit: 'gold',
    position: 'GK',
    points: 2,
    lines: [['Appearance', 2]],
  },
  haaland: {
    name: 'Haaland',
    club: 'MCI',
    kit: 'sky',
    position: 'FWD',
    points: 4,
    lines: [
      ['Appearance', 1],
      ['Assist', 3],
    ],
  },
  palmer: {
    name: 'Palmer',
    club: 'CHE',
    kit: 'blue',
    position: 'MID',
    points: 4,
    lines: [
      ['Appearance', 2],
      ['Assist', 3],
      ['Yellow card', -1],
    ],
  },
  saliba: {
    name: 'Saliba',
    club: 'ARS',
    kit: 'red',
    position: 'DEF',
    points: 2,
    lines: [['Appearance', 2]],
  },
  raya: {
    name: 'Raya',
    club: 'ARS',
    kit: 'gold',
    position: 'GK',
    points: 3,
    lines: [
      ['Appearance', 2],
      ['Saves', 1],
    ],
  },
  sanchez: {
    name: 'Sánchez',
    club: 'CHE',
    kit: 'gold',
    position: 'GK',
    points: 3,
    lines: [
      ['Appearance', 2],
      ['Saves', 1],
    ],
  },
  watkins: {
    name: 'Watkins',
    club: 'AVL',
    kit: 'claret',
    position: 'FWD',
    points: 2,
    lines: [['Appearance', 2]],
  },
  saka: {
    name: 'Saka',
    club: 'ARS',
    kit: 'red',
    position: 'MID',
    points: 5,
    lines: [
      ['Appearance', 2],
      ['Assist', 3],
    ],
  },
  virgil: {
    name: 'Van Dijk',
    club: 'LIV',
    kit: 'red',
    position: 'DEF',
    points: 4,
    lines: [
      ['Appearance', 2],
      ['Bonus', 2],
    ],
  },
  pickford: {
    name: 'Pickford',
    club: 'EVE',
    kit: 'gold',
    position: 'GK',
    points: 2,
    lines: [['Appearance', 2]],
  },
  bruno: {
    name: 'B. Fernandes',
    club: 'MUN',
    kit: 'red',
    position: 'MID',
    points: 3,
    lines: [
      ['Appearance', 2],
      ['Bonus', 1],
    ],
  },
  mitoma: {
    name: 'Mitoma',
    club: 'BHA',
    kit: 'blue',
    position: 'MID',
    points: 1,
    lines: [
      ['Appearance', 2],
      ['Yellow card', -1],
    ],
  },
  robinson: {
    name: 'Robinson',
    club: 'FUL',
    kit: 'white',
    position: 'DEF',
    points: 1,
    lines: [
      ['Appearance', 2],
      ['Goals conceded', -1],
    ],
  },
  sels: {
    name: 'Sels',
    club: 'NFO',
    kit: 'gold',
    position: 'GK',
    points: 1,
    lines: [
      ['Appearance', 2],
      ['Goals conceded', -1],
    ],
  },
};
const managers = [
  {
    id: 0,
    name: 'Away Days FC',
    initials: 'AD',
    wallet: 'ckt1q…7h2p',
    squad: ['jackson', 'tavernier', 'rice', 'calafiori', 'donnarumma'],
    captain: 'tavernier',
    prize: '2,500',
  },
  {
    id: 1,
    name: 'Pitch Perfect',
    initials: 'PP',
    wallet: 'ckt1q…9w6n',
    squad: ['haaland', 'rice', 'palmer', 'saliba', 'sanchez'],
    captain: 'rice',
  },
  {
    id: 2,
    name: 'Sunday XI',
    initials: 'SX',
    wallet: 'ckt1q…3f8b',
    squad: ['watkins', 'saka', 'rice', 'virgil', 'pickford'],
    captain: 'saka',
  },
  {
    id: 3,
    name: 'No Easy Fixtures',
    initials: 'NE',
    wallet: 'ckt1q…6r5x',
    squad: ['jackson', 'palmer', 'bruno', 'virgil', 'pickford'],
    captain: 'palmer',
  },
  {
    id: 4,
    name: 'Green Cell FC',
    initials: 'GC',
    wallet: 'ckt1q…4z9c',
    squad: ['haaland', 'mitoma', 'tavernier', 'robinson', 'sels'],
    captain: 'mitoma',
  },
  {
    id: 5,
    name: 'Somto FC',
    initials: 'SF',
    wallet: 'ckt1q…8m4k',
    squad: ['watkins', 'tavernier', 'mitoma', 'robinson', 'sels'],
    captain: 'tavernier',
    own: true,
  },
];
let scenario = new URLSearchParams(location.search).get('state') || 'final';
if (!['final', 'live', 'private', 'join'].includes(scenario)) scenario = 'final';
let enteredName = false;
let selected = 0;
let selectedPlayer = null;
let priorFocus;
let toastTimer;
const squadDialog = document.querySelector('#squad-dialog');
const nameDialog = document.querySelector('#name-dialog');
const scenarioSelect = document.querySelector('#scenario');

function score(id) {
  if (scenario === 'private' || scenario === 'join') return null;
  if (scenario === 'live' && ['jackson', 'donnarumma', 'haaland', 'sels'].includes(id)) return null;
  if (scenario === 'live' && id === 'rice')
    return {
      points: 3,
      lines: [
        ['Appearance', 2],
        ['Clean sheet', 1],
      ],
      live: true,
    };
  return players[id];
}
function total(manager) {
  return manager.squad.reduce(
    (sum, id) => sum + (score(id)?.points ?? 0) * (manager.captain === id ? 2 : 1),
    0,
  );
}
function rows() {
  return [...managers].sort((a, b) => total(b) - total(a) || a.id - b.id);
}
function jersey(player) {
  return `<svg class="jersey kit-${player.kit}" viewBox="0 0 80 80" aria-hidden="true"><path class="shirt-body" d="M24 7 7 20 17 38 26 33 23 72Q40 78 57 72L54 33 63 38 73 20 56 7Q40 19 24 7Z"/><path class="shirt-edge" d="M24 7Q40 25 56 7M26 33l-3 39m31-39 3 39"/><path class="shirt-detail" d="M7 20 17 38l9-5-2-26M56 7l-2 26 9 5 10-18"/><g class="cell-crest"><rect x="46" y="25" width="5" height="5"/><rect x="51" y="30" width="5" height="5"/><rect x="46" y="35" width="5" height="5"/></g><text x="40" y="55" text-anchor="middle">${player.club}</text></svg>`;
}
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}
function renderRows(query = '') {
  const list = document.querySelector('#manager-list');
  if (!list) return;
  const ordered = rows();
  const matching = ordered.filter((m) =>
    `${m.name} ${m.wallet}`.toLowerCase().includes(query.toLowerCase()),
  );
  list.innerHTML =
    matching
      .map((manager) => {
        const rank = ordered.indexOf(manager) + 1;
        return `<li><button type="button" class="manager-row ${manager.own ? 'own' : ''}" data-manager="${manager.id}" aria-label="View ${escape(manager.name)} squad, rank ${rank}, ${total(manager)} points">
      <span class="rank ${rank === 1 ? 'first' : ''}">${rank === 1 ? icon('trophy') : rank}<span class="sr-only">${rank === 1 ? '1' : ''}</span></span>
      <span class="avatar avatar-${manager.id}">${escape(manager.initials)}</span>
      <span class="manager-name"><strong>${escape(manager.name)} ${manager.own ? '<span class="you-tag">You</span>' : ''}</strong><code>${manager.wallet}</code>${scenario === 'final' && manager.prize ? `<span class="mobile-reward">${manager.prize} tCKB allocated</span>` : ''}</span>
      <span class="row-points"><strong>${total(manager)}</strong><small>pts</small></span>
      <span class="row-prize">${scenario === 'final' && manager.prize ? `<span>${manager.prize} tCKB</span><small>Allocated</small>` : '<span class="prize-empty">—</span>'}</span>
      <span class="row-arrow">${icon('next')}</span></button></li>`;
      })
      .join('') || '<li class="no-results">No managers match that name or wallet.</li>';
}
function render() {
  scenarioSelect.value = scenario;
  scenarioSelect.dispatchEvent(new Event('change', { bubbles: false }));
  const privateRound = scenario === 'private' || scenario === 'join';
  const ownRank = rows().findIndex((m) => m.own) + 1;
  document.querySelector('#content').innerHTML = privateRound
    ? `
    <section class="board private-board"><header class="board-heading"><div><p class="eyebrow">THE WEEKEND TABLE</p><h2>Everyone has a place.</h2></div><span class="status-pill">Picks open</span></header>
      <div class="private-content"><div class="privacy-icon">${icon('lock')}</div><h3>A little mystery before matchday.</h3><p>Squads and standings open after the deadline.<br>Your five stay private until then.</p><span class="deadline">6 managers entered · Sample deadline: Fri, 7:30 PM</span><button class="primary" data-action="my-five">${enteredName ? 'Continue to my five' : 'Pick your five'} ${icon('next')}</button></div></section>`
    : `
    <section class="board" aria-label="Gameweek standings"><header class="board-heading"><div><p class="eyebrow">THE WEEKEND TABLE</p><h2>${scenario === 'final' ? 'Final standings' : 'Live standings'}</h2><p class="subtext">6 managers <span>·</span> ${scenario === 'final' ? 'Every point counted.' : 'Provisional points. Updates as matches progress.'}</p></div><span class="status-pill ${scenario === 'live' ? 'live' : 'complete'}">${scenario === 'final' ? icon('check') : '<span class="live-dot"></span>'}${scenario === 'final' ? 'Gameweek finished' : 'Live'}</span></header>
      <div class="board-toolbar"><label class="search">${icon('search')}<input type="search" id="manager-search" placeholder="Find a manager" aria-label="Find a manager" autocomplete="off" /></label><button class="your-place" data-action="find-me">Your place <strong>#${ownRank}</strong>${icon('next')}</button></div>
      <div class="column-labels" aria-hidden="true"><span>#</span><span>MANAGER</span><span>POINTS</span><span>REWARD</span><span></span></div>
      <ol class="manager-list" id="manager-list"></ol><footer class="board-footer">${icon('shirt')}<span>Tap a manager to see their five on the pitch.</span><span class="update-time">${scenario === 'final' ? 'Final scores' : 'Updated just now'}</span></footer></section>`;
  renderRows();
  document
    .querySelector('#manager-search')
    ?.addEventListener('input', (event) => renderRows(event.target.value));
}
function pointDetail(id, manager) {
  const player = players[id],
    result = score(id),
    captain = manager.captain === id;
  return `<section class="player-detail" aria-labelledby="footballer-title"><button class="back-link" data-action="back-pitch">${icon('back')}Back to pitch</button><div class="footballer-heading">${jersey(player)}<div><p class="eyebrow">${player.club} · ${player.position}</p><h3 id="footballer-title">${player.name}</h3>${captain ? '<span class="captain-label">Captain · Double points</span>' : ''}</div></div>${result ? `<div class="score-lines">${result.lines.map(([label, points]) => `<div><span>${label}</span><strong>${points > 0 ? '+' : ''}${points}</strong></div>`).join('')}${captain ? `<div><span>Captain bonus <small>×2</small></span><strong>+${result.points}</strong></div>` : ''}<div class="score-sum"><strong>Squad points</strong><strong>${result.points * (captain ? 2 : 1)}</strong></div></div><p class="detail-note">${scenario === 'final' ? 'Final gameweek points.' : 'Provisional points. They may change before finalization.'}</p>` : '<div class="pending-detail"><span class="status-pill">Awaiting points</span><p>No score has arrived for this player yet.<br>Their points will appear here when available.</p></div>'}</section>`;
}
function renderSquad() {
  const manager = managers[selected],
    rank = rows().findIndex((m) => m.id === manager.id) + 1;
  const privateRound = scenario === 'private' || scenario === 'join';
  const hidden = privateRound && !manager.own;
  const reported = manager.squad.filter((id) => score(id)).length;
  squadDialog.innerHTML = `<div class="squad-top"><button class="back-link" data-action="close-squad">${icon('back')}Back to standings</button><button class="icon-button" data-action="close-squad" aria-label="Close squad">${icon('close')}</button></div>
    <header class="squad-heading"><div class="avatar avatar-${manager.id}">${escape(manager.initials)}</div><div><p class="eyebrow">${privateRound ? 'GAMEWEEK 9' : `GAMEWEEK 9 · RANK #${rank}`}</p><h2 id="squad-title">${escape(manager.name)}${manager.own ? '<span class="you-tag">You</span>' : ''}</h2><code>${manager.wallet}</code></div><div class="squad-total"><strong>${privateRound || !reported ? '—' : total(manager)}</strong><span>${scenario === 'final' ? 'final points' : privateRound ? 'points' : 'points so far'}</span></div></header>
    ${
      hidden
        ? `<div class="locked-squad"><div class="privacy-icon">${icon('lock')}</div><h3>Under wraps until the deadline.</h3><p>This manager's picks are still private.</p></div>`
        : selectedPlayer
          ? pointDetail(selectedPlayer, manager)
          : `
    <div class="pitch-wrap"><div class="pitch" aria-label="${escape(manager.name)} squad pitch"><div class="pitch-lines" aria-hidden="true"><div class="halfway"></div><div class="centre-circle"></div><div class="penalty top"></div><div class="penalty bottom"></div></div>
    ${manager.squad
      .map((id, slot) => {
        const player = players[id],
          result = score(id),
          captain = manager.captain === id;
        return `<button class="pitch-player slot-${slot}" data-player="${id}" aria-label="${player.name}, ${player.position}${captain ? ', captain' : ''}, ${result ? result.points * (captain ? 2 : 1) + ' points' : 'awaiting points'}"><span class="player-shirt">${jersey(player)}${captain ? '<span class="captain-badge" aria-label="Captain">C</span>' : ''}</span><strong class="player-name">${player.name}</strong><span class="player-score ${result ? '' : 'pending'}">${privateRound ? player.position : result ? `${result.points * (captain ? 2 : 1)} pts${result.live ? '<span class="live-dot"></span>' : ''}` : 'Awaiting points'}</span></button>`;
      })
      .join(
        '',
      )}</div><div class="pitch-caption"><span><span class="mini-captain">C</span> Captain points doubled</span><span>Tap a shirt for points</span></div></div>`
    }
    ${!hidden && !selectedPlayer ? `<div class="squad-note">${scenario === 'final' && manager.prize ? `<div class="reward-note">${icon('trophy')}<div><strong>${manager.prize} tCKB allocated</strong><span>Allocation recorded. Payment is tracked separately.</span></div></div>` : `<p>${privateRound ? 'Your sample squad. Picks stay private until the deadline.' : scenario === 'final' ? 'All five players scored. Gameweek points are final.' : `${reported} of 5 players have points. Scores remain provisional.`}</p>`}</div>` : ''}
    ${privateRound ? '' : `<footer class="squad-footer"><button class="quiet" data-action="previous" ${rank === 1 ? 'disabled' : ''}>${icon('back')}Previous</button><span>${rank} of ${managers.length} managers</span><button class="quiet" data-action="next" ${rank === managers.length ? 'disabled' : ''}>Next${icon('next')}</button></footer>`}`;
}
function openSquad(id, trigger) {
  selected = id;
  selectedPlayer = null;
  priorFocus =
    trigger ||
    document.querySelector(`[data-manager="${id}"]`) ||
    document.querySelector('[data-action="my-five"]');
  renderSquad();
  squadDialog.showModal();
  document.body.classList.add('dialog-open');
}
function closeSquad() {
  squadDialog.close();
  document.body.classList.remove('dialog-open');
  if (priorFocus?.isConnected) priorFocus.focus({ preventScroll: true });
}
function openName(trigger) {
  priorFocus = trigger || document.querySelector('.preview-bar .streak-select-trigger');
  nameDialog.innerHTML = `<header class="name-top"><span class="eyebrow">YOUR FIRST GAMEWEEK</span><button class="icon-button" data-action="close-name" aria-label="Close name setup">${icon('close')}</button></header><div class="name-body"><span class="name-emblem">${icon('shirt')}</span><h2 id="name-title">Make a name<br>for your five.</h2><p>Choose the FPL name everyone will see<br>on the Streak Five table.</p><form id="name-form" novalidate><label for="fpl-name">FPL name <span>Required</span></label><input id="fpl-name" name="name" placeholder="e.g. Somto FC" maxlength="24" autocomplete="nickname" aria-describedby="name-help name-error" /><p id="name-help" class="field-help">3–24 characters. An FPL account isn't required.</p><p id="name-error" class="field-error" role="alert" hidden></p><div class="name-preview"><span class="avatar avatar-5" id="name-avatar">SF</span><span><strong id="name-preview-text">Your FPL name</strong><code>ckt1q…8m4k</code></span><span class="you-tag">You</span></div><button class="primary" id="save-name" type="submit" disabled>Save name & continue ${icon('next')}</button><p class="save-help" id="save-help">Add your FPL name to continue.</p></form></div>`;
  nameDialog.showModal();
  document.body.classList.add('dialog-open');
  const input = document.querySelector('#fpl-name');
  input.addEventListener('input', () => {
    const name = input.value.trim().replace(/\s+/g, ' '),
      valid = name.length >= 3 && name.length <= 24 && /[\p{L}\p{N}]/u.test(name);
    document.querySelector('#save-name').disabled = !valid;
    document.querySelector('#save-help').textContent = valid
      ? 'Your name and short wallet will be visible to other managers.'
      : 'Add at least 3 characters to continue.';
    document.querySelector('#name-preview-text').textContent = name || 'Your FPL name';
    document.querySelector('#name-avatar').textContent = name
      ? name
          .split(' ')
          .slice(0, 2)
          .map((word) => Array.from(word)[0])
          .join('')
          .toUpperCase()
      : 'SF';
  });
  document.querySelector('#name-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (document.querySelector('#save-name').disabled) return;
    managers[5].name = input.value.trim().replace(/\s+/g, ' ');
    managers[5].initials = document.querySelector('#name-avatar').textContent;
    enteredName = true;
    nameDialog.close();
    document.body.classList.remove('dialog-open');
    scenario = 'private';
    render();
    openSquad(5);
    showToast('Preview name saved. Your squad draft stays with you.');
  });
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.hasAttribute('data-manager')) return openSquad(Number(target.dataset.manager), target);
  if (target.hasAttribute('data-player')) {
    selectedPlayer = target.dataset.player;
    renderSquad();
    squadDialog.querySelector('[data-action="back-pitch"]').focus();
    return;
  }
  switch (target.dataset.action) {
    case 'close-squad':
      closeSquad();
      break;
    case 'close-name':
      nameDialog.close();
      document.body.classList.remove('dialog-open');
      priorFocus?.focus();
      break;
    case 'back-pitch': {
      const player = selectedPlayer;
      selectedPlayer = null;
      renderSquad();
      squadDialog.querySelector(`[data-player="${player}"]`)?.focus();
      break;
    }
    case 'previous':
    case 'next': {
      const order = rows(),
        rank = order.findIndex((m) => m.id === selected);
      selected = order[rank + (target.dataset.action === 'next' ? 1 : -1)].id;
      selectedPlayer = null;
      renderSquad();
      squadDialog.querySelector('.back-link').focus();
      break;
    }
    case 'my-five':
      if (enteredName || scenario !== 'join') openSquad(5, target);
      else openName(target);
      break;
    case 'standings':
      document.querySelector('#content').scrollIntoView({ block: 'nearest' });
      break;
    case 'sponsors':
      showToast('This preview focuses on standings and squads. Sponsor features stay as they are.');
      break;
    case 'find-me': {
      const search = document.querySelector('#manager-search');
      search.value = '';
      renderRows();
      const row = document.querySelector('[data-manager="5"]');
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      break;
    }
  }
});
squadDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSquad();
});
nameDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  nameDialog.close();
  document.body.classList.remove('dialog-open');
  priorFocus?.focus({ preventScroll: true });
});
for (const dialog of [squadDialog, nameDialog])
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      dialog.close();
      document.body.classList.remove('dialog-open');
      priorFocus?.focus();
    }
  });
let rendering = false;
scenarioSelect.addEventListener('change', () => {
  if (rendering || scenarioSelect.value === scenario) return;
  scenario = scenarioSelect.value;
  squadDialog.close();
  nameDialog.close();
  document.body.classList.remove('dialog-open');
  rendering = true;
  render();
  rendering = false;
  if (scenario === 'join') {
    enteredName = false;
    openName();
  }
});
rendering = true;
render();
rendering = false;
if (scenario === 'join') openName();
else if (new URLSearchParams(location.search).has('squad')) {
  const id = Number(new URLSearchParams(location.search).get('squad'));
  if (Number.isInteger(id) && managers[id]) openSquad(id);
}
