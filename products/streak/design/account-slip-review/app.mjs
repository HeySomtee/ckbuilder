const $ = (selector) => document.querySelector(selector);
const paths = {
  wallet: 'M3 6h15v13H3z M3 6V3h13v3 M14 10h6v5h-6z',
  grid: 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 17 19 3 M7 3h12v12',
  copy: 'M8 8h12v12H8z M15 4V2H2v13h2',
  refresh: 'M20 8a8 8 0 1 0 0 8 M20 2v6h-6',
  send: 'm3 10 18-7-7 18-3-8-8-3z M11 13l10-10',
  activity: 'M5 4h14v17H5z M8 2v4 M16 2v4 M5 9h14 M8 13h3 M13 13h3 M8 17h3',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4z M8 12l3 3 5-6',
  chevron: 'm9 5 7 7-7 7',
  up: 'm6 15 6-6 6 6',
  close: 'm6 6 12 12 M18 6 6 18',
  slip: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.slip}"/></svg>`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
const response = await fetch('./fixtures.json');
if (!response.ok) throw new Error('Preview fixture snapshot unavailable');
const snapshot = await response.json();
const fixtures = snapshot.fixtures;
let picks = fixtures
  .slice(0, 3)
  .map((f, i) => ({ id: f.id, outcome: i === 1 ? 'draw' : 'home', amount: '100' }));
const startWithSlip = location.hash === '#slip';
let mode = location.hash === '#markets' || startWithSlip ? 'markets' : 'wallet';
let connected = false,
  timer;
const format = (n) => n.toLocaleString('en-GB');
function shannons(value) {
  if (!/^\d{1,9}(\.\d{1,8})?$/.test(value)) return null;
  const [a, b = ''] = value.split('.');
  const result = BigInt(a) * 100000000n + BigInt(b.padEnd(8, '0'));
  return result >= 10000000000n ? result : null;
}
function total() {
  let sum = 0n;
  for (const p of picks) {
    const n = shannons(p.amount);
    if (n === null) return null;
    sum += n;
  }
  return sum;
}
function money(n) {
  if (n === null) return 'Check amounts';
  const whole = n / 100000000n;
  const fraction = String(n % 100000000n)
    .padStart(8, '0')
    .replace(/0+$/, '');
  return format(whole) + (fraction ? '.' + fraction : '');
}
function time(f) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(new Date(f.kickoff));
}
function logos(f) {
  return `<img alt="" src="${escape(f.home.logo)}"><img alt="" src="${escape(f.away.logo)}">`;
}
function outcomeLabel(f, outcome) {
  return outcome === 'draw' ? 'Draw' : `${f[outcome].name} to win`;
}
function notice(message) {
  clearTimeout(timer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  timer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function view(next) {
  mode = next;
  $('#wallet-view').hidden = next !== 'wallet';
  $('#markets-view').hidden = next !== 'markets';
  document
    .querySelectorAll('[data-view]')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === next));
  history.replaceState(null, '', '#' + next);
}
function info(title, html) {
  $('#info-title').textContent = title;
  $('#info-content').innerHTML = html;
  $('#info-dialog').showModal();
}
function dismiss() {
  if ($('#slip').open) $('#slip').close();
  $('#slip-dock').focus({ preventScroll: true });
}
function openSlip() {
  renderSlip();
  $('#slip').showModal();
  $('#close-slip').focus({ preventScroll: true });
}
function updateTotals() {
  const amount = total();
  $('#dock-count').textContent = String(picks.length);
  $('#slip-count').textContent = String(picks.length);
  $('#dock-total').textContent = money(amount);
  $('#slip-total').innerHTML =
    escape(money(amount)) + (amount === null ? '' : ' <small>tCKB</small>');
  $('#pick-limit').textContent = `${picks.length} of 8 picks`;
  $('#add-matches').disabled = picks.length === 8;
  $('#add-matches span:last-child').textContent = picks.length === 8 ? 'Slip full' : 'Add matches';
  $('#review-payment').disabled = !picks.length || amount === null;
  $('#clear-slip').disabled = !picks.length;
  $('#slip-dock').setAttribute(
    'aria-label',
    `Open slip, ${picks.length} predictions, ${money(amount)} tCKB`,
  );
}
function renderMarkets() {
  $('#market-grid').innerHTML = fixtures
    .map(
      (f) =>
        `<article class="match-card"><div class="match-meta"><span>${escape(f.league)}</span><span>${escape(time(f))}</span></div><div class="match-teams"><div class="team"><img alt="" src="${escape(f.home.logo)}"><span>${escape(f.home.name)}</span></div><span class="versus">vs</span><div class="team"><img alt="" src="${escape(f.away.logo)}"><span>${escape(f.away.name)}</span></div></div><div class="outcomes">${[
          'home',
          'draw',
          'away',
        ]
          .map((outcome, i) => {
            const selected = picks.some((p) => p.id === f.id && p.outcome === outcome);
            return `<button data-pick="${escape(f.id)}" data-outcome="${outcome}" class="${selected ? 'selected' : ''}" aria-pressed="${selected}" aria-label="${escape(outcomeLabel(f, outcome) + ' in ' + f.home.name + ' vs ' + f.away.name)}">${['1 · Home', 'X · Draw', '2 · Away'][i]}</button>`;
          })
          .join('')}</div></article>`,
    )
    .join('');
  $('#snapshot-date').textContent =
    `${new Date(snapshot.capturedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })} · Times in Lagos`;
}
function renderSlip() {
  $('#slip-body').innerHTML = picks.length
    ? picks
        .map((p) => {
          const f = fixtures.find((f) => f.id === p.id);
          return `<article class="pick" data-line="${escape(p.id)}"><div class="pick-top"><p>${escape(time(f))}<strong>${escape(f.home.name)} vs ${escape(f.away.name)}</strong></p><button class="remove-pick" data-remove="${escape(p.id)}" aria-label="Remove ${escape(f.home.name + ' vs ' + f.away.name)}">${icon('close')}</button></div><div class="pick-choice">${logos(f)}<span>${escape(outcomeLabel(f, p.outcome))}</span></div><label class="stake-label" for="stake-${escape(p.id)}">Your stake</label><div class="stake-row"><div class="stake-input"><input id="stake-${escape(p.id)}" data-amount="${escape(p.id)}" aria-label="Stake for ${escape(f.home.name + ' vs ' + f.away.name)}" inputmode="decimal" maxlength="18" value="${escape(p.amount)}"><span>tCKB</span></div>${['100', '200', '500'].map((n) => `<button class="preset" data-preset="${n}" data-id="${escape(p.id)}" aria-label="Set ${n} tCKB on ${escape(f.home.name)}" aria-pressed="${p.amount === n}">${n}</button>`).join('')}</div></article>`;
        })
        .join('')
    : '<div class="empty"><strong>A fresh slip.</strong><p>Add a match to make your first prediction.</p></div>';
  updateTotals();
}
document
  .querySelectorAll('[data-view]')
  .forEach((b) => b.addEventListener('click', () => view(b.dataset.view)));
