const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ccc = require('@ckb-ccc/core');
const { JsonRpcTransformers: J } = require('@ckb-ccc/core/advanced');
const ROOT = path.resolve(__dirname, '..');
const CKB = 100000000n;
const URL = 'https://testnet.ckb.dev/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function boot({ reuse = false } = {}) {
  const client = new ccc.ClientPublicTestnet({ url: URL, fallbacks: [] });
  async function rpc(method, params = []) {
    const response = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(30000) });
    const body = await response.json();
    if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
    return body.result;
  }
  assert.equal((await rpc('get_blockchain_info')).chain, 'ckb_testnet');
  const evidence = { network: 'CKB Pudge testnet', rpc: URL, startedAt: new Date().toISOString(), checks: [], transactions: [] };
  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const save = () => fs.writeFileSync(path.join(ROOT, reuse ? 'artifacts/operator.json' : 'artifacts/testnet.json'), JSON.stringify(evidence, null, 2) + '\n');
  function record(name, detail = {}) { evidence.checks.push({ name, ...detail }); console.log(name, JSON.stringify(detail)); save(); }
  async function actor(key) {
    const signer = new ccc.SignerCkbPrivateKey(client, key);
    const address = await signer.getAddressObjSecp256k1();
    return { signer, lock: address.script, address: address.toString() };
  }
  const admin = await actor(fs.readFileSync(path.resolve(ROOT, '../../../.ckb-wallet.key'), 'utf8').trim());
  const secretDir = path.join(ROOT, '.secrets'); fs.mkdirSync(secretDir, { recursive: true });
  const keyFile = path.join(secretDir, 'owner.key');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, '0x' + crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const owner = await actor(fs.readFileSync(keyFile, 'utf8').trim());
  for await (const c of client.findCellsByLock(admin.lock, undefined, true)) {
    if (!c.cellOutput.type && c.outputData === '0x' && c.cellOutput.capacity > (reuse ? 1000n : 60000n) * CKB && (!admin.fund || c.cellOutput.capacity > admin.fund.output.capacity)) {
      admin.fund = { outPoint: c.outPoint, output: c.cellOutput, data: c.outputData };
    }
  }
  assert(admin.fund, 'Need one untyped development-wallet funding cell above 60,000 testnet CKB');
  let codeDeps = [];
  async function build(a, inputs, outputs, data, options = {}) {
    const all = [...inputs, a.fund];
    const total = all.reduce((n, c) => n + c.output.capacity, 0n), used = outputs.reduce((n, c) => n + BigInt(c.capacity), 0n);
    assert(total - used > 61n * CKB, 'Insufficient separate fee funding');
    const tx = ccc.Transaction.from({
      inputs: all.map((c, i) => ({ previousOutput: c.outPoint, since: i === 0 ? options.since || 0n : 0n })),
      outputs: [...outputs, { capacity: total - used - 500000n, lock: a.lock }], outputsData: [...data, '0x'],
      cellDeps: [...codeDeps, ...(options.deps || []).map(c => ({ outPoint: c.outPoint, depType: 'code' }))], headerDeps: options.headers || [],
    });
    return a.signer.signTransaction(tx);
  }
  async function submit(tx) {
    const hash = await rpc('send_transaction', [J.transactionFrom(tx), 'passthrough']);
    record('broadcast', { transaction: hash }); return hash;
  }
  async function commit(a, tx, submitted = false) {
    const hash = submitted ? tx.hash() : await submit(tx);
    for (let attempt = 0; attempt < 120; attempt++) {
      const result = await rpc('get_transaction', [hash]);
      if (result?.tx_status.status === 'committed') {
        const blockHash = result.tx_status.block_hash;
        const outputs = tx.outputs.map((output, index) => ({ outPoint: { txHash: hash, index }, output, data: tx.outputsData[index], blockHash }));
        a.fund = outputs.at(-1);
        evidence.transactions.push({ hash, blockHash, bytes: tx.toBytes().length, status: 'committed', explorer: `https://pudge.explorer.nervos.org/transaction/${hash}` }); save();
        console.log('CONFIRMED', hash); return outputs;
      }
      if (result?.tx_status.status === 'rejected') throw new Error(JSON.stringify(result.tx_status));
      await sleep(3000);
    }
    throw new Error(`Confirmation timeout: ${hash}`);
  }
  const binaries = ['streak-protocol', 'streak-guard'].map(name => fs.readFileSync(path.join(ROOT, 'target/riscv64imac-unknown-none-elf/release', name)));
  const [protocolHash, guardHash] = binaries.map(b => ccc.hashCkb(b));
  evidence.binaries = binaries.map((b, i) => ({ name: ['streak-protocol', 'streak-guard'][i], bytes: b.length, codeHash: [protocolHash, guardHash][i], sha256: crypto.createHash('sha256').update(b).digest('hex') }));
  // An unspendable lock keeps the pinned code cells available permanently.
  const immutableLock = { codeHash: '0x' + '00'.repeat(32), hashType: 'data2', args: '0x' };
  let manifest;
  if (reuse) {
    manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/deployment.json')));
    assert.equal(manifest.protocolHash, protocolHash); assert.equal(manifest.guardHash, guardHash);
    codeDeps = manifest.codeDeps;
    for await (const c of client.findCellsByLock(owner.lock, undefined, true)) {
      if (!c.cellOutput.type && c.outputData === '0x' && (!owner.fund || c.cellOutput.capacity > owner.fund.output.capacity)) owner.fund = { outPoint: c.outPoint, output: c.cellOutput, data: c.outputData };
    }
    assert(owner.fund, 'Demonstration wallet needs a separate fee cell');
  } else {
    const deploy = await build(admin, [], binaries.map(b => ({ capacity: BigInt(b.length + 41) * CKB, lock: immutableLock })), binaries.map(ccc.hexFrom));
    const deployed = await commit(admin, deploy);
    codeDeps = deployed.slice(0, 2).map(c => ({ outPoint: c.outPoint, depType: 'code' }));
    evidence.deployment = deploy.hash();
    const [fund] = await commit(admin, await build(admin, [], [{ capacity: 5000n * CKB, lock: owner.lock }], ['0x'])); owner.fund = fund;
    manifest = { network: 'testnet', rpc: URL, protocolHash, guardHash, codeDeps, deployment: deploy.hash(), markets: [] };
  }
  const protocol = args => ccc.Script.from({ codeHash: protocolHash, hashType: 'data2', args });
  const guarded = (type, capacity) => ({ capacity, type, lock: { codeHash: guardHash, hashType: 'data2', args: type.hash() } });
  function publishMarket(m, label) {
    manifest.markets.push({ label, cutoff: m.cutoff, type: { codeHash: m.ty.codeHash, hashType: m.ty.hashType, args: m.ty.args }, creation: m.market.outPoint.txHash });
    fs.writeFileSync(path.join(ROOT, 'web/deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  return { admin, owner, actors: [admin, owner], client, rpc, build, submit, commit, record, evidence, guardHash, protocol, guarded, publishMarket, manifest,
    finish() { evidence.finishedAt = new Date().toISOString(); save(); } };
}
module.exports = { boot };
