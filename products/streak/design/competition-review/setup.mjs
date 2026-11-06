const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const symbols = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12 4 4L19 6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  trophy: 'M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8',
  calendar: 'M4 5h16v16H4Zm3-3v6m10-6v6M4 11h16',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-4 10 3 3 5-6',
  edit: 'm14 4 6 6M4 20l1-6L16 3l5 5L10 19Z',
  lock: 'M6 10h12v11H6Zm2 0V6a4 4 0 0 1 8 0v4',
};
const glyph = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[name] ?? symbols.check}"/></svg>`;
const cents = (value) => {
  const match = String(value ?? '').match(/^(\d+)(?:\.(\d{0,2}))?$/);
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : 0n;
};
const dollars = (amount) =>
  `$${amount / 100n}${amount % 100n ? `.${String(amount % 100n).padStart(2, '0')}` : ''}`;
const ordinal = (index) => {
  const place = index + 1;
  const suffix =
    place % 100 >= 11 && place % 100 <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th');
  return `${place}${suffix}`;
};
const abbreviate = (name) =>
  String(name)
    .replace(/[^a-z ]/gi, '')
    .slice(0, 3)
    .toUpperCase();
const action = (name, text, extra = '', tone = '') =>
  `<button type="button" class="setup-button ${tone}" data-setup-action="${name}" ${extra}>${text}</button>`;

function basics({ draft, five }) {
  return `<section class="setup-section" aria-labelledby="setup-section-title">
    <div class="setup-section-heading"><span class="setup-step-label">01 / THE INVITATION</span><h2 id="setup-section-title">Give them something to play for.</h2><p>A good name and a short invitation. Keep the rest about the game.</p></div>
    <div class="setup-invitation-card">
      <div class="setup-card-kicker">${glyph(five ? 'calendar' : 'trophy')} ${five ? 'STREAK FIVE' : 'PREDICTION COMPETITION'}</div>
      <label class="setup-name-label" for="setup-name">Competition name</label>
      <input id="setup-name" class="setup-name-input" data-setup-field="name" value="${escape(draft.name)}" placeholder="Give your competition a name" maxlength="80" autocomplete="off" />
      <label class="setup-name-label" for="setup-description">Your invitation <span>Optional</span></label>
      <textarea id="setup-description" class="setup-description-input" data-setup-field="description" rows="3" maxlength="400" placeholder="A weekend of bold calls. A place on the podium. Your move.">${escape(draft.description)}</textarea>
      <div class="setup-invitation-footer"><span>${glyph('shield')} Public leaderboard</span><span>CKB prizes</span><span>Free registration</span></div>
    </div>
    <div class="setup-deadline-box"><div><h3>Registration closes</h3><p>Let players know when they need to join.</p></div><label class="setup-date-field"><span class="setup-sr-only">Registration deadline, Lagos time</span><input type="datetime-local" data-setup-field="registrationDeadline" value="${escape(draft.registrationDeadline)}" /><small>Lagos time · WAT</small></label></div>
    <div class="setup-step-footer"><span>Registered players appear in the standings immediately.</span>${action('step', `${five ? 'Choose gameweek' : 'Choose fixtures'} ${glyph('arrow')}`, 'data-step="fixtures"', 'setup-button--primary')}</div>
  </section>`;
}

