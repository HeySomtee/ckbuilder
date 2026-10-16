import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as ccc from '@ckb-ccc/core';
import { hash32, object, writeExclusiveJson } from './registry';
import type { SponsorOffer, SponsorState } from './sponsor';

export interface SponsorEntry {
  version: 1;
  requestId: string;
  requestDigest: string;
  ownerAddress: string;
  createdAtMs: number;
  lineageOrigins: string[];
  offer: SponsorOffer;
  state: SponsorState;
  userSignedBytes?: string;
  signedBytes?: string;
  conflictHash?: string;
}
export const sponsorId = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw Error('Invalid sponsor request identity');
  return value;
};

/** Owned by the same operator lease as its funding journal, never by the HTTP API. */
export class SponsorJournal {
  readonly directory: string;
  constructor(
    operatorDirectory: string,
    generation: 'sponsored-v3' | 'atomic-v4' = 'sponsored-v3',
  ) {
    this.directory = join(operatorDirectory, generation);
  }
  load(id: string): SponsorEntry | undefined {
    const path = join(this.directory, `${sponsorId(id)}.json`);
    if (!existsSync(path)) return undefined;
    if (statSync(path).size > 600_000) throw Error('Sponsor journal entry exceeds its size limit');
    const value = object(JSON.parse(readFileSync(path, 'utf8')), 'sponsor entry');
    const offer = object(value.offer, 'sponsor offer');
    if (
      value.version !== 1 ||
      sponsorId(offer.offerId) !== id ||
      sponsorId(value.requestId) !== value.requestId ||
      typeof value.ownerAddress !== 'string' ||
      value.ownerAddress.length > 300 ||
      typeof value.createdAtMs !== 'number' ||
      !Number.isSafeInteger(value.createdAtMs) ||
      value.createdAtMs <= 0 ||
      !Array.isArray(value.lineageOrigins) ||
      value.lineageOrigins.length > 64 ||
      value.lineageOrigins.some(
        (point) => typeof point !== 'string' || !/^0x[0-9a-f]{72}$/.test(point),
      ) ||
      ![
        'offered',
        'owner-signed',
        'signed',
        'confirming',
        'funded',
        'expired',
        'cancelled',
        'blocked',
      ].includes(String(value.state)) ||
      typeof offer.unsignedBytes !== 'string' ||
      offer.unsignedBytes.length > 200_002 ||
      ccc.Transaction.fromBytes(offer.unsignedBytes).hash() !==
        hash32(offer.rawHash, 'sponsor transaction hash') ||
      !Number.isSafeInteger(offer.expiresAt)
    )
      throw Error('Invalid sponsor journal entry');
    hash32(value.requestDigest, 'sponsor request digest');
    for (const key of ['userSignedBytes', 'signedBytes'] as const) {
      const bytes = value[key];
      if (
        bytes !== undefined &&
        (typeof bytes !== 'string' ||
          bytes.length > 200_002 ||
          ccc.Transaction.fromBytes(bytes).hash() !== offer.rawHash)
      )
        throw Error('Sponsor signed bytes do not match the frozen transaction');
    }
    if (value.conflictHash !== undefined) hash32(value.conflictHash, 'sponsor conflict hash');
    return value as unknown as SponsorEntry;
  }
  all(): SponsorEntry[] {
    if (!existsSync(this.directory)) return [];
    const files = readdirSync(this.directory).filter((file) => /^[0-9a-f-]{36}\.json$/.test(file));
    if (files.length > 4096) throw Error('Sponsor history reached its bounded pilot limit');
    return files.map((file) => this.load(file.slice(0, -5))!);
  }
  save(entry: SponsorEntry): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, `${sponsorId(entry.offer.offerId)}.json`);
    const previous = this.load(entry.offer.offerId);
    if (
      previous &&
      (JSON.stringify(previous.offer) !== JSON.stringify(entry.offer) ||
        previous.requestDigest !== entry.requestDigest ||
        previous.ownerAddress !== entry.ownerAddress ||
        previous.requestId !== entry.requestId ||
        previous.createdAtMs !== entry.createdAtMs ||
        JSON.stringify(previous.lineageOrigins) !== JSON.stringify(entry.lineageOrigins) ||
        (previous.userSignedBytes !== undefined &&
          previous.userSignedBytes !== entry.userSignedBytes) ||
        (previous.signedBytes !== undefined && previous.signedBytes !== entry.signedBytes))
    )
      throw Error('Cannot replace an immutable sponsor proposal or signature');
    if (!previous && this.all().length >= 4096)
      throw Error('Sponsor history reached its bounded pilot limit');
    const temporary = `${file}.${randomUUID()}.next`;
    writeExclusiveJson(temporary, entry);
    renameSync(temporary, file);
    this.load(entry.offer.offerId);
  }
  active(now: number): SponsorEntry[] {
    return this.all().filter(
      (entry) =>
        entry.userSignedBytes !== undefined ||
        (entry.state === 'offered' && entry.offer.expiresAt > now),
    );
  }
}

