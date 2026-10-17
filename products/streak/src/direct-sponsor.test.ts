import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import * as ccc from '@ckb-ccc/core';
import { SponsorService, verifySponsorOwnerWitness } from './modules/direct/sponsor';
import { createSponsorServer } from './modules/direct/sponsor-http';
import { SponsorJournal, cancelUnsignedSponsorOffers } from './modules/direct/sponsor-journal';
import { OperatorBusyError, OperatorJournal } from './modules/direct/journal';
import { operatorFundingBarrier, assertFreshOperatorInputs } from './modules/direct/cli';
import {
  DirectRegistry,
  V3_DIRECT_CONFIG,
  PUBLIC_DIRECT_CONFIG,
  LEGACY_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  createRecord,
} from './modules/direct/registry';
import type { Match } from './types';

const CKB = 100_000_000n,
  H = (digit: string) => `0x${digit.repeat(64)}`;
const NOW = 1_800_000_000_000;
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
  const directory = mkdtempSync(join(tmpdir(), 'streak-sponsor-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.hostname !== '127.0.0.1') throw Error('Only isolated loopback HTTP is permitted');
    return originalFetch(input, init);
  };
  try {
    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    const sponsor = new ccc.SignerCkbPrivateKey(client, `0x${'01'.repeat(32)}`),
      owner = new ccc.SignerCkbPrivateKey(client, `0x${'02'.repeat(32)}`);
    const sponsorLock = (await sponsor.getRecommendedAddressObj()).script,
      ownerAddress = await owner.getRecommendedAddress(),
      ownerLock = (await owner.getRecommendedAddressObj()).script;
    const fund = ccc.Cell.from({
      outPoint: { txHash: H('1'), index: 0 },
      cellOutput: { capacity: 20_000n * CKB, lock: sponsorLock },
      outputData: '0x',
    });
    const user = ccc.Cell.from({
      outPoint: { txHash: H('2'), index: 0 },
      cellOutput: { capacity: 2000n * CKB, lock: ownerLock },
      outputData: '0x',
    });
    const cells = new Map([fund, user].map((cell) => [cell.outPoint.toHex(), cell]));
    client.getCellLiveNoCache = async (point) => cells.get(ccc.OutPoint.from(point).toHex());
    client.getCell = async (point) => cells.get(ccc.OutPoint.from(point).toHex());
    client.findCellsPagedNoCache = async () => ({ cells: [fund], lastCursor: '0x' });
    client.getTransactionNoCache = async () => undefined;
    let broadcasts = 0;
    client.sendTransactionNoCache = async () => {
      broadcasts++;
      throw Error('Isolated lost response');
    };
    const config = { ...V3_DIRECT_CONFIG, codeDeps: PUBLIC_DIRECT_CONFIG.codeDeps };
    let now = NOW;
    const fixture: Match = {
      id: 'api-football-9001',
      sport: 'football',
      date: '2027-01-15',
      kickoff: new Date(NOW + 3_600_000).toISOString(),
      status: 'scheduled',
      stage: 'Synthetic isolated test',
      home: { id: '1', name: 'Synthetic Home', code: 'H', flag: '' },
      away: { id: '2', name: 'Synthetic Away', code: 'A', flag: '' },
      oracle: { provider: 'api-football', fixtureId: '9001', source: PROVIDER_ORIGIN },
    };
    const journal = new OperatorJournal(join(directory, 'operator'), config),
      registry = new DirectRegistry(join(directory, 'registry'), config),
      archive = new DirectRegistry(join(directory, 'archive'));
    const legacyArgs = Buffer.alloc(172);
    legacyArgs.writeBigUInt64LE(BigInt(Date.parse(fixture.kickoff)), 68);
    Buffer.from(config.guardHash.slice(2), 'hex').copy(legacyArgs, 76);
    archive.add(
      createRecord(
        fixture,
        {
          codeHash: LEGACY_DIRECT_CONFIG.protocolHash,
          hashType: 'data2',
          args: `0x${legacyArgs.toString('hex')}`,
        },
        H('a'),
        LEGACY_DIRECT_CONFIG,
      ),
    );
    const service = new SponsorService({
      client,
      signer: sponsor,
      journal,
      registry,
      existingRegistry: [archive],
      config,
      fixture: async () => fixture,
      now: () => now,
    });
    const demand = await service.describe(fixture.id);
    assert.equal(demand.state, 'available', 'archived v1 cannot block compatible sponsorship');
    const request = {
      fixtureId: fixture.id,
      termsHash: demand.termsHash,
      ownerAddress,
      userInputs: [{ txHash: user.outPoint.txHash, index: 0 }],
      outcome: 0 as const,
      principalShannons: (100n * CKB).toString(),
      requestId: randomUUID(),
    };
    const offer = await service.prepareOffer(request),
      tx = ccc.Transaction.fromBytes(offer.unsignedBytes);
    assert.equal(fund.cellOutput.capacity - tx.outputs[5].capacity, 3050n * CKB);
    assert.equal(
      user.cellOutput.capacity - tx.outputs[6].capacity,
      421n * CKB + BigInt(offer.feeShannons),
    );
    assert.equal(tx.outputsData[1].slice(0, 10), '0x01000001');
    assert.deepEqual(await service.prepareOffer(request), offer, 'request identity is idempotent');
    const otherAddress = await sponsor.getRecommendedAddress();
    await assert.rejects(
      () =>
        service.prepareOffer({ ...request, ownerAddress: otherAddress, requestId: randomUUID() }),
      /completing another/,
    );
    await assert.rejects(
      () => service.prepareOffer({ ...request, principalShannons: '1' }),
      /outside pilot/,
    );
    console.log('PASS sponsored attribution, archived compatibility and exclusive offers');

    const invalid = tx.clone();
    invalid.outputs[5].capacity += 1n;
    await assert.rejects(
      () => verifySponsorOwnerWitness(client, offer, ccc.hexFrom(invalid.toBytes())),
      /changed the frozen/,
    );
    await assert.rejects(
      () =>
        service.submit({
          offerId: offer.offerId,
          rawHash: offer.rawHash,
          userSignedBytes: offer.unsignedBytes,
        }),
      /Invalid owner transaction signature/,
    );
    assert.equal(service.store.load(offer.offerId)?.userSignedBytes, undefined);
    assert.equal(broadcasts, 0);
    const signed = await owner.signOnlyTransaction(tx.clone()),
      userSignedBytes = ccc.hexFrom(signed.toBytes());
    await verifySponsorOwnerWitness(client, offer, userSignedBytes);
    const foreignWitness = signed.clone();
    foreignWitness.witnesses[0] = '0x00';
    await assert.rejects(
      () => verifySponsorOwnerWitness(client, offer, ccc.hexFrom(foreignWitness.toBytes())),
      /another witness/,
    );
    console.log('PASS invalid signatures and mutated net contributions never receive sponsorship');

    const partial = service.store.load(offer.offerId)!;
    partial.userSignedBytes = userSignedBytes;
    partial.state = 'owner-signed';
    service.store.save(partial);
    now = Date.parse(fixture.kickoff) + 1000;
    const restarted = new SponsorService({
      client,
      signer: sponsor,
      journal,
      registry,
      config,
      fixture: async () => {
        throw Error('No provider reads after accepted signature');
      },
      now: () => now,
    });
    const status = await restarted.status({ offerId: offer.offerId, rawHash: offer.rawHash }, true);
    assert.ok(
      status.signedBytes,
      'durable accepted partial finishes after the original quote expiry',
    );
    assert.equal(status.state, 'blocked');
    assert.equal(broadcasts, 1);
    const persisted = new SponsorJournal(journal.directory).load(offer.offerId)!;
    assert.equal(persisted.signedBytes, status.signedBytes);
    assert.ok(journal.load(`create-v3-${fixture.id}-${offer.rawHash.slice(2)}`));
    assert.equal((await operatorFundingBarrier(client, journal, registry)).clear, false);
    console.log(
      'PASS restart after cutoff retains exact signatures and unknown broadcast reservations',
    );

    const conflict = ccc.Transaction.from({
      inputs: [{ previousOutput: user.outPoint }],
      outputs: [{ capacity: user.cellOutput.capacity - 1000n, lock: ownerLock }],
      outputsData: ['0x'],
      witnesses: ['0x00'],
    });
    let canonical = H('6');
    client.getTransactionNoCache = async (hash) =>
      hash === conflict.hash()
        ? ccc.ClientTransactionResponse.from({
            transaction: conflict,
            status: 'committed',
            blockHash: H('6'),
            blockNumber: 10,
          })
        : undefined;
    client.getHeaderByNumberNoCache = async () => header(canonical, 10);
    client.getTipHeader = async () => header(H('7'), 13);
    await assert.rejects(
      () =>
        restarted.resolveConflict({
          offerId: offer.offerId,
          rawHash: offer.rawHash,
          conflictingTxHash: H('f'),
        }),
      /must spend/,
    );
    cells.delete(user.outPoint.toHex());
    client.findTransactionsPaged = async () => ({
      lastCursor: '0x',
      transactions: [
        {
          txHash: conflict.hash(),
          blockNumber: 10n,
          txIndex: 0n,
          isInput: true,
          cellIndex: 0n,
          cells: [{ isInput: true, cellIndex: 0n }],
        },
      ],
    });
    assert.equal(
      (await restarted.recoverPending())[0].state,
      'cancelled',
      'operator discovers an abandoned bettor conflict without a session',
    );
    assert.equal((await operatorFundingBarrier(client, journal, registry)).clear, true);
    assertFreshOperatorInputs(
      journal,
      ccc.Transaction.from({
        inputs: [{ previousOutput: fund.outPoint }],
        outputs: [{ capacity: fund.cellOutput.capacity - 1000n, lock: sponsorLock }],
        outputsData: ['0x'],
      }),
    );
    const retryInput = ccc.Cell.from({
      outPoint: { txHash: H('3'), index: 0 },
      cellOutput: { capacity: 2000n * CKB, lock: ownerLock },
      outputData: '0x',
    });
    cells.set(retryInput.outPoint.toHex(), retryInput);
    now = NOW;
    const retryOffer = await service.prepareOffer({
      ...request,
      userInputs: [{ txHash: retryInput.outPoint.txHash, index: 0 }],
      requestId: randomUUID(),
    });
    assert.deepEqual(
      retryOffer.sponsorInput,
      offer.sponsorInput,
      'same fixture retries must share their sponsor origin',
    );
    assert.notEqual(retryOffer.rawHash, offer.rawHash);
    const retrySigned = await owner.signOnlyTransaction(
      ccc.Transaction.fromBytes(retryOffer.unsignedBytes),
    );
    await service.submit({
      offerId: retryOffer.offerId,
      rawHash: retryOffer.rawHash,
      userSignedBytes: ccc.hexFrom(retrySigned.toBytes()),
    });
    assert.ok(journal.load(`create-v3-${fixture.id}-${offer.rawHash.slice(2)}`));
    assert.ok(
      journal.load(`create-v3-${fixture.id}-${retryOffer.rawHash.slice(2)}`),
      'each signed attempt has a separate immutable journal record',
    );
    assert.deepEqual(service.store.load(retryOffer.offerId)?.lineageOrigins, [
      fund.outPoint.toHex(),
    ]);
    console.log(
      'PASS conflict-proven fixture retries retain both attempts and a mutually exclusive funding lineage',
    );
    canonical = H('8');
    assert.equal(
      (await operatorFundingBarrier(client, journal, registry)).clear,
      false,
      'orphaned conflict re-reserves original inputs',
    );
    canonical = H('9');
    client.getTransactionNoCache = async (hash) =>
      hash === offer.rawHash
        ? ccc.ClientTransactionResponse.from({
            transaction: ccc.Transaction.fromBytes(status.signedBytes!),
            status: 'committed',
            blockHash: canonical,
            blockNumber: 10,
          })
        : undefined;
    assert.equal(
      (await restarted.status({ offerId: offer.offerId, rawHash: offer.rawHash })).state,
      'funded',
      'the original can win after its conflict proof is orphaned',
    );
    assert.equal(registry.get(fixture.id)?.creationTxHash, offer.rawHash);
    assert.equal(
      service.store.load(retryOffer.offerId)?.state,
      'cancelled',
      'the actual winner invalidates competing retry bytes',
    );
    assert.equal((await operatorFundingBarrier(client, journal, registry)).clear, true);
    console.log(
      'PASS canonical conflicts release reservations and reorgs restore the funding barrier',
    );

    const secret = 'a'.repeat(64),
      server = createSponsorServer(restarted, secret);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      assert.equal((await fetch(`${base}/configuration`)).status, 401);
      const configResponse = await fetch(`${base}/configuration`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(configResponse.status, 200);
      assert.equal(configResponse.headers.get('cache-control'), 'no-store');
      const publicConfig = (await configResponse.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(publicConfig).sort(), ['reservations', 'sponsorLock']);
      const before = broadcasts;
      await fetch(`${base}/status?offerId=${offer.offerId}&rawHash=${offer.rawHash}`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      assert.equal(broadcasts, before, 'read-only public recovery does not sign or broadcast');
      const denied = await fetch(`${base}/resume`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          authenticatedOwnerAddress: await sponsor.getRecommendedAddress(),
          request: { offerId: offer.offerId, rawHash: offer.rawHash },
        }),
      });
      assert.equal(denied.status, 403);
      const prepare = restarted.prepareOffer;
      const sendReview = () =>
        fetch(`${base}/offer`, {
          method: 'POST',
          headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
          body: JSON.stringify({ authenticatedOwnerAddress: request.ownerAddress, request }),
        });
      try {
        restarted.prepareOffer = async () => {
          throw new OperatorBusyError();
        };
        const busy = await sendReview();
        assert.equal(busy.status, 429);
        assert.match(JSON.stringify(await busy.json()), /Sponsor queue is busy/);
        restarted.prepareOffer = async () => {
          throw Error('private RPC payload and signing context');
        };
        const unavailable = await sendReview();
        const reviewMessage = JSON.stringify(await unavailable.json());
        assert.equal(unavailable.status, 409);
        assert.match(reviewMessage, /No payment was sent by this review/);
        assert.doesNotMatch(reviewMessage, /private RPC|signing context|Preserve any signed/);
      } finally {
        restarted.prepareOffer = prepare;
      }
    } finally {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    }
    console.log(
      'PASS operator IPC authentication, owner binding, public recovery and redacted configuration',
    );

    const otherJournal = new OperatorJournal(join(directory, 'expiry'), config),
      otherRegistry = new DirectRegistry(join(directory, 'expiry-registry'));
    now = NOW;
    client.getTransactionNoCache = async () => undefined;
    cells.set(user.outPoint.toHex(), user);
    const other = new SponsorService({
      client,
      signer: sponsor,
      journal: otherJournal,
      registry: otherRegistry,
      config,
      fixture: async () => fixture,
      now: () => now,
    });
    const expiring = await other.prepareOffer({ ...request, requestId: randomUUID() });
    now = expiring.expiresAt + 1;
    const expiredSignature = ccc.hexFrom(
      (
        await owner.signOnlyTransaction(ccc.Transaction.fromBytes(expiring.unsignedBytes))
      ).toBytes(),
    );
    await assert.rejects(
      () =>
        other.submit({
          offerId: expiring.offerId,
          rawHash: expiring.rawHash,
          userSignedBytes: expiredSignature,
        }),
      /expired/,
    );
    assert.equal(other.store.load(expiring.offerId)?.userSignedBytes, undefined);
    now = NOW;
    await otherJournal.exclusive(async () => {
      assert.equal(cancelUnsignedSponsorOffers(otherJournal.directory), 1);
    });
    assert.equal(other.store.load(expiring.offerId)?.state, 'cancelled');
    const existing = createRecord(
      fixture,
      {
        codeHash: PUBLIC_DIRECT_CONFIG.protocolHash,
        hashType: 'data2',
        args: `0x${legacyArgs.toString('hex')}`,
      },
      H('b'),
      PUBLIC_DIRECT_CONFIG,
    );
    otherRegistry.add(existing);
    await assert.rejects(
      () => other.prepareOffer({ ...request, requestId: randomUUID() }),
      /already has a funded market/,
    );
    console.log('PASS unsigned expiry, lifecycle preemption and immutable existing v2 markets');
  } finally {
    globalThis.fetch = originalFetch;
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith('streak-sponsor-'));
    rmSync(target, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
