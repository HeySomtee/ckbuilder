import * as ccc from '@ckb-ccc/core';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  opendirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  type Dir,
} from 'node:fs';
import { join, relative } from 'node:path';
import { OperatorJournal, OPERATION_FILE, operationKey } from '../direct/journal';
import { sponsorStores, type SponsorJournal, type SponsorEntry } from '../direct/sponsor-journal';
import { atomicOffer } from '../direct/batch';
import { parseShard } from '../direct/operator';
import { object, writeExclusiveJson, hash32, protocolConfigFor } from '../direct/registry';
import {
  ACTIVITY_EVENT_BATCH_LIMIT,
  activityDescriptor,
  activityEventId,
  parseActivityEvent,
  type ActivityPublicEvent,
  type ActivityEventBatch,
} from './events';

const EVENT_FILE = /^0x[0-9a-f]{64}\.json$/;
const SOURCE_BUDGET = 256;
const EMPTY_STAMP = '-';
function stamp(path: string): string {
  if (!existsSync(path)) return EMPTY_STAMP;
  const state = statSync(path, { bigint: true });
  return `${state.ino}:${state.size}:${state.mtimeNs}:${state.ctimeNs}`;
}
function latestObservation(directory: string): string | undefined {
  if (!existsSync(directory)) return undefined;
  const reader = opendirSync(directory),
    files: string[] = [];
  try {
    for (let count = 0; ; count++) {
      const item = reader.readSync();
      if (!item) break;
      if (count >= 256) throw Error('Activity operator observation history exceeds bounds');
      if (item.isFile() && /^\d{3}-[0-9a-f-]{36}\.json$/.test(item.name)) files.push(item.name);
    }
  } finally {
    reader.closeSync();
  }
  files.sort();
  return files.at(-1);
}
const revision = (name: string) => `0x${createHash('sha256').update(name).digest('hex')}`;

/** The isolated operator owns this relay. The web process only receives public IPC events.
 * Source journals are the durable outbox source of truth, so a crash before materialization
 * cannot lose an observation. Acknowledgement follows the consumer's database commit. */
