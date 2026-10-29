/* Test-only CCC transport. Never imported by the application build. */
import { ccc } from '@ckb-ccc/core';
import {
  GUARD_HASH,
  PROTOCOL_HASH,
  CKB,
  descriptorTermsHash,
  parseDescriptor,
  pointKey,
  decode,
} from '../web/src/features/direct/protocol.ts';
import { IndexedJournal } from '../web/src/features/direct/journal.ts';

const key = `0x${'11'.repeat(32)}`; // Public, unfunded synthetic test identity.
const hash = (c) => `0x${c.repeat(64)}`;
const json = (value) => JSON.parse(ccc.stringify(value));

export async function syntheticChain(cutoffMs) {
  const template = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  const signer = new ccc.SignerCkbPrivateKey(template, key),
    address = await signer.getRecommendedAddressObj(),
    owner = address.script;
  const args = new Uint8Array(172);
  args.set(ccc.bytesFrom(hash('a')), 0);
  args.set(ccc.bytesFrom(owner.hash()), 36);
  args.set(ccc.bytesFrom(GUARD_HASH), 76);
  args.set(ccc.bytesFrom(owner.hash()), 108);
  args.set(ccc.bytesFrom(owner.hash()), 140);
  new DataView(args.buffer).setBigUint64(68, BigInt(cutoffMs), true);
  const type = ccc.Script.from({
      codeHash: PROTOCOL_HASH,
      hashType: 'data2',
      args: ccc.hexFrom(args),
    }),
    lock = ccc.Script.from({ codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() });
  const creation = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: hash('a'), index: 0 } }],
    outputs: Array.from({ length: 5 }, () => ({ capacity: 610n * CKB, lock, type })),
    outputsData: ['0x0000ff', '0x01000000', '0x01010000', '0x01020000', '0x01030000'],
  });
  const funding = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: hash('b'), index: 0 } }],
    outputs: Array.from({ length: 5 }, () => ({ capacity: 2000n * CKB, lock: owner })),
    outputsData: Array(5).fill('0x'),
  });
  const base = {
    id: 'direct-fixture-one',
    fixtureId: 'api-football-900001',
    label: 'Arsenal vs Chelsea',
    cutoffMs,
    creationTxHash: creation.hash(),
    type: json(type),
    terms: {
      provider: 'football',
      providerFixtureId: '900001',
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    },
    entryEnabled: true,
  };
  const descriptor = await parseDescriptor({ ...base, termsHash: await descriptorTermsHash(base) });
  const txs = new Map(),
    live = new Map(),
    submissions = [];
  const blockHash = hash('c');
  function commit(tx) {
    txs.set(tx.hash(), tx);
    tx.inputs.forEach((input) => live.delete(pointKey(input.previousOutput)));
    tx.outputs.forEach((_, index) => {
      const cell = ccc.Cell.from({
        ...tx.getOutput(index),
        outPoint: { txHash: tx.hash(), index },
      });
      live.set(pointKey(cell.outPoint), cell);
    });
  }
  commit(creation);
  commit(funding);
  let failBroadcast = true,
    conflictClaim = true,
    conflictingHash = null;
  let settledPosition = null;
  const rpc = async (method, args) => {
    const p = args[0];
    if (method === 'cell') return live.get(pointKey(p)) ? json(live.get(pointKey(p))) : null;
    if (method === 'historicalCell') {
      const output = txs.get(p.txHash)?.getOutput(p.index);
      return output ? json(ccc.Cell.from({ ...output, outPoint: p })) : null;
    }
    if (method === 'transaction') {
      const tx = txs.get(p);
      return tx ? json({ transaction: tx, status: 'committed', blockHash, blockNumber: 2 }) : null;
    }
    if (method === 'header')
      return {
        hash: blockHash,
        number: '0x2',
        timestamp: `0x${BigInt(cutoffMs - 3_600_000).toString(16)}`,
      };
    if (method === 'tip')
      return {
        hash: hash('d'),
        number: '0xa',
        timestamp: `0x${BigInt(cutoffMs - 3_600_000).toString(16)}`,
      };
    if (method === 'balance')
      return [...live.values()]
        .filter((c) => c.cellOutput.lock.eq(owner) && !c.cellOutput.type && c.outputData === '0x')
        .reduce((sum, c) => sum + c.cellOutput.capacity, 0n)
        .toString();
    if (method === 'cells')
      return [...live.values()]
        .filter((c) =>
          p === 'type'
            ? c.cellOutput.type?.eq(type)
            : c.cellOutput.lock.eq(owner) && !c.cellOutput.type,
        )
        .map(json);
    if (method === 'history')
      return [...txs.values()]
        .reverse()
        .filter(
          (tx) =>
            tx.outputs.some((o) => o.type?.eq(type)) ||
            tx.inputs.some((i) =>
              txs
                .get(i.previousOutput.txHash)
                ?.getOutput(i.previousOutput.index)
                ?.cellOutput.type?.eq(type),
            ),
        )
        .map((tx) => ({ txHash: tx.hash(), blockNumber: '0x2', txIndex: '0x0', cells: [] }));
    if (method === 'broadcast') {
      const tx = ccc.Transaction.fromBytes(p);
      submissions.push({ hash: tx.hash(), bytes: p });
      if (failBroadcast) {
        failBroadcast = false;
        throw Error('Synthetic response lost before commitment');
      }
      const first = live.get(pointKey(tx.inputs[0].previousOutput));
      if (conflictClaim && first?.cellOutput.type && decode(first.outputData).kind === 'claim') {
        conflictClaim = false;
        const fee = live.get(pointKey(tx.inputs[1].previousOutput));
        const conflict = ccc.Transaction.from({
          inputs: [{ previousOutput: fee.outPoint }],
          outputs: [{ capacity: fee.cellOutput.capacity - 1000n, lock: owner }],
          outputsData: ['0x'],
        });
        commit(conflict);
        conflictingHash = conflict.hash();
        throw Error('Synthetic fee input spent by another confirmed transaction');
      }
      commit(tx);
      return tx.hash();
    }
    throw Error(`Unexpected synthetic RPC method: ${method}`);
  };
  function settle() {
    const cells = [...live.values()].filter((c) => c.cellOutput.type?.eq(type));
    const shard = cells.find(
      (c) => decode(c.outputData).kind === 'shard' && decode(c.outputData).pending,
    );
    const ticket = decode(shard.outputData).pending;
    const reserve = new Uint8Array(34);
    reserve.set([2, ticket.outcome]);
    new DataView(reserve.buffer).setBigUint64(2 + ticket.outcome * 8, ticket.principal, true);
    const claim = new Uint8Array(43);
    claim.set([3, 0]);
    claim.set(ccc.bytesFrom(ticket.owner), 2);
    claim[34] = ticket.outcome;
    new DataView(claim.buffer).setBigUint64(35, ticket.principal, true);
    const tx = ccc.Transaction.from({
      inputs: cells.map((c) => ({ previousOutput: c.outPoint })),
      outputs: [
        { capacity: 3050n * CKB, lock, type },
        { capacity: ticket.principal + 321n * CKB, lock, type },
      ],
      outputsData: [ccc.hexFrom(reserve), ccc.hexFrom(claim)],
    });
    commit(tx);
    settledPosition = {
      id: pointKey(shard.outPoint),
      outcome: ticket.outcome,
      principalShannons: ticket.principal.toString(),
      storageShannons: (321n * CKB).toString(),
      entitlementShannons: (ticket.principal + 321n * CKB).toString(),
      outPoint: { txHash: tx.hash(), index: 1 },
      transactionHash: shard.outPoint.txHash,
    };
    return tx.hash();
  }
  return {
    descriptor,
    rpc,
    submissions,
    settle,
    ownerHash: owner.hash(),
    address: address.toString(),
    activitySnapshot() {
      if (!settledPosition) throw Error('Synthetic settlement must be created first.');
      const collected = [...txs.values()].find((tx) =>
        tx.inputs.some(
          (input) => pointKey(input.previousOutput) === pointKey(settledPosition.outPoint),
        ),
      );
      return {
        phase: 'settled',
        settlement: { outcome: settledPosition.outcome, emptyWinner: false },
        positions: [
          {
            ...settledPosition,
            status: collected ? 'claimed' : 'claimable',
            ...(collected ? { claimTransactionHash: collected.hash() } : {}),
          },
        ],
        checkedAt: Date.now(),
        historyComplete: true,
      };
    },
    get conflictingHash() {
      return conflictingHash;
    },
  };
}

