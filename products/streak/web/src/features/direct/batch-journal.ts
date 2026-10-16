import { ccc } from '@ckb-ccc/core';
import { hex, integer, object, text } from './protocol.ts';
import type { Descriptor, Point } from './protocol.ts';
import { otherStoredRecords, BATCH_STORE, storedRecords, putStored } from './journal-db.ts';
import { parseReservation } from './reservations.ts';
import type { ConflictProof, Reservation } from './reservations.ts';
import { inputPoints, transactionBytes } from './sponsored-protocol.ts';
import { assertOwnerSigned, assertSponsorSigned } from './sponsored-journal.ts';
import { parseBatchOffer } from './batch-protocol.ts';
import type { BatchOffer } from './batch-protocol.ts';
import { parseDraft, amountShannons } from '../predictions/draft.ts';
import type { Pick } from '../predictions/draft.ts';

export type BatchRecord = Readonly<{
  version: 'atomic-predictions-v1';
  scope: string;
  ownerHash: string;
  descriptor: Descriptor;
  descriptors: readonly Descriptor[];
  sourcePicks?: readonly Pick[];
  offer: BatchOffer;
  hash: string;
  ownerSignedBytes: string;
  finalSignedBytes?: string;
  inputs: readonly Point[];
  createdAt: number;
  status:
    | 'owner-signed'
    | 'submitting'
    | 'submitted'
    | 'unknown'
    | 'committed'
    | 'resolved'
    | 'discarded';
  submissionAttemptedAt?: number;
  discardedAt?: number;
  blockHash?: string;
  blockNumber?: string;
  conflictProof?: ConflictProof;
}>;
export interface BatchJournal {
  list(scope: string): Promise<BatchRecord[]>;
  put(record: BatchRecord): Promise<void>;
  otherReservations?(scope: string): Promise<Reservation[]>;
}
/** Draft identities only retire the unchanged lines that produced this payment. */
export function parseBatchSourcePicks(
  value: unknown,
  offer: BatchOffer,
): readonly Pick[] | undefined {
  if (value === undefined) return undefined;
  const picks = parseDraft(JSON.stringify({ v: 1, revision: 'saved-payment', picks: value })).picks;
  const outcomes = { home: 0, draw: 1, away: 2 };
  if (
    picks.length !== offer.lines.length ||
    picks.some((pick, index) => {
      const line = offer.lines[index];
      return (
        pick.matchId !== line.fixture.fixtureId ||
        outcomes[pick.outcome] !== line.outcome ||
        amountShannons(pick.amountCkb) !== BigInt(line.principalShannons)
      );
    })
  )
    throw Error('Saved draft lines differ from the reviewed combined payment.');
  return Object.freeze(picks.map((pick) => Object.freeze(pick)));
}
export async function parseBatchRecord(value: unknown): Promise<BatchRecord> {
  const row = object(value),
    offer = await parseBatchOffer(row.offer),
    hash = hex(row.hash, 32);
  const ownerSignedBytes = transactionBytes(row.ownerSignedBytes),
    partial = ccc.Transaction.fromBytes(ownerSignedBytes);
  const ownerHash = hex(row.ownerHash, 32),
    reservation = parseReservation(row);
  const sourcePicks = parseBatchSourcePicks(row.sourcePicks, offer);
  if (
    row.version !== 'atomic-predictions-v1' ||
    hash !== offer.rawHash ||
    ccc.Script.from(offer.ownerLock).hash() !== ownerHash ||
    ![
      'owner-signed',
      'submitting',
      'submitted',
      'unknown',
      'committed',
      'resolved',
      'discarded',
    ].includes(String(row.status)) ||
    JSON.stringify(reservation.inputs) !== JSON.stringify(inputPoints(partial)) ||
    JSON.stringify(row.descriptor) !== JSON.stringify(offer.descriptor) ||
    JSON.stringify(row.descriptors) !== JSON.stringify(offer.lines.map((line) => line.descriptor))
  )
    throw Error('The saved combined transaction is inconsistent. Preserve its recovery backup.');
  assertOwnerSigned(ccc.Transaction.fromBytes(offer.unsignedBytes), partial);
  const finalSignedBytes =
    row.finalSignedBytes === undefined ? undefined : transactionBytes(row.finalSignedBytes);
  if (finalSignedBytes) assertSponsorSigned(partial, ccc.Transaction.fromBytes(finalSignedBytes));
  if (
    row.blockNumber !== undefined &&
    (typeof row.blockNumber !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(row.blockNumber))
  )
    throw Error('Invalid saved confirmation height.');
  return Object.freeze({
    version: 'atomic-predictions-v1',
    scope: text(row.scope, 300),
    ownerHash,
    descriptor: offer.descriptor,
    descriptors: Object.freeze(offer.lines.map((line) => line.descriptor)),
    ...(sourcePicks ? { sourcePicks } : {}),
    offer,
    hash,
    ownerSignedBytes,
    ...(finalSignedBytes ? { finalSignedBytes } : {}),
    inputs: inputPoints(partial),
    createdAt: integer(row.createdAt, 1, Number.MAX_SAFE_INTEGER),
    status: row.status as BatchRecord['status'],
    ...(row.blockHash === undefined ? {} : { blockHash: hex(row.blockHash, 32) }),
    ...(row.blockNumber === undefined ? {} : { blockNumber: row.blockNumber as string }),
    ...(reservation.conflictProof ? { conflictProof: reservation.conflictProof } : {}),
    ...(row.submissionAttemptedAt === undefined
      ? {}
      : { submissionAttemptedAt: integer(row.submissionAttemptedAt, 1, Number.MAX_SAFE_INTEGER) }),
    ...(row.discardedAt === undefined
      ? {}
      : { discardedAt: integer(row.discardedAt, 1, Number.MAX_SAFE_INTEGER) }),
  });
}
export class IndexedBatchJournal implements BatchJournal {
  async list(scope: string): Promise<BatchRecord[]> {
    return Promise.all((await storedRecords(BATCH_STORE, scope)).map(parseBatchRecord));
  }
  async otherReservations(scope: string): Promise<Reservation[]> {
    return (await otherStoredRecords(BATCH_STORE, scope)).map(parseReservation);
  }
  async put(record: BatchRecord): Promise<void> {
    const checked = await parseBatchRecord(record);
    await putStored(BATCH_STORE, checked, (previous) => {
      const row = object(previous);
      for (const key of [
        'version',
        'scope',
        'ownerHash',
        'descriptor',
        'descriptors',
        'sourcePicks',
        'offer',
        'hash',
        'ownerSignedBytes',
        'inputs',
        'createdAt',
      ] as const)
        if (JSON.stringify(row[key]) !== JSON.stringify(checked[key]))
          throw Error('Saved combined transaction identity cannot change.');
      if (row.finalSignedBytes && row.finalSignedBytes !== checked.finalSignedBytes)
        throw Error('The final signed bytes are immutable.');
      if (
        row.submissionAttemptedAt !== undefined &&
        row.submissionAttemptedAt !== checked.submissionAttemptedAt
      )
        throw Error('A shared signature cannot become unsubmitted.');
      if (
        row.discardedAt !== undefined &&
        (row.discardedAt !== checked.discardedAt || checked.status !== 'discarded')
      )
        throw Error('An explicitly discarded signature cannot be submitted.');
    });
  }
}
