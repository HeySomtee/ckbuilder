import { amountCents, totalCents, dollars, escapeHtml as escape } from '/config.mjs';

const samplePeople = [
  ['TouchlineTactician', 'TT', 15, 74, '20 Nov 18:42', 1],
  ['Somtee', 'SO', 12, 68, '20 Nov 19:05', 2],
  ['BoxToBox', 'BB', 12, 68, '20 Nov 20:18', 3],
  ['TheAwayEnd', 'TA', 9, 61, '20 Nov 20:35', 4],
  ['PitchPerfect', 'PP', 9, 57, '21 Nov 09:12', 5],
  ['ExtraTime', 'ET', 9, 57, '21 Nov 10:04', 6],
  ['HalfSpace', 'HS', 6, 49, '21 Nov 10:16', 7],
  ['NorthStand', 'NS', 3, 32, '21 Nov 10:21', 8],
  ['CornerFlag', 'CF', 0, 0, null, 23],
  ['SundayLeague', 'SL', 0, 0, null, 24],
];

/** Presentation only. All records are synthetic and actions belong to the host preview. */
export function renderAdmin({ kind, state, icon, config }) {
  const five = kind === 'five';
  const settings = config ?? {
    name: five ? 'Five Club Challenge' : 'Matchweek Calls',
    gameweekId: '11',
    fixtureIds: [
      'brighton-brentford',
      'fulham-newcastle',
      'sociedad-villarreal',
      'bologna-fiorentina',
      'lille-lyon',
    ],
    prizes: [
      { id: 'place-1', amount: '25' },
      { id: 'place-2', amount: '15' },
      { id: 'place-3', amount: '10' },
    ],
  };
  const prizePlaces = settings.prizes.length;
  const fixtureCount = settings.fixtureIds.length;
  const prizeLabel = (index) => `$${dollars(amountCents(settings.prizes[index].amount) ?? 0)}`;
  const mode = typeof state === 'string' ? state : (state?.key ?? state?.id ?? 'open');
  const people = samplePeople.map((person) => [...person]);
  if (['registered', 'finished-inactive', 'finished-player'].includes(mode)) {
    people[1][0] = 'SecondHalf';
    people[1][1] = 'SH';
    const own = mode === 'finished-player' ? people[7] : people[9];
    own[0] = 'Somtee';
    own[1] = 'SO';
  }
  const finished = mode.startsWith('finished') || mode === 'paid';
  const finalizing = mode === 'finalizing';
  const started = finished || mode === 'live' || finalizing;
  const scored = started;
  const download = typeof icon === 'function' ? icon('download') : '';
  const scoreFor = (person) => {
    if (!scored) return 0;
    const points = five ? person[3] : Math.min(person[2], fixtureCount * 3);
    return mode === 'live' ? (five ? Math.floor(points / 2) : Math.floor(points / 6) * 3) : points;
  };
  const ranks = people.map((person) => person[5]);
  const participantRows = people
    .map((person, index) => {
      const [name, initials, , , time] = person;
      const active = Boolean(time);
      const status = active
        ? finished
          ? person[5] <= prizePlaces
            ? 'Winner'
            : 'Completed'
          : scored
            ? 'Competing'
            : five
              ? 'Team saved'
              : 'Prediction placed'
        : 'Registered · no entry';
      return `<tr data-admin-row data-name="${escape(name.toLowerCase())}">
      <td class="mono">${ranks[index]}</td>
      <td><span class="avatar" aria-hidden="true">${initials}</span><strong>${name}</strong></td>
      <td class="mono">${scoreFor(person)} <span class="muted">pts</span></td>
      <td>${active ? (five ? '5 / 5 players' : `${scored ? fixtureCount : Math.min(1, fixtureCount)} / ${fixtureCount} fixtures`) : 'Not started'}</td>
      <td class="mono muted">${time ?? 'None yet'}</td>
      <td><span class="badge ${active ? 'badge--mint' : ''}">${status}</span></td>
    </tr>`;
    })
    .join('');

  const awardCandidates = people.filter((person) => person[4]).slice(0, prizePlaces);
  const unawardedPlaces = Math.max(0, prizePlaces - awardCandidates.length);
  const paidCount = mode === 'paid' && awardCandidates.length > 1 ? 1 : 0;
  const awards = awardCandidates
    .map((person, index) => {
      const payout =
        mode === 'paid' && index === 1
          ? 'Paid · sample record'
          : [
              'Address verified',
              'Address requested',
              'Ready for review',
              'Address requested',
              'Address verified',
            ][index % 5];
      return `<tr>
      <td class="mono">${ranks[index]}</td><td><strong>${person[0]}</strong></td>
      <td>${prizeLabel(index)} equivalent in CKB</td>
      <td><span class="badge ${payout === 'Address requested' ? 'badge--amber' : 'badge--mint'}">${payout}</span></td>
    </tr>`;
    })
    .join('');

  return `<div class="admin-grid">
    <section class="panel">
      <div class="section-heading">
        <div><p class="eyebrow">COMPETITION CONTROL</p><h2>${finished ? 'Results are in. Review the awards.' : 'A clear view of every entrant.'}</h2>
          <p class="muted">${escape(settings.name)} · ${finished ? 'Final standings' : 'Registration and score monitoring'}</p></div>
        <button class="btn" data-action="export">${download} Export entrants</button>
      </div>
      <div class="metric-grid">
        <div class="admin-stat"><span class="muted">Registered</span><strong>24</strong><small>All registered players are ranked</small></div>
        <div class="admin-stat"><span class="muted">${five ? 'Teams saved' : 'Players with predictions'}</span><strong>22</strong><small>2 have not started</small></div>
        <div class="admin-stat"><span class="muted">${finished ? 'Award places' : 'Scoring status'}</span><strong>${finished ? prizePlaces : finalizing ? 'Verifying' : started ? 'Live' : 'Ready'}</strong><small>${finished ? 'Configured winning places' : started ? 'Points are provisional' : 'Scores start after lock'}</small></div>
        <div class="admin-stat"><span class="muted">Prize budget</span><strong>$${dollars(totalCents(settings))}</strong><small>${prizePlaces} ${prizePlaces === 1 ? 'place' : 'places'} · USD reference, paid in CKB</small></div>
      </div>
    </section>

    <section class="panel">
      <div class="section-heading"><div><h2>Entrants & points</h2><p class="muted">Registered players with no entry stay visible at the bottom.</p></div>
        <label><span class="sr-only">Search entrants</span><input data-admin-search type="search" placeholder="Search a player" aria-label="Search entrants" /></label></div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Points</th><th scope="col">${five ? 'Squad' : 'Qualifying calls'}</th><th scope="col">${five ? 'Last save' : 'Last call'}</th><th scope="col">Status</th></tr></thead>
        <tbody>${participantRows}</tbody>
      </table></div>
      <p class="muted">Preview shows ranks 1–8 and 23–24. Middle rows are omitted. Equal points are ordered by the earlier qualifying entry time.</p>
      <p class="muted">${finished ? 'Final scores stay separate from reward payment status.' : 'Points come from eligible saved entries. Registration alone earns no points.'}</p>
    </section>

    <section class="panel">
      <div class="section-heading"><div><h2>${five ? 'Gameweek scoring' : 'Fixture scoring'}</h2><p class="muted">${five ? 'Follow the pinned gameweek, saved teams and score revisions.' : 'Only the published competition fixtures contribute points.'}</p></div>
        <span class="badge ${finalizing ? 'badge--amber' : 'badge--mint'}">${finished ? 'Complete' : finalizing ? 'Verifying results' : started ? 'Updating' : 'Ready'}</span></div>
      <div class="metric-grid">
        <div class="admin-stat"><span class="muted">${five ? 'Score source' : 'Campaign fixtures'}</span><strong>${five ? `GW ${escape(settings.gameweekId)}` : fixtureCount}</strong><small>${five ? 'FPL data · Streak Five scoring' : 'Whitelist locked at publication'}</small></div>
        <div class="admin-stat"><span class="muted">${five ? 'Players scored in sample team' : 'Results resolved'}</span><strong>${finished || finalizing ? (five ? 5 : fixtureCount) : started ? Math.ceil((five ? 5 : fixtureCount) * 0.6) : 0} / ${five ? 5 : fixtureCount}</strong><small>${finished ? 'No unresolved results' : finalizing ? 'Final verification pending' : 'Missing results are pending, not zero'}</small></div>
        <div class="admin-stat"><span class="muted">Review</span><strong>${finished ? 'Final' : 'Pending'}</strong><small>${finished ? 'Standings frozen for award review' : 'Resolve all fixtures before finalizing'}</small></div>
      </div>
      ${finished ? '' : `<button class="btn" data-action="admin-finalize">Preview final results</button>`}
    </section>

    ${
      finished
        ? `<section class="panel">
      <div class="section-heading"><div><p class="eyebrow">WINNERS</p><h2>${prizePlaces} ${prizePlaces === 1 ? 'award' : 'awards'}. One clear record.</h2><p class="muted">Confirm each winner’s mainnet CKB address before payment.</p></div>
        <span class="badge badge--amber">${paidCount} / ${prizePlaces} paid</span></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Rank</th><th scope="col">Winner</th><th scope="col">Prize</th><th scope="col">Payout status</th></tr></thead><tbody>${awards}</tbody></table></div>
      ${unawardedPlaces ? `<p class="muted">${unawardedPlaces} ${unawardedPlaces === 1 ? 'place has' : 'places have'} no sample winner and remain unawarded in this preview. Only eight participating sample records are available for award review. Registered players without an entry are never promoted into prize places.</p>` : ''}
      <p class="muted">This preview does not send CKB. A winner is marked paid only after a real payout is confirmed.</p>
      <button class="btn btn--primary" data-action="payout-preview" ${awardCandidates.length ? '' : 'disabled'}>Review award details</button>
    </section>`
        : ''
    }
  </div>`;
}
