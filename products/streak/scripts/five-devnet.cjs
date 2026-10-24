require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  { Pool } = require('pg'),
  ccc = require('@ckb-ccc/core');
const { boot } = require('./direct-harness.cjs');
const { PgFiveStorage } = require('../dist/modules/five/storage');
const { FiveFunding } = require('../dist/modules/five/funding');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { newRound, parseTerms, saveEntry } = require('../dist/modules/five/domain');
async function main() {
  const url = new URL(process.env.PG_TEST_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /_test$/);
  assert.equal(url.search, '');
  // WSL may report its node ready before Windows localhost forwarding is ready.
  // Probe from this runner before the harness makes any signed-chain operation.
  const rpc = process.argv[2];
  assert.equal(rpc, 'http://127.0.0.1:8218');
  let reachable = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_tip_header', params: [] }),
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).result) {
        reachable = true;
        break;
      }
    } catch {
      /* Only readiness is retried; the harness assertions remain unchanged. */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.ok(reachable, 'isolated devnet reachable from the actual test runner');
  const schema = `five_chain_${randomUUID().replaceAll('-', '')}`,
    db = new Pool({ connectionString: url.href });
  let pool;
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 4 });
    const h = await boot(),
      client = h.owner.signer.client;
    const wallet = await h.owner.signer.getRecommendedAddress(),
      destination = await h.admin.signer.getRecommendedAddress();
    const actor = { id: 'test-user', name: 'Synthetic player', wallet },
      store = new PgFiveStorage(pool);
    let funding = new FiveFunding(store, client, destination),
      rewards = new FiveRewards(pool, client, destination);
    const players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      teamId: `t${i}`,
      team: `Club ${i}`,
      position,
      cost: 80,
      fixtureId: `f${i}`,
    }));
    const terms = parseTerms({
      name: 'Signed local Five',
      players,
      lockAt: new Date(Date.now() + 3600000).toISOString(),
      finalizeAfter: new Date(Date.now() + 7200000).toISOString(),
      limit: 10,
      qualifyingBps: 500,
      sponsorship: true,
      minimumShannons: '10000000000',
      source: 'Synthetic devnet fixtures',
    });
    await store.create('chain', 'admin', (now) => newRound('chain', 'admin', terms, now));
    await store.change('chain', (r, now) => {
      r.state = 'open';
      saveEntry(
        r,
        actor,
        players.map((p) => p.id),
        'p2',
        r.termsHash,
        now,
      );
    });
    const intent = {
      sponsorId: 'gift',
      amountShannons: '10000000000',
      display: 'anonymous',
      custodyAccepted: true,
    };
    await assert.rejects(
      () => funding.intent({ ...actor, wallet: destination }, 'chain', intent),
      /cannot sponsor/,
    );
    await funding.intent(actor, 'chain', intent);
    let r = await store.load('chain');
    async function payment(s, base = h.owner.fund) {
      const tx = ccc.Transaction.from({
        inputs: [{ previousOutput: base.outPoint }],
        outputs: [
          { lock: h.admin.lock, capacity: 100n * h.CKB },
          { lock: h.owner.lock, capacity: base.output.capacity - 100n * h.CKB - 10000n },
        ],
        outputsData: [s.tag, '0x'],
      });
      return h.owner.signer.signTransaction(tx);
    }
    const tx = await payment(r.sponsors[0]);
    const invalid = tx.clone();
    invalid.witnesses[0] = '0x';
    await assert.rejects(() =>
      funding.submit(actor, 'chain', {
        sponsorId: 'gift',
        signedBytes: ccc.hexFrom(invalid.toBytes()),
      }),
    );
    assert.equal((await store.load('chain')).sponsors[0].funding, 'awaiting');
    const body = { sponsorId: 'gift', signedBytes: ccc.hexFrom(tx.toBytes()) };
    await funding.submit(actor, 'chain', body);
    assert.equal(
      await client.getTransactionNoCache(tx.hash()),
      undefined,
      'No broadcast before durable submission',
    );
    await funding.submit(actor, 'chain', body); // Lost response, same bytes.
    await assert.rejects(
      () =>
        funding.submit(actor, 'chain', { ...body, signedBytes: ccc.hexFrom(invalid.toBytes()) }),
      /already saved/,
    );
    await funding.intent(actor, 'chain', { ...intent, sponsorId: 'duplicate' });
    const duplicate = (await store.load('chain')).sponsors.find((s) => s.id === 'duplicate');
    const duplicateTx = await payment(duplicate);
    await assert.rejects(
      () =>
        funding.submit(actor, 'chain', {
          sponsorId: 'duplicate',
          signedBytes: ccc.hexFrom(duplicateTx.toBytes()),
        }),
      /already uses/,
    );
    funding = new FiveFunding(new PgFiveStorage(pool), client, destination);
    await funding.reconcile('chain');
    await h.commit(h.owner, tx, true);
    await h.mine(24);
    await funding.reconcile('chain');
    assert.equal((await store.load('chain')).sponsors[0].funding, 'confirmed');
    await funding.verifyConfirmed('chain');
    await store.change('chain', (r) => {
      r.state = 'final';
      r.rewards = { [r.entries[0].publicId]: '10000000000' };
    });
    r = await store.load('chain');
    await rewards.credit(r);
    await rewards.credit(r);
    await rewards.heartbeat();
    assert.equal((await rewards.account(wallet)).availableShannons, '10000000000');
    await rewards.request(wallet);
    await rewards.request(wallet);
    await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
    const journal = await pool.query('SELECT * FROM streak_five_payouts');
    assert.equal(journal.rows.length, 1);
    assert.equal(await client.getTransactionNoCache(journal.rows[0].tx_hash), undefined);
    rewards = new FiveRewards(pool, client, destination); // Worker restart before broadcast.
    await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
    const payout = ccc.Transaction.fromBytes(journal.rows[0].signed_bytes);
    assert.equal(payout.outputs[0].capacity, 100n * h.CKB);
    assert.ok(payout.outputs[0].lock.eq(h.owner.lock));
    await h.commit(h.admin, payout, true);
    await h.mine(24);
    await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
    const balance = await rewards.account(wallet);
    assert.equal(balance.availableShannons, '0');
    assert.equal(balance.pendingShannons, '0');
    assert.equal(balance.paidShannons, '10000000000');
    await assert.rejects(() => rewards.request(wallet), /cell minimum/);
    assert.equal((await pool.query('SELECT * FROM streak_five_payouts')).rows.length, 1);
    // A verified competing spend closes a poisoned contribution without inventing funds.
    await store.create('conflict', 'admin', (now) => newRound('conflict', 'admin', terms, now));
    await store.change('conflict', (r) => {
      r.state = 'open';
    });
    await funding.intent(actor, 'conflict', intent);
    const conflictIntent = (await store.load('conflict')).sponsors[0];
    const original = await payment(conflictIntent);
    await funding.submit(actor, 'conflict', {
      sponsorId: 'gift',
      signedBytes: ccc.hexFrom(original.toBytes()),
    });
    const other = ccc.Transaction.from({
      inputs: [{ previousOutput: h.owner.fund.outPoint }],
      outputs: [{ lock: h.owner.lock, capacity: h.owner.fund.output.capacity - 10000n }],
      outputsData: ['0x'],
    });
    const signedOther = await h.owner.signer.signTransaction(other);
    await h.commit(h.owner, signedOther);
    await assert.rejects(
      () =>
        funding.resolveConflict(actor, 'conflict', {
          sponsorId: 'gift',
          conflictingHash: signedOther.hash(),
        }),
      /confirmations/,
    );
    await h.mine(24);
    await funding.resolveConflict(actor, 'conflict', {
      sponsorId: 'gift',
      conflictingHash: signedOther.hash(),
    });
    assert.equal((await store.load('conflict')).sponsors[0].funding, 'conflicted');
    await store.create('cap', 'admin', (now) => newRound('cap', 'admin', terms, now));
    await store.change('cap', (r) => {
      r.state = 'open';
    });
    await funding.intent(actor, 'cap', { ...intent, amountShannons: '999999999999999999' });
    await funding.intent(actor, 'cap', { ...intent, sponsorId: 'ordinary' });
    const ordinary = await payment(
      (await store.load('cap')).sponsors.find((s) => s.id === 'ordinary'),
    );
    await funding.submit(actor, 'cap', {
      sponsorId: 'ordinary',
      signedBytes: ccc.hexFrom(ordinary.toBytes()),
    });
    await funding.reconcile('cap');
    await h.commit(h.owner, ordinary, true);
    await h.mine(24);
    await funding.reconcile('cap');
    assert.equal(
      (await store.load('cap')).sponsors.find((s) => s.id === 'ordinary').funding,
      'confirmed',
    );
    await store.create('cancel', 'admin', (now) => newRound('cancel', 'admin', terms, now));
    await store.change('cancel', (r) => {
      r.state = 'open';
    });
    await funding.intent(actor, 'cancel', intent);
    const cancelledPayment = await payment((await store.load('cancel')).sponsors[0]);
    await funding.submit(actor, 'cancel', {
      sponsorId: 'gift',
      signedBytes: ccc.hexFrom(cancelledPayment.toBytes()),
    });
    await store.change('cancel', (r) => {
      r.state = 'cancelled';
      r.cancellationReason = 'Synthetic cancellation';
    });
    await funding.reconcile('cancel');
    await h.commit(h.owner, cancelledPayment, true);
    await h.mine(24);
    await funding.reconcile('cancel');
    await rewards.credit(await store.load('cancel'));
    await rewards.credit(await store.load('cancel'));
    assert.equal((await rewards.account(wallet)).availableShannons, '10000000000');
    // A real signed auction on this disposable chain: two sponsors, one top-up,
    // automatic loser refund, unrelated prize isolation and cancellation recovery.
    const rivalSigner = new ccc.SignerCkbPrivateKey(client, '0x' + '33'.repeat(32));
    const rivalWallet = await rivalSigner.getRecommendedAddress();
    const rivalLock = (await ccc.Address.fromString(rivalWallet, client)).script;
    const fundRival = await h.owner.signer.signTransaction(
      ccc.Transaction.from({
        inputs: [{ previousOutput: h.owner.fund.outPoint }],
        outputs: [
          { lock: rivalLock, capacity: 1000n * h.CKB },
          { lock: h.owner.lock, capacity: h.owner.fund.output.capacity - 1000n * h.CKB - 10000n },
        ],
        outputsData: ['0x', '0x'],
      }),
    );
    const rivalCells = await h.commit(h.owner, fundRival);
    const rival = { signer: rivalSigner, lock: rivalLock, fund: rivalCells[0] };
    const auctionTerms = { ...terms, sponsorshipMode: 'auction' };
    await store.create('auction', 'admin', (time) =>
      newRound('auction', 'admin', auctionTerms, time),
    );
    await store.change('auction', (r) => {
      r.state = 'open';
    });
    async function auctionPayment(who, whoActor, id) {
      await funding.intent(whoActor, 'auction', { ...intent, sponsorId: id });
      const s = (await store.load('auction')).sponsors.find((s) => s.id === id);
      const tx = await who.signer.signTransaction(
        ccc.Transaction.from({
          inputs: [{ previousOutput: who.fund.outPoint }],
          outputs: [
            { lock: h.admin.lock, capacity: 100n * h.CKB },
            { lock: who.lock, capacity: who.fund.output.capacity - 100n * h.CKB - 10000n },
          ],
          outputsData: [s.tag, '0x'],
        }),
      );
      await funding.submit(whoActor, 'auction', {
        sponsorId: id,
        signedBytes: ccc.hexFrom(tx.toBytes()),
      });
      await funding.reconcile('auction');
      await h.commit(who, tx, true);
      await h.mine(24);
      await funding.reconcile('auction');
    }
    await auctionPayment(h.owner, actor, 'first');
    await auctionPayment(rival, { id: 'rival', name: 'Rival', wallet: rivalWallet }, 'second');
    await auctionPayment(h.owner, actor, 'topup');
    r = await store.load('auction');
    assert.deepEqual(
      r.sponsors.map((s) => s.submittedSequence),
      [1, 2, 3],
    );
    assert.ok(r.sponsors.every((s) => s.confirmedAt));
    await funding.settleAuction('auction');
    assert.equal((await store.load('auction')).auction, undefined, 'Never settle early');
    // Advance only this synthetic round's clock boundary; never real gameweek data.
    await store.change('auction', (r) => {
      r.terms.lockAt = new Date(Date.now() - 1000).toISOString();
    });
    await assert.rejects(
      () => funding.intent(actor, 'auction', { ...intent, sponsorId: 'too-late' }),
      /closed/,
    );
    await funding.settleAuction('auction');
    r = await store.load('auction');
    assert.equal(r.auction.winnerWallet, wallet);
    assert.equal(r.auction.amountShannons, '20000000000');
    const closed = JSON.stringify(r.auction);
    await funding.settleAuction('auction');
    assert.equal(JSON.stringify((await store.load('auction')).auction), closed);
    await pool.query(
      "INSERT INTO streak_five_credits(id,wallet,amount) VALUES('manual:prize:one',$1,7000000000)",
      [rivalWallet],
    );
    await rewards.credit(r);
    await rewards.credit(r);
    assert.equal(
      (
        await pool.query('SELECT refund_only FROM streak_five_claim_requests WHERE wallet=$1', [
          rivalWallet,
        ])
      ).rows[0].refund_only,
      true,
    );
    await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
    const auctionJournal = (
      await pool.query('SELECT * FROM streak_five_payouts WHERE wallet=$1', [rivalWallet])
    ).rows;
    assert.equal(auctionJournal.length, 1);
    const refund = ccc.Transaction.fromBytes(auctionJournal[0].signed_bytes);
    assert.equal(
      refund.outputs[0].capacity,
      100n * h.CKB,
      'Refund excludes unrelated prize credits',
    );
    assert.ok(refund.outputs[0].lock.eq(rivalLock));
    rewards = new FiveRewards(pool, client, destination);
    await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
    await h.commit(h.admin, refund, true);
    await h.mine(24);
    await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
    assert.equal(
      (await rewards.refundStates('auction', rivalWallet)).get('second'),
      'Refund returned',
    );
    assert.equal((await rewards.account(rivalWallet)).availableShannons, '7000000000');
    await store.change('auction', (r) => {
      r.state = 'cancelled';
      r.cancellationReason = 'Synthetic cancellation after losing bid refund';
    });
    await rewards.credit(await store.load('auction'));
    await rewards.credit(await store.load('auction'));
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM streak_five_credits WHERE id LIKE 'auction:refund:%'",
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await pool.query('SELECT count(*)::int AS n FROM streak_five_payouts WHERE wallet=$1', [
          rivalWallet,
        ])
      ).rows[0].n,
      1,
      'Cancellation cannot pay a losing bid twice',
    );
    assert.equal(
      (await rewards.account(wallet)).availableShannons,
      '30000000000',
      'Winner top-ups refunded plus earlier legacy refund',
    );
    console.log(
      'PASS auction signed top-ups, cutoff, automatic refund, restart, manual prize isolation and cancellation deduplication.',
    );
    console.log(
      'PASS Five signed devnet: contribution validation, duplicate inputs, durable retries/restarts, exact payout, 24 confirmations, verified conflict.',
    );
  } finally {
    if (pool) await pool.end();
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
