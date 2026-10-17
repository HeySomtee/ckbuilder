import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import * as ccc from '@ckb-ccc/core';
import type { Match } from './types';
import {
  PUBLIC_DIRECT_CONFIG,
  LEGACY_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  createRecord,
  DirectRegistry,
  type DirectProtocolConfig,
} from './modules/direct/registry';
import {
  ProvisionQueue,
  parseProvisionCatalogue,
  provisionCycle,
  readProvisioningProgress,
  provisioningCatalogueUrl,
  verifyProvisionFixture,
  type ProvisionBarrier,
  type ProvisionPorts,
  type ProvisionFixture,
} from './modules/direct/provision';
import { OperatorJournal, operationKey } from './modules/direct/journal';
import {
  operatorFundingBarrier,
  assertFreshOperatorInputs,
  loadOperatorDeployment,
} from './modules/direct/cli';
import { workerCycle } from './modules/direct/worker';

const NOW = 1_800_000_000_000;
const CKB = 100_000_000n;
const reserve = 3050n * CKB;
const H = (byte: string): `0x${string}` => `0x${byte.repeat(64)}`;
function fixture(id: number, kickoff = NOW + 3_600_000): Match {
  return {
    id: `api-football-${id}`,
    sport: 'football',
    date: new Date(kickoff).toISOString().slice(0, 10),
    kickoff: new Date(kickoff).toISOString(),
    status: 'scheduled',
    stage: 'Isolated fixture',
    home: { id: '1', name: 'Synthetic Home', code: 'H', flag: '' },
    away: { id: '2', name: 'Synthetic Away', code: 'A', flag: '' },
    oracle: {
      provider: 'api-football',
      source: PROVIDER_ORIGIN,
      fixtureId: String(id),
      status: 'NS',
    },
  };
}
function payload(count: number, now = NOW) {
  return {
    format: 'streak-direct-fixtures-v1',
    provider: 'football',
    source: PROVIDER_ORIGIN,
    enabled: true,
    simulated: false,
    observedAtMs: now,
    coverage: { from: '2027-01-01', to: '2027-01-31', complete: true },
    fixtures: Array.from({ length: count }, (_, index) => fixture(index + 1)),
  };
}
function record(entry: ProvisionFixture, config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG) {
  const args = Buffer.alloc(172);
  args.writeBigUInt64LE(BigInt(entry.kickoffMs), 68);
  Buffer.from(config.guardHash.slice(2), 'hex').copy(args, 76);
  return createRecord(
    fixture(Number(entry.providerFixtureId), entry.kickoffMs),
    { codeHash: config.protocolHash, hashType: 'data2', args: `0x${args.toString('hex')}` },
    H('1'),
    config,
  );
}
function header(hash: string, number: number): ccc.ClientBlockHeader {
  return ccc.ClientBlockHeader.from({
    compactTarget: 0,
    dao: { c: 0, ar: 0, s: 0, u: 0 },
    epoch: [0, 0, 1],
    extraHash: H('0'),
    hash,
    nonce: 0,
    number,
    parentHash: H('0'),
    proposalsHash: H('0'),
    timestamp: NOW,
    transactionsRoot: H('0'),
    version: 0,
  });
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'streak-provision-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('No live HTTP in provisioning tests');
  };
  try {
    const catalogue = parseProvisionCatalogue(payload(300), NOW);
    assert.equal(
      catalogue.fixtures.length,
      300,
      'all scheduled fixtures remain visible beyond the funded registry limit',
    );
    assert.throws(
      () => parseProvisionCatalogue({ ...payload(1), simulated: true }, NOW),
      /untrusted/,
    );
    assert.throws(() => parseProvisionCatalogue(payload(1), NOW + 120_001), /stale/);
    assert.throws(
      () => parseProvisionCatalogue({ ...payload(1), fixtures: [fixture(1), fixture(1)] }, NOW),
      /duplicate/,
    );
    assert.throws(() =>
      parseProvisionCatalogue(
        { ...payload(1), fixtures: [{ ...fixture(1), oracle: { provider: 'dummy' } }] },
        NOW,
      ),
    );
    assert.equal(
      parseProvisionCatalogue(
        { ...payload(1), fixtures: [{ ...fixture(1), status: 'final' }] },
        NOW,
      ).fixtures.length,
      0,
    );
    assert.equal(
      provisioningCatalogueUrl('http://127.0.0.1:4100/api/direct/fixtures'),
      'http://127.0.0.1:4100/api/direct/fixtures',
    );
    for (const bad of [
      'https://example.com/api/direct/fixtures',
      'http://127.0.0.1:4100/api/matches',
      'http://user@127.0.0.1/api/direct/fixtures',
      'http://127.0.0.1/api/direct/fixtures?key=secret',
    ])
      assert.throws(() => provisioningCatalogueUrl(bad));
    verifyProvisionFixture(fixture(1), catalogue.fixtures[0]);
    assert.throws(
      () =>
        verifyProvisionFixture(
          { ...fixture(1), kickoff: new Date(NOW + 4_000_000).toISOString() },
          catalogue.fixtures[0],
        ),
      /differs/,
    );
    console.log(
      'PASS provisioning admits the full real-source catalogue and rejects foreign, stale or changed fixture evidence',
    );

    const queue = new ProvisionQueue(join(directory, 'all'));
    queue.synchronize(catalogue, NOW);
    assert.equal(
      new ProvisionQueue(queue.directory).entries.length,
      300,
      'full queue survives restart',
    );
    queue.observedFundingCapacityShannons = (27_000n * CKB).toString();
    const progressDirectory = join(directory, 'public');
    const progress = queue.publish(progressDirectory, reserve, NOW);
    assert.equal(progress.counts.queued, 300);
    assert.equal(progress.remainingReserveShannons, (300n * reserve).toString());
    assert.equal(progress.estimatedShortfallShannons, (300n * reserve - 27_000n * CKB).toString());
    const publicFile = join(progressDirectory, 'provisioning.json');
    writeFileSync(
      publicFile,
      JSON.stringify({
        ...progress,
        signedTransaction: 'private state must never escape this reader',
      }),
    );
    assert(!('signedTransaction' in readProvisioningProgress(progressDirectory)!));
    assert.throws(() => new ProvisionQueue(queue.directory, H('f')), /another deployment/);
    const registrations = catalogue.fixtures.slice(0, 256).map((entry) => record(entry));
    let creates = 0;
    await provisionCycle(queue, {
      now: () => NOW,
      registered: () => registrations,
      barrier: async () => ({ clear: true, pending: [] }),
      available: async () => {
        throw Error('Full registry must not attempt funding reads');
      },
      create: async () => {
        creates++;
      },
      resume: async () => {
        throw Error('Unexpected retry');
      },
    });
    const full = queue.publish(progressDirectory, reserve, NOW);
    assert.equal(full.counts.funded, 256);
    assert.equal(full.counts['blocked-registry-limit'], 44);
    assert.equal(full.remainingReserveShannons, (44n * reserve).toString());
    assert.equal(creates, 0);
    console.log(
      'PASS durable all-fixture queue, explicit registry overflow and public reserve/shortfall accounting',
    );

    const serial = new ProvisionQueue(join(directory, 'serial'));
    serial.synchronize(parseProvisionCatalogue(payload(3), NOW), NOW);
    let barrier: ProvisionBarrier = { clear: true, pending: [] };
    const funded: ReturnType<typeof record>[] = [];
    let resumes = 0;
    const ports: ProvisionPorts = {
      now: () => NOW,
      registered: () => funded,
      barrier: async () => barrier,
      available: async () => 10_000n * CKB,
      create: async (entry) => {
        creates++;
        barrier = {
          clear: false,
          pending: [
            {
              fixtureId: entry.fixtureId,
              action: 'create',
              protocolHash: PUBLIC_DIRECT_CONFIG.protocolHash,
              transactionHash: H('2'),
              kickoffMs: entry.kickoffMs,
              status: 'uncertain',
            },
          ],
        };
        throw Error('Synthetic process loss after persist and network submission');
      },
      resume: async () => {
        resumes++;
      },
    };
    await provisionCycle(serial, ports);
    assert.equal(creates, 1);
    const restored = new ProvisionQueue(serial.directory);
    await provisionCycle(restored, ports);
    assert.equal(creates, 1, 'an ambiguous signature blocks every other creation after restart');
    assert.equal(restored.entries[0].transactionHash, H('2'));
    barrier.pending[0].status = 'ready-to-rebroadcast';
    await provisionCycle(restored, ports);
    assert.equal(resumes, 1, 'only the saved creation may be resent');
    assert.equal(creates, 1);
    barrier.pending[0].status = 'committed';
    barrier.pending[0].confirmations = 3;
    await provisionCycle(restored, ports);
    assert.equal(creates, 1);
    funded.push(record(restored.entries[0]));
    barrier = { clear: true, pending: [] };
    await provisionCycle(restored, {
      ...ports,
      create: async () => {
        creates++;
      },
    });
    assert.equal(creates, 2, 'only after the prior creation is funded can the next fixture begin');
    barrier = {
      clear: false,
      pending: [
        {
          fixtureId: 'api-football-99',
          action: 'report',
          protocolHash: LEGACY_DIRECT_CONFIG.protocolHash,
          transactionHash: H('3'),
          kickoffMs: NOW - 1000,
          status: 'uncertain',
        },
      ],
    };
    await provisionCycle(restored, ports);
    assert.equal(creates, 2, 'legacy reporting also reserves shared operator funding');
    console.log(
      'PASS serial creation, restart recovery, exact-byte retry and cross-generation unresolved-spend barrier',
    );

    const poor = new ProvisionQueue(join(directory, 'poor'));
    poor.synchronize(parseProvisionCatalogue(payload(2), NOW), NOW);
    await provisionCycle(poor, {
      ...ports,
      barrier: async () => ({ clear: true, pending: [] }),
      registered: () => [],
      create: async () => {
        throw Error('No eligible untyped operator funding cell in the bounded 64-cell page.');
      },
    });
    assert(poor.entries.every((entry) => entry.status === 'blocked-capacity'));
    assert.equal(poor.status, 'blocked-capacity');
    const oldEntries = poor.entries.map((entry) => entry.fixtureId);
    poor.synchronize(
      parseProvisionCatalogue({ ...payload(2), observedAtMs: NOW + 1, fixtures: [] }, NOW + 1),
      NOW + 1,
    );
    assert.deepEqual(
      poor.entries.map((entry) => entry.fixtureId),
      oldEntries,
    );
    assert(poor.entries.every((entry) => entry.status === 'withdrawn'));
    const retryQueue = new ProvisionQueue(join(directory, 'retry'));
    retryQueue.synchronize(parseProvisionCatalogue(payload(2), NOW), NOW);
    const attempted: string[] = [];
    const retryPorts = {
      ...ports,
      barrier: async () => ({ clear: true, pending: [] }),
      registered: () => [],
      create: async (entry: ProvisionFixture) => {
        attempted.push(entry.fixtureId);
        if (entry.fixtureId === 'api-football-1')
          throw Error('Fresh provider fixture differs from the queued catalogue');
      },
    };
    await provisionCycle(retryQueue, retryPorts);
    retryQueue.synchronize(
      parseProvisionCatalogue({ ...payload(2), observedAtMs: NOW + 1 }, NOW + 1),
      NOW + 1,
    );
    await provisionCycle(retryQueue, { ...retryPorts, now: () => NOW + 1 });
    assert.deepEqual(
      attempted,
      ['api-football-1', 'api-football-2'],
      'one stale upstream fixture cannot starve every later market',
    );
    let reads = 0;
    const due = record({ ...catalogue.fixtures[0], kickoffMs: NOW - 60_000 });
    const future = catalogue.fixtures.slice(1, 201).map((entry) => record(entry));
    const result = await workerCycle([...future, due], 199, {
      now: () => NOW,
      inspect: async () => {
        reads++;
        return { exists: true, closed: false, eligibleReport: true };
      },
      execute: async () => {},
    });
    assert.equal(reads, 1);
    assert.equal(result.results[0].action, 'settle', 'future catalogue cannot starve a due report');
    console.log(
      'PASS explicit capacity blocks, withdrawn fixture retention and due lifecycle priority over future markets',
    );

    const journal = new OperatorJournal(join(directory, 'journal'));
    const registry = new DirectRegistry(join(directory, 'registry'));
    const lock = { codeHash: H('0'), hashType: 'data2' as const, args: `0x${'00'.repeat(20)}` };
    const tx = ccc.Transaction.from({
      inputs: [{ previousOutput: { txHash: H('9'), index: 0 } }],
      outputs: [{ capacity: 100n * CKB, lock }],
      outputsData: ['0x'],
      witnesses: ['0x00'],
    });
    const current = record(catalogue.fixtures[0]);
    current.creationTxHash = tx.hash();
    const operation = journal.persist('create', current, tx, NOW);
    assert.throws(() => assertFreshOperatorInputs(journal, tx), /already belongs/);
    const unrelated = tx.clone();
    unrelated.inputs[0].previousOutput.txHash = H('a');
    assertFreshOperatorInputs(journal, unrelated);
    assert.equal(operation.operationId, operationKey('create', current.fixtureId));
    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    let depth = 3;
    let canonical = H('6');
    client.getTransactionNoCache = async () =>
      ccc.ClientTransactionResponse.from({
        transaction: tx,
        status: 'committed',
        blockHash: H('6'),
        blockNumber: 10,
      });
    client.getHeaderByNumberNoCache = async () => header(canonical, 10);
    client.getTipHeader = async () => header(H('7'), 10 + depth - 1);
    assert.equal((await operatorFundingBarrier(client, journal, registry)).clear, false);
    depth = 4;
    assert.equal((await operatorFundingBarrier(client, journal, registry)).clear, true);
    assert.equal(registry.get(current.fixtureId)?.creationTxHash, tx.hash());
    assert.equal(
      (await operatorFundingBarrier(client, journal, registry)).clear,
      true,
      'stored confirmation threshold does not remain stuck below four',
    );
    canonical = H('8');
    assert.equal(
      (await operatorFundingBarrier(client, journal, registry)).clear,
      false,
      'latest funding anchor is rechecked canonically',
    );
    const legacy = record(catalogue.fixtures[0], LEGACY_DIRECT_CONFIG);
    const prior = journal.persist('close', legacy, tx, NOW - 1);
    assert.equal(prior.operationId, `close-${legacy.fixtureId}`);
    assert.deepEqual(journal.load(prior.operationId), prior);
    assert.equal(
      readFileSync(join(journal.directory, `${operation.operationId}.json`), 'utf8').includes(
        operation.signedTransaction,
      ),
      true,
    );
    console.log(
      'PASS durable funding barrier waits for four confirmations, detects reorgs and preserves legacy operation IDs',
    );

    const branches = new OperatorJournal(join(directory, 'branches'));
    const branchRegistry = new DirectRegistry(join(directory, 'branch-registry'));
    const branchA = tx.clone(),
      branchB = unrelated.clone();
    const aDescriptor = { ...record(catalogue.fixtures[0]), creationTxHash: branchA.hash() };
    const bDescriptor = { ...record(catalogue.fixtures[1]), creationTxHash: branchB.hash() };
    const aJob = branches.persist('create', aDescriptor, branchA, NOW);
    const bJob = branches.persist('create', bDescriptor, branchB, NOW + 1);
    branches.record(aJob.operationId, {
      transactionHash: branchA.hash(),
      status: 'committed',
      blockHash: H('2'),
      confirmations: 4,
    });
    branches.record(bJob.operationId, {
      transactionHash: branchB.hash(),
      status: 'committed',
      blockHash: H('3'),
      confirmations: 4,
    });
    const queried: string[] = [];
    client.getTransactionNoCache = async (hash) => {
      queried.push(ccc.hexFrom(hash));
      const a = hash === branchA.hash();
      return ccc.ClientTransactionResponse.from({
        transaction: a ? branchA : branchB,
        status: 'committed',
        blockHash: a ? H('2') : H('3'),
        blockNumber: a ? 10 : 20,
      });
    };
    client.getHeaderByNumberNoCache = async (height) =>
      header(height === 10n ? H('f') : H('3'), Number(height));
    client.getTipHeader = async () => header(H('4'), 23);
    const orphanedBranch = await operatorFundingBarrier(client, branches, branchRegistry);
    assert.equal(
      orphanedBranch.clear,
      false,
      'a newer independent canonical job cannot hide an older orphan',
    );
    assert.equal(orphanedBranch.pending[0].transactionHash, branchA.hash());
    assert.deepEqual(new Set(queried), new Set([branchA.hash(), branchB.hash()]));
    client.getHeaderByNumberNoCache = async (height) =>
      header(height === 10n ? H('2') : H('3'), Number(height));
    assert.equal((await operatorFundingBarrier(client, branches, branchRegistry)).clear, true);
    const merged = ccc.Transaction.from({
      inputs: [
        { previousOutput: { txHash: branchA.hash(), index: 0 } },
        { previousOutput: { txHash: branchB.hash(), index: 0 } },
      ],
      outputs: [{ capacity: 100n * CKB, lock }],
      outputsData: ['0x'],
      witnesses: ['0x00'],
    });
    const mergedDescriptor = { ...record(catalogue.fixtures[2]), creationTxHash: merged.hash() };
    const mergedJob = branches.persist('create', mergedDescriptor, merged, NOW + 2);
    branches.record(mergedJob.operationId, {
      transactionHash: merged.hash(),
      status: 'committed',
      blockHash: H('5'),
      confirmations: 4,
    });
    queried.length = 0;
    client.getTransactionNoCache = async (hash) => {
      queried.push(ccc.hexFrom(hash));
      assert.equal(
        hash,
        merged.hash(),
        'only a genuine input dependency permits ancestor-check elision',
      );
      return ccc.ClientTransactionResponse.from({
        transaction: merged,
        status: 'committed',
        blockHash: H('5'),
        blockNumber: 30,
      });
    };
    client.getHeaderByNumberNoCache = async () => header(H('5'), 30);
    client.getTipHeader = async () => header(H('6'), 33);
    assert.equal((await operatorFundingBarrier(client, branches, branchRegistry)).clear, true);
    assert.deepEqual(
      queried,
      [merged.hash()],
      'canonical merging spend proves both ancestors through actual outpoints',
    );
    const leafTransactions = new Map([
      [merged.hash(), { tx: merged, blockHash: H('5'), blockNumber: 30 }],
    ]);
    for (let index = 3; index < 8; index++) {
      const independent = tx.clone();
      independent.inputs[0].previousOutput.txHash = H(index.toString(16));
      const descriptor = {
        ...record(catalogue.fixtures[index]),
        creationTxHash: independent.hash(),
      };
      const job = branches.persist('create', descriptor, independent, NOW + index);
      const blockHash = H((index + 1).toString(16));
      branches.record(job.operationId, {
        transactionHash: independent.hash(),
        status: 'committed',
        blockHash,
        confirmations: 4,
      });
      leafTransactions.set(independent.hash(), {
        tx: independent,
        blockHash,
        blockNumber: 40 + index,
      });
    }
    queried.length = 0;
    client.getTransactionNoCache = async (hash) => {
      queried.push(ccc.hexFrom(hash));
      const leaf = leafTransactions.get(ccc.hexFrom(hash))!;
      assert(leaf);
      return ccc.ClientTransactionResponse.from({
        transaction: leaf.tx,
        status: 'committed',
        blockHash: leaf.blockHash,
        blockNumber: leaf.blockNumber,
      });
    };
    client.getHeaderByNumberNoCache = async (height) => {
      const leaf = [...leafTransactions.values()].find(
        (value) => value.blockNumber === Number(height),
      )!;
      return header(height === 47n ? H('f') : leaf.blockHash, Number(height));
    };
    client.getTipHeader = async () => header(H('e'), 50);
    assert.equal((await operatorFundingBarrier(client, branches, branchRegistry)).clear, false);
    assert.equal(
      queried.length,
      6,
      'bounded batches must inspect every independent leaf, not silently skip the fifth and later branches',
    );
    console.log(
      'PASS every independent funding branch is checked while actual committed descendants prove their ancestors',
    );

    const deploymentTx = tx.clone();
    deploymentTx.outputsData[0] = '0x01020304';
    const deploymentHash = ccc.hashCkb(deploymentTx.outputsData[0]);
    const deploymentJournal = new OperatorJournal(join(directory, 'deploy'), {
      ...PUBLIC_DIRECT_CONFIG,
      protocolHash: deploymentHash,
    });
    const deploymentFile = join(deploymentJournal.directory, 'deployment-v2.json');
    const deployment = {
      protocolHash: deploymentHash,
      transactionHash: deploymentTx.hash(),
      signedTransaction: ccc.hexFrom(deploymentTx.toBytes()),
      createdAtMs: NOW,
    };
    writeFileSync(deploymentFile, JSON.stringify(deployment));
    assert.deepEqual(loadOperatorDeployment(deploymentJournal), deployment);
    client.getTransactionNoCache = async () =>
      ccc.ClientTransactionResponse.from({ transaction: deploymentTx, status: 'pending' });
    assert.equal((await operatorFundingBarrier(client, deploymentJournal, registry)).clear, false);
    assert.throws(
      () => assertFreshOperatorInputs(deploymentJournal, deploymentTx),
      /immutable deployment/,
    );
    canonical = H('6');
    depth = 4;
    client.getHeaderByNumberNoCache = async () => header(canonical, 10);
    client.getTipHeader = async () => header(H('7'), 10 + depth - 1);
    client.getTransactionNoCache = async () =>
      ccc.ClientTransactionResponse.from({
        transaction: deploymentTx,
        status: 'committed',
        blockHash: H('6'),
        blockNumber: 10,
      });
    assert.equal((await operatorFundingBarrier(client, deploymentJournal, registry)).clear, true);
    canonical = H('8');
    assert.equal((await operatorFundingBarrier(client, deploymentJournal, registry)).clear, false);
    writeFileSync(deploymentFile, JSON.stringify({ ...deployment, transactionHash: H('f') }));
    assert.throws(() => loadOperatorDeployment(deploymentJournal), /do not match/);
    console.log(
      'PASS deployment funding sentinel blocks pending/orphan spends and rejects changed signed bytes',
    );
  } finally {
    globalThis.fetch = originalFetch;
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert(basename(target).startsWith('streak-provision-'));
    rmSync(target, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
