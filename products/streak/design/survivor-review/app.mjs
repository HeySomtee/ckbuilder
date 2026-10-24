const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const teams = [
  {
    id: 'city',
    name: 'Manchester City',
    code: 'MCI',
    crest: 50,
    fixture: 'vs Ipswich · Home',
    next: 'NEXT: Chelsea (A)',
    used: false,
  },
  {
    id: 'chelsea',
    name: 'Chelsea',
    code: 'CHE',
    crest: 49,
    fixture: 'vs Everton · Away',
    next: 'NEXT: Man City (H)',
    used: false,
  },
  {
    id: 'everton',
    name: 'Everton',
    code: 'EVE',
    crest: 45,
    fixture: 'vs Chelsea · Home',
    next: 'NEXT: Liverpool (A)',
    used: false,
  },
  {
    id: 'ipswich',
    name: 'Ipswich',
    code: 'IPS',
    crest: 57,
    fixture: 'vs Man City · Away',
    next: 'NEXT: Brentford (H)',
    used: false,
  },
  {
    id: 'liverpool',
    name: 'Liverpool',
    code: 'LIV',
    crest: 40,
    fixture: 'vs Brentford · Away',
    next: 'NEXT: Everton (H)',
    used: true,
  },
  {
    id: 'brentford',
    name: 'Brentford',
    code: 'BRE',
    crest: 55,
    fixture: 'vs Liverpool · Home',
    next: 'NEXT: Ipswich (A)',
    used: true,
  },
];
const initial = () => ({
  title: 'The long game',
  mode: 'free',
  fee: '100',
  prize: '10000',
  limit: '64',
});
let competition = initial();
let role = 'player',
  joined = false,
  pick = null,
  selected = null,
  tab = 'pick',
  scenario = 'open',
  busy = false;
let toastTimer;
const modal = $('#modal');
const money = (value) => BigInt(value).toLocaleString('en-US') + ' tCKB';
const feeLabel = () => (competition.mode === 'free' ? 'Free entry' : money(competition.fee));
const isUsed = (team) => scenario !== 'open' && team.used;
const canPick = () => ['open', 'mid'].includes(scenario);
const round = () => (scenario === 'open' ? 1 : 3);
const toast = (message) => {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  toastTimer = setTimeout(() => {
    $('#toast').textContent = '';
  }, 5000);
};
const rules = () =>
  `<details class="rules-detail"><summary>Read the proposed competition rules</summary><ol><li>One entry per account. Pick one eligible team per round. All picks lock together before the first listed match.</li><li>A win keeps you in. A draw, loss or missed pick eliminates you. You cannot use a team again in this competition.</li><li>Picks stay hidden until lock. You can change yours before lock.</li><li>An unresolved postponed or abandoned fixture is void after the round's published resolution deadline. That entrant advances and keeps their team available.</li><li>If every remaining entrant loses or draws, they all advance; those teams stay used. Missed picks do not qualify for this rescue.</li><li>The last survivor wins. If no further legal round is possible, remaining survivors share the prize equally. Exact payout and rounding rules must be published before paid entry.</li><li>Fewer than two entrants at opening lock cancels the competition. Proposed policy: return entry fees on cancellation; ordinary elimination does not qualify for a refund.</li></ol><p>Sample schedule only. The live design will publish exact fixtures, lock times and final-result deadlines.</p></details>`;
const art = () =>
  `<div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><div class="orbit three"></div><div class="diamond"><svg viewBox="0 0 80 80"><path d="M40 6 65 20v23L40 73 15 43V20Z"/><path d="m27 39 9 9 18-22M40 6v13M15 20l12 7M65 20l-12 7"/></svg></div><div class="crest-orbit one"><img src="assets/team-50.png" alt="" /></div><div class="crest-orbit two"><img src="assets/team-49.png" alt="" /></div><div class="crest-orbit three"><img src="assets/team-40.png" alt="" /></div><span class="art-caption">PLAY THE LONG GAME.</span></div>`;

