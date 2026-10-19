const paths = {
  home: 'm3 10 9-7 9 7v10H3z M9 20v-7h6v7',
  chart: 'M4 20V11m7 9V4m7 16v-8M2 21h20',
  play: 'M3 5h18v14H3z m6 4 6 3-6 3z',
  activity: 'M4 5h16v16H4z M7 3v4m10-4v4M4 10h16m-12 4h3m3 0h3',
  shirt: 'm8 3-5 3 3 5 2-1v11h8V10l2 1 3-5-5-3c-1 3-7 3-8 0',
  shield: 'm12 3 8 4v6c0 5-8 9-8 9S4 18 4 13V7z m-4 9 3 3 5-6',
  people:
    'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-6 9v-3c0-5 12-5 12 0v3m2-17c6 0 6 8 0 8m2 3c4 0 4 4 4 6',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9v-2c0-6 14-6 14 0v2',
  chevron: 'm9 5 7 7-7 7',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  info: 'M12 10v7m0-11v1 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
  refresh: 'M20 8a9 9 0 1 0 1 7M20 3v6h-6',
  clock: 'M12 7v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',
  check: 'm5 12 4 4L20 5',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14m5-2 6 6',
  wallet: 'M3 6h17v14H3z m0 0V3h14v3m-3 5h7v5h-7z',
  return: 'M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12',
  alert: 'm12 3 10 18H2z M12 9v5m0 3v1',
  receipt: 'M5 3h14v19l-3-2-4 2-4-2-3 2z M8 8h8m-8 4h8m-8 4h4',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.activity}"/></svg>`;
const decorate = () =>
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
const money = (n) => n.toLocaleString('en-GB');
const content = document.querySelector('#content');
const dialog = document.querySelector('#detail');
const detailContent = document.querySelector('#detail-content');
let fixtures = [],
  bets = [],
  tab = 'open',
  filter = 'all',
  search = '',
  scenario = 'populated',
  activeId = null,
  opener = null,
  timers = [];