function fixtureChooser({ draft, ui, catalog, five }) {
  if (five) {
    return `<section class="setup-section" aria-labelledby="setup-section-title"><div class="setup-section-heading"><span class="setup-step-label">02 / THE GAMEWEEK</span><h2 id="setup-section-title">One gameweek. Their best five.</h2><p>Players build and save their team through the existing Streak Five game.</p></div>
      <div class="setup-gameweek-card"><div class="setup-gameweek-icon">${glyph('calendar')}</div><div><span class="setup-step-label">PREMIER LEAGUE</span><label for="setup-gameweek">Choose a gameweek</label><select id="setup-gameweek" data-streak-select data-setup-field="gameweekId"><option value="10" ${String(draft.gameweekId) === '10' ? 'selected' : ''}>Gameweek 10 (rehearsal)</option><option value="11" ${String(draft.gameweekId) === '11' ? 'selected' : ''}>Gameweek 11</option><option value="12" ${String(draft.gameweekId) === '12' ? 'selected' : ''}>Gameweek 12</option><option value="13" ${String(draft.gameweekId) === '13' ? 'selected' : ''}>Gameweek 13</option></select></div><span class="setup-badge">Sample schedule</span></div>
      <div class="setup-flow-strip"><span><b>1</b> Join competition</span>${glyph('arrow')}<span><b>2</b> Save a Five squad</span>${glyph('arrow')}<span><b>3</b> Follow your points</span></div>
      <div class="setup-rule-note">${glyph('lock')}<div><strong>The gameweek keeps its official deadline.</strong><p>Squads lock together. Earlier final squad saves break a points tie.</p></div></div>
      <div class="setup-step-footer"><span>One saved squad, the same player points.</span>${action('step', `Set the prizes ${glyph('arrow')}`, 'data-step="prizes"', 'setup-button--primary')}</div></section>`;
  }
  const chosen = new Set(draft.fixtureIds);
  const search = ui.search.trim().toLowerCase();
  const matches = catalog.filter(
    (match) =>
      (!search || `${match.home} ${match.away} ${match.league}`.toLowerCase().includes(search)) &&
      (ui.league === 'all' || match.league === ui.league) &&
      (!ui.selectedOnly || chosen.has(match.id)),
  );
  const leagues = [...new Set(catalog.map((match) => match.league))];
  return `<section class="setup-section" aria-labelledby="setup-section-title"><div class="setup-section-heading"><span class="setup-step-label">02 / THE FIXTURE LIST</span><h2 id="setup-section-title">Pick the matches. Set the challenge.</h2><p>Choose any number of eligible markets. Only these matches count towards competition points.</p></div>
    <div class="setup-match-toolbar"><label class="setup-search">${glyph('search')}<span class="setup-sr-only">Search fixtures</span><input data-setup-field="search" value="${escape(ui.search)}" placeholder="Search a club or league" /></label>${action('select-visible', `${glyph('plus')} Select visible`)}${action('selected-only', `${glyph('check')} Selected <b>${chosen.size}</b>`, `aria-pressed="${ui.selectedOnly}"`, ui.selectedOnly ? 'setup-button--selected' : '')}</div>
    <div class="setup-league-strip" aria-label="Filter by league">${['all', ...leagues].map((league) => `<label class="setup-league-chip ${ui.league === league ? 'is-active' : ''}"><input type="radio" name="setup-league" data-setup-field="league" value="${escape(league)}" ${ui.league === league ? 'checked' : ''} /><span>${escape(league === 'all' ? 'All leagues' : league)}</span></label>`).join('')}</div>
    <div class="setup-fixture-grid">${
      matches
        .map((match, index) => {
          const selected = chosen.has(match.id);
          const eligible = match.eligible !== false;
          return `<button type="button" class="setup-fixture-card ${selected ? 'is-selected' : ''}" data-setup-action="toggle-fixture" data-id="${escape(match.id)}" aria-pressed="${selected}" aria-label="${selected ? 'Remove' : 'Select'} ${escape(match.home)} versus ${escape(match.away)}" ${eligible ? '' : 'disabled'}><span class="setup-fixture-top"><span>${escape(match.league)}</span><span class="setup-fixture-check">${glyph(selected ? 'check' : 'plus')}</span></span><span class="setup-fixture-teams"><span><i class="setup-crest setup-crest--${index % 4}">${escape(abbreviate(match.home))}</i><strong>${escape(match.home)}</strong></span><span><i class="setup-crest setup-crest--${(index + 1) % 4}">${escape(abbreviate(match.away))}</i><strong>${escape(match.away)}</strong></span></span><span class="setup-fixture-footer"><span>${escape(match.day)} · ${escape(match.time)}</span><span>${eligible ? `${Number(match.count) || 0}/32 filled` : 'Not eligible'}</span></span></button>`;
        })
        .join('') ||
      `<div class="setup-empty">${glyph('search')}<h3>${ui.selectedOnly ? 'No selected matches here yet.' : 'No matches found.'}</h3><p>${ui.selectedOnly ? 'Choose fixtures from the full list to build your competition.' : 'Try another club or league.'}</p></div>`
    }</div>
    <div class="setup-step-footer"><span><strong>${chosen.size} ${chosen.size === 1 ? 'fixture' : 'fixtures'} selected.</strong> Players use the usual prediction slip.</span>${action('step', `Set the prizes ${glyph('arrow')}`, 'data-step="prizes"', 'setup-button--primary')}</div>
  </section>`;
}