function render() {
  $('#main').innerHTML = `
    <div class="intro"><div><span class="eyebrow">ONE TEAM. EVERY ROUND.</span><h1>Streak Survivor<span class="muted">.</span></h1><p>Know when to play your strongest hand.</p></div>${role === 'admin' ? `<button class="secondary" id="manage">${joined ? 'View competition terms' : 'Create / edit competition'} ↗</button>` : '<span class="tag green">Premier League</span>'}</div>
    <section class="hero glass" aria-label="Competition overview"><div class="hero-copy"><span class="eyebrow">${escape(competition.title.toUpperCase())} · BY STREAK</span><h2>Win this week.<br /><em>Think three ahead.</em></h2><p>One team to win. One chance to stay in.<br />Once you use a team, it is off your board.</p><div class="hero-actions">${!joined ? '<button class="primary" id="join">Review entry <span>↗</span></button>' : `<button class="primary" id="to-pick">${canPick() ? 'Your team board' : 'See your round'} <span>↓</span></button>`}<button class="text-button" id="how">How it works ↗</button></div></div>${art()}<div class="competition-bar"><div><small>ADMIN-SET PRIZE</small><b class="prize">${money(competition.prize)}</b><span>Illustrative · not funded</span></div><div><small>ENTRY</small><b>${feeLabel()}</b><span>${competition.mode === 'free' ? 'Same game. No entry payment.' : 'Entry fee is separate from prize.'}</span></div><div><small>COMPETITION SIZE</small><b>${escape(competition.limit)} places</b><span>${joined ? 'Your demo entry is in' : 'One entry per account'}</span></div><div><small>ROUND ${round()} LOCKS</small><b>${scenario === 'open' || scenario === 'mid' ? 'Sat · 12:30' : 'Picks locked'}</b><span>Sample schedule · Lagos time</span></div></div></section>
    <div class="content-grid"><section id="game-panel" aria-label="Your competition"><div class="tabs" aria-label="Competition views"><button data-tab="pick" aria-pressed="${tab === 'pick'}">Your team board</button><button data-tab="board" aria-pressed="${tab === 'board'}">Survivor board</button><button data-tab="history" aria-pressed="${tab === 'history'}">Your run</button></div>${tab === 'pick' ? pickView() : tab === 'board' ? boardView() : historyView()}</section><aside><section class="glass side-panel"><span class="eyebrow">THE ART OF SURVIVING</span><h3>Your best team.<br />Or your best timing?</h3><p>City might look safe today. But will you wish you had saved them for next weekend?</p><ul class="rule-list"><li><i>01</i><span><strong>Pick a winner</strong>Draws and losses put you out.</span></li><li><i>02</i><span><strong>Spend your teams wisely</strong>No repeats within this competition.</span></li><li><i>03</i><span><strong>Outlast the rest</strong>Keep winning. Be the last one standing.</span></li></ul></section><section class="glass side-panel"><span class="eyebrow">${joined ? 'YOUR RUN' : 'THE PRIZE, EXPLAINED'}</span><h3>${joined ? (scenario === 'open' ? 'A fresh start.' : 'Two rounds in.') : 'Set by the host.'}</h3><p>${joined ? 'Every used team changes your next decision. Your history stays with this competition.' : 'The admin chooses the prize independently of entry fees. A free competition can still carry a prize.'}</p><div class="steps" aria-hidden="true"><span class="${joined && scenario !== 'open' ? 'done' : ''}"></span><span class="${joined && scenario !== 'open' ? 'done' : ''}"></span><span></span><span></span><span></span><span></span></div><small class="muted">${joined ? 'Sample progression, not live standings' : 'Sample prize only. No award or funded balance.'}</small></section></aside></div>
    <section class="scenario-panel" aria-label="Preview scenario controls"><div><strong>Explore the flow</strong><small>These controls simulate later rounds. They do not settle a competition.</small></div><label><span class="sr-label">Preview state </span><select id="scenario"><option value="open">Round 1 · Entry open</option><option value="mid">Round 3 · Used teams</option><option value="locked">Round 3 · Picks revealed</option><option value="survived">Round 3 · You survived</option><option value="out">Round 3 · Knocked out</option><option value="winner">Final · Last survivor</option></select></label></section>`;
  $('#scenario').value = scenario;
  $('#scenario').addEventListener('change', (event) => {
    scenario = event.target.value;
    if (scenario !== 'open') {
      joined = true;
      pick = 'city';
      selected = 'city';
    } else {
      joined = false;
      pick = null;
      selected = null;
    }
    tab = 'pick';
    render();
  });
  $('#manage')?.addEventListener('click', (event) => {
    event.currentTarget.focus();
    adminDialog();
  });
  $('#join')?.addEventListener('click', (event) => {
    event.currentTarget.focus();
    joinDialog();
  });
  $('#how').addEventListener('click', () => {
    $('#how').focus({ preventScroll: true });
    openDialog(
      `<div class="modal-header"><div><span class="eyebrow">THE RULEBOOK</span><h2 id="modal-title">Simple to play. Hard to last.</h2></div><button class="close" data-close aria-label="Close rules">×</button></div><div class="modal-body"><p>Pick a different winner each round. Save your strongest teams for when you need them most.</p>${rules()}<div class="notice">Rules are proposed for review. No live competition is running.</div></div>`,
    );
  });
  $('#to-pick')?.addEventListener('click', () => {
    tab = 'pick';
    render();
    $('#game-panel').scrollIntoView({ block: 'start' });
    $('#game-panel button')?.focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-tab]').forEach((button) =>
    button.addEventListener('click', () => {
      tab = button.dataset.tab;
      render();
      document.querySelector(`[data-tab="${tab}"]`).focus({ preventScroll: true });
    }),
  );
  document.querySelectorAll('[data-team]').forEach((button) =>
    button.addEventListener('click', () => {
      selected = button.dataset.team;
      render();
      document.querySelector(`[data-team="${selected}"]`).focus({ preventScroll: true });
    }),
  );
  $('#save-pick')?.addEventListener('click', () => {
    if (!joined) {
      $('#save-pick').focus({ preventScroll: true });
      joinDialog();
      return;
    }
    pick = selected;
    render();
    $('#save-pick')?.focus({ preventScroll: true });
    toast('Pick saved in this preview. You can change it until the round locks.');
  });
}

