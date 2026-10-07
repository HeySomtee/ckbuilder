const { test } = require('node:test');
const assert = require('node:assert/strict');
const ccc = require('@ckb-ccc/core');
const { CKB, STORAGE, hex, raw, le, ticket, shard } = require('./accounting.cjs');
function fixture() {
  const lock = ccc.Script.from({ codeHash: '0x' + '11'.repeat(32), hashType: 'type', args: '0x' + '22'.repeat(20) });
  const manifest = { protocolHash: '0x' + '33'.repeat(32), guardHash: '0x' + '44'.repeat(32), codeDeps: [] };
  const type = ccc.Script.from({ codeHash: manifest.protocolHash, hashType: 'data2', args: '0x' + '00'.repeat(172) });
  const cell = (data, index = 0) => ccc.Cell.from({ outPoint: { txHash: '0x' + '55'.repeat(32), index }, outputData: data,
    cellOutput: { capacity: STORAGE + 150n * CKB, type, lock: { codeHash: manifest.guardHash, hashType: 'data2', args: type.hash() } } });
  const claim = cell(hex(Buffer.concat([Buffer.from([3, 0]), ticket(lock.hash(), 0, 100n * CKB)])));
  const client = new ccc.ClientPublicTestnet();
  const signer = { getRecommendedAddress: async () => ccc.Address.fromScript(lock, client).toString() };
  return { lock, manifest, type, cell, claim, client, signer };
}
test('claim builder checks live state and owner before fee collection', async () => {
  const { buildClaim } = await import('../web/client.mjs'); const f = fixture();
  f.client.getCellLive = async () => undefined;
  await assert.rejects(() => buildClaim(ccc, f.client, f.signer, f.claim.outPoint, f.manifest), /already spent/);
  f.client.getCellLive = async () => f.claim;
  await assert.rejects(() => buildClaim(ccc, f.client, f.signer, f.claim.outPoint, { ...f.manifest, protocolHash: '0x' + '66'.repeat(32) }), /pinned/);
  const other = f.cell(hex(Buffer.concat([Buffer.from([3, 0]), ticket('0x' + '77'.repeat(32), 0, 100n * CKB)])));
  f.client.getCellLive = async () => other;
  await assert.rejects(() => buildClaim(ccc, f.client, f.signer, other.outPoint, f.manifest), /owns/);
});
test('claim uses only its own input and returns the entire funded capacity', async () => {
  const { buildClaim } = await import('../web/client.mjs'); const f = fixture(); f.client.getCellLive = async () => f.claim;
  const original = ccc.Transaction.prototype.completeFeeBy;
  try {
    ccc.Transaction.prototype.completeFeeBy = async function () {};
    const tx = await buildClaim(ccc, f.client, f.signer, f.claim.outPoint, f.manifest);
    assert.equal(tx.inputs.length, 1); assert.equal(tx.outputs[0].capacity, f.claim.cellOutput.capacity);
    assert(tx.outputs[0].lock.eq(f.lock)); assert.equal(tx.headerDeps.length, 0); assert.equal(tx.outputs[0].type, undefined);
  } finally { ccc.Transaction.prototype.completeFeeBy = original; }
});
test('deposit promotes the previous pending record using its bound header and preserves principal', async () => {
  const { buildDeposit, decode } = await import('../web/client.mjs'); const f = fixture();
  const prior = ticket(f.lock.hash(), 1, 100n * CKB), control = f.cell('0x0000ff', 1), part = f.cell(shard(0, [], prior), 2);
  f.client.findCellsByType = async function* () { yield control; yield part; };
  f.client.getCellWithHeader = async () => ({ header: { timestamp: BigInt(Date.now() - 1000), hash: '0x' + '99'.repeat(32) } });
  const originalFee = ccc.Transaction.prototype.completeFeeBy, originalInputs = ccc.Transaction.prototype.completeInputsByCapacity;
  try {
    ccc.Transaction.prototype.completeFeeBy = async function () {};
    ccc.Transaction.prototype.completeInputsByCapacity = async function () {};
    const { tx } = await buildDeposit(ccc, f.client, f.signer, { type: f.type, cutoff: Date.now() + 60000 }, f.manifest, 2, 200n * CKB);
    assert.equal(decode(tx.outputsData[0]).accepted, 1); assert.equal(decode(tx.outputsData[0]).pending, 1);
    assert.equal(tx.outputs[0].capacity, part.cellOutput.capacity + STORAGE + 200n * CKB);
    assert.equal(tx.headerDeps[0], '0x' + '99'.repeat(32));
    assert.deepEqual(raw(tx.outputsData[0]).subarray(4, 45), prior);
  } finally { ccc.Transaction.prototype.completeFeeBy = originalFee; ccc.Transaction.prototype.completeInputsByCapacity = originalInputs; }
});
test('deposit rejects cutoff, invalid outcome and undersized principal before building', async () => {
  const { buildDeposit } = await import('../web/client.mjs'); const f = fixture();
  await assert.rejects(() => buildDeposit(ccc, f.client, f.signer, { cutoff: 0 }, f.manifest, 0, 100n * CKB), /closed/);
  await assert.rejects(() => buildDeposit(ccc, f.client, f.signer, {}, f.manifest, 3, 100n * CKB), /outcome/);
  await assert.rejects(() => buildDeposit(ccc, f.client, f.signer, {}, f.manifest, 0, 99n * CKB), /at least/);
});
