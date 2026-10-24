import { createHash } from 'node:crypto';
import { auctionView, isAuction, winningSponsors } from './auction';

export class FiveError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Player = {
  id: string;
  name: string;
  teamId: string;
  team: string;
  position: Position;
  cost: number;
  fixtureId: string;
};
export type Terms = {
  name: string;
  lockAt: string;
  finalizeAfter: string;
  limit: number;
  qualifyingBps: number;
  sponsorship: boolean;
  sponsorshipMode?: 'community' | 'auction';
  minimumShannons: string;
  source: string;
  players: Player[];
};
export type Stats = {
  minutes: number;
  goals: number;
  assists: number;
  conceded: number;
  saves: number;
  penaltySaves: number;
  yellow: number;
  red: number;
  ownGoals: number;
  penaltyMisses: number;
};
export type Score = { points: number; lines: { label: string; points: number }[] };
export type Entry = {
  accountId: string;
  publicId: string;
  wallet: string;
  name: string;
  players: string[];
  captain: string;
  savedAt: string;
};
export type Sponsor = {
  id: string;
  accountId: string;
  wallet: string;
  amountShannons: string;
  display: 'anonymous' | 'named';
  name: string;
  logo: string;
  link: string;
  moderation: 'pending' | 'approved' | 'hidden';
  createdAt: string;
  funding: 'awaiting' | 'submitted' | 'confirmed' | 'conflicted';
  outpoint?: string;
  conflictingHash?: string;
  destination?: string;
  tag?: string;
  signedBytes?: string;
  transactionHash?: string;
  submittedSequence?: number;
  confirmedAt?: string;
  auctionCheckedAt?: string;
};
export type Round = {
  id: string;
  creator: string;
  createdAt: string;
  state: 'draft' | 'open' | 'final' | 'cancelled';
  terms: Terms;
  termsHash: string;
  revision: number;
  entries: Entry[];
  sponsors: Sponsor[];
  scores: Record<string, Score>;
  scoreSource: string;
  scoresAt: string | null;
  scoresComplete: boolean;
  scoreRevision: number;
  rewards: Record<string, string>;
  finalizedAt: string | null;
  rulesVersion: 1;
  rawStats: Record<string, Stats>;
  cancellationReason?: string;
  auction?: {
    closedAt: string;
    winnerWallet: string;
    winnerSponsorIds: string[];
    amountShannons: string;
  };
};
const positions: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
export const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new FiveError('Expected an object.');
  return value as Record<string, unknown>;
};
export function text(value: unknown, max = 100): string {
  if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u001f]/.test(value))
    throw new FiveError('Text is missing or too long.');
  return value.trim();
}
export function identifier(value: unknown): string {
  const result = text(value, 100);
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(result) ||
    ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'].includes(
      result,
    )
  )
    throw new FiveError('Invalid identifier.');
  return result;
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new FiveError(`Expected a whole number from ${min} to ${max}.`);
  return value;
}
export function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,17})$/.test(value))
    throw new FiveError('Use an exact non-negative amount in shannons.');
  return value;
}
export function https(value: unknown): string {
  const s = text(value ?? '', 1024);
  if (!s) return '';
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new FiveError('Use a valid HTTPS link.');
  }
  if (u.protocol !== 'https:' || u.username || u.password)
    throw new FiveError('Use a public HTTPS link.');
  return u.href;
}
export function parseTerms(value: unknown): Terms {
  const t = object(value);
  const date = (s: unknown) => {
    const value = text(s, 40),
      ms = Date.parse(value);
    if (!Number.isFinite(ms)) throw new FiveError('Choose a valid date.');
    return new Date(ms).toISOString();
  };
  if (!Array.isArray(t.players) || t.players.length < 5 || t.players.length > 1000)
    throw new FiveError('A gameweek needs 5 to 1,000 eligible players.');
  const players = t.players.map((v) => {
    const p = object(v),
      position = text(p.position);
    if (!positions.includes(position as Position)) throw new FiveError('Unknown player position.');
    const name = text(p.name, 80),
      team = text(p.team, 80);
    if (!name || !team) throw new FiveError('Players need names and clubs.');
    return {
      id: identifier(p.id),
      name,
      team,
      teamId: identifier(p.teamId),
      position: position as Position,
      cost: integer(p.cost, 1, 200),
      fixtureId: identifier(p.fixtureId),
    };
  });
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new FiveError('Player identifiers must be unique.');
  const lockAt = date(t.lockAt),
    finalizeAfter = date(t.finalizeAfter);
  if (
    Date.parse(finalizeAfter) < Date.parse(lockAt) + 3_600_000 ||
    Date.parse(finalizeAfter) > Date.parse(lockAt) + 14 * 86_400_000
  )
    throw new FiveError('Finalization must be 1 hour to 14 days after the entry deadline.');
  const name = text(t.name, 64),
    source = text(t.source, 240);
  if (!name || !source) throw new FiveError('Name the gameweek and its player-data source.');
  if (typeof t.sponsorship !== 'boolean')
    throw new FiveError('Choose whether sponsorship is open.');
  if (
    t.sponsorshipMode !== undefined &&
    !['community', 'auction'].includes(String(t.sponsorshipMode))
  )
    throw new FiveError('Choose community sponsorship or a sponsor auction.');
  const minimumShannons = amount(t.minimumShannons);
  if (BigInt(minimumShannons) < 100n * 100_000_000n)
    throw new FiveError('The sponsorship minimum must be at least 100 tCKB.');
  return {
    name,
    lockAt,
    finalizeAfter,
    source,
    players,
    limit: integer(t.limit, 2, 1000),
    qualifyingBps: integer(t.qualifyingBps, 100, 5000),
    sponsorship: t.sponsorship,
    ...(t.sponsorshipMode === undefined
      ? {}
      : { sponsorshipMode: t.sponsorshipMode as 'community' | 'auction' }),
    minimumShannons,
  };
}
export const hashTerms = (terms: Terms) =>
  createHash('sha256')
    .update(JSON.stringify({ rulesVersion: 1, terms }))
    .digest('hex');