function pickView() {
  const states = {
    locked: [
      '◇',
      'The picks are in.',
      'Your City pick is locked. Everyone’s selection is now visible on the survivor board.',
    ],
    survived: [
      '✓',
      'Still standing.',
      'City won 2–0 in this sample round. You advance, but City is now off your board.',
    ],
    out: [
      '↗',
      'A good run. A tough result.',
      'City drew 1–1 in this sample round. Your run ends here. Follow the remaining survivors on the board.',
    ],
    winner: [
      '♧',
      'Last one standing.',
      'You outlasted the field. This is a winning-state preview, not a prize claim or funded award.',
    ],
  };
  const state = states[scenario];
  return `${state ? `<div class="glass state-card"><span class="state-symbol">${state[0]}</span><div><span class="eyebrow">ROUND ${round()} · SAMPLE RESULT</span><h3>${state[1]}</h3><p>${state[2]}</p></div></div>` : ''}<div class="panel-head"><h2>${canPick() ? 'Who keeps you in?' : 'Your team reserve'}</h2><small>${scenario === 'open' ? '6 of 20 clubs shown' : '2 teams used · sample subset'}</small></div><div class="team-grid">${teams
    .map((team) => {
      const used =
        isUsed(team) || (['survived', 'out', 'winner'].includes(scenario) && team.id === pick);
      return `<button class="team ${used ? 'used' : ''}" data-team="${team.id}" ${used || !canPick() ? 'disabled' : ''} aria-pressed="${selected === team.id}" aria-label="${team.name}${used ? ', already used' : ', ' + team.fixture}"><img src="assets/team-${team.crest}.png" alt="" /><span class="marker">${used ? 'USED' : selected === team.id ? '✓ YOUR PICK' : team.code}</span><strong>${team.name}</strong><small>${team.fixture}</small><div class="future">${team.next}</div></button>`;
    })
    .join(
      '',
    )}</div><p class="round-note">Illustrative pairings and future fixtures. The full live board will use verified EPL data.</p>${canPick() ? `<div class="selection-bar"><div><strong>${selected ? escape(teams.find((team) => team.id === selected).name) : 'A big decision. Take your time.'}</strong><small>${pick === selected && pick ? 'Saved · editable until round lock' : selected ? 'Win to advance. This team cannot be reused.' : 'Choose a team to see your pick here.'}</small></div><button class="primary" id="save-pick" ${!selected ? 'disabled' : ''}>${!joined ? 'Join to save pick' : pick === selected ? 'Pick saved ✓' : 'Save my pick'}${pick !== selected && joined ? ' ↗' : ''}</button></div>` : ''}`;
}

