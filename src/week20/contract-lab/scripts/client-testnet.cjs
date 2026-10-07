// Exercise the exact browser/CLI transaction builders against public CKB.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ccc = require('@ckb-ccc/core');
const { boot } = require('./testnet-harness.cjs');
const { flow } = require('./flow.cjs');
const { CKB, STORAGE } = require('./accounting.cjs');
async function main() {
  const h = await boot({ reuse: true }), f = flow(h);
  const { buildDeposit, buildClaim, decode } = await import('../web/client.mjs');
  const m = await f.create(Date.now() + 180000); h.publishMarket(m, 'Shared browser/CLI builders: public verification');
  const descriptor = h.manifest.markets.at(-1), hashes = [];
  async function refreshFunding(actor) {
    actor.fund = undefined;
    for await (const c of h.client.findCellsByLock(actor.lock, undefined, true)) {
      if (!c.cellOutput.type && c.outputData === '0x' && (!actor.fund || c.cellOutput.capacity > actor.fund.output.capacity)) actor.fund = { outPoint: c.outPoint, output: c.cellOutput, data: c.outputData };
    }
    assert(actor.fund);
  }
  for (const [a, outcome, principal, start] of [[h.owner, 0, 100n * CKB, 0], [h.admin, 1, 200n * CKB, 1]]) {
    const { tx } = await buildDeposit(ccc, h.client, a.signer, descriptor, h.manifest, outcome, principal, start);
    const hash = await a.signer.sendTransaction(tx); console.log('BROWSER BUILDER STAKE', hash);
    await h.client.waitTransaction(hash, 1, 300000); hashes.push(hash); await refreshFunding(a);
  }
  for await (const cell of h.client.findCellsByType(m.ty, true)) {
    if (decode(cell.outputData).kind !== 'shard') continue;
    const tx = await h.rpc('get_transaction', [cell.outPoint.txHash]);
    m.shards[decode(cell.outputData).id] = { outPoint: cell.outPoint, output: cell.cellOutput, data: cell.outputData, blockHash: tx.tx_status.block_hash };
  }
  console.log('Waiting for public fixture kickoff', new Date(m.cutoff).toISOString());
  while (Number(BigInt((await h.rpc('get_tip_header')).timestamp)) < m.cutoff + 1000) await new Promise(r => setTimeout(r, 5000));
  await f.report(m); const close = await f.close(m), cells = await h.commit(h.owner, close.tx);
  assert.equal(cells[1].output.capacity, STORAGE + 294n * CKB);
  const claim = await buildClaim(ccc, h.client, h.owner.signer, cells[1].outPoint, h.manifest);
  const claimHash = await h.owner.signer.sendTransaction(claim);
  console.log('SHARED CLAIM BUILDER', claimHash); await h.client.waitTransaction(claimHash, 1, 300000);
  await assert.rejects(() => buildClaim(ccc, h.client, h.owner.signer, cells[1].outPoint, h.manifest), /already spent/);
  const loser = await buildClaim(ccc, h.client, h.admin.signer, cells[2].outPoint, h.manifest);
  const loserHash = await h.admin.signer.sendTransaction(loser); await h.client.waitTransaction(loserHash, 1, 300000);
  const evidence = { finishedAt: new Date().toISOString(), network: 'testnet', deposits: hashes, settlement: close.tx.hash(), winningClaim: claimHash, losingClaim: loserHash,
    winnerPrincipalCKB: 100, winningPayoutCKB: 294, returnedStorageCKB: 321, replayRejected: true, source: 'web/client.mjs shared by browser and standalone CLI' };
  fs.writeFileSync(path.join(__dirname, '../artifacts/client-testnet.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2)); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