export function newRound(id: string, creator: string, terms: Terms, now: number): Round {
  if (Date.parse(terms.lockAt) <= now + 60_000)
    throw new FiveError('Choose an entry deadline in the future.');
  return {
    id,
    creator,
    terms,
    termsHash: hashTerms(terms),
    createdAt: new Date(now).toISOString(),
    state: 'draft',
    revision: 1,
    entries: [],
    sponsors: [],
    scores: {},
    scoreSource: '',
    scoresAt: null,
    scoresComplete: false,
    scoreRevision: 0,
    rewards: {},
    finalizedAt: null,
    rulesVersion: 1,
    rawStats: {},
  };
}
export function affordableSquad(players: Player[]): boolean {
  const clubs = new Map<string, Player[]>();
  for (const p of players) clubs.set(p.teamId, [...(clubs.get(p.teamId) ?? []), p]);
  let states = new Map<string, number>([['0,0,0,0', 0]]);
  const caps = [1, 1, 2, 1];
  for (const club of clubs.values()) {
    const cheapest = positions.flatMap((pos) =>
      club
        .filter((p) => p.position === pos)
        .sort((a, b) => a.cost - b.cost)
        .slice(0, 2),
    );
    const options: { counts: number[]; cost: number }[] = [{ counts: [0, 0, 0, 0], cost: 0 }];
    for (let i = 0; i < cheapest.length; i++) {
      const a = cheapest[i],
        counts = [0, 0, 0, 0];
      counts[positions.indexOf(a.position)]++;
      options.push({ counts, cost: a.cost });
      for (let j = i + 1; j < cheapest.length; j++) {
        const next = [...counts];
        next[positions.indexOf(cheapest[j].position)]++;
        if (next.every((v, k) => v <= caps[k]))
          options.push({ counts: next, cost: a.cost + cheapest[j].cost });
      }
    }
    const next = new Map(states);
    for (const [key, cost] of states)
      for (const option of options) {
        const counts = key.split(',').map((v, i) => Number(v) + option.counts[i]),
          total = cost + option.cost;
        if (total > 400 || counts.some((v, i) => v > caps[i])) continue;
        const keyNext = counts.join(',');
        next.set(keyNext, Math.min(next.get(keyNext) ?? Infinity, total));
      }
    states = next;
  }
  return states.has('1,1,2,1');
}
export function validateSquad(
  terms: Terms,
  ids: unknown,
  captain: unknown,
): { players: string[]; captain: string } {
  if (!Array.isArray(ids) || ids.length !== 5) throw new FiveError('Choose five players.');
  const selected = ids.map(identifier),
    leader = identifier(captain);
  if (new Set(selected).size !== 5) throw new FiveError('Choose each player once.');
  const players = selected.map((id) => {
    const p = terms.players.find((p) => p.id === id);
    if (!p) throw new FiveError('A player is not eligible for this gameweek.');
    return p;
  });
  const expected = { GK: 1, DEF: 1, MID: 2, FWD: 1 };
  for (const pos of positions)
    if (players.filter((p) => p.position === pos).length !== expected[pos])
      throw new FiveError('Pick 1 goalkeeper, 1 defender, 2 midfielders and 1 forward.');
  if (players.reduce((n, p) => n + p.cost, 0) > 400)
    throw new FiveError('Keep your squad within 40 credits.');
  if (players.some((p) => players.filter((q) => q.teamId === p.teamId).length > 2))
    throw new FiveError('Choose no more than two players per club.');
  if (!selected.includes(leader)) throw new FiveError('Your captain must be in your five.');
  return { players: selected, captain: leader };
}
export function saveEntry(
  round: Round,
  actor: { id: string; name: string; wallet: string },
  ids: unknown,
  captain: unknown,
  reviewedHash: unknown,
  now: number,
): void {
  if (round.state !== 'open' || now >= Date.parse(round.terms.lockAt))
    throw new FiveError('This gameweek is closed to squad changes.', 409);
  if (reviewedHash !== round.termsHash)
    throw new FiveError('Review the current gameweek rules first.', 409);
  const squad = validateSquad(round.terms, ids, captain);
  const old = round.entries.find((e) => e.accountId === actor.id);
  if (round.entries.some((e) => e.wallet === actor.wallet && e.accountId !== actor.id))
    throw new FiveError('This wallet already has an entry.', 409);
  if (!old && round.entries.length >= round.terms.limit)
    throw new FiveError('This gameweek is full.', 409);
  const entry = {
    accountId: actor.id,
    publicId: createHash('sha256').update(`${round.id}:${actor.id}`).digest('hex').slice(0, 24),
    wallet: actor.wallet,
    name: actor.name.slice(0, 64),
    ...squad,
    savedAt: new Date(now).toISOString(),
  };
  if (old) Object.assign(old, entry);
  else round.entries.push(entry);
}
export function normalizeStats(raw: unknown): Stats {
  const stats = object(raw);
  const keys: (keyof Stats)[] = [
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
  const s = Object.fromEntries(
    keys.map((k) => [k, integer(stats[k], 0, k === 'minutes' ? 180 : 50)]),
  ) as Stats;
  // Unused substitutes can receive cards. Preserve those observations; the published
  // version-one non-appearance rule still awards zero points for zero minutes.
  if (!s.minutes && keys.some((k) => !['minutes', 'yellow', 'red'].includes(k) && s[k] !== 0))
    throw new FiveError('Non-appearance statistics must be zero.');
  return s;
}
export function scorePlayer(position: Position, raw: unknown): Score {
  const s = normalizeStats(raw);
  const lines: Score['lines'] = [];
  const add = (label: string, points: number) => {
    if (points) lines.push({ label, points });
  };
  if (!s.minutes) return { points: 0, lines: [{ label: 'Did not play', points: 0 }] };
  add('Appearance', s.minutes >= 60 ? 2 : 1);
  add('Goals', s.goals * { GK: 6, DEF: 6, MID: 5, FWD: 4 }[position]);
  add('Assists', s.assists * 3);
  if (s.minutes >= 60 && !s.conceded)
    add('Clean sheet', { GK: 4, DEF: 4, MID: 1, FWD: 0 }[position]);
  if (position === 'GK') {
    add('Saves', Math.floor(s.saves / 3));
    add('Penalty saves', s.penaltySaves * 5);
  }
  if (position === 'GK' || position === 'DEF') add('Goals conceded', -Math.floor(s.conceded / 2));
  add('Yellow cards', -s.yellow);
  add('Red cards', -s.red * 3);
  add('Own goals', -s.ownGoals * 2);
  add('Penalty misses', -s.penaltyMisses * 2);
  return { points: lines.reduce((n, l) => n + l.points, 0), lines };
}
export function standings(round: Round) {
  return round.entries
    .map((e) => {
      const missing = e.players.some(
        (id) => !Object.prototype.hasOwnProperty.call(round.scores, id),
      );
      const points = e.players.reduce(
        (n, id) =>
          n +
          (Object.prototype.hasOwnProperty.call(round.scores, id) ? round.scores[id].points : 0) *
            (id === e.captain ? 2 : 1),
        0,
      );
      return { id: e.publicId, name: e.name, points, pending: missing };
    })
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}
/** Exact pro-rata floor allocation; sub-shannon remainder is explicitly retained. */
export function allocate(
  poolShannons: string,
  rows: { id: string; points: number; pending: boolean }[],
  bps: number,
) {
  const pool = BigInt(amount(poolShannons));
  integer(bps, 100, 5000);
  if (rows.some((r) => r.pending || !Number.isSafeInteger(r.points)))
    throw new FiveError('All scores must be complete before allocation.');
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new FiveError('Duplicate standings.');
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  const count = Math.ceil((rows.length * bps) / 10000);
  const cutoff = sorted[count - 1]?.points ?? 0;
  const winners = sorted.filter((r) => r.points > 0 && r.points >= cutoff);
  const total = winners.reduce((n, r) => n + BigInt(r.points), 0n);
  const rewards: Record<string, string> = Object.create(null);
  for (const row of winners) rewards[row.id] = ((pool * BigInt(row.points)) / total).toString();
  const distributed = Object.values(rewards).reduce((n, v) => n + BigInt(v), 0n);
  return {
    rewards,
    remainderShannons: (pool - distributed).toString(),
    cutoff: Math.max(cutoff, 0),
  };
}
export const fundedPool = (round: Round) =>
  winningSponsors(round)
    .reduce((n, s) => n + BigInt(s.amountShannons), 0n)
    .toString();
export function project(round: Round, accountId: string | null, admin: boolean, now: number) {
  const unlocked = now >= Date.parse(round.terms.lockAt);
  return {
    id: round.id,
    state: round.state === 'open' && unlocked ? 'locked' : round.state,
    terms: round.terms,
    termsHash: round.termsHash,
    revision: round.revision,
    ownId: round.entries.find((e) => e.accountId === accountId)?.publicId ?? null,
    entries: round.entries.map((e) => ({
      id: e.publicId,
      name: e.name,
      ...(unlocked || e.accountId === accountId ? { players: e.players, captain: e.captain } : {}),
    })),
    standings: unlocked ? standings(round) : [],
    scores: unlocked ? round.scores : {},
    scoreSource: round.scoreSource,
    scoresAt: round.scoresAt,
    scoresComplete: round.scoresComplete,
    scoreRevision: round.scoreRevision,
    finalizedAt: round.finalizedAt,
    rewards: round.rewards,
    poolShannons: fundedPool(round),
    auction: auctionView(round, accountId, now),
    cancellationReason: round.cancellationReason ?? '',
    sponsors: (isAuction(round)
      ? winningSponsors(round)
          .sort((a, b) => b.submittedSequence! - a.submittedSequence!)
          .slice(0, 1)
      : winningSponsors(round)
    ).map((s) => ({
      id: s.id,
      amountShannons: s.amountShannons,
      name: s.display === 'named' && s.moderation === 'approved' ? s.name : 'Community supporter',
      logo: s.display === 'named' && s.moderation === 'approved' ? s.logo : '',
      link: s.display === 'named' && s.moderation === 'approved' ? s.link : '',
    })),
    ownSponsorships: round.sponsors
      .filter((s) => s.accountId === accountId)
      .map((s) => ({
        id: s.id,
        amountShannons: s.amountShannons,
        funding: s.funding,
        moderation: s.moderation,
        destination: s.destination ?? '',
        tag: s.tag ?? '',
        transactionHash: s.transactionHash ?? '',
        auctionOutcome:
          !isAuction(round) || s.funding !== 'confirmed'
            ? ''
            : round.state === 'cancelled' ||
                (round.state === 'final' &&
                  !Object.values(round.rewards).some((v) => BigInt(v) > 0n))
              ? 'Refund pending'
              : !round.auction
                ? 'Bid funded'
                : round.auction.winnerSponsorIds.includes(s.id)
                  ? 'Winning bid'
                  : 'Refund pending',
      })),
    ...(admin
      ? {
          moderation: round.sponsors
            .filter((s) => s.display === 'named')
            .map((s) => ({
              id: s.id,
              name: s.name,
              logo: s.logo,
              link: s.link,
              moderation: s.moderation,
            })),
        }
      : {}),
  };
}
