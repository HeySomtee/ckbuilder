'use strict';

const icon = (name, className = '') =>
  `<svg${className ? ` class="${className}"` : ''} aria-hidden="true"><use href="#${name}"/></svg>`;
const main = document.getElementById('main');
const moreDialog = document.getElementById('more-dialog');
const scenarioButton = document.getElementById('scenario-button');
const scenarioMenu = document.getElementById('scenario-menu');
const scenarioOptions = [...scenarioMenu.querySelectorAll('[role="option"]')];
const options = {
  predictions: 'Predictions · Open',
  five: 'Five · Open',
  finished: 'Competition finished',
  'no-artwork': 'Without artwork',
  admin: 'Admin · Add artwork',
};
const metadata = {
  predictions: {
    name: 'The Weekend Call',
    label: 'PREDICTION COMPETITION',
    description: 'Good instincts. Bold calls. One weekend to make them count.',
    icon: 'markets',
    deadline: 'Fri 20 Nov, 19:30',
    count: '8 matches',
    entrants: '24 entered',
  },
  five: {
    name: 'Five on Form',
    label: 'STREAK FIVE COMPETITION',
    description: 'Five players. One captain. Make your football knowledge count.',
    icon: 'shirt',
    deadline: 'Sat 21 Nov, 12:00',
    count: 'Gameweek 11',
    entrants: '38 entered',
  },
};
const artwork = {
  predictions: { icon: '/assets/predictions-icon.png', banner: '/assets/predictions-banner.png' },
  five: { icon: '/assets/five-icon.png', banner: '/assets/five-banner.png' },
};
const uploaded = new Set();
let scenario = 'predictions';
let adminKind = 'predictions';
let tab = 'matches';
let toastTimer;
let typeahead = '';
let typeaheadTimer;
let uploadGeneration = 0;
const draftChoices = new Map();

function toast(message) {
  clearTimeout(toastTimer);
  document.getElementById('toast-text').textContent = message;
  document.getElementById('toast').hidden = false;
  toastTimer = setTimeout(() => {
    document.getElementById('toast').hidden = true;
  }, 6500);
}

function dismissMenu(restore = false) {
  scenarioMenu.hidden = true;
  scenarioButton.setAttribute('aria-expanded', 'false');
  if (restore) scenarioButton.focus();
}

function showMenu(focusIndex = -1) {
  scenarioMenu.hidden = false;
  scenarioButton.setAttribute('aria-expanded', 'true');
  const index =
    focusIndex < 0
      ? scenarioOptions.findIndex((option) => option.dataset.scenario === scenario)
      : focusIndex;
  scenarioOptions[Math.max(0, index)].focus();
}

