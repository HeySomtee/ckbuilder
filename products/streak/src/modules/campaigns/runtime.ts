import { Pool } from 'pg';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { read } from '../../store';
import { getPool, pgEnabled } from '../../store_pg';
import { provider } from '../../providers';
import { activityService } from '../activity/runtime';
import { fiveService } from '../five/runtime';
import { lockTime, TEST_TIMING_POLICY } from '../five/timing';
import { V4_DIRECT_CONFIG } from '../direct/registry';
import { sponsorProxy } from '../direct/sponsor-proxy';
import { CampaignError } from './domain';
import { CampaignService } from './service';
import { PgCampaignStorage, campaignCheckDelay } from './storage';
import { campaignMarketPin, createCampaignSources } from './sources';
import { validateCampaignAddress } from './payout-proof';
import type { CampaignOptions } from '../../../shared/campaign-wire';
import { presentCampaignFixtures } from './fixture-presentation';

let instance: CampaignService | undefined;
let storage: PgCampaignStorage | undefined;
let reconciling: Promise<void> | undefined;
let lastDrainFailed = false;

/** Uses the same real fixture catalogue and Five rounds as the ordinary game pages. */
export async function campaignOptions(): Promise<CampaignOptions> {
  const now = Date.now();
  const fixtures = await read((db) =>
    db.markets.flatMap((market) => {
      const match = db.matches.find((row) => row.id === market.matchId);
      if (
        !match ||
        provider.ownsMatch?.(match) !== true ||
        match.oracle?.provider !== 'api-football' ||
        match.status !== 'scheduled' ||
        market.status !== 'open' ||
        Date.parse(market.closesAt) <= now ||
        Date.parse(market.closesAt) !== Date.parse(match.kickoff) ||
        Date.parse(match.kickoff) <= now
      )
        return [];
      return [
        {
          fixtureId: match.id,
          marketId: market.id,
          marketKey: campaignMarketPin(match.id),
          home: match.home.name,
          away: match.away.name,
          league: match.competition?.name ?? match.stage,
          kickoffAt: match.kickoff,
          cutoffAt: market.closesAt,
          capacity: V4_DIRECT_CONFIG.limits.shards * V4_DIRECT_CONFIG.limits.recordsPerShard,
          occupied: null,
          updatedAt: null,
        },
      ];
    }),
  );
  let gameweeks: CampaignOptions['gameweeks'] = [];
  try {
    const five = fiveService();
    const store = five.campaignStore;
    const existing = await store.list();
    const upcoming = existing.filter((r) => r.state === 'open' && Date.parse(r.lockAt) > now);
    const rounds = await Promise.all(upcoming.map((r) => store.load(r.id)));
    gameweeks = rounds.flatMap((r) =>
      !r || r.state !== 'open' || lockTime(r) <= now || r.terms.testingPolicy === TEST_TIMING_POLICY
        ? []
        : [
            {
              id: r.id,
              name: r.terms.name,
              lockAt: new Date(lockTime(r)).toISOString(),
              state: r.state,
            },
          ],
    );
    const prepared = new Set(existing.map((r) => r.id));
    const official = await five.upcomingGameweeks();
    gameweeks.push(
      ...official.filter((r) => !prepared.has(r.id)).map((r) => ({ ...r, state: 'available' })),
    );
    gameweeks.sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt));
  } catch {
    // Prediction setup remains usable if Five is not configured. Never substitute demo rounds.
  }
  return { fixtures, gameweeks };
}