$('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  view('wallet');
});
$('#slip-dock').addEventListener('click', openSlip);
$('#close-slip').addEventListener('click', dismiss);
$('#slip').addEventListener('cancel', (e) => {
  e.preventDefault();
  dismiss();
});
$('#add-matches').addEventListener('click', () => {
  dismiss();
  view('markets');
  const target = $('#market-grid button:not(.selected)');
  target?.focus({ preventScroll: true });
  notice('Your picks are saved. Choose another match.');
});
$('#market-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  const existing = picks.find((p) => p.id === b.dataset.pick);
  if (existing) {
    existing.outcome = b.dataset.outcome;
  } else if (picks.length < 8) {
    picks.push({ id: b.dataset.pick, outcome: b.dataset.outcome, amount: '100' });
  } else {
    notice('Your slip has 8 picks. Remove one to add another.');
    return;
  }
  renderMarkets();
  renderSlip();
  notice(`${picks.length} predictions in your slip`);
});
$('#fill-slip').addEventListener('click', () => {
  picks = fixtures.slice(0, 8).map((f) => ({ id: f.id, outcome: 'home', amount: '100' }));
  renderMarkets();
  openSlip();
});
$('#slip-body').addEventListener('click', (e) => {
  const remove = e.target.closest('[data-remove]');
  const preset = e.target.closest('[data-preset]');
  if (remove) {
    const index = picks.findIndex((p) => p.id === remove.dataset.remove);
    picks = picks.filter((p) => p.id !== remove.dataset.remove);
    renderSlip();
    renderMarkets();
    const buttons = $('#slip-body').querySelectorAll('[data-remove]');
    (buttons[Math.min(index, buttons.length - 1)] ?? $('#add-matches')).focus();
  }
  if (preset) {
    const p = picks.find((p) => p.id === preset.dataset.id);
    p.amount = preset.dataset.preset;
    const article = preset.closest('.pick');
    article.querySelector('input').value = p.amount;
    article
      .querySelectorAll('.preset')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === p.amount)));
    updateTotals();
  }
});
$('#slip-body').addEventListener('input', (e) => {
  if (!e.target.matches('[data-amount]')) return;
  const p = picks.find((p) => p.id === e.target.dataset.amount);
  p.amount = e.target.value;
  e.target.setAttribute('aria-invalid', String(shannons(p.amount) === null));
  e.target
    .closest('.pick')
    .querySelectorAll('.preset')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === p.amount)));
  updateTotals();
});
$('#clear-slip').addEventListener('click', () =>
  info(
    'Clear your slip?',
    '<p>This removes all picks from this preview.</p><button id="confirm-clear" class="secondary">Clear all picks</button>',
  ),
);
$('#info-content').addEventListener('click', (e) => {
  if (e.target.id === 'confirm-clear') {
    picks = [];
    renderMarkets();
    renderSlip();
    $('#info-dialog').close();
    $('#add-matches').focus();
  }
});
$('#review-payment').addEventListener('click', () => {
  const amount = total();
  if (amount === null || !picks.length) return;
  info(
    'One payment. Independent picks.',
    `<p>Review preview for ${picks.length} predictions. No wallet is connected and no transaction will be sent.</p><div class="review-line"><span>Stakes</span><strong>${money(amount)} tCKB</strong></div><div class="review-line"><span>Recoverable position storage</span><strong>${format(picks.length * 321)} tCKB</strong></div><div class="review-line"><span>Network fee</span><span>Calculated at checkout</span></div><p style="margin-top:16px">Streak supplies any new market reserve. Each prediction settles independently. Exact transaction review remains unchanged by this layout proposal.</p>`,
  );
});
$('#close-info').addEventListener('click', () => $('#info-dialog').close());
$('#info-done').addEventListener('click', () => $('#info-dialog').close());
$('#copy-address').addEventListener('click', () => {
  info(
    'Copy your wallet address',
    '<p>In the app this control copies your full connected CKB address and shows a short confirmation. This preview uses a shortened sample, so it will not put an invalid address on your clipboard.</p>',
  );
});
$('#refresh').addEventListener('click', () =>
  notice('Preview balance refreshed. No wallet request was made.'),
);
$('#disconnect').addEventListener('click', () =>
  info(
    'Disconnect wallet',
    '<p>The application disconnects the active signer here. Saved predictions and submitted transaction recovery remain available. This preview has no connected wallet.</p>',
  ),
);
$('#faucet').addEventListener('click', () =>
  info(
    'Get testnet CKB',
    '<p>The application opens the testnet faucet from here. This preview does not request or move tokens.</p>',
  ),
);
$('#activity').addEventListener('click', () =>
  info(
    'Your predictions',
    '<p>This row opens the existing Activity screen for predictions, payouts and refunds. Wallet stays focused on your balance and account.</p>',
  ),
);
$('#recovery').addEventListener('click', () =>
  info(
    'Transaction recovery',
    '<p>This row opens the existing recovery journey for an interrupted payment. It does not create a new payment or ask you to sign again.</p>',
  ),
);
$('#telegram-connect').addEventListener('click', () => {
  connected = !connected;
  $('#telegram-state').textContent = connected ? 'Connected · Preview state' : 'Not connected';
  $('#telegram-state').classList.toggle('linked', connected);
  $('#telegram-connect').innerHTML = connected ? 'Manage' : `Connect ${icon('arrow')}`;
  info(
    connected ? 'Telegram connection' : 'Telegram disconnected',
    connected
      ? '<p>Proposed bot confirmation:</p><div class="telegram-bubble">Your Telegram account is now connected to Streak.</div><p>This works even when your Streak account has no username. This preview sends no Telegram messages. Automatic alerts for the new contracts are still pending.</p>'
      : '<p>The preview is back to its disconnected state. No real account was changed.</p>',
  );
});
view(mode);
renderMarkets();
renderSlip();
if (startWithSlip) openSlip();
