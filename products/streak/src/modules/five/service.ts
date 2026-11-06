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
  type Round,
} from './domain';
import type { FplSeason, ScoutData, PlayerProfile, FixtureSchedule } from './scouting';
import type { FiveStorage } from './storage';
import type { FiveFunding } from './funding';
import type { FiveRewards } from './rewards';
import type { FiveProfile, FiveProfiles } from './profile';
export type Actor = { id: string; name: string; wallet: string } | null;
export interface FiveFeed {
  available: boolean;
  catalogue(event: number): Promise<Terms>;
  season?(): Promise<FplSeason>;
  scouting?(): Promise<ScoutData>;
  schedule?(): Promise<FixtureSchedule>;
  profile?(id: number): Promise<PlayerProfile>;
  nextUpdateAt?(): Promise<number>;
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
  private progressDelay = 60_000;
  nextProgressDelay(): number {
    return this.progressDelay;
  }
  private automationState = { state: 'checking', lastSyncedAt: null as string | null, message: '' };
  constructor(
    private readonly store: FiveStorage,
    private readonly admins: readonly string[],
    private readonly feed?: FiveFeed,
    private readonly funding?: FiveFunding,
    private readonly rewards?: FiveRewards,
    readonly automatic = false,
    private readonly profiles?: FiveProfiles,
  ) {}

  /** Internal read port; campaign integration cannot mutate the gameweek aggregate. */
  get campaignStore(): Pick<FiveStorage, 'load' | 'clock' | 'list' | 'subscribe'> {
    return this.store;
  }

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
  private async scheduledSeason() {
    if (!this.automatic || !this.feed?.available || !this.feed.season)
      throw new FiveError(
        'Automatic EPL gameweeks must be enabled before preparing a gameweek.',
        503,
      );
    const [season, now] = await Promise.all([this.feed.season(), this.store.clock()]);
    if (
      !/^\d{4}$/.test(season.season) ||
      !Array.isArray(season.events) ||
      !season.events.length ||
      season.events.length > 38 ||
      new Set(season.events.map((event) => event.id)).size !== season.events.length ||
      season.events.some(
        (event) =>
          !Number.isSafeInteger(event.id) ||
          event.id < 1 ||
          event.id > 38 ||
          !Number.isFinite(Date.parse(event.deadline)),
      )
    )
      throw new FiveError('The official gameweek schedule is incomplete. Please retry.', 503);
    return { season, now };
  }

  /** Real future FPL events; reading the list never opens or freezes a player pool. */
  async upcomingGameweeks(): Promise<
    Array<{ id: string; event: number; name: string; lockAt: string }>
  > {
    const { season, now } = await this.scheduledSeason();
    return season.events
      .filter((event) => !event.finished && Date.parse(event.deadline) > now + 60_000)
      .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
      .map((event) => ({
        id: `fpl-${season.season}-${event.id}`,
        event: event.id,
        name: event.name,
        lockAt: new Date(event.deadline).toISOString(),
      }));
  }

  private async ensureScheduledGameweek(
    season: FplSeason,
    event: FplSeason['events'][number],
  ): Promise<Round> {
    const id = `fpl-${season.season}-${event.id}`;
    const matches = (round: Round) =>
      round.id === id &&
      round.creator === 'fpl-scheduler' &&
      !round.terms.testingPolicy &&
      round.terms.source === `FPL event ${event.id}` &&
      Date.parse(round.terms.lockAt) === Date.parse(event.deadline);
    const previous = await this.store.load(id);
    if (previous) {
      if (!matches(previous))
        throw new FiveError(
          'This saved gameweek differs from the official schedule. Review it before continuing.',
          409,
        );
      return previous;
    }
    const catalogue = await this.feed!.catalogue(event.id);
    if (catalogue.testingPolicy)
      throw new FiveError('Test player pools cannot prepare an official EPL gameweek.', 409);
    const terms = parseTerms({
      ...catalogue,
      sponsorship: true,
      sponsorshipMode: 'auction',
    });
    if (
      terms.testingPolicy ||
      terms.source !== `FPL event ${event.id}` ||
      Date.parse(terms.lockAt) !== Date.parse(event.deadline)
    )
      throw new FiveError(
        'The player pool does not match this official gameweek. Please retry.',
        503,
      );
    if (!affordableSquad(terms.players))
      throw new FiveError('Player prices cannot form a legal squad.', 503);
    const round = await this.store.create(id, 'fpl-scheduler', (time) => {
      if (Date.parse(terms.lockAt) <= time + 60_000)
        throw new FiveError('The official gameweek deadline is too close.', 409);
      const created = newRound(id, 'fpl-scheduler', terms, time);
      created.state = 'open';
      return created;
    });
    if (!matches(round))
      throw new FiveError('The saved gameweek changed during preparation. Please refresh.', 409);
    return round;
  }

  /** Caller must authorize the administrator before invoking this preparation port. */
  async prepareGameweek(event: number): Promise<void> {
    integer(event, 1, 38);
    const { season, now } = await this.scheduledSeason();
    const selected = season.events.find((item) => item.id === event);
    if (!selected || selected.finished || Date.parse(selected.deadline) <= now + 60_000)
      throw new FiveError('Choose an upcoming official gameweek with time left to enter.', 409);
    const round = await this.ensureScheduledGameweek(season, selected);
    if (round.state !== 'open')
      throw new FiveError(
        'This gameweek is already closed or cancelled and cannot be reopened.',
        409,
      );
  }

