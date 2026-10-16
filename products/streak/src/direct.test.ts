import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import * as ccc from '@ckb-ccc/core';
import type { Match } from './types';
import {
  DirectRegistry,
  PUBLIC_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  createRecord,
  termsDigest,
  validateRecord,
} from './modules/direct/registry';
import {
  confirmFootballEvidence,
  parseFootballObservation,
  validateFootballEvidence,
  validateScheduledFixture,
} from './modules/direct/oracle';
import { OperatorJournal, broadcastOperation, reconcileOperation } from './modules/direct/journal';
import { buildReport, fundedPayout } from './modules/direct/operator';
import { runOperator } from './modules/direct/cli';
import { workerCycle, runWorkerOnce, type WorkerState } from './modules/direct/worker';

const H = (byte: string) => `0x${byte.repeat(64)}`;
const CKB = 100_000_000n;
const config = PUBLIC_DIRECT_CONFIG;
const now = 1_800_000_000_000;
const cutoff = now + 3_600_000;
const fixture: Match = {
  id: 'api-football-12345',
  sport: 'football',
  kickoff: new Date(cutoff).toISOString(),
  date: new Date(cutoff).toISOString().slice(0, 10),
  status: 'scheduled',
  stage: 'Isolated synthetic test',
  home: { name: 'Test Home', code: 'H', flag: '' },
  away: { name: 'Test Away', code: 'A', flag: '' },
  oracle: { provider: 'api-football', source: PROVIDER_ORIGIN, fixtureId: '12345' },
};

