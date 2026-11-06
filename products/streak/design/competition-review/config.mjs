// Synthetic local design settings. Never a production campaign or payment store.
const original = [
  [
    'brighton-brentford',
    'Brighton',
    'Brentford',
    'BHA',
    'BRE',
    'Premier League',
    27,
    'SAT 21 NOV',
    '15:00',
    'Brighton',
    '2 : 1',
    3,
    'blue',
    'coral',
  ],
  [
    'fulham-newcastle',
    'Fulham',
    'Newcastle',
    'FUL',
    'NEW',
    'Premier League',
    32,
    'SAT 21 NOV',
    '17:30',
    'Draw',
    '1 : 1',
    3,
    'neutral',
    'neutral',
  ],
  [
    'sociedad-villarreal',
    'Real Sociedad',
    'Villarreal',
    'RSO',
    'VIL',
    'La Liga',
    19,
    'SUN 22 NOV',
    '14:00',
    'Villarreal',
    '2 : 0',
    0,
    'blue',
    'gold',
  ],
  [
    'bologna-fiorentina',
    'Bologna',
    'Fiorentina',
    'BOL',
    'FIO',
    'Serie A',
    12,
    'SUN 22 NOV',
    '17:00',
    'Bologna',
    '1 : 0',
    3,
    'coral',
    'purple',
  ],
  [
    'lille-lyon',
    'Lille',
    'Lyon',
    'LIL',
    'LYO',
    'Ligue 1',
    8,
    'SUN 22 NOV',
    '20:00',
    'Lyon',
    '0 : 2',
    3,
    'coral',
    'blue',
  ],
  [
    'everton-palace',
    'Everton',
    'Crystal Palace',
    'EVE',
    'CRY',
    'Premier League',
    6,
    'SAT 21 NOV',
    '15:00',
    'Everton',
    '1 : 0',
    3,
    'blue',
    'coral',
  ],
  [
    'wolves-forest',
    'Wolves',
    'Nottm Forest',
    'WOL',
    'NFO',
    'Premier League',
    4,
    'SAT 21 NOV',
    '15:00',
    'Draw',
    '0 : 0',
    3,
    'gold',
    'coral',
  ],
  [
    'roma-lazio',
    'Roma',
    'Lazio',
    'ROM',
    'LAZ',
    'Serie A',
    14,
    'SUN 22 NOV',
    '19:45',
    'Roma',
    '2 : 1',
    3,
    'coral',
    'blue',
  ],
  [
    'betis-celta',
    'Real Betis',
    'Celta Vigo',
    'BET',
    'CEL',
    'La Liga',
    3,
    'SUN 22 NOV',
    '17:30',
    'Draw',
    '1 : 1',
    3,
    'mint',
    'blue',
  ],
  [
    'lens-rennes',
    'Lens',
    'Rennes',
    'LEN',
    'REN',
    'Ligue 1',
    2,
    'SUN 22 NOV',
    '16:00',
    'Lens',
    '2 : 0',
    3,
    'gold',
    'coral',
  ],
  [
    'dortmund-leipzig',
    'Dortmund',
    'RB Leipzig',
    'BVB',
    'RBL',
    'Bundesliga',
    9,
    'SAT 21 NOV',
    '17:30',
    'Draw',
    '2 : 2',
    3,
    'gold',
    'neutral',
  ],
  [
    'milan-arsenal',
    'AC Milan',
    'Arsenal',
    'MIL',
    'ARS',
    'Champions League',
    11,
    'TUE 24 NOV',
    '20:00',
    'Arsenal',
    '0 : 1',
    3,
    'coral',
    'coral',
  ],
];
export const catalog = original.map(
  ([id, home, away, h, a, league, count, day, time, pick, result, points, tone1, tone2]) => ({
    id,
    home,
    away,
    h,
    a,
    league,
    count,
    day,
    time,
    pick,
    result,
    points,
    tones: [tone1, tone2],
    eligible: true,
  }),
);
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function amountCents(value) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function dollars(cents) {
  return `${Math.floor(cents / 100).toLocaleString('en-US')}${cents % 100 ? '.' + String(cents % 100).padStart(2, '0') : ''}`;
}
export const totalCents = (draft) =>
  draft.prizes.reduce((total, p) => total + (amountCents(p.amount) ?? 0), 0);
