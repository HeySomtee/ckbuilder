import type { Match } from '../../types';
import type { FixtureObservation, LiveResult } from '../../providers/types';
import {
  advance,
  createCompetition,
  join,
  observe,
  parseTerms,
  project,
  publish,
  savePick,
  SurvivorError,
  type Observation,
  type Result,
  type Slate,
  type Team,
} from './domain';
import type { SurvivorStorage } from './storage';

export type Actor = { id: string; name: string; wallet: string } | null;
const object = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new SurvivorError('A JSON object is required.');
  return body as Record<string, unknown>;
};
const identifier = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new SurvivorError('Invalid identifier.');
  return value;
};
/** A complete API-Football EPL slate, never an admin-picked subset of clubs. */
export function eligibleSlates(matches: Match[], now: number): Slate[] {
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    if (
      match.competition?.id !== '39' ||
      match.oracle?.provider !== 'api-football' ||
      !match.matchday
    )
      continue;
    const key = `${match.kickoff.slice(0, 4)}:${match.matchday}`;
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }
  const slates: Slate[] = [];
  const team = (t: Match['home']): Team => ({
    id: t.id!,
    name: t.name,
    code: t.code,
    ...(t.logo?.startsWith('https://') ? { logo: t.logo } : {}),
  });
  for (const [key, fixtures] of groups) {
    if (
      fixtures.length !== 10 ||
      fixtures.some(
        (f) =>
          !f.home.id ||
          !f.away.id ||
          f.status !== 'scheduled' ||
          !Number.isFinite(Date.parse(f.kickoff)),
      )
    )
      continue;
    if (new Set(fixtures.flatMap((f) => [f.home.id, f.away.id])).size !== 20) continue;
    fixtures.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
    const start = Date.parse(fixtures[0].kickoff),
      end = Date.parse(fixtures[9].kickoff);
    if (start - 60_000 <= now || end - start > 7 * 86_400_000) continue;
    slates.push({
      key,
      label: fixtures[0].matchday!,
      lockAt: new Date(start - 60_000).toISOString(),
      resolveAt: new Date(end + 6 * 3_600_000).toISOString(),
      fixtures: fixtures.map((f) => ({
        id: f.id,
        kickoff: f.kickoff,
        home: team(f.home),
        away: team(f.away),
      })),
    });
  }
  return slates.sort((a, b) => a.lockAt.localeCompare(b.lockAt)).slice(0, 10);
}
export function confirmedResults(raw: Record<string, LiveResult>): Record<string, Result> {
  const out: Record<string, Result> = {};
  for (const [id, r] of Object.entries(raw)) {
    if (
      !r.finished ||
      r.voided ||
      r.postponed ||
      r.suspended ||
      !r.confirmedAt ||
      !Number.isFinite(Date.parse(r.confirmedAt)) ||
      !r.source ||
      !Number.isSafeInteger(r.home) ||
      !Number.isSafeInteger(r.away) ||
      r.home < 0 ||
      r.away < 0
    )
      continue;
    const outcome = r.home === r.away ? 'draw' : r.home > r.away ? 'home' : 'away';
    if (outcome !== r.result) continue;
    out[id] = { outcome, home: r.home, away: r.away, confirmedAt: r.confirmedAt };
  }
  return out;
}
export class SurvivorService {
  constructor(
    private readonly storage: SurvivorStorage,
    private readonly adminWallets: readonly string[],
    private readonly fixtures: () => Match[],
    private readonly observations: () => Record<
      string,
      FixtureObservation | FixtureObservation[]
    > = () => ({}),
  ) {}
  private observationSnapshot(): Record<string, Observation[]> {
    return Object.fromEntries(
      Object.entries(this.observations()).map(([id, value]) => [
        id,
        (Array.isArray(value) ? value : [value]).map((value) => ({
          ...value,
          result: value.result ? (confirmedResults({ [id]: value.result })[id] ?? null) : null,
        })),
      ]),
    );
  }
  isAdmin(actor: Actor) {
    return !!actor && this.adminWallets.includes(actor.wallet);
  }
  private admin(actor: Actor) {
    if (!this.isAdmin(actor))
      throw new SurvivorError('Only the configured competition admin can do this.', 403);
  }
  async read(actor: Actor, selection?: string) {
    const now = Date.now(),
      all = await this.storage.list();
    const competitions = all.filter((c) => c.state !== 'draft' || this.isAdmin(actor));
    const selected = selection ? competitions.find((c) => c.id === selection) : competitions[0];
    const full = selected ? await this.storage.load(selected.id) : null;
    return {
      now: new Date(now).toISOString(),
      viewerId: actor?.id ?? null,
      admin: this.isAdmin(actor),
      slates: this.isAdmin(actor) ? eligibleSlates(this.fixtures(), now) : [],
      competitions: competitions.map((c) => ({
        id: c.id,
        state: c.state,
        terms: c.terms,
        createdAt: c.createdAt,
      })),
      detail: full ? project(full, actor?.id ?? null, now) : null,
    };
  }
  async action(actor: Actor, input: unknown) {
    if (!actor) throw new SurvivorError('Connect and sign in to join Survivor.', 401);
    const body = object(input),
      id = identifier(body.id);
    if (body.action === 'create' || body.action === 'edit') {
      this.admin(actor);
      const terms = parseTerms(body.terms);
      if (
        !Array.isArray(body.roundKeys) ||
        !body.roundKeys.length ||
        body.roundKeys.length > 10 ||
        body.roundKeys.some((k) => typeof k !== 'string')
      )
        throw new SurvivorError('Choose the published round schedule.');
      const keys = body.roundKeys as string[];
      if (new Set(keys).size !== keys.length)
        throw new SurvivorError('Each round can be selected once.');
      const available = eligibleSlates(this.fixtures(), Date.now());
      const slates = keys.map((key) => {
        const slate = available.find((s) => s.key === key);
        if (!slate)
          throw new SurvivorError(
            'A selected round is no longer available. Refresh the schedule.',
            409,
          );
        return slate;
      });
      slates.sort((a, b) => a.lockAt.localeCompare(b.lockAt));
      const revalidate = (now: number) => {
        const fresh = eligibleSlates(this.fixtures(), now);
        if (
          slates.some(
            (s) => JSON.stringify(fresh.find((f) => f.key === s.key)) !== JSON.stringify(s),
          )
        )
          throw new SurvivorError(
            'The schedule changed while saving. Refresh and review the rounds.',
            409,
          );
        return slates;
      };
      if (body.action === 'create')
        await this.storage.create(id, actor.id, (now) =>
          createCompetition(id, actor.id, terms, revalidate(now), now),
        );
      else
        await this.storage.change(id, (c, now) => {
          if (c.state !== 'draft' || c.entries.length)
            throw new SurvivorError('Published terms cannot be edited.', 409);
          Object.assign(c, createCompetition(c.id, c.creator, terms, revalidate(now), now));
        });
    } else if (body.action === 'delete') {
      this.admin(actor);
      await this.storage.remove(id);
      return this.read(actor);
    } else if (body.action === 'publish') {
      this.admin(actor);
      await this.storage.change(id, (c, now) => publish(c, now));
    } else if (body.action === 'join') {
      if (typeof body.termsHash !== 'string')
        throw new SurvivorError('Review the competition terms first.');
      const hash = body.termsHash;
      await this.storage.change(id, (c, now) => join(c, actor.id, actor.name, hash, now));
    } else if (body.action === 'pick') {
      const teamId = identifier(body.teamId);
      if (!Number.isInteger(body.round)) throw new SurvivorError('Choose the current round.');
      const round = Number(body.round);
      await this.storage.change(id, (c, now) => {
        observe(c, this.observationSnapshot(), now);
        savePick(c, actor.id, round, teamId, now);
      });
    } else throw new SurvivorError('Unknown Survivor action.');
    return this.read(actor, id);
  }
  async tick() {
    for (const c of await this.storage.list())
      if (['open', 'running'].includes(c.state))
        try {
          await this.storage.change(c.id, (current, now) => {
            observe(current, this.observationSnapshot(), now);
            advance(current, {}, now);
          });
        } catch (error) {
          // An empty competition may be deleted after this worker lists it.
          if (!(error instanceof SurvivorError) || error.status !== 404) throw error;
        }
  }
}
