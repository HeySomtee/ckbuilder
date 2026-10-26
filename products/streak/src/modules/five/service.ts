import { lockTime, finalizationTime } from './timing';
import { isDeepStrictEqual } from 'node:util';
import { closeAuction, isAuction } from './auction';
import {
  affordableSquad,
  allocate,
  FiveError,
  fundedPool,
  identifier,
  integer,
  newRound,
  normalizeStats,
  object,
  parseTerms,
  project,
  saveEntry,
  scorePlayer,
  standings,
  text,
  type Score,
  type Stats,
  type Terms,
} from './domain';
import type { FplSeason, ScoutData, PlayerProfile, FixtureSchedule } from './scouting';
import type { FiveStorage } from './storage';
import type { FiveFunding } from './funding';
import type { FiveRewards } from './rewards';
export type Actor = { id: string; name: string; wallet: string } | null;
export interface FiveFeed {
  available: boolean;
  catalogue(event: number): Promise<Terms>;
  season?(): Promise<FplSeason>;
  scouting?(): Promise<ScoutData>;
  schedule?(): Promise<FixtureSchedule>;
  profile?(id: number): Promise<PlayerProfile>;
  results(
    event: number,
    terms: Terms,
  ): Promise<{
    stats: Record<string, unknown>;
    source: string;
    complete: boolean;
    finalizeNotBefore?: number;
  }>;
}
export class FiveService {
  private syncing = false;
  private roundCursor = '';
  private automationState = { state: 'checking', lastSyncedAt: null as string | null, message: '' };
  constructor(
    private readonly store: FiveStorage,
    private readonly admins: readonly string[],
    private readonly feed?: FiveFeed,
    private readonly funding?: FiveFunding,
    private readonly rewards?: FiveRewards,
    readonly automatic = false,
  ) {}