function prizes({ draft }) {
  const total = draft.prizes.reduce((sum, prize) => sum + cents(prize.amount), 0n);
  return `<section class="setup-section" aria-labelledby="setup-section-title"><div class="setup-section-heading"><span class="setup-step-label">03 / THE PRIZES</span><h2 id="setup-section-title">Your podium. Your prize pool.</h2><p>Set an award for each winning place. Add more places whenever you need them.</p></div>
    <div class="setup-prize-presets"><span>Quick start</span>${action('preset-prizes', `${glyph('trophy')} Podium · $25 / $15 / $10`, 'data-preset="podium"')}${action('preset-prizes', 'Top five · $10 each', 'data-preset="equal"')}</div>
    <div class="setup-prize-list">${draft.prizes.map((prize, index) => `<div class="setup-prize-row ${index < 3 ? `setup-prize-row--${index + 1}` : ''}"><span class="setup-place"><b>${ordinal(index)}</b><span>${index === 0 ? 'Champion' : index === 1 ? 'Runner-up' : index === 2 ? 'Third place' : 'Prize place'}</span></span><label class="setup-amount"><span class="setup-sr-only">${ordinal(index)} place prize in USD equivalent</span><span aria-hidden="true">$</span><input inputmode="decimal" data-setup-field="prize" data-prize-id="${escape(prize.id)}" value="${escape(prize.amount)}" placeholder="0" autocomplete="off" spellcheck="false" /><small>in CKB</small></label>${action('remove-prize', glyph('close'), `data-id="${escape(prize.id)}" aria-label="Remove ${ordinal(index)} place"`, 'setup-button--icon')}</div>`).join('') || `<div class="setup-empty">${glyph('trophy')}<h3>Make room for your winners.</h3><p>Add a prize place to get started.</p></div>`}</div>
    ${action('add-prize', `${glyph('plus')} Add a winning place`, '', 'setup-button--add')}
    <div class="setup-pool-total"><span>Competition prize pool<small>${draft.prizes.length} ${draft.prizes.length === 1 ? 'winning place' : 'winning places'} · network fees additional</small></span><strong>${dollars(total)}<small>equivalent in CKB</small></strong></div>
    <div class="setup-rule-note">${glyph('shield')}<div><strong>You stay in control of the rewards wallet.</strong><p>Review the winners and approve payouts in your mainnet wallet. This preview cannot fund or send prizes.</p></div></div>
    <div class="setup-step-footer"><span>The CKB amounts will be fixed before publication.</span>${action('step', `Review competition ${glyph('arrow')}`, 'data-step="review"', 'setup-button--primary')}</div>
  </section>`;
}

