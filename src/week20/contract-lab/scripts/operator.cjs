const ccc = require('@ckb-ccc/core');
const { boot } = require('./testnet-harness.cjs');
const { flow } = require('./flow.cjs');
async function main() {
  const [action, index = '0', result = '0'] = process.argv.slice(2);
  if (!['create', 'report', 'settle', 'void'].includes(action)) throw new Error('Usage: operator.cjs create MINUTES | report MARKET_INDEX OUTCOME | settle MARKET_INDEX | void MARKET_INDEX');
  const h = await boot({ reuse: true }), f = flow(h);
  if (action === 'create') {
    const minutes = Number(index || 15);
    if (!Number.isFinite(minutes) || minutes < 2) throw new Error('Allow at least two minutes before cutoff');
    const m = await f.create(Date.now() + minutes * 60000); h.publishMarket(m, 'Reviewer sandbox / synthetic fixture');
  } else {
    const d = h.manifest.markets[Number(index)]; if (!d) throw new Error('Unknown market index');
    const m = { ty: ccc.Script.from(d.type), cutoff: d.cutoff, shards: [] };
    for await (const c of h.client.findCellsByType(m.ty, true)) {
      const tx = await h.rpc('get_transaction', [c.outPoint.txHash]);
      const cell = { outPoint: c.outPoint, output: c.cellOutput, data: c.outputData, blockHash: tx.tx_status.block_hash };
      const tag = parseInt(c.outputData.slice(2, 4), 16);
      if (tag === 0) m.market = cell;
      if (tag === 1) m.shards[parseInt(c.outputData.slice(4, 6), 16)] = cell;
    }
    if (!m.market || m.shards.filter(Boolean).length !== 4) throw new Error('Market already closed or missing shards');
    if (action === 'report') {
      if (!/^[012]$/.test(result) || Date.now() < m.cutoff || Date.now() >= m.cutoff + 21600000) throw new Error('Report requires an outcome 0..2 within the result window');
      await f.report(m, Number(result));
    } else {
      const closed = await f.close(m, action === 'void'); await h.commit(h.owner, closed.tx);
      h.record('operator-closure', { transaction: closed.tx.hash() });
    }
  }
  h.finish(); process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