function boardView() {
  const revealed = !canPick();
  const rows = [
    ['MP', 'Matchday poet', 'Chelsea', 'Still in'],
    [
      'OT',
      'Offside theory',
      'Everton',
      scenario === 'survived' || scenario === 'winner' ? 'Out' : 'Still in',
    ],
    [
      'S',
      'You',
      pick ? teams.find((team) => team.id === pick).name : 'No pick yet',
      scenario === 'out' ? 'Out' : scenario === 'winner' ? 'Winner' : 'Still in',
    ],
    [
      'NN',
      'Ninety & nerves',
      'Ipswich',
      scenario === 'survived' || scenario === 'winner' ? 'Out' : 'Still in',
    ],
  ];
  return `<div class="panel-head"><h2>${revealed ? 'Everyone’s cards, on the table.' : 'Quiet picks. Loud weekends.'}</h2></div><div class="glass"><table class="board"><thead><tr><th>ENTRANT</th><th>ROUND ${round()} PICK</th><th>STATUS</th></tr></thead><tbody>${rows
    .filter((row) => row[1] !== 'You' || joined)
    .map(
      (row) =>
        `<tr class="${row[1] === 'You' ? 'me' : ''}"><td><span class="avatar">${row[0]}</span>${row[1]}</td><td>${revealed || row[1] === 'You' ? row[2] : 'Hidden until lock'}</td><td>${scenario === 'winner' && row[1] !== 'You' ? 'Out' : row[3]}</td></tr>`,
    )
    .join(
      '',
    )}</tbody></table></div><p class="round-note">Illustrative entrants. Everyone’s picks stay hidden until the published round lock.</p>`;
}

function historyView() {
  if (!joined)
    return '<div class="glass empty"><h3>Your run starts with one call.</h3>Review the entry terms, join and choose your first team.</div>';
  const history =
    scenario === 'open'
      ? []
      : [
          { team: teams[4], round: 1, result: 'Win · advanced' },
          { team: teams[5], round: 2, result: 'Win · advanced' },
        ];
  if (pick)
    history.push({
      team: teams.find((team) => team.id === pick),
      round: round(),
      result: canPick()
        ? 'Saved · not locked'
        : scenario === 'out'
          ? 'Draw · eliminated'
          : scenario === 'locked'
            ? 'Locked · awaiting result'
            : 'Win · advanced',
    });
  return `<div class="panel-head"><h2>Your decisions, round by round.</h2></div><div class="glass">${history.length ? history.map((item) => `<div class="history-item"><img src="assets/team-${item.team.crest}.png" alt="" /><div><strong>${item.team.name}</strong><small>Round ${item.round}</small></div><span class="tag">${item.result}</span></div>`).join('') : '<div class="empty">You’re in. Save your first pick to begin your run.</div>'}</div>`;
}

let returnFocus;
function openDialog(content) {
  returnFocus = document.activeElement;
  $('#modal-content').innerHTML = content;
  modal.showModal();
  modal.querySelector('[data-close]')?.addEventListener('click', () => modal.close());
}
modal.addEventListener('close', () => {
  if (returnFocus?.isConnected) returnFocus.focus();
  else $('#join')?.focus({ preventScroll: true });
});
modal.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});

function adminDialog() {
  const locked = joined;
  openDialog(
    `<div class="modal-header"><div><span class="eyebrow">ADMIN STUDIO · PREVIEW</span><h2 id="modal-title">${locked ? 'Published terms' : 'Create your competition'}</h2></div><button class="close" data-close aria-label="Close admin studio">×</button></div><form id="admin-form" class="modal-body"><p style="margin-bottom:18px">You set the stage. Your players make the calls.</p><fieldset ${locked ? 'disabled' : ''}><label class="field">Competition name<input name="title" value="${escape(competition.title)}" required maxlength="48" /></label><fieldset><legend>How do players get in?</legend><div class="segmented"><label><input type="radio" name="mode" value="free" ${competition.mode === 'free' ? 'checked' : ''} />Free entry<small>No entry payment</small></label><label><input type="radio" name="mode" value="paid" ${competition.mode === 'paid' ? 'checked' : ''} />Fee gate<small>Payment before entry</small></label></div></fieldset><div id="fee-field" ${competition.mode === 'free' ? 'hidden' : ''}><label class="field">Entry fee · tCKB<input name="fee" inputmode="numeric" pattern="[1-9][0-9]{0,8}" value="${escape(competition.fee)}" ${competition.mode === 'paid' ? 'required' : 'disabled'} /><small>Whole testnet CKB in this preview. Separate from the prize.</small></label></div><div class="field-row"><label class="field">Prize you set · tCKB<input name="prize" inputmode="numeric" pattern="[1-9][0-9]{0,8}" required value="${escape(competition.prize)}" /><small>Illustrative fixed prize. Not an entry-fee pool.</small></label><label class="field">Maximum entrants<input name="limit" type="number" min="2" max="1000" step="1" required value="${escape(competition.limit)}" /><small>One entry per account.</small></label></div></fieldset><div class="notice">${locked ? 'An entrant has joined. Entry fee, prize and rules are now locked in this preview. Reset the demo to create a different competition.' : 'This publishes a local preview only. Setting a prize does not fund it. Real fee collection, prize funding and payout need a separate implementation.'}</div>${rules()}<div class="modal-actions"><button type="button" class="secondary" id="admin-cancel">${locked ? 'Done' : 'Cancel'}</button>${!locked ? '<button type="submit" class="primary">Publish preview ↗</button>' : ''}</div></form>`,
  );
  $('#admin-cancel').addEventListener('click', () => modal.close());
  document.querySelectorAll('[name="mode"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      const paid = radio.value === 'paid';
      $('#fee-field').hidden = !paid;
      const input = $('[name="fee"]');
      input.disabled = !paid;
      input.required = paid;
    }),
  );
  $('#admin-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (role !== 'admin' || joined) return;
    const form = event.target;
    const name = form.elements.title;
    if (!name.value.trim()) {
      name.setCustomValidity('Enter a competition name.');
      name.reportValidity();
      name.addEventListener('input', () => name.setCustomValidity(''), { once: true });
      return;
    }
    const data = new FormData(form);
    competition = {
      title: String(data.get('title')).trim(),
      mode: String(data.get('mode')),
      fee: String(data.get('fee') || competition.fee),
      prize: String(data.get('prize')),
      limit: String(data.get('limit')),
    };
    modal.close();
    render();
    $('#manage')?.focus({ preventScroll: true });
    toast('Competition published in this preview. Switch to Player to try joining.');
  });
}