  async progress() {
    if (!this.automatic || !this.feed?.available || !this.feed.season || this.syncing) return;
    this.syncing = true;
    this.progressDelay = 60_000;
    try {
      const { season, now } = await this.scheduledSeason();
      const next = season.events
        .filter((e) => !e.finished && Date.parse(e.deadline) > now + 60000)
        .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))[0];
      let delayed = false;
      if (next) {
        try {
          await this.ensureScheduledGameweek(season, next);
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
      let nextAt = Math.min(
        now + 15 * 60_000,
        ...season.events.map((event) => Date.parse(event.deadline)).filter((at) => at > now),
      );
      if (pending.length)
        nextAt = Math.min(
          nextAt,
          this.feed.nextUpdateAt ? await this.feed.nextUpdateAt() : now + 60_000,
        );
      const pivot = pending.findIndex((r) => r.id > this.roundCursor);
      const start = pivot < 0 ? 0 : pivot;
      const rounds = [...pending.slice(start), ...pending.slice(0, start)].slice(0, 6);
      for (const summary of rounds) {
        this.roundCursor = summary.id;
        try {
          const current = await this.store.load(summary.id);
          if (!current || current.creator !== 'fpl-scheduler') continue;
          if (finalizationTime(current) > now) nextAt = Math.min(nextAt, finalizationTime(current));
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
      this.progressDelay = delayed ? 60_000 : Math.max(1000, nextAt - now);
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
  async profile(actor: Actor) {
    if (!actor) throw new FiveError('Sign in to choose your FPL name.', 401);
    if (!this.profiles)
      throw new FiveError('FPL names are temporarily unavailable. Please retry.', 503);
    return this.profiles.get(actor.id);
  }
  async saveProfile(actor: Actor, displayName: unknown) {
    if (!actor) throw new FiveError('Sign in to choose your FPL name.', 401);
    if (!this.profiles)
      throw new FiveError('FPL names are temporarily unavailable. Please retry.', 503);
    return this.profiles.save(actor.id, displayName);
  }
  async requireProfile(actor: Actor): Promise<string> {
    const profile = await this.profile(actor);
    if (!profile) throw new FiveError('Choose your FPL name before saving your five.', 409);
    return profile.displayName;
  }
  /** Internal public-label projection; profile timestamps and account IDs stay server-side. */
  async publicProfileNames(accountIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (accountIds.length > 1000) throw new FiveError('Too many manager profiles requested.');
    if (!this.profiles)
      throw new FiveError('FPL names are temporarily unavailable. Please retry.', 503);
    const profiles = await this.profiles.getMany(accountIds);
    return new Map([...profiles].map(([id, profile]) => [id, profile.displayName]));
  }
  async read(actor: Actor, selection?: string) {
    const admin = this.isAdmin(actor),
      all = (await this.store.list()).filter((r) => admin || r.state !== 'draft');
    const now = await this.store.clock();
    const upcoming = all
      .filter((r) => r.state === 'open' && Date.parse(r.lockAt) > now)
      .sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt));
    // Opening next week's editor must not replace the team whose matches are playing.
    const current = all
      .filter((r) => ['open', 'final'].includes(r.state) && Date.parse(r.lockAt) <= now)
      .sort((a, b) => Date.parse(b.lockAt) - Date.parse(a.lockAt))[0];
    const chosen = selection
      ? all.find((r) => r.id === selection)
      : (current ?? upcoming[0] ?? all[0]);
    if (selection && !chosen) throw new FiveError('Gameweek not found.', 404);
    const round = chosen ? await this.store.load(chosen.id) : null;
    const detail = round ? project(round, actor?.id ?? null, admin, now) : null;
    const [profile, names] = await Promise.all([
      actor && this.profiles ? this.profiles.get(actor.id) : null,
      round && this.profiles
        ? this.profiles.getMany(round.entries.map((entry) => entry.accountId))
        : new Map<string, FiveProfile>(),
    ]);
    if (round && detail) {
      const publicNames = new Map(
        round.entries.map((entry) => [
          entry.publicId,
          names.get(entry.accountId)?.displayName ?? entry.name,
        ]),
      );
      for (const entry of detail.entries) entry.name = publicNames.get(entry.id) ?? entry.name;
      for (const row of detail.standings) row.name = publicNames.get(row.id) ?? row.name;
    }
    if (round && detail && actor && this.rewards && isAuction(round)) {
      const [refunds, workerAvailable] = await Promise.all([
        this.rewards.refundStates(round.id, actor.wallet),
        this.rewards.active(),
      ]);
      for (const s of detail.ownSponsorships)
        s.auctionOutcome = refunds.get(s.id) ?? s.auctionOutcome;
      detail.sponsorRefund = await this.rewards.sponsorRefund(round, actor.wallet, workerAvailable);
    }
    return {
      automation: { enabled: this.automatic, ...this.automationState },
      now: new Date(now).toISOString(),
      admin,
      viewerId: actor?.id ?? null,
      profile,
      rounds: all,
      currentRoundId: current?.id ?? null,
      nextRoundId: upcoming[0]?.id ?? null,
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
      const name = await this.requireProfile(actor);
      await this.store.change(id, (r, now) =>
        saveEntry(r, { ...actor, name }, b.players, b.captain, b.termsHash, now),
      );
    } else if (b.action === 'sponsor' || b.action === 'revise-sponsor') {
      if (!this.funding || !this.rewards || !(await this.rewards.active()))
        throw new FiveError(
          'Sponsorship transfers are not activated yet. No payment has been requested.',
          503,
        );
      if (b.action === 'revise-sponsor') await this.funding.revise(actor, id, b);
      else await this.funding.intent(actor, id, b);
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
