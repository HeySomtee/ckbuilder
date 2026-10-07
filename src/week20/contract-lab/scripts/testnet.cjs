const assert = require('node:assert/strict');
const { boot } = require('./testnet-harness.cjs');
const { flow } = require('./flow.cjs');
const { CKB } = require('./accounting.cjs');
async function main() {
  const h = await boot(), f = flow(h);
  const tip = await h.rpc('get_tip_header');
  const m = await f.create(Math.max(Date.now(), Number(BigInt(tip.timestamp))) + 240000);
  h.publishMarket(m, 'Week 20 settlement demonstration');
  await f.deposit(m, 0, 0, 100n * CKB, h.owner);
  await f.deposit(m, 1, 0, 300n * CKB, h.admin);
  await f.deposit(m, 2, 1, 200n * CKB, h.owner);
  for (const cell of m.shards.slice(0, 3)) {
    assert(Number(BigInt((await h.rpc('get_header', [cell.blockHash])).timestamp)) < m.cutoff, 'Stake committed after cutoff');
  }
  console.log('Waiting for the real testnet kickoff', new Date(m.cutoff).toISOString());
  while (Number(BigInt((await h.rpc('get_tip_header')).timestamp)) < m.cutoff + 1000) await new Promise(r => setTimeout(r, 5000));
  await f.report(m);
  const closed = await f.close(m), cells = await h.commit(h.owner, closed.tx);
  h.evidence.settlement = closed.tx.hash();
  h.record('settlement-confirmed', { transaction: closed.tx.hash(), entitlements: closed.values.map(String), totals: closed.totals.map(String) });
  const cleanup = await h.build(h.owner, [cells[0]], [{ capacity: cells[0].output.capacity, lock: h.admin.lock }], ['0x']);
  await h.commit(h.owner, cleanup);
  const a = await f.claim(cells[1], h.owner), b = await f.claim(cells[2], h.admin);
  assert(!a.inputs.some(x => b.inputs.some(y => x.previousOutput.eq(y.previousOutput))));
  await h.submit(a); await h.submit(b);
  await h.commit(h.owner, a, true); await h.commit(h.admin, b, true);
  h.evidence.winningClaims = [a.hash(), b.hash()];
  h.record('independent-winning-claims-confirmed', { transactions: [a.hash(), b.hash()], commonInputs: 0, applicationBackendUsed: false });
  const loser = await f.claim(cells[3], h.owner); await h.commit(h.owner, loser);
  h.evidence.losingStorageReturn = loser.hash();
  // This empty, already expired fixture tests consensus timeout on public chain.
  // A full six-hour accepted-stake refund is exercised on the local devnet.
  const expired = await f.create(Number(BigInt((await h.rpc('get_tip_header')).timestamp)) - 24 * 3600000);
  h.publishMarket(expired, 'Expired empty market: public timeout check');
  const cancellation = await f.close(expired, true); await h.commit(h.owner, cancellation.tx);
  h.evidence.timeout = cancellation.tx.hash();
  h.record('public-timeout-confirmed', { transaction: cancellation.tx.hash(), acceptedStakes: 0 });
  h.finish(); console.log('PUBLIC TESTNET FLOW COMPLETE'); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