function joinDialog() {
  openDialog(
    `<div class="modal-header"><div><span class="eyebrow">YOUR PLACE IN THE GAME</span><h2 id="modal-title">${escape(competition.title)}</h2></div><button class="close" data-close aria-label="Close entry review">×</button></div><div class="modal-body"><p>One entry. A fresh team every round. Outlast the field.</p><div class="invoice"><div><span>Entry fee<small>${competition.mode === 'free' ? 'No payment to enter' : 'Not refundable if your pick loses'}</small></span><strong>${feeLabel()}</strong></div><div><span>Admin-set prize<small>Sample prize · not funded or guaranteed</small></span><strong>${money(competition.prize)}</strong></div><div><span>Who wins?<small>Joint winners split equally if teams run out</small></span><strong>Last survivor</strong></div></div><div class="notice">${competition.mode === 'paid' ? 'Fee-gate simulation. No wallet will open and no funds will move. The live review must show any network or storage costs before approval.' : 'Free entry simulation. This is not a live competition or an account registration.'}</div>${rules()}<label class="check"><input id="accept" type="checkbox" />I understand the proposed rules and that this is a sample competition.</label><label class="check"><input id="fail-entry" type="checkbox" />Preview a failed entry attempt</label><p id="entry-feedback" role="status"></p><div class="modal-actions"><button class="primary" id="confirm-entry" disabled>${competition.mode === 'free' ? 'Simulate free entry' : 'Simulate paying ' + money(competition.fee)}</button></div></div>`,
  );
  $('#accept').addEventListener('change', (event) => {
    $('#confirm-entry').disabled = !event.target.checked;
  });
  $('#confirm-entry').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const button = $('#confirm-entry');
    const fail = $('#fail-entry').checked;
    button.disabled = true;
    button.classList.add('loading');
    button.textContent = 'Simulating entry';
    $('#accept').disabled = true;
    $('#fail-entry').disabled = true;
    modal.querySelector('[data-close]').disabled = true;
    await new Promise((resolve) => setTimeout(resolve, 750));
    busy = false;
    if (fail) {
      $('#entry-feedback').textContent =
        'Sample attempt failed. No entry or payment was recorded. Turn off the failure toggle and retry.';
      button.textContent = 'Try simulation again';
      button.classList.remove('loading');
      button.disabled = false;
      $('#accept').disabled = false;
      $('#fail-entry').disabled = false;
      modal.querySelector('[data-close]').disabled = false;
      return;
    }
    joined = true;
    modal.close();
    render();
    $('#game-panel').scrollIntoView({ block: 'start' });
    document.querySelector('[data-tab="pick"]').focus({ preventScroll: true });
    toast('You’re in the demo. Choose your team and save your pick.');
  });
}

$('#role').addEventListener('change', (event) => {
  role = event.target.value;
  render();
});
$('#reset').addEventListener('click', () => {
  if (busy) return;
  competition = initial();
  joined = false;
  pick = null;
  selected = null;
  scenario = 'open';
  tab = 'pick';
  render();
  toast('Preview reset. No live data was changed.');
});
render();
