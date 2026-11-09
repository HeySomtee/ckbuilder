const $ = (selector) => document.querySelector(selector);
const competitions = [
  { id: 'gw10', name: 'GW10 Predictions Test', detail: '3 points for a correct result' },
  { id: 'weekend', name: 'Weekend Challengers', detail: '3 points for a correct result' },
];
const scenarios = {
  multiple: {
    title: 'Multiple competitions',
    selected: ['gw10'],
    available: ['gw10', 'weekend'],
    description:
      'Select one or more eligible competitions for the same paid prediction. Each has its own entry slot. Coming from a competition preselects that competition.',
  },
  regular: {
    title: 'Regular by choice',
    selected: [],
    available: ['gw10', 'weekend'],
    description:
      'A regular prediction leaves your competition entry unused. No later sync or registration should silently turn it into a competition pick.',
  },
  single: {
    title: 'One eligible competition',
    selected: ['gw10'],
    available: ['gw10'],
    description:
      'The same compact selector works for one competition. Choose regular instead if you want to save your entry for another prediction before the deadline.',
  },
  used: {
    title: 'Already entered · second bet',
    selected: [],
    available: [],
    used: ['gw10', 'weekend'],
    description:
      'Both competition slots are used. The second bet is regular automatically: no competition badge and no selector offering an impossible choice.',
  },
  mixed: {
    title: 'One used, one available',
    selected: [],
    available: ['weekend'],
    used: ['gw10'],
    description:
      'Your GW10 entry is locked, but this match is still eligible for Weekend Challengers. The selector only offers the remaining competition.',
  },
  pending: {
    title: 'Earlier entry confirming',
    selected: [],
    available: [],
    pending: ['gw10'],
    description:
      'An earlier signed prediction is still being checked. Reserve that competition slot until its outcome is known. Further regular bets remain possible, subject to payment availability.',
  },
  funding: {
    title: 'Shared funding confirming',
    selected: ['gw10'],
    available: ['gw10', 'weekend'],
    description:
      'A separate funding wait state keeps all picks and choices intact. Check again refreshes availability. It never signs or sends another payment automatically.',
  },
};
let current = 'multiple';
let selected = new Set(scenarios[current].selected);
let draft = new Set();
let toastTimer;
const cells = '<span class="cells" aria-hidden="true"><i></i><i></i><i></i></span>';
const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
const names = (ids) => competitions.filter((c) => ids.has(c.id)).map((c) => c.name);
function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, 4500);
}
function render() {
  const state = scenarios[current];
  $('#state-label').textContent = state.title;
  $('#state-description').textContent = state.description;
  $('#state-number').textContent = String(Object.keys(scenarios).indexOf(current) + 1).padStart(
    2,
    '0',
  );
  document
    .querySelectorAll('[data-state]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.state === current)),
    );
  const chosen = names(selected);
  if (state.available.length) {
    $('#entry-area').innerHTML =
      `<button class="entry-button ${chosen.length ? '' : 'is-regular'}" id="choose-entry" aria-haspopup="dialog">${icon('trophy')}<span><b>${chosen.length > 1 ? `${chosen.length} competitions selected` : chosen[0] || 'Regular prediction'}</b><small>${chosen.length ? 'Use this pick for points · Change' : 'Keep it regular, or choose competitions'}</small></span>${icon('chevron')}</button>`;
    $('#choose-entry').addEventListener('click', openSelector);
  } else {
    $('#entry-area').innerHTML =
      '<div class="regular-row"><span class="regular-dot"></span><span>Regular prediction</span></div>' +
      (state.pending?.length
        ? `<p class="pending-note">${cells}Your earlier competition entry is confirming.</p><p class="hint">This new prediction will not replace it.</p>`
        : '<p class="hint">Your competition pick for this match is already recorded.</p>');
  }
  $('#funding-state').hidden = current !== 'funding';
  $('#review').disabled = current === 'funding';
  $('#review').innerHTML =
    current === 'funding'
      ? `${cells} Waiting for funding availability`
      : `Review predictions ${icon('chevron')}`;
  $('#selection-summary').textContent = chosen.length
    ? `1 competition pick · 1 regular prediction · Both settle normally`
    : '2 regular predictions · Your competition entries stay unchanged';
}
function renderChoices() {
  const state = scenarios[current];
  $('#choices').innerHTML =
    `<label class="choice"><input id="regular-choice" type="checkbox" ${draft.size ? '' : 'checked'}/><span><b>Regular prediction</b><small>Does not use a competition entry</small></span></label><p class="choice-label">Use for competition points</p>` +
    competitions
      .filter((c) => state.available.includes(c.id))
      .map(
        (c) =>
          `<label class="choice"><input type="checkbox" data-competition="${c.id}" ${draft.has(c.id) ? 'checked' : ''}/><span><b>${c.name}</b><small>${c.detail}</small></span></label>`,
      )
      .join('') +
    competitions
      .filter((c) => state.used?.includes(c.id))
      .map(
        (c) =>
          `<div class="choice unavailable"><span><b>${c.name}</b><small>Already entered · Your first pick stays locked</small></span>${icon('lock')}</div>`,
      )
      .join('');
  $('#regular-choice').addEventListener('change', () => {
    draft.clear();
    updateChecks();
  });
  document.querySelectorAll('[data-competition]').forEach((input) =>
    input.addEventListener('change', () => {
      if (input.checked) draft.add(input.dataset.competition);
      else draft.delete(input.dataset.competition);
      updateChecks();
    }),
  );
}
function updateChecks() {
  $('#regular-choice').checked = draft.size === 0;
  document.querySelectorAll('[data-competition]').forEach((input) => {
    input.checked = draft.has(input.dataset.competition);
  });
}
function openSelector() {
  draft = new Set(selected);
  renderChoices();
  $('#entry-dialog').showModal();
}
$('#apply').addEventListener('click', () => {
  selected = new Set(draft);
  $('#entry-dialog').close();
  render();
  $('#choose-entry')?.focus();
});
document
  .querySelectorAll('[data-close]')
  .forEach((button) =>
    button.addEventListener('click', () => document.getElementById(button.dataset.close).close()),
  );
