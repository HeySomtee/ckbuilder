import { createHash, randomUUID } from 'node:crypto';

export const RULE_VERSION = 'survivor-free-v1';
export class SurvivorError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export type Team = { id: string; name: string; code: string; logo?: string };
export type Fixture = { id: string; kickoff: string; home: Team; away: Team };
export type Slate = {
  testingPolicy?: 'admin-controlled-v1';
  key: string;
  label: string;
  lockAt: string;
  resolveAt: string;
  fixtures: Fixture[];
};
export type Result = {
  outcome: 'home' | 'draw' | 'away';
  home: number;
  away: number;
  confirmedAt: string;
};
export type Observation = {
  observedAt: string;
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  result: Result | null;
  unavailable?: boolean;
  historyGap?: boolean;
};
export type Pick = {
  teamId: string;
  fixtureId: string;
  savedAt: string;
  result?: 'won' | 'lost' | 'void' | 'rescued';
};
export type Entry = {
  accountId: string;
  publicId: string;
  name: string;
  joinedAt: string;
  status: 'active' | 'out' | 'winner';
  used: string[];
  picks: Record<string, Pick>;
  missedRound?: number;
};
export type Round = Slate & {
  testClosedAt?: string;
  testResolvedAt?: string;
  state: 'scheduled' | 'locked' | 'final';
  results: Record<string, Result>;
  observed: Record<string, string>;
  voidFixtures: string[];
  finalizedAt?: string;
};
export type Terms = {
  name: string;
  mode: 'free' | 'paid';
  feeShannons: string;
  prizeShannons: string;
  limit: number;
};
export type Competition = {
  v: 1;
  id: string;
  creator: string;
  createdAt: string;
  terms: Terms;
  termsHash: string;
  ruleVersion: typeof RULE_VERSION;
  state: 'draft' | 'open' | 'running' | 'complete' | 'cancelled';
  rounds: Round[];
  entries: Entry[];
  currentRound: number;
  reason?: string;
  audit: { at: string; action: string; round?: number }[];
};
export const stamp = (time: number) => new Date(time).toISOString();
export const lockTime = (round: Round) =>
  round.testingPolicy === 'admin-controlled-v1' && round.testClosedAt
    ? Math.min(Date.parse(round.lockAt), Date.parse(round.testClosedAt))
    : Date.parse(round.lockAt);
export const resolveTime = (round: Round) =>
  round.testingPolicy === 'admin-controlled-v1' && round.testResolvedAt
    ? Math.min(Date.parse(round.resolveAt), Date.parse(round.testResolvedAt))
    : Date.parse(round.resolveAt);
const kickoffTime = (round: Round, fixture: Fixture) =>
  round.testingPolicy === 'admin-controlled-v1' && round.testClosedAt
    ? Math.min(Date.parse(fixture.kickoff), Date.parse(round.testClosedAt))
    : Date.parse(fixture.kickoff);
