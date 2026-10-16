import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Match } from '../../types';
import {
  object,
  PUBLIC_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  writeExclusiveJson,
  type DirectMarketRecord,
} from './registry';

export const PROVISION_QUEUE_LIMIT = 4096;
export const PROVISION_REGISTRY_LIMIT = 256;
const STATUS_FILE = 'provisioning.json';
export type ProvisionStatus =
  | 'queued'
  | 'confirming'
  | 'funded'
  | 'blocked-capacity'
  | 'blocked-registry-limit'
  | 'blocked-review'
  | 'expired'
  | 'withdrawn';
export interface ProvisionFixture {
  fixtureId: string;
  providerFixtureId: string;
  kickoffMs: number;
  homeId: string;
  awayId: string;
  label: string;
}
export interface ProvisionEntry extends ProvisionFixture {
  status: ProvisionStatus;
  observedAtMs: number;
  transactionHash?: string;
  retryAfterMs?: number;
}
export interface ProvisionCatalogue {
  observedAtMs: number;
  coverage: { from: string; to: string; complete: boolean };
  fixtures: ProvisionFixture[];
}
export interface ProvisionProgress {
  format: 'streak-direct-provisioning-v1';
  protocolHash: string;
  updatedAtMs: number;
  catalogueObservedAtMs: number;
  coverage: ProvisionCatalogue['coverage'] | null;
  status:
    | 'waiting-catalogue'
    | 'running'
    | 'blocked-capacity'
    | 'blocked-registry-limit'
    | 'blocked-review';
  counts: Record<ProvisionStatus, number>;
  registryLimit: number;
  queueLimit: number;
  reservePerMarketShannons: string;
  remainingReserveShannons: string;
  observedFundingCapacityShannons?: string;
  estimatedShortfallShannons?: string;
  capacityScope: 'bounded-64-cell-page';
  fixtures: {
    fixtureId: string;
    kickoffMs: number;
    status: ProvisionStatus;
    transactionHash?: string;
  }[];
}
const STATUSES: ProvisionStatus[] = [
  'queued',
  'confirming',
  'funded',
  'blocked-capacity',
  'blocked-registry-limit',
  'blocked-review',
  'expired',
  'withdrawn',
];
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw Error(`Invalid ${label}`);
  return value;
}
function identity(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,14}$/.test(value))
    throw Error('Invalid provider identity');
  return value;
}
function fixture(value: unknown): ProvisionFixture {
  const row = object(value, 'provisioning fixture');
  const providerFixtureId = identity(row.providerFixtureId);
  if (
    row.fixtureId !== `api-football-${providerFixtureId}` ||
    typeof row.label !== 'string' ||
    !row.label.trim() ||
    row.label.length > 180 ||
    /[\u0000-\u001f]/.test(row.label)
  )
    throw Error('Invalid provisioning fixture identity');
  return {
    fixtureId: row.fixtureId,
    providerFixtureId,
    kickoffMs: integer(row.kickoffMs, 'fixture kickoff'),
    homeId: identity(row.homeId),
    awayId: identity(row.awayId),
    label: row.label,
  };
}
function coverage(value: unknown): ProvisionCatalogue['coverage'] {
  const row = object(value, 'catalogue coverage');
  if (
    typeof row.from !== 'string' ||
    typeof row.to !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.to) ||
    !Number.isFinite(Date.parse(row.from)) ||
    !Number.isFinite(Date.parse(row.to)) ||
    row.to < row.from ||
    typeof row.complete !== 'boolean'
  )
    throw Error('Invalid catalogue coverage');
  return { from: row.from, to: row.to, complete: row.complete };
}

