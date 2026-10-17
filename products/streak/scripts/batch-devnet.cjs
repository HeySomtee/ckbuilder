/* Real atomic payment adapters and signatures on an owned disposable CKB node. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
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
const { boot } = require('./batch-devnet-harness.cjs');
const { readOmniLock, setupOmniActor, PIN: OMNI_PIN } = require('./direct-omnilock.cjs');
const { BatchService } = require('../src/modules/direct/batch.ts');
const { DirectRegistry } = require('../src/modules/direct/registry.ts');
const {
  OperatorJournal,
  broadcastOperation,
  reconcileOperation,
} = require('../src/modules/direct/journal.ts');
const { buildReport, buildClose } = require('../src/modules/direct/operator.ts');
const {
  validateFootballEvidence,
  confirmFootballEvidence,
} = require('../src/modules/direct/oracle.ts');
const artifacts = path.join(root, '.quality-artifacts/batch-chain');
const evidence = {
  kind: 'isolated-local-devnet',
  source: 'actual BatchService and product wallet adapters',
  provider: 'synthetic API-shaped fixtures; no provider requests',
  wallet: 'public CKB dev-chain and deterministic EVM fixture keys',
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
};
function save() {
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(artifacts, 'devnet.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}
function record(name, details = {}) {
  evidence.checks.push({ name, ...details });
  save();
  console.log(`PASS ${name}`);
}
async function eventually(name, action, check = (value) => !!value) {
  let last;
  for (let attempt = 0; attempt < 80; attempt++) {
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
class FileJournal {
  constructor(file, parse) {
    this.file = file;
    this.parse = parse;
    this.others = [];
  }
  read() {
    return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  async list(scope) {
    return Promise.all(
      this.read()
        .filter((row) => row.scope === scope)
        .map(this.parse),
    );
  }
  async otherReservations(scope) {
    const { parseReservation } = await import('../web/src/features/direct/reservations.ts');
    return this.others
      .flatMap((journal) => journal.read())
      .filter((row) => row.scope === scope)
      .map(parseReservation);
  }
  async put(value) {
    const checked = await this.parse(value),
      rows = this.read();
    const index = rows.findIndex((row) => row.scope === checked.scope && row.hash === checked.hash);
    if (index < 0) rows.push(checked);
    else rows[index] = checked;
    const temporary = `${this.file}.${randomUUID()}.next`,
      fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(rows)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, this.file);
  }
}
function fixture(id, cutoff) {
  return {
    id: `api-football-${id}`,
    sport: 'football',
    date: new Date(cutoff).toISOString().slice(0, 10),
    kickoff: new Date(cutoff).toISOString(),
    status: 'scheduled',
    stage: 'Isolated atomic integration',
    home: { id: '1', code: 'HOM', name: 'Synthetic Home', flag: '' },
    away: { id: '2', code: 'AWY', name: 'Synthetic Away', flag: '' },
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
  readOmniLock();
  save();
  const h = await boot();
  const baseClient = new ccc.ClientPublicTestnet({
    url: 'http://127.0.0.1:8218',
    fallbacks: [],
    scripts: h.admin.signer.client.scripts,
  });
  const evm = await setupOmniActor(h, baseClient),
    client = evm.signer.client;
  h.admin.signer = new ccc.SignerCkbPrivateKey(
    client,
    '0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc',
  );
  h.owner.signer = new ccc.SignerCkbPrivateKey(
    client,
    '0x63d86723e08f0f813a36ce6aa123bb2289d90680ae1e99d4de8cdb334553f24d',
  );
  const deploymentHash = h.evidence.checks.find(
    (check) => check.name === 'Native Rust scripts deployed',
  ).transaction;
  const config = {
    protocolHash: h.protocol('0x').codeHash,
    guardHash: h.guardHash,
    codeDeps: [0, 1].map((index) => ({
      outPoint: { txHash: deploymentHash, index },
      depType: 'code',
    })),
  };
  const directory = fs.mkdtempSync(path.join(artifacts, 'run-'));
  const journal = new OperatorJournal(path.join(directory, 'operator'), config),
    registry = new DirectRegistry(path.join(directory, 'registry'), config),
    fixtures = new Map();
  const options = {
    client,
    signer: h.admin.signer,
    journal,
    registry,
    config,
    now: () => h.getClock(),
    fixture: async (id) => {
      const value = fixtures.get(id);
      assert(value, 'Only registered synthetic fixtures are allowed');
      return value;
    },
  };
  let service = new BatchService(options);
  async function syncIndex() {
    const tip = await h.rpc('get_tip_header');
    await eventually(
      'Local indexer',
      () => h.rpc('get_indexer_tip'),
      (value) => value?.block_hash === tip.hash,
    );
  }
  async function updateSponsor(tx, offer) {
    const response = await client.getTransactionNoCache(tx.hash()),
      index = offer.sponsorChangeOutputIndex;
    h.admin.fund = {
      outPoint: { txHash: tx.hash(), index },
      output: tx.outputs[index],
      data: '0x',
      blockHash: response.blockHash,
    };
  }
  async function confirm(actor, tx, offer, sent = true) {
    await h.commit(actor, tx, sent);
    await h.mine(3);
    await syncIndex();
    await updateSponsor(tx, offer);
    const state = await service.status({ offerId: offer.offerId, rawHash: offer.rawHash });
    assert.equal(state.state, 'funded', state.message);
    for (const line of offer.lines)
      assert.equal(
        registry.get(line.fixture.fixtureId).creationTxHash,
        line.descriptor.creationTxHash,
      );
    return state;
  }
  await syncIndex();
  evidence.genesisHash = h.evidence.genesisHash;
  evidence.binaries = h.evidence.binaries;
  evidence.deploymentHash = deploymentHash;
  record('Pinned v4 and genuine OmniLock binaries deployed on a fresh isolated chain', {
    omniHash: OMNI_PIN.dataHash,
  });
  const baskets = [];
  for (const [kind, actor, base] of [
    ['native', h.owner, 992100],
    ['evm', evm, 992200],
  ]) {
    const cutoff = (Math.ceil(h.getClock() / 1000) + 1200) * 1000;
    const matches = Array.from({ length: 8 }, (_, index) => fixture(base + index, cutoff));
    for (const match of matches) fixtures.set(match.id, match);
    async function requestFor(chosen, outcomeOffset = 0) {
      return {
        requestId: randomUUID(),
        ownerAddress: await actor.signer.getRecommendedAddress(),
        userInputs: [
          { txHash: actor.fund.outPoint.txHash, index: Number(actor.fund.outPoint.index) },
        ],
        picks: await Promise.all(
          chosen.map(async (match, index) => ({
            fixtureId: match.id,
            termsHash: (await service.describe(match.id)).termsHash,
            outcome: (index + outcomeOffset) % 3,
            principalShannons: ((100n + BigInt(index)) * h.CKB).toString(),
          })),
        ),
      };
    }
    async function serverPayment(chosen, mixed) {
      const request = await requestFor(chosen, mixed ? 1 : 0),
        offer = await service.prepareOffer(request),
        unsigned = ccc.Transaction.fromBytes(offer.unsignedBytes);
      assert.equal((await service.prepareOffer(request)).rawHash, offer.rawHash);
      assert.equal(offer.lines.length, 8);
      assert.equal(offer.lines.filter((line) => line.mode === 'create').length, mixed ? 4 : 8);
      const sponsorInput = await client.getCellLiveNoCache(
          unsigned.inputs[0].previousOutput,
          true,
          true,
        ),
        ownerInput = await client.getCellLiveNoCache(unsigned.inputs[1].previousOutput, true, true);
      assert.equal(
        sponsorInput.cellOutput.capacity -
          unsigned.outputs[offer.sponsorChangeOutputIndex].capacity,
        BigInt(mixed ? 4 : 8) * 3050n * h.CKB,
      );
      assert.equal(
        ownerInput.cellOutput.capacity - unsigned.outputs[offer.ownerChangeOutputIndex].capacity,
        BigInt(offer.principalShannons) + 8n * 321n * h.CKB + BigInt(offer.feeShannons),
      );
      assert.equal(new Set(offer.lines.map((line) => line.descriptor.type.args)).size, 8);
      record(
        `${kind}: ${mixed ? 'mixed' : 'eight-new'} quote attributes exact owner and sponsor contributions`,
      );
      const partial = await actor.signer.signTransaction(unsigned),
        bad = partial.clone(),
        witness = ccc.WitnessArgs.fromBytes(bad.witnesses[1]),
        bytes = ccc.bytesFrom(witness.lock);
      bytes[kind === 'evm' ? 20 : 0] ^= 1;
      witness.lock = ccc.hexFrom(bytes);
      bad.setWitnessArgs(1, witness);
      await assert.rejects(
        () =>
          service.submit({
            offerId: offer.offerId,
            rawHash: offer.rawHash,
            userSignedBytes: bad.toHex(),
          }),
        /signature/i,
      );
      assert.equal(service.store.load(offer.offerId).userSignedBytes, undefined);
      const send = client.sendTransactionNoCache.bind(client);
      client.sendTransactionNoCache = async () => {
        throw Error('Isolated interruption before node submission');
      };
      let state;
      try {
        state = await service.submit({
          offerId: offer.offerId,
          rawHash: offer.rawHash,
          userSignedBytes: partial.toHex(),
        });
      } finally {
        client.sendTransactionNoCache = send;
      }
      assert.equal(state.state, 'blocked');
      assert(state.signedBytes);
      const signed = ccc.Transaction.fromBytes(state.signedBytes);
      assert.equal(signed.hash(), offer.rawHash);
      assert.deepEqual(signed.witnesses.slice(1), partial.witnesses.slice(1));
      assert.notEqual(signed.witnesses[0], partial.witnesses[0]);
      if (!mixed) {
        const invalid = signed.clone();
        invalid.setWitnessArgs(1, witness);
        await h.rejects(
          `${kind}: actual lock VM rejects corrupted combined-payment signature`,
          invalid,
          /ValidationFailure|error code/,
        );
      }
      service = new BatchService({
        ...options,
        journal: new OperatorJournal(journal.directory, config),
      });
      const resumed = await service.status(
        { offerId: offer.offerId, rawHash: offer.rawHash },
        true,
      );
      assert.equal(resumed.signedBytes, state.signedBytes);
      assert.equal(resumed.state, 'confirming');
      await confirm(actor, signed, offer);
      record(
        `${kind}: one signed ${mixed ? 'four-funded plus four-new' : 'eight-new-market'} transaction commits and survives operator restart`,
        { transaction: signed.hash(), predictions: 8 },
      );
      return offer;
    }
    const first = await serverPayment(matches, false),
      added = Array.from({ length: 4 }, (_, index) => fixture(base + 10 + index, cutoff));
    for (const match of added) fixtures.set(match.id, match);
    const mixed = await serverPayment([...matches.slice(0, 4), ...added], true);
    baskets.push({ actor, kind, first, mixed, matches });
  }
  // The shared product claim client proves genesis output offsets survive through settlement.
  const { createDevnetDirectClient } = await import('../web/src/features/direct/client.ts');
  const { BATCH_MANIFEST, parseDescriptor } =
    await import('../web/src/features/direct/protocol.ts');
  const { parseRecord } = await import('../web/src/features/direct/journal.ts');
  const { createDevnetBatchClient } = await import('../web/src/features/direct/batch-client.ts');
  const { parseBatchRecord } = await import('../web/src/features/direct/batch-journal.ts');
  const { parseBatchFixture, parseBatchOffer, parseBatchStatus } =
    await import('../web/src/features/direct/batch-protocol.ts');
  const transport = {
    offer: async (request) => parseBatchOffer(await service.prepareOffer(request)),
    submit: async (request) => parseBatchStatus(await service.submit(request)),
    status: async (identity) => parseBatchStatus(await service.status(identity, false)),
    resume: async (identity) => parseBatchStatus(await service.status(identity, true)),
    resolve: async (request) => parseBatchStatus(await service.resolveConflict(request)),
  };
  async function adapters(actor, scope) {
    const directJournal = new FileJournal(
        path.join(directory, `${scope}-direct.json`),
        parseRecord,
      ),
      batchJournal = new FileJournal(path.join(directory, `${scope}-batch.json`), parseBatchRecord);
    directJournal.others = [batchJournal];
    batchJournal.others = [directJournal];
    const settings = {
      now: () => h.getClock(),
      scopeId: scope,
      exclusive: async (_name, action) => action(),
    };
    return {
      batchJournal,
      directJournal,
      batch: await createDevnetBatchClient(
        actor.signer,
        config.codeDeps,
        transport,
        batchJournal,
        settings,
        directJournal,
      ),
      direct: await createDevnetDirectClient(
        actor.signer,
        config.codeDeps,
        scope,
        directJournal,
        settings,
        BATCH_MANIFEST,
      ),
    };
  }
  // Give the disposable EVM fixture more capacity for the independent client tests.
  const topup = await h.build(h.admin, [], [{ capacity: 15_000n * h.CKB, lock: evm.lock }], ['0x']);
  const topupOutputs = await h.commit(h.admin, topup);
  evm.fund = topupOutputs[0];
  await h.mine(3);
  await syncIndex();
  for (const [kind, actor, base] of [
    ['native-browser', h.owner, 993100],
    ['evm-browser', evm, 993200],
  ]) {
    let adapter = await adapters(actor, kind);
    const cutoff = (Math.ceil(h.getClock() / 1000) + 1200) * 1000,
      matches = Array.from({ length: 8 }, (_, index) => fixture(base + index, cutoff));
    for (const match of matches) fixtures.set(match.id, match);
    async function browserPayment(chosen, mixed, allFunded = false) {
      const demands = await Promise.all(
        chosen.map(async (match) => parseBatchFixture(await service.describe(match.id))),
      );
      const picks = demands.map((fixture, index) => ({
        fixture,
        outcome: index % 3,
        principal: (100n + BigInt(index)) * h.CKB,
      }));
      if (!mixed && kind === 'native-browser') {
        const realOffer = transport.offer;
        try {
          transport.offer = async (request) => {
            const offer = await realOffer(request),
              changed = ccc.Transaction.fromBytes(offer.unsignedBytes);
            changed.outputs[offer.sponsorChangeOutputIndex].capacity += h.CKB;
            changed.outputs[offer.ownerChangeOutputIndex].capacity -= h.CKB;
            const lines = offer.lines.map((line) => ({
              ...line,
              descriptor: { ...line.descriptor, creationTxHash: changed.hash() },
            }));
            return {
              ...offer,
              lines,
              descriptor: lines[0].descriptor,
              unsignedBytes: changed.toHex(),
              rawHash: changed.hash(),
            };
          };
          await assert.rejects(
            () => adapter.batch.prepare(picks),
            /amount|contribution|total|output/i,
          );
          assert.equal((await adapter.batch.history()).length, 0);
          record('Actual BatchClient rejects contributor shifting before any wallet signature');
        } finally {
          transport.offer = realOffer;
        }
      }
      const review = await adapter.batch.prepare(picks);
      assert.equal(
        review.principalShannons,
        picks.reduce((sum, pick) => sum + pick.principal, 0n).toString(),
      );
      assert.equal(review.storageShannons, (8n * 321n * h.CKB).toString());
      assert.equal(
        review.sponsorReserveShannons,
        (BigInt(allFunded ? 0 : mixed ? 4 : 8) * 3050n * h.CKB).toString(),
      );
      const originalSign = actor.signer.signTransaction.bind(actor.signer);
      let signingCalls = 0;
      actor.signer.signTransaction = async (...args) => {
        signingCalls++;
        return originalSign(...args);
      };
      let partial;
      try {
        partial = await adapter.batch.signAndPersist(review, demands);
      } finally {
        actor.signer.signTransaction = originalSign;
      }
      assert.equal(signingCalls, 1);
      assert.equal(partial.descriptors.length, 8);
      assert.equal(
        (await adapter.batch.history()).find((row) => row.hash === partial.hash).ownerSignedBytes,
        partial.ownerSignedBytes,
      );
      await assert.rejects(() => adapter.batch.prepare(picks), /signed payment|resume|reserved/i);
      const scope = (await adapter.direct.identity()).scope;
      assert(
        (await adapter.directJournal.otherReservations(scope)).some(
          (row) => row.hash === partial.hash && row.fixtureIds.length === 8,
        ),
      );
      record(`${kind}: one wallet signature durably reserves every prediction and its exact total`);
      let recovery;
      if (!mixed) {
        await adapter.batchJournal.put({
          ...partial,
          submissionAttemptedAt: h.getClock(),
          status: 'submitting',
        });
        await transport.submit({
          offerId: partial.offer.offerId,
          rawHash: partial.hash,
          userSignedBytes: partial.ownerSignedBytes,
        });
        assert.equal(
          (await adapter.batch.history()).find((row) => row.hash === partial.hash).finalSignedBytes,
          undefined,
        );
        adapter = await adapters(actor, kind);
        recovery = await adapter.batch.recover(
          (await adapter.batch.history()).find((row) => row.hash === partial.hash),
        );
        assert(recovery.record.finalSignedBytes);
        record(
          `${kind}: a browser restart recovers a lost batch submission response without signing again`,
        );
      } else recovery = await adapter.batch.submit(partial);
      const final = ccc.Transaction.fromBytes(recovery.record.finalSignedBytes);
      assert.deepEqual(
        final.witnesses.slice(1),
        ccc.Transaction.fromBytes(partial.ownerSignedBytes).witnesses.slice(1),
      );
      const beforeCommit = await h.rpc('get_tip_header');
      await confirm(actor, final, partial.offer);
      const confirmed = await adapter.batch.recover(recovery.record);
      assert.equal(confirmed.status, 'confirmed');
      for (const descriptor of confirmed.record.descriptors)
        assert((await adapter.direct.discover(descriptor)).positions.length >= 1);
      record(
        `${kind}: actual BatchClient commits and discovers all eight ${allFunded ? 'already-funded' : mixed ? 'mixed' : 'new'} independent predictions`,
        { transaction: partial.hash },
      );
      if (kind === 'evm-browser' && mixed) {
        const committedTip = await h.rpc('get_tip_header');
        await h.rpc('truncate', [beforeCommit.hash]);
        await h.rpc('remove_transaction', [final.hash()]);
        h.setClock(h.getClock() + 1000);
        await h.mine(Number(BigInt(committedTip.number) - BigInt(beforeCommit.number)) + 4);
        await syncIndex();
        assert.equal((await adapter.batch.recover(confirmed.record)).status, 'reorg');
        for (let attempt = 0; attempt < service.store.all().length + 1; attempt++) {
          await service.recoverPending();
          const found = await client.getTransactionNoCache(final.hash());
          if (found && ['pending', 'proposed', 'sent'].includes(found.status)) break;
        }
        const resumed = await client.getTransactionNoCache(final.hash());
        assert(resumed, 'Background recovery must revisit a formerly funded batch');
        assert.equal(resumed.transaction.toHex(), final.toHex());
        await confirm(actor, final, partial.offer);
        assert.equal((await adapter.batch.recover(confirmed.record)).status, 'confirmed');
        record(
          'A real batch reorganisation restores reservations and background recovery rebroadcasts identical signed bytes',
        );
      }
      return confirmed.record;
    }
    const first = await browserPayment(matches, false),
      added = Array.from({ length: 4 }, (_, index) => fixture(base + 10 + index, cutoff));
    for (const match of added) fixtures.set(match.id, match);
    await browserPayment([...matches.slice(0, 4), ...added], true);
    if (kind === 'native-browser') await browserPayment(matches, true, true);
    baskets.push({ actor, kind, first: first.offer, matches });
  }
  async function retryPublishedOrphan() {
    const adapter = await adapters(h.owner, 'published-orphan-retry');
    const cutoff = (Math.ceil(h.getClock() / 1000) + 1200) * 1000;
    const matches = [fixture(993901, cutoff), fixture(993902, cutoff)];
    for (const match of matches) fixtures.set(match.id, match);
    const demands = async () =>
      Promise.all(
        matches.map(async (match) => parseBatchFixture(await service.describe(match.id))),
      );
    const picks = (values) =>
      values.map((fixture) => ({ fixture, outcome: 0, principal: 100n * h.CKB }));
    const initialFixtures = await demands();
    const review = await adapter.batch.prepare(picks(initialFixtures));
    const original = await adapter.batch.signAndPersist(review, initialFixtures);
    const response = await adapter.batch.submit(original),
      signed = ccc.Transaction.fromBytes(response.record.finalSignedBytes);
    const before = await h.rpc('get_tip_header');
    await confirm(h.owner, signed, original.offer);
    const confirmed = await adapter.batch.recover(response.record);
    assert.equal(confirmed.status, 'confirmed');
    const committedTip = await h.rpc('get_tip_header');
    await h.rpc('truncate', [before.hash]);
    await h.rpc('remove_transaction', [signed.hash()]);
    h.setClock(h.getClock() + 1000);
    await h.mine(Number(BigInt(committedTip.number) - BigInt(before.number)) + 4);
    await syncIndex();
    const ownerCells = await Promise.all(
      original.offer.userInputIndexes.map((index) =>
        client.getCellLiveNoCache(signed.inputs[index].previousOutput, true, true),
      ),
    );
    assert(ownerCells.every(Boolean));
    const conflict = await h.owner.signer.signTransaction(
      ccc.Transaction.from({
        inputs: ownerCells.map((cell) => ({ previousOutput: cell.outPoint })),
        outputs: [
          {
            capacity:
              ownerCells.reduce((total, cell) => total + cell.cellOutput.capacity, 0n) - h.CKB,
            lock: h.owner.lock,
          },
        ],
        outputsData: ['0x'],
      }),
    );
    await h.commit(h.owner, conflict);
    await h.mine(3);
    await syncIndex();
    const resolved = await adapter.batch.resolveConflict(confirmed.record, conflict.hash());
    assert.equal(resolved.status, 'resolved');
    for (const descriptor of original.descriptors)
      assert.equal(
        registry.get(descriptor.fixtureId).creationTxHash,
        original.hash,
        'The old immutable mapping must survive until replacement publication',
      );
    const freshFixtures = await demands();
    assert(
      freshFixtures.every((fixture) => fixture.state === 'available' && !fixture.descriptor),
      'Canonical conflict evidence must make the orphaned selected fixtures available again',
    );
    const nextReview = await adapter.batch.prepare(picks(freshFixtures)),
      retry = await adapter.batch.signAndPersist(nextReview, freshFixtures),
      submitted = await adapter.batch.submit(retry);
    assert.notEqual(retry.hash, original.hash);
    assert.deepEqual(
      retry.offer.sponsorInput,
      original.offer.sponsorInput,
      'Retry must retain the mutually exclusive sponsor origin',
    );
    await confirm(
      h.owner,
      ccc.Transaction.fromBytes(submitted.record.finalSignedBytes),
      retry.offer,
    );
    assert.equal((await adapter.batch.recover(submitted.record)).status, 'confirmed');
    assert.equal((await adapter.batch.history()).length, 2);
    for (const descriptor of retry.descriptors) {
      assert.equal(registry.get(descriptor.fixtureId).creationTxHash, retry.hash);
      assert((await adapter.direct.discover(descriptor)).positions.length === 1);
      assert(
        fs.existsSync(
          path.join(
            registry.directory,
            'instances',
            descriptor.fixtureId,
            `${original.hash.slice(2)}.json`,
          ),
        ),
      );
      assert(
        fs.existsSync(
          path.join(
            registry.directory,
            'instances',
            descriptor.fixtureId,
            `${retry.hash.slice(2)}.json`,
          ),
        ),
      );
    }
    record(
      'A published batch orphaned before an owner conflict can recreate every fixture without deleting prior signatures or mappings',
      { original: original.hash, conflict: conflict.hash(), replacement: retry.hash },
    );
    const replacementTip = await h.rpc('get_tip_header');
    await h.rpc('truncate', [before.hash]);
    for (const hash of [retry.hash, conflict.hash(), original.hash])
      await h.rpc('remove_transaction', [hash]);
    h.setClock(h.getClock() + 1000);
    await h.mine(Number(BigInt(replacementTip.number) - BigInt(before.number)) + 4);
    await syncIndex();
    assert.equal((await adapter.batch.recover(resolved.record)).status, 'reorg');
    await h.commit(h.owner, signed);
    await h.mine(3);
    await syncIndex();
    await updateSponsor(signed, original.offer);
    assert.equal(
      (await service.status({ offerId: original.offer.offerId, rawHash: original.hash })).state,
      'funded',
    );
    assert.equal((await adapter.batch.recover(resolved.record)).status, 'confirmed');
    for (const descriptor of original.descriptors) {
      assert.equal(registry.get(descriptor.fixtureId).creationTxHash, original.hash);
      assert((await adapter.direct.discover(descriptor)).positions.length === 1);
    }
    const { operatorFundingBarrier } = require('../src/modules/direct/cli.ts');
    assert.equal((await operatorFundingBarrier(client, journal, registry)).clear, true);
    record(
      'A second real reorganisation lets the original batch win and repairs every canonical selection without rewriting history',
    );
  }
  await retryPublishedOrphan();
  async function operator(tx, action, descriptor) {
    const signed = await h.admin.signer.signTransaction(tx),
      operation = journal.persist(action, descriptor, signed, h.getClock());
    assert.equal(
      (await broadcastOperation(client, journal, operation, h.getClock())).status,
      'pending',
    );
    await h.commit(h.admin, signed, true);
    await h.mine(3);
    await syncIndex();
    assert.equal((await reconcileOperation(client, operation)).status, 'committed');
    return signed;
  }
  for (const basket of baskets) {
    const { actor, kind, first } = basket,
      descriptor = await parseDescriptor(first.lines[3].descriptor);
    const direct = await createDevnetDirectClient(
      actor.signer,
      config.codeDeps,
      `${kind}-claims`,
      new FileJournal(path.join(directory, `${kind}-direct.json`), parseRecord),
      { now: () => h.getClock(), exclusive: async (_name, action) => action() },
      BATCH_MANIFEST,
    );
    const before = await direct.discover(descriptor);
    assert(before.positions.length >= 2);
    assert(before.positions.some((position) => position.status === 'accepted'));
    record(
      `${kind}: actual discovery locates independent positions created at a nonzero genesis output index`,
    );
    h.setClock(Math.max(h.getClock(), descriptor.cutoffMs + 3600_000));
    await h.mine(40);
    const previous = validateFootballEvidence(
        descriptor,
        footballPayload(descriptor),
        h.getClock() - 30_000,
      ),
      current = validateFootballEvidence(descriptor, footballPayload(descriptor), h.getClock());
    await operator(
      await buildReport(
        client,
        h.admin.signer,
        descriptor,
        confirmFootballEvidence(previous, current, h.getClock()),
        h.getClock(),
        config,
      ),
      'report',
      descriptor,
    );
    await operator(
      await buildClose(client, h.admin.signer, descriptor, 'settle', h.getClock(), config),
      'close',
      descriptor,
    );
    const closed = await direct.discover(descriptor),
      claim = closed.positions.find(
        (position) => position.status === 'claimable' && position.outcome === 0,
      );
    assert(claim, 'Winning claim must be independently discoverable');
    const review = await direct.prepareClaim(descriptor, claim.outPoint),
      signed = await direct.signAndPersist(review, descriptor);
    await direct.broadcast(signed);
    await h.commit(actor, ccc.Transaction.fromBytes(signed.signedBytes), true);
    await h.mine(3);
    await syncIndex();
    assert.equal((await direct.recover(signed)).status, 'confirmed');
    record(
      `${kind}: an independently resolved market pays its winning claim with a real owner signature`,
      { transaction: signed.hash },
    );
  }
  const lateAdapter = await adapters(evm, 'evm-late-batch'),
    lateCutoff = (Math.ceil(h.getClock() / 1000) + 600) * 1000;
  const lateMatches = [fixture(994001, lateCutoff), fixture(994002, lateCutoff)];
  for (const match of lateMatches) fixtures.set(match.id, match);
  const lateDemands = await Promise.all(
    lateMatches.map(async (match) => parseBatchFixture(await service.describe(match.id))),
  );
  const lateReview = await lateAdapter.batch.prepare(
    lateDemands.map((fixture) => ({ fixture, outcome: 0, principal: 100n * h.CKB })),
  );
  const lateSigned = await lateAdapter.batch.signAndPersist(lateReview, lateDemands),
    lateSubmission = await lateAdapter.batch.submit(lateSigned);
  h.setClock(lateCutoff);
  await confirm(
    evm,
    ccc.Transaction.fromBytes(lateSubmission.record.finalSignedBytes),
    lateSigned.offer,
  );
  for (const descriptor of lateSigned.descriptors)
    assert(
      (await lateAdapter.direct.discover(descriptor)).positions.some(
        (position) => position.status === 'refund-required',
      ),
    );
  record('A combined payment included after kickoff marks every independent prediction for refund');
  // A compatible external builder can refund late tickets while replacing shards.
  // Input and output order deliberately differ, and neither market begins at output zero.
  const { loadMarket } = await import('../web/src/features/direct/discovery.ts');
  const lateMarkets = await Promise.all(
    lateSigned.descriptors.map((descriptor) => loadMarket(client, descriptor)),
  );
  const lateShards = lateMarkets.map(
    (cells) => cells.find((row) => row.state.kind === 'shard' && row.state.id === 0).cell,
  );
  const lateControls = lateMarkets.map(
    (cells) => cells.find((row) => row.state.kind === 'market').cell,
  );
  const lateHeader = (await client.getTransactionNoCache(lateSigned.hash)).blockHash;
  const asHarnessCell = (cell) => ({
    outPoint: cell.outPoint,
    output: cell.cellOutput,
    data: cell.outputData,
    blockHash: lateHeader,
  });
  const replacement = await h.build(
    evm,
    [asHarnessCell(lateShards[1]), asHarnessCell(lateShards[0])],
    [
      { capacity: 100n * h.CKB, lock: evm.lock },
      lateShards[0].cellOutput,
      { capacity: 421n * h.CKB, lock: evm.lock },
      lateShards[1].cellOutput,
      { capacity: 421n * h.CKB, lock: evm.lock },
    ],
    ['0x', lateShards[0].outputData, '0x', lateShards[1].outputData, '0x'],
    { deps: lateControls.map(asHarnessCell), headers: [lateHeader] },
  );
  await h.commit(evm, replacement);
  await h.mine(3);
  await syncIndex();
  for (const [index, descriptor] of lateSigned.descriptors.entries()) {
    const snapshot = await lateAdapter.direct.discover(descriptor);
    assert(
      snapshot.positions.some(
        (position) =>
          position.status === 'refunded' &&
          position.outPoint.txHash === replacement.hash() &&
          position.outPoint.index === 2 + index * 2,
      ),
    );
    assert(snapshot.positions.some((position) => position.status === 'refund-required'));
  }
  record(
    'Exact type and shard ancestry recover distinct late refunds at nonzero batch output offsets',
    { transaction: replacement.hash() },
  );
  h.setClock(lateCutoff + 6 * 3600_000 + 1000);
  await h.mine(40);
  for (const descriptor of lateSigned.descriptors) {
    const closure = await operator(
      await buildClose(client, h.admin.signer, descriptor, 'void', h.getClock(), config),
      'close',
      descriptor,
    );
    assert.equal(closure.outputs[1].capacity, 421n * h.CKB);
    assert(closure.outputs[1].lock.eq(evm.lock));
    assert.equal(closure.outputs[1].type, undefined);
    assert.equal(closure.outputsData[1], '0x');
    assert(
      (await lateAdapter.direct.discover(descriptor)).positions.some(
        (position) =>
          position.status === 'refunded' &&
          position.entitlementShannons === (421n * h.CKB).toString(),
      ),
    );
  }
  record(
    'Six-hour cancellation refunds each late batch prediction in full without losing-pool fees',
  );
  assert(
    evm.signer.messages.length > 0 &&
      evm.signer.messages.every((message) => /^CKB transaction: 0x[0-9a-f]{64}$/.test(message)),
  );
  record(
    'EVM signing uses the actual CCC personal-message path and genuine OmniLock VM throughout',
  );
  await h.finish();
  evidence.status = 'passed';
  evidence.finishedAt = new Date().toISOString();
  evidence.harnessChecks = h.evidence.checks.length;
  save();
  console.log(`All ${evidence.checks.length} atomic product checks passed.`);
}
main().catch((error) => {
  evidence.status = 'failed';
  evidence.error = String(error.stack || error);
  evidence.finishedAt = new Date().toISOString();
  save();
  console.error(error);
  process.exitCode = 1;
});
