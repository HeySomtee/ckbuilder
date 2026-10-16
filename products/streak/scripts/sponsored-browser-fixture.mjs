/* Isolated synthetic transport, never imported by the application. */
import { ccc } from '@ckb-ccc/core';
import {
  CKB,
  GUARD_HASH,
  SPONSORED_PROTOCOL_HASH,
  SPONSORED_MANIFEST,
  descriptorTermsHash,
  parseDescriptor,
  pointKey,
  decode,
} from '../web/src/features/direct/protocol.ts';
import { IndexedJournal } from '../web/src/features/direct/journal.ts';
import { IndexedSponsoredJournal } from '../web/src/features/direct/sponsored-journal.ts';

const ownerKey = '0x' + '11'.repeat(32),
  sponsorKey = '0x' + '22'.repeat(32);
const hash = (c) => '0x' + c.repeat(64);
const json = (value) => JSON.parse(ccc.stringify(value));
const script = (value) => ({
  codeHash: value.codeHash,
  hashType: value.hashType,
  args: value.args,
});

export async function sponsoredChain(cutoffMs) {
  const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  const ownerSigner = new ccc.SignerCkbPrivateKey(client, ownerKey),
    sponsorSigner = new ccc.SignerCkbPrivateKey(client, sponsorKey);
  const ownerAddress = await ownerSigner.getRecommendedAddressObj(),
    owner = ownerAddress.script,
    sponsor = (await sponsorSigner.getRecommendedAddressObj()).script;
  const live = new Map(),
    txs = new Map(),
    offers = new Map(),
    submissions = [];
  let descriptor,
    offer,
    corrupt = false,
    loseResponse = true,
    signedBytes,
    pendingPartial;
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
  const funding = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: hash('a'), index: 0 } }],
    outputs: [
      { capacity: 10000n * CKB, lock: sponsor },
      ...Array.from({ length: 3 }, () => ({ capacity: 2000n * CKB, lock: owner })),
    ],
    outputsData: ['0x', '0x', '0x', '0x'],
  });
  commit(funding);
  const base = {
    fixtureId: 'api-football-900003',
    label: 'Arsenal vs Chelsea',
    cutoffMs,
    terms: {
      provider: 'football',
      providerFixtureId: '900003',
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    },
  };
  const fixture = {
    ...base,
    termsHash: await descriptorTermsHash(base),
    state: 'available',
    sponsorLock: script(sponsor),
  };
  client.getCell = async (point) => {
    const output = txs.get(point.txHash)?.getOutput(point.index);
    return output ? ccc.Cell.from({ ...output, outPoint: point }) : undefined;
  };
  client.getCellLiveNoCache = async (point) => live.get(pointKey(point));
  async function prepare(request) {
    if (offers.has(request.requestId)) return offers.get(request.requestId);
    const fund = live.get(`${funding.hash()}:0`),
      userCells = request.userInputs.map((point) => live.get(pointKey(point))),
      principal = BigInt(request.principalShannons);
    const args = new Uint8Array(172);
    args.set(fund.outPoint.toBytes(), 0);
    args.set(ccc.bytesFrom(sponsor.hash()), 36);
    new DataView(args.buffer).setBigUint64(68, BigInt(cutoffMs), true);
    args.set(ccc.bytesFrom(GUARD_HASH), 76);
    args.set(ccc.bytesFrom(sponsor.hash()), 108);
    args.set(ccc.bytesFrom(sponsor.hash()), 140);
    const type = ccc.Script.from({
      codeHash: SPONSORED_PROTOCOL_HASH,
      hashType: 'data2',
      args: ccc.hexFrom(args),
    });
    const guard = { codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() };
    const ticket = new Uint8Array(45);
    ticket.set([1, 0, 0, 1]);
    ticket.set(ccc.bytesFrom(owner.hash()), 4);
    ticket[36] = request.outcome;
    new DataView(ticket.buffer).setBigUint64(37, principal, true);
    let tx = ccc.Transaction.from({
      inputs: [fund, ...userCells].map((cell) => ({ previousOutput: cell.outPoint })),
      outputs: [
        ...Array.from({ length: 5 }, (_, index) => ({
          capacity: 610n * CKB + (index === 1 ? principal + 321n * CKB : 0n),
          type,
          lock: guard,
        })),
        { capacity: fund.cellOutput.capacity - 3050n * CKB, lock: sponsor },
        {
          capacity:
            userCells.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) -
            principal -
            321n * CKB,
          lock: owner,
        },
      ],
      outputsData: [
        '0x0000ff',
        ccc.hexFrom(ticket),
        '0x01010000',
        '0x01020000',
        '0x01030000',
        '0x',
        '0x',
      ],
      cellDeps: SPONSORED_MANIFEST.codeDeps,
    });
    tx = await sponsorSigner.prepareTransaction(tx);
    tx = await ownerSigner.prepareTransaction(tx);
    while (tx.witnesses.length < tx.inputs.length) tx.witnesses.push('0x');
    const fee = tx.estimateFee(1000n);
    tx.outputs[6].capacity -= fee;
    if (corrupt) tx.outputs[6].capacity -= CKB;
    descriptor = await parseDescriptor({
      ...base,
      id: 'direct-v3-900003',
      type: script(type),
      creationTxHash: tx.hash(),
      termsHash: fixture.termsHash,
      entryEnabled: true,
    });
    offer = {
      version: 'sponsored-create-v1',
      offerId: crypto.randomUUID(),
      expiresAt: Date.now() + 90_000,
      fixture,
      descriptor,
      rawHash: tx.hash(),
      unsignedBytes: tx.toHex(),
      sponsorLock: script(sponsor),
      ownerLock: script(owner),
      sponsorInput: { txHash: fund.outPoint.txHash, index: Number(fund.outPoint.index) },
      userInputIndexes: userCells.map((_, index) => index + 1),
      reserveShannons: '305000000000',
      feeShannons: fee.toString(),
      outcome: request.outcome,
      principalShannons: request.principalShannons,
    };
    offers.set(request.requestId, offer);
    return offer;
  }
  async function finish() {
    const tx = await sponsorSigner.signOnlyTransaction(ccc.Transaction.fromBytes(pendingPartial));
    signedBytes = tx.toHex();
    commit(tx);
    return tx.hash();
  }
  async function submit(request) {
    if (request.rawHash !== offer.rawHash) throw Error('Wrong offer');
    submissions.push(request);
    pendingPartial = request.userSignedBytes;
    if (loseResponse) {
      loseResponse = false;
      throw Error('Response lost after owner signature was saved by sponsor.');
    }
    if (!signedBytes) await finish();
    return status();
  }
  const status = () => ({
    offer,
    state: signedBytes ? 'funded' : pendingPartial ? 'owner-signed' : 'offered',
    transactionHash: offer.rawHash,
    ...(signedBytes ? { signedBytes } : {}),
  });
  const rpc = async (method, params) => {
    const p = params[0];
    if (method === 'cell') return live.has(pointKey(p)) ? json(live.get(pointKey(p))) : null;
    if (method === 'historicalCell')
      return (await client.getCell(p)) ? json(await client.getCell(p)) : null;
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
        .filter((cell) => cell.cellOutput.lock.eq(owner) && !cell.cellOutput.type)
        .reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n)
        .toString();
    if (method === 'cells')
      return [...live.values()]
        .filter((cell) =>
          p === 'type'
            ? descriptor && cell.cellOutput.type?.eq(descriptor.type)
            : cell.cellOutput.lock.eq(owner) && !cell.cellOutput.type,
        )
        .map(json);
    if (method === 'history')
      return [...txs.values()]
        .reverse()
        .filter(
          (tx) =>
            descriptor &&
            (tx.outputs.some((out) => out.type?.eq(descriptor.type)) ||
              tx.inputs.some((input) =>
                txs
                  .get(input.previousOutput.txHash)
                  ?.getOutput(input.previousOutput.index)
                  ?.cellOutput.type?.eq(descriptor.type),
              )),
        )
        .map((tx) => ({ txHash: tx.hash(), blockNumber: '0x2', txIndex: '0x0', cells: [] }));
    if (method === 'broadcast') {
      const tx = ccc.Transaction.fromBytes(p);
      commit(tx);
      return tx.hash();
    }
    throw Error(`Unexpected synthetic method ${method}`);
  };
  function settle() {
    const cells = [...live.values()].filter((cell) => cell.cellOutput.type?.eq(descriptor.type));
    const shard = cells.find((cell) => decode(cell.outputData).pending),
      ticket = decode(shard.outputData).pending;
    const claim = new Uint8Array(43);
    claim.set([3, 0]);
    claim.set(ccc.bytesFrom(owner.hash()), 2);
    claim[34] = ticket.outcome;
    new DataView(claim.buffer).setBigUint64(35, ticket.principal, true);
    const reserve = new Uint8Array(34);
    reserve.set([2, 255]);
    const type = ccc.Script.from(descriptor.type),
      lock = { codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() };
    const tx = ccc.Transaction.from({
      inputs: cells.map((cell) => ({ previousOutput: cell.outPoint })),
      outputs: [
        { capacity: 3050n * CKB, lock, type },
        { capacity: ticket.principal + 321n * CKB, lock, type },
      ],
      outputsData: [ccc.hexFrom(reserve), ccc.hexFrom(claim)],
    });
    commit(tx);
  }
  return {
    fixture,
    prepare,
    submit,
    status,
    rpc,
    finish,
    settle,
    submissions,
    ownerHash: owner.hash(),
    address: ownerAddress.toString(),
    get descriptor() {
      return signedBytes ? descriptor : undefined;
    },
    set corrupt(value) {
      corrupt = value;
    },
    get offer() {
      return offer;
    },
  };
}

