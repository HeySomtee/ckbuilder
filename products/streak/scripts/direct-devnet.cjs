/* Actual product builders, real signatures and Rust VM on one disposable node. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '../../..');
require(path.join(root, 'node_modules/ts-node')).register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: 'CommonJS',
    target: 'ES2022',
    moduleResolution: 'node',
    verbatimModuleSyntax: false,
  },
});
const ccc = require('@ckb-ccc/core');
const { boot } = require('../../../src/week20/contract-lab/scripts/harness.cjs');
const { buildCreate, buildReport, buildClose } = require('../src/modules/direct/operator.ts');
const {
  validateFootballEvidence,
  confirmFootballEvidence,
} = require('../src/modules/direct/oracle.ts');
const {
  OperatorJournal,
  broadcastOperation,
  reconcileOperation,
} = require('../src/modules/direct/journal.ts');
let createDevnetDirectClient, parseDescriptor, PROTOCOL_HASH, GUARD_HASH, CKB, STORAGE, parseRecord;

const artifacts = path.join(root, '.quality-artifacts/direct-chain');
fs.mkdirSync(artifacts, { recursive: true });
const evidenceFile = path.join(artifacts, 'devnet.json');
const evidence = {
  kind: 'isolated-local-devnet',
  source: 'actual Season direct client and operator builders',
  provider: 'synthetic API-shaped fixtures, no provider requests',
  wallet: 'public CKB dev-chain fixture keys',
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
};
function save() {
  fs.writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
}
function record(name, detail = {}) {
  evidence.checks.push({ name, ...detail });
  save();
  console.log(`PASS ${name}`);
}

/** Files model a persistent browser journal across adapter recreation. No wallet secret is stored. */
class FileJournal {
  constructor(file) {
    this.file = file;
  }
  read() {
    return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  async list(scope) {
    return Promise.all(
      this.read()
        .filter((row) => row.scope === scope)
        .map(parseRecord),
    );
  }
  async put(raw) {
    const value = await parseRecord(raw),
      rows = this.read();
    const index = rows.findIndex((row) => row.scope === value.scope && row.hash === value.hash);
    if (index < 0) rows.push(value);
    else rows[index] = value;
    const temporary = `${this.file}.tmp`,
      fd = fs.openSync(temporary, 'w', 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(rows)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, this.file);
  }
}
async function eventually(name, action, check = (value) => !!value) {
  let last;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const value = await action();
      if (check(value)) return value;
    } catch (error) {
      last = error;
    }
    await delay(100);
  }
  throw Error(`${name} did not become ready${last ? `: ${last.message}` : ''}`);
}
function fixture(id, cutoff) {
  return {
    id: `api-football-${id}`,
    sport: 'football',
    date: new Date(cutoff).toISOString().slice(0, 10),
    stage: 'Isolated product integration fixture',
    kickoff: new Date(cutoff).toISOString(),
    status: 'scheduled',
    home: { code: 'HOM', name: 'Synthetic Home', flag: '' },
    away: { code: 'AWY', name: 'Synthetic Away', flag: '' },
    oracle: {
      provider: 'api-football',
      fixtureId: String(id),
      source: 'https://v3.football.api-sports.io',
    },
  };
}
function footballPayload(descriptor) {
  return {
    errors: [],
    response: [
      {
        fixture: {
          id: Number(descriptor.terms.providerFixtureId),
          date: new Date(descriptor.cutoffMs).toISOString(),
          timestamp: descriptor.cutoffMs / 1000,
          status: { short: 'FT' },
        },
        score: { fulltime: { home: 2, away: 1 } },
      },
    ],
  };
}