const fail = (message: string): never => {
  throw new SurvivorError(message);
};
export function parseTerms(value: unknown): Terms {
  if (!value || typeof value !== 'object') return fail('Competition terms are required.');
  const body = value as Record<string, unknown>;
  if (
    typeof body.name !== 'string' ||
    body.name.trim().length < 3 ||
    body.name.trim().length > 64 ||
    /[\x00-\x1f]/.test(body.name)
  )
    return fail('Use a competition name between 3 and 64 characters.');
  if (body.mode !== 'free' && body.mode !== 'paid') return fail('Choose free or fee-gated entry.');
  if (!Number.isInteger(body.limit) || Number(body.limit) < 2 || Number(body.limit) > 256)
    return fail('Choose between 2 and 256 places.');
  const amount = (value: unknown) => {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(value))
      return fail('Use an exact, non-negative amount in shannons.');
    return value;
  };
  const feeShannons = amount(body.feeShannons),
    prizeShannons = amount(body.prizeShannons);
  if (body.mode === 'free' && feeShannons !== '0') return fail('Free entry cannot charge a fee.');
  if (body.mode === 'paid' && feeShannons === '0')
    return fail('Fee-gated drafts need a positive entry fee.');
  return {
    name: body.name.trim(),
    mode: body.mode,
    feeShannons,
    prizeShannons,
    limit: Number(body.limit),
  };
}
function validateSchedule(slates: Slate[], now: number) {
  if (!slates.length || slates.length > 10)
    fail('Choose one to ten complete Premier League rounds.');
  let previousEnd = now;
  const fixtures = new Set<string>();
  for (const slate of slates) {
    const lock = Date.parse(slate.lockAt),
      end = Date.parse(slate.resolveAt);
    if (
      !Number.isFinite(lock) ||
      !Number.isFinite(end) ||
      lock <= previousEnd ||
      end <= lock ||
      !slate.fixtures.length ||
      slate.fixtures.length > 10
    )
      fail('Rounds must have future, non-overlapping deadlines.');
    const teams = new Set<string>();
    for (const fixture of slate.fixtures) {
      if (
        fixtures.has(fixture.id) ||
        Date.parse(fixture.kickoff) <= lock ||
        Date.parse(fixture.kickoff) >= end
      )
        fail('Every fixture must fall inside its round.');
      fixtures.add(fixture.id);
      for (const team of [fixture.home, fixture.away]) {
        if (!team.id || teams.has(team.id)) fail('A team can appear only once per round.');
        teams.add(team.id);
      }
    }
    previousEnd = end;
  }
}
export function createCompetition(
  id: string,
  creator: string,
  terms: Terms,
  slates: Slate[],
  now: number,
): Competition {
  validateSchedule(slates, now);
  return {
    v: 1,
    id,
    creator,
    createdAt: stamp(now),
    terms,
    ruleVersion: RULE_VERSION,
    termsHash: createHash('sha256')
      .update(JSON.stringify({ terms, slates, rule: RULE_VERSION }))
      .digest('hex'),
    state: 'draft',
    rounds: slates.map((s) => ({
      ...s,
      state: 'scheduled',
      results: {},
      observed: {},
      voidFixtures: [],
    })),
    entries: [],
    currentRound: 0,
    audit: [{ at: stamp(now), action: 'created' }],
  };
}
export function publish(c: Competition, now: number) {
  if (c.state !== 'draft') return;
  if (c.terms.mode !== 'free')
    throw new SurvivorError(
      'Fee-gated entry is not available yet. Save this as a draft or use free entry.',
      409,
    );
  validateSchedule(c.rounds, now);
  c.state = 'open';
  c.audit.push({ at: stamp(now), action: 'published' });
}
export function join(
  c: Competition,
  accountId: string,
  name: string,
  termsHash: string,
  now: number,
) {
  if (c.entries.some((e) => e.accountId === accountId)) return;
  if (c.state !== 'open' || now >= lockTime(c.rounds[0]))
    throw new SurvivorError('Entries have closed.', 409);
  if (termsHash !== c.termsHash)
    throw new SurvivorError('The terms changed. Review this competition again.', 409);
  if (c.terms.mode !== 'free') throw new SurvivorError('Paid admission is not enabled.', 409);
  if (c.entries.length >= c.terms.limit) throw new SurvivorError('This competition is full.', 409);
  c.entries.push({
    accountId,
    publicId: randomUUID(),
    name: name.slice(0, 40),
    joinedAt: stamp(now),
    status: 'active',
    used: [],
    picks: {},
  });
}
export function savePick(
  c: Competition,
  accountId: string,
  roundIndex: number,
  teamId: string,
  now: number,
) {
  const round = c.rounds[c.currentRound],
    entrant = c.entries.find((e) => e.accountId === accountId);
  if (!entrant) throw new SurvivorError('Join this competition first.', 403);
  if (
    !['open', 'running'].includes(c.state) ||
    roundIndex !== c.currentRound ||
    entrant.status !== 'active' ||
    round.state !== 'scheduled' ||
    now >= lockTime(round)
  )
    throw new SurvivorError('This round is locked or your run has ended.', 409);
  if (entrant.used.includes(teamId))
    throw new SurvivorError('You have already played this team.', 409);
  const fixture = round.fixtures.find((f) => f.home.id === teamId || f.away.id === teamId);
  if (!fixture) throw new SurvivorError('Choose a team from this round.');
  if (round.voidFixtures.includes(fixture.id))
    throw new SurvivorError('This fixture changed after publication. Choose another team.', 409);
  entrant.picks[String(c.currentRound)] = { teamId, fixtureId: fixture.id, savedAt: stamp(now) };
}
export function observe(
  c: Competition,
  observations: Record<string, Observation | Observation[]>,
  now: number,
) {
  if (!['open', 'running'].includes(c.state)) return;
  for (const round of c.rounds) {
    if (round.state === 'final') continue;
    for (const fixture of round.fixtures) {
      const values = observations[fixture.id];
      for (const observation of Array.isArray(values) ? values : [values]) {
        const cursor = Math.max(
          Date.parse(c.createdAt),
          Date.parse(round.observed[fixture.id] ?? '1970-01-01'),
        );
        if (
          !observation ||
          !Number.isFinite(Date.parse(observation.observedAt)) ||
          Date.parse(observation.observedAt) > now ||
          Date.parse(observation.observedAt) < cursor
        )
          continue;
        // A gap can end after the cutoff while concealing an earlier withdrawal.
        if (
          observation.historyGap &&
          cursor < Math.min(Date.parse(observation.observedAt), resolveTime(round))
        ) {
          if (!round.voidFixtures.includes(fixture.id)) round.voidFixtures.push(fixture.id);
          delete round.results[fixture.id];
        }
        if (Date.parse(observation.observedAt) > resolveTime(round)) continue;
        if (
          observation.kickoff !== fixture.kickoff ||
          observation.homeTeamId !== fixture.home.id ||
          observation.awayTeamId !== fixture.away.id ||
          observation.unavailable
        ) {
          if (!round.voidFixtures.includes(fixture.id)) round.voidFixtures.push(fixture.id);
        }
        round.observed[fixture.id] = observation.observedAt;
        if (
          observation.result &&
          Date.parse(observation.result.confirmedAt) >= kickoffTime(round, fixture) &&
          !round.voidFixtures.includes(fixture.id)
        )
          round.results[fixture.id] = observation.result;
        else delete round.results[fixture.id];
      }
    }
  }
}
function complete(c: Competition, now: number, reason: string) {
  c.state = 'complete';
  c.reason = reason;
  for (const entry of c.entries) if (entry.status === 'active') entry.status = 'winner';
  c.audit.push({ at: stamp(now), action: 'completed', round: c.currentRound });
}
function cancel(c: Competition, now: number, reason: string) {
  c.state = 'cancelled';
  c.reason = reason;
  c.audit.push({ at: stamp(now), action: 'cancelled', round: c.currentRound });
}
/** Only confirmed provider observations are passed here. Replays are idempotent. */
export function advance(c: Competition, results: Record<string, Result>, now: number) {
  if (!['open', 'running'].includes(c.state)) return;
  const round = c.rounds[c.currentRound];
  const eligible = c.entries.filter((e) => e.status === 'active');
  if (
    round.state === 'scheduled' &&
    eligible.length >= 2 &&
    eligible.some(
      (e) =>
        !round.fixtures.some(
          (f) =>
            !round.voidFixtures.includes(f.id) &&
            (!e.used.includes(f.home.id) || !e.used.includes(f.away.id)),
        ),
    )
  ) {
    if (c.currentRound === 0)
      return cancel(c, now, 'The opening slate no longer offers every entrant a legal choice.');
    return complete(c, now, 'No legal next round for every survivor.');
  }
  if (now < lockTime(round)) return;
  if (round.state === 'scheduled') {
    if (c.currentRound === 0 && c.entries.length < 2)
      return cancel(c, now, 'Fewer than two entrants at the opening deadline.');
    round.state = 'locked';
    c.state = 'running';
    for (const entry of c.entries.filter((e) => e.status === 'active')) {
      const pick = entry.picks[String(c.currentRound)];
      if (!pick) {
        entry.status = 'out';
        entry.missedRound = c.currentRound;
      } else entry.used.push(pick.teamId);
    }
    c.audit.push({ at: stamp(now), action: 'locked', round: c.currentRound });
  }
  if (!c.entries.some((e) => e.status === 'active'))
    return cancel(c, now, 'Everyone missed the pick deadline.');
  for (const fixture of round.fixtures) {
    const result = results[fixture.id];
    if (
      !result ||
      !Number.isFinite(Date.parse(result.confirmedAt)) ||
      Date.parse(result.confirmedAt) > Math.min(now, resolveTime(round)) ||
      Date.parse(result.confirmedAt) < kickoffTime(round, fixture)
    )
      continue;
    const previous = round.results[fixture.id];
    if (!previous || Date.parse(result.confirmedAt) >= Date.parse(previous.confirmedAt))
      round.results[fixture.id] = result;
  }
  if (now < resolveTime(round)) return;
  const active = c.entries.filter((e) => e.status === 'active');
  let advancing = 0;
  for (const entry of active) {
    const pick = entry.picks[String(c.currentRound)];
    const fixture = round.fixtures.find((f) => f.id === pick.fixtureId)!;
    const result = round.results[fixture.id];
    if (!result) {
      pick.result = 'void';
      entry.used = entry.used.filter((id) => id !== pick.teamId);
      advancing++;
    } else if (result.outcome !== 'draw' && fixture[result.outcome].id === pick.teamId) {
      pick.result = 'won';
      advancing++;
    } else pick.result = 'lost';
  }
  for (const entry of active) {
    const pick = entry.picks[String(c.currentRound)];
    if (pick.result === 'lost') {
      if (advancing === 0) pick.result = 'rescued';
      else entry.status = 'out';
    }
  }
  round.state = 'final';
  round.finalizedAt = stamp(now);
  c.audit.push({
    at: stamp(now),
    action: advancing === 0 ? 'all-loss-rescue' : 'finalized',
    round: c.currentRound,
  });
  const remaining = c.entries.filter((e) => e.status === 'active');
  if (remaining.length === 1) return complete(c, now, 'Last survivor.');
  const next = c.rounds[c.currentRound + 1];
  if (!next)
    return complete(c, now, 'Published schedule completed. Remaining survivors share the result.');
  if (
    remaining.some(
      (e) =>
        !next.fixtures.some(
          (f) =>
            !next.voidFixtures.includes(f.id) &&
            (!e.used.includes(f.home.id) || !e.used.includes(f.away.id)),
        ),
    )
  )
    return complete(c, now, 'No legal next round for every survivor.');
  // A delayed worker must not eliminate everyone for a round that never opened.
  if (now >= lockTime(next))
    return complete(
      c,
      now,
      'The next published deadline passed before this round could open. Joint winners.',
    );
  c.currentRound++;
}
export function project(c: Competition, accountId: string | null, now: number) {
  const own = c.entries.find((e) => e.accountId === accountId);
  return {
    id: c.id,
    terms: c.terms,
    termsHash: c.termsHash,
    ruleVersion: c.ruleVersion,
    state: c.state,
    reason: c.reason,
    currentRound: c.currentRound,
    prizeStatus: 'announced' as const,
    rounds: c.rounds.map((r) => ({
      ...r,
      lockAt: stamp(lockTime(r)),
      resolveAt: stamp(resolveTime(r)),
      state: r.state === 'scheduled' && now >= lockTime(r) ? ('locked' as const) : r.state,
    })),
    entries: c.entries.map((e) => ({
      id: e.publicId,
      name: e.name,
      status: e.status,
      used: e.used,
      missedRound: e.missedRound,
      picks: Object.fromEntries(
        Object.entries(e.picks).filter(
          ([index]) => e === own || now >= lockTime(c.rounds[Number(index)]),
        ),
      ),
    })),
    ownId: own?.publicId ?? null,
    audit: c.audit,
  };
}
