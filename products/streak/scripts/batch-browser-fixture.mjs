/* Disposable synthetic chain transport. Never imported by the application. */
import { ccc } from '@ckb-ccc/core';
import {
  BATCH_MANIFEST,
  BATCH_PROTOCOL_HASH,
  GUARD_HASH,
  CKB,
  descriptorTermsHash,
  parseDescriptor,
  point,
  pointKey,
  decode,
} from '../web/src/features/direct/protocol.ts';
import { parseBatchOffer } from '../web/src/features/direct/batch-protocol.ts';

export const batchOwnerKey = '0x' + '11'.repeat(32);
const sponsorKey = '0x' + '22'.repeat(32);
const hash = (digit) => '0x' + digit.repeat(64);
const script = (value) => ({
  codeHash: value.codeHash,
  hashType: value.hashType,
  args: value.args,
});
const json = (value) => JSON.parse(ccc.stringify(value));

export async function batchChain(cutoffMs, deps = BATCH_MANIFEST.codeDeps) {
  const rpc = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  const ownerSigner = new ccc.SignerCkbPrivateKey(rpc, batchOwnerKey),
    sponsorSigner = new ccc.SignerCkbPrivateKey(rpc, sponsorKey);
  const ownerAddress = await ownerSigner.getRecommendedAddressObj(),
    owner = ownerAddress.script,
    sponsor = (await sponsorSigner.getRecommendedAddressObj()).script;
  const live = new Map(),
    transactions = new Map(),
    entries = new Map(),
    descriptors = new Map(),
    submissions = [];
  let loseResponse = false,
    blockHash = hash('c'),
    timestamp = cutoffMs - 3_600_000;
  const fixtures = await Promise.all(
    Array.from({ length: 8 }, async (_, index) => {
      const base = {
        fixtureId: `api-football-${910000 + index}`,
        label: [
          'Arsenal vs Chelsea',
          'Barcelona vs Real Madrid',
          'Liverpool vs Everton',
          'Juventus vs Inter',
          'Bayern vs Dortmund',
          'PSG vs Marseille',
          'Milan vs Napoli',
          'Manchester City vs Tottenham',
        ][index],
        cutoffMs,
        terms: {
          provider: 'football',
          providerFixtureId: String(910000 + index),
          source: 'api-football',
          rules: 'regulation-time-1x2-v1',
          deadlineMs: cutoffMs + 21_600_000,
        },
      };
      return {
        ...base,
        termsHash: await descriptorTermsHash(base),
        state: 'available',
        sponsorLock: script(sponsor),
      };
    }),
  );
  function commit(tx) {
    transactions.set(tx.hash(), tx.clone());
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
      { capacity: 100_000n * CKB, lock: sponsor },
      ...Array.from({ length: 3 }, () => ({ capacity: 20_000n * CKB, lock: owner })),
    ],
    outputsData: ['0x', '0x', '0x', '0x'],
  });
  commit(funding);
  rpc.getCell = async (outPoint) => {
    const output = transactions.get(outPoint.txHash)?.getOutput(outPoint.index);
    return output ? ccc.Cell.from({ ...output, outPoint }) : undefined;
  };
  rpc.getCellLiveNoCache = async (outPoint) => live.get(pointKey(outPoint));
  const currentFixtures = () =>
    fixtures.map((fixture) =>
      descriptors.has(fixture.fixtureId)
        ? { ...fixture, state: 'funded', descriptor: descriptors.get(fixture.fixtureId) }
        : fixture,
    );
  function append(previous, outcome, principal, shard) {
    const count = previous ? (previous.length - 4) / 41 : 0,
      data = new Uint8Array(4 + 41 * (count + 1));
    data.set([1, shard, count, 1]);
    if (previous) data.set(previous.slice(4), 4);
    data.set(ccc.bytesFrom(owner.hash()), 4 + count * 41);
    data[4 + count * 41 + 32] = outcome;
    new DataView(data.buffer).setBigUint64(4 + count * 41 + 33, principal, true);
    return ccc.hexFrom(data);
  }
  async function prepare(request) {
    const repeated = [...entries.values()].find((entry) => entry.requestId === request.requestId);
    if (repeated) return repeated.offer;
    const fund = [...live.values()].find(
        (cell) => cell.cellOutput.lock.eq(sponsor) && !cell.cellOutput.type,
      ),
      user = request.userInputs.map((outPoint) => live.get(pointKey(outPoint)));
    const tx = ccc.Transaction.from({
      inputs: [fund, ...user].map((cell) => ({ previousOutput: cell.outPoint })),
      cellDeps: deps,
    });
    const resolved = [fund, ...user],
      lines = [];
    for (const pick of request.picks) {
      const fixture = currentFixtures().find((row) => row.fixtureId === pick.fixtureId),
        principal = BigInt(pick.principalShannons),
        outputIndex = tx.outputs.length;
      let descriptor = fixture.descriptor,
        type,
        guard;
      if (!descriptor) {
        const args = new Uint8Array(172);
        args.set(ccc.bytesFrom(ccc.hashCkb(fund.outPoint.toBytes())));
        new DataView(args.buffer).setUint32(32, outputIndex, true);
        args.set(ccc.bytesFrom(sponsor.hash()), 36);
        new DataView(args.buffer).setBigUint64(68, BigInt(cutoffMs), true);
        args.set(ccc.bytesFrom(GUARD_HASH), 76);
        args.set(ccc.bytesFrom(sponsor.hash()), 108);
        args.set(ccc.bytesFrom(sponsor.hash()), 140);
        type = ccc.Script.from({
          codeHash: BATCH_PROTOCOL_HASH,
          hashType: 'data2',
          args: ccc.hexFrom(args),
        });
        guard = { codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() };
        for (let index = 0; index < 5; index++) {
          tx.outputs.push(
            ccc.CellOutput.from({
              capacity: 610n * CKB + (index === 1 ? principal + 321n * CKB : 0n),
              lock: guard,
              type,
            }),
          );
          tx.outputsData.push(
            index === 0
              ? '0x0000ff'
              : index === 1
                ? append(undefined, pick.outcome, principal, 0)
                : ccc.hexFrom(new Uint8Array([1, index - 1, 0, 0])),
          );
        }
        descriptor = {
          ...fixture,
          id: `direct-v4-${fixture.terms.providerFixtureId}`,
          type: script(type),
          creationTxHash: hash('0'),
          entryEnabled: true,
        };
        delete descriptor.state;
        delete descriptor.sponsorLock;
        lines.push({
          fixture,
          descriptor,
          mode: 'create',
          outcome: pick.outcome,
          principalShannons: pick.principalShannons,
          shard: 0,
          outputIndex,
          outputCount: 5,
        });
      } else {
        type = ccc.Script.from(descriptor.type);
        guard = { codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() };
        const cells = [...live.values()].filter((cell) => cell.cellOutput.type?.eq(type)),
          control = cells.find((cell) => decode(cell.outputData).kind === 'market');
        const shard = cells
          .filter((cell) => decode(cell.outputData).kind === 'shard')
          .sort((a, b) => decode(a.outputData).id - decode(b.outputData).id)
          .find((cell) => {
            const state = decode(cell.outputData);
            return state.accepted.length + (state.pending ? 1 : 0) < 8;
          });
        const state = decode(shard.outputData),
          shardInputIndex = tx.inputs.length;
        tx.inputs.push(ccc.CellInput.from({ previousOutput: shard.outPoint }));
        resolved.push(shard);
        tx.outputs.push(
          ccc.CellOutput.from({
            capacity: shard.cellOutput.capacity + principal + 321n * CKB,
            lock: guard,
            type,
          }),
        );
        tx.outputsData.push(append(state.bytes, pick.outcome, principal, state.id));
        tx.cellDeps.push(ccc.CellDep.from({ outPoint: control.outPoint, depType: 'code' }));
        if (!tx.headerDeps.includes(blockHash)) tx.headerDeps.push(blockHash);
        lines.push({
          fixture,
          descriptor,
          mode: 'deposit',
          outcome: pick.outcome,
          principalShannons: pick.principalShannons,
          shard: state.id,
          outputIndex,
          outputCount: 1,
          shardInputIndex,
          controlDep: point(control.outPoint),
          headerHash: blockHash,
        });
      }
    }
    const principal = request.picks.reduce((sum, pick) => sum + BigInt(pick.principalShannons), 0n),
      storage = 321n * CKB * BigInt(lines.length),
      reserve = 3050n * CKB * BigInt(lines.filter((line) => line.mode === 'create').length);
    const sponsorChangeOutputIndex = tx.outputs.length,
      ownerChangeOutputIndex = sponsorChangeOutputIndex + 1;
    tx.outputs.push(
      ccc.CellOutput.from({ capacity: fund.cellOutput.capacity - reserve, lock: sponsor }),
      ccc.CellOutput.from({
        capacity:
          user.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) - principal - storage,
        lock: owner,
      }),
    );
    tx.outputsData.push('0x', '0x');
    const prepared = await ownerSigner.prepareTransaction(
      await sponsorSigner.prepareTransaction(tx),
    );
    while (prepared.witnesses.length < prepared.inputs.length) prepared.witnesses.push('0x');
    const fee = prepared.estimateFee(1000n);
    prepared.outputs[ownerChangeOutputIndex].capacity -= fee;
    for (const line of lines) {
      if (line.mode === 'create') line.descriptor.creationTxHash = prepared.hash();
      line.descriptor = await parseDescriptor(line.descriptor);
    }
    const offer = await parseBatchOffer({
      version: 'atomic-predictions-v1',
      offerId: crypto.randomUUID(),
      expiresAt: Date.now() + 90_000,
      rawHash: prepared.hash(),
      unsignedBytes: prepared.toHex(),
      sponsorLock: script(sponsor),
      ownerLock: script(owner),
      sponsorInput: point(fund.outPoint),
      userInputIndexes: user.map((_, index) => index + 1),
      inputs: resolved.map((cell) => ({
        outPoint: point(cell.outPoint),
        capacityShannons: cell.cellOutput.capacity.toString(),
        lock: script(cell.cellOutput.lock),
        ...(cell.cellOutput.type ? { type: script(cell.cellOutput.type) } : {}),
        data: cell.outputData,
      })),
      lines,
      reserveShannons: reserve.toString(),
      principalShannons: principal.toString(),
      storageShannons: storage.toString(),
      feeShannons: fee.toString(),
      sponsorChangeOutputIndex,
      ownerChangeOutputIndex,
      fixture: lines[0].fixture,
      descriptor: lines[0].descriptor,
      outcome: lines[0].outcome,
    });
    entries.set(offer.offerId, { offer, requestId: request.requestId });
    return offer;
  }
  const status = ({ offerId }) => {
    const entry = entries.get(offerId);
    return {
      offer: entry.offer,
      state: entry.signedBytes ? 'funded' : entry.partial ? 'owner-signed' : 'offered',
      transactionHash: entry.offer.rawHash,
      ...(entry.signedBytes ? { signedBytes: entry.signedBytes } : {}),
    };
  };
  async function finish(offerId) {
    const entry = entries.get(offerId);
    if (!entry.signedBytes) {
      const tx = await sponsorSigner.signOnlyTransaction(ccc.Transaction.fromBytes(entry.partial));
      entry.signedBytes = tx.toHex();
      commit(tx);
      entry.offer.lines.forEach((line) => descriptors.set(line.fixture.fixtureId, line.descriptor));
    }
    return status({ offerId });
  }
  async function submit(request) {
    const entry = entries.get(request.offerId);
    submissions.push(request);
    if (entry.offer.rawHash !== request.rawHash) throw Error('Wrong synthetic transaction');
    entry.partial = request.userSignedBytes;
    if (loseResponse) {
      loseResponse = false;
      throw Error('Synthetic lost submit response');
    }
    return finish(request.offerId);
  }
  async function call(method, args) {
    const p = args[0];
    if (method === 'cell') return json(live.get(pointKey(p)) ?? null);
    if (method === 'historicalCell') return json((await rpc.getCell(p)) ?? null);
    if (method === 'transaction') {
      const tx = transactions.get(p);
      return tx ? json({ transaction: tx, status: 'committed', blockHash, blockNumber: 2 }) : null;
    }
    if (method === 'header')
      return { hash: blockHash, number: '0x2', timestamp: `0x${BigInt(timestamp).toString(16)}` };
    if (method === 'tip')
      return { hash: hash('d'), number: '0xa', timestamp: `0x${BigInt(timestamp).toString(16)}` };
    if (method === 'cells')
      return [...live.values()]
        .filter((cell) =>
          p === 'lock'
            ? cell.cellOutput.lock.eq(owner) && !cell.cellOutput.type
            : cell.cellOutput.type?.eq(args[1]),
        )
        .map(json);
    if (method === 'broadcast') {
      const tx = ccc.Transaction.fromBytes(p);
      commit(tx);
      return tx.hash();
    }
    throw Error(`Unknown synthetic batch RPC ${method}`);
  }
  return {
    fixtures: currentFixtures,
    prepare,
    submit,
    status,
    finish,
    rpc: call,
    submissions,
    address: ownerAddress.toString(),
    ownerHash: owner.hash(),
    commit,
    set loseResponse(value) {
      loseResponse = value;
    },
    set timestamp(value) {
      timestamp = value;
    },
    set blockHash(value) {
      blockHash = value;
    },
    live,
    transactions,
  };
}

