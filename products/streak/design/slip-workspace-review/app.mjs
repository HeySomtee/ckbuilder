const $ = (id) => document.getElementById(id);
const data = await (await fetch('fixtures.json')).json();
const fixtures = data.fixtures.slice(0, 8);
const CKB = 100000000n,
  storage = 321n * CKB,
  demoFee = 6000n;
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function amount(value) {
  if (!/^\d{1,8}(?:\.\d{0,8})?$/.test(value)) return null;
  const [whole, decimal = ''] = value.split('.');
  return BigInt(whole) * CKB + BigInt(decimal.padEnd(8, '0'));
}
function money(value) {
  const integer = (value / CKB).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = (value % CKB).toString().padStart(8, '0').replace(/0+$/, '');
  return `${integer}${decimal ? '.' + decimal : ''} tCKB`;
}
let picks = [],
  mode = 'edit',
  tab = 'picks',
  pending = null,
  complete = null,
  reviewTimer,
  paymentTimer,
  elapsedTimer,
  overlayReturn = null;
const outcomeNames = ['Home', 'Draw', 'Away'];
const receipts = [
  { label: 'Leeds vs Manchester United', outcome: 'Away', stake: 500n * CKB, count: 1 },
];
function teamLine(f) {
  return `<span class="teams"><img src="${esc(f.home.logo)}" alt=""><img src="${esc(f.away.logo)}" alt=""><strong>${esc(f.home.name)} <span class="versus">vs</span> ${esc(f.away.name)}</strong></span>`;
}
function samplePicks(count) {
  if (pending) return;
  clearTimeout(reviewTimer);
  mode = 'edit';
  picks = fixtures.slice(0, count).map((f, i) => ({ id: f.id, outcome: i % 3, value: '100' }));
  switchTab('picks');
  openSlip();
  render();
}
function totals() {
  const values = picks.map((p) => amount(p.value));
  return {
    valid: picks.length > 0 && values.every((v) => v !== null && v >= 100n * CKB),
    principal: values.reduce((sum, v) => sum + (v ?? 0n), 0n),
    deposit: BigInt(picks.length) * storage,
  };
}
function renderPicks() {
  $('pick-list').innerHTML = picks.length
    ? picks
        .map((p) => {
          const f = fixtures.find((f) => f.id === p.id),
            index = fixtures.indexOf(f);
          return `<article class="pick" data-id="${esc(p.id)}"><div class="pick-top">${teamLine(f)}<button class="remove" data-remove="${esc(p.id)}" aria-label="Remove ${esc(f.home.name)} vs ${esc(f.away.name)}" ${mode !== 'edit' ? 'disabled' : ''}>×</button></div><div class="pick-meta"><span class="selection">${p.outcome === 1 ? 'Draw' : esc(p.outcome === 0 ? f.home.name : f.away.name) + ' to win'}</span><span>· ${esc(f.league)}</span><span class="pool-state ${index >= 6 ? 'new' : ''}">${index >= 6 ? 'Setup on Streak' : 'Pool open'}</span></div><div class="stake-row"><label class="amount-field"><span class="stake-label">Stake for ${esc(f.home.name)} vs ${esc(f.away.name)}</span><input inputmode="decimal" autocomplete="off" aria-label="Stake for ${esc(f.home.name)} vs ${esc(f.away.name)}" value="${esc(p.value)}" data-amount="${esc(p.id)}" ${mode !== 'edit' ? 'readonly' : ''}><span>tCKB</span></label>${[100, 200, 500].map((v) => `<button data-stake="${v}" data-id="${esc(p.id)}" aria-label="Stake ${v} on ${esc(f.home.name)} vs ${esc(f.away.name)}" aria-pressed="${p.value === String(v)}" ${mode !== 'edit' ? 'disabled' : ''}>${v}</button>`).join('')}</div></article>`;
        })
        .join('')
    : '<div class="empty-state"><h3>A fresh slip.</h3><p>Add a match and make your next call.</p><button class="text-button" data-open-picker>Add matches ↗</button></div>';
  $('list-caption').textContent =
    mode === 'review'
      ? 'Check your picks and exact wallet total'
      : `${picks.length} of 8 picks · independent predictions`;
}
function updateTotals() {
  const t = totals(),
    fee = mode === 'review' ? demoFee : 0n,
    total = t.principal + t.deposit + fee;
  $('pick-count').textContent = picks.length;
  $('header-count').textContent = picks.length;
  $('stake-total').textContent = money(t.principal);
  $('wallet-total').textContent = money(total);
  $('estimate-note').textContent =
    mode === 'review' ? 'Exact demo total · network fee included' : 'Estimate · plus network fee';
  $('cost-stakes').textContent = money(t.principal);
  $('cost-storage').textContent = money(t.deposit);
  $('cost-total').textContent = money(total) + (mode === 'review' ? '' : ' + fee');
  $('cost-fee').textContent =
    mode === 'review' ? money(demoFee) + ' (sample)' : 'Calculated at review';
  $('dock-title').textContent =
    `${picks.length} ${picks.length === 1 ? 'pick' : 'picks'} in your slip`;
  $('review-button').innerHTML =
    mode === 'checking'
      ? 'Checking your picks…'
      : mode === 'review'
        ? `Pay ${money(total)} <span>→</span>`
        : `Review ${picks.length} ${picks.length === 1 ? 'prediction' : 'predictions'} <span>→</span>`;
  $('review-button').disabled = !t.valid || mode === 'checking' || !!pending;
  $('back-edit').hidden = mode !== 'review';
  $('footer-note').textContent = pending
    ? 'A payment is being checked. You can keep editing.'
    : !picks.length
      ? 'Add a match to start your next slip'
      : !t.valid
        ? 'Enter at least 100 tCKB per prediction'
        : mode === 'checking'
          ? 'Checking live inputs and pool availability'
          : mode === 'review'
            ? 'Demo approval only · no funds move'
            : 'One payment · your picks settle separately';
  $('add-matches').disabled = picks.length >= 8 || mode !== 'edit';
  $('add-matches').textContent = picks.length >= 8 ? '8 / 8 · Slip full' : '＋ Add matches';
  $('clear-picks').disabled = mode !== 'edit' || !picks.length;
  for (const input of document.querySelectorAll('[data-amount]')) {
    const v = amount(input.value);
    input.setAttribute('aria-invalid', String(v === null || v < 100n * CKB));
  }
  for (const b of document.querySelectorAll('[data-count]')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.count) === picks.length));
    b.disabled = !!pending;
  }
}
function renderActivity() {
  $('activity-list').innerHTML =
    (pending
      ? `<article class="receipt"><header><strong>${pending.picks.length} predictions</strong><span class="status">Checking</span></header><p>Your signed payment stays in the tracker while you browse.</p><button class="text-button" id="activity-track">View progress ↗</button></article>`
      : '') +
    receipts
      .map(
        (r, i) =>
          `<article class="receipt"><header><strong>${r.count} ${r.count === 1 ? 'prediction' : 'predictions'}</strong><span class="status">✓ Confirmed</span></header><p>${esc(r.label)}${r.outcome ? ' · ' + esc(r.outcome) : ''}</p><p><strong>${money(r.stake)}</strong> in stakes · simulated</p><details><summary>Receipt &amp; payment breakdown</summary><p>Stakes: ${money(r.stake)}<br>Refundable storage: ${money(BigInt(r.count) * storage)}<br>Network fee: ${money(demoFee)}<br>Wallet total: ${money(r.stake + BigInt(r.count) * storage + demoFee)}</p><p>Your storage deposit is returned when you claim after settlement. A claim network fee applies.</p><p>Preview receipt ${String(receipts.length - i).padStart(2, '0')} · No transaction was sent.</p></details></article>`,
      )
      .join('');
}
function render() {
  renderPicks();
  updateTotals();
  renderActivity();
  renderMarkets();
}
function switchTab(next) {
  tab = next;
  $('picks-tab').setAttribute('aria-selected', String(next === 'picks'));
  $('activity-tab').setAttribute('aria-selected', String(next === 'activity'));
  $('picks-panel').hidden = next !== 'picks';
  $('activity-panel').hidden = next !== 'activity';
  $('slip-footer').hidden = next !== 'picks';
  $('add-matches').hidden = next !== 'picks';
  $('slip-title').textContent = next === 'picks' ? 'Make your calls.' : 'Your activity.';
  renderActivity();
}
function openSlip() {
  $('slip').hidden = false;
  $('slip-dock').hidden = true;
}
function closeSlip() {
  closeOverlays();
  $('slip').hidden = true;
  $('slip-dock').hidden = false;
  $('slip-dock').focus({ preventScroll: true });
}
function openOverlay(id, trigger = document.activeElement) {
  closeOverlays();
  overlayReturn = trigger;
  $(id).hidden = false;
  $(id).querySelector('button')?.focus();
  $('breakdown-button').setAttribute('aria-expanded', String(id === 'cost-panel'));
}
function closeOverlays() {
  const wasOpen = !$('cost-panel').hidden || !$('picker-panel').hidden;
  $('cost-panel').hidden = true;
  $('picker-panel').hidden = true;
  $('breakdown-button').setAttribute('aria-expanded', 'false');
  if (wasOpen) overlayReturn?.focus({ preventScroll: true });
}
function renderMarkets() {
  const rows = fixtures
    .map(
      (f, i) =>
        `<article class="market-row"><small>${esc(f.league)} · Sample fixture</small>${teamLine(f)}<div class="market-outcomes">${outcomeNames.map((name, o) => `<button data-add="${esc(f.id)}" data-outcome="${o}" ${picks.some((p) => p.id === f.id) || picks.length >= 8 || mode !== 'edit' ? 'disabled' : ''} aria-label="Add ${name} for ${esc(f.home.name)} vs ${esc(f.away.name)}">${name}${picks.some((p) => p.id === f.id && p.outcome === o) ? ' ✓' : ''}</button>`).join('')}</div></article>`,
    )
    .join('');
  $('market-list').innerHTML = rows;
  $('picker-list').innerHTML = rows;
}
function picker() {
  renderMarkets();
  openOverlay('picker-panel');
}
document.addEventListener('click', (e) => {
  const target = e.target.closest('button');
  if (!target) return;
  if (target.dataset.count) {
    samplePicks(Number(target.dataset.count));
    return;
  }
  if (target.dataset.remove) {
    picks = picks.filter((p) => p.id !== target.dataset.remove);
    render();
    return;
  }
  if (target.dataset.stake) {
    picks.find((p) => p.id === target.dataset.id).value = target.dataset.stake;
    renderPicks();
    updateTotals();
    return;
  }
  if (target.dataset.add) {
    if (mode !== 'edit' || picks.length >= 8 || picks.some((p) => p.id === target.dataset.add))
      return;
    picks.push({ id: target.dataset.add, outcome: Number(target.dataset.outcome), value: '100' });
    render();
    $('announcement').textContent = 'Match added to your slip.';
    return;
  }
  if (target.hasAttribute('data-open-picker')) picker();
  if (target.id === 'activity-track') {
    $('tracker-details').hidden = false;
    $('tracker-toggle').setAttribute('aria-expanded', 'true');
    closeSlip();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.amount) {
    picks.find((p) => p.id === e.target.dataset.amount).value = e.target.value;
    for (const b of e.target.closest('.stake-row').querySelectorAll('[data-stake]'))
      b.setAttribute('aria-pressed', String(b.dataset.stake === e.target.value));
    updateTotals();
  }
});
$('picks-tab').onclick = () => switchTab('picks');
$('activity-tab').onclick = () => switchTab('activity');
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    switchTab(tab === 'picks' ? 'activity' : 'picks');
    $(tab + '-tab').focus();
  }
});
$('open-slip').onclick = () => {
  openSlip();
  $('close-slip').focus();
};
$('slip-dock').onclick = openSlip;
$('close-slip').onclick = closeSlip;
$('add-matches').onclick = picker;
$('breakdown-button').onclick = () => openOverlay('cost-panel', $('breakdown-button'));
$('close-cost').onclick = closeOverlays;
$('cost-done').onclick = closeOverlays;
$('close-picker').onclick = closeOverlays;
$('clear-picks').onclick = () => {
  picks = [];
  render();
};
$('back-edit').onclick = () => {
  mode = 'edit';
  render();
};
$('review-button').onclick = () => {
  if (!totals().valid || pending) return;
  if (mode === 'review') {
    startPayment();
    return;
  }
  mode = 'checking';
  render();
  reviewTimer = setTimeout(() => {
    mode = 'review';
    render();
    $('announcement').textContent = 'Demo review ready. Exact wallet total shown.';
  }, 1300);
};
function stage(index) {
  if (!pending) return;
  pending.stage = index;
  const isNew = pending.picks.some((p) => fixtures.findIndex((f) => f.id === p.id) >= 6);
  const stages = [
    'Signature saved',
    isNew ? 'Opening markets & sending payment' : 'Sending to existing pools',
    'Waiting for confirmation',
  ];
  $('tracker-title').textContent = stages[index];
  $('stage-list').innerHTML = stages
    .map((s, i) => `<li class="${i < index ? 'done' : i === index ? 'current' : ''}">${s}</li>`)
    .join('');
  $('tracker-copy').textContent =
    'Keep browsing. This preview follows one saved payment. It never asks for a second signature to check its status.';
}
function startPayment() {
  pending = { picks: structuredClone(picks), started: Date.now(), stage: 0 };
  mode = 'edit';
  complete = null;
  $('tracker').hidden = false;
  $('tracker').dataset.state = 'pending';
  $('tracker-details').hidden = true;
  $('tracker-toggle').setAttribute('aria-expanded', 'false');
  $('continue-demo').hidden = true;
  $('view-receipt').hidden = true;
  $('tracker').querySelector('.orbit').textContent = '◌';
  stage(0);
  closeSlip();
  render();
  elapsedTimer = setInterval(() => {
    $('tracker-subtitle').textContent =
      `${Math.floor((Date.now() - pending.started) / 1000)}s elapsed · simulated payment`;
  }, 1000);
  paymentTimer = setTimeout(() => {
    stage(1);
    paymentTimer = setTimeout(() => {
      stage(2);
      if ($('simulate-delay').checked) {
        $('tracker-title').textContent = 'Still checking your payment';
        $('tracker-copy').textContent =
          'A delayed response is not a failed payment. Keep the saved transaction and check it before paying again. Use the button below to finish this demo.';
        $('continue-demo').hidden = false;
      } else paymentTimer = setTimeout(confirmPayment, 2000);
    }, 1800);
  }, 900);
}
function confirmPayment() {
  if (!pending) return;
  clearTimeout(paymentTimer);
  clearInterval(elapsedTimer);
  const paid = pending.picks;
  complete = {
    count: paid.length,
    stake: paid.reduce((sum, p) => sum + amount(p.value), 0n),
    label:
      paid.length === 1
        ? fixtures.find((f) => f.id === paid[0].id).home.name +
          ' vs ' +
          fixtures.find((f) => f.id === paid[0].id).away.name
        : `${paid.length} independent match predictions`,
    outcome: paid.length === 1 ? outcomeNames[paid[0].outcome] : null,
  };
  receipts.unshift(complete);
  picks = picks.filter(
    (p) =>
      !paid.some((old) => old.id === p.id && old.value === p.value && old.outcome === p.outcome),
  );
  pending = null;
  $('tracker').dataset.state = 'confirmed';
  $('tracker').querySelector('.orbit').textContent = '✓';
  $('tracker-title').textContent = 'Payment confirmed';
  $('tracker-subtitle').textContent = `${paid.length} predictions · receipt in Activity`;
  $('stage-list')
    .querySelectorAll('li')
    .forEach((el) => (el.className = 'done'));
  $('tracker-copy').textContent =
    'Your next slip stays clear. The full simulated receipt is saved in Activity.';
  $('view-receipt').hidden = false;
  $('continue-demo').hidden = true;
  render();
  $('announcement').textContent = 'Simulated payment confirmed. Receipt available in Activity.';
}
$('continue-demo').onclick = confirmPayment;
$('tracker-toggle').onclick = () => {
  $('tracker-details').hidden = !$('tracker-details').hidden;
  $('tracker-toggle').setAttribute('aria-expanded', String(!$('tracker-details').hidden));
};
$('view-receipt').onclick = () => {
  openSlip();
  switchTab('activity');
  $('activity-tab').focus();
};
const plan = $('plan-dialog');
$('show-plan').onclick = () => plan.showModal();
$('close-plan').onclick = () => plan.close();
$('plan-done').onclick = () => plan.close();
document.addEventListener('keydown', (e) => {
  const overlay = !$('cost-panel').hidden
    ? $('cost-panel')
    : !$('picker-panel').hidden
      ? $('picker-panel')
      : null;
  if (e.key === 'Escape' && !plan.open) {
    e.preventDefault();
    if (overlay) closeOverlays();
    else if (!$('slip').hidden) closeSlip();
  }
  if (e.key === 'Tab' && overlay) {
    const all = [...overlay.querySelectorAll('button:not(:disabled),input,summary')];
    const first = all[0],
      last = all.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
samplePicks(6);