export async function connectSponsored(element, rejectFirst = false) {
  const call = (method, ...args) => window.syntheticRpc(method, json(args));
  const client = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  client.getCellLiveNoCache = async (point) => {
    const row = await call('cell', point);
    return row ? ccc.Cell.from(row) : undefined;
  };
  client.getCell = async (point) => {
    const row = await call('historicalCell', point);
    return row ? ccc.Cell.from(row) : undefined;
  };
  client.getTransactionNoCache = async (hash) => {
    const row = await call('transaction', hash);
    return row ? ccc.ClientTransactionResponse.from(row) : undefined;
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
    for (const cell of await call('cells', 'lock')) yield ccc.Cell.from(cell);
  };
  client.findTransactionsByType = async function* () {
    for (const row of await call('history')) yield row;
  };
  const signer = new ccc.SignerCkbPrivateKey(client, ownerKey),
    address = await signer.getRecommendedAddressObj();
  signer.getAddressObjs = async () => [address];
  const sign = signer.signTransaction.bind(signer);
  signer.signTransaction = async (tx) => {
    await window.syntheticSigning();
    if (rejectFirst) {
      rejectFirst = false;
      throw Error('User rejected the synthetic wallet request.');
    }
    return sign(tx);
  };
  client.sendTransaction = async (tx) => {
    const scope = `testnet-v1:${address.script.hash()}:wallet`;
    const plain = await new IndexedJournal().list(scope),
      sponsored = await new IndexedSponsoredJournal().list(scope);
    if (
      !plain.some((row) => row.hash === tx.hash() && row.signedBytes === tx.toHex()) &&
      !sponsored.some((row) => row.hash === tx.hash() && row.finalSignedBytes === tx.toHex())
    )
      throw Error('Signed bytes must persist before broadcast.');
    return call('broadcast', tx.toHex());
  };
  element.onClose(
    () =>
      void element.updateSigner(
        { name: 'Synthetic sponsored wallet' },
        { name: 'Native synthetic signer', signer },
      ),
  );
}
export { IndexedSponsoredJournal, IndexedJournal };