const samples = [
  {
    id: 'live',
    f: 4,
    pick: 'Chelsea to win',
    side: 'away',
    stake: 200,
    phase: 'live',
    score: '1 : 2',
    time: 'Live · 68′',
    state: 'In play',
    sub: 'Your prediction is active',
  },
  {
    id: 'upcoming',
    f: 6,
    pick: 'Liverpool to win',
    side: 'away',
    stake: 100,
    phase: 'upcoming',
    score: 'vs',
    time: 'Sat · 15:00',
    state: 'Upcoming',
    sub: 'Waiting for kickoff',
  },
  {
    id: 'scheduled',
    f: 0,
    pick: 'Real Madrid to win',
    side: 'home',
    stake: 500,
    phase: 'upcoming',
    score: 'vs',
    time: 'Sun · 20:00',
    state: 'Upcoming',
    sub: 'Waiting for kickoff',
  },
  {
    id: 'settling',
    f: 2,
    pick: 'Draw',
    side: 'draw',
    stake: 100,
    phase: 'settling',
    score: '1 : 1',
    time: 'Full time',
    state: 'Awaiting settlement',
    sub: 'Result is being verified',
  },
  {
    id: 'winner',
    f: 1,
    pick: 'Barcelona to win',
    side: 'away',
    stake: 500,
    phase: 'ready',
    result: 'won',
    returns: 1250,
    score: '0 : 2',
    time: 'Full time',
    state: 'Won',
    sub: 'Return ready to collect',
  },
  {
    id: 'void',
    f: 3,
    pick: 'Juventus to win',
    side: 'home',
    stake: 100,
    phase: 'ready',
    result: 'refunded',
    returns: 100,
    score: '—',
    time: 'Market voided',
    state: 'Refund available',
    sub: 'Full stake + storage',
  },
  {
    id: 'storage',
    f: 5,
    pick: 'Draw',
    side: 'draw',
    stake: 100,
    phase: 'ready',
    result: 'lost',
    returns: 0,
    score: '2 : 1',
    time: 'Full time',
    state: 'Lost',
    sub: 'Storage ready to collect',
  },
  {
    id: 'past-win',
    f: 7,
    pick: 'Manchester City to win',
    side: 'home',
    stake: 300,
    phase: 'history',
    result: 'won',
    returns: 720,
    score: '3 : 0',
    time: 'Previous round · 12 Oct',
    state: 'Won',
    sub: 'Collected · 13 Oct',
  },
  {
    id: 'past-loss',
    f: 5,
    pick: 'Draw',
    side: 'draw',
    stake: 100,
    phase: 'history',
    result: 'lost',
    returns: 0,
    score: '2 : 1',
    time: 'Previous round · 12 Oct',
    state: 'Lost',
    sub: 'Storage collected · 13 Oct',
  },
  {
    id: 'past-refund',
    f: 3,
    pick: 'Lazio to win',
    side: 'away',
    stake: 100,
    phase: 'history',
    result: 'refunded',
    returns: 100,
    score: '—',
    time: 'Previous round · 05 Oct',
    state: 'Voided',
    sub: 'Refund collected · 06 Oct',
  },
];
function init() {
  timers.forEach(clearTimeout);
  timers = [];
  bets = structuredClone(samples);
  tab = 'open';
  filter = 'all';
  search = '';
  activeId = null;
  if (dialog.open) dialog.close();
  render();
}
const inHistory = (b) => ['ready', 'history', 'claiming', 'checking'].includes(b.phase);
function readyRows() {
  return bets.filter((b) => b.phase === 'ready');
}
function badge(b) {
  const c =
    b.result === 'won'
      ? 'won'
      : b.result === 'refunded'
        ? 'refund'
        : b.phase === 'live'
          ? 'live'
          : ['settling', 'checking', 'claiming'].includes(b.phase)
            ? 'waiting'
            : '';
  return `<span class="status ${c}">${icon(b.result === 'won' ? 'check' : b.result === 'refunded' ? 'return' : b.phase === 'live' ? 'play' : b.phase === 'upcoming' ? 'clock' : 'shield')}${b.state}</span>`;
}
function row(b) {
  const f = fixtures[b.f];
  return `<article class="bet" data-bet="${b.id}" aria-label="${f.home.name} vs ${f.away.name}, ${b.state}">
  <div class="match-info"><div class="match-meta"><span>${f.league}</span><span>·</span><span class="${b.phase === 'live' ? 'live-text' : ''}">${b.time}${b.phase === 'live' ? ` · ${b.score}` : ''}</span></div><div class="teams"><div class="crests"><img src="${f.home.logo}" alt=""/><img src="${f.away.logo}" alt=""/></div><h3>${f.home.name}<span>vs</span>${f.away.name}</h3></div><div class="pick"><span class="pick-dot ${b.side}"></span>Your pick: ${b.pick}</div></div>
  <div class="stake">${money(b.stake)}<small>tCKB</small></div><div class="state">${badge(b)}<small>${b.sub}</small></div><div class="row-action">${b.phase === 'ready' ? `<button class="collect" data-open="${b.id}" data-collect="true">${b.result === 'refunded' ? 'Collect refund' : b.result === 'lost' ? 'Collect storage' : 'Collect return'}</button>` : b.phase === 'history' ? `<div class="return">${money(b.returns + 321)}<small>tCKB returned</small></div>` : ''}<button class="details" id="open-${b.id}" data-open="${b.id}" aria-label="Details for ${f.home.name} vs ${f.away.name}"><span class="details-label">${b.phase === 'history' ? '' : b.phase === 'ready' ? '' : 'Details'}</span>${icon('chevron')}</button></div></article>`;
}
function render() {
  const blank = ['empty', 'disconnected'].includes(scenario);
  const open = bets.filter((b) => !inHistory(b));
  const ready = readyRows();
  const total = ready.reduce((n, b) => n + b.returns + 321, 0);
  content.innerHTML = `${scenario === 'unavailable' ? `<div class="notice">${icon('alert')}<div><strong>Updates paused. Your last activity is still here.</strong><p>These are saved statuses, not a fresh balance. Claims are unavailable until we reconnect.</p></div><button class="secondary" data-action="reconnect">Try again</button></div>` : ''}
    <section class="summary" aria-label="Activity summary"><div class="metric"><div class="metric-label">${icon('activity')}Open predictions</div><strong>${blank ? '—' : open.length}</strong><p>${blank ? 'Your active calls appear here' : `${open.filter((b) => !['ready', 'claiming', 'checking'].includes(b.phase)).length} following the match · ${ready.length} to collect`}</p></div><div class="metric claims"><div class="metric-label">${icon('wallet')}Ready to collect</div><strong>${blank ? '—' : money(total)} <small>tCKB</small></strong><p>${blank ? 'Returns + refundable storage' : `Includes ${money(ready.length * 321)} tCKB storage`}</p>${!blank && ready.length ? `<button class="claim-shortcut" data-action="claims">View ${ready.length} claims ${icon('arrow')}</button>` : ''}</div><div class="metric"><div class="metric-label">${icon('check')}Completed predictions</div><strong>${blank ? '—' : bets.filter((b) => b.phase === 'history').length}</strong><p>Settled and collected</p></div></section>
    ${
      blank
        ? emptyView()
        : `<div class="payment-strip">${scenario === 'uncertain' ? icon('info') : '<span class="spinner"></span>'}<div><strong>${scenario === 'uncertain' ? 'Checking a payment' : 'One payment is confirming'}</strong><p>3 independent predictions · 300 tCKB staked · ${scenario === 'uncertain' ? 'No need to sign again.' : 'Not yet counted as accepted bets.'}</p></div><button class="quiet" id="payment-open" data-action="payment">View payment ${icon('arrow')}</button></div>
    <div class="tabs-row"><div class="tabs" role="tablist" aria-label="Prediction activity"><button class="tab" id="open-tab" role="tab" aria-selected="${tab === 'open'}" aria-controls="results" tabindex="${tab === 'open' ? 0 : -1}" data-tab="open">Open bets <span class="count">${open.length}</span></button><button class="tab" id="history-tab" role="tab" aria-selected="${tab === 'history'}" aria-controls="results" tabindex="${tab === 'history' ? 0 : -1}" data-tab="history">History <span class="count">${bets.filter(inHistory).length}</span></button></div><span class="synced">${icon(scenario === 'unavailable' ? 'clock' : 'check')}${scenario === 'unavailable' ? 'Saved snapshot' : 'Sample snapshot'}</span></div>
    <div class="tools"><div class="filters" aria-label="Filter predictions">${filters()}</div><label class="search">${icon('search')}<span class="sr-only">Search matches</span><input id="search" type="search" placeholder="Search your matches" value=""/></label></div><section id="results" role="tabpanel" aria-labelledby="${tab}-tab"></section>`
    }`;
  const input = document.querySelector('#search');
  if (input) input.value = search;
  renderList();
}
function filters() {
  return (
    tab === 'open'
      ? [
          ['all', 'All open'],
          ['live', 'In play'],
          ['upcoming', 'Upcoming'],
          ['settling', 'Settling'],
        ]
      : [
          ['all', 'All results'],
          ['ready', 'To collect'],
          ['won', 'Won'],
          ['lost', 'Lost'],
          ['refunded', 'Refunded'],
        ]
  )
    .map(
      ([key, label]) =>
        `<button class="filter" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`,
    )
    .join('');
}
function renderList() {
  const results = document.querySelector('#results');
  if (!results) return;
  const rows = bets.filter(
    (b) =>
      (tab === 'history' ? inHistory(b) : !inHistory(b)) &&
      (filter === 'all' ||
        (tab === 'history' && filter !== 'ready' ? b.result === filter : b.phase === filter)) &&
      `${fixtures[b.f].home.name} ${fixtures[b.f].away.name} ${b.pick}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  results.innerHTML = rows.length
    ? `<div class="list-heading" aria-hidden="true"><span>Match / your prediction</span><span>Stake</span><span>Status</span><span>${tab === 'history' ? 'Return / action' : 'Next step'}</span></div><div class="list">${rows.map(row).join('')}</div><div class="list-foot"><span>${rows.length} prediction${rows.length === 1 ? '' : 's'} · ${tab === 'open' ? 'Each settles independently' : 'Returns include refundable storage'}</span><button data-action="storage">What is refundable storage?</button></div>`
    : `<div class="empty"><i>${icon('search')}</i><h2>No matching predictions.</h2><p>Try another team or clear your filters.</p><button class="secondary" data-action="clear">Clear filters</button></div>`;
}
function emptyView() {
  const disconnected = scenario === 'disconnected';
  return `<section class="empty glass"><i>${icon(disconnected ? 'wallet' : 'activity')}</i><h2>${disconnected ? 'Your predictions travel with your wallet.' : 'Your first call starts here.'}</h2><p>${disconnected ? 'Connect the wallet you used to predict. We will find your open bets, returns and history.' : 'Once you place a prediction, follow it here through kickoff, settlement and collection.'}</p><button class="primary" data-action="${disconnected ? 'connect' : 'sample'}">${disconnected ? 'Connect wallet' : 'Explore sample activity'} ${icon('arrow')}</button><p class="fineprint">Preview only. No wallet connection or payment.</p></section>`;
}
function modal(title, body) {
  detailContent.innerHTML = `<div class="detail-head"><span class="eyebrow">${title}</span><button class="close" data-action="close" aria-label="Close details">${icon('close')}</button></div><div class="detail-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
  detailContent.querySelector('.close').focus();
}
function details(id) {
  activeId = id;
  const b = bets.find((x) => x.id === id),
    f = fixtures[b.f];
  const finished = ['ready', 'history', 'claiming', 'checking'].includes(b.phase);
  const refund = b.result === 'refunded';
  const payout = b.returns ?? null;
  modal(
    'PREDICTION DETAILS',
    `${badge(b)}<h2 id="detail-title">${finished ? (refund ? 'Your stake comes back.' : b.result === 'won' ? 'A good call.' : 'Your prediction, settled.') : 'Following your call.'}</h2><p class="fineprint">${f.league} · Illustrative match state</p><div class="scoreboard"><div class="club"><img src="${f.home.logo}" alt=""/>${f.home.name}</div><div class="score">${b.score}<small>${b.phase === 'live' ? '68 MIN' : b.phase === 'upcoming' ? 'UPCOMING' : refund ? 'VOIDED' : 'FULL TIME'}</small></div><div class="club"><img src="${f.away.logo}" alt=""/>${f.away.name}</div></div><div class="selection"><span>Your pick <strong>${b.pick}</strong></span><strong>${money(b.stake)} tCKB</strong></div><h3 class="section-label">Where things stand</h3><ol class="timeline"><li><strong>Payment confirmed</strong><p>Your payment reached the chain. One payment can contain several independent predictions.</p></li><li><strong>Prediction accepted</strong><p>Your entry was verified before the cutoff.</p></li><li class="${finished ? '' : 'pending'}"><strong>${finished ? (refund ? 'Market voided' : 'Market settled') : b.phase === 'settling' ? 'Final whistle. Settlement next.' : b.phase === 'live' ? 'Match in progress' : 'Waiting for kickoff'}</strong><p>${finished ? (refund ? 'No accepted result by the deadline. No winners or betting fees.' : b.result === 'won' ? 'Your selected outcome won. Your return is now fixed.' : 'Your selected outcome did not win. Storage remains recoverable.') : b.phase === 'settling' ? 'The score alone does not unlock funds. Waiting for verified on-chain settlement.' : 'Your bet stays open until the market settles.'}</p></li><li class="${b.phase === 'history' ? '' : 'pending'}"><strong>${b.phase === 'history' ? 'Returned to your wallet' : b.phase === 'claiming' ? 'Transfer confirming' : b.phase === 'checking' ? 'Checking your transfer' : finished ? 'Ready to collect' : 'Return calculated after settlement'}</strong><p>${b.phase === 'history' ? 'Return and storage collected. This prediction is complete.' : finished ? 'Collect this prediction when you are ready. Network fee applies.' : 'Final returns depend on the settled pool. No fixed odds or guaranteed payout.'}</p></li></ol><div class="breakdown"><h3 class="section-label">${b.phase === 'history' ? 'Your completed return' : 'Return breakdown'}</h3><div class="money-row"><span>${refund ? 'Stake refund' : 'Prediction return'}${b.result === 'won' ? ' (includes stake)' : ''}</span><b>${payout === null ? 'Not final' : `${money(payout)} tCKB`}</b></div><div class="money-row"><span>Refundable storage</span><b>321 tCKB</b></div><p class="storage-note">Storage is a deposit, not a betting fee. It comes back when you collect, even if your prediction loses.</p>${finished ? `<div class="money-row total"><span>${b.phase === 'history' ? 'Returned before network fee' : 'Available before network fee'}</span><b>${money(payout + 321)} <small>tCKB</small></b></div>` : '<p class="fineprint">Your 321 tCKB storage is separate from the stake and any potential winnings.</p>'}
  ${b.phase === 'ready' ? `<button class="primary" id="claim" data-action="claim" ${scenario === 'unavailable' ? 'disabled' : ''}>Review ${refund ? 'refund' : 'collection'} ${icon('arrow')}</button><p class="fineprint">${scenario === 'unavailable' ? 'Reconnect before claiming.' : 'Review the network fee before approval. This preview simulates the process.'}</p>` : b.phase === 'claiming' ? '<button class="primary" disabled><span class="spinner"></span>Confirming transfer</button><p class="fineprint">You can close this panel. Progress stays with your prediction.</p>' : b.phase === 'checking' ? '<div class="notice"><div><strong>Your transfer needs a status check.</strong><p>The response was interrupted. Your signed payment is saved; do not sign again.</p></div></div><button class="primary" data-action="check-claim">Check saved transfer</button>' : ''}</div><details class="technical"><summary>Payment & verification details</summary><p>Sample reference: PREVIEW-${b.id.toUpperCase()}<br/>This is illustrative data, not an explorer transaction.<br/>In the app: payment hash, claim hash, latest chain check and independent position reference.</p></details>`,
  );
}
function guide() {
  activeId = null;
  modal(
    'A LITTLE CLARITY',
    `<h2 id="detail-title">Know where every call stands.</h2>${[
      [
        'Checking payment',
        'We have not confirmed the transaction yet. It is separate from accepted bets. Check the saved payment instead of signing again.',
      ],
      [
        'Upcoming / In play',
        'Your prediction is accepted. Follow the match while your stake stays in the pool.',
      ],
      [
        'Awaiting settlement',
        'The match has finished. The result and pool settlement still need confirmation.',
      ],
      [
        'Won / Lost',
        'The result is settled. Winners collect their return plus storage. Losing predictions still have storage to collect.',
      ],
      [
        'Refund available',
        'A voided or ineligible prediction returns its full stake plus storage.',
      ],
      [
        'History',
        'The prediction is settled. A collection button means funds still need to be claimed; Collected means they have been returned. A completed payment by itself does not mean the bet is settled.',
      ],
    ]
      .map(([h, p]) => `<div class="explain-row"><strong>${h}</strong><p>${p}</p></div>`)
      .join('')}`,
  );
}
function payment() {
  activeId = null;
  modal(
    'PAYMENT TRACKING',
    `<span class="status ready">${icon('clock')} ${scenario === 'uncertain' ? 'Checking payment' : 'Confirming payment'}</span><h2 id="detail-title">One payment. Three separate calls.</h2><p class="fineprint">These predictions appear in Open bets after their entries are verified. A slow response does not mean a failed payment.</p><div class="breakdown">${[0, 4, 6].map((i) => `<div class="explain-row"><strong>${fixtures[i].home.name} vs ${fixtures[i].away.name}</strong><p>100 tCKB stake · Waiting for entry verification</p></div>`).join('')}<div class="money-row"><span>3 stakes</span><b>300 tCKB</b></div><div class="money-row"><span>Refundable storage · 3 × 321</span><b>963 tCKB</b></div><div class="money-row total"><span>Total before network fee</span><b>1,263 <small>tCKB</small></b></div><p class="storage-note">The full payment includes storage for each prediction. All three predictions settle independently.</p><button class="primary" data-action="check-payment">Check payment status</button><p class="fineprint">Checks the existing payment. No repeat signature.</p></div>`,
  );
}
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('visible');
  timers.push(setTimeout(() => el.classList.remove('visible'), 4500));
}
function completeClaim(b) {
  b.phase = 'history';
  b.sub = 'Collected · Just now';
  render();
  if (dialog.open && activeId === b.id) {
    details(b.id);
  }
  toast(`Sample collection complete: ${money(b.returns + 321)} tCKB before network fee.`);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (!dialog.open) opener = el;
  if (el.dataset.open) {
    details(el.dataset.open);
    return;
  }
  if (el.dataset.tab) {
    tab = el.dataset.tab;
    filter = 'all';
    search = '';
    render();
    document.querySelector(`#${tab}-tab`).focus();
    return;
  }
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    document.querySelector('.filters').innerHTML = filters();
    renderList();
    document.querySelector(`[data-filter="${filter}"]`).focus();
    return;
  }
  const action = el.dataset.action;
  if (action === 'close') {
    dialog.close();
    return;
  }
  if (action === 'claims') {
    tab = 'history';
    filter = 'ready';
    search = '';
    render();
    document.querySelector('[data-filter="ready"]').focus();
    document.querySelector('.tabs-row').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  if (action === 'clear') {
    filter = 'all';
    search = '';
    render();
    document.querySelector('#search').focus();
  }
  if (['reconnect', 'connect', 'sample'].includes(action)) {
    scenario = 'populated';
    document.querySelector('#scenario').value = scenario;
    render();
    toast('Showing sample activity. No real connection was made.');
  }
  if (action === 'storage' || el.id === 'guide') {
    guide();
  }
  if (action === 'payment') {
    payment();
  }
  if (action === 'check-payment') {
    el.innerHTML = `${icon('check')}Status checked`;
    toast('Sample payment is still confirming. No new payment was created.');
  }
  if (action === 'claim') {
    const b = bets.find((x) => x.id === activeId);
    modal(
      'REVIEW COLLECTION',
      `<h2 id="detail-title">Back to your wallet.</h2><p class="fineprint">${fixtures[b.f].home.name} vs ${fixtures[b.f].away.name}</p><div class="money-row"><span>${b.result === 'refunded' ? 'Stake refund' : 'Prediction return'}</span><b>${money(b.returns)} tCKB</b></div><div class="money-row"><span>Refundable storage</span><b>321 tCKB</b></div><div class="money-row"><span>Sample network fee</span><b>0.001 tCKB</b></div><div class="money-row total"><span>Sample wallet credit</span><b>${`${money(b.returns + 320)}.999`} <small>tCKB</small></b></div><p class="storage-note">In the app, your wallet reviews the exact fee and amount before you approve. This button only animates the design.</p><button class="primary" data-action="confirm-claim">Simulate approval ${icon('arrow')}</button>`,
    );
  }
  if (action === 'confirm-claim') {
    const b = bets.find((x) => x.id === activeId);
    b.phase = 'claiming';
    b.state = 'Transfer confirming';
    b.sub = 'Safe to keep exploring';
    render();
    details(b.id);
    timers.push(
      setTimeout(() => {
        if (scenario === 'claim-error') {
          b.phase = 'checking';
          b.state = 'Check transfer';
          b.sub = 'Signature saved';
          render();
          if (dialog.open && activeId === b.id) details(b.id);
          toast('Sample response interrupted. Check the saved transfer.');
        } else {
          b.state = b.result === 'won' ? 'Won' : 'Voided';
          completeClaim(b);
        }
      }, 2200),
    );
  }
  if (action === 'check-claim') {
    const b = bets.find((x) => x.id === activeId);
    b.state = b.result === 'won' ? 'Won' : 'Voided';
    completeClaim(b);
  }
  if (el.id === 'reset') {
    scenario = 'populated';
    document.querySelector('#scenario').value = scenario;
    init();
    toast('Preview reset.');
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') {
    search = e.target.value;
    renderList();
  }
});
document.querySelector('#scenario').addEventListener('change', (e) => {
  scenario = e.target.value;
  init();
});
document.addEventListener('keydown', (e) => {
  if (
    e.target.matches('[role="tab"]') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
  ) {
    e.preventDefault();
    tab =
      e.key === 'Home' ? 'open' : e.key === 'End' ? 'history' : tab === 'open' ? 'history' : 'open';
    filter = 'all';
    search = '';
    render();
    document.querySelector(`#${tab}-tab`).focus();
  }
});
dialog.addEventListener('close', () => {
  const fallback = document.querySelector(activeId ? `#open-${activeId}` : '#guide');
  (opener?.isConnected ? opener : fallback)?.focus();
});
decorate();
try {
  const response = await fetch('fixtures.json');
  if (!response.ok) throw Error('snapshot');
  fixtures = (await response.json()).fixtures;
  init();
} catch {
  content.innerHTML =
    '<section class="empty"><h2>Preview could not load.</h2><p>Restart the local preview server and reload this page.</p></section>';
}
