import assert from 'node:assert/strict';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import * as ccc from '@ckb-ccc/core';
import { BatchService } from './modules/direct/batch';
import { OperatorJournal } from './modules/direct/journal';
import {
  DirectRegistry,
  V4_DIRECT_CONFIG,
  createRecord,
  PROVIDER_ORIGIN,
} from './modules/direct/registry';
import {
  readCampaignAbsence,
  parseCampaignAbsenceRequest,
} from './modules/direct/campaign-absence';
import { createSponsorServer } from './modules/direct/sponsor-http';
import type { SponsorEntry } from './modules/direct/sponsor-journal';
import type { BatchOffer } from '../shared/batch-wire';
import type { Match } from './types';

const NOW = 1_800_000_000_000;
const hex = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const header = (number: number, timestamp = NOW) =>
  ccc.ClientBlockHeader.from({
    compactTarget: 0,
    dao: { c: 0, ar: 0, s: 0, u: 0 },
    epoch: [0, 0, 1],
    extraHash: hex(0),
    hash: hex(number),
    nonce: 0,
    number,
    parentHash: hex(number - 1),
    proposalsHash: hex(0),
    timestamp,
    transactionsRoot: hex(0),
    version: 0,
  });

async function main() {
  const folder = mkdtempSync(join(tmpdir(), 'streak-campaign-absence-'));
  try {
    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    // Fixed synthetic signer never sends or signs; every chain method used is replaced below.
    const signer = new ccc.SignerCkbPrivateKey(client, `0x${'01'.repeat(32)}`);
    const lock = ccc.Script.from({
      codeHash: hex(5),
      hashType: 'type',
      args: `0x${'01'.repeat(20)}`,
    });
    const journal = new OperatorJournal(join(folder, 'operator'));
    const registry = new DirectRegistry(join(folder, 'registry'), V4_DIRECT_CONFIG);
    let now = NOW,
      checkpointTime = NOW,
      orphanCheckpoint = false,
      checkpointReads = 0;
    const history = new Map<string, ccc.ClientTransactionResponse>();
    client.getTransactionNoCache = async (hash) => history.get(ccc.hexFrom(hash));
    client.getTipHeader = async () => header(15);
    client.getHeaderByNumberNoCache = async (value) => {
      const n = Number(value);
      if (n === 12 && orphanCheckpoint && ++checkpointReads > 1) return header(99);
      return header(n, n === 12 ? checkpointTime : NOW);
    };
    client.sendTransactionNoCache = async () => {
      throw Error('No broadcast is allowed in absence verification.');
    };
    const service = new BatchService({
      client,
      signer,
      journal,
      registry,
      config: V4_DIRECT_CONFIG,
      fixture: async () => {
        throw Error('No provider calls are allowed.');
      },
      now: () => now,
    });
    function makeEntry(
      id: number,
      accepted = false,
    ): { entry: SponsorEntry; offer: BatchOffer; tx: ccc.Transaction } {
      const fixtureId = `api-football-${id}`,
        cutoff = NOW - 600_000;
      const match: Match = {
        id: fixtureId,
        sport: 'football',
        date: '2027-01-15',
        kickoff: new Date(cutoff).toISOString(),
        status: 'scheduled',
        stage: 'Synthetic absence test',
        home: { id: 'home', name: 'Home', code: 'H', flag: '' },
        away: { id: 'away', name: 'Away', code: 'A', flag: '' },
        oracle: { provider: 'api-football', fixtureId: String(id), source: PROVIDER_ORIGIN },
      };
      const point = ccc.OutPoint.from({ txHash: hex(id), index: 0 });
      const args = Buffer.alloc(172);
      Buffer.from(ccc.hashCkb(point.toBytes()).slice(2), 'hex').copy(args, 0);
      args.writeBigUInt64LE(BigInt(cutoff), 68);
      Buffer.from(V4_DIRECT_CONFIG.guardHash.slice(2), 'hex').copy(args, 76);
      const type = {
        codeHash: V4_DIRECT_CONFIG.protocolHash,
        hashType: 'data2' as const,
        args: `0x${args.toString('hex')}`,
      };
      const tx = ccc.Transaction.from({
        inputs: [
          { previousOutput: point },
          { previousOutput: { txHash: hex(id + 100_000), index: 0 } },
        ],
        outputs: [{ capacity: 100_000_000_000n, lock, type }],
        outputsData: ['0x0000ff'],
        witnesses: ['0x', '0x'],
      });
      const record = createRecord(match, type, tx.hash(), V4_DIRECT_CONFIG);
      const fixture = {
        fixtureId,
        label: record.label,
        cutoffMs: cutoff,
        terms: record.terms,
        termsHash: record.termsHash,
        state: 'available' as const,
        sponsorLock: { ...lock },
      };
      const descriptor = { ...record, entryEnabled: true };
      const input = {
        outPoint: { txHash: point.txHash, index: 0 },
        capacityShannons: '100000000000',
        lock: { ...lock },
        data: '0x',
      };
      const offer: BatchOffer = {
        version: 'atomic-predictions-v1',
        offerId: randomUUID(),
        expiresAt: cutoff - 120_000,
        rawHash: tx.hash(),
        unsignedBytes: ccc.hexFrom(tx.toBytes()),
        sponsorLock: { ...lock },
        ownerLock: { ...lock },
        sponsorInput: input.outPoint,
        userInputIndexes: [1],
        inputs: [input, input],
        lines: [
          {
            fixture,
            descriptor,
            mode: 'create',
            outcome: 0,
            principalShannons: '10000000000',
            shard: 0,
            outputIndex: 0,
            outputCount: 5,
          },
        ],
        reserveShannons: '305000000000',
        principalShannons: '10000000000',
        storageShannons: '32100000000',
        feeShannons: '1',
        sponsorChangeOutputIndex: 1,
        ownerChangeOutputIndex: 2,
        fixture,
        descriptor,
        outcome: 0,
      };
      const entry: SponsorEntry = {
        version: 1,
        requestId: randomUUID(),
        requestDigest: hex(id),
        ownerAddress: 'synthetic-owner',
        createdAtMs: cutoff - 180_000,
        lineageOrigins: [],
        offer,
        state: accepted ? 'owner-signed' : 'offered',
        ...(accepted ? { userSignedBytes: offer.unsignedBytes } : {}),
      };
      return { entry, offer, tx };
    }
    const pin = (id: number) => ({
      fixtureId: `api-football-${id}`,
      cutoffMs: NOW - 600_000,
      protocolHash: V4_DIRECT_CONFIG.protocolHash,
    });
    const request = { fixtures: [pin(9002)] };
    assert.throws(() => parseCampaignAbsenceRequest({ fixtures: [] }), /one to 64/);
    assert.throws(
      () => parseCampaignAbsenceRequest({ fixtures: [pin(9002), pin(9002)] }),
      /repeat/,
    );
    assert.throws(
      () => parseCampaignAbsenceRequest({ fixtures: [{ ...pin(9002), protocolHash: hex(1) }] }),
      /Invalid/,
    );
    await assert.rejects(readCampaignAbsence(service, request), /ENOENT|unavailable/);
    const anchor = makeEntry(9001, true);
    anchor.entry.signedBytes = anchor.offer.unsignedBytes;
    anchor.entry.state = 'funded';
    service.store.save(anchor.entry);
    journal.persist('batch', anchor.offer.descriptor, anchor.tx, NOW - 700_000, [
      anchor.offer.descriptor,
    ]);
    history.set(
      anchor.tx.hash(),
      ccc.ClientTransactionResponse.from({
        transaction: anchor.tx,
        status: 'committed',
        blockHash: header(10).hash,
        blockNumber: 10,
      }),
    );
    await journal.exclusive(() => registry.publishCanonical(anchor.offer.descriptor, client));
    const absent = await readCampaignAbsence(service, request);
    assert.equal(absent.basis, 'operator-attested-empty');
    assert.equal(absent.fixtures[0].status, 'absent');
    assert.equal(absent.checkpoint.blockNumber, '12');
    assert.ok(!JSON.stringify(absent).includes('synthetic-owner'));
    assert.ok(!JSON.stringify(absent).includes(anchor.offer.unsignedBytes));
    assert.equal(
      (await readCampaignAbsence(service, { fixtures: [pin(9001)] })).fixtures[0].status,
      'unresolved',
    );
    const unsigned = makeEntry(9002);
    service.store.save(unsigned.entry);
    assert.equal(
      (await readCampaignAbsence(service, request)).fixtures[0].status,
      'absent',
      'An expired never-accepted offer cannot be signed later.',
    );
    unsigned.entry.userSignedBytes = unsigned.offer.unsignedBytes;
    unsigned.entry.state = 'owner-signed';
    service.store.save(unsigned.entry);
    assert.equal(
      (await readCampaignAbsence(service, request)).fixtures[0].status,
      'unresolved',
      'An accepted owner partial blocks even without an operator signature.',
    );
    unsigned.entry.state = 'cancelled';
    service.store.save(unsigned.entry);
    assert.equal(
      (await readCampaignAbsence(service, request)).fixtures[0].status,
      'unresolved',
      'A cached cancellation never proves canonical conflict.',
    );
    const emptyRequest = { fixtures: [pin(9003)] };
    client.getTipHeader = async () => {
      await journal.exclusive(async () => service.store.save(makeEntry(9004).entry));
      return header(15);
    };
    await assert.rejects(
      readCampaignAbsence(service, emptyRequest),
      /unavailable/,
      'RPC runs outside the payment lease, and a history change during RPC invalidates its snapshot.',
    );
    client.getTipHeader = async () => header(15);
    assert.equal((await readCampaignAbsence(service, emptyRequest)).fixtures[0].status, 'absent');
    now = pin(9003).cutoffMs;
    assert.equal(
      (await readCampaignAbsence(service, emptyRequest)).fixtures[0].status,
      'unresolved',
    );
    now = NOW;
    checkpointTime = pin(9003).cutoffMs;
    assert.equal(
      (await readCampaignAbsence(service, emptyRequest)).fixtures[0].status,
      'unresolved',
      'Wall clock alone cannot replace a mature post-cutoff chain checkpoint.',
    );
    checkpointTime = NOW;
    orphanCheckpoint = true;
    await assert.rejects(readCampaignAbsence(service, emptyRequest), /unavailable/);
    orphanCheckpoint = false;
    const anchorFile = join(service.store.directory, `${anchor.offer.offerId}.json`);
    renameSync(anchorFile, `${anchorFile}.missing`);
    await assert.rejects(readCampaignAbsence(service, emptyRequest), /unavailable/);
    renameSync(`${anchorFile}.missing`, anchorFile);
    const selectedPath = join(registry.directory!, 'api-football-9001.json');
    renameSync(selectedPath, `${selectedPath}.missing`);
    await assert.rejects(readCampaignAbsence(service, emptyRequest), /unavailable/);
    renameSync(`${selectedPath}.missing`, selectedPath);
    const malformed = join(journal.directory, 'batch-v4-malformed.json');
    writeFileSync(malformed, '{}');
    await assert.rejects(readCampaignAbsence(service, emptyRequest), /unavailable/);
    rmSync(malformed);
    const ipc = 'ab'.repeat(32);
    const disabledServer = createSponsorServer(service, ipc, service);
    await new Promise<void>((done) => disabledServer.listen(0, '127.0.0.1', done));
    try {
      const disabledEndpoint = `http://127.0.0.1:${(disabledServer.address() as AddressInfo).port}/campaign/absence`;
      const disabled = await fetch(disabledEndpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${ipc}`, 'content-type': 'application/json' },
        body: JSON.stringify({ request: emptyRequest }),
      });
      assert.equal(
        disabled.status,
        409,
        'Absence attestation is disabled without explicit complete-history acknowledgement.',
      );
      assert.ok(!Object.prototype.hasOwnProperty.call(await disabled.json(), 'fixtures'));
    } finally {
      await new Promise<void>((done, reject) =>
        disabledServer.close((error) => (error ? reject(error) : done())),
      );
    }
    const server = createSponsorServer(service, ipc, service, {
      campaignEmptyHistoryAcknowledged: true,
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/campaign/absence`;
    try {
      assert.equal(
        (await fetch(endpoint, { method: 'POST', body: JSON.stringify({ request: emptyRequest }) }))
          .status,
        401,
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${ipc}`, 'content-type': 'application/json' },
        body: JSON.stringify({ request: emptyRequest }),
      });
      assert.equal(response.status, 200);
      assert.equal(
        ((await response.json()) as { fixtures: { status: string }[] }).fixtures[0].status,
        'absent',
      );
    } finally {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    }
    console.log(
      'Campaign absence checks passed: retained history, canonical checkpoint, expiry, partial/cancelled reservations, missing/corrupt namespaces and authenticated IPC.',
    );
  } finally {
    const target = resolve(folder);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith('streak-campaign-absence-')
    )
      throw Error('Unsafe synthetic cleanup target.');
    rmSync(target, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