export function attachBatchRpc(client, call) {
  client.getCellLiveNoCache = async (point) => {
    const value = await call('cell', [json(point)]);
    return value ? ccc.Cell.from(value) : undefined;
  };
  client.getCell = async (point) => {
    const value = await call('historicalCell', [json(point)]);
    return value ? ccc.Cell.from(value) : undefined;
  };
  client.getTransactionNoCache = async (hash) => {
    const value = await call('transaction', [hash]);
    return value ? ccc.ClientTransactionResponse.from(value) : undefined;
  };
  client.getTipHeader = async () => {
    const value = await call('tip', []);
    return { ...value, number: BigInt(value.number), timestamp: BigInt(value.timestamp) };
  };
  client.getHeaderByNumberNoCache = async () => {
    const value = await call('header', []);
    return { ...value, number: BigInt(value.number), timestamp: BigInt(value.timestamp) };
  };
  client.findCells = async function* () {
    for (const value of await call('cells', ['lock'])) yield ccc.Cell.from(value);
  };
  client.findCellsPagedNoCache = async (search) => ({
    cells: (await call('cells', ['type', json(search.script)])).map(ccc.Cell.from),
    lastCursor: '0x',
  });
  client.sendTransaction = async (tx) => call('broadcast', [tx.toHex()]);
  return client;
}
