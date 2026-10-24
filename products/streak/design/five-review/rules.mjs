export const BUDGET = 400;
export const SLOTS = ['FWD', 'MID', 'MID', 'DEF', 'GK'];
export function validate(players, captain) {
  if (players.some((p) => !['GK', 'DEF', 'MID', 'FWD'].includes(p.position)))
    return 'Refresh the player positions.';
  if (new Set(players.map((p) => p.id)).size !== players.length) return 'Choose each player once.';
  if (players.some((p) => !Number.isInteger(p.cost) || p.cost < 0))
    return 'Refresh the player prices.';
  if (players.reduce((n, p) => n + p.cost, 0) > BUDGET)
    return 'Your five must fit within 40 credits.';
  for (const pos of ['GK', 'DEF', 'MID', 'FWD'])
    if (players.filter((p) => p.position === pos).length > SLOTS.filter((p) => p === pos).length)
      return `Your ${pos} slots are full. Remove a player to swap.`;
  for (const player of players)
    if (players.filter((p) => p.teamId === player.teamId).length > 2)
      return 'Choose no more than two players from one club.';
  if (players.length !== 5)
    return `Choose ${5 - players.length} more player${players.length === 4 ? '' : 's'}.`;
  if (!players.some((p) => p.id === captain)) return 'Choose a captain for double points.';
  return null;
}
export function additionError(players, player) {
  const next = [...players, player];
  const error = validate(next, player.id);
  return error?.startsWith('Choose ') && error.includes(' more player') ? null : error;
}
export function score(position, stats, captain = false) {
  if (!stats || stats.complete !== true) return { total: null, lines: [], pending: true };
  const fields = [
    'minutes',
    'goals',
    'assists',
    'conceded',
    'saves',
    'penaltySaves',
    'yellow',
    'red',
    'ownGoals',
    'penaltyMisses',
  ];
  if (
    !['GK', 'DEF', 'MID', 'FWD'].includes(position) ||
    fields.some((key) => !Number.isInteger(stats[key]) || stats[key] < 0)
  )
    return { total: null, lines: [], pending: true };
  const lines = [];
  const add = (label, points) => {
    if (points) lines.push({ label, points });
  };
  if (stats.minutes === 0)
    return { total: 0, lines: [{ label: 'Did not play', points: 0 }], pending: false };
  add('Minutes played', stats.minutes >= 60 ? 2 : 1);
  add('Goals', stats.goals * { GK: 6, DEF: 6, MID: 5, FWD: 4 }[position]);
  add('Assists', stats.assists * 3);
  if (stats.minutes >= 60 && stats.conceded === 0)
    add('Clean sheet', { GK: 4, DEF: 4, MID: 1, FWD: 0 }[position]);
  if (position === 'GK') {
    add('Saves', Math.floor(stats.saves / 3));
    add('Penalty saves', stats.penaltySaves * 5);
  }
  if (position === 'GK' || position === 'DEF')
    add('Goals conceded', -Math.floor(stats.conceded / 2));
  add('Yellow cards', -stats.yellow);
  add('Red cards', -3 * stats.red);
  add('Own goals', -2 * stats.ownGoals);
  add('Penalty misses', -2 * stats.penaltyMisses);
  const base = lines.reduce((n, l) => n + l.points, 0);
  if (captain) lines.push({ label: 'Captain ×2', points: base });
  return { total: base * (captain ? 2 : 1), lines, pending: false };
}
