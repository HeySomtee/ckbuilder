import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import * as ccc from '@ckb-ccc/core';
import type { BatchOffer } from '../shared/batch-wire';
import { ActivityEventOutbox } from './modules/activity/outbox';
import { activityEventId, parseActivityEventBatch } from './modules/activity/events';
import { OperatorJournal } from './modules/direct/journal';
import { SponsorJournal } from './modules/direct/sponsor-journal';
import { createSponsorServer } from './modules/direct/sponsor-http';
import { SponsorService, type SponsorOffer } from './modules/direct/sponsor';
import {
  DirectRegistry,
  createRecord,
  V3_DIRECT_CONFIG,
  V4_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
} from './modules/direct/registry';
import type { Match } from './types';

const H = (digit: string): `0x${string}` => `0x${digit.repeat(64)}`;
const NOW = 1_800_000_000_000,
  CKB = 100_000_000n;
async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'streak-activity-events-'));
  let relay: ActivityEventOutbox | undefined;
  try {
    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] }),
      signer = new ccc.SignerCkbPrivateKey(client, `0x${'01'.repeat(32)}`),
      ownerLock = (await signer.getRecommendedAddressObj()).script,
      ownerAddress = await signer.getRecommendedAddress(),
      args = Buffer.alloc(172);
    args.writeBigUInt64LE(BigInt(NOW + 3_600_000), 68);
    Buffer.from(V3_DIRECT_CONFIG.guardHash.slice(2), 'hex').copy(args, 76);
    const type = ccc.Script.from({
      codeHash: V3_DIRECT_CONFIG.protocolHash,
      hashType: 'data2',
      args: ccc.hexFrom(args),
    });
    const ticket = Buffer.alloc(45);
    ticket.set([1, 0, 0, 1]);
    Buffer.from(ownerLock.hash().slice(2), 'hex').copy(ticket, 4);
    ticket[36] = 1;
    ticket.writeBigUInt64LE(100n * CKB, 37);
    const guard = {
      codeHash: V3_DIRECT_CONFIG.guardHash,
      hashType: 'data2' as const,
      args: type.hash(),
    };
    const tx = ccc.Transaction.from({
      inputs: [{ previousOutput: { txHash: H('1'), index: 0 } }],
      outputs: [
        { capacity: 610n * CKB, lock: guard, type },
        { capacity: 1031n * CKB, lock: guard, type },
      ],
      outputsData: ['0x000000', ccc.hexFrom(ticket)],
      witnesses: [ccc.hexFrom(Buffer.from('isolated-private-witness-must-not-be-exported'))],
    });
    const fixture: Match = {
      id: 'api-football-98765',
      sport: 'football',
      date: '2027-01-15',
      kickoff: new Date(NOW + 3_600_000).toISOString(),
      status: 'scheduled',
      stage: 'Synthetic isolated test',
      home: { id: '1', name: 'Home', code: 'H', flag: '' },
      away: { id: '2', name: 'Away', code: 'A', flag: '' },
      oracle: { provider: 'api-football', fixtureId: '98765', source: PROVIDER_ORIGIN },
    };
    const record = createRecord(
        fixture,
        { codeHash: type.codeHash, hashType: 'data2', args: type.args },
        tx.hash(),
        V3_DIRECT_CONFIG,
      ),
      descriptor = { ...record, entryEnabled: false },
      journal = new OperatorJournal(join(directory, 'operator'), V3_DIRECT_CONFIG),
      operation = journal.persist('create', record, tx, NOW);
    journal.record(operation.operationId, {
      transactionHash: tx.hash(),
      status: 'committed',
      blockHash: H('a'),
      confirmations: 4,
    });
    const store = new SponsorJournal(journal.directory),
      offerId = randomUUID();
    const offer: SponsorOffer = {
      version: 'sponsored-create-v1',
      offerId,
      expiresAt: NOW + 60_000,
      fixture: {
        fixtureId: record.fixtureId,
        label: record.label,
        cutoffMs: record.cutoffMs,
        terms: record.terms,
        termsHash: record.termsHash,
        state: 'funded',
        sponsorLock: ownerLock,
      },
      descriptor,
      rawHash: tx.hash(),
      unsignedBytes: ccc.hexFrom(tx.toBytes()),
      sponsorLock: ownerLock,
      sponsorInput: { txHash: H('1'), index: 0 },
      ownerLock,
      userInputIndexes: [0],
      reserveShannons: '305000000000',
      feeShannons: '1000',
      outcome: 1,
      principalShannons: '10000000000',
    };
    store.save({
      version: 1,
      requestId: randomUUID(),
      requestDigest: H('2'),
      ownerAddress,
      createdAtMs: NOW,
      lineageOrigins: [],
      offer,
      state: 'funded',
      signedBytes: ccc.hexFrom(tx.toBytes()),
    });
    // Simulate all financial writes completing before relay materialization, then restarting.
    relay = new ActivityEventOutbox(journal);
    const first = parseActivityEventBatch(relay.read());
    assert.equal(first.hasMore, false);
    assert.equal(first.events.length, 3);
    const payment = first.events.find((event) => event.kind === 'payment')!;
    const { id: paymentId, ...paymentContent } = payment;
    assert.equal(
      activityEventId(
        Object.fromEntries(Object.entries(paymentContent).reverse()) as typeof paymentContent,
      ),
      paymentId,
      'event identity does not depend on JSON object property ordering',
    );
    assert.equal(payment.positions?.[0].ownerHash, ownerLock.hash());
    assert.deepEqual(payment.positions?.[0].position.outPoint, { txHash: tx.hash(), index: 1 });
    assert.equal(payment.positions?.[0].position.principalShannons, '10000000000');
    assert.equal(payment.positions?.[0].position.status, 'submitted');
    const exported = JSON.stringify(first);
    for (const privateValue of [offer.unsignedBytes, tx.witnesses[0], ownerAddress])
      assert.ok(!exported.includes(privateValue), 'private signing inputs are not exported');
    assert.doesNotMatch(
      exported,
      /signedBytes|unsignedBytes|witnesses|ownerAddress|private-witness/,
    );
    assert.deepEqual(
      new Set(relay.read().events.map((event) => event.id)),
      new Set(first.events.map((event) => event.id)),
      'unacknowledged events replay exactly',
    );
    relay.close();
    relay = new ActivityEventOutbox(journal);
    assert.deepEqual(
      new Set(relay.read().events.map((event) => event.id)),
      new Set(first.events.map((event) => event.id)),
      'a relay restart retains the unacknowledged outbox',
    );
    assert.throws(() => relay!.acknowledge({ ids: [H('f')] }), /not delivered/);
    relay.acknowledge({ ids: first.events.map((event) => event.id) });
    relay.close();
    relay = new ActivityEventOutbox(journal);
    assert.deepEqual(relay.read().events, [], 'acknowledgements survive restart and source replay');
    journal.record(operation.operationId, {
      transactionHash: tx.hash(),
      status: 'committed',
      blockHash: H('a'),
      confirmations: 10,
    });
    assert.deepEqual(
      relay.read().events,
      [],
      'same canonical observation at deeper confirmation deduplicates',
    );
    journal.record(operation.operationId, {
      transactionHash: tx.hash(),
      status: 'committed',
      blockHash: H('b'),
      confirmations: 4,
    });
    const forkB = relay.read();
    assert.equal(
      forkB.events.length,
      2,
      'operator and payment lines wake after canonical block changes',
    );
    relay.acknowledge({ ids: forkB.events.map((event) => event.id) });
    journal.record(operation.operationId, {
      transactionHash: tx.hash(),
      status: 'committed',
      blockHash: H('a'),
      confirmations: 4,
    });
    const forkA = relay.read();
    assert.equal(
      forkA.events.length,
      2,
      'reorg back to an earlier block is a new durable observation',
    );
    assert.ok(forkA.events.every((event) => !first.events.some((prior) => prior.id === event.id)));
    relay.acknowledge({ ids: forkA.events.map((event) => event.id) });
    assert.throws(
      () =>
        parseActivityEventBatch({
          events: [
            {
              ...payment,
              positions: [
                {
                  ...payment.positions![0],
                  position: { ...payment.positions![0].position, principalShannons: '1' },
                },
              ],
            },
          ],
          hasMore: false,
        }),
      /Invalid submitted/,
    );
    assert.throws(
      () => parseActivityEventBatch({ events: Array(65).fill(payment), hasMore: false }),
      /Invalid activity event batch/,
    );
    console.log(
      'PASS activity public relay preserves journal crash gaps, exact pending tickets, deduplication, restarts and reorg notifications',
    );

    const batchArgs = Buffer.from(args),
      secondArgs = Buffer.from(args);
    batchArgs.writeUInt32LE(2, 32);
    secondArgs[0] = 1;
    const firstType = ccc.Script.from({
        codeHash: V4_DIRECT_CONFIG.protocolHash,
        hashType: 'data2',
        args: ccc.hexFrom(batchArgs),
      }),
      secondType = ccc.Script.from({
        codeHash: V4_DIRECT_CONFIG.protocolHash,
        hashType: 'data2',
        args: ccc.hexFrom(secondArgs),
      }),
      batchOutput = (marketType: ccc.Script, capacity: bigint) => ({
        capacity,
        type: marketType,
        lock: {
          codeHash: V4_DIRECT_CONFIG.guardHash,
          hashType: 'data2' as const,
          args: marketType.hash(),
        },
      });
    const secondTicket = Buffer.from(ticket);
    secondTicket[36] = 2;
    secondTicket.writeBigUInt64LE(200n * CKB, 37);
    const batchTx = ccc.Transaction.from({
      inputs: tx.inputs,
      outputs: [
        ...Array.from({ length: 2 }, () => ({ capacity: 100n * CKB, lock: ownerLock })),
        batchOutput(firstType, 610n * CKB),
        batchOutput(firstType, 1031n * CKB),
        ...Array.from({ length: 3 }, () => batchOutput(firstType, 610n * CKB)),
        batchOutput(secondType, 1131n * CKB),
      ],
      outputsData: [
        '0x',
        '0x',
        '0x0000ff',
        ccc.hexFrom(ticket),
        '0x01010000',
        '0x01020000',
        '0x01030000',
        ccc.hexFrom(secondTicket),
      ],
      witnesses: tx.witnesses,
    });
    const secondFixture: Match = {
      ...fixture,
      id: 'api-football-98766',
      oracle: { provider: 'api-football', fixtureId: '98766', source: PROVIDER_ORIGIN },
    };
    const firstRecord = {
        ...createRecord(
          fixture,
          { codeHash: firstType.codeHash, hashType: 'data2', args: firstType.args },
          batchTx.hash(),
          V4_DIRECT_CONFIG,
        ),
        entryEnabled: false,
      },
      secondRecord = {
        ...createRecord(
          secondFixture,
          { codeHash: secondType.codeHash, hashType: 'data2', args: secondType.args },
          H('d'),
          V4_DIRECT_CONFIG,
        ),
        entryEnabled: false,
      };
    const batchOffer: BatchOffer = {
      ...offer,
      version: 'atomic-predictions-v1',
      offerId: randomUUID(),
      rawHash: batchTx.hash(),
      unsignedBytes: ccc.hexFrom(batchTx.toBytes()),
      descriptor: firstRecord,
      inputs: [0, 1].map((index) => ({
        outPoint: { txHash: H('3'), index },
        capacityShannons: '1000000000000',
        lock: ownerLock,
        data: '0x',
      })),
      lines: [
        {
          fixture: offer.fixture,
          descriptor: firstRecord,
          mode: 'create',
          outcome: 1,
          principalShannons: '10000000000',
          shard: 0,
          outputIndex: 2,
          outputCount: 5,
        },
        {
          fixture: { ...offer.fixture, fixtureId: secondRecord.fixtureId },
          descriptor: secondRecord,
          mode: 'deposit',
          outcome: 2,
          principalShannons: '20000000000',
          shard: 0,
          outputIndex: 7,
          outputCount: 1,
        },
      ],
      principalShannons: '30000000000',
      storageShannons: '64200000000',
      sponsorChangeOutputIndex: 8,
      ownerChangeOutputIndex: 9,
    };
    new SponsorJournal(journal.directory, 'atomic-v4').save({
      version: 1,
      requestId: randomUUID(),
      requestDigest: H('4'),
      ownerAddress,
      createdAtMs: NOW,
      lineageOrigins: [],
      offer: batchOffer,
      state: 'signed',
      signedBytes: ccc.hexFrom(batchTx.toBytes()),
    });
    const atomicEvents = relay.read();
    assert.equal(atomicEvents.events.length, 1);
    assert.deepEqual(
      atomicEvents.events[0].positions?.map((item) => ({
        index: item.position.outPoint.index,
        amount: item.position.principalShannons,
        outcome: item.position.outcome,
      })),
      [
        { index: 3, amount: '10000000000', outcome: 1 },
        { index: 7, amount: '20000000000', outcome: 2 },
      ],
    );
    assert.equal(atomicEvents.events[0].descriptors.length, 2);
    relay.acknowledge({ ids: atomicEvents.events.map((event) => event.id) });
    console.log(
      'PASS atomic Activity relay includes existing and new markets with exact distinct output offsets',
    );

    const badPending = join(journal.directory, 'activity-outbox', 'pending', `${H('f')}.json`);
    writeFileSync(badPending, '{ malformed generated public observation');
    journal.record(operation.operationId, {
      transactionHash: tx.hash(),
      status: 'committed',
      blockHash: H('c'),
      confirmations: 4,
    });
    const isolated = relay.read();
    assert.equal(isolated.degraded, true);
    assert.equal(
      isolated.events.length,
      2,
      'malformed public observation cannot block healthy delivery',
    );
    assert.equal(existsSync(badPending), false, 'bad generated copy leaves the delivery queue');
    const quarantine = join(journal.directory, 'activity-outbox', 'quarantine'),
      badCopy = readdirSync(quarantine).find((name) => name.startsWith(`event-${H('f')}-`));
    assert.ok(badCopy);
    assert.equal(
      readFileSync(join(quarantine, badCopy), 'utf8'),
      '{ malformed generated public observation',
    );
    assert.equal(
      journal.load(operation.operationId)?.signedTransaction,
      ccc.hexFrom(tx.toBytes()),
      'quarantining a public copy does not modify financial recovery source',
    );
    relay.acknowledge({ ids: isolated.events.map((event) => event.id) });
    relay.close();
    relay = new ActivityEventOutbox(journal);
    const restartedDegraded = relay.read();
    assert.equal(
      restartedDegraded.degraded,
      true,
      'operator review requirement persists across restarts',
    );
    assert.deepEqual(restartedDegraded.events, []);
    assert.throws(
      () => parseActivityEventBatch({ events: [], hasMore: false, degraded: 'yes' }),
      /Invalid activity event batch/,
    );
    assert.equal(parseActivityEventBatch({ events: [], hasMore: false }).degraded, false);
    const corruptSource = join(
      journal.directory,
      `close-v3-api-football-98765-${tx.hash().slice(2)}.json`,
    );
    writeFileSync(corruptSource, '{ preserve this malformed source for operator review');
    journal.record(operation.operationId, {
      transactionHash: tx.hash(),
      status: 'committed',
      blockHash: H('d'),
      confirmations: 4,
    });
    const sourceIsolated = relay.read();
    assert.equal(sourceIsolated.degraded, true);
    assert.equal(
      sourceIsolated.events.length,
      2,
      'corrupt source does not block another healthy source',
    );
    assert.equal(
      readFileSync(corruptSource, 'utf8'),
      '{ preserve this malformed source for operator review',
    );
    assert.equal(readdirSync(quarantine).filter((name) => name.startsWith('source-')).length, 1);
    relay.acknowledge({ ids: sourceIsolated.events.map((event) => event.id) });
    relay.close();
    relay = new ActivityEventOutbox(journal);
    assert.equal(relay.read().degraded, true);
    assert.equal(
      readdirSync(quarantine).filter((name) => name.startsWith('source-')).length,
      1,
      'repeated malformed source observations retain one review marker',
    );
    console.log(
      'PASS malformed Activity copies and sources are quarantined without blocking healthy delivery or losing recovery bytes',
    );

    for (let index = 0; index < 300; index++)
      writeFileSync(join(journal.directory, `ignored-${index}.txt`), 'isolated');
    assert.equal(relay.read().hasMore, true, 'source directory enumeration is bounded per request');
    assert.equal(relay.read().hasMore, false, 'bounded scanning continues to completion');
    relay.close();
    const service = new SponsorService({
      client,
      signer,
      journal,
      registry: new DirectRegistry(join(directory, 'registry'), V3_DIRECT_CONFIG),
      config: V3_DIRECT_CONFIG,
      fixture: async () => fixture,
    });
    const secret = 'e'.repeat(64),
      server = createSponsorServer(service, secret);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      assert.equal((await fetch(`${base}/activity/events`)).status, 401);
      const response = await fetch(`${base}/activity/events`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      parseActivityEventBatch(await response.json());
      const ack = await fetch(`${base}/activity/ack`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ request: { ids: [] } }),
      });
      assert.deepEqual(await ack.json(), { acknowledged: 0 });
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
    console.log('PASS activity relay IPC is authenticated, private, bounded and key-free');
  } finally {
    relay?.close();
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir())))
      throw Error('Test cleanup escaped temporary directory');
    rmSync(target, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