/** A submitted partial holds the wallet until it becomes an ordinary signed operation. */
export function sponsorFundingBlocked(
  operatorDirectory: string,
  now = Date.now(),
  resolved = new Set<string>(),
): boolean {
  return sponsorStores(operatorDirectory)
    .flatMap((store) => store.active(now))
    .some(
      (entry) =>
        !resolved.has(entry.offer.rawHash) && !entry.signedBytes && entry.state !== 'cancelled',
    );
}

/** Call while holding the shared operator lease before deadline-critical work. */
export function cancelUnsignedSponsorOffers(operatorDirectory: string): number {
  let count = 0;
  for (const store of sponsorStores(operatorDirectory))
    for (const entry of store.all())
      if (entry.state === 'offered' && !entry.userSignedBytes) {
        entry.state = 'cancelled';
        store.save(entry);
        count++;
      }
  return count;
}

export function assertSponsorInputsAvailable(
  operatorDirectory: string,
  tx: ccc.Transaction,
  now = Date.now(),
  resolved = new Set<string>(),
): void {
  const candidate = new Set(tx.inputs.map((input) => input.previousOutput.toHex()));
  for (const entry of sponsorStores(operatorDirectory).flatMap((store) => store.active(now))) {
    if (
      entry.offer.rawHash === tx.hash() ||
      entry.state === 'cancelled' ||
      resolved.has(entry.offer.rawHash)
    )
      continue;
    if (
      ccc.Transaction.fromBytes(entry.offer.unsignedBytes).inputs.some((input) =>
        candidate.has(input.previousOutput.toHex()),
      )
    )
      throw Error(
        'An input is reserved by a sponsor proposal. Recover or wait for its unsigned lease to expire.',
      );
  }
}

/** A proof is re-read on every funding cycle. Reorgs restore the reservation. */
export async function canonicalSponsorConflicts(
  client: ccc.Client,
  operatorDirectory: string,
): Promise<{
  resolved: Set<string>;
  uncertain: boolean;
  proofs: Map<string, string>;
  originals: Set<string>;
}> {
  const all = sponsorStores(operatorDirectory).flatMap((store) => store.all()),
    entries = all.filter((entry) => entry.conflictHash);
  const resolved = new Set<string>(),
    proofs = new Map<string, string>(),
    originals = new Set<string>(),
    uncertain = new Set<string>();
  const winners: ccc.Transaction[] = [];
  const canonical = async (hash: string): Promise<ccc.Transaction | undefined> => {
    const response = await client.getTransactionNoCache(hash);
    if (
      !response ||
      response.status !== 'committed' ||
      response.transaction.hash() !== hash ||
      !response.blockHash ||
      response.blockNumber === undefined
    )
      return undefined;
    const header = await client.getHeaderByNumberNoCache(response.blockNumber),
      tip = await client.getTipHeader();
    return header?.hash === response.blockHash && tip.number >= response.blockNumber + 3n
      ? response.transaction
      : undefined;
  };
  const invalidates = (entry: SponsorEntry, conflict: ccc.Transaction): boolean => {
    const inputs = new Set([
      ...ccc.Transaction.fromBytes(entry.offer.unsignedBytes).inputs.map((input) =>
        input.previousOutput.toHex(),
      ),
      ...entry.lineageOrigins,
    ]);
    return conflict.inputs.some((input) => inputs.has(input.previousOutput.toHex()));
  };
  for (let offset = 0; offset < entries.length; offset += 4) {
    const batch = entries.slice(offset, offset + 4);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const conflict = await canonical(entry.conflictHash!);
        if (conflict && invalidates(entry, conflict))
          return { kind: 'conflict' as const, tx: conflict };
        const original = await canonical(entry.offer.rawHash);
        if (original) return { kind: 'original' as const, tx: original };
        return undefined;
      }),
    );
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled' && result.value) {
        if (result.value.kind === 'conflict') {
          resolved.add(batch[index].offer.rawHash);
          proofs.set(batch[index].offer.rawHash, result.value.tx.hash());
        } else {
          originals.add(batch[index].offer.rawHash);
          winners.push(result.value.tx);
        }
      } else uncertain.add(batch[index].offer.rawHash);
    }
  }
  for (const winner of winners)
    for (const entry of all)
      if (entry.offer.rawHash !== winner.hash() && invalidates(entry, winner)) {
        resolved.add(entry.offer.rawHash);
        proofs.set(entry.offer.rawHash, winner.hash());
        uncertain.delete(entry.offer.rawHash);
      }
  return { resolved, uncertain: uncertain.size > 0, proofs, originals };
}

export function sponsorStores(operatorDirectory: string): SponsorJournal[] {
  return [
    new SponsorJournal(operatorDirectory),
    new SponsorJournal(operatorDirectory, 'atomic-v4'),
  ];
}