/** Imported only by the test browser route, never by production code. */
export async function connectSynthetic(element, rejectFirst = true) {
  const call = (method, ...args) => window.syntheticRpc(method, json(args));
  const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  client.getCellLiveNoCache = async (p) => {
    const value = await call('cell', p);
    return value ? ccc.Cell.from(value) : undefined;
  };
  client.getCell = async (p) => {
    const value = await call('historicalCell', p);
    return value ? ccc.Cell.from(value) : undefined;
  };
  client.getTransactionNoCache = async (p) => {
    const value = await call('transaction', p);
    return value ? ccc.ClientTransactionResponse.from(value) : undefined;
  };
  client.getHeaderByNumberNoCache = async () => {
    const h = await call('header');
    return { ...h, number: BigInt(h.number), timestamp: BigInt(h.timestamp) };
  };
  client.getTipHeader = async () => {
    const h = await call('tip');
    return { ...h, number: BigInt(h.number), timestamp: BigInt(h.timestamp) };
  };
  client.getBalanceSingle = async () => BigInt(await call('balance'));
  client.findCellsPagedNoCache = async () => ({
    cells: (await call('cells', 'type')).map(ccc.Cell.from),
    lastCursor: '0x',
  });
  client.findCells = async function* () {
    for (const c of await call('cells', 'lock')) yield ccc.Cell.from(c);
  };
  client.findTransactionsByType = async function* () {
    for (const record of await call('history')) yield record;
  };
  const signer = new ccc.SignerCkbPrivateKey(client, key),
    address = await signer.getRecommendedAddressObj();
  signer.getAddressObjs = async () => [address];
  const originalSign = signer.signTransaction.bind(signer);
  signer.signTransaction = async (tx) => {
    if (rejectFirst) {
      rejectFirst = false;
      throw Error('User rejected the synthetic wallet request.');
    }
    return originalSign(tx);
  };
  client.sendTransaction = async (tx) => {
    const records = await new IndexedJournal().list(`testnet-v1:${address.script.hash()}:wallet`);
    if (!records.some((record) => record.hash === tx.hash() && record.signedBytes === tx.toHex()))
      throw Error('Signed bytes were not persisted before broadcast.');
    return call('broadcast', tx.toHex());
  };
  element.onClose(
    () =>
      void element.updateSigner(
        { name: 'Isolated synthetic test wallet' },
        { name: 'Synthetic test signer', signer },
      ),
  );
}

export { IndexedJournal };

export async function verifyAtomicReservations(record) {
  const a = ccc.Transaction.fromBytes(record.signedBytes);
  a.inputs[0].previousOutput.txHash = hash('e');
  a.inputs[1].previousOutput.txHash = hash('f');
  const b = a.clone();
  b.version = 1n;
  const make = (tx) => ({
    ...record,
    scope: 'synthetic-cross-tab-check',
    status: 'signed',
    hash: tx.hash(),
    signedBytes: tx.toHex(),
    inputs: tx.inputs.map((input) => ({
      txHash: input.previousOutput.txHash,
      index: Number(input.previousOutput.index),
    })),
  });
  const results = await Promise.allSettled([
    new IndexedJournal().put(make(a)),
    new IndexedJournal().put(make(b)),
  ]);
  return results.map((result) => (result.status === 'fulfilled' ? 'saved' : result.reason.message));
}
