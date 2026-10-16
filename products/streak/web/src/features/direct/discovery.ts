import { ccc } from '@ckb-ccc/core';
import { bytes, checkCell, decode, point, pointKey, SHARD_RESERVE, STORAGE } from './protocol.ts';
import type { CellState, Descriptor, Outcome, Point, Ticket } from './protocol.ts';

export type Position = Readonly<{
  id: string;
  status:
    'accepted' | 'pending-validation' | 'refund-required' | 'claimable' | 'claimed' | 'refunded';
  outcome: Outcome;
  principalShannons: string;
  storageShannons: string;
  entitlementShannons: string | null;
  outPoint: Point;
  transactionHash: string;
  claimTransactionHash?: string;
}>;
export type MarketSnapshot = Readonly<{
  phase: 'open' | 'reported' | 'settled' | 'voided' | 'unknown';
  positions: readonly Position[];
  report?: Readonly<{
    outcome: Outcome;
    eligible: boolean;
    committedAt: number;
    transactionHash: string;
  }>;
  checkedAt: number;
  uncertainty?: string;
}>;
export type LoadedCell = { cell: ccc.Cell; state: CellState };

export async function confirmedHeader(
  client: ccc.Client,
  hash: string,
  known?: ccc.ClientTransactionResponse,
): Promise<ccc.ClientBlockHeader | undefined> {
  const response = known ?? (await client.getTransactionNoCache(hash));
  if (
    !response ||
    response.transaction.hash() !== hash ||
    response.status !== 'committed' ||
    !response.blockHash ||
    response.blockNumber === undefined
  )
    return;
  const header = await client.getHeaderByNumberNoCache(response.blockNumber);
  if (!header || header.hash !== response.blockHash) return;
  return header;
}
export async function loadMarket(
  client: ccc.Client,
  descriptor: Descriptor,
): Promise<LoadedCell[]> {
  const creation = await client.getTransactionNoCache(descriptor.creationTxHash);
  if (
    !creation ||
    creation.status !== 'committed' ||
    !(await confirmedHeader(client, descriptor.creationTxHash, creation))
  )
    throw Error('Market creation is not confirmed on the canonical chain.');
  if (
    creation.transaction.inputs.length === 0 ||
    ccc.hexFrom(creation.transaction.inputs[0].previousOutput.toBytes()) !==
      ccc.hexFrom(bytes(descriptor.type.args).slice(0, 36))
  )
    throw Error('Market identity does not match its creation transaction.');
  for (let index = 0; index < 5; index++) {
    const output = creation.transaction.getOutput(index);
    if (!output) throw Error('Market creation outputs are incomplete.');
    const cell = ccc.Cell.from({
      ...output,
      outPoint: { txHash: descriptor.creationTxHash, index },
    });
    const state = checkCell(cell, descriptor);
    if (
      cell.cellOutput.capacity !== SHARD_RESERVE ||
      (index === 0
        ? state.kind !== 'market' || state.phase !== 0
        : state.kind !== 'shard' ||
          state.id !== index - 1 ||
          state.accepted.length !== 0 ||
          state.pending !== null)
    )
      throw Error('Market creation layout does not match this protocol.');
  }
  const cells: LoadedCell[] = [],
    seen = new Set<string>();
  const page = await client.findCellsPagedNoCache(
    { script: descriptor.type, scriptType: 'type', scriptSearchMode: 'exact', withData: true },
    'asc',
    40,
  );
  if (page.cells.length >= 40) throw Error('Market index exceeded the protocol cell bound.');
  for (const candidate of page.cells) {
    if (cells.length >= 37) throw Error('Market discovery exceeded the protocol cell bound.');
    const cell = await client.getCellLiveNoCache(candidate.outPoint, true, true);
    if (!cell) throw Error('Market changed during discovery. Refresh before continuing.');
    const key = pointKey(cell.outPoint);
    if (seen.has(key)) throw Error('Duplicate market cell returned by the indexer.');
    seen.add(key);
    cells.push({ cell, state: checkCell(cell, descriptor) });
  }
  const controls = cells.filter((c) => c.state.kind === 'market');
  if (
    controls.length > 1 ||
    new Set(
      cells
        .filter((c) => c.state.kind === 'shard')
        .map((c) => (c.state.kind === 'shard' ? c.state.id : -1)),
    ).size !== cells.filter((c) => c.state.kind === 'shard').length
  )
    throw Error('Market discovery is inconsistent.');
  if (controls.length === 1 && cells.filter((c) => c.state.kind === 'shard').length !== 4)
    throw Error('The four market shards are not available together. Refresh chain state.');
  return cells;
}