/** The active API provider owns this catalogue. Every creation is revalidated directly upstream. */
export function parseProvisionCatalogue(value: unknown, now: number): ProvisionCatalogue {
  const row = object(value, 'provisioning catalogue');
  const observedAtMs = integer(row.observedAtMs, 'catalogue time');
  if (
    row.format !== 'streak-direct-fixtures-v1' ||
    row.provider !== 'football' ||
    row.source !== PROVIDER_ORIGIN ||
    row.enabled !== true ||
    row.simulated !== false ||
    observedAtMs > now + 30_000 ||
    observedAtMs < now - 120_000 ||
    !Array.isArray(row.fixtures) ||
    row.fixtures.length > PROVISION_QUEUE_LIMIT
  )
    throw Error('Catalogue is stale, untrusted or exceeds the explicit queue bound');
  const window = coverage(row.coverage);
  const ids = new Set<string>();
  const fixtures: ProvisionFixture[] = [];
  for (const raw of row.fixtures) {
    const match = object(raw, 'catalogue match');
    const oracle = object(match.oracle, 'catalogue source');
    const providerFixtureId = identity(oracle.fixtureId);
    if (
      match.id !== `api-football-${providerFixtureId}` ||
      match.sport !== 'football' ||
      oracle.provider !== 'api-football' ||
      oracle.source !== PROVIDER_ORIGIN ||
      ids.has(String(match.id))
    )
      throw Error('Catalogue contains a foreign or duplicate fixture');
    ids.add(String(match.id));
    const kickoffMs = typeof match.kickoff === 'string' ? Date.parse(match.kickoff) : NaN;
    if (!Number.isSafeInteger(kickoffMs)) throw Error('Catalogue fixture has no valid kickoff');
    if (match.status !== 'scheduled' || kickoffMs <= now) continue;
    const home = object(match.home, 'home team'),
      away = object(match.away, 'away team');
    if (typeof home.name !== 'string' || typeof away.name !== 'string')
      throw Error('Catalogue team names are missing');
    fixtures.push(
      fixture({
        fixtureId: match.id,
        providerFixtureId,
        kickoffMs,
        homeId: home.id,
        awayId: away.id,
        label: `${home.name} vs ${away.name}`,
      }),
    );
  }
  return { observedAtMs, coverage: window, fixtures };
}

export function verifyProvisionFixture(current: Match, expected: ProvisionFixture): void {
  if (
    current.id !== expected.fixtureId ||
    Date.parse(current.kickoff) !== expected.kickoffMs ||
    current.home.id !== expected.homeId ||
    current.away.id !== expected.awayId ||
    current.oracle?.provider !== 'api-football' ||
    current.oracle.source !== PROVIDER_ORIGIN ||
    current.oracle.fixtureId !== expected.providerFixtureId ||
    current.status !== 'scheduled'
  )
    throw Error(
      'Fresh provider fixture differs from the queued catalogue. Refresh before funding.',
    );
}

/** Only an explicit same-machine API URL is accepted, never an arbitrary signing input feed. */
export function provisioningCatalogueUrl(input: string): string {
  const url = new URL(input);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/api/direct/fixtures' ||
    url.search ||
    url.hash
  )
    throw Error('Provisioning requires the explicit loopback /api/direct/fixtures catalogue');
  return url.toString();
}

function replaceJson(file: string, value: unknown): void {
  const temporary = `${file}.${randomUUID()}.next`;
  writeExclusiveJson(temporary, value);
  renameSync(temporary, file);
}