function setScenario(value, updateUrl = true) {
  if (!Object.hasOwn(options, value)) return;
  scenario = value;
  uploadGeneration += 1;
  tab = value === 'finished' ? 'standings' : value === 'five' ? 'squad' : 'matches';
  document.getElementById('scenario-label').textContent = options[value];
  scenarioOptions.forEach((option) =>
    option.setAttribute('aria-selected', String(option.dataset.scenario === value)),
  );
  document.querySelectorAll('.campaign-nav-link').forEach((button) => {
    const active = button.dataset.goScenario === (value === 'five' ? 'five' : 'predictions');
    button.classList.toggle('is-current', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  dismissMenu();
  if (moreDialog.open) moreDialog.close();
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', value);
    history.replaceState(null, '', url);
  }
  render();
}

function art(kind, type, className, fallback = false) {
  const source = fallback ? null : artwork[kind][type];
  return source ? `<img class="${className}" src="${source}" alt="" />` : '';
}

function hero(kind) {
  const info = metadata[kind];
  const finished = scenario === 'finished';
  const noArtwork = scenario === 'no-artwork' || !artwork[kind].banner;
  return `<div class="page-heading"><button class="back-link" data-preview-route="All competitions">${icon('arrow')} All competitions</button><span class="eyebrow">THE COMMUNITY SERIES</span></div>
    <section class="hero ${noArtwork ? 'is-fallback' : ''}" aria-labelledby="competition-title">
      ${art(kind, 'banner', 'hero-banner', noArtwork)}
      <div class="hero-copy"><div class="hero-topline"><p class="eyebrow">${info.label}</p><span class="status-pill${finished ? ' finished' : ''}">${finished ? 'Finished' : 'Open for entries'}</span></div>
      <div class="hero-title-line">${art(kind, 'icon', 'hero-icon', scenario === 'no-artwork') || `<span class="hero-icon fallback-icon">${icon(info.icon)}</span>`}<h1 id="competition-title">${info.name}</h1></div>
      <p class="hero-description">${finished ? 'The final whistle. The calls are in. Meet your weekend winners.' : info.description}</p>
      <div class="hero-meta"><span>${icon(finished ? 'check' : 'clock')}${finished ? 'Results final' : info.deadline}</span><span>${icon(kind === 'five' ? 'shirt' : 'match')}${info.count}</span><span>${info.entrants}</span></div></div>
    </section>
    <div class="competition-bar"><div class="prize-facts"><div class="prize-total">${icon('trophy')}<strong>$60<small>in CKB prizes</small></strong></div><span class="muted">3 winning places</span><div class="places"><span>1st <b>$30</b></span><span>2nd <b>$20</b></span><span>3rd <b>$10</b></span></div></div>
    ${finished ? '<span class="status-pill finished">Awards allocated</span>' : `<button class="primary-button" data-preview-join>${kind === 'five' ? 'Join & pick your five' : 'Join competition'}${icon('arrow')}</button>`}</div>`;
}

const fixtures = [
  {
    home: 'Arsenal',
    away: 'Chelsea',
    homeBadge: 'ARS',
    awayBadge: 'CHE',
    homeColor: 'red',
    awayColor: 'blue',
    time: 'Sat · 15:00',
    filled: '17',
    homeForm: 'WWDLW',
    awayForm: 'WLWDW',
  },
  {
    home: 'Spurs',
    away: 'Newcastle',
    homeBadge: 'TOT',
    awayBadge: 'NEW',
    homeColor: 'white',
    awayColor: 'black',
    time: 'Sat · 17:30',
    filled: '10',
    homeForm: 'WDWLW',
    awayForm: 'WWDLL',
  },
  {
    home: 'Brighton',
    away: 'Aston Villa',
    homeBadge: 'BHA',
    awayBadge: 'AVL',
    homeColor: 'blue',
    awayColor: 'red',
    time: 'Sun · 14:00',
    filled: '21',
    homeForm: 'WDWLD',
    awayForm: 'LWWDW',
  },
  {
    home: 'Fulham',
    away: 'Everton',
    homeBadge: 'FUL',
    awayBadge: 'EVE',
    homeColor: 'white',
    awayColor: 'blue',
    time: 'Sun · 16:30',
    filled: '7',
    homeForm: 'LWDWW',
    awayForm: 'DWLWD',
  },
];

function form(value) {
  return [...value]
    .map(
      (letter) =>
        `<span class="${letter === 'L' ? 'loss' : letter === 'D' ? 'draw' : ''}">${letter}</span>`,
    )
    .join('');
}

function fixtureCard(fixture, index) {
  return `<article class="fixture-card"><div class="fixture-meta"><span>Premier League</span><span>${fixture.time}</span></div>
    <div class="team-row"><span class="club-badge ${fixture.homeColor}" aria-hidden="true">${fixture.homeBadge}</span><span class="team-name">${fixture.home}</span><span class="fixture-team-form" aria-label="Recent form ${fixture.homeForm}">${form(fixture.homeForm)}</span></div>
    <div class="team-row"><span class="club-badge ${fixture.awayColor}" aria-hidden="true">${fixture.awayBadge}</span><span class="team-name">${fixture.away}</span><span class="fixture-team-form" aria-label="Recent form ${fixture.awayForm}">${form(fixture.awayForm)}</span></div>
    <div class="outcome-row">${['Home', 'Draw', 'Away'].map((outcome) => `<button data-fixture="${index}" data-outcome="${outcome}" aria-label="${fixture.home} versus ${fixture.away}, ${outcome}" aria-pressed="${draftChoices.get(index) === outcome}" class="${draftChoices.get(index) === outcome ? 'picked' : ''}">${outcome}</button>`).join('')}</div>
    <div class="fill-info"><span>${fixture.filled} of 32 positions filled</span><span>${32 - Number(fixture.filled)} left</span></div><div class="fill-meter" aria-hidden="true"><span></span></div></article>`;
}

function standingsAside() {
  return `<aside class="competition-aside"><section class="aside-card"><h3>Who’s in the running</h3>
    ${['ckt1…9rx2', 'ckt1…2m8f', 'ckt1…7d4a', 'ckt1…6p2x'].map((name, index) => `<div class="entrant-row${index === 3 ? ' you' : ''}"><span class="rank">${index + 1}</span><strong>${name}${index === 3 ? ' <small>You</small>' : ''}</strong><span class="pts">0 pts</span></div>`).join('')}
    <button class="browse-link" data-tab="standings">See the leaderboard${icon('arrow')}</button></section>
    <div class="how-note"><p class="eyebrow">A LEVEL PLAYING FIELD</p><p><strong>3 points for a correct call.</strong><br>Stake size never changes your score. Your first qualifying prediction on each listed match counts.</p></div></aside>`;
}

function predictionMatches() {
  return `<div class="content-grid"><section><div class="section-heading"><div><h2>Your weekend starts here</h2><p>Choose a result. Play through your usual prediction slip.</p></div><span class="muted">4 of 8 matches</span></div><div class="fixtures-grid">${fixtures.map(fixtureCard).join('')}</div></section>${standingsAside()}</div>`;
}

function fiveSquad() {
  return `<div class="section-heading"><div><h2>Build a five worth watching</h2><p>40 credits. Five positions. One double-points captain.</p></div></div><div class="five-grid"><div class="pitch-preview" aria-label="Illustrative five-player squad"><div class="pitch-line"></div><div class="pitch-slots">
    ${[
      ['Haaland', 'FWD · 12.0 CR'],
      ['Saka', 'MID · 8.5 CR'],
      ['Palmer', 'MID · 8.0 CR'],
      ['Gabriel', 'DEF · 6.0 CR'],
      ['Henderson', 'GK · 4.5 CR'],
    ]
      .map(
        ([name, position], index) =>
          `<div class="pitch-player">${icon('shirt')}${index === 0 ? '<span class="captain" aria-label="Captain">C</span>' : ''}<strong>${name}</strong><small>${position}</small></div>`,
      )
      .join('')}
    </div></div><div class="five-checklist"><h3>Your knowledge. Your five.</h3><p>Join the competition, save your squad and follow your points as the matches unfold.</p><ul><li>${icon('check')}Free to enter</li><li>${icon('check')}Uses your saved Streak Five team</li><li>${icon('check')}Live points on your squad pitch</li></ul><button class="primary-button" data-preview-join>Join & pick your five${icon('arrow')}</button></div></div>`;
}

const names = ['ckt1…9rx2', 'ckt1…2m8f', 'ckt1…7d4a', 'ckt1…6p2x', 'ckt1…8j5n', 'ckt1…3p9b'];
const fiveNames = [
  'The Touchline',
  'Saka Potatoes',
  'On Form FC',
  'Your Five',
  'Midfield Theory',
  'Bench Boost',
];
function standings(kind) {
  const finished = scenario === 'finished';
  const entries = kind === 'five' ? fiveNames : names;
  const points = finished ? [21, 18, 18, 15, 12, 9] : [0, 0, 0, 0, 0, 0];
  return `<div class="finished-summary"><div><h2>${finished ? 'The weekend belongs to them' : 'The starting line'}</h2><p>${finished ? 'Final standings · 24 players · All 8 matches checked' : 'Everyone who joins takes a place. Points start when the games do.'}</p></div>${finished ? `<button class="quiet-button" data-preview-route="Your competition entry">Your result${icon('arrow')}</button>` : '<span class="status-pill">Not started</span>'}</div>
    ${
      finished
        ? `<div class="podium">${entries
            .slice(0, 3)
            .map(
              (name, index) =>
                `<article class="podium-card"><span class="podium-place">${index + 1}</span><div class="podium-person"><strong>${name}</strong><small>${points[index]} points</small></div><div class="podium-award"><strong>$${[30, 20, 10][index]}</strong><small>in CKB</small></div></article>`,
            )
            .join('')}</div>`
        : ''
    }
    <table class="standings-table"><thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>${finished ? 'Award' : 'Entry'}</th></tr></thead><tbody>${entries.map((name, index) => `<tr class="${index === 3 ? 'self-row' : ''}"><td>${index + 1}</td><td>${name}${index === 3 ? ' <small>You</small>' : ''}</td><td>${points[index]}</td><td>${finished ? (index < 3 ? '$' + [30, 20, 10][index] + ' in CKB' : 'No award') : 'Registered'}</td></tr>`).join('')}</tbody></table>
    <p class="final-explanation">${finished ? 'Tied scores are separated by the earlier final qualifying prediction. Awards are allocated; payment confirmation appears separately when the organizer sends and verifies the CKB transfer.' : 'Tied scores use the earlier final ' + (kind === 'five' ? 'squad save' : 'qualifying prediction') + '. Registration creates your place even before you play.'}</p>`;
}

function rules(kind) {
  return `<section class="rules-panel"><h2>A few things before you play</h2><p>${kind === 'five' ? 'Join before the competition deadline and save a valid five-player Streak Five squad. Choose a captain for double points. Your gameweek points determine your place.' : 'Join before registration closes. Your first qualifying paid prediction on each listed fixture counts, including eligible predictions made before you joined. A correct result earns 3 points; a loss or missed match earns 0.'}</p><p>${kind === 'five' ? 'Tied scores favour the earlier final saved squad.' : 'Stake size does not affect competition points. Tied scores favour the player whose last qualifying prediction was earlier.'} The top three receive $30, $20 and $10 worth of CKB, at the published conversion rate.</p><p>Ordinary predictions still settle normally. Competition prizes are a separate award. This page is an isolated design preview; it does not create entries, accept payments or promise a live reward.</p></section>`;
}

function competition(kind) {
  const tabs =
    kind === 'five'
      ? [
          ['squad', 'Your five'],
          ['standings', 'Standings'],
          ['rules', 'How to play'],
        ]
      : [
          ['matches', 'Matches'],
          ['standings', 'Standings'],
          ['rules', 'How to play'],
        ];
  return `${hero(kind)}<div class="main-tabs" role="tablist" aria-label="Competition content">${tabs.map(([id, title]) => `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? 'selected' : ''}" data-tab="${id}" id="tab-${id}" aria-controls="competition-content" tabindex="${tab === id ? '0' : '-1'}">${title}${id === 'matches' ? '<span>8</span>' : ''}</button>`).join('')}</div><div class="tab-content" id="competition-content" role="tabpanel" aria-labelledby="tab-${tab}">${tab === 'rules' ? rules(kind) : tab === 'standings' ? standings(kind) : kind === 'five' ? fiveSquad() : predictionMatches()}</div>`;
}

function uploadControl(type, title) {
  const inputId = `${type}-upload`;
  return `<label class="upload-label" for="${inputId}">${icon('upload')}${artwork[adminKind][type] ? 'Change ' : 'Add '}${title.toLowerCase()}<input id="${inputId}" type="file" accept="image/png,image/jpeg,image/webp" data-upload="${type}" aria-describedby="${type}-guidance media-error" /></label><button class="text-button" data-remove="${type}">${artwork[adminKind][type] ? 'Remove' : 'Use sample'}</button>`;
}

function admin() {
  const info = metadata[adminKind];
  return `<div class="page-heading"><button class="back-link" data-go-scenario="${adminKind}">${icon('arrow')} Back to competition</button><span class="eyebrow">COMPETITION STUDIO</span></div>
    <header class="admin-heading"><p class="eyebrow">MAKE IT YOURS</p><h1>A little identity. A lot of character.</h1><p>Give your competition its own icon and cover. Both are optional.</p></header>
    <div class="admin-kind" aria-label="Competition to customize"><button data-admin-kind="predictions" aria-pressed="${adminKind === 'predictions'}">The Weekend Call</button><button data-admin-kind="five" aria-pressed="${adminKind === 'five'}">Five on Form</button></div>
    <div class="admin-layout"><section class="media-settings" aria-label="Competition artwork">
      <h2 class="admin-field-header">Competition icon<span class="optional">Optional</span></h2><p class="field-help">Your small signature in navigation, lists and the competition header.</p>
      <div class="icon-settings"><div class="icon-settings-preview">${art(adminKind, 'icon', '') || icon(info.icon)}</div><div><div class="upload-actions">${uploadControl('icon', 'Icon')}</div><p class="upload-guidance" id="icon-guidance">Square · PNG, JPG or WebP · Up to 3 MB</p></div></div>
      <h2 class="admin-field-header">Competition banner<span class="optional">Optional</span></h2><p class="field-help">A wide cover for your competition. Keep important artwork toward the right.</p>
      <div class="banner-settings-preview">${art(adminKind, 'banner', '') || icon('image')}</div><div class="upload-actions">${uploadControl('banner', 'Banner')}</div><p class="upload-guidance" id="banner-guidance">3:1 recommended · PNG, JPG or WebP · Up to 5 MB</p>
      <p id="media-error" class="media-error" role="status"></p>
      <div class="admin-footer"><p>Changes stay in this preview.<br>Nothing is uploaded or saved.</p><button class="primary-button" data-open-custom>See competition${icon('arrow')}</button></div>
    </section><aside class="admin-preview"><p class="eyebrow">LIVE PREVIEW</p><div class="mini-banner">${art(adminKind, 'banner', '') || icon('image')}</div><div class="mini-icon">${art(adminKind, 'icon', '') || icon(info.icon)}</div><h2 class="mini-title">${info.name}</h2><p class="mini-copy">${info.description}</p><div class="mini-bottom"><span><strong>$60</strong> in CKB prizes</span><span class="status-pill">Open</span></div><div class="admin-secondary"><p>No image? No problem. Streak keeps a clean colour cover and a game icon, so every competition still feels complete.</p><button class="text-button" data-reset-artwork>Restore sample artwork</button></div></aside></div>`;
}

function bindImageFallbacks() {
  document.querySelectorAll('img').forEach((image) => {
    if (image.dataset.errorBound) return;
    image.dataset.errorBound = 'true';
    image.addEventListener(
      'error',
      () => {
        image.classList.add('image-unavailable');
        if (image.classList.contains('hero-banner'))
          image.closest('.hero')?.classList.add('is-fallback');
      },
      { once: true },
    );
  });
}

function updateNavigation() {
  const fallback = scenario === 'no-artwork';
  document.querySelectorAll('.campaign-nav-link,.sheet-campaign').forEach((button) => {
    const kind = button.dataset.goScenario;
    const container = button.querySelector('.nav-art,.sheet-art');
    const source = fallback ? null : artwork[kind].icon;
    container.innerHTML = source ? `<img src="${source}" alt="" />` : icon(metadata[kind].icon);
    const finished = scenario === 'finished' && kind === 'predictions';
    const status = button.querySelector('small');
    const label = kind === 'predictions' ? 'Predictions' : 'Fantasy';
    status.textContent = `${label} · ${finished ? 'Finished' : 'Open'}`;
    if (button.classList.contains('campaign-nav-link')) {
      const dot = document.createElement('i');
      dot.className = `status-dot${finished ? ' is-finished' : ''}`;
      status.prepend(dot);
    }
  });
  document.querySelector('.sheet-section-heading .muted').textContent =
    scenario === 'finished' ? '1 open · 1 finished' : '2 open';
}

function render() {
  main.innerHTML =
    scenario === 'admin' ? admin() : competition(scenario === 'five' ? 'five' : 'predictions');
  updateNavigation();
  bindImageFallbacks();
}

async function processUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  const type = input.dataset.upload;
  const kind = adminKind;
  const error = document.getElementById('media-error');
  const limit = type === 'icon' ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    error.textContent = 'Choose a PNG, JPG or WebP image.';
    input.value = '';
    return;
  }
  if (file.size > limit) {
    error.textContent = `That image is too large. Choose one under ${type === 'icon' ? 3 : 5} MB.`;
    input.value = '';
    return;
  }
  const generation = ++uploadGeneration;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (
      image.naturalWidth < 32 ||
      image.naturalHeight < 32 ||
      image.naturalWidth > 8192 ||
      image.naturalHeight > 8192
    )
      throw new Error('dimensions');
    if (generation !== uploadGeneration || scenario !== 'admin' || kind !== adminKind) {
      URL.revokeObjectURL(url);
      return;
    }
    const prior = artwork[kind][type];
    if (uploaded.has(prior)) {
      URL.revokeObjectURL(prior);
      uploaded.delete(prior);
    }
    uploaded.add(url);
    artwork[kind][type] = url;
    render();
    document.getElementById(`${type}-upload`)?.focus();
    toast(`${type === 'icon' ? 'Icon' : 'Banner'} updated in this preview only.`);
  } catch {
    URL.revokeObjectURL(url);
    if (generation === uploadGeneration && scenario === 'admin') {
      document.getElementById('media-error').textContent =
        'This image could not be used. Choose a readable image between 32 and 8,192 pixels on each side.';
      input.value = '';
    }
  }
}