export async function verifyCrossStoreReservations(record) {
  const template = ccc.Transaction.fromBytes(record.offer.unsignedBytes),
    partial = ccc.Transaction.fromBytes(record.ownerSignedBytes);
  const shared = { txHash: hash('e'), index: 7 };
  const sponsorInput = { txHash: hash('d'), index: 7 };
  template.inputs[0].previousOutput = ccc.OutPoint.from(sponsorInput);
  partial.inputs[0].previousOutput = ccc.OutPoint.from(sponsorInput);
  template.inputs[1].previousOutput = ccc.OutPoint.from(shared);
  partial.inputs[1].previousOutput = ccc.OutPoint.from(shared);
  const descriptor = { ...record.descriptor, creationTxHash: template.hash() };
  const sponsored = {
    ...record,
    scope: 'synthetic-cross-store-check',
    hash: template.hash(),
    descriptor,
    offer: {
      ...record.offer,
      rawHash: template.hash(),
      unsignedBytes: template.toHex(),
      descriptor,
      sponsorInput,
    },
    ownerSignedBytes: partial.toHex(),
    inputs: partial.inputs.map((input) => ({
      txHash: input.previousOutput.txHash,
      index: Number(input.previousOutput.index),
    })),
    status: 'owner-signed',
  };
  delete sponsored.finalSignedBytes;
  delete sponsored.submissionAttemptedAt;
  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: hash('f'), index: 0 } }, { previousOutput: shared }],
    outputs: [{ capacity: 421n * CKB, lock: record.offer.ownerLock }],
    outputsData: ['0x'],
    witnesses: ['0x01', '0x'],
  });
  const ordinary = {
    version: 'testnet-v1',
    scope: 'synthetic-cross-store-check',
    ownerHash: record.ownerHash,
    kind: 'claim',
    descriptor,
    hash: tx.hash(),
    signedBytes: tx.toHex(),
    inputs: tx.inputs.map((input) => ({
      txHash: input.previousOutput.txHash,
      index: Number(input.previousOutput.index),
    })),
    createdAt: Date.now(),
    status: 'signed',
    principalShannons: '10000000000',
    storageShannons: '32100000000',
    feeShannons: '1000',
    payoutShannons: '42100000000',
    shard: null,
    outcome: 0,
  };
  const results = await Promise.allSettled([
    new IndexedSponsoredJournal().put(sponsored),
    new IndexedJournal().put(ordinary),
  ]);
  return results.map((result) => (result.status === 'fulfilled' ? 'saved' : result.reason.message));
}