export class ProvisionQueue {
  readonly file: string;
  entries: ProvisionEntry[] = [];
  catalogueObservedAtMs = 0;
  coverage: ProvisionCatalogue['coverage'] | null = null;
  status: ProvisionProgress['status'] = 'waiting-catalogue';
  observedFundingCapacityShannons?: string;
  constructor(
    readonly directory: string,
    readonly protocolHash: string = PUBLIC_DIRECT_CONFIG.protocolHash,
  ) {
    if (!isAbsolute(directory))
      throw Error('Provisioning queue needs an absolute durable directory');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = join(directory, 'queue.json');
    if (!existsSync(this.file)) return;
    if (statSync(this.file).size > 3_000_000)
      throw Error('Provisioning queue exceeds its byte bound');
    const saved = object(JSON.parse(readFileSync(this.file, 'utf8')), 'provisioning queue');
    if (
      saved.version !== 1 ||
      saved.protocolHash !== protocolHash ||
      !Array.isArray(saved.entries) ||
      saved.entries.length > PROVISION_QUEUE_LIMIT
    )
      throw Error('Provisioning queue has another deployment or exceeds its bound');
    const seen = new Set<string>();
    this.entries = saved.entries.map((value) => {
      const row = object(value, 'provisioning entry');
      const entry = fixture(row);
      if (
        !STATUSES.includes(row.status as ProvisionStatus) ||
        seen.has(entry.fixtureId) ||
        (row.transactionHash !== undefined &&
          (typeof row.transactionHash !== 'string' ||
            !/^0x[0-9a-f]{64}$/.test(row.transactionHash)))
      )
        throw Error('Invalid provisioning queue state');
      seen.add(entry.fixtureId);
      return {
        ...entry,
        status: row.status as ProvisionStatus,
        observedAtMs: integer(row.observedAtMs, 'entry observation'),
        ...(typeof row.transactionHash === 'string'
          ? { transactionHash: row.transactionHash }
          : {}),
        ...(row.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: integer(row.retryAfterMs, 'retry time') }),
      };
    });
    this.catalogueObservedAtMs = integer(
      saved.catalogueObservedAtMs,
      'saved catalogue observation',
    );
    this.coverage = saved.coverage === null ? null : coverage(saved.coverage);
  }
  save(): void {
    replaceJson(this.file, {
      version: 1,
      protocolHash: this.protocolHash,
      catalogueObservedAtMs: this.catalogueObservedAtMs,
      coverage: this.coverage,
      entries: this.entries,
    });
  }
  synchronize(catalogue: ProvisionCatalogue, now: number): void {
    const previous = new Map(this.entries.map((entry) => [entry.fixtureId, entry]));
    const seen = new Set<string>();
    for (const current of catalogue.fixtures) {
      seen.add(current.fixtureId);
      const prior = previous.get(current.fixtureId);
      if (prior?.transactionHash) {
        if (
          prior.kickoffMs !== current.kickoffMs ||
          prior.homeId !== current.homeId ||
          prior.awayId !== current.awayId
        )
          prior.status = 'blocked-review';
        prior.observedAtMs = catalogue.observedAtMs;
        continue;
      }
      const retry =
        prior?.status === 'blocked-review' &&
        prior.kickoffMs === current.kickoffMs &&
        prior.homeId === current.homeId &&
        prior.awayId === current.awayId
          ? prior.retryAfterMs
          : undefined;
      previous.set(current.fixtureId, {
        ...current,
        observedAtMs: catalogue.observedAtMs,
        status:
          current.kickoffMs <= now + 120_000
            ? 'expired'
            : retry && retry > now
              ? 'blocked-review'
              : 'queued',
        ...(retry === undefined ? {} : { retryAfterMs: retry }),
      });
    }
    if (previous.size > PROVISION_QUEUE_LIMIT)
      throw Error('Durable provisioning queue is full; no catalogue subset was silently admitted');
    for (const entry of previous.values()) {
      if (!entry.transactionHash && !seen.has(entry.fixtureId))
        entry.status = entry.kickoffMs <= now + 120_000 ? 'expired' : 'withdrawn';
    }
    this.entries = [...previous.values()].sort(
      (a, b) => a.kickoffMs - b.kickoffMs || a.fixtureId.localeCompare(b.fixtureId),
    );
    this.catalogueObservedAtMs = catalogue.observedAtMs;
    this.coverage = catalogue.coverage;
    this.status = 'running';
    this.save();
  }
  markRegistered(records: DirectMarketRecord[]): void {
    for (const record of records) {
      if (record.type.codeHash !== this.protocolHash) continue;
      const entry = this.entries.find((candidate) => candidate.fixtureId === record.fixtureId);
      if (!entry) continue;
      entry.transactionHash = record.creationTxHash;
      entry.status = entry.kickoffMs === record.cutoffMs ? 'funded' : 'blocked-review';
    }
  }
  publish(directory: string, reservePerMarket: bigint, now: number): ProvisionProgress {
    if (!isAbsolute(directory))
      throw Error('Provisioning progress needs an absolute public directory');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
      ProvisionStatus,
      number
    >;
    for (const entry of this.entries) counts[entry.status]++;
    const remaining = this.entries.filter(
      (entry) =>
        !entry.transactionHash &&
        entry.kickoffMs > now &&
        !['expired', 'withdrawn'].includes(entry.status),
    ).length;
    const required = BigInt(remaining) * reservePerMarket;
    const available =
      this.observedFundingCapacityShannons === undefined
        ? undefined
        : BigInt(this.observedFundingCapacityShannons);
    const progress: ProvisionProgress = {
      format: 'streak-direct-provisioning-v1',
      protocolHash: this.protocolHash,
      updatedAtMs: now,
      catalogueObservedAtMs: this.catalogueObservedAtMs,
      coverage: this.coverage,
      status: this.status,
      counts,
      registryLimit: PROVISION_REGISTRY_LIMIT,
      queueLimit: PROVISION_QUEUE_LIMIT,
      reservePerMarketShannons: reservePerMarket.toString(),
      remainingReserveShannons: required.toString(),
      capacityScope: 'bounded-64-cell-page',
      ...(available === undefined
        ? {}
        : {
            observedFundingCapacityShannons: available.toString(),
            estimatedShortfallShannons: (required > available
              ? required - available
              : 0n
            ).toString(),
          }),
      fixtures: this.entries.map(({ fixtureId, kickoffMs, status, transactionHash }) => ({
        fixtureId,
        kickoffMs,
        status,
        ...(transactionHash ? { transactionHash } : {}),
      })),
    };
    replaceJson(join(directory, STATUS_FILE), progress);
    return progress;
  }
}