function resetAsset(type, reset = false) {
  uploadGeneration += 1;
  const previous = artwork[adminKind][type];
  if (uploaded.has(previous)) {
    URL.revokeObjectURL(previous);
    uploaded.delete(previous);
  }
  artwork[adminKind][type] = reset || !previous ? `/assets/${adminKind}-${type}.png` : null;
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.scenario) {
    setScenario(target.dataset.scenario);
    scenarioButton.focus();
  } else if (target.dataset.goScenario) setScenario(target.dataset.goScenario);
  else if (target.dataset.previewRoute) {
    if (moreDialog.open) moreDialog.close();
    toast(
      `${target.dataset.previewRoute} selected. This preview focuses on navigation and competition artwork.`,
    );
  } else if (target.dataset.tab) {
    tab = target.dataset.tab;
    render();
    document.getElementById(`tab-${tab}`)?.focus();
  } else if (target.hasAttribute('data-preview-join'))
    toast('Preview only. Joining will use the existing competition entry flow.');
  else if (target.dataset.outcome) {
    const fixture = Number(target.dataset.fixture);
    draftChoices.set(fixture, target.dataset.outcome);
    target
      .closest('.outcome-row')
      .querySelectorAll('button')
      .forEach((button) => {
        const selected = button === target;
        button.classList.toggle('picked', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    toast('Preview pick selected. The app will use your existing prediction slip.');
  } else if (target.dataset.adminKind) {
    adminKind = target.dataset.adminKind;
    uploadGeneration += 1;
    render();
    document.querySelector(`[data-admin-kind="${adminKind}"]`)?.focus();
  } else if (target.dataset.remove) {
    const type = target.dataset.remove;
    resetAsset(type);
    render();
    document.querySelector(`[data-remove="${type}"]`)?.focus();
  } else if (target.hasAttribute('data-reset-artwork')) {
    resetAsset('icon', true);
    resetAsset('banner', true);
    render();
    document.querySelector('[data-reset-artwork]')?.focus();
  } else if (target.hasAttribute('data-open-custom')) setScenario(adminKind);
});

document.addEventListener('change', (event) => {
  if (event.target.matches('input[data-upload]')) void processUpload(event.target);
});
scenarioButton.addEventListener('click', () => (scenarioMenu.hidden ? showMenu() : dismissMenu()));
scenarioButton.addEventListener('keydown', (event) => {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    showMenu(event.key === 'ArrowUp' ? scenarioOptions.length - 1 : -1);
  }
});
scenarioMenu.addEventListener('keydown', (event) => {
  const index = scenarioOptions.indexOf(document.activeElement);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? scenarioOptions.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + scenarioOptions.length) %
            scenarioOptions.length;
    scenarioOptions[next].focus();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    dismissMenu(true);
  } else if (event.key === 'Tab') dismissMenu(true);
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    clearTimeout(typeaheadTimer);
    typeahead += event.key.toLowerCase();
    const next = scenarioOptions.find((option) =>
      option.textContent.toLowerCase().startsWith(typeahead),
    );
    next?.focus();
    typeaheadTimer = setTimeout(() => {
      typeahead = '';
    }, 600);
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.scenario-picker')) dismissMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !scenarioMenu.hidden) dismissMenu(true);
  if (
    event.target.matches('[role="tab"]') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  ) {
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(event.target);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tab = tabs[next].dataset.tab;
    render();
    document.getElementById(`tab-${tab}`).focus();
  }
});
document.getElementById('more-button').addEventListener('click', () => {
  dismissMenu();
  moreDialog.showModal();
  document.getElementById('close-more').focus();
});
document.getElementById('close-more').addEventListener('click', () => moreDialog.close());
moreDialog.addEventListener('click', (event) => {
  if (event.target !== moreDialog) return;
  const bounds = moreDialog.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    moreDialog.close();
});
moreDialog.addEventListener('close', () => document.getElementById('more-button').focus());
document.getElementById('mobile-compete').addEventListener('click', () => {
  if (scenario === 'admin') setScenario(adminKind);
  else {
    main.focus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
});
document.getElementById('close-toast').addEventListener('click', () => {
  document.getElementById('toast').hidden = true;
  clearTimeout(toastTimer);
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  uploaded.forEach((url) => URL.revokeObjectURL(url));
  uploaded.clear();
});
const initialScenario = new URL(window.location.href).searchParams.get('scenario');
setScenario(Object.hasOwn(options, initialScenario) ? initialScenario : 'predictions', false);