  private async updateScores(
    id: string,
    current: import('./domain').Round,
    data: { stats: Record<string, unknown>; source: string; complete: boolean },
  ) {
    const { stats: raw, source, complete } = data;
    if (Object.keys(raw).length > 1000) throw new FiveError('Too many score records.');
    const scores: Record<string, Score> = {};
    const normalized: Record<string, Stats> = {};
    for (const [playerId, value] of Object.entries(raw)) {
      identifier(playerId);
      const player = current.terms.players.find((p) => p.id === playerId);
      if (!player) throw new FiveError('The score update includes an unknown player.');
      normalized[playerId] = normalizeStats(value);
      scores[playerId] = scorePlayer(player.position, normalized[playerId]);
    }
    await this.store.change(id, (r, now) => {
      if (r.state !== 'open' || now < lockTime(r))
        throw new FiveError('Scores can only update after the gameweek locks.', 409);
      if (r.revision !== current.revision)
        throw new FiveError('The gameweek changed. Refresh scores again.', 409);
      if (r.scoreRevision >= 2048) throw new FiveError('Score revision limit reached.', 409);
      if (r.rulesVersion !== 1)
        throw new FiveError('This round uses an unsupported scoring version.', 409);
      r.scores = scores;
      r.rawStats = normalized;
      r.scoreSource = source;
      r.scoresAt = new Date(now).toISOString();
      r.scoresComplete = complete;
      r.scoreRevision++;
    });
  }
  private async finalize(id: string, revision: unknown) {
    await this.funding?.verifyConfirmed(id);
    await this.store.change(id, (r, now) => {
      if (r.state === 'final') return;
      // Unsponsored free rounds must still finish when no rewards worker is configured.
      if (
        isAuction(r) &&
        !r.auction &&
        !r.sponsors.some((s) => s.funding === 'confirmed' || s.funding === 'submitted')
      )
        closeAuction(r, now);
      if (isAuction(r) && !r.auction)
        throw new FiveError(
          'The sponsor auction is still settling. Prize allocation will retry.',
          409,
        );
      if (BigInt(fundedPool(r)) > 0n && !this.funding)
        throw new FiveError('Prize backing must be verified before finalizing.', 503);
      if (r.state !== 'open' || now < finalizationTime(r))
        throw new FiveError('The correction window has not closed.', 409);
      if (revision !== r.revision)
        throw new FiveError('Scores changed. Review the latest standings.', 409);
      if (!isAuction(r) && r.sponsors.some((s) => s.funding === 'submitted'))
        throw new FiveError('Wait for submitted contributions to confirm before finalizing.', 409);
      if (!r.scoresComplete || !r.scoresAt || Date.parse(r.scoresAt) < finalizationTime(r))
        throw new FiveError(
          'Refresh the final scores after the correction window before finalizing.',
          409,
        );
      const result = allocate(fundedPool(r), standings(r), r.terms.qualifyingBps);
      r.rewards = result.rewards;
      r.state = 'final';
      r.finalizedAt = new Date(now).toISOString();
    });
  }
  async scouting() {
    if (!this.feed?.scouting)
      throw new FiveError('Player scouting is unavailable. Your squad is saved.', 503);
    return this.feed.scouting();
  }
  async player(id: number) {
    if (!this.feed?.profile)
      throw new FiveError('Player history is unavailable. Please retry.', 503);
    return this.feed.profile(id);
  }
  async schedule() {
    if (!this.feed?.schedule)
      throw new FiveError('Fixture outlook is temporarily unavailable.', 503);
    return this.feed.schedule();
  }
  async progress() {
    if (!this.automatic || !this.feed?.available || !this.feed.season || this.syncing) return;
    this.syncing = true;
    try {
      const season = await this.feed.season(),
        now = await this.store.clock();
      const next = season.events
        .filter((e) => !e.finished && Date.parse(e.deadline) > now + 60000)
        .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))[0];
      let delayed = false;
      if (next) {
        try {
          const id = 'fpl-' + season.season + '-' + next.id;
          if (!(await this.store.load(id))) {
            const terms = parseTerms({
              ...(await this.feed.catalogue(next.id)),
              sponsorship: true,
              sponsorshipMode: 'auction',
            });
            if (!affordableSquad(terms.players))
              throw new FiveError('Player prices cannot form a legal squad.', 503);
            await this.store.create(id, 'fpl-scheduler', (time) => {
              const round = newRound(id, 'fpl-scheduler', terms, time);
              round.state = 'open';
              return round;
            });
          }
        } catch {
          delayed = true;
        }
      }
      const pending = (await this.store.list())
        .filter(
          (r) =>
            r.state === 'open' &&
            r.id.startsWith('fpl-' + season.season + '-') &&
            Date.parse(r.lockAt) <= now,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const pivot = pending.findIndex((r) => r.id > this.roundCursor);
      const start = pivot < 0 ? 0 : pivot;
      const rounds = [...pending.slice(start), ...pending.slice(0, start)].slice(0, 6);
      for (const summary of rounds) {
        this.roundCursor = summary.id;
        try {
          const current = await this.store.load(summary.id);
          if (!current || current.creator !== 'fpl-scheduler') continue;
          const event = season.events.find(
            (e) => String(e.id) === /^FPL event (\d+)$/.exec(current.terms.source)?.[1],
          );
          if (!event) {
            delayed = true;
            continue;
          }
          const data = await this.feed.results(event.id, current.terms);
          // Save changes only, plus one fresh complete observation after the correction window.
          const normalized = Object.fromEntries(
            Object.entries(data.stats).map(([id, v]) => [id, normalizeStats(v)]),
          );
          if (
            !isDeepStrictEqual(normalized, current.rawStats) ||
            data.complete !== current.scoresComplete ||
            (data.complete &&
              now >= finalizationTime(current) &&
              (!current.scoresAt || Date.parse(current.scoresAt) < finalizationTime(current)))
          ) {
            await this.updateScores(current.id, current, data);
          }
          const latest = await this.store.load(current.id);
          if (
            latest &&
            event.finished &&
            event.checked &&
            Number.isSafeInteger(data.finalizeNotBefore) &&
            now >= data.finalizeNotBefore! &&
            latest.scoresComplete &&
            now >= finalizationTime(latest)
          )
            await this.finalize(latest.id, latest.revision);
        } catch {
          delayed = true;
        }
      }
      this.automationState = {
        state: delayed ? 'delayed' : 'ready',
        lastSyncedAt: new Date(now).toISOString(),
        message: delayed
          ? 'Some results are awaiting verified data. Saved squads and points are retained.'
          : '',
      };
    } catch {
      this.automationState = {
        ...this.automationState,
        state: 'delayed',
        message: 'The EPL feed is taking longer to update. Saved squads and points are retained.',
      };
    } finally {
      this.syncing = false;
    }
  }

  isAdmin(actor: Actor) {
    return !!actor && this.admins.includes(actor.wallet);
  }
  private admin(actor: Actor) {
    if (!this.isAdmin(actor))
      throw new FiveError('Only the configured gameweek admin can do this.', 403);
  }
  async read(actor: Actor, selection?: string) {
    const admin = this.isAdmin(actor),
      all = (await this.store.list()).filter((r) => admin || r.state !== 'draft');
    const now = await this.store.clock();
    const upcoming = all
      .filter((r) => r.state === 'open' && Date.parse(r.lockAt) > now)
      .sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt));
    const chosen = selection ? all.find((r) => r.id === selection) : (upcoming[0] ?? all[0]);
    if (selection && !chosen) throw new FiveError('Gameweek not found.', 404);
    const round = chosen ? await this.store.load(chosen.id) : null;
    const detail = round ? project(round, actor?.id ?? null, admin, now) : null;
    if (round && detail && actor && this.rewards && isAuction(round)) {
      const refunds = await this.rewards.refundStates(round.id, actor.wallet);
      for (const s of detail.ownSponsorships)
        s.auctionOutcome = refunds.get(s.id) ?? s.auctionOutcome;
    }
    return {
      automation: { enabled: this.automatic, ...this.automationState },
      now: new Date(now).toISOString(),
      admin,
      viewerId: actor?.id ?? null,
      rounds: all,
      feedAvailable: this.feed?.available ?? false,
      fundingAvailable: !!this.funding && !!this.rewards && (await this.rewards.active()),
      rewardsAccount: actor && this.rewards ? await this.rewards.account(actor.wallet) : null,
      detail,
    };
  }
  async action(actor: Actor, input: unknown) {
    if (!actor) throw new FiveError('Sign in to save your five or sponsor a gameweek.', 401);
    const b = object(input),
      id = identifier(b.id);
    if (b.action === 'create' || b.action === 'edit' || b.action === 'import') {
      this.admin(actor);
      let terms: Terms;
      if (b.action === 'import') {
        if (!this.feed?.available)
          throw new FiveError(
            'The player feed has not been enabled. Configure approved data access first.',
            503,
          );
        terms = parseTerms(await this.feed.catalogue(integer(b.event, 1, 38)));
      } else terms = parseTerms(b.terms);
      if (b.action === 'edit')
        await this.store.change(id, (r, now) => {
          if (r.state !== 'draft' || r.entries.length || r.sponsors.length)
            throw new FiveError('Published gameweek rules cannot be edited.', 409);
          if (b.revision !== r.revision)
            throw new FiveError('This draft changed. Refresh before editing.', 409);
          Object.assign(r, newRound(id, r.creator, terms, now), {
            revision: r.revision,
            createdAt: r.createdAt,
          });
        });
      else await this.store.create(id, actor.id, (now) => newRound(id, actor.id, terms, now));
    } else if (b.action === 'publish') {
      this.admin(actor);
      await this.store.change(id, (r, now) => {
        if (r.state !== 'draft') return;
        if (b.termsHash !== r.termsHash)
          throw new FiveError('Review the current draft before publishing.', 409);
        if (lockTime(r) <= now + 60_000)
          throw new FiveError('The entry deadline is too close.', 409);
        if (!affordableSquad(r.terms.players))
          throw new FiveError('This catalogue cannot form a legal squad within 40 credits.');
        r.state = 'open';
      });
    } else if (b.action === 'enter') {
      await this.store.change(id, (r, now) =>
        saveEntry(r, actor, b.players, b.captain, b.termsHash, now),
      );
    } else if (b.action === 'sponsor') {
      if (!this.funding || !this.rewards || !(await this.rewards.active()))
        throw new FiveError(
          'Sponsorship transfers are not activated yet. No payment has been requested.',
          503,
        );
      await this.funding.intent(actor, id, b);
    } else if (b.action === 'fund') {
      if (!this.funding)
        throw new FiveError(
          'Rewards delivery is unavailable. Your contribution remains recoverable.',
          503,
        );
      await this.funding.submit(actor, id, b);
    } else if (b.action === 'claim') {
      if (!this.rewards) throw new FiveError('Rewards delivery is unavailable.', 503);
      await this.rewards.request(actor.wallet);
    } else if (b.action === 'resolveContribution') {
      if (!this.funding) throw new FiveError('Rewards delivery is unavailable.', 503);
      await this.funding.resolveConflict(actor, id, b);
    } else if (b.action === 'cancel') {
      this.admin(actor);
      const reason = text(b.reason, 240);
      if (!reason) throw new FiveError('Explain why this gameweek is cancelled.');
      await this.store.change(id, (r) => {
        if (r.state === 'final')
          throw new FiveError('Finalized gameweeks cannot be cancelled.', 409);
        r.state = 'cancelled';
        r.cancellationReason = reason;
      });
    } else if (b.action === 'moderate') {
      this.admin(actor);
      const sponsorId = identifier(b.sponsorId);
      if (!['approved', 'hidden'].includes(String(b.state)))
        throw new FiveError('Choose approve or hide.');
      await this.store.change(id, (r) => {
        const sponsor = r.sponsors.find((s) => s.id === sponsorId);
        if (!sponsor) throw new FiveError('Sponsor not found.', 404);
        sponsor.moderation = b.state as 'approved' | 'hidden';
      });
    } else if (b.action === 'scores' || b.action === 'sync') {
      this.admin(actor);
      const current = await this.store.load(id);
      if (!current) throw new FiveError('Gameweek not found.', 404);
      let raw: Record<string, unknown>,
        source: string,
        complete = false;
      if (b.action === 'sync') {
        if (!this.feed?.available) throw new FiveError('Player scoring feed is unavailable.', 503);
        const event = /^FPL event (\d+)$/.exec(current.terms.source)?.[1];
        if (!event)
          throw new FiveError('This gameweek uses an imported catalogue, not the FPL adapter.');
        const data = await this.feed.results(Number(event), current.terms);
        raw = data.stats;
        source = data.source;
        complete = data.complete;
      } else {
        raw = object(b.stats);
        source = text(b.source, 240);
        complete = b.complete === true;
        if (!source) throw new FiveError('Identify the score source.');
      }
      await this.updateScores(id, current, { stats: raw, source, complete });
    } else if (b.action === 'finalize') {
      this.admin(actor);
      await this.finalize(id, b.revision);
    } else throw new FiveError('Unknown Streak Five action.');
    return this.read(actor, id);
  }
}
