import type { Match } from '../../types';
import type { FixtureObservation, LiveResult } from '../../providers/types';
import {
  advance,
  cancel,
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
import type { SurvivorPrizes } from './prizes';

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
export function eligibleSlates(
  matches: Match[],
  now: number,
  deadlines?: ReadonlyMap<number, string>,
): Slate[] {
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
    const gameweek = Number(fixtures[0].matchday?.match(/(\d+)$/)?.[1]);
    const lock = deadlines ? Date.parse(deadlines.get(gameweek) ?? '') : start - 90 * 60_000;
    if (!Number.isFinite(lock) || lock <= now || lock >= start || end - start > 7 * 86_400_000)
      continue;
    slates.push({
      key,
      label: fixtures[0].matchday!,
      lockAt: new Date(lock).toISOString(),
      resolveAt: new Date(end + 6 * 3_600_000).toISOString(),
      fixtures: fixtures.map((f) => ({
        id: f.id,
        kickoff: f.kickoff,
        home: team(f.home),
        away: team(f.away),
      })),
    });
  }
  return slates.sort((a, b) => a.lockAt.localeCompare(b.lockAt)).slice(0, 38);
}
export function confirmedResults(raw: Record<string, LiveResult>): Record<string, Result> {
  const out: Record<string, Result> = {};
  for (const [id, r] of Object.entries(raw)) {
    if (
      !r.finished ||
      r.live ||
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
    private readonly fixtures: () => Match[] | Promise<Match[]>,
    private readonly observations: () => Record<
      string,
      FixtureObservation | FixtureObservation[]
    > = () => ({}),
    private readonly testing = false,
    private readonly deadlines?: () => Promise<ReadonlyMap<number, string>>,
    private readonly prizes?: SurvivorPrizes,
    private readonly prizeConfigurationError = '',
  ) {}
  private async slates(now: number) {
    const [matches, deadlines] = await Promise.all([this.fixtures(), this.deadlines?.()]);
    return eligibleSlates(matches, now, deadlines).map((slate) =>
      this.testing ? { ...slate, testingPolicy: 'admin-controlled-v1' as const } : slate,
    );
  }
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
    const priority = { open: 0, running: 1, draft: 2, complete: 3, cancelled: 4 };
    const competitions = all
      .filter((c) => c.state !== 'draft' || this.isAdmin(actor))
      .sort((a, b) => priority[a.state] - priority[b.state]);
    const selected = selection ? competitions.find((c) => c.id === selection) : competitions[0];
    const full = selected ? await this.storage.load(selected.id) : null;
    let slates: Slate[] = [],
      scheduleError = '';
    if (this.isAdmin(actor))
      try {
        slates = await this.slates(now);
      } catch {
        scheduleError =
          'Upcoming gameweeks are temporarily unavailable. Saved competitions remain available.';
      }
    return {
      now: new Date(now).toISOString(),
      viewerId: actor?.id ?? null,
      admin: this.isAdmin(actor),
      slates,
      scheduleError,
      fundingAvailable: this.prizes ? await this.prizes.rewards.active().catch(() => false) : false,
      fundingError: this.isAdmin(actor) ? this.prizeConfigurationError : '',
      rewards:
        actor && this.prizes
          ? await this.prizes.rewards.account(actor.wallet).catch(() => null)
          : null,
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
        body.roundKeys.length > 38 ||
        body.roundKeys.some((k) => typeof k !== 'string')
      )
        throw new SurvivorError('Choose the published round schedule.');
      const keys = body.roundKeys as string[];
      if (new Set(keys).size !== keys.length)
        throw new SurvivorError('Each round can be selected once.');
      const available = await this.slates(Date.now());
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
        const fresh = available.filter((s) => Date.parse(s.lockAt) > now);
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
          createCompetition(id, actor.id, terms, revalidate(now), now, actor.wallet),
        );
      else
        await this.storage.change(id, (c, now) => {
          if (c.state !== 'draft' || c.entries.length)
            throw new SurvivorError('Published terms cannot be edited.', 409);
          if (c.prizeFunding?.signedBytes)
            throw new SurvivorError(
              'A funded draft cannot be edited. Cancel it to return the prize, then create a new competition.',
              409,
            );
          if (!c.creatorWallet && c.creator !== actor.id)
            throw new SurvivorError(
              'The original creator must update this older draft before funding.',
              403,
            );
          const replacement = createCompetition(
            c.id,
            c.creator,
            terms,
            revalidate(now),
            now,
            c.creatorWallet ?? actor.wallet,
          );
          delete c.prizeFunding;
          Object.assign(c, replacement);
        });
    } else if (body.action === 'delete') {
      this.admin(actor);
      const existing = await this.storage.load(id);
      if (existing?.prizeFunding?.signedBytes)
        throw new SurvivorError(
          'Use Cancel and refund to retain the funded competition record.',
          409,
        );
      await this.storage.remove(id);
      return this.read(actor);
    } else if (body.action === 'publish') {
      this.admin(actor);
      const candidate = await this.storage.load(id);
      if (candidate?.fundingPolicy && BigInt(candidate.terms.prizeShannons) > 0n) {
        if (!this.prizes) throw new SurvivorError('Prize funding is not configured.', 503);
        await this.prizes.verify(id);
      }
      await this.storage.change(id, (c, now) => {
        if (
          c.termsHash !== candidate?.termsHash ||
          c.prizeFunding?.transactionHash !== candidate?.prizeFunding?.transactionHash
        )
          throw new SurvivorError('The competition changed. Review it before publishing.', 409);
        publish(c, now);
      });
    } else if (body.action === 'prepare-prize' || body.action === 'fund-prize') {
      this.admin(actor);
      if (!this.prizes)
        throw new SurvivorError(
          this.prizeConfigurationError || 'Prize funding is not configured.',
          503,
        );
      if (body.action === 'prepare-prize')
        await this.prizes.prepare(actor, id, body.custodyAccepted);
      else await this.prizes.submit(actor, id, body.sponsorId, body.signedBytes);
    } else if (body.action === 'resolve-prize-conflict') {
      this.admin(actor);
      if (!this.prizes) throw new SurvivorError('Prize funding is not configured.', 503);
      const c = await this.storage.load(id);
      if (!c || c.creator !== actor.id || c.creatorWallet !== actor.wallet)
        throw new SurvivorError('Only the creator can recover this payment.', 403);
      await this.prizes.funding.resolveConflict(actor, `survivor.${id}`, {
        sponsorId: c.prizeFunding?.id,
        conflictingHash: body.conflictingHash,
      });
    } else if (body.action === 'cancel-prize') {
      this.admin(actor);
      await this.storage.change(id, (c, now) => {
        if (c.state === 'cancelled') return;
        if (c.entries.length || !['draft', 'open'].includes(c.state))
          throw new SurvivorError('Competitions with entrants retain their published rules.', 409);
        cancel(
          c,
          now,
          'Creator prize cancelled before entrants joined. Confirmed funds return to the creator.',
        );
      });
    } else if (body.action === 'collect-prize') {
      if (!this.prizes) throw new SurvivorError('Prize delivery is not configured.', 503);
      await this.prizes.rewards.request(actor.wallet);
    } else if (body.action === 'join') {
      if (typeof body.termsHash !== 'string')
        throw new SurvivorError('Review the competition terms first.');
      const hash = body.termsHash;
      await this.storage.change(id, (c, now) =>
        join(c, actor.id, actor.name, hash, now, actor.wallet),
      );
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