function position(
  ticket: Ticket,
  outPoint: Point,
  status: Position['status'],
  index: number,
  capacity: bigint | null = null,
): Position {
  return Object.freeze({
    id: `${pointKey(outPoint)}:${index}`,
    status,
    outcome: ticket.outcome,
    principalShannons: ticket.principal.toString(),
    storageShannons: STORAGE.toString(),
    entitlementShannons: capacity?.toString() ?? null,
    outPoint,
    transactionHash: outPoint.txHash,
  });
}

/** Bounded direct-chain discovery. An unavailable index never becomes a payout entitlement. */
export async function discoverMarket(
  client: ccc.Client,
  descriptor: Descriptor,
  ownerHash: string,
): Promise<MarketSnapshot> {
  const live = await loadMarket(client, descriptor),
    positions: Position[] = [];
  let phase: MarketSnapshot['phase'] = 'unknown',
    report: MarketSnapshot['report'];
  for (const { cell, state } of live) {
    if (state.kind === 'market') {
      phase = state.phase === 0 ? 'open' : 'reported';
      if (state.phase === 1 && state.outcome !== 255) {
        const header = await confirmedHeader(client, cell.outPoint.txHash);
        if (header)
          report = {
            outcome: state.outcome,
            eligible:
              header.timestamp >= BigInt(descriptor.cutoffMs) &&
              header.timestamp < BigInt(descriptor.terms.deadlineMs),
            committedAt: Number(header.timestamp),
            transactionHash: cell.outPoint.txHash,
          };
      }
    } else if (state.kind === 'shard') {
      state.accepted.forEach((t, index) => {
        if (t.owner === ownerHash)
          positions.push(position(t, point(cell.outPoint), 'accepted', index));
      });
      if (state.pending?.owner === ownerHash) {
        const header = await confirmedHeader(client, cell.outPoint.txHash);
        positions.push(
          position(
            state.pending,
            point(cell.outPoint),
            header && header.timestamp >= BigInt(descriptor.cutoffMs)
              ? 'refund-required'
              : 'pending-validation',
            state.accepted.length,
          ),
        );
      }
    } else if (state.kind === 'reserve') phase = state.outcome === 255 ? 'voided' : 'settled';
    else if (state.ticket.owner === ownerHash)
      positions.push(
        position(
          state.ticket,
          point(cell.outPoint),
          'claimable',
          state.id,
          cell.cellOutput.capacity,
        ),
      );
  }
  // Ancestry also recovers claims after reserve cleanup and late ticket refunds
  // paid by an intervening shard replacement while the control is still open.
  const history: ccc.Transaction[] = [],
    spenders = new Map<string, string>();
  let truncated = false,
    inspected = 0;
  const seenTransactions = new Set<string>();
  for await (const record of client.findTransactionsByType(descriptor.type, true, 'desc', 32)) {
    if (++inspected > 96) {
      truncated = true;
      break;
    }
    if (seenTransactions.has(record.txHash)) continue;
    seenTransactions.add(record.txHash);
    const response = await client.getTransactionNoCache(record.txHash);
    if (
      !response ||
      response.status !== 'committed' ||
      !(await confirmedHeader(client, record.txHash, response))
    )
      continue;
    history.push(response.transaction);
    response.transaction.inputs.forEach((input) =>
      spenders.set(pointKey(input.previousOutput), record.txHash),
    );
  }
  const known = new Set(positions.map((p) => pointKey(p.outPoint)));
  for (const tx of history) {
    let reserve: Extract<CellState, { kind: 'reserve' }> | undefined;
    const first = tx.getOutput(0);
    if (first?.cellOutput.type?.eq(descriptor.type)) {
      const state = decode(first.outputData);
      if (state.kind === 'reserve') reserve = state;
    }
    if (reserve) phase = reserve.outcome === 255 ? 'voided' : 'settled';
    for (let index = 0; index < tx.outputs.length; index++) {
      const output = tx.getOutput(index);
      if (!output?.cellOutput.type?.eq(descriptor.type)) continue;
      const outPoint = point({ txHash: tx.hash(), index });
      const state = checkCell(ccc.Cell.from({ ...output, outPoint }), descriptor);
      if (
        state.kind !== 'claim' ||
        state.ticket.owner !== ownerHash ||
        known.has(pointKey(outPoint))
      )
        continue;
      const spentBy = spenders.get(pointKey(outPoint));
      if (spentBy) {
        const claimTx = history.find((t) => t.hash() === spentBy),
          payout = claimTx?.getOutput(0);
        if (
          !payout ||
          payout.cellOutput.type ||
          payout.outputData !== '0x' ||
          payout.cellOutput.lock.hash() !== ownerHash ||
          payout.cellOutput.capacity !== output.cellOutput.capacity
        )
          throw Error('Claim payment evidence is inconsistent.');
        positions.push({
          ...position(state.ticket, outPoint, 'claimed', state.id, output.cellOutput.capacity),
          claimTransactionHash: spentBy,
        });
      } else if (await client.getCellLiveNoCache(outPoint, true, true))
        positions.push(
          position(state.ticket, outPoint, 'claimable', state.id, output.cellOutput.capacity),
        );
      known.add(pointKey(outPoint));
    }
    // Late pending tickets are returned as plain owner outputs at closure.
    // Their creation header, input order and exact output slot identify refunds.
    if (reserve) {
      let lateIndex = tx.outputs.filter((o) => o.type?.eq(descriptor.type)).length;
      for (const input of tx.inputs.slice(1, 5)) {
        const response = await client.getTransactionNoCache(input.previousOutput.txHash);
        const header = response
          ? await confirmedHeader(client, input.previousOutput.txHash, response)
          : undefined;
        const previous = response?.transaction.getOutput(input.previousOutput.index);
        if (!header || !previous?.cellOutput.type?.eq(descriptor.type)) continue;
        const state = checkCell(
          ccc.Cell.from({ ...previous, outPoint: input.previousOutput }),
          descriptor,
        );
        if (
          state.kind !== 'shard' ||
          !state.pending ||
          header.timestamp < BigInt(descriptor.cutoffMs)
        )
          continue;
        const refund = tx.getOutput(lateIndex++),
          ticket = state.pending;
        if (
          !refund ||
          refund.cellOutput.type ||
          refund.outputData !== '0x' ||
          refund.cellOutput.lock.hash() !== ticket.owner ||
          refund.cellOutput.capacity !== ticket.principal + STORAGE
        )
          throw Error('Late-stake refund evidence is inconsistent.');
        if (ticket.owner === ownerHash)
          positions.push(
            position(
              ticket,
              point({ txHash: tx.hash(), index: lateIndex - 1 }),
              'refunded',
              0,
              refund.cellOutput.capacity,
            ),
          );
      }
    } else if (
      first?.cellOutput.type?.eq(descriptor.type) &&
      decode(first.outputData).kind === 'shard' &&
      tx.inputs.length > 0
    ) {
      const input = tx.inputs[0].previousOutput;
      const response = await client.getTransactionNoCache(input.txHash),
        header = response ? await confirmedHeader(client, input.txHash, response) : undefined;
      const previous = response?.transaction.getOutput(input.index);
      if (
        previous?.cellOutput.type?.eq(descriptor.type) &&
        header &&
        header.timestamp >= BigInt(descriptor.cutoffMs)
      ) {
        const state = checkCell(ccc.Cell.from({ ...previous, outPoint: input }), descriptor);
        if (state.kind === 'shard' && state.pending?.owner === ownerHash) {
          const refund = tx.getOutput(1),
            ticket = state.pending;
          if (
            !refund ||
            refund.cellOutput.type ||
            refund.outputData !== '0x' ||
            refund.cellOutput.lock.hash() !== ownerHash ||
            refund.cellOutput.capacity !== ticket.principal + STORAGE
          )
            throw Error('Replacement refund evidence is inconsistent.');
          positions.push(
            position(
              ticket,
              point({ txHash: tx.hash(), index: 1 }),
              'refunded',
              0,
              refund.cellOutput.capacity,
            ),
          );
        }
      }
    }
  }
  return Object.freeze({
    phase,
    positions: Object.freeze(positions),
    ...(report ? { report } : {}),
    checkedAt: Date.now(),
    ...(truncated || phase === 'unknown'
      ? {
          uncertainty:
            'The bounded index did not establish complete market history. Refresh or use the saved transaction explorer links.',
        }
      : {}),
  });
}
