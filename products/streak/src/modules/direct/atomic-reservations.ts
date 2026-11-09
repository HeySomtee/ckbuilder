import * as ccc from '@ckb-ccc/core';
import { readdirSync } from 'node:fs';
import type { BatchOffer } from '../../../shared/batch-wire';
import { OPERATION_FILE, type OperatorJournal } from './journal';
import { SponsorJournal, type SponsorEntry } from './sponsor-journal';
import { V4_DIRECT_CONFIG } from './registry';

export const ATOMIC_PAYMENT_LIMIT = 3;

/** Read only while holding the operator lease. Durable offers are the reservations. */
export function atomicReservations(
  journal: OperatorJournal,
  now: number,
  resolved: ReadonlySet<string>,
) {
  const files = readdirSync(journal.directory).filter((file) => OPERATION_FILE.test(file));
  if (files.length > 1536) throw Error('Operator journal exceeds both generation bounds');
  const operations = files.map((file) => journal.load(file.slice(0, -5))!);
  const byHash = new Map(operations.map((operation) => [operation.transactionHash, operation]));
  const historyInputs = new Set<string>();
  for (const operation of operations) {
    if (resolved.has(operation.transactionHash)) continue;
    for (const input of ccc.Transaction.fromBytes(operation.signedTransaction).inputs)
      historyInputs.add(input.previousOutput.toHex());
  }
  const entries: { entry: SponsorEntry; offer: BatchOffer; signed: boolean }[] = [];
  for (const entry of new SponsorJournal(journal.directory, 'atomic-v4').all()) {
    if (resolved.has(entry.offer.rawHash)) continue;
    const operation = byHash.get(entry.offer.rawHash);
    const active =
      !!operation ||
      !!entry.userSignedBytes ||
      !!entry.signedBytes ||
      (entry.state === 'offered' && entry.offer.expiresAt > now);
    if (!active) continue;
    const offer = entry.offer as BatchOffer;
    if (
      offer.version !== 'atomic-predictions-v1' ||
      !Array.isArray(offer.lines) ||
      offer.lines.length < 1 ||
      offer.lines.length > 8 ||
      offer.lines.some((line) => line.descriptor.type.codeHash !== V4_DIRECT_CONFIG.protocolHash)
    )
      throw Error('Invalid atomic reservation');
    if (entry.signedBytes && !operation)
      throw Error('Signed atomic payment is missing its immutable operation');
    if (
      operation &&
      (operation.action !== 'batch' ||
        operation.descriptor.type.codeHash !== offer.lines[0].descriptor.type.codeHash ||
        (entry.signedBytes && operation.signedTransaction !== entry.signedBytes))
    )
      throw Error('Atomic reservation differs from its immutable operation');
    entries.push({ entry, offer, signed: !!operation });
  }
  return {
    allowed: new Set(entries.map(({ offer }) => offer.rawHash)),
    /** A completed ancestor is proven by the barrier's canonical terminal anchors. */
    pending(pendingHashes: ReadonlySet<string>) {
      const active = entries.filter(
        ({ offer, signed }) => !signed || pendingHashes.has(offer.rawHash),
      );
      const inputs = new Set(historyInputs);
      const outputs = new Set<string>();
      const creations = new Set<string>();
      const owners = new Set<string>();
      const hashes = new Set<string>();
      for (const { entry, offer } of active) {
        hashes.add(offer.rawHash);
        owners.add(ccc.Script.from(offer.ownerLock).hash());
        const tx = ccc.Transaction.fromBytes(offer.unsignedBytes);
        for (const input of tx.inputs) inputs.add(input.previousOutput.toHex());
        for (let index = 0; index < tx.outputs.length; index++)
          outputs.add(ccc.OutPoint.from({ txHash: offer.rawHash, index }).toHex());
        for (const origin of entry.lineageOrigins) inputs.add(origin);
        for (const line of offer.lines)
          if (line.mode === 'create') creations.add(line.fixture.fixtureId);
      }
      return {
        count: hashes.size,
        inputs,
        outputs,
        creations,
        owners,
        unavailable: (point: ccc.OutPoint) =>
          inputs.has(point.toHex()) || outputs.has(point.toHex()),
      };
    },
  };
}

/** Funding must already be canonical, independently spendable and four blocks deep. */
export async function confirmedFunding(client: ccc.Client, cell: ccc.Cell): Promise<boolean> {
  const response = await client.getTransactionNoCache(cell.outPoint.txHash);
  if (
    !response ||
    response.status !== 'committed' ||
    !response.blockHash ||
    response.blockNumber === undefined ||
    response.transaction.hash() !== cell.outPoint.txHash
  )
    return false;
  const output = response.transaction.getOutput(cell.outPoint.index);
  if (
    !output ||
    output.cellOutput.toHex() !== cell.cellOutput.toHex() ||
    output.outputData !== cell.outputData
  )
    return false;
  const header = await client.getHeaderByNumberNoCache(response.blockNumber);
  const tip = await client.getTipHeader();
  return header?.hash === response.blockHash && tip.number >= response.blockNumber + 3n;
}
