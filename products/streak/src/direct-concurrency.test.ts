import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as ccc from '@ckb-ccc/core';
import { BatchService } from './modules/direct/batch';
import { OperatorJournal, operationKey } from './modules/direct/journal';
import {
  DirectRegistry,
  V4_DIRECT_CONFIG,
  PUBLIC_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
} from './modules/direct/registry';
import { operatorFundingBarrier } from './modules/direct/cli';
import { ReviewWaitingError } from './modules/direct/review-queue';
import { atomicReservations, confirmedFunding } from './modules/direct/atomic-reservations';
import {
  requestAdmissionDrain,
  completeAdmissionDrain,
  admissionDrain,
} from './modules/direct/admission-drain';
import { cancelUnsignedSponsorOffers } from './modules/direct/sponsor-journal';
import type { Match } from './types';
import type { BatchOffer, BatchOfferRequest } from '../shared/batch-wire';

const CKB = 100_000_000n,
  NOW = 1_800_000_000_000;
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
function header(number: number) {
  return ccc.ClientBlockHeader.from({
    compactTarget: 0,
    dao: { c: 0, ar: 0, s: 0, u: 0 },
    epoch: [0, 0, 1],
    extraHash: hash(0),
    hash: hash(number),
    nonce: 0,
    number,
    parentHash: hash(number - 1),
    proposalsHash: hash(0),
    timestamp: NOW,
    transactionsRoot: hash(0),
    version: 0,
  });
}

