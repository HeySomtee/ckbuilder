/* Actual sponsorship adapters and wallet signatures on an owned local CKB node. */
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
const { boot } = require('./sponsored-harness.cjs');
const { readOmniLock, setupOmniActor, PIN: OMNI_PIN } = require('./direct-omnilock.cjs');
const { SponsorService } = require('../src/modules/direct/sponsor.ts');
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
const artifacts = path.join(root, '.quality-artifacts/sponsored-chain');
const evidence = {
  kind: 'isolated-local-devnet',
  source: 'actual sponsored client, SponsorService and direct lifecycle adapters',
  provider: 'synthetic API-shaped fixtures; no provider requests',
  wallet: 'public CKB dev-chain and deterministic EVM fixture keys',
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
};
let parseReservation;
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
class FileJournal {
  constructor(file, parse, others) {
    this.file = file;
    this.parse = parse;
    this.others = others;
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
    return this.others
      ? this.others
          .read()
          .filter((row) => row.scope === scope)
          .map(parseReservation)
      : [];
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
    stage: 'Isolated sponsored integration',
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
  const { createDevnetSponsoredClient } =
    await import('../web/src/features/direct/sponsored-client.ts');
  const { createDevnetDirectClient } = await import('../web/src/features/direct/client.ts');
  const { parseSponsoredRecord } = await import('../web/src/features/direct/sponsored-journal.ts');
  const { parseRecord } = await import('../web/src/features/direct/journal.ts');
  const { parseDemandFixture, parseSponsorOffer, parseSponsorStatus } =
    await import('../web/src/features/direct/sponsored-protocol.ts');
  const { SPONSORED_MANIFEST, parseDescriptor, STORAGE } =
    await import('../web/src/features/direct/protocol.ts');
  ({ parseReservation } = await import('../web/src/features/direct/reservations.ts'));
  save();
  const h = await boot();
  const baseClient = new ccc.ClientPublicTestnet({
    url: 'http://127.0.0.1:8218',
    fallbacks: [],
    scripts: h.admin.signer.client.scripts,
  });
  const evmActor = await setupOmniActor(h, baseClient);
  const client = evmActor.signer.client;
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
  const operatorJournal = new OperatorJournal(path.join(directory, 'operator'), config);
  const registry = new DirectRegistry(path.join(directory, 'registry'), config);
  const fixtures = new Map();
  const serviceOptions = {
    client,
    signer: h.admin.signer,
    journal: operatorJournal,
    registry,
    config,
    now: () => h.getClock(),
    fixture: async (id) => {
      const value = fixtures.get(id);
      assert(value, 'Only registered synthetic fixture IDs are allowed');
      return value;
    },
  };
  let service = new SponsorService(serviceOptions);
  async function syncIndex() {
    const tip = await h.rpc('get_tip_header');
    await eventually(
      'Local indexer',
      () => h.rpc('get_indexer_tip'),
      (value) => value?.block_hash === tip.hash,
    );
  }
  await syncIndex();
  evidence.genesisHash = h.evidence.genesisHash;
  evidence.binaries = h.evidence.binaries;
  evidence.deploymentHash = deploymentHash;
  record('Pinned v3 and genuine OmniLock binaries deployed on a fresh isolated chain', {
    omniHash: OMNI_PIN.dataHash,
  });
  for (const [kind, actor, id] of [
    ['native', h.owner, 991001],
    ['evm', evmActor, 991002],
  ]) {
    const cutoff = (Math.ceil(h.getClock() / 1000) + 600) * 1000;
    const match = fixture(id, cutoff);
    fixtures.set(match.id, match);
    const demand = await service.describe(match.id);
    const request = {
      fixtureId: match.id,
      termsHash: demand.termsHash,
      ownerAddress: await actor.signer.getRecommendedAddress(),
      userInputs: [
        { txHash: actor.fund.outPoint.txHash, index: Number(actor.fund.outPoint.index) },
      ],
      outcome: 0,
      principalShannons: (100n * h.CKB).toString(),
      requestId: randomUUID(),
    };
    const raced = await Promise.allSettled([
      service.prepareOffer(request),
      service.prepareOffer({ ...request, requestId: randomUUID() }),
    ]);
    assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
    const offer = raced.find((result) => result.status === 'fulfilled').value;
    assert.equal(offer.rawHash, ccc.Transaction.fromBytes(offer.unsignedBytes).hash());
    assert.deepEqual((await service.prepareOffer(request)).rawHash, offer.rawHash);
    record(`${kind}: concurrent first offers reserve exactly one immutable sponsored transaction`);
    const unsigned = ccc.Transaction.fromBytes(offer.unsignedBytes);
    const sponsorInput = await client.getCellLiveNoCache(
      unsigned.inputs[0].previousOutput,
      true,
      true,
    );
    const ownerInput = await client.getCellLiveNoCache(
      unsigned.inputs[1].previousOutput,
      true,
      true,
    );
    assert.equal(sponsorInput.cellOutput.capacity - unsigned.outputs[5].capacity, 3050n * h.CKB);
    assert.equal(
      ownerInput.cellOutput.capacity - unsigned.outputs[6].capacity,
      421n * h.CKB + BigInt(offer.feeShannons),
    );
    assert.equal(unsigned.outputs[1].capacity, 1031n * h.CKB);
    assert.equal(unsigned.outputsData[1].slice(0, 10), '0x01000001');
    record(
      `${kind}: sponsor pays exactly the reserve and owner pays only principal, storage and fee`,
    );
    const partial = await actor.signer.signTransaction(unsigned);
    assert.equal(partial.hash(), offer.rawHash);
    const bad = partial.clone(),
      witness = ccc.WitnessArgs.fromBytes(bad.witnesses[1]);
    const bytes = ccc.bytesFrom(witness.lock);
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
    record(`${kind}: invalid owner signature is rejected before the sponsor signs`);
    const originalSend = client.sendTransactionNoCache.bind(client);
    client.sendTransactionNoCache = async () => {
      throw Error('Isolated transport interruption before node submission');
    };
    let submitted;
    try {
      submitted = await service.submit({
        offerId: offer.offerId,
        rawHash: offer.rawHash,
        userSignedBytes: partial.toHex(),
      });
    } finally {
      client.sendTransactionNoCache = originalSend;
    }
    assert.equal(submitted.state, 'blocked');
    const final = ccc.Transaction.fromBytes(submitted.signedBytes);
    assert.equal(final.hash(), partial.hash());
    assert.deepEqual(final.witnesses.slice(1), partial.witnesses.slice(1));
    assert.notEqual(final.witnesses[0], partial.witnesses[0]);
    const invalidFinal = final.clone();
    invalidFinal.setWitnessArgs(1, witness);
    await h.rejects(
      `${kind}: actual lock VM rejects a corrupted co-signed owner signature`,
      invalidFinal,
      /ValidationFailure|error code/,
    );
    service = new SponsorService({
      ...serviceOptions,
      journal: new OperatorJournal(operatorJournal.directory, config),
    });
    const resumed = await service.status({ offerId: offer.offerId, rawHash: offer.rawHash }, true);
    assert.equal(resumed.signedBytes, submitted.signedBytes);
    assert.equal(resumed.state, 'confirming');
    await h.commit(actor, final, true);
    await h.mine(3);
    await syncIndex();
    const confirmed = await service.status({ offerId: offer.offerId, rawHash: offer.rawHash });
    assert.equal(confirmed.state, 'funded');
    const response = await client.getTransactionNoCache(final.hash());
    h.admin.fund = {
      outPoint: { txHash: final.hash(), index: 5 },
      output: final.outputs[5],
      data: '0x',
      blockHash: response.blockHash,
    };
    assert.equal(registry.get(match.id).creationTxHash, final.hash());
    record(
      `${kind}: restart recovers exact co-signed bytes and one transaction creates market plus first stake`,
      { transaction: final.hash() },
    );
  }
  const transport = {
    offer: async (request) => parseSponsorOffer(await service.prepareOffer(request)),
    submit: async (request) => parseSponsorStatus(await service.submit(request)),
    status: async (offerId, rawHash) =>
      parseSponsorStatus(await service.status({ offerId, rawHash }, false)),
  };
  async function adapters(actor, kind) {
    const directJournal = new FileJournal(path.join(directory, `${kind}-direct.json`), parseRecord);
    const sponsoredJournal = new FileJournal(
      path.join(directory, `${kind}-sponsored.json`),
      parseSponsoredRecord,
      directJournal,
    );
    directJournal.others = sponsoredJournal;
    const options = {
      now: () => h.getClock(),
      scopeId: kind,
      exclusive: async (_name, action) => action(),
    };
    return {
      sponsoredJournal,
      directJournal,
      sponsored: await createDevnetSponsoredClient(
        actor.signer,
        config.codeDeps,
        transport,
        sponsoredJournal,
        options,
        directJournal,
      ),
      direct: await createDevnetDirectClient(
        actor.signer,
        config.codeDeps,
        kind,
        directJournal,
        options,
        SPONSORED_MANIFEST,
      ),
    };
  }
  async function browserCreation(actor, kind, id, interrupted = false, late = false) {
    let adapter = await adapters(actor, kind);
    const cutoff = (Math.ceil(h.getClock() / 1000) + 600) * 1000,
      match = fixture(id, cutoff);
    fixtures.set(match.id, match);
    const demand = await parseDemandFixture(await service.describe(match.id));
    let review;
    if (kind === 'native-browser') {
      const originalOffer = transport.offer;
      let pristine;
      try {
        for (const attack of ['contributor-shift', 'different-outcome']) {
          transport.offer = async (request) => {
            pristine ??= await originalOffer(request);
            const altered = ccc.Transaction.fromBytes(pristine.unsignedBytes);
            if (attack === 'contributor-shift') {
              altered.outputs[5].capacity += h.CKB;
              altered.outputs[6].capacity -= h.CKB;
            } else {
              const ticket = ccc.bytesFrom(altered.outputsData[1]);
              ticket[36] = 2;
              altered.outputsData[1] = ccc.hexFrom(ticket);
            }
            return {
              ...pristine,
              rawHash: altered.hash(),
              unsignedBytes: altered.toHex(),
              descriptor: { ...pristine.descriptor, creationTxHash: altered.hash() },
            };
          };
          await assert.rejects(
            () => adapter.sponsored.prepare(demand, 0, 100n * h.CKB),
            /exact stake|contribution|first position|prediction/i,
          );
          assert.equal((await adapter.sponsored.history()).length, 0);
          record(`Actual browser adapter rejects a sponsor offer with ${attack} before signing`);
        }
        transport.offer = async () => pristine;
        review = await adapter.sponsored.prepare(demand, 0, 100n * h.CKB);
      } finally {
        transport.offer = originalOffer;
      }
    } else review = await adapter.sponsored.prepare(demand, 0, 100n * h.CKB);
    assert.equal(review.sponsorReserveShannons, (3050n * h.CKB).toString());
    assert.equal(BigInt(review.totalShannons), 421n * h.CKB + BigInt(review.feeShannons));
    const signed = await adapter.sponsored.signAndPersist(review, await service.describe(match.id));
    assert.equal(signed.finalSignedBytes, undefined);
    assert.equal((await adapter.sponsored.history())[0].ownerSignedBytes, signed.ownerSignedBytes);
    record(
      `${kind}: actual SponsoredClient reviews exact payment and durably saves the owner signature`,
    );
    await assert.rejects(
      () => adapter.sponsored.prepare(demand, 0, 100n * h.CKB),
      /already.*signed|reserved/i,
    );
    const future = fixture(id + 100, cutoff);
    fixtures.set(future.id, future);
    // The same owner funding input remains unavailable while only a partial signature is saved.
    const actualScope = (await adapter.direct.identity()).scope;
    assert(
      (await adapter.directJournal.otherReservations(actualScope)).some(
        (row) => row.hash === signed.hash,
      ),
    );
    let returned;
    if (interrupted) {
      await transport.submit({
        offerId: signed.offer.offerId,
        rawHash: signed.hash,
        userSignedBytes: signed.ownerSignedBytes,
      });
      assert.equal(
        (await adapter.sponsored.history())[0].finalSignedBytes,
        undefined,
        'Simulate process death before accepting the HTTP response',
      );
      adapter = await adapters(actor, kind);
      const restored = (await adapter.sponsored.history()).find((row) => row.hash === signed.hash);
      assert.equal(restored.ownerSignedBytes, signed.ownerSignedBytes);
      returned = await adapter.sponsored.recover(restored);
      record(
        `${kind}: browser restart reconciles a lost submission response without another signature`,
      );
    } else returned = await adapter.sponsored.submit(signed);
    const serverState = await service.status({
      offerId: signed.offer.offerId,
      rawHash: signed.hash,
    });
    assert(serverState.signedBytes, 'Sponsor signed bytes must be recoverable');
    const final = ccc.Transaction.fromBytes(serverState.signedBytes);
    assert.equal(final.hash(), signed.hash);
    assert.deepEqual(
      final.witnesses.slice(1),
      ccc.Transaction.fromBytes(signed.ownerSignedBytes).witnesses.slice(1),
    );
    if (late) h.setClock(cutoff);
    await h.commit(actor, final, true);
    await h.mine(3);
    await syncIndex();
    const confirmed = await adapter.sponsored.recover(returned.record);
    assert.equal(confirmed.status, 'confirmed', confirmed.message);
    assert.equal(confirmed.record.finalSignedBytes, serverState.signedBytes);
    const published = await service.status({ offerId: signed.offer.offerId, rawHash: signed.hash });
    assert.equal(published.state, 'funded');
    const response = await client.getTransactionNoCache(final.hash());
    h.admin.fund = {
      outPoint: { txHash: final.hash(), index: 5 },
      output: final.outputs[5],
      data: '0x',
      blockHash: response.blockHash,
    };
    const descriptor = await parseDescriptor(signed.descriptor);
    const view = await eventually(
      'First sponsored ticket discovery',
      () => adapter.direct.discover(descriptor),
      (value) => value.positions.length > 0,
    );
    assert(
      view.positions.some((position) => position.principalShannons === (100n * h.CKB).toString()),
    );
    record(
      `${kind}: one confirmed wallet payment creates the market and its discoverable first position`,
      { transaction: signed.hash, late },
    );
    return { adapter, descriptor, record: confirmed.record };
  }
  async function commitDirect(adapter, actor, descriptor, review, name) {
    const signed = await adapter.signAndPersist(review, descriptor);
    const result = await adapter.broadcast(signed);
    assert(['submitted', 'unknown'].includes(result.status), result.message);
    await h.commit(actor, ccc.Transaction.fromBytes(signed.signedBytes), true);
    await h.mine(3);
    await syncIndex();
    assert.equal((await adapter.recover(signed)).status, 'confirmed');
    record(name, { transaction: signed.hash });
  }
  async function commitOperator(tx, action, descriptor, name) {
    const signed = await h.admin.signer.signTransaction(tx);
    const operation = operatorJournal.persist(action, descriptor, signed, h.getClock());
    assert.equal(
      (await broadcastOperation(client, operatorJournal, operation, h.getClock())).status,
      'pending',
    );
    const outputs = await h.commit(h.admin, signed, true);
    await h.mine(3);
    await syncIndex();
    const state = await reconcileOperation(client, operation);
    assert.equal(state.status, 'committed');
    assert(state.confirmations >= 4);
    record(name, { transaction: signed.hash });
    return { tx: signed, outputs };
  }
  async function recoverFailedFirstBettor(originalWins = false) {
    const adapter = await adapters(
      h.owner,
      originalWins ? 'original-wins-browser' : 'retry-browser',
    );
    const match = fixture(
      originalWins ? 991007 : 991006,
      (Math.ceil(h.getClock() / 1000) + 600) * 1000,
    );
    fixtures.set(match.id, match);
    const demand = await parseDemandFixture(await service.describe(match.id));
    const review = await adapter.sponsored.prepare(demand, 0, 100n * h.CKB);
    const original = await adapter.sponsored.signAndPersist(review, demand);
    const send = client.sendTransactionNoCache.bind(client);
    client.sendTransactionNoCache = async () => {
      throw Error('Isolated interruption before original first payment broadcast');
    };
    let interrupted;
    try {
      interrupted = await adapter.sponsored.submit(original);
    } finally {
      client.sendTransactionNoCache = send;
    }
    assert(interrupted.record.finalSignedBytes, 'Both signatures must survive the interruption');
    assert.equal(await client.getTransactionNoCache(original.hash), undefined);
    const signed = ccc.Transaction.fromBytes(interrupted.record.finalSignedBytes);
    const userCell = await client.getCellLiveNoCache(signed.inputs[1].previousOutput, true, true);
    assert(userCell);
    const externalSpend = await h.owner.signer.signTransaction(
      ccc.Transaction.from({
        inputs: [{ previousOutput: userCell.outPoint }],
        outputs: [
          { capacity: userCell.cellOutput.capacity - h.CKB, lock: userCell.cellOutput.lock },
        ],
        outputsData: ['0x'],
      }),
    );
    const beforeConflict = await h.rpc('get_tip_header');
    await h.commit(h.owner, externalSpend);
    assert.equal((await adapter.sponsored.recover(interrupted.record)).status, 'conflict');
    const proof = {
      offerId: original.offer.offerId,
      rawHash: original.hash,
      conflictingTxHash: externalSpend.hash(),
    };
    await assert.rejects(() => service.resolveConflict(proof), /four canonical confirmations/);
    await h.mine(3);
    await syncIndex();
    assert.equal((await service.resolveConflict(proof)).state, 'cancelled');
    const resolved = await adapter.sponsored.resolveConflict(
      interrupted.record,
      externalSpend.hash(),
    );
    assert.equal(resolved.status, 'resolved');
    record(
      'A confirmed external bettor spend releases a failed first payment without deleting either signature',
    );

    const conflictTip = await h.rpc('get_tip_header');
    await h.rpc('truncate', [beforeConflict.hash]);
    await h.rpc('remove_transaction', [externalSpend.hash()]);
    h.setClock(h.getClock() + 1000);
    await h.mine(Number(BigInt(conflictTip.number) - BigInt(beforeConflict.number)) + 4);
    await syncIndex();
    assert.equal((await adapter.sponsored.recover(resolved.record)).status, 'reorg');
    const ownerAddress = await h.owner.signer.getRecommendedAddress();
    await assert.rejects(
      () =>
        service.prepareOffer({
          fixtureId: match.id,
          termsHash: demand.termsHash,
          ownerAddress,
          userInputs: [
            { txHash: userCell.outPoint.txHash, index: Number(userCell.outPoint.index) },
          ],
          outcome: 0,
          principalShannons: (100n * h.CKB).toString(),
          requestId: randomUUID(),
        }),
      /canonical confirmation|canonical recovery/,
    );
    record(
      'A real conflict-proof reorg restores reservations and forbids a new sponsored first payment',
    );
    if (originalWins) {
      await h.commit(h.owner, signed);
      await h.mine(3);
      await syncIndex();
      const status = await service.status({
        offerId: original.offer.offerId,
        rawHash: original.hash,
      });
      assert.equal(status.state, 'funded');
      assert.equal(registry.get(match.id).creationTxHash, original.hash);
      assert.equal((await adapter.sponsored.recover(resolved.record)).status, 'confirmed');
      const { operatorFundingBarrier } = require('../src/modules/direct/cli.ts');
      assert.equal((await operatorFundingBarrier(client, operatorJournal, registry)).clear, true);
      const response = await client.getTransactionNoCache(original.hash);
      h.admin.fund = {
        outPoint: { txHash: original.hash, index: 5 },
        output: signed.outputs[5],
        data: '0x',
        blockHash: response.blockHash,
      };
      record(
        'An original payment winning after a conflict-proof reorg restores the market and funding service',
        {
          transaction: original.hash,
          orphanedConflict: externalSpend.hash(),
        },
      );
      return;
    }
    await h.commit(h.owner, externalSpend);
    await h.mine(3);
    await syncIndex();
    await service.resolveConflict(proof);
    await adapter.sponsored.resolveConflict(resolved.record, externalSpend.hash());
    const fresh = await parseDemandFixture(await service.describe(match.id));
    const retryReview = await adapter.sponsored.prepare(fresh, 2, 125n * h.CKB);
    const retry = await adapter.sponsored.signAndPersist(retryReview, fresh);
    assert.notEqual(retry.hash, original.hash);
    assert.deepEqual(retry.offer.sponsorInput, original.offer.sponsorInput);
    assert.equal(retry.descriptor.type.args, original.descriptor.type.args);
    const submitted = await adapter.sponsored.submit(retry);
    assert(submitted.record.finalSignedBytes);
    const final = ccc.Transaction.fromBytes(submitted.record.finalSignedBytes);
    await h.commit(h.owner, final, true);
    await h.mine(3);
    await syncIndex();
    assert.equal((await adapter.sponsored.recover(submitted.record)).status, 'confirmed');
    assert.equal(
      (await service.status({ offerId: retry.offer.offerId, rawHash: retry.hash })).state,
      'funded',
    );
    assert.equal(registry.get(match.id).creationTxHash, retry.hash);
    assert.equal(
      service.store.load(original.offer.offerId).signedBytes,
      interrupted.record.finalSignedBytes,
    );
    assert.equal((await adapter.sponsored.history()).length, 2);
    const response = await client.getTransactionNoCache(final.hash());
    h.admin.fund = {
      outPoint: { txHash: final.hash(), index: 5 },
      output: final.outputs[5],
      data: '0x',
      blockHash: response.blockHash,
    };
    await h.rejects(
      'Original first payment cannot coexist with its successful retry',
      signed,
      /Dead|Unknown|Resolve|spent/,
    );
    record(
      'The same fixture accepts a fresh first bettor payment using mutually exclusive sponsor funding',
      {
        original: original.hash,
        conflictingTransaction: externalSpend.hash(),
        retry: retry.hash,
      },
    );
    const retryDescriptor = await parseDescriptor(retry.descriptor);
    h.setClock(retryDescriptor.cutoffMs + 31_000);
    await h.mine(40);
    const retryEvidence = confirmFootballEvidence(
      validateFootballEvidence(
        retryDescriptor,
        footballPayload(retryDescriptor),
        h.getClock() - 30_000,
      ),
      validateFootballEvidence(retryDescriptor, footballPayload(retryDescriptor), h.getClock()),
      h.getClock(),
    );
    const orphanedReport = operatorJournal.persist(
      'report',
      retryDescriptor,
      await h.admin.signer.signTransaction(
        await buildReport(
          client,
          h.admin.signer,
          retryDescriptor,
          retryEvidence,
          h.getClock(),
          config,
        ),
      ),
      h.getClock(),
    );
    const publishedTip = await h.rpc('get_tip_header');
    await h.rpc('truncate', [beforeConflict.hash]);
    await h.rpc('remove_transaction', [final.hash()]);
    await h.rpc('remove_transaction', [externalSpend.hash()]);
    h.setClock(h.getClock() + 1000);
    await h.mine(Number(BigInt(publishedTip.number) - BigInt(beforeConflict.number)) + 4);
    await syncIndex();
    await h.commit(h.owner, signed);
    await h.mine(3);
    await syncIndex();
    assert.equal(
      (await service.status({ offerId: original.offer.offerId, rawHash: original.hash })).state,
      'funded',
    );
    assert.equal(registry.get(match.id).creationTxHash, original.hash);
    assert.equal((await adapter.sponsored.recover(resolved.record)).status, 'confirmed');
    const canonicalDescriptor = await parseDescriptor(original.descriptor);
    const canonicalView = await adapter.direct.discover(canonicalDescriptor);
    assert(
      canonicalView.positions.some(
        (position) => position.principalShannons === (100n * h.CKB).toString(),
      ),
    );
    await assert.rejects(() => adapter.direct.discover(retryDescriptor), /creation.*canonical/i);
    assert.equal(
      (await adapter.sponsored.resolveConflict(submitted.record, original.hash)).status,
      'resolved',
    );
    const { operatorFundingBarrier } = require('../src/modules/direct/cli.ts');
    assert.equal((await operatorFundingBarrier(client, operatorJournal, registry)).clear, true);
    assert.equal(
      operatorJournal.load(orphanedReport.operationId).signedTransaction,
      orphanedReport.signedTransaction,
    );
    assert.equal(
      service.store.load(retry.offer.offerId).signedBytes,
      submitted.record.finalSignedBytes,
    );
    const winner = await client.getTransactionNoCache(original.hash);
    h.admin.fund = {
      outPoint: { txHash: original.hash, index: 5 },
      output: signed.outputs[5],
      data: '0x',
      blockHash: winner.blockHash,
    };
    record(
      'A previously published retry can be orphaned and its canonical original recovered without losing either record',
      {
        canonical: original.hash,
        orphanedRetry: retry.hash,
      },
    );
    record(
      'A signed report belonging to the orphaned creation cannot block the canonical market lifecycle',
      {
        orphanedReport: orphanedReport.transactionHash,
        canonicalCreation: original.hash,
      },
    );
    record(
      'Identical market scripts retain separate creation identities and only canonical positions are discoverable',
    );
  }
  for (const [kind, actor, id] of [
    ['native-browser', h.owner, 991003],
    ['evm-browser', evmActor, 991004],
  ]) {
    const first = await browserCreation(actor, kind, id, kind === 'evm-browser');
    const counterparty = (await adapters(h.admin, `counterparty-${id}`)).direct;
    await commitDirect(
      counterparty,
      h.admin,
      first.descriptor,
      await counterparty.prepareDeposit(first.descriptor, 1, 200n * h.CKB),
      `${kind}: later native stake admits the first ticket using its creation header`,
    );
    await eventually(
      'First ticket admission',
      () => first.adapter.direct.discover(first.descriptor),
      (value) => value.positions.some((position) => position.status === 'accepted'),
    );
    h.setClock(first.descriptor.cutoffMs + 31_000);
    await h.mine(40);
    const evidence = confirmFootballEvidence(
      validateFootballEvidence(
        first.descriptor,
        footballPayload(first.descriptor),
        h.getClock() - 30_000,
      ),
      validateFootballEvidence(first.descriptor, footballPayload(first.descriptor), h.getClock()),
      h.getClock(),
    );
    await commitOperator(
      await buildReport(client, h.admin.signer, first.descriptor, evidence, h.getClock(), config),
      'report',
      first.descriptor,
      `${kind}: confirmed synthetic oracle result`,
    );
    await commitOperator(
      await buildClose(client, h.admin.signer, first.descriptor, 'settle', h.getClock(), config),
      'close',
      first.descriptor,
      `${kind}: settlement funds independent winner and loser claims`,
    );
    const view = await eventually(
      'Sponsored winner claim',
      () => first.adapter.direct.discover(first.descriptor),
      (value) => value.positions.some((position) => position.status === 'claimable'),
    );
    const claim = view.positions.find((position) => position.status === 'claimable');
    assert.equal(claim.entitlementShannons, (294n * h.CKB + STORAGE).toString());
    await commitDirect(
      first.adapter.direct,
      actor,
      first.descriptor,
      await first.adapter.direct.prepareClaim(first.descriptor, claim.outPoint),
      `${kind}: winning first bettor claims full 615 CKB with separately funded miner fee`,
    );
  }
  await recoverFailedFirstBettor();
  await recoverFailedFirstBettor(true);
  const late = await browserCreation(evmActor, 'late-evm-browser', 991005, false, true);
  h.setClock(late.descriptor.terms.deadlineMs + 1000);
  await h.mine(40);
  const closure = await commitOperator(
    await buildClose(client, h.admin.signer, late.descriptor, 'void', h.getClock(), config),
    'close',
    late.descriptor,
    'Six-hour closure refunds a first transaction committed after kickoff',
  );
  assert.equal(closure.tx.outputs[1].capacity, 421n * h.CKB);
  assert(closure.tx.outputs[1].lock.eq(evmActor.lock));
  assert.equal(closure.tx.outputs[1].type, undefined);
  assert.equal(closure.tx.outputsData[1], '0x');
  assert.equal(closure.tx.outputsData[0], `0x02ff${'00'.repeat(32)}`);
  assert(await client.getCellLiveNoCache({ txHash: closure.tx.hash(), index: 1 }, true, true));
  record('Late first bettor receives exactly 421 CKB directly, with no losing-pool fees');
  assert(
    evmActor.signer.messages.every((message) => /^CKB transaction: 0x[0-9a-f]{64}$/.test(message)),
  );
  record('All EVM signing uses the real CCC personal-message path and actual OmniLock VM');
  evidence.status = 'passed';
  evidence.finishedAt = new Date().toISOString();
  save();
  await h.finish();
  console.log(`All ${evidence.checks.length} sponsored integration checks passed.`);
}
main().catch((error) => {
  evidence.status = 'failed';
  evidence.error = error.stack || error.message;
  save();
  console.error(error);
  process.exitCode = 1;
});
