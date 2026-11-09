import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ccc } from '@ckb-ccc/core';
import { CampaignEntryPayments } from '../modules/campaigns/entry-payments';
import { CampaignError } from '../modules/campaigns/domain';

/** Actual API routing with isolated storage/operator adapters; PG atomicity is tested separately. */
export async function campaignEntryHttp(
  base: string,
  cookie: string,
  wallet: string,
): Promise<void> {
  const runtime: typeof import('../modules/campaigns/runtime') = require('../modules/campaigns/runtime');
  const proxy: typeof import('../modules/direct/sponsor-proxy') = require('../modules/direct/sponsor-proxy');
  const previous = {
    enabled: runtime.campaignPaymentsEnabled,
    payments: runtime.campaignEntryPayments,
    proxy: proxy.sponsorProxy,
  };
  const pool = new Pool({
    connectionString: 'postgresql://synthetic:synthetic@127.0.0.1:1/unused_test',
  });
  const payments = new CampaignEntryPayments(
    pool,
    async () => {
      throw Error('Unexpected database access');
    },
    () => {},
  );
  const local = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const lock = (await ccc.Address.fromString(wallet, local)).script;
  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: '0x' + '11'.repeat(32), index: 0 } }],
    outputs: [{ capacity: 10000000000n, lock }],
    outputsData: ['0x'],
  });
  const offer = {
    version: 'atomic-predictions-v1',
    offerId: randomUUID(),
    rawHash: tx.hash(),
    unsignedBytes: tx.toHex(),
    ownerLock: lock,
    expiresAt: Date.now() + 60000,
    lines: [
      {
        fixture: { fixtureId: 'api-football-1' },
        outcome: 0,
        principalShannons: '10000000000',
        outputIndex: 0,
        mode: 'deposit',
      },
    ],
  };
  const order: string[] = [];
  let failReserve = false,
    failStart = false;
  const requestBody = {
    ownerAddress: wallet,
    requestId: randomUUID(),
    userInputs: [],
    picks: [],
    competitionSelection: {
      accountId: 'http-user-1',
      lines: [{ fixtureId: 'api-football-1', campaignIds: ['cup'] }],
    },
  };
  payments.reserve = async (actor, saved, choices) => {
    order.push('reserve');
    assert.equal(actor.id, 'http-user-1');
    assert.equal(actor.ownerHash, lock.hash());
    assert.equal(saved.rawHash, offer.rawHash);
    assert.deepEqual(choices, requestBody.competitionSelection);
    if (failReserve) throw new CampaignError('Synthetic reservation conflict.', 409);
  };
  payments.start = async (actor) => {
    order.push('start');
    assert.equal(actor.id, 'http-user-1');
    if (failStart) throw new CampaignError('Synthetic released intent.', 409);
  };
  payments.release = async () => {
    order.push('release');
    return true;
  };
  payments.observe = async () => {
    order.push('observe');
  };
  runtime.campaignPaymentsEnabled = () => true;
  runtime.campaignEntryPayments = () => payments;
  proxy.sponsorProxy = async (path, value, owner) => {
    order.push(path);
    assert.equal(owner, wallet);
    assert.ok(
      value && typeof value === 'object' && !('competitionSelection' in value),
      'application choices never enter signer requests',
    );
    return path === '/batch/offer'
      ? offer
      : { state: 'offered', offer, transactionHash: offer.rawHash };
  };
  const post = (action: string, body: unknown, signed = true) =>
    fetch(`${base}/api/direct/batch/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base, ...(signed ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post('offer', requestBody, false)).status, 401);
    assert.deepEqual(order, []);
    failReserve = true;
    const failed = await post('offer', requestBody);
    assert.equal(failed.status, 409);
    assert.equal((await failed.json()).error, 'Synthetic reservation conflict.');
    assert.deepEqual(order.splice(0), ['/batch/offer', 'reserve']);
    failReserve = false;
    assert.equal((await post('offer', requestBody)).status, 200);
    assert.deepEqual(order.splice(0), ['/batch/offer', 'reserve']);
    for (const action of ['submit', 'resume']) {
      failStart = true;
      assert.equal(
        (await post(action, { offerId: offer.offerId, rawHash: offer.rawHash })).status,
        409,
      );
      assert.deepEqual(
        order.splice(0),
        ['start'],
        'rejected intent never reaches co-signing/recovery',
      );
      failStart = false;
      assert.equal(
        (await post(action, { offerId: offer.offerId, rawHash: offer.rawHash })).status,
        200,
      );
      assert.deepEqual(order.splice(0), ['start', `/batch/${action}`, 'observe']);
    }
    assert.deepEqual(await (await post('release', offer)).json(), { released: true });
    assert.deepEqual(order, ['release']);
    console.log(
      'Competition payment HTTP: auth, immutable reservation before offer return, submit/resume guard ordering and unsigned release passed.',
    );
  } finally {
    runtime.campaignPaymentsEnabled = previous.enabled;
    runtime.campaignEntryPayments = previous.payments;
    proxy.sponsorProxy = previous.proxy;
    await pool.end();
  }
}