export function defaultDraft(kind) {
  return {
    name: kind === 'five' ? 'Five Club Challenge' : 'Matchweek Calls',
    description:
      kind === 'five'
        ? 'Five players. One captain. Your matchweek.'
        : 'Back your football instinct. Every correct call counts.',
    gameweekId: '11',
    registrationDeadline: kind === 'five' ? '2026-11-21T12:00' : '2026-11-21T14:00',
    fixtureIds: catalog.slice(0, 5).map((f) => f.id),
    prizes: [
      { id: 'place-1', amount: '25' },
      { id: 'place-2', amount: '15' },
      { id: 'place-3', amount: '10' },
    ],
  };
}
const copy = (value) => JSON.parse(JSON.stringify(value));
const state = { predictions: defaultDraft('predictions'), five: defaultDraft('five') };
const applied = { predictions: copy(state.predictions), five: copy(state.five) };
const key = 'streak-competition-design-drafts-v1';
const deletedKey = 'streak-competition-design-deleted-v1';
const deleted = {};
export const getDraft = (kind) => state[kind];
export const getApplied = (kind) => applied[kind];
export const deletedPreview = (kind) => deleted[kind] ?? null;
export function loadDeletedPreviews() {
  try {
    const raw = localStorage.getItem(deletedKey);
    if (!raw || raw.length > 4000) return;
    const saved = JSON.parse(raw);
    for (const kind of ['predictions', 'five']) {
      if (saved?.[kind] && typeof saved[kind].name === 'string')
        deleted[kind] = { name: saved[kind].name.slice(0, 80) };
    }
  } catch {
    /* Unavailable preview storage does not block this tab. */
  }
}
function persistDeleted() {
  try {
    localStorage.setItem(deletedKey, JSON.stringify(deleted));
    return true;
  } catch {
    return false;
  }
}
export function deletePreview(kind, expectedName) {
  if (deleted[kind] || applied[kind].name !== expectedName) return null;
  deleted[kind] = { name: expectedName };
  resetDraft(kind);
  const draftSaved = saveDraft(kind);
  return { persisted: persistDeleted() && draftSaved };
}
export function validateDraft(draft, kind) {
  if (!draft.name.trim()) return 'Give your competition a name.';
  if (!draft.registrationDeadline) return 'Choose when registration closes.';
  if (kind === 'predictions' && !draft.fixtureIds.length) return 'Select at least one fixture.';
  if (kind === 'five' && !['10', '11', '12', '13'].includes(draft.gameweekId))
    return 'Choose a sample gameweek.';
  if (!draft.prizes.length) return 'Add at least one prize place.';
  if (draft.prizes.some((p) => amountCents(p.amount) === null || amountCents(p.amount) <= 0))
    return 'Each prize needs a positive amount with at most two decimal places.';
  return '';
}
export function saveDraft(kind) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function loadSavedDrafts() {
  try {
    const text = localStorage.getItem(key);
    if (!text || text.length > 100000) return;
    const saved = JSON.parse(text);
    for (const kind of ['predictions', 'five']) {
      const draft = saved[kind];
      if (
        !draft ||
        typeof draft.name !== 'string' ||
        typeof draft.description !== 'string' ||
        typeof draft.registrationDeadline !== 'string' ||
        !Array.isArray(draft.fixtureIds) ||
        !Array.isArray(draft.prizes)
      )
        continue;
      if (
        !draft.fixtureIds.every((id) => catalog.some((f) => f.id === id)) ||
        !draft.prizes.every((p) => p && typeof p.id === 'string' && typeof p.amount === 'string')
      )
        continue;
      state[kind] = {
        ...defaultDraft(kind),
        ...draft,
        name: draft.name.slice(0, 80),
        description: draft.description.slice(0, 240),
      };
    }
  } catch {
    /* Preview remains usable when browser storage is unavailable. */
  }
}
export function applyDraft(kind) {
  const error = validateDraft(state[kind], kind);
  if (error) return error;
  applied[kind] = copy(state[kind]);
  delete deleted[kind];
  persistDeleted();
  return '';
}
export function resetDraft(kind) {
  state[kind] = defaultDraft(kind);
}