document.querySelectorAll('[data-state]').forEach((button) =>
  button.addEventListener('click', () => {
    current = button.dataset.state;
    selected = new Set(scenarios[current].selected);
    $('.state-menu').open = false;
    $('#slip').hidden = false;
    $('#reopen').hidden = true;
    render();
    $('summary').focus();
  }),
);
$('.state-menu').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('.state-menu').open = false;
    $('summary').focus();
  }
});
$('#review').addEventListener('click', () => {
  const chosen = names(selected);
  $('#review-content').innerHTML =
    `<div class="review-line"><b>Leeds vs Tottenham · Draw</b><p>${chosen.length ? chosen.join('<br/>') : 'Regular prediction · No competition entry'}</p></div><div class="review-line"><b>Nottingham Forest vs Man City · Away</b><p>Regular prediction · Existing competition pick unchanged</p></div>`;
  $('#review-dialog').showModal();
});
$('#check-funding').addEventListener('click', () =>
  notify('Preview: still waiting. Your picks and competition choices are saved.'),
);
$('#close-slip').addEventListener('click', () => {
  $('#slip').hidden = true;
  $('#reopen').hidden = false;
  $('#reopen').focus();
});
$('#reopen').addEventListener('click', () => {
  $('#slip').hidden = false;
  $('#reopen').hidden = true;
  $('#close-slip').focus();
});
document.addEventListener('visibilitychange', () => {
  document.querySelectorAll('.cells i').forEach((cell) => {
    cell.style.animationPlayState = document.hidden ? 'paused' : 'running';
  });
});
render();