async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.STREAK_SKIP_ENV_FILE, '1');
  assert.equal(process.argv[2], 'http://127.0.0.1:8218');
  ({ createDevnetDirectClient } = await import('../web/src/features/direct/client.ts'));
  ({ parseDescriptor, PROTOCOL_HASH, GUARD_HASH, CKB, STORAGE } =
    await import('../web/src/features/direct/protocol.ts'));
  ({ parseRecord } = await import('../web/src/features/direct/journal.ts'));
  save();
  const h = await boot();
  // Historical labs pin CCC 1.12.5. Exercise the product's installed CCC version
  // with the same dev-chain script dependencies and public genesis fixtures.
  const client = new ccc.ClientPublicTestnet({
    url: 'http://127.0.0.1:8218',
    fallbacks: [],
    scripts: h.admin.signer.client.scripts,
  });
  h.admin.signer = new ccc.SignerCkbPrivateKey(
    client,
    '0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc',
  );
  h.owner.signer = new ccc.SignerCkbPrivateKey(
    client,
    '0x63d86723e08f0f813a36ce6aa123bb2289d90680ae1e99d4de8cdb334553f24d',
  );
  async function syncIndex() {
    const tip = await h.rpc('get_tip_header');
    await eventually(
      'Local indexer checkpoint',
      () => h.rpc('get_indexer_tip'),
      (value) => value?.block_hash === tip.hash,
    );
  }
  await syncIndex();
  assert.equal(h.protocol('0x').codeHash, PROTOCOL_HASH);
  assert.equal(h.guardHash, GUARD_HASH);
  const deploymentHash = h.evidence.checks.find(
    (check) => check.name === 'Native Rust scripts deployed',
  ).transaction;
  const config = {
    protocolHash: PROTOCOL_HASH,
    guardHash: GUARD_HASH,
    codeDeps: [0, 1].map((index) => ({
      outPoint: { txHash: deploymentHash, index },
      depType: 'code',
    })),
  };
  const operatorDirectory = fs.mkdtempSync(path.join(artifacts, 'operator-'));
  const operatorJournal = new OperatorJournal(operatorDirectory, config);
  evidence.genesisHash = h.evidence.genesisHash;
  evidence.binaries = h.evidence.binaries;
  evidence.deploymentHash = deploymentHash;
  record('Actual pinned Rust binaries deployed on a fresh dev chain');
  const ownerJournalFile = path.join(artifacts, `owner-${process.pid}.json`),
    adminJournalFile = path.join(artifacts, `admin-${process.pid}.json`);
  // A new PID can be reused by the OS. Each run starts with its own empty journal.
  for (const file of [ownerJournalFile, adminJournalFile])
    fs.writeFileSync(file, '[]\n', { mode: 0o600 });
  const options = { now: () => h.getClock(), exclusive: async (_name, action) => action() };
  const owner = await createDevnetDirectClient(
    h.owner.signer,
    config.codeDeps,
    'fixture-owner',
    new FileJournal(ownerJournalFile),
    options,
  );
  const admin = await createDevnetDirectClient(
    h.admin.signer,
    config.codeDeps,
    'fixture-admin',
    new FileJournal(adminJournalFile),
    options,
  );
  assert((await owner.balance()) > 421n * CKB);
  record('Wallet identity and spendable testnet capacity read through the product adapter');

  async function commitOperator(unsigned, name, action, descriptor) {
    const signed = await h.admin.signer.signTransaction(unsigned);
    const operation = operatorJournal.persist(action, descriptor, signed, h.getClock());
    // A fresh journal instance must recover the complete signed operation before send.
    const reopened = new OperatorJournal(operatorDirectory, config);
    const restored = reopened.load(operation.operationId);
    assert.equal(restored.signedTransaction, ccc.hexFrom(signed.toBytes()));
    assert.equal(
      (await broadcastOperation(client, reopened, restored, h.getClock())).status,
      'pending',
    );
    const outputs = await h.commit(h.admin, signed, true);
    await h.mine(3);
    await syncIndex();
    const confirmed = await reconcileOperation(client, restored);
    assert.equal(confirmed.status, 'committed');
    assert(confirmed.confirmations >= 3);
    record(name, { transaction: signed.hash() });
    return { signed, outputs, operation };
  }
  async function newMarket(id) {
    const cutoff = (Math.ceil(h.getClock() / 1000) + 300) * 1000;
    const created = await buildCreate(
      client,
      h.admin.signer,
      fixture(id, cutoff),
      h.getClock(),
      config,
    );
    await commitOperator(
      created.tx,
      `Product operator creates fixture ${id}`,
      'create',
      created.record,
    );
    const descriptor = await parseDescriptor({ ...created.record, entryEnabled: true });
    await eventually(
      'Market index',
      () => owner.discover(descriptor),
      (value) => value.phase === 'open',
    );
    return descriptor;
  }
  async function commitUser(adapter, actor, descriptor, review, name) {
    const signed = await adapter.signAndPersist(review, descriptor);
    assert.equal(signed.status, 'signed');
    assert(
      (await adapter.history()).some(
        (row) => row.hash === signed.hash && row.signedBytes === signed.signedBytes,
      ),
    );
    const before = await client.getTransactionNoCache(signed.hash);
    assert(!before || !['committed', 'pending', 'proposed'].includes(before.status));
    const submitted = await adapter.broadcast(signed);
    assert(['submitted', 'unknown'].includes(submitted.status), submitted.message);
    const transaction = ccc.Transaction.fromBytes(signed.signedBytes);
    await h.commit(actor, transaction, true);
    await h.mine(3);
    await syncIndex();
    const confirmed = await adapter.recover(signed);
    assert.equal(confirmed.status, 'confirmed', confirmed.message);
    record(name, {
      transaction: signed.hash,
      confirmations: confirmed.confirmations,
      principalShannons: signed.principalShannons,
      storageShannons: signed.storageShannons,
      feeShannons: signed.feeShannons,
      payoutShannons: signed.payoutShannons,
    });
    return confirmed.record;
  }

  const market = await newMarket(990001);
  await assert.rejects(() => owner.prepareDeposit(market, 0, 99n * CKB), /at least 100/);
  record('Below-minimum stake rejected before wallet signing');
  const homeReview = await owner.prepareDeposit(market, 0, 100n * CKB);
  assert.equal(homeReview.storageShannons, STORAGE.toString());
  assert.equal(
    BigInt(homeReview.totalShannons),
    100n * CKB + STORAGE + BigInt(homeReview.feeShannons),
  );
  await commitUser(
    owner,
    h.owner,
    market,
    homeReview,
    'Product client stakes 100 CKB with exact storage and fee review',
  );
  await commitUser(
    admin,
    h.admin,
    market,
    await admin.prepareDeposit(market, 1, 200n * CKB),
    'Second wallet stakes 200 CKB through the same product client',
  );
  const admitted = await eventually(
    'Prior deposit admission',
    () => owner.discover(market),
    (value) => value.positions.some((position) => position.status === 'accepted'),
  );
  assert.equal(admitted.positions[0].principalShannons, (100n * CKB).toString());
  record('A later shard transition validates the first deposit creation header');

  h.setClock(market.cutoffMs + 31_000);
  await h.mine(40);
  const earlier = validateFootballEvidence(market, footballPayload(market), h.getClock() - 30_000);
  const later = validateFootballEvidence(market, footballPayload(market), h.getClock());
  const result = confirmFootballEvidence(earlier, later, h.getClock());
  await assert.rejects(
    () =>
      buildReport(
        client,
        h.admin.signer,
        market,
        { ...result, regulationHome: 0 },
        h.getClock(),
        config,
      ),
    /inconsistent|match/,
  );
  record('Operator rejects mutated football result evidence');
  await commitOperator(
    await buildReport(client, h.admin.signer, market, result, h.getClock(), config),
    'Product operator commits a confirmed synthetic regulation-time result',
    'report',
    market,
  );
  const reported = await eventually(
    'Report header',
    () => owner.discover(market),
    (value) => value.report?.eligible === true,
  );
  assert.equal(reported.report.outcome, 0);
  await assert.rejects(
    () => buildClose(client, h.admin.signer, market, 'void', market.terms.deadlineMs + 1, config),
    /timely/,
  );
  record('A timely committed result cannot be overridden by later cancellation');
  await commitOperator(
    await buildClose(client, h.admin.signer, market, 'settle', h.getClock(), config),
    'Product operator atomically funds winning and losing claims',
    'close',
    market,
  );
  const claims = await eventually(
    'Winner claim index',
    () => owner.discover(market),
    (value) => value.positions.some((position) => position.status === 'claimable'),
  );
  const winning = claims.positions.find((position) => position.status === 'claimable');
  assert.equal(winning.entitlementShannons, (294n * CKB + STORAGE).toString());
  const won = await commitUser(
    owner,
    h.owner,
    market,
    await owner.prepareClaim(market, winning.outPoint),
    'Product client claims 294 CKB winnings plus exact returned storage',
  );
  await assert.rejects(() => owner.prepareClaim(market, winning.outPoint), /spent|unavailable/);
  await h.rejects(
    'Consensus rejects a repeated winning claim',
    ccc.Transaction.fromBytes(won.signedBytes),
    /Unknown|Dead|already|duplicat/i,
  );
  record('Claim replay is rejected by both product discovery and consensus');
  const loserView = await eventually(
    'Losing claim index',
    () => admin.discover(market),
    (value) => value.positions.some((position) => position.status === 'claimable'),
  );
  const losing = loserView.positions.find((position) => position.status === 'claimable');
  assert.equal(losing.entitlementShannons, STORAGE.toString());
  await commitUser(
    admin,
    h.admin,
    market,
    await admin.prepareClaim(market, losing.outPoint),
    'Losing prediction returns its 321 CKB storage',
  );

  const voidMarket = await newMarket(990002);
  await commitUser(
    owner,
    h.owner,
    voidMarket,
    await owner.prepareDeposit(voidMarket, 2, 100n * CKB),
    'Second fixture receives a real wallet stake for timeout testing',
  );
  const premature = await buildClose(
    client,
    h.admin.signer,
    voidMarket,
    'void',
    voidMarket.terms.deadlineMs,
    config,
  );
  await h.rejects(
    'Six-hour cancellation rejected before consensus time',
    await h.admin.signer.signTransaction(premature),
    /Immature|since requirement/,
  );
  record('Original six-hour consensus timeout is enforced');
  h.setClock(voidMarket.terms.deadlineMs + 1000);
  await h.mine(40);
  await commitOperator(
    await buildClose(client, h.admin.signer, voidMarket, 'void', h.getClock(), config),
    'Product operator cancels after the full six-hour consensus window',
    'close',
    voidMarket,
  );
  const refunds = await eventually(
    'Refund claim index',
    () => owner.discover(voidMarket),
    (value) =>
      value.phase === 'voided' &&
      value.positions.some((position) => position.status === 'claimable'),
  );
  const refund = refunds.positions.find((position) => position.status === 'claimable');
  assert.equal(refund.entitlementShannons, (100n * CKB + STORAGE).toString());
  const interruptedClaim = await owner.signAndPersist(
    await owner.prepareClaim(voidMarket, refund.outPoint),
    voidMarket,
  );
  const feePoint = interruptedClaim.inputs[1];
  const feeCell = await client.getCellLiveNoCache(feePoint, true, true);
  assert(feeCell && !feeCell.cellOutput.type);
  const externalSpend = await h.owner.signer.signTransaction(
    ccc.Transaction.from({
      inputs: [{ previousOutput: feePoint }],
      outputs: [
        { capacity: feeCell.cellOutput.capacity - 100_000n, lock: feeCell.cellOutput.lock },
      ],
      outputsData: ['0x'],
    }),
  );
  const beforeConflict = await h.rpc('get_tip_header');
  await h.commit(h.owner, externalSpend);
  await h.mine(3);
  await syncIndex();
  assert.equal((await owner.recover(interruptedClaim)).status, 'conflict');
  assert(await client.getCellLiveNoCache(refund.outPoint, true, true));
  await assert.rejects(
    () => owner.prepareClaim(voidMarket, refund.outPoint),
    /awaiting reconciliation/,
  );
  record('An external fee-cell spend blocks the old claim while its entitlement stays live', {
    transaction: externalSpend.hash(),
    originalClaim: interruptedClaim.hash,
  });
  await owner.resolveConflict(interruptedClaim, externalSpend.hash());
  const resolved = (await owner.history()).find((row) => row.hash === interruptedClaim.hash);
  assert.equal((await owner.recover(resolved)).status, 'resolved');
  record(
    'Canonical conflicting-spend proof releases a fresh claim review without deleting signed history',
    {
      transaction: externalSpend.hash(),
      originalClaim: interruptedClaim.hash,
    },
  );
  const conflictTip = await h.rpc('get_tip_header');
  await h.rpc('truncate', [beforeConflict.hash]);
  await h.rpc('remove_transaction', [externalSpend.hash()]);
  await h.mine(Number(BigInt(conflictTip.number) - BigInt(beforeConflict.number)) + 4);
  await syncIndex();
  assert.equal((await owner.recover(resolved)).status, 'reorg');
  assert(await client.getCellLiveNoCache(feePoint, true, true));
  await assert.rejects(
    () => owner.prepareClaim(voidMarket, refund.outPoint),
    /awaiting reconciliation/,
  );
  await assert.rejects(
    () => owner.resolveConflict(interruptedClaim, externalSpend.hash()),
    /does not prove a conflicting spend/,
  );
  record('A real conflict-proof reorg restores reservations and forbids a replacement claim', {
    transaction: externalSpend.hash(),
    originalClaim: interruptedClaim.hash,
  });
  await h.commit(h.owner, externalSpend);
  await h.mine(3);
  await syncIndex();
  assert.equal(
    (await owner.resolveConflict(interruptedClaim, externalSpend.hash())).status,
    'resolved',
  );
  record('The conflicting spend must be proven again on the replacement chain');
  const beforeClaim = await h.rpc('get_tip_header');
  const refunded = await commitUser(
    owner,
    h.owner,
    voidMarket,
    await owner.prepareClaim(voidMarket, refund.outPoint),
    'Cancelled prediction returns all principal and storage without betting fees',
  );

  const orphanTip = await h.rpc('get_tip_header');
  await h.rpc('truncate', [beforeClaim.hash]);
  await h.rpc('remove_transaction', [refunded.hash]);
  // A replacement branch must exceed the old indexed height before the local
  // indexer follows it. This is a genuine longer replacement chain.
  await h.mine(Number(BigInt(orphanTip.number) - BigInt(beforeClaim.number)) + 4);
  await syncIndex();
  const restored = await createDevnetDirectClient(
    h.owner.signer,
    config.codeDeps,
    'fixture-owner',
    new FileJournal(ownerJournalFile),
    options,
  );
  const stored = (await restored.history()).find((row) => row.hash === refunded.hash);
  assert(stored, 'Saved transaction survived adapter recreation');
  const rolledBack = await restored.recover(stored);
  assert.equal(rolledBack.status, 'reorg');
  assert.equal(rolledBack.inputsLive, true);
  assert(await client.getCellLiveNoCache(refund.outPoint, true, true));
  record('Real chain rollback invalidates a previously confirmed claim after journal reload', {
    transaction: refunded.hash,
  });
  const resend = await restored.broadcast(rolledBack.record);
  assert(['submitted', 'unknown'].includes(resend.status), resend.message);
  await h.commit(h.owner, ccc.Transaction.fromBytes(stored.signedBytes), true);
  await h.mine(3);
  assert.equal((await restored.recover(stored)).status, 'confirmed');
  record('Recovery rebroadcasts the original signed bytes and confirms on the replacement branch', {
    transaction: stored.hash,
  });
  evidence.status = 'passed';
  evidence.finishedAt = new Date().toISOString();
  evidence.tip = await h.rpc('get_tip_header');
  save();
  console.log(`All ${evidence.checks.length} direct product devnet checks passed.`);
}
main().catch((error) => {
  evidence.status = 'failed';
  evidence.finishedAt = new Date().toISOString();
  evidence.failure = error.message;
  save();
  console.error(error);
  process.exitCode = 1;
});