export function campaignService(): CampaignService {
  if (instance) return instance;
  const database =
    process.env.STREAK_CAMPAIGNS_DATABASE_URL ??
    process.env.STREAK_FIVE_DATABASE_URL ??
    process.env.STREAK_SURVIVOR_DATABASE_URL;
  if (!database && !pgEnabled())
    throw new CampaignError('Competitions need a persistent database connection.', 503);
  const admins = (
    process.env.STREAK_CAMPAIGNS_ADMIN_WALLETS ??
    process.env.STREAK_FIVE_ADMIN_WALLETS ??
    process.env.STREAK_SURVIVOR_ADMIN_WALLETS ??
    ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (admins.length > 10 || admins.some((a) => !/^ckt1[a-z0-9]{20,250}$/.test(a)))
    throw new CampaignError('Competition administrator configuration needs attention.', 503);
  const pool = database
    ? new Pool({
        ...postgresConfig(database),
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      })
    : getPool();
  if (database) pool.on('error', () => console.warn('[campaigns] database connection interrupted'));
  storage = new PgCampaignStorage(pool);
  instance = new CampaignService(
    storage,
    admins,
    createCampaignSources({
      activity: () => activityService()?.store,
      five: () => fiveService().campaignStore,
      options: campaignOptions,
      absence: (fixtures) => sponsorProxy('/campaign/absence', { fixtures }),
      validateReceivingAddress: validateCampaignAddress,
    }),
    (actor) => fiveService().requireProfile(actor),
    (accountIds) => fiveService().publicProfileNames(accountIds),
    (fixtures) =>
      read((db) =>
        presentCampaignFixtures(fixtures, db.markets, db.matches, (match) =>
          provider.peekInsights?.(match),
        ),
      ),
  );
  return instance;
}

/** Persisted due times survive restarts; events advance only the affected game kind. */
export function reconcileCampaigns(): Promise<void> {
  if (reconciling) return reconciling;
  reconciling = Promise.resolve()
    .then(async () => {
      lastDrainFailed = false;
      const service = campaignService();
      const jobs = await storage!.dueJobs(8);
      for (const job of jobs) {
        try {
          const campaign = await service.reconcile(job.id);
          await storage!.defer(job, campaignCheckDelay(campaign, Date.now()));
        } catch {
          await storage!.defer(job, 60_000);
          console.warn('[campaigns] verification deferred; saved standings retained');
        }
      }
    })
    .catch(() => {
      lastDrainFailed = true;
      console.warn('[campaigns] background refresh unavailable');
    })
    .finally(() => {
      reconciling = undefined;
    });
  return reconciling;
}

export function startCampaigns(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let requested = false;
  let failures = 0;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    requested = false;
    let delay = 900_000;
    try {
      await reconcileCampaigns();
      if (lastDrainFailed) throw Error('Campaign reconciliation deferred');
      delay = await storage!.nextDueDelay();
      failures = 0;
    } catch {
      delay = Math.min(900_000, 30_000 * 2 ** Math.min(failures++, 5));
      console.warn('[campaigns] scheduled refresh deferred');
    } finally {
      running = false;
      if (!stopped) {
        timer = setTimeout(() => void run(), requested ? 250 : Math.max(250, delay));
        timer.unref();
      }
    }
  };
  const wake = () => {
    if (stopped) return;
    requested = true;
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), 250);
    timer.unref();
  };
  const sourceWake = (
    kind: 'predictions' | 'five',
    fixtureIds?: string[],
    freshnessOnly = false,
  ) => {
    if (stopped) return;
    void storage?.wakeSources(kind, fixtureIds, freshnessOnly).catch(() => {
      console.warn('[campaigns] source notification deferred to durable recovery');
      wake();
    });
  };
  const unsubscribers: Array<() => void> = [];
  try {
    campaignService();
    unsubscribers.push(storage!.subscribe(wake));
  } catch {
    console.warn('[campaigns] initialization deferred');
  }
  try {
    const stop = activityService()?.subscribe((change) =>
      sourceWake('predictions', change.fixtureIds, change.freshnessOnly),
    );
    if (stop) unsubscribers.push(stop);
  } catch {
    console.warn('[campaigns] Activity subscription deferred');
  }
  try {
    const stop = fiveService().campaignStore.subscribe?.(() => sourceWake('five'));
    if (stop) unsubscribers.push(stop);
  } catch {
    console.warn('[campaigns] Five subscription deferred');
  }
  wake();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribers.forEach((stop) => stop());
  };
}
