import assert from 'node:assert/strict';
import test from 'node:test';
import { ccc } from '@ckb-ccc/core';
import { syntheticChain, connectSynthetic } from '../scripts/direct-browser-fixture.mjs';
import { DirectClient } from './src/features/direct/client.ts';
import { MANIFEST } from './src/features/direct/protocol.ts';
import { readSession, mapConcurrent } from './src/features/direct/read-session.ts';

async function harness() {
  const chain = await syntheticChain(Date.now() + 7_200_000);
  let signer,
    clock = Date.now();
  globalThis.window = { syntheticRpc: chain.rpc };
  await connectSynthetic(
    {
      onClose: (f) => f(),
      updateSigner: async (_, info) => {
        signer = info.signer;
      },
    },
    false,
  );
  const records = new Map();
  const journal = {
    list: async () => [...records.values()],
    put: async (r) => {
      records.set(r.hash, r);
    },
  };
  const client = new DirectClient(signer, MANIFEST, 'wallet', journal, {
    now: () => clock,
    exclusive: async (_, fn) => fn(),
  });
  const deposit = await client.prepareDeposit(chain.descriptor, 0, 100_00000000n);
  const signed = await client.signAndPersist(deposit, chain.descriptor);
  await assert.rejects(chain.rpc('broadcast', [signed.signedBytes]));
  await chain.rpc('broadcast', [signed.signedBytes]);
  chain.settle();
  const position = (await client.discover(chain.descriptor)).positions.find(
    (p) => p.status === 'claimable',
  );
  assert.ok(position);
  return {
    chain,
    signer,
    client,
    records,
    journal,
    position,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test('An unrelated claim sharing funding is rechecked after approval before broadcast', async () => {
  const h = await harness();
  const review = await h.client.prepareClaim(h.chain.descriptor, h.position.outPoint);
  const record = await h.client.signAndPersist(review, h.chain.descriptor);
  const tx = ccc.Transaction.fromBytes(record.signedBytes);
  tx.inputs[0].previousOutput = ccc.OutPoint.from({ txHash: `0x${'ab'.repeat(32)}`, index: 0 });
  const previous = {
    ...record,
    hash: tx.hash(),
    signedBytes: tx.toHex(),
    inputs: tx.inputs.map((input) => ({
      txHash: input.previousOutput.txHash,
      index: Number(input.previousOutput.index),
    })),
    status: 'resolved',
    conflictProof: {
      hash: `0x${'cd'.repeat(32)}`,
      blockHash: `0x${'ef'.repeat(32)}`,
      blockNumber: '1',
    },
  };
  h.records.set(previous.hash, previous);
  const recover = h.client.recover.bind(h.client);
  h.client.recover = async (saved) =>
    saved.hash === previous.hash
      ? { record: previous, status: 'unknown', inputsLive: true }
      : recover(saved);
  let sent = false;
  h.signer.client.sendTransaction = async () => {
    sent = true;
    throw Error('Must not broadcast');
  };
  await assert.rejects(h.client.broadcast(record), /conflict proof changed/);
  assert.equal(sent, false);
  assert.equal(h.records.get(record.hash).signedBytes, record.signedBytes);
});

test('A reused funding input is checked against other payment stores before broadcast', async () => {
  const h = await harness();
  const review = await h.client.prepareClaim(h.chain.descriptor, h.position.outPoint);
  const record = await h.client.signAndPersist(review, h.chain.descriptor);
  h.journal.otherReservations = async () => [
    {
      hash: `0x${'ab'.repeat(32)}`,
      fixtureId: 'unrelated-fixture',
      inputs: [record.inputs.at(-1)],
      conflictProof: {
        hash: `0x${'cd'.repeat(32)}`,
        blockHash: `0x${'ef'.repeat(32)}`,
        blockNumber: '1',
      },
    },
  ];
  let sent = false;
  h.signer.client.sendTransaction = async () => {
    sent = true;
    throw Error('Must not broadcast');
  };
  await assert.rejects(h.client.broadcast(record), /Another saved payment/);
  assert.equal(sent, false);
  assert.equal(h.records.get(record.hash).signedBytes, record.signedBytes);
});

test('A long wallet approval keeps exact signed claim recovery and does not expire a started approval', async () => {
  const h = await harness();
  const review = await h.client.prepareClaim(h.chain.descriptor, h.position.outPoint);
  const sign = h.signer.signTransaction.bind(h.signer);
  h.signer.signTransaction = async (tx) => {
    h.advance(360_000);
    return sign(tx);
  };
  const record = await h.client.signAndPersist(review, h.chain.descriptor);
  assert.equal(h.records.get(record.hash).signedBytes, record.signedBytes);
  assert.equal(record.kind, 'claim');
});

test('A claim cannot start approval after its review expires', async () => {
  const h = await harness();
  const review = await h.client.prepareClaim(h.chain.descriptor, h.position.outPoint);
  h.advance(300_001);
  h.signer.signTransaction = async () => {
    throw Error('Wallet must not be asked');
  };
  await assert.rejects(h.client.signAndPersist(review, h.chain.descriptor), /expired/);
  assert.equal([...h.records.values()].filter((r) => r.kind === 'claim').length, 0);
});

test('An unrelated historical payment does not delay a fresh claim with reconciliation RPCs', async () => {
  const h = await harness();
  h.client.recover = async () => {
    throw Error('Unrelated history must not gate this claim');
  };
  const review = await h.client.prepareClaim(h.chain.descriptor, h.position.outPoint);
  assert.equal(review.kind, 'claim');
});

test('Live positions arrive before history with deduplicated delayed canonical reads', async (t) => {
  const h = await harness();
  const counts = {};
  for (const name of ['getTransactionNoCache', 'getHeaderByNumberNoCache', 'getCellLiveNoCache']) {
    const original = h.signer.client[name].bind(h.signer.client);
    h.signer.client[name] = async (...args) => {
      counts[name] = (counts[name] ?? 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return original(...args);
    };
  }
  const start = performance.now();
  let first;
  const result = await h.client.discover(h.chain.descriptor, (snapshot) => {
    first = performance.now() - start;
    assert.ok(snapshot.positions.some((p) => p.status === 'claimable'));
    assert.equal(snapshot.historyComplete, false);
  });
  const complete = performance.now() - start;
  assert.equal(result.historyComplete, true);
  assert.ok(first < complete);
  assert.equal(
    counts.getHeaderByNumberNoCache,
    1,
    'One canonical header fetch per block in an observation',
  );
  t.diagnostic(
    JSON.stringify({
      syntheticLatencyMs: 40,
      firstPositionsMs: Math.round(first),
      completeHistoryMs: Math.round(complete),
      counts,
    }),
  );
});

test('A post-sign RPC failure leaves the exact claim saved without broadcasting', async () => {
  const h = await harness();
  const review = await h.client.prepareClaim(h.chain.descriptor, h.position.outPoint);
  const sign = h.signer.signTransaction.bind(h.signer);
  h.signer.signTransaction = async (tx) => {
    const signed = await sign(tx);
    h.signer.client.getCellLiveNoCache = async () => {
      throw Error('Temporary chain outage');
    };
    return signed;
  };
  await assert.rejects(
    h.client.signAndPersist(review, h.chain.descriptor),
    /Temporary chain outage/,
  );
  const claims = [...h.records.values()].filter((r) => r.kind === 'claim');
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, 'signed');
  assert.equal(h.chain.submissions.length, 2, 'Only the initial deposit attempts were broadcast');
});

test('Discovery deduplicates identical canonical reads only within its own observation', async () => {
  let calls = 0;
  const client = {
    getHeaderByNumberNoCache: async (n) => {
      calls++;
      return { number: n };
    },
  };
  const a = readSession(client);
  await Promise.all(Array.from({ length: 20 }, () => a.getHeaderByNumberNoCache(2n)));
  assert.equal(calls, 1);
  await readSession(client).getHeaderByNumberNoCache(2n);
  assert.equal(calls, 2, 'New observation performs a fresh canonical check');
});

test('Bounded parallel reads retain order and stop scheduling after failure', async () => {
  let active = 0,
    peak = 0,
    started = 0;
  const result = await mapConcurrent([0, 1, 2, 3, 4, 5], 3, async (value) => {
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    return value;
  });
  assert.deepEqual(result, [0, 1, 2, 3, 4, 5]);
  assert.equal(peak, 3);
  await assert.rejects(
    mapConcurrent(
      Array.from({ length: 100 }, (_, i) => i),
      3,
      async (value) => {
        started++;
        if (value === 0) throw Error('Unavailable');
        await new Promise((r) => setTimeout(r, 20));
        return value;
      },
    ),
    /Unavailable/,
  );
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(started <= 3);
});
