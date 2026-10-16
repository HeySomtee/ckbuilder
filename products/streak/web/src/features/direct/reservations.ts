import { ccc } from '@ckb-ccc/core';
import { hex, integer, object, text } from './protocol.ts';
import type { Point } from './protocol.ts';

export type ConflictProof = Readonly<{ hash: string; blockHash: string; blockNumber: string }>;
export type Reservation = Readonly<{
  hash: string;
  inputs: readonly Point[];
  fixtureId: string;
  conflictProof?: ConflictProof;
  discardedUnsubmitted?: true;
}>;
export function parseReservation(value: unknown): Reservation {
  const row = object(value),
    descriptor = object(row.descriptor);
  if (!Array.isArray(row.inputs) || row.inputs.length < 1 || row.inputs.length > 64)
    throw Error('Saved input reservations are invalid.');
  const proof = row.conflictProof === undefined ? undefined : object(row.conflictProof);
  const discarded = row.status === 'discarded' && row.version === 'sponsored-create-v1';
  const expiry = discarded
    ? integer(object(row.offer).expiresAt, 1, Number.MAX_SAFE_INTEGER)
    : undefined;
  if (
    discarded &&
    (row.submissionAttemptedAt !== undefined ||
      row.finalSignedBytes !== undefined ||
      typeof row.discardedAt !== 'number' ||
      !Number.isSafeInteger(row.discardedAt) ||
      row.discardedAt < expiry!)
  )
    throw Error('Invalid unshared signature retirement.');
  if (
    proof &&
    (typeof proof.blockNumber !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(proof.blockNumber))
  )
    throw Error('Saved conflict evidence is invalid.');
  return Object.freeze({
    hash: hex(row.hash, 32),
    fixtureId: text(descriptor.fixtureId),
    inputs: row.inputs.map((input) => {
      const p = object(input);
      return { txHash: hex(p.txHash, 32), index: integer(p.index, 0, 0xffffffff) };
    }),
    ...(proof
      ? {
          conflictProof: {
            hash: hex(proof.hash, 32),
            blockHash: hex(proof.blockHash, 32),
            blockNumber: proof.blockNumber as string,
          },
        }
      : {}),
    ...(discarded ? { discardedUnsubmitted: true as const } : {}),
  });
}
export async function canonicalConflict(
  client: ccc.Client,
  record: Pick<Reservation, 'hash' | 'inputs'>,
  hash: string,
): Promise<ConflictProof | undefined> {
  if (hash === record.hash) return;
  const response = await client.getTransactionNoCache(hash);
  if (
    response?.status !== 'committed' ||
    response.transaction.hash() !== hash ||
    !response.blockHash ||
    response.blockNumber === undefined ||
    !response.transaction.inputs.some((input) =>
      record.inputs.some((p) => input.previousOutput.eq(p)),
    )
  )
    return;
  const header = await client.getHeaderByNumberNoCache(response.blockNumber),
    tip = await client.getTipHeader();
  if (!header || header.hash !== response.blockHash || tip.number < response.blockNumber + 2n)
    return;
  return Object.freeze({
    hash,
    blockHash: response.blockHash,
    blockNumber: response.blockNumber.toString(),
  });
}
export async function reservationReleased(
  client: ccc.Client,
  record: Reservation,
): Promise<boolean> {
  if (record.discardedUnsubmitted) return true;
  const response = await client.getTransactionNoCache(record.hash);
  if (
    response?.status === 'committed' &&
    response.transaction.hash() === record.hash &&
    response.blockNumber !== undefined &&
    response.blockHash
  ) {
    const header = await client.getHeaderByNumberNoCache(response.blockNumber),
      tip = await client.getTipHeader();
    if (header?.hash === response.blockHash && tip.number >= response.blockNumber + 2n) return true;
  }
  if (!record.conflictProof) return false;
  const proof = await canonicalConflict(client, record, record.conflictProof.hash);
  return (
    !!proof &&
    proof.blockHash === record.conflictProof.blockHash &&
    proof.blockNumber === record.conflictProof.blockNumber
  );
}
