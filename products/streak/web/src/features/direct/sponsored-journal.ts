import { ccc } from '@ckb-ccc/core';
import { hex, integer, object, text } from './protocol.ts';
import type { Descriptor, Point } from './protocol.ts';
import { otherStoredRecords, SPONSORED_STORE, storedRecords, putStored } from './journal-db.ts';
import { parseReservation } from './reservations.ts';
import type { ConflictProof, Reservation } from './reservations.ts';
import { inputPoints, parseSponsorOffer, transactionBytes } from './sponsored-protocol.ts';
import type { SponsorOffer } from './sponsored-protocol.ts';

export type SponsoredRecord = Readonly<{
  version: 'sponsored-create-v1';
  scope: string;
  ownerHash: string;
  descriptor: Descriptor;
  offer: SponsorOffer;
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
export interface SponsoredJournal {
  list(scope: string): Promise<SponsoredRecord[]>;
  put(record: SponsoredRecord): Promise<void>;
  otherReservations?(scope: string): Promise<Reservation[]>;
}
function witnessSignature(tx: ccc.Transaction, index: number): void {
  const witness = tx.getWitnessArgs(index);
  if (!witness?.lock || /^0x0*$/.test(witness.lock) || witness.inputType || witness.outputType)
    throw Error('The wallet did not supply the expected transaction signature.');
}
export function assertOwnerSigned(unsigned: ccc.Transaction, signed: ccc.Transaction): void {
  if (
    unsigned.hash() !== signed.hash() ||
    unsigned.witnesses.length !== signed.witnesses.length ||
    signed.witnesses.length !== signed.inputs.length ||
    signed.witnesses.some((value, index) => index !== 1 && value !== unsigned.witnesses[index])
  )
    throw Error('The wallet changed the reviewed transaction or another signing group.');
  witnessSignature(signed, 1);
}
export function assertSponsorSigned(ownerSigned: ccc.Transaction, final: ccc.Transaction): void {
  if (
    ownerSigned.hash() !== final.hash() ||
    ownerSigned.witnesses.length !== final.witnesses.length ||
    final.witnesses.some((value, index) => index !== 0 && value !== ownerSigned.witnesses[index])
  )
    throw Error(
      'The sponsor changed the reviewed transaction or your signature. Keep the original recovery record.',
    );
  witnessSignature(final, 0);
}
export async function parseSponsoredRecord(value: unknown): Promise<SponsoredRecord> {
  const row = object(value),
    offer = await parseSponsorOffer(row.offer),
    hash = hex(row.hash, 32);
  const ownerSignedBytes = transactionBytes(row.ownerSignedBytes),
    partial = ccc.Transaction.fromBytes(ownerSignedBytes);
  const ownerHash = hex(row.ownerHash, 32),
    reservation = parseReservation(row);
  if (
    row.version !== 'sponsored-create-v1' ||
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
    JSON.stringify(row.descriptor) !== JSON.stringify(offer.descriptor)
  )
    throw Error('The saved sponsored transaction is inconsistent. Preserve its recovery backup.');
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
    version: 'sponsored-create-v1',
    scope: text(row.scope, 300),
    ownerHash,
    descriptor: offer.descriptor,
    offer,
    hash,
    ownerSignedBytes,
    ...(finalSignedBytes ? { finalSignedBytes } : {}),
    inputs: inputPoints(partial),
    createdAt: integer(row.createdAt, 1, Number.MAX_SAFE_INTEGER),
    status: row.status as SponsoredRecord['status'],
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
export class IndexedSponsoredJournal implements SponsoredJournal {
  async list(scope: string): Promise<SponsoredRecord[]> {
    return Promise.all((await storedRecords(SPONSORED_STORE, scope)).map(parseSponsoredRecord));
  }
  async otherReservations(scope: string): Promise<Reservation[]> {
    return (await otherStoredRecords(SPONSORED_STORE, scope)).map(parseReservation);
  }
  async put(record: SponsoredRecord): Promise<void> {
    const checked = await parseSponsoredRecord(record);
    await putStored(SPONSORED_STORE, checked, (previous) => {
      const row = object(previous);
      for (const key of [
        'version',
        'scope',
        'ownerHash',
        'descriptor',
        'offer',
        'hash',
        'ownerSignedBytes',
        'inputs',
        'createdAt',
      ] as const)
        if (JSON.stringify(row[key]) !== JSON.stringify(checked[key]))
          throw Error('Saved sponsored transaction identity cannot change.');
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
