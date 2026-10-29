import type { ActivityPage } from '../../../shared/activity-wire';
import type { DirectMarketDescriptor } from '../direct/registry';
import { PgActivityStorage } from './storage';
import type { ActivityMarketProjection } from './chain';
import { parseActivityEventBatch } from './events';

interface ActivitySource {
  catalogue(): Promise<DirectMarketDescriptor[]>;
  events(): Promise<unknown>;
  acknowledge(ids: string[]): Promise<unknown>;
  project(
    descriptor: DirectMarketDescriptor,
    previous?: ActivityMarketProjection,
  ): Promise<ActivityMarketProjection>;
  canonicalCheckpoint(projection: ActivityMarketProjection): Promise<boolean>;
}

/** Durable jobs wake on events; timers only deliver missed events and reconcile known records. */
export class ActivityService {
  private stopped = true;
  private bootstrapped = false;
  private initialized = false;
  private deliveryHealthy = false;
  private moreEvents = false;
  private deliveryDegraded = false;
  private pumping = false;
  private draining?: Promise<void>;
  private eventTimer?: ReturnType<typeof setTimeout>;
  private jobTimer?: ReturnType<typeof setTimeout>;
  constructor(
    readonly store: PgActivityStorage,
    private readonly source: ActivitySource,
    private readonly warn: (message: string) => void = (message) => console.warn(message),
  ) {}

  start(): () => void {
    this.stopped = false;
    this.wake();
    return () => {
      this.stopped = true;
      clearTimeout(this.eventTimer);
      clearTimeout(this.jobTimer);
    };
  }

  wake(): void {
    if (this.stopped || this.draining) return;
    clearTimeout(this.eventTimer);
    void this.drain()
      .catch(() => this.warn('[activity] event delivery delayed; saved records retained'))
      .finally(() => {
        if (!this.stopped) {
          this.eventTimer = setTimeout(() => this.wake(), this.moreEvents ? 250 : 30_000);
          this.eventTimer.unref();
        }
        this.pump();
      });
  }

  /** Exposed for deterministic tests; acknowledge only after durable ingestion. */
  async drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.deliver()
      .then(
        () => {
          this.deliveryHealthy = !this.moreEvents && !this.deliveryDegraded;
        },
        (error) => {
          this.deliveryHealthy = false;
          this.moreEvents = false;
          throw error;
        },
      )
      .finally(() => {
        this.draining = undefined;
      });
    return this.draining;
  }

  private async deliver(): Promise<void> {
    await this.store.initialize();
    this.initialized = true;
    if (!this.bootstrapped) {
      try {
        await this.store.bootstrap(await this.source.catalogue());
        this.bootstrapped = true;
      } catch {
        this.warn('[activity] catalogue bootstrap delayed; existing records remain available');
      }
    }
    // Bound one drain even when a large backlog arrives. Next wake continues it.
    for (let page = 0; page < 4; page++) {
      const batch = parseActivityEventBatch(await this.source.events());
      this.moreEvents = batch.hasMore;
      this.deliveryDegraded = batch.degraded === true;
      const ids: string[] = [];
      for (const event of batch.events) {
        await this.store.ingest(event);
        ids.push(event.id);
      }
      if (ids.length) await this.source.acknowledge(ids);
      if (!batch.hasMore) break;
    }
  }

  private pump(): void {
    if (this.stopped || this.pumping || !this.initialized) return;
    clearTimeout(this.jobTimer);
    this.pumping = true;
    void this.runJobs()
      .catch(() => this.warn('[activity] index refresh delayed; saved records retained'))
      .finally(() => {
        this.pumping = false;
        if (!this.stopped) {
          this.jobTimer = setTimeout(() => this.pump(), 5_000);
          this.jobTimer.unref();
        }
      });
  }

  async runJobs(limit = 4): Promise<void> {
    // One chain reader at a time, with CCC's own bounded RPC concurrency.
    for (let count = 0; count < limit; count++) {
      if (this.stopped) return;
      const job = await this.store.take();
      if (!job) return;
      try {
        const previous = job.previous;
        const historical =
          !job.changed &&
          previous &&
          ['settled', 'voided'].includes(previous.phase) &&
          Object.values(previous.owners).every(
            (s) =>
              ['settled', 'voided'].includes(s.phase) &&
              s.positions.every((p) => p.status === 'claimed' || p.status === 'refunded'),
          );
        // Collected history needs a cheap canonical checkpoint check, not replay.
        const projection =
          historical && (await this.source.canonicalCheckpoint(previous))
            ? {
                ...previous,
                checkedAt: Date.now(),
                owners: Object.fromEntries(
                  Object.entries(previous.owners).map(([owner, snapshot]) => [
                    owner,
                    { ...snapshot, checkedAt: Date.now() },
                  ]),
                ),
              }
            : await this.source.project(job.descriptor, previous);
        await this.store.complete(job, projection, recoveryDelay(projection));
      } catch {
        await this.store.fail(job);
        this.warn('[activity] market verification deferred; previous observation retained');
      }
    }
  }

  async read(owner: string, address: string, cursor?: string): Promise<ActivityPage> {
    const page = await this.store.read(owner, address, cursor);
    return this.bootstrapped && this.deliveryHealthy
      ? page
      : { ...page, coverage: 'indexing', updating: true };
  }

  async refresh(owner: string): Promise<void> {
    await this.store.refreshOwner(owner);
    this.wake();
    this.pump();
  }

  async hint(owner: string, transactionHash: string, fixtureId?: string): Promise<void> {
    await this.store.hint(owner, transactionHash, fixtureId);
    this.wake();
    this.pump();
  }
}

export function recoveryDelay(projection: ActivityMarketProjection): number {
  const positions = Object.values(projection.owners).flatMap((s) => [...s.positions]);
  if (positions.some((p) => p.status === 'submitted')) return 20_000;
  if (positions.some((p) => ['pending-validation', 'refund-required'].includes(p.status)))
    return 120_000;
  if (positions.some((p) => p.status === 'claimable')) return 120_000;
  if (positions.some((p) => p.status === 'accepted')) return 300_000;
  if (['open', 'reported', 'unknown'].includes(projection.phase)) return 300_000;
  // Fully collected history retains a daily canonical checkpoint audit.
  return 86_400_000;
}