/** Public readers never open the signed operator journal or queue identities. */
export function readProvisioningProgress(directory?: string): ProvisionProgress | undefined {
  if (!directory) return undefined;
  if (!isAbsolute(directory)) throw Error('Public progress directory must be absolute');
  const path = join(directory, STATUS_FILE);
  if (!existsSync(path)) return undefined;
  if (statSync(path).size > 1_000_000)
    throw Error('Public provisioning progress exceeds its bound');
  const row = object(JSON.parse(readFileSync(path, 'utf8')), 'provisioning progress');
  if (
    row.format !== 'streak-direct-provisioning-v1' ||
    typeof row.protocolHash !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(row.protocolHash) ||
    ![
      'waiting-catalogue',
      'running',
      'blocked-capacity',
      'blocked-registry-limit',
      'blocked-review',
    ].includes(String(row.status)) ||
    row.registryLimit !== PROVISION_REGISTRY_LIMIT ||
    row.queueLimit !== PROVISION_QUEUE_LIMIT ||
    row.capacityScope !== 'bounded-64-cell-page' ||
    !Array.isArray(row.fixtures) ||
    row.fixtures.length > PROVISION_QUEUE_LIMIT
  )
    throw Error('Invalid public provisioning progress');
  const decimal = (value: unknown): string => {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,29})$/.test(value))
      throw Error('Invalid public capacity');
    return value;
  };
  const rawCounts = object(row.counts, 'provisioning counts');
  const counts = Object.fromEntries(
    STATUSES.map((status) => [status, integer(rawCounts[status], 'provisioning count')]),
  ) as Record<ProvisionStatus, number>;
  const fixtures = row.fixtures.map((value) => {
    const item = object(value, 'public provisioning fixture');
    if (
      typeof item.fixtureId !== 'string' ||
      !/^api-football-[1-9][0-9]{0,14}$/.test(item.fixtureId) ||
      !STATUSES.includes(item.status as ProvisionStatus) ||
      (item.transactionHash !== undefined &&
        (typeof item.transactionHash !== 'string' ||
          !/^0x[0-9a-f]{64}$/.test(item.transactionHash)))
    )
      throw Error('Invalid public fixture state');
    return {
      fixtureId: item.fixtureId,
      kickoffMs: integer(item.kickoffMs, 'public kickoff'),
      status: item.status as ProvisionStatus,
      ...(typeof item.transactionHash === 'string'
        ? { transactionHash: item.transactionHash }
        : {}),
    };
  });
  return {
    format: 'streak-direct-provisioning-v1',
    protocolHash: row.protocolHash,
    updatedAtMs: integer(row.updatedAtMs, 'progress time'),
    catalogueObservedAtMs: integer(row.catalogueObservedAtMs, 'catalogue time'),
    coverage: row.coverage === null ? null : coverage(row.coverage),
    status: row.status as ProvisionProgress['status'],
    counts,
    registryLimit: PROVISION_REGISTRY_LIMIT,
    queueLimit: PROVISION_QUEUE_LIMIT,
    reservePerMarketShannons: decimal(row.reservePerMarketShannons),
    remainingReserveShannons: decimal(row.remainingReserveShannons),
    capacityScope: 'bounded-64-cell-page',
    ...(row.observedFundingCapacityShannons === undefined
      ? {}
      : {
          observedFundingCapacityShannons: decimal(row.observedFundingCapacityShannons),
          estimatedShortfallShannons: decimal(row.estimatedShortfallShannons),
        }),
    fixtures,
  };
}

