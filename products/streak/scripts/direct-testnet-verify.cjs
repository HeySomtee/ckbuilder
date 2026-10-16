/* Explicit public-chain verification. Never imported by the routine test gate. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const ccc = require('@ckb-ccc/core');
const { FileClaimJournal } = require('./direct-claim.cjs');
const { buildCreate, buildReport, buildClose } = require('../dist/modules/direct/operator');
const {
  validateFootballEvidence,
  confirmFootballEvidence,
} = require('../dist/modules/direct/oracle');
const {
  OperatorJournal,
  broadcastOperation,
  reconcileOperation,
} = require('../dist/modules/direct/journal');

async function main() {
  if (
    process.env.NODE_ENV === 'test' ||
    process.argv.slice(2).join(' ') !== '--broadcast' ||
    process.env.STREAK_DIRECT_VERIFICATION_ACK !== 'synthetic-public-testnet'
  )
    throw Error(
      'Explicit public verification requires --broadcast and STREAK_DIRECT_VERIFICATION_ACK=synthetic-public-testnet. Never run in routine tests.',
    );
  const directory = process.env.STREAK_DIRECT_VERIFICATION_DIR,
    key = process.env.STREAK_DIRECT_PRIVATE_KEY;
  if (!directory || !path.isAbsolute(directory) || !/^0x[0-9a-fA-F]{64}$/.test(key ?? ''))
    throw Error(
      'Set absolute STREAK_DIRECT_VERIFICATION_DIR and an explicit testnet STREAK_DIRECT_PRIVATE_KEY. No key file or .env is loaded.',
    );
  const { DirectClient } = await import('../web/src/features/direct/client.ts');
  const { MANIFEST, CKB, parseDescriptor } = await import('../web/src/features/direct/protocol.ts');
  const { parseRecord } = await import('../web/src/features/direct/journal.ts');
  const rpc = new ccc.ClientPublicTestnet({
    url: MANIFEST.rpc,
    fallbacks: [],
    timeout: 15_000,
    maxConcurrent: 2,
  });
  const chain = await fetch(MANIFEST.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_blockchain_info', params: [] }),
    signal: AbortSignal.timeout(15_000),
  }).then((r) => r.json());
  assert.equal(chain.result?.chain, 'ckb_testnet');
  for (const [index, expected] of [MANIFEST.protocolHash, MANIFEST.guardHash].entries()) {
    const cell = await rpc.getCellLiveNoCache(MANIFEST.codeDeps[index].outPoint, true, false);
    assert(cell && ccc.hashCkb(cell.outputData) === expected, 'Pinned deployment must match');
  }
  const signer = new ccc.SignerCkbPrivateKey(rpc, key);
  const journal = new FileClaimJournal(path.join(directory, 'owner'), parseRecord);
  const owner = new DirectClient(signer, MANIFEST, 'public-integration-verification', journal, {
    exclusive: async (_name, action) => action(),
  });
  const operator = new OperatorJournal(path.join(directory, 'operator'));
  const evidencePath = path.join(directory, 'evidence.json');
  const evidence = fs.existsSync(evidencePath)
    ? JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
    : {
        kind: 'synthetic-public-testnet',
        provider: 'Synthetic integration fixture, NOT a football API result or user activity',
        startedAt: new Date().toISOString(),
        fixtureId: `api-football-${Date.now()}`,
        checks: [],
      };
  const sourceFiles = [
    'scripts/direct-testnet-verify.cjs',
    'scripts/direct-claim.cjs',
    ...['operator', 'oracle', 'journal', 'registry'].map(
      (name) => `dist/modules/direct/${name}.js`,
    ),
    ...['client', 'discovery', 'journal', 'protocol'].map(
      (name) => `web/src/features/direct/${name}.ts`,
    ),
  ];
  const execution = {
    startedAt: new Date().toISOString(),
    baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
    }).trim(),
    files: Object.fromEntries(
      sourceFiles.map((file) => [
        file,
        createHash('sha256')
          .update(fs.readFileSync(path.resolve(__dirname, '..', file)))
          .digest('hex'),
      ]),
    ),
  };
  evidence.executions ??= [];
  evidence.executions.push(execution);
  function save() {
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
  function record(name, hash, detail = {}) {
    if (!evidence.checks.some((item) => item.name === name))
      evidence.checks.push({
        name,
        transaction: hash,
        explorer: hash ? `https://pudge.explorer.nervos.org/transaction/${hash}` : undefined,
        ...detail,
      });
    save();
    console.log(JSON.stringify({ name, hash, ...detail }));
  }
  async function waitFor(name, get, ready) {
    const deadline = Date.now() + 12 * 60_000;
    let error;
    while (Date.now() < deadline) {
      try {
        const value = await get();
        if (ready(value)) return value;
      } catch (failure) {
        error = failure;
      }
      await delay(5000);
    }
    throw Error(
      `${name} timed out; resume this directory without rebuilding. ${error?.message ?? ''}`,
    );
  }
  await operator.exclusive(() =>
    journal.exclusive(async () => {
      const identity = await owner.identity();
      if (evidence.ownerHash && evidence.ownerHash !== identity.ownerHash)
        throw Error('Verification directory belongs to another wallet');
      evidence.ownerHash = identity.ownerHash;
      save();
      let create = operator.load(`create-${evidence.fixtureId}`);
      if (!create) {
        assert(
          (await owner.balance()) >= 4600n * CKB,
          'At least 4600 testnet CKB is required for reserves, two positions and fees',
        );
        const tip = await rpc.getTipHeader();
        const cutoff =
          Math.ceil((Math.max(Date.now(), Number(tip.timestamp)) + 8 * 60_000) / 1000) * 1000;
        const fixture = {
          id: evidence.fixtureId,
          sport: 'football',
          date: new Date(cutoff).toISOString().slice(0, 10),
          stage: 'Synthetic public integration verification',
          kickoff: new Date(cutoff).toISOString(),
          status: 'scheduled',
          home: { code: 'QAH', name: 'Synthetic verification Home', flag: '' },
          away: { code: 'QAA', name: 'Synthetic verification Away', flag: '' },
          oracle: {
            provider: 'api-football',
            fixtureId: evidence.fixtureId.replace('api-football-', ''),
            source: 'https://v3.football.api-sports.io',
          },
        };
        const prepared = await buildCreate(rpc, signer, fixture);
        const signed = await signer.signTransaction(prepared.tx);
        assert.equal(signed.hash(), prepared.record.creationTxHash);
        create = operator.persist('create', prepared.record, signed);
      }
      async function commitOperator(operation, label) {
        const previous = await reconcileOperation(rpc, operation);
        if (previous.status !== 'committed') await broadcastOperation(rpc, operator, operation);
        await waitFor(
          label,
          () => reconcileOperation(rpc, operation),
          (value) => value.status === 'committed' && value.confirmations >= 4,
        );
        record(label, operation.transactionHash);
      }
      await commitOperator(create, 'Market creation');
      const descriptor = await parseDescriptor({ ...create.descriptor, entryEnabled: true });
      evidence.market = descriptor;
      save();
      async function commitOwner(saved, label) {
        const previous = await owner.recover(saved);
        if (!['confirmed', 'committed', 'submitted'].includes(previous.status))
          await owner.broadcast(saved);
        await waitFor(
          label,
          () => owner.recover(saved),
          (value) => value.status === 'confirmed',
        );
        record(label, saved.hash, {
          principalShannons: saved.principalShannons,
          storageShannons: saved.storageShannons,
          feeShannons: saved.feeShannons,
          payoutShannons: saved.payoutShannons,
        });
      }
      for (const [outcome, principal] of [
        [0, 100n],
        [1, 200n],
      ]) {
        let saved = (await owner.history()).find(
          (row) => row.kind === 'deposit' && row.outcome === outcome,
        );
        if (!saved) {
          const review = await owner.prepareDeposit(descriptor, outcome, principal * CKB);
          saved = await owner.signAndPersist(review, descriptor);
        }
        await commitOwner(
          saved,
          outcome === 0 ? 'Winning prediction deposit' : 'Losing prediction deposit',
        );
      }
      console.log(
        `Waiting for public testnet cutoff ${new Date(descriptor.cutoffMs).toISOString()}`,
      );
      await waitFor(
        'Public kickoff',
        () => rpc.getTipHeader(),
        (tip) =>
          Number(tip.timestamp) > descriptor.cutoffMs + 1000 &&
          Date.now() > descriptor.cutoffMs + 1000,
      );
      let report = operator.load(`report-${evidence.fixtureId}`);
      if (!report) {
        const payload = {
          errors: [],
          response: [
            {
              fixture: {
                id: Number(descriptor.terms.providerFixtureId),
                timestamp: descriptor.cutoffMs / 1000,
                date: new Date(descriptor.cutoffMs).toISOString(),
                status: { short: 'FT' },
              },
              score: { fulltime: { home: 2, away: 1 } },
            },
          ],
        };
        const first = validateFootballEvidence(create.descriptor, payload, Date.now());
        await delay(31_000);
        const second = validateFootballEvidence(create.descriptor, payload, Date.now());
        const evidencePair = confirmFootballEvidence(first, second, Date.now());
        const signed = await signer.signTransaction(
          await buildReport(rpc, signer, create.descriptor, evidencePair),
        );
        report = operator.persist('report', create.descriptor, signed);
      }
      await commitOperator(report, 'Synthetic result report');
      let close = operator.load(`close-${evidence.fixtureId}`);
      if (!close)
        close = operator.persist(
          'close',
          create.descriptor,
          await signer.signTransaction(await buildClose(rpc, signer, create.descriptor, 'settle')),
        );
      await commitOperator(close, 'Settlement');
      for (const outcome of [0, 1]) {
        let saved = (await owner.history()).find(
          (row) => row.kind === 'claim' && row.outcome === outcome,
        );
        if (!saved) {
          const snapshot = await waitFor(
            'Claim indexing',
            () => owner.discover(descriptor),
            (value) =>
              value.positions.some(
                (position) => position.outcome === outcome && position.status === 'claimable',
              ),
          );
          const position = snapshot.positions.find(
            (item) => item.outcome === outcome && item.status === 'claimable',
          );
          const expected = (outcome === 0 ? 615n : 321n) * CKB;
          assert.equal(position.entitlementShannons, expected.toString());
          const review = await owner.prepareClaim(descriptor, position.outPoint);
          assert.equal(review.payoutShannons, expected.toString());
          saved = await owner.signAndPersist(review, descriptor);
        }
        await commitOwner(saved, outcome === 0 ? 'Winning claim' : 'Losing storage return');
      }
      evidence.status = 'passed';
      evidence.completedAt = new Date().toISOString();
      save();
      console.log(
        'PUBLIC TESTNET PRODUCT FLOW PASSED. Synthetic fixture only. Full six-hour refund is separate local-devnet evidence.',
      );
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