async function scenario(existingMarket: boolean) {
  const directory = mkdtempSync(join(tmpdir(), 'streak-concurrency-'));
  try {
    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    const sponsor = new ccc.SignerCkbPrivateKey(client, `0x${'01'.repeat(32)}`);
    const owners = ['02', '03', '04', '05', '06'].map(
      (key) => new ccc.SignerCkbPrivateKey(client, `0x${key.repeat(32)}`),
    );
    const sponsorLock = (await sponsor.getRecommendedAddressObj()).script;
    const ownerLocks = await Promise.all(
      owners.map(async (owner) => (await owner.getRecommendedAddressObj()).script),
    );
    const funding = ccc.Transaction.from({
      inputs: [{ previousOutput: { txHash: hash(99), index: 0 } }],
      outputs: [
        ...Array.from({ length: 5 }, () => ({ capacity: 40_000n * CKB, lock: sponsorLock })),
        ...ownerLocks.map((lock) => ({ capacity: 20_000n * CKB, lock })),
      ],
      outputsData: Array(10).fill('0x'),
    });
    const cells = new Map<string, ccc.Cell>(),
      history = new Map<string, ccc.ClientTransactionResponse>();
    const poolInputs = new Set<string>();
    let tip = 13,
      now = NOW;
    function commit(tx: ccc.Transaction, block = 10) {
      history.set(
        tx.hash(),
        ccc.ClientTransactionResponse.from({
          transaction: tx,
          status: 'committed',
          blockHash: hash(block),
          blockNumber: block,
        }),
      );
      for (const input of tx.inputs) {
        cells.delete(input.previousOutput.toHex());
        poolInputs.delete(input.previousOutput.toHex());
      }
      tx.outputs.forEach((_, index) => {
        const cell = ccc.Cell.from({
          ...tx.getOutput(index)!,
          outPoint: { txHash: tx.hash(), index },
        });
        cells.set(cell.outPoint.toHex(), cell);
      });
    }
    commit(funding);
    client.getCell = async (point) => cells.get(ccc.OutPoint.from(point).toHex());
    client.getCellLiveNoCache = async (point, _data, includePool) => {
      const key = ccc.OutPoint.from(point).toHex();
      return includePool && poolInputs.has(key) ? undefined : cells.get(key);
    };
    client.getTransactionNoCache = async (txHash) => history.get(ccc.hexFrom(txHash));
    client.getHeaderByNumberNoCache = async (number) => header(Number(number));
    client.getTipHeader = async () => header(tip);
    client.findCellsPagedNoCache = async (key) => ({
      cells: [...cells.values()].filter((cell) =>
        key.scriptType === 'type'
          ? cell.cellOutput.type?.eq(key.script)
          : cell.cellOutput.lock.eq(key.script) && !cell.cellOutput.type,
      ),
      lastCursor: '0x',
    });
    client.sendTransactionNoCache = async (value) => {
      const tx = ccc.Transaction.from(value);
      history.set(
        tx.hash(),
        ccc.ClientTransactionResponse.from({ transaction: tx, status: 'pending' }),
      );
      tx.inputs.forEach((input) => poolInputs.add(input.previousOutput.toHex()));
      return tx.hash();
    };
    const config = { ...V4_DIRECT_CONFIG, codeDeps: PUBLIC_DIRECT_CONFIG.codeDeps };
    const journal = new OperatorJournal(join(directory, 'operator'), config, 10_000);
    const registry = new DirectRegistry(join(directory, 'registry'), config);
    const fixture = async (id: string): Promise<Match> => ({
      id,
      sport: 'football',
      date: '2027-01-15',
      kickoff: new Date(NOW + 3_600_000).toISOString(),
      status: 'scheduled',
      stage: 'Synthetic concurrency test',
      home: { id: '1', name: 'Home', code: 'H', flag: '' },
      away: { id: '2', name: 'Away', code: 'A', flag: '' },
      oracle: { provider: 'api-football', fixtureId: id.slice(13), source: PROVIDER_ORIGIN },
    });
    const options = { client, signer: sponsor, journal, registry, config, fixture, now: () => now };
    let service = new BatchService(options);
    async function request(owner: number, id: number): Promise<BatchOfferRequest> {
      const demand = await service.describe(`api-football-${id}`);
      return {
        requestId: randomUUID(),
        ownerAddress: await owners[owner].getRecommendedAddress(),
        userInputs: [{ txHash: funding.hash(), index: 5 + owner }],
        picks: [
          {
            fixtureId: demand.fixtureId,
            termsHash: demand.termsHash,
            outcome: (owner % 3) as 0 | 1 | 2,
            principalShannons: (100n * CKB).toString(),
          },
        ],
      };
    }
    async function submit(offer: BatchOffer, owner: number) {
      const tx = await owners[owner].signOnlyTransaction(
        ccc.Transaction.fromBytes(offer.unsignedBytes),
      );
      return service.submit({
        offerId: offer.offerId,
        rawHash: offer.rawHash,
        userSignedBytes: tx.toHex(),
      });
    }
    if (existingMarket) {
      const initial = await service.prepareOffer(await request(4, 8000));
      const state = await submit(initial, 4);
      commit(ccc.Transaction.fromBytes(state.signedBytes!));
      await service.status({ offerId: initial.offerId, rawHash: initial.rawHash });
      assert.equal(registry.all().length, 1);
    }
    const requests = await Promise.all(
      [0, 1, 2, 3].map((index) => request(index, existingMarket ? 8000 : 8000 + index)),
    );
    const first = await service.prepareOffer(requests[0]);
    const fundingPage = client.findCellsPagedNoCache;
    client.findCellsPagedNoCache = async (...args) => {
      const page = await fundingPage(...args);
      return args[0].scriptType === 'lock'
        ? { ...page, cells: page.cells.filter((cell) => cell.outPoint.eq(first.sponsorInput)) }
        : page;
    };
    await assert.rejects(service.prepareOffer(requests[1]), ReviewWaitingError);
    await service.cancelReview(requests[1].requestId, requests[1].ownerAddress);
    client.findCellsPagedNoCache = fundingPage;
    if (!existingMarket) {
      const duplicateCreation = await request(3, 8000);
      await assert.rejects(service.prepareOffer(duplicateCreation), ReviewWaitingError);
      await service.cancelReview(duplicateCreation.requestId, duplicateCreation.ownerAddress);
      // Pending creations count toward capacity, before any signature exists.
      const originalAll = registry.all.bind(registry);
      registry.all = () =>
        Array.from({ length: 254 }, (_, index) => ({
          ...first.lines[0].descriptor,
          fixtureId: `api-football-${100_000 + index}`,
        }));
      try {
        const secondReservation = await service.prepareOffer(requests[1]);
        await assert.rejects(service.prepareOffer(requests[2]), /testnet market limit/);
        await service.cancelReview(requests[1].requestId, requests[1].ownerAddress);
        assert.equal(service.store.load(secondReservation.offerId)?.state, 'cancelled');
        requests[1].requestId = randomUUID();
      } finally {
        registry.all = originalAll;
      }
    }
    // A review survives restart. A second review must not spend its sponsor/owner/shard inputs.
    service = new BatchService(options);
    const second = await service.prepareOffer(requests[1]);
    assert.notDeepEqual(first.sponsorInput, second.sponsorInput);
    const firstState = await submit(first, 0);
    assert.equal(firstState.state, 'confirming');
    const duplicateOwner = { ...requests[0], requestId: randomUUID() };
    await assert.rejects(service.prepareOffer(duplicateOwner), ReviewWaitingError);
    await service.cancelReview(duplicateOwner.requestId, duplicateOwner.ownerAddress);
    const third = await service.prepareOffer(requests[2]);
    assert.equal(
      new Set([first, second, third].map((offer) => ccc.OutPoint.from(offer.sponsorInput).toHex()))
        .size,
      3,
    );
    const allInputs = [first, second, third].flatMap((offer) =>
      ccc.Transaction.fromBytes(offer.unsignedBytes).inputs.map((input) =>
        input.previousOutput.toHex(),
      ),
    );
    assert.equal(new Set(allInputs).size, allInputs.length);
    if (existingMarket) {
      assert.equal(new Set([first, second, third].map((offer) => offer.lines[0].shard)).size, 3);
      assert.equal((await service.configuration()).reservations.length, 0);
    }
    await assert.rejects(service.prepareOffer(requests[3]), ReviewWaitingError);
    const fifthRequest = await request(4, existingMarket ? 8000 : 8004);
    await assert.rejects(
      service.prepareOffer(fifthRequest),
      (error) => error instanceof ReviewWaitingError && error.position === 2,
    );
    await service.cancelReview(requests[3].requestId, requests[3].ownerAddress);
    await service.cancelReview(fifthRequest.requestId, fifthRequest.ownerAddress);
    const secondState = await submit(second, 1),
      thirdState = await submit(third, 2);
    assert.equal(secondState.state, 'confirming');
    assert.equal(thirdState.state, 'confirming');
    assert.equal(
      (await operatorFundingBarrier(client, journal, registry)).clear,
      false,
      'lifecycle cannot race these payments',
    );
    service = new BatchService(options);
    await assert.rejects(service.prepareOffer(requests[3]), ReviewWaitingError);
    await service.cancelReview(requests[3].requestId, requests[3].ownerAddress);
    // One confirmation does not free a slot or make its change eligible.
    commit(ccc.Transaction.fromBytes(firstState.signedBytes!), 13);
    await assert.rejects(service.prepareOffer(requests[3]), ReviewWaitingError);
    await service.cancelReview(requests[3].requestId, requests[3].ownerAddress);
    tip = 16;
    const fourth = await service.prepareOffer(requests[3]);
    assert.notEqual(fourth.rawHash, first.rawHash);
    await service.cancelReview(requests[3].requestId, requests[3].ownerAddress);
    const savedCells = new Map(cells),
      savedHistory = history.get(first.rawHash)!;
    history.delete(first.rawHash);
    for (const [point, cell] of cells)
      if (cell.outPoint.txHash === first.rawHash) cells.delete(point);
    for (const input of first.inputs)
      cells.set(
        ccc.OutPoint.from(input.outPoint).toHex(),
        ccc.Cell.from({
          outPoint: input.outPoint,
          cellOutput: {
            capacity: BigInt(input.capacityShannons),
            lock: input.lock,
            type: input.type,
          },
          outputData: input.data,
        }),
      );
    const afterReorg = { ...requests[3], requestId: randomUUID() };
    await assert.rejects(service.prepareOffer(afterReorg), ReviewWaitingError);
    await service.cancelReview(afterReorg.requestId, afterReorg.ownerAddress);
    cells.clear();
    for (const [point, cell] of savedCells) cells.set(point, cell);
    history.set(first.rawHash, savedHistory);
    // Previously settled A is not proven by its still-pending child B after a reorg.
    const pageRead = client.findCellsPagedNoCache;
    client.findCellsPagedNoCache = async (...args) => {
      const page = await pageRead(...args);
      return args[0].scriptType === 'lock'
        ? {
            ...page,
            cells: page.cells.filter((cell) => cell.outPoint.txHash === first.rawHash),
          }
        : page;
    };
    const childRequest = { ...requests[3], requestId: randomUUID() };
    const child = await service.prepareOffer(childRequest);
    client.findCellsPagedNoCache = pageRead;
    assert.equal(child.sponsorInput.txHash, first.rawHash);
    const childState = await submit(child, 3);
    history.delete(first.rawHash);
    const branch = atomicReservations(journal, now, new Set());
    const branchBarrier = await operatorFundingBarrier(client, journal, registry, branch.allowed);
    const pendingHashes = new Set(branchBarrier.pending.map((row) => row.transactionHash));
    assert.ok(pendingHashes.has(first.rawHash), 'pending child cannot prove orphaned parent');
    const branchReservations = branch.pending(pendingHashes);
    assert.equal(branchReservations.count, 4);
    assert.ok(branchReservations.owners.has(ownerLocks[0].hash()));
    assert.ok(
      branchReservations.outputs.has(
        ccc.OutPoint.from({ txHash: first.rawHash, index: first.sponsorChangeOutputIndex }).toHex(),
      ),
    );
    history.set(first.rawHash, savedHistory);
    commit(ccc.Transaction.fromBytes(childState.signedBytes!), 13);
    await service.status({ offerId: child.offerId, rawHash: child.rawHash });
    // Lost RPC evidence is not a free slot.
    const transactionRead = client.getTransactionNoCache;
    client.getTransactionNoCache = async () => {
      throw Error('Synthetic RPC outage');
    };
    await assert.rejects(
      service.prepareOffer({ ...requests[3], requestId: randomUUID() }),
      /Synthetic RPC outage/,
    );
    client.getTransactionNoCache = transactionRead;
    // A ready lifecycle action closes admission until its durable operation takes over.
    const drainId = operationKey(
      'report',
      'api-football-8000',
      config.protocolHash,
      first.lines[0].descriptor.creationTxHash,
    );
    const drainStarted = Date.now();
    await journal.exclusive(async () =>
      requestAdmissionDrain(journal.directory, drainId, drainStarted),
    );
    assert.equal(admissionDrain(journal.directory), drainId);
    service = new BatchService(options);
    await assert.rejects(
      service.prepareOffer({ ...requests[3], requestId: randomUUID() }),
      ReviewWaitingError,
    );
    await journal.exclusive(async () => {
      completeAdmissionDrain(
        journal.directory,
        operationKey(
          'close',
          'api-football-8000',
          config.protocolHash,
          first.lines[0].descriptor.creationTxHash,
        ),
      );
      assert.equal(admissionDrain(journal.directory), drainId);
      assert.equal(
        admissionDrain(journal.directory, drainStarted + 300_000),
        undefined,
        'failed/restarted lifecycle cannot pause admission forever',
      );
      assert.equal(
        atomicReservations(journal, now, new Set()).pending(
          new Set([second.rawHash, third.rawHash]),
        ).count,
        2,
        'scheduling expiry never releases money reservations',
      );
      completeAdmissionDrain(journal.directory, drainId);
    });
    // Corrupt/missing durable signature evidence cannot be silently ignored.
    const entryFile = join(service.store.directory, `${second.offerId}.json`);
    const saved = readFileSync(entryFile, 'utf8');
    const entry = JSON.parse(saved);
    entry.signedBytes = thirdState.signedBytes;
    writeFileSync(entryFile, JSON.stringify(entry));
    assert.throws(() => atomicReservations(journal, now, new Set()), /signed bytes do not match/);
    writeFileSync(entryFile, saved);
    now += 100_000;
    cancelUnsignedSponsorOffers(journal.directory);
    const reservations = atomicReservations(journal, now, new Set()).pending(
      new Set([second.rawHash, third.rawHash]),
    );
    assert.equal(reservations.count, 2, 'signed reservations survive unsigned expiry and restart');
    const secondTx = ccc.Transaction.fromBytes(secondState.signedBytes!);
    assert.equal(
      reservations.outputs.has(ccc.OutPoint.from({ txHash: secondTx.hash(), index: 0 }).toHex()),
      true,
    );
    // Four-confirmation check uses actual transaction contents and canonical header.
    const fundingCell = ccc.Cell.from({
      ...funding.getOutput(4)!,
      outPoint: { txHash: funding.hash(), index: 4 },
    });
    assert.equal(await confirmedFunding(client, fundingCell), true);
    const realHeader = client.getHeaderByNumberNoCache;
    client.getHeaderByNumberNoCache = async () => header(999);
    assert.equal(await confirmedFunding(client, fundingCell), false);
    client.getHeaderByNumberNoCache = realHeader;
    console.log(
      `PASS three ${existingMarket ? 'same-market lanes' : 'independent creations'}, fourth queues, restart, depth, RPC failure and lifecycle drain`,
    );
  } finally {
    const target = resolve(directory);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith('streak-concurrency-')
    )
      throw Error('Unsafe concurrency test cleanup target');
    rmSync(target, { recursive: true, force: true });
  }
}

void (async () => {
  await scenario(false);
  await scenario(true);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