function header(hash: string, number = 10): ccc.ClientBlockHeader {
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
    timestamp: now,
    transactionsRoot: H('0'),
    version: 0,
  });
}
function response(status = 'FT', home: unknown = 2, away: unknown = 1): Record<string, unknown> {
  return {
    errors: [],
    response: [
      {
        fixture: {
          id: 12345,
          date: fixture.kickoff,
          timestamp: cutoff / 1000,
          status: { short: status },
        },
        teams: { home: { id: 1, name: 'Test Home' }, away: { id: 2, name: 'Test Away' } },
        goals: { home: 4, away: 3 },
        score: { fulltime: { home, away } },
      },
    ],
  };
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'streak-direct-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('No live HTTP in direct server tests');
  };
  try {
    const args = Buffer.alloc(172);
    args.writeBigUInt64LE(BigInt(cutoff), 68);
    Buffer.from(config.guardHash.slice(2), 'hex').copy(args, 76);
    const record = createRecord(
      fixture,
      { codeHash: config.protocolHash, hashType: 'data2', args: `0x${args.toString('hex')}` },
      H('1'),
    );
    assert.equal(record.termsHash, termsDigest(record));
    const registry = new DirectRegistry(join(directory, 'registry'));
    assert.deepEqual(
      new DirectRegistry().describe([fixture], () => true),
      [],
    );
    assert.deepEqual(registry.add(record), record);
    assert.deepEqual(registry.add(record), record, 'identical registration is idempotent');
    assert.throws(() => registry.add({ ...record, creationTxHash: H('2') }), /Cannot replace/);
    assert.equal(registry.describe([fixture], () => true, fixture.id, now)[0].entryEnabled, true);
    assert.equal(registry.describe([fixture], () => false, fixture.id, now)[0].entryEnabled, false);
    assert.equal(registry.describe([], () => true, fixture.id, now)[0].entryEnabled, false);
    assert.equal(
      registry.describe([fixture], () => true, fixture.id, cutoff)[0].entryEnabled,
      false,
    );
    assert.match(
      registry.describe(
        [{ ...fixture, kickoff: new Date(cutoff + 1).toISOString() }],
        () => true,
        fixture.id,
        now,
      )[0].entryUnavailableReason!,
      /changed kickoff/,
    );
    assert.equal(
      registry.describe([{ ...fixture, status: 'postponed' }], () => true, fixture.id, now)[0]
        .entryEnabled,
      false,
    );
    assert.throws(() => registry.get('../../keys'), /Invalid football fixture ID/);
    for (const bad of [
      { ...record, termsHash: H('0') },
      { ...record, type: { ...record.type, codeHash: H('0') } },
      { ...record, cutoffMs: cutoff + 1000 },
      { ...record, terms: { ...record.terms, rules: 'include-extra-time' } },
      { ...record, terms: { ...record.terms, deadlineMs: cutoff + 5 * 3_600_000 } },
      { ...record, fixtureId: 'api-football-999' },
    ])
      assert.throws(() => validateRecord(bad));
    const registeredFile = join(directory, 'registry', `${fixture.id}.json`);
    const original = readFileSync(registeredFile, 'utf8');
    writeFileSync(registeredFile, JSON.stringify({ ...record, termsHash: H('0') }));
    assert.throws(() => registry.describe([fixture], () => true), /digest/);
    writeFileSync(registeredFile, original);
    console.log(
      'PASS direct immutable registry, pinned protocol, fixture binding and entry gating',
    );

    assert.equal(validateScheduledFixture(response('NS'), '12345', now).id, fixture.id);
    assert.throws(() => validateScheduledFixture(response('FT'), '12345', now), /scheduled/);
    assert.throws(() => validateScheduledFixture(response('NS'), '54321', now), /requested/);
    assert.throws(
      () => validateScheduledFixture(response('NS'), '12345', cutoff - 1000),
      /future kickoff/,
    );
    const first = validateFootballEvidence(record, response('PEN', 1, 1), cutoff + 7_200_000);
    assert.equal(first.outcome, 1, 'penalty goals never replace the regulation draw');
    const second = validateFootballEvidence(
      record,
      response('PEN', 1, 1),
      first.observedAtMs + 30_000,
    );
    const confirmed = confirmFootballEvidence(first, second, second.observedAtMs);
    assert.equal(confirmed.previousObservation.digest, second.digest);
    assert.deepEqual(parseFootballObservation(record, second), second);
    assert.throws(
      () => confirmFootballEvidence(undefined, second, second.observedAtMs),
      /two matching/,
    );
    assert.throws(
      () =>
        confirmFootballEvidence(
          first,
          { ...second, observedAtMs: first.observedAtMs + 29_999 },
          second.observedAtMs,
        ),
      /two matching/,
    );
    assert.throws(
      () => confirmFootballEvidence(first, second, second.observedAtMs + 60_001),
      /fresh/,
    );
    assert.throws(
      () => confirmFootballEvidence(first, { ...second, outcome: 0 }, second.observedAtMs),
      /do not match/,
    );
    assert.throws(
      () => parseFootballObservation(record, { ...second, regulationHome: 2 }),
      /inconsistent/,
    );
    for (const status of ['NS', 'LIVE', 'HT', 'SUSP', 'PST', 'CANC', 'ABD', 'AWD'])
      assert.throws(
        () => validateFootballEvidence(record, response(status), cutoff + 1000),
        /supported final/,
      );
    for (const score of [null, undefined, '', '2', NaN, Infinity, -1, 1.2]) {
      const invalid = response('AET');
      (invalid.response as Record<string, unknown>[])[0].score = {
        fulltime: { home: score, away: 1 },
      };
      assert.throws(() => validateFootballEvidence(record, invalid, cutoff + 1000), /scores/);
    }
    assert.throws(() => validateFootballEvidence(record, response(), cutoff - 1), /window/);
    assert.throws(
      () => validateFootballEvidence(record, response(), record.terms.deadlineMs),
      /window/,
    );
    assert.throws(
      () =>
        validateFootballEvidence(
          record,
          { ...response(), errors: { requests: 'quota exceeded' } },
          cutoff + 1000,
        ),
      /error/,
    );
    const wrongIdentity = response();
    const wrongRow = (wrongIdentity.response as Record<string, unknown>[])[0];
    wrongRow.fixture = {
      id: 12345,
      date: new Date(cutoff + 1000).toISOString(),
      timestamp: cutoff / 1000,
      status: { short: 'FT' },
    };
    assert.throws(
      () => validateFootballEvidence(record, wrongIdentity, cutoff + 1000),
      /kickoff changed/,
    );
    console.log(
      'PASS direct oracle rejects absent fulltime scores, source changes, stale/late and single observations',
    );

    const lock = ccc.Script.from({
      codeHash: H('0'),
      hashType: 'data2',
      args: `0x${'00'.repeat(20)}`,
    });
    const tx = ccc.Transaction.from({
      inputs: [{ previousOutput: { txHash: H('2'), index: 0 } }],
      outputs: [{ capacity: 100n * CKB, lock }],
      outputsData: ['0x'],
      witnesses: ['0x00'],
    });
    const journal = new OperatorJournal(join(directory, 'journal'));
    const operation = journal.persist('close', record, tx, now);
    assert.deepEqual(journal.load(operation.operationId), operation);
    assert.deepEqual(
      new OperatorJournal(journal.directory).load(operation.operationId),
      operation,
      'restart preserves exact signed bytes',
    );
    assert.deepEqual(journal.persist('close', record, tx, now), operation);
    const other = tx.clone();
    other.outputs[0].capacity -= 1n;
    assert.throws(() => journal.persist('close', record, other, now), /already journaled/);
    let release!: () => void;
    const held = journal.exclusive(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    await assert.rejects(
      new OperatorJournal(journal.directory).exclusive(async () => {}),
      /Another operator/,
    );
    release();
    await held;
    await journal.exclusive(async () => {});

    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    let transaction: ccc.ClientTransactionResponse | undefined;
    let live = true,
      sent = 0,
      failSend = true;
    let canonical = header(H('3'));
    const fundingCell = ccc.Cell.from({
      outPoint: tx.inputs[0].previousOutput,
      cellOutput: { capacity: 101n * CKB, lock },
      outputData: '0x',
    });
    client.getTransactionNoCache = async () => transaction;
    client.getCellLiveNoCache = async () => (live ? fundingCell : undefined);
    client.getHeaderByNumberNoCache = async () => canonical;
    client.getTipHeader = async () => header(H('4'), 13);
    client.sendTransactionNoCache = async (candidate) => {
      sent++;
      assert.equal(
        journal.load(operation.operationId)?.signedTransaction,
        ccc.hexFrom(ccc.Transaction.from(candidate).toBytes()),
        'durable exact bytes exist before broadcast',
      );
      if (failSend) throw Error('Synthetic connection lost after submission');
      return tx.hash();
    };
    assert.equal((await reconcileOperation(client, operation)).status, 'ready-to-rebroadcast');
    await assert.rejects(broadcastOperation(client, journal, operation, now), /connection lost/);
    assert.equal(sent, 1);
    transaction = ccc.ClientTransactionResponse.from({ transaction: tx, status: 'pending' });
    assert.equal((await broadcastOperation(client, journal, operation, now)).status, 'pending');
    assert.equal(sent, 1, 'unknown broadcast is reconciled without a second send');
    transaction = undefined;
    failSend = false;
    assert.equal((await broadcastOperation(client, journal, operation, now)).status, 'pending');
    assert.equal(
      sent,
      2,
      'only the same persisted bytes may be rebroadcast when all inputs remain live',
    );
    transaction = ccc.ClientTransactionResponse.from({
      transaction: tx,
      status: 'committed',
      blockHash: H('3'),
      blockNumber: 10,
    });
    const committed = await reconcileOperation(client, operation);
    assert.equal(committed.status, 'committed');
    assert.equal(committed.confirmations, 4);
    canonical = header(H('5'));
    assert.equal(
      (await reconcileOperation(client, operation)).status,
      'uncertain',
      'orphan block never remains committed',
    );
    transaction = undefined;
    live = false;
    assert.equal((await broadcastOperation(client, journal, operation, now)).status, 'uncertain');
    assert.equal(sent, 2, 'spent inputs never trigger a blind rebuild or broadcast');
    transaction = ccc.ClientTransactionResponse.from({ transaction: tx, status: 'rejected' });
    assert.equal((await broadcastOperation(client, journal, operation, now)).status, 'rejected');
    assert.equal(sent, 2);
    console.log(
      'PASS direct journal persists before broadcast, resumes exact bytes and detects spent inputs/reorgs',
    );

    const dummySigner = new ccc.SignerCkbPrivateKey(client, `0x${'01'.repeat(32)}`);
    await assert.rejects(
      buildReport(
        client,
        dummySigner,
        record,
        { ...confirmed, regulationHome: 10 },
        second.observedAtMs,
      ),
      /inconsistent/,
    );
    await assert.rejects(
      buildReport(
        client,
        dummySigner,
        record,
        { ...confirmed, previousObservation: { ...first, observedAtMs: second.observedAtMs } },
        second.observedAtMs,
      ),
      /two matching/,
    );
    assert.equal(fundedPayout(101n * CKB, 0, 255, [101n * CKB, 0n, 0n]), 422n * CKB);
    assert.equal(fundedPayout(101n * CKB, 2, 0, [101n * CKB, 0n, 101n * CKB]), 321n * CKB);
    assert.equal(
      fundedPayout(101n * CKB, 0, 0, [101n * CKB, 0n, 101n * CKB]),
      (51997n * CKB) / 100n,
    );
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      await assert.rejects(
        runOperator(['create', '12345', '--broadcast']),
        /forbidden in routine tests/,
      );
    } finally {
      process.env.NODE_ENV = priorNodeEnv;
    }
    console.log(
      'PASS direct report boundary, exact payout economics and live-operator test isolation',
    );

    let time = cutoff - 1;
    let state: WorkerState = { exists: true, closed: false, eligibleReport: false };
    const actions: string[] = [];
    const ports = {
      now: () => time,
      inspect: async () => state,
      execute: async (action: 'report' | 'settle' | 'void' | 'reconcile') => {
        actions.push(action);
      },
    };
    assert.equal((await workerCycle([record], 0, ports)).results[0].action, 'wait');
    time = cutoff + 1000;
    assert.equal((await workerCycle([record], 0, ports)).results[0].action, 'report');
    time = record.terms.deadlineMs;
    assert.equal((await workerCycle([record], 0, ports)).results[0].action, 'void');
    state = { ...state, eligibleReport: true };
    assert.equal(
      (await workerCycle([record], 0, ports)).results[0].action,
      'settle',
      'eligible report cannot be voided after the deadline',
    );
    state = { ...state, blocked: 'Existing signed result is uncertain' };
    assert.equal((await workerCycle([record], 0, ports)).results[0].status, 'needs-review');
    state = { exists: true, closed: false, eligibleReport: false };
    time = cutoff + 1000;
    const failure = await workerCycle([record, record], 0, {
      ...ports,
      execute: async (action) => {
        if (action === 'report')
          throw Error(
            'First result observation saved. Run report again after at least 30 seconds.',
          );
      },
    });
    assert.equal(failure.results.length, 2);
    assert(failure.results.every((result) => result.status === 'waiting'));
    const bounded = await workerCycle(
      Array.from({ length: 6 }, () => record),
      0,
      ports,
    );
    assert.equal(bounded.results.length, 4);
    assert.equal(bounded.cursor, 4);
    assert.equal(
      (
        await workerCycle(
          Array.from({ length: 6 }, () => record),
          bounded.cursor,
          ports,
        )
      ).cursor,
      2,
    );
    const priorWorkerEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      await assert.rejects(runWorkerOnce(), /forbidden in routine tests/);
    } finally {
      process.env.NODE_ENV = priorWorkerEnv;
    }
    console.log(
      'PASS direct worker serial bounded schedule, fresh evidence waiting, eligible settlement and timeout routing',
    );
  } finally {
    globalThis.fetch = originalFetch;
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert(basename(target).startsWith('streak-direct-'));
    rmSync(target, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