export class ActivityEventOutbox {
  private readonly pending: string;
  private readonly acknowledged: string;
  private readonly quarantine: string;
  private readonly sources: Array<{ directory: string; store?: SponsorJournal }>;
  private readonly seen = new Map<string, string>();
  private readonly paymentSources = new Map<string, string>();
  private sourceIndex = 0;
  private sourceDirectory?: Dir;
  constructor(readonly journal: OperatorJournal) {
    const directory = join(journal.directory, 'activity-outbox');
    this.pending = join(directory, 'pending');
    this.acknowledged = join(directory, 'acknowledged');
    this.quarantine = join(directory, 'quarantine');
    mkdirSync(this.pending, { recursive: true, mode: 0o700 });
    mkdirSync(this.acknowledged, { recursive: true, mode: 0o700 });
    mkdirSync(this.quarantine, { recursive: true, mode: 0o700 });
    this.sources = [
      { directory: journal.directory },
      ...sponsorStores(journal.directory).map((store) => ({ directory: store.directory, store })),
    ];
  }
  close(): void {
    this.sourceDirectory?.closeSync();
    this.sourceDirectory = undefined;
    this.sourceIndex = 0;
  }
  private sourceIssue(path: string): void {
    // Keep source bytes exactly where financial recovery expects them. The marker
    // is deliberately redacted and persists until the operator reviews the source.
    const identity = createHash('sha256').update(path).digest('hex');
    const marker = join(this.quarantine, `source-${identity}.json`);
    if (existsSync(marker)) return;
    try {
      writeExclusiveJson(marker, {
        version: 1,
        kind: 'source-review',
        sourceHash: identity,
        source: relative(this.journal.directory, path),
        observedAt: Date.now(),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  private quarantineEvent(file: string): void {
    // Moving only the generated public copy preserves it for diagnosis. The
    // immutable operator/sponsor source and any signatures are never removed.
    renameSync(
      join(this.pending, file),
      join(this.quarantine, `event-${file.slice(0, -5)}-${randomUUID()}.json`),
    );
  }
  private degraded(): boolean {
    const reader = opendirSync(this.quarantine);
    try {
      return reader.readSync() !== null;
    } finally {
      reader.closeSync();
    }
  }
  private emit(value: Omit<ActivityPublicEvent, 'id'>): void {
    const event = parseActivityEvent({ ...value, id: activityEventId(value) });
    const file = `${event.id}.json`;
    if (existsSync(join(this.acknowledged, file)) || existsSync(join(this.pending, file))) return;
    try {
      writeExclusiveJson(join(this.pending, file), event);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  private operator(file: string): void {
    const path = join(this.journal.directory, file),
      observations = `${path.slice(0, -5)}.events`,
      signature = `${stamp(path)}:${stamp(observations)}`;
    if (this.seen.get(path) === signature) return;
    const entry = this.journal.load(file.slice(0, -5));
    if (!entry) return;
    const descriptors = [entry.descriptor, ...(entry.creations ?? [])]
      .filter(
        (record, index, records) =>
          records.findIndex(
            (candidate) =>
              candidate.type.codeHash === record.type.codeHash &&
              candidate.type.args === record.type.args &&
              candidate.creationTxHash === record.creationTxHash,
          ) === index,
      )
      .map(activityDescriptor);
    const base: Omit<ActivityPublicEvent, 'id'> = {
      version: 1,
      kind: 'operator',
      transactionHash: entry.transactionHash,
      state: 'signed',
      observedAt: entry.createdAtMs,
      descriptors,
      action: entry.action,
    };
    this.emit(base);
    if (existsSync(observations)) {
      const latest = latestObservation(observations);
      if (latest) {
        const latestPath = join(observations, latest);
        if (statSync(latestPath).size > 4096)
          throw Error('Activity observation exceeds size limit');
        const observation = object(
          JSON.parse(readFileSync(latestPath, 'utf8')),
          'operator observation',
        );
        if (
          observation.transactionHash !== entry.transactionHash ||
          typeof observation.observedAt !== 'string'
        )
          throw Error('Activity observation identity differs');
        const event = {
          ...base,
          state: String(observation.status),
          observedAt: Date.parse(observation.observedAt),
        };
        if (observation.blockHash !== undefined)
          event.blockHash = hash32(observation.blockHash, 'observation block');
        if (observation.confirmations !== undefined) {
          if (
            typeof observation.confirmations !== 'number' ||
            !Number.isSafeInteger(observation.confirmations) ||
            observation.confirmations < 0
          )
            throw Error('Invalid observation depth');
          event.confirmations = Math.min(4, observation.confirmations);
        }
        event.sourceRevision = revision(latest);
        this.emit(event);
      }
    }
    this.seen.set(path, signature);
  }
  private sponsor(store: SponsorJournal, file: string): void {
    const path = join(store.directory, file),
      source = this.paymentSources.get(path),
      signature = `${stamp(path)}:${source ? stamp(source) : EMPTY_STAMP}`;
    if (this.seen.get(path) === signature) return;
    const entry = store.load(file.slice(0, -5));
    if (entry && (entry.userSignedBytes || entry.signedBytes)) {
      const action = entry.offer.version === 'atomic-predictions-v1' ? 'batch' : 'create',
        folder = join(
          this.journal.directory,
          `${operationKey(
            action,
            entry.offer.descriptor.fixtureId,
            entry.offer.descriptor.type.codeHash,
            entry.offer.rawHash,
          )}.events`,
        );
      this.paymentSources.set(path, folder);
      this.payment(entry, latestObservation(folder));
    }
    this.seen.set(path, signature);
  }
  private payment(entry: SponsorEntry, observation?: string): void {
    const offer = entry.offer,
      transaction = ccc.Transaction.fromBytes(offer.unsignedBytes),
      ownerHash = ccc.Script.from(offer.ownerLock).hash(),
      lines =
        offer.version === 'atomic-predictions-v1'
          ? atomicOffer(offer).lines.map((line) => ({
              descriptor: activityDescriptor(line.descriptor),
              outcome: line.outcome,
              principalShannons: line.principalShannons,
              outputIndex: line.outputIndex + (line.mode === 'create' ? 1 : 0),
            }))
          : [
              {
                descriptor: activityDescriptor(offer.descriptor),
                outcome: offer.outcome,
                principalShannons: offer.principalShannons,
                outputIndex: 1,
              },
            ];
    const positions = lines.map((line) => {
      const output = transaction.outputs[line.outputIndex],
        data = transaction.outputsData[line.outputIndex],
        type = ccc.Script.from(line.descriptor.type),
        config = protocolConfigFor(line.descriptor);
      if (
        !output?.type?.eq(type) ||
        output.lock.codeHash !== config.guardHash ||
        output.lock.hashType !== 'data2' ||
        output.lock.args !== type.hash() ||
        !data
      )
        throw Error('Submitted Activity output differs from market');
      const pending = parseShard(Buffer.from(ccc.bytesFrom(data))).pending;
      if (
        !pending ||
        pending.owner !== ownerHash ||
        pending.outcome !== line.outcome ||
        pending.principal.toString() !== line.principalShannons
      )
        throw Error('Submitted Activity ticket differs from payment');
      return {
        descriptor: line.descriptor,
        ownerHash,
        position: {
          id: `submitted:${offer.rawHash}:${line.outputIndex}`,
          status: 'submitted' as const,
          outcome: line.outcome,
          principalShannons: line.principalShannons,
          storageShannons: '32100000000',
          entitlementShannons: null,
          outPoint: { txHash: offer.rawHash, index: line.outputIndex },
          transactionHash: offer.rawHash,
        },
      };
    });
    this.emit({
      version: 1,
      kind: 'payment',
      transactionHash: offer.rawHash,
      state: entry.state,
      observedAt: entry.createdAtMs,
      descriptors: lines.map((line) => line.descriptor),
      ...(observation ? { sourceRevision: revision(observation) } : {}),
      ownerHash,
      positions,
    });
  }
  /** At most 256 source directory entries and 64 public events per request. */
  read(): ActivityEventBatch {
    let scanned = 0,
      scanning = true;
    while (scanned < SOURCE_BUDGET && scanning) {
      const source = this.sources[this.sourceIndex];
      if (!this.sourceDirectory && existsSync(source.directory))
        this.sourceDirectory = opendirSync(source.directory);
      const entry = this.sourceDirectory?.readSync();
      if (!entry) {
        this.sourceDirectory?.closeSync();
        this.sourceDirectory = undefined;
        this.sourceIndex++;
        if (this.sourceIndex === this.sources.length) {
          this.sourceIndex = 0;
          scanning = false;
        }
        continue;
      }
      scanned++;
      if (!entry.isFile()) continue;
      try {
        if (!source.store && OPERATION_FILE.test(entry.name)) this.operator(entry.name);
        if (source.store && /^[0-9a-f-]{36}\.json$/.test(entry.name))
          this.sponsor(source.store, entry.name);
      } catch {
        this.sourceIssue(join(source.directory, entry.name));
      }
    }
    const events: ActivityPublicEvent[] = [],
      pending = opendirSync(this.pending);
    let hasMore = scanning,
      examined = 0,
      bytes = 0;
    try {
      for (;;) {
        const item = pending.readSync();
        if (!item) break;
        // Crash-left acked files and unrelated entries must not make work unbounded.
        if (++examined > ACTIVITY_EVENT_BATCH_LIMIT * 2) {
          hasMore = true;
          break;
        }
        if (!item.isFile() || !EVENT_FILE.test(item.name)) continue;
        const path = join(this.pending, item.name);
        if (existsSync(join(this.acknowledged, item.name))) {
          unlinkSync(path);
          continue;
        }
        if (events.length === ACTIVITY_EVENT_BATCH_LIMIT) {
          hasMore = true;
          break;
        }
        let event: ActivityPublicEvent;
        try {
          if (statSync(path).size > 80_000) throw Error('Activity event exceeds size bound');
          event = parseActivityEvent(JSON.parse(readFileSync(path, 'utf8')));
          if (`${event.id}.json` !== item.name) throw Error('Activity event filename differs');
        } catch {
          this.quarantineEvent(item.name);
          continue;
        }
        const eventBytes = Buffer.byteLength(JSON.stringify(event));
        if (bytes + eventBytes > 500_000) {
          hasMore = true;
          break;
        }
        bytes += eventBytes;
        events.push(event);
      }
    } finally {
      pending.closeSync();
    }
    return { events, hasMore, degraded: this.degraded() };
  }
  acknowledge(value: unknown): number {
    const row = object(value, 'activity acknowledgement');
    if (!Array.isArray(row.ids) || row.ids.length > ACTIVITY_EVENT_BATCH_LIMIT)
      throw Error('Activity acknowledgement exceeds bounds');
    const ids = row.ids.map((id) => hash32(id, 'activity event identity'));
    for (const id of ids) {
      const file = `${id}.json`;
      if (!existsSync(join(this.pending, file)) && !existsSync(join(this.acknowledged, file)))
        throw Error('Activity event was not delivered');
    }
    for (const id of ids) {
      const file = `${id}.json`,
        ack = join(this.acknowledged, file),
        pending = join(this.pending, file);
      if (!existsSync(ack)) writeExclusiveJson(ack, { version: 1, id });
      if (existsSync(pending)) unlinkSync(pending);
    }
    return ids.length;
  }
}
