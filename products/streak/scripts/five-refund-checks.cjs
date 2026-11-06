const assert = require('node:assert/strict');
const { ccc } = require('@ckb-ccc/core');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { newRound } = require('../dist/modules/five/domain');

module.exports = async function refundChecks(pool, terms) {
  const chain = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const address = async (byte) =>
    (
      await ccc.Address.fromScript(
        { codeHash: `0x${'12'.repeat(32)}`, hashType: 'type', args: `0x${byte.repeat(20)}` },
        chain,
      )
    ).toString();
  const owner = await address('34');
  const other = await address('56');
  const rewards = new FiveRewards(pool, chain, 'synthetic-rewards-wallet');
  await rewards.init();
  const round = newRound(
    'refund-status',
    'admin',
    { ...terms, sponsorshipMode: 'auction' },
    Date.now(),
  );
  round.state = 'cancelled';
  const bid = (id, amount) => ({
    id,
    accountId: 'owner',
    wallet: owner,
    amountShannons: amount,
    display: 'anonymous',
    name: '',
    logo: '',
    link: '',
    moderation: 'pending',
    createdAt: new Date().toISOString(),
    funding: 'confirmed',
  });
  round.sponsors = [bid('a', '20000000000'), bid('b', '30000000000')];
  assert.equal((await rewards.sponsorRefund(round, owner, true)).state, 'owed');
  await rewards.credit(round);
  await rewards.credit(round);
  assert.equal((await rewards.sponsorRefund(round, owner, true)).state, 'queued');
  assert.equal((await rewards.sponsorRefund(round, owner, false)).state, 'paused');
  assert.equal(await rewards.sponsorRefund(round, other, true), null);
  const hashes = ['a1', 'b2'].map((byte) => `0x${byte.repeat(32)}`);
  for (const [index, sponsor] of round.sponsors.entries()) {
    await pool.query(
      `INSERT INTO streak_five_payouts(id,wallet,amount,signed_bytes,tx_hash,status)
      VALUES($1,$2,$3,'synthetic-projection-only',$1,$4)`,
      [hashes[index], owner, sponsor.amountShannons, index === 0 ? 'confirmed' : 'submitted'],
    );
    await pool.query('UPDATE streak_five_credits SET payout_id=$1 WHERE id=$2', [
      hashes[index],
      `${round.id}:refund:${sponsor.id}`,
    ]);
  }
  await pool.query('DELETE FROM streak_five_claim_requests WHERE wallet=$1', [owner]);
  const partial = await rewards.sponsorRefund(round, owner, true);
  assert.equal(partial.state, 'confirming');
  assert.equal(partial.returnedShannons, '20000000000');
  assert.equal(partial.pendingShannons, '30000000000');
  assert.deepEqual(new Set(partial.transactionHashes), new Set(hashes));
  await pool.query(
    "UPDATE streak_five_payouts SET created_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
    [hashes[1]],
  );
  assert.equal((await rewards.sponsorRefund(round, owner, true)).state, 'delayed');
  await pool.query("UPDATE streak_five_payouts SET status='confirmed' WHERE id=$1", [hashes[1]]);
  for (let repeat = 0; repeat < 3; repeat++) await rewards.credit(round);
  assert.equal((await rewards.sponsorRefund(round, owner, false)).state, 'returned');
  assert.equal(
    (await pool.query('SELECT 1 FROM streak_five_claim_requests WHERE wallet=$1', [owner]))
      .rowCount,
    0,
    'Paid auction top-ups do not recreate a refund request on score updates',
  );
  assert.equal(
    (
      await pool.query('SELECT 1 FROM streak_five_credits WHERE starts_with(id,$1)', [
        `${round.id}:refund:`,
      ])
    ).rowCount,
    2,
  );
  round.sponsors.push(bid('late', '10000000000'));
  await rewards.credit(round);
  assert.equal(
    (await rewards.sponsorRefund(round, owner, true)).state,
    'queued',
    'Late top-ups keep their own refund obligation',
  );
  assert.equal((await rewards.sponsorRefund(round, owner, true)).returnedShannons, '50000000000');
  assert.equal((await rewards.sponsorRefund(round, owner, true)).totalShannons, '60000000000');
  await pool.query('DELETE FROM streak_five_claim_requests WHERE wallet=$1', [owner]);

  // A failed backing check must leave exact credits intact and let another
  // wallet run. No signing or external chain method is reached in this test.
  await pool.query(
    `INSERT INTO streak_five_credits(id,wallet,amount) VALUES
    ('retry-first:refund:one',$1,10000000000),('retry-second:refund:dust',$2,1)`,
    [owner, other],
  );
  await pool.query(
    `INSERT INTO streak_five_claim_requests(wallet,refund_only,next_attempt_at) VALUES
    ($1,true,clock_timestamp()-interval '2 minutes'),($2,true,clock_timestamp()-interval '1 minute')`,
    [owner, other],
  );
  const signer = { client: chain, getRecommendedAddress: async () => 'synthetic-rewards-wallet' };
  await assert.rejects(
    rewards.tick(signer, async () => {
      throw Error('synthetic unavailable backing');
    }),
    /synthetic unavailable backing/,
  );
  const retry = (
    await pool.query(
      'SELECT last_failure,next_attempt_at>clock_timestamp() AS deferred FROM streak_five_claim_requests WHERE wallet=$1',
      [owner],
    )
  ).rows[0];
  assert.equal(retry.last_failure, 'backing');
  assert.equal(retry.deferred, true);
  const checked = [];
  await rewards.tick(signer, async (id) => {
    checked.push(id);
  });
  assert.deepEqual(checked, ['retry-second']);
  assert.equal(
    (await pool.query('SELECT 1 FROM streak_five_claim_requests WHERE wallet=$1', [other]))
      .rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query('SELECT payout_id FROM streak_five_credits WHERE id=$1', [
        'retry-first:refund:one',
      ])
    ).rows[0].payout_id,
    null,
  );
  assert.equal((await rewards.sponsorRefund(round, owner, true)).state, 'delayed');
  console.log(
    'Five refund ledger: multi-top-up partial/paid states, no paid requeue, late refunds and failed-wallet retry fairness passed.',
  );
};
