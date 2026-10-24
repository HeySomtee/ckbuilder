import { BUDGET, SLOTS, additionError, validate, score } from './rules.mjs';

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const credits = (cost) => (cost / 10).toFixed(1);
const KEY = 'streak-five-private-preview-v1';
const colors = ['#a4c9d9', '#db7774', '#aea1cf', '#7baf98', '#d3bd80', '#c4d0d8'];
let catalogue = [],
  selected = [],
  captain = null,
  saved = false,
  state = 'building',
  position = 'ALL',
  limit = 40;
let toastTimer,
  returnFocus,
  sourceDate = '';
const current = () => selected.map((id) => catalogue.find((p) => p.id === id)).filter(Boolean);
const locked = () => state !== 'building';
const totalCost = () => current().reduce((n, p) => n + p.cost, 0);
const notify = (message) => {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
};
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ selected, captain, saved }));
    return true;
  } catch {
    notify('Your browser could not save this draft. Keep this tab open.');
    return false;
  }
}
function shirt(player, small = false) {
  const color = colors[player.teamId % colors.length];
  return `<svg class="${small ? 'mini-shirt' : 'shirt'}" viewBox="0 0 80 80" aria-hidden="true"><path d="M24 7L7 20 17 38 26 33 23 72Q40 78 57 72L54 33 63 38 73 20 56 7Q40 19 24 7Z" fill="${color}" stroke="#ffffff40"/><path d="M24 7Q40 25 56 7" fill="none" stroke="#f0f0e4" stroke-width="3"/><path d="M27 20L25 59M53 20L55 59" stroke="#ffffff18"/><rect x="46" y="25" width="8" height="8" rx="1" fill="#17251f"/><path d="M48 31V27L52 31V27" fill="none" stroke="#fff" stroke-width="1"/><text x="40" y="49" text-anchor="middle" fill="#fff" font-size="12" font-family="Arial" font-weight="700">${esc(player.teamCode)}</text></svg>`;
}
function renderPitch() {
  const players = current(),
    used = new Set();
  $('#pitch').innerHTML = SLOTS.map((pos) => {
    const p = players.find((p) => p.position === pos && !used.has(p.id));
    if (!p)
      return `<div class="slot"><button class="slot-empty" data-filter="${pos}" aria-label="Find a ${pos}"><span class="plus">+</span>${pos}</button></div>`;
    used.add(p.id);
    return `<div class="slot">${shirt(p)}<span class="slot-name">${esc(p.name)}</span><span class="slot-meta">${pos} · ${credits(p.cost)} CR</span><button class="slot-captain" data-captain="${p.id}" aria-label="Captain ${esc(p.name)}" aria-pressed="${captain === p.id}" ${locked() ? 'disabled' : ''}><span>C</span></button><button class="slot-remove" data-remove="${p.id}" aria-label="Remove ${esc(p.name)}" ${locked() ? 'disabled' : ''}>×</button></div>`;
  }).join('');
  $('[data-action="clear"]').disabled = !selected.length || locked();
}
function renderEntry() {
  const error = validate(current(), captain);
  const remaining = BUDGET - totalCost();
  const caption = locked()
    ? 'Squad locked for this simulated round'
    : saved
      ? 'Preview entry saved on this device'
      : error || 'Five ready. One captain. Your call.';
  $('#entry-panel').innerHTML =
    `<div class="budget-row"><div><div class="budget-caption">Budget remaining</div><div class="budget-value">${credits(remaining)} <small>/ 40 credits</small></div></div><span class="pill">${selected.length} / 5 picked</span></div><div class="budget-track" role="meter" aria-label="Budget used" aria-valuemin="0" aria-valuemax="40" aria-valuenow="${totalCost() / 10}"><span style="width:${totalCost() / 4}%"></span></div><button class="primary" data-action="review" ${error || locked() ? 'disabled' : ''}><span>${locked() ? 'Squad locked' : saved ? 'Review saved squad' : 'Review your five'}</span><span aria-hidden="true">↗</span></button><div class="entry-hint"><span>${esc(caption)}</span><span>Free entry</span></div>`;
}
function renderPlayers() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  const sort = $('#sort').value;
  const players = catalogue
    .filter(
      (p) =>
        (position === 'ALL' || p.position === position) &&
        `${p.name} ${p.fullName} ${p.team}`.toLocaleLowerCase().includes(query),
    )
    .sort(
      (a, b) =>
        (sort === 'price'
          ? a.cost - b.cost
          : sort === 'points'
            ? b.points - a.points
            : b.form - a.form) || a.name.localeCompare(b.name),
    );
  $('#player-count').textContent = `${players.length} players`;
  $('#players').innerHTML =
    players
      .slice(0, limit)
      .map((p) => {
        const picked = selected.includes(p.id);
        const unavailable = p.status !== 'a';
        return `<div class="player-row ${picked ? 'picked' : ''}"><div class="player-identity">${shirt(p, true)}<div><span class="player-name">${esc(p.name)}${unavailable ? '<span class="availability" title="Check availability">!</span>' : ''}</span><span class="player-club">${esc(p.teamCode)} · ${p.position}${unavailable ? ' · Availability flag' : ''}</span></div></div><span class="form" title="FPL form">${p.form.toFixed(1)}</span><span class="price">${credits(p.cost)}</span><button class="add-player" data-${picked ? 'remove' : 'add'}="${p.id}" aria-label="${picked ? 'Remove' : 'Add'} ${esc(p.name)}" ${locked() ? 'disabled' : ''}>${picked ? '✓' : '+'}</button></div>`;
      })
      .join('') ||
    '<p class="empty-list">No players match. Try another name, club or position.</p>';
  $('#more').hidden = limit >= players.length;
  document
    .querySelectorAll('[data-position]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.position === position)),
    );
}
function simulatedStats(player) {
  if (state === 'delayed' && player.position === 'FWD') return null;
  return {
    complete: true,
    minutes: state === 'live' ? 68 : 90,
    goals: player.position === 'FWD' ? 1 : 0,
    assists: player.position === 'MID' ? 1 : 0,
    conceded: player.position === 'GK' ? 0 : 1,
    saves: player.position === 'GK' ? 4 : 0,
    penaltySaves: 0,
    yellow: player.position === 'DEF' ? 1 : 0,
    red: 0,
    ownGoals: 0,
    penaltyMisses: 0,
  };
}
function renderRound() {
  const visible = ['live', 'complete', 'delayed'].includes(state);
  $('#round-tracker').hidden = !visible;
  if (!visible) return;
  const players = current();
  const results = players.map((p) => ({
    p,
    result: score(p.position, simulatedStats(p), captain === p.id),
  }));
  const partial = results.some((r) => r.result.pending);
  const total = results.reduce((n, r) => n + (r.result.total ?? 0), 0);
  $('#round-tracker').innerHTML =
    `<div class="round-header"><div><span class="eyebrow">SIMULATED ROUND</span><h2>${state === 'complete' ? 'Every pick has a story.' : state === 'delayed' ? 'One score is still on its way.' : 'Your weekend, unfolding.'}</h2><p>${partial ? 'Verified subtotal only. Missing player data stays pending.' : state === 'complete' ? 'Example final scores. Open a player to see every point.' : 'Example live scores. Provisional until the round is finalized.'}</p></div><span class="round-total">${total}<small style="font-size:11px"> ${partial ? 'so far' : 'PTS'}</small></span></div>${results.map(({ p, result }) => `<div class="score-row"><span><strong>${esc(p.name)}${p.id === captain ? ' · C' : ''}</strong><small>${esc(p.teamCode)} · ${p.position}${result.pending ? ' · Waiting for data' : ''}</small></span><button data-score="${p.id}" aria-label="Points breakdown for ${esc(p.name)}">${result.pending ? '<span class="pending-dot" aria-hidden="true"></span>Pending' : result.total + ' pts'}</button></div>`).join('')}`;
}
function render() {
  renderPitch();
  renderEntry();
  renderPlayers();
  renderRound();
}
function openModal(title, body, actions = '') {
  returnFocus = document.activeElement;
  $('#modal-body').innerHTML =
    `<div class="modal-header"><div><span class="eyebrow">STREAK FIVE · PREVIEW</span><h2>${title}</h2></div><button class="modal-close" data-action="close" aria-label="Close dialog">×</button></div>${body}${actions}`;
  $('#modal').showModal();
}
function closeModal() {
  $('#modal').close();
}
$('#modal').addEventListener('close', () => {
  if (returnFocus?.isConnected) returnFocus.focus();
  else $('[data-action="review"]')?.focus();
});
function filterTo(pos) {
  position = pos;
  limit = 40;
  renderPlayers();
  $('#scout-title').scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'center',
  });
  $('#search').focus({ preventScroll: true });
}
function changeSquad() {
  saved = false;
  persist();
  render();
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const {
    add,
    remove,
    captain: nextCaptain,
    filter,
    position: nextPosition,
    score: playerScore,
    action,
  } = button.dataset;
  if (add) {
    const player = catalogue.find((p) => p.id === Number(add));
    if (!player || locked()) return;
    const error = additionError(current(), player);
    if (error) {
      notify(error);
      return;
    }
    selected.push(player.id);
    saved = false;
    const stored = persist();
    render();
    if (stored) notify(`${player.name} is in your five.`);
    document
      .querySelector(`[data-remove="${player.id}"].add-player`)
      ?.focus({ preventScroll: true });
  } else if (remove) {
    if (locked()) return;
    selected = selected.filter((id) => id !== Number(remove));
    if (captain === Number(remove)) captain = null;
    changeSquad();
    document.querySelector(`[data-add="${remove}"]`)?.focus({ preventScroll: true });
  } else if (nextCaptain) {
    if (locked() || !selected.includes(Number(nextCaptain))) return;
    captain = Number(nextCaptain);
    saved = false;
    const stored = persist();
    render();
    document.querySelector(`[data-captain="${captain}"]`)?.focus({ preventScroll: true });
    if (stored) notify('Captain chosen. Their points count double.');
  } else if (filter) filterTo(filter);
  else if (nextPosition) {
    position = nextPosition;
    limit = 40;
    renderPlayers();
  } else if (playerScore) {
    const player = current().find((p) => p.id === Number(playerScore));
    if (!player) return;
    const result = score(player.position, simulatedStats(player), captain === player.id);
    openModal(
      esc(player.name),
      result.pending
        ? '<p class="modal-copy">The feed has not supplied a complete performance record. This player stays pending, with no invented zero. Other players keep their points.</p>'
        : `<p class="modal-copy">Illustrative match events, not real player results.</p>${result.lines.map((l) => `<div class="modal-line"><span>${esc(l.label)}</span><strong>${l.points > 0 ? '+' : ''}${l.points}</strong></div>`).join('')}<div class="modal-line"><strong>Total</strong><strong>${result.total} pts</strong></div>`,
    );
  } else if (action === 'close') closeModal();
  else if (action === 'more') {
    limit += 40;
    renderPlayers();
  } else if (action === 'rules') {
    openModal(
      'Five players. One big call.',
      '<p class="modal-copy">Proposed rules for the first EPL edition. Pick 1 goalkeeper, 1 defender, 2 midfielders and 1 forward within 40 credits. Maximum two players per club.</p><div class="modal-line"><span>Appearance</span><strong>1 pt · 2 at 60 minutes</strong></div><div class="modal-line"><span>Goal</span><strong>GK/DEF 6 · MID 5 · FWD 4</strong></div><div class="modal-line"><span>Assist</span><strong>3 pts</strong></div><div class="modal-line"><span>Clean sheet, 60+ minutes</span><strong>GK/DEF 4 · MID 1</strong></div><div class="modal-line"><span>Goalkeeper saves</span><strong>1 per 3 · penalty save 5</strong></div><div class="modal-line"><span>Cards / own goal / missed penalty</span><strong>−1 yellow · −3 red · −2 / −2</strong></div><div class="modal-line"><span>GK/DEF goals conceded</span><strong>−1 per 2</strong></div><div class="modal-line"><span>Captain</span><strong>All points ×2</strong></div><p class="modal-note">No substitute or vice-captain in this proposal. A confirmed non-appearance scores zero; missing data remains pending. This is Streak scoring, not a promise to reproduce FPL points or bonus rules. Deadlines, double fixtures and correction policy must be finalized before launch.</p>',
    );
  } else if (action === 'review') {
    if (validate(current(), captain) || locked()) return;
    openModal(
      'Your five, ready to go.',
      `<p class="modal-copy">A small squad with your name on it. This saves a preview entry on this device only.</p>${current()
        .map(
          (p) =>
            `<div class="modal-line"><span>${esc(p.name)} ${p.id === captain ? '<small>CAPTAIN ×2</small>' : ''}<br><small>${p.position} · ${esc(p.team)}</small></span><strong>${credits(p.cost)}</strong></div>`,
        )
        .join(
          '',
        )}<div class="modal-line"><span>Budget used</span><strong>${credits(totalCost())} / 40 credits</strong></div><p class="modal-note">Free preview. No wallet, payment, public leaderboard or prize. You can keep editing in Picking mode.</p>`,
      '<div class="modal-actions"><button data-action="close">Keep scouting</button><button class="primary" data-action="save">Save preview entry</button></div>',
    );
  } else if (action === 'save') {
    if (locked() || validate(current(), captain)) return;
    saved = true;
    if (!persist()) {
      saved = false;
      render();
      if (!$('#save-error')) {
        const notice = document.createElement('p');
        notice.id = 'save-error';
        notice.className = 'modal-note';
        notice.setAttribute('role', 'alert');
        notice.textContent =
          'This browser could not save your entry. Your five are still here. Keep this tab open or enable local storage and try again.';
        $('#modal-body').append(notice);
      }
      return;
    }
    render();
    closeModal();
    notify('Preview entry saved. Your five are ready.');
  } else if (action === 'clear' || action === 'reset') {
    openModal(
      action === 'reset' ? 'Reset this preview?' : 'Clear your five?',
      '<p class="modal-copy">This removes the squad saved on this device. It does not change a live competition or account.</p>',
      `<div class="modal-actions"><button data-action="close">Keep my squad</button><button class="primary" data-action="confirm-clear">Clear squad</button></div>`,
    );
  } else if (action === 'confirm-clear') {
    selected = [];
    captain = null;
    saved = false;
    state = 'building';
    $('#state').value = state;
    changeSquad();
    closeModal();
    notify('Fresh team sheet. Make it yours.');
  } else if (action === 'retry') load();
});
$('#search').addEventListener('input', () => {
  limit = 40;
  renderPlayers();
});
$('#sort').addEventListener('change', renderPlayers);
$('#state').addEventListener('change', (event) => {
  const next = event.target.value;
  if (next !== 'building' && validate(current(), captain)) {
    event.target.value = state;
    notify('Build a complete five and choose a captain first.');
    return;
  }
  state = next;
  render();
  if (['live', 'complete', 'delayed'].includes(state))
    $('#round-tracker').scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
});
async function load() {
  $('#error').textContent = '';
  $('#players').innerHTML =
    '<div class="loading-bars" role="status" aria-label="Loading player snapshot"><span></span><span></span><span></span><span></span><span></span></div>';
  try {
    const response = await fetch('/players.json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('snapshot unavailable');
    const data = await response.json();
    if (
      !Array.isArray(data.players) ||
      !data.players.length ||
      data.players.length > 2000 ||
      !Number.isFinite(Date.parse(data.fetchedAt))
    )
      throw new Error('invalid snapshot');
    const valid = data.players.every(
      (p) =>
        Number.isInteger(p.id) &&
        p.id > 0 &&
        Number.isInteger(p.teamId) &&
        p.teamId > 0 &&
        Number.isInteger(p.cost) &&
        p.cost >= 0 &&
        p.cost <= 200 &&
        ['GK', 'DEF', 'MID', 'FWD'].includes(p.position) &&
        ['name', 'fullName', 'team', 'teamCode', 'status'].every(
          (k) => typeof p[k] === 'string' && p[k].length < 200,
        ) &&
        Number.isFinite(p.form) &&
        Number.isFinite(p.points),
    );
    if (!valid || new Set(data.players.map((p) => p.id)).size !== data.players.length)
      throw new Error('invalid players');
    catalogue = data.players;
    sourceDate = new Date(data.fetchedAt).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    $('#source-date').textContent = `FPL snapshot · ${sourceDate}`;
    try {
      const draft = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (
        draft &&
        Array.isArray(draft.selected) &&
        draft.selected.length <= 5 &&
        draft.selected.every((id) => Number.isInteger(id) && catalogue.some((p) => p.id === id))
      ) {
        const restored = [];
        for (const id of draft.selected) {
          const p = catalogue.find((p) => p.id === id);
          if (additionError(restored, p)) throw new Error('stale draft');
          restored.push(p);
        }
        selected = restored.map((p) => p.id);
        captain = selected.includes(draft.captain) ? draft.captain : null;
        saved = draft.saved === true && !validate(current(), captain);
      }
    } catch {
      notify('The saved draft could not be restored. Start a fresh five.');
    }
    render();
  } catch {
    $('#error').innerHTML =
      'The private player snapshot is unavailable. Your saved draft has not been removed. <button class="quiet" data-action="retry">Try again</button>';
    $('#players').innerHTML =
      '<p class="empty-list">Player prices will appear when the snapshot is available.</p>';
    $('#source-date').textContent = 'Snapshot unavailable';
  }
}
renderPitch();
renderEntry();
load();