export interface ProvisionBarrier {
  clear: boolean;
  pending: {
    fixtureId: string;
    action: 'create' | 'report' | 'close';
    protocolHash: string;
    transactionHash: string;
    kickoffMs: number;
    status: 'pending' | 'committed' | 'rejected' | 'ready-to-rebroadcast' | 'uncertain';
    confirmations?: number;
  }[];
}
export interface ProvisionPorts {
  now(): number;
  registered(): DirectMarketRecord[];
  barrier(): Promise<ProvisionBarrier>;
  available(): Promise<bigint>;
  create(entry: ProvisionFixture): Promise<void>;
  resume(entry: ProvisionFixture): Promise<void>;
}

/** One signature at most. Four canonical confirmations release the previous funding change. */
export async function provisionCycle(queue: ProvisionQueue, ports: ProvisionPorts): Promise<void> {
  queue.markRegistered(ports.registered());
  queue.status = 'running';
  if (queue.catalogueObservedAtMs < ports.now() - 120_000) {
    queue.status = 'waiting-catalogue';
    queue.save();
    return;
  }
  const barrier = await ports.barrier();
  queue.markRegistered(ports.registered());
  for (const pending of barrier.pending) {
    if (pending.action !== 'create' || pending.protocolHash !== queue.protocolHash) continue;
    const entry = queue.entries.find((candidate) => candidate.fixtureId === pending.fixtureId);
    if (!entry) continue;
    entry.transactionHash = pending.transactionHash;
    entry.status = ['uncertain', 'rejected'].includes(pending.status)
      ? 'blocked-review'
      : 'confirming';
  }
  if (!barrier.clear) {
    delete queue.observedFundingCapacityShannons;
    queue.status =
      !barrier.pending.length ||
      barrier.pending.some((job) => ['uncertain', 'rejected'].includes(job.status))
        ? 'blocked-review'
        : 'running';
    // A signed creation survives process death. Only its exact bytes can be retried.
    const retry = barrier.pending.find(
      (job) =>
        job.action === 'create' &&
        job.protocolHash === queue.protocolHash &&
        job.status === 'ready-to-rebroadcast',
    );
    if (retry) {
      const entry = queue.entries.find((candidate) => candidate.fixtureId === retry.fixtureId);
      if (
        entry &&
        entry.kickoffMs === retry.kickoffMs &&
        entry.observedAtMs === queue.catalogueObservedAtMs &&
        entry.kickoffMs > ports.now() + 120_000
      ) {
        queue.save();
        await ports.resume(entry);
      } else queue.status = 'blocked-review';
    }
    queue.save();
    return;
  }
  const eligible = queue.entries.filter(
    (entry) =>
      !entry.transactionHash &&
      entry.observedAtMs === queue.catalogueObservedAtMs &&
      !['expired', 'withdrawn'].includes(entry.status),
  );
  for (const entry of eligible)
    if (entry.kickoffMs <= ports.now() + 120_000) entry.status = 'expired';
  const next = eligible.find(
    (entry) => entry.kickoffMs > ports.now() + 120_000 && (entry.retryAfterMs ?? 0) <= ports.now(),
  );
  if (!next) {
    if (eligible.some((entry) => entry.status === 'blocked-review'))
      queue.status = 'blocked-review';
    queue.save();
    return;
  }
  if (ports.registered().length >= PROVISION_REGISTRY_LIMIT) {
    for (const entry of eligible)
      if (entry.status !== 'expired') entry.status = 'blocked-registry-limit';
    queue.status = 'blocked-registry-limit';
    queue.save();
    return;
  }
  queue.observedFundingCapacityShannons = (await ports.available()).toString();
  queue.save();
  try {
    await ports.create(next);
    next.status = 'confirming';
    delete next.retryAfterMs;
    delete queue.observedFundingCapacityShannons;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/eligible untyped operator funding cell|separate fee capacity/.test(message)) {
      for (const entry of eligible)
        if (entry.status !== 'expired') entry.status = 'blocked-capacity';
      queue.status = 'blocked-capacity';
    } else {
      delete queue.observedFundingCapacityShannons;
      next.status = 'blocked-review';
      next.retryAfterMs = ports.now() + 300_000;
      queue.status = 'blocked-review';
    }
  }
  queue.save();
}