function review({ draft, five, catalog }) {
  const matches = catalog.filter((match) => draft.fixtureIds.includes(match.id));
  return `<section class="setup-section" aria-labelledby="setup-section-title"><div class="setup-section-heading"><span class="setup-step-label">04 / READY FOR A LOOK</span><h2 id="setup-section-title">This is what you are inviting them to.</h2><p>Review the details, then open your competition as a player.</p></div>
    <div class="setup-review-card"><div class="setup-card-kicker">${glyph('trophy')} ${five ? 'STREAK FIVE' : 'PREDICTION COMPETITION'}</div><h3>${escape(draft.name || 'Your competition')}</h3><p>${escape(draft.description || 'Join the competition. Make your calls. Climb the leaderboard.')}</p><div class="setup-review-prizes">${draft.prizes.map((prize, index) => `<span><small>${ordinal(index)}</small><strong>${dollars(cents(prize.amount))}</strong><small>in CKB</small></span>`).join('')}</div></div>
    <div class="setup-review-details"><div><span>${five ? 'Gameweek' : 'Selected fixtures'}</span><strong>${five ? `Gameweek ${escape(draft.gameweekId)}` : `${matches.length} matches`}</strong>${action('step', `${glyph('edit')} Edit`, 'data-step="fixtures"', 'setup-button--quiet')}</div><div><span>Registration closes</span><strong>${escape((draft.registrationDeadline || 'Not set').replace('T', ' · '))} WAT</strong>${action('step', `${glyph('edit')} Edit`, 'data-step="basics"', 'setup-button--quiet')}</div></div>
    ${five ? '' : `<div class="setup-review-matches">${matches.map((match) => `<span>${escape(match.home)} <small>vs</small> ${escape(match.away)}</span>`).join('')}</div>`}
    <div class="setup-rule-note">${glyph('check')}<div><strong>${five ? 'The same Five team and player points.' : 'The same prediction slip and payment journey.'}</strong><p>${five ? 'No separate squad builder. Your competition follows the chosen gameweek.' : 'Competition picks go into the existing slip. Users review and pay through the normal wallet flow.'}</p></div></div>
    <div class="setup-review-rules"><strong>The rules, at a glance</strong><p>${five ? 'Rank by Five points. If tied, the earlier final squad save wins.' : '3 points for a correct result. 0 for a wrong or missed match. The first qualifying paid prediction counts; stake size does not affect points. If tied, the earlier last qualifying prediction wins.'}</p><p>Everyone who registers gets a ranked entry. Non-participants stay at the bottom.</p></div>
    <div class="setup-step-footer"><span>This updates the local design preview only.</span>${action('apply-preview', `View as a player ${glyph('arrow')}`, '', 'setup-button--primary')}</div></section>`;
}

/** Standalone synthetic design presentation. State, validation and events belong to the host. */
export function renderSetup({ kind, draft, ui, catalog, error }) {
  const five = kind === 'five';
  const total = draft.prizes.reduce((sum, prize) => sum + cents(prize.amount), 0n);
  const steps = [
    ['basics', 'The invitation'],
    ['fixtures', five ? 'Gameweek' : 'Fixtures'],
    ['prizes', 'Prizes'],
    ['review', 'Review'],
  ];
  const args = { draft, ui, catalog, five };
  const content =
    ui.step === 'fixtures'
      ? fixtureChooser(args)
      : ui.step === 'prizes'
        ? prizes(args)
        : ui.step === 'review'
          ? review(args)
          : basics(args);
  return `<div class="setup-workspace"><header class="setup-workspace-heading"><div><span class="setup-step-label">COMPETITION STUDIO</span><h2>Make it a matchweek to remember.</h2></div><span class="setup-badge">Draft · design preview</span></header><nav class="setup-steps" aria-label="Competition setup sections">${steps.map(([id, label], index) => `<button type="button" data-setup-action="step" data-step="${id}" class="${ui.step === id ? 'is-active' : ''}" ${ui.step === id ? 'aria-current="step"' : ''}><span>${index + 1}</span>${label}</button>`).join('')}</nav>
    ${error ? `<div class="setup-error" role="alert">${escape(error)}</div>` : ''}
    <div class="setup-columns"><div class="setup-editor">${content}</div><aside class="setup-summary" aria-label="Competition summary"><span class="setup-step-label">AT A GLANCE</span><div class="setup-summary-emblem">${glyph('trophy')}</div><h3>${escape(draft.name || 'Your competition')}</h3><p>${five ? 'Streak Five' : 'Match predictions'}</p><div class="setup-summary-total"><strong>${dollars(total)}</strong><span>prize pool in CKB</span></div><dl><div><dt>Winning places</dt><dd>${draft.prizes.length}</dd></div><div><dt>${five ? 'Gameweek' : 'Selected fixtures'}</dt><dd>${five ? escape(draft.gameweekId) : draft.fixtureIds.length}</dd></div><div><dt>Leaderboard</dt><dd>Public</dd></div><div><dt>Payouts</dt><dd>You approve</dd></div></dl><div class="setup-summary-actions">${action('save-draft', 'Save draft')}${action('step', `Review ${glyph('arrow')}`, 'data-step="review"', 'setup-button--primary')}</div><p class="setup-summary-footnote">Preview only. No competition is published and no funds move.</p>${action('reset', 'Reset this draft', '', 'setup-button--quiet')}</aside></div></div>`;
}
