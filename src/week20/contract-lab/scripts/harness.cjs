/* Local devnet only. These public fixture keys ship in CKB's dev chain spec. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ccc = require('@ckb-ccc/core');
const { JsonRpcTransformers: J } = require('@ckb-ccc/core/advanced');
const ROOT = path.resolve(__dirname, '..');
const URL = process.argv[2] || 'http://127.0.0.1:8218';
assert.equal(URL, 'http://127.0.0.1:8218', 'This runner only supports its isolated loopback devnet');
const CKB = 100000000n;
const CAP = 800n * CKB;
const BOND = 100n * CKB;
const HOUR = 3600000;
const sixHours = 6 * HOUR;
const evidence = { kind: 'local-devnet', ckbVersion: '0.210.0', startedAt: new Date().toISOString(), checks: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hex = n => `0x${BigInt(n).toString(16)}`;
const le = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const bytes = h => Buffer.from(ccc.bytesFrom(h));
const bufferHex = parts => ccc.hexFrom(Buffer.concat(parts));
let clock = Date.now() - 8 * HOUR;
let sequence = 0;
let client, admin, owner, codeDeps = [], protocolHash, guardHash;
async function rpc(method, params = []) {
  const response = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params }), signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (body.error) throw Object.assign(new Error(`${method}: ${JSON.stringify(body.error)}`), { rpcError: body.error });
  return body.result;
}
async function mine(count = 1) {
  for (let i = 0; i < count; i++) {
    const tip = await rpc('get_tip_header');
    let template;
    for (let retry = 0; retry < 100; retry++) {
      template = await rpc('get_block_template');
      if (template.parent_hash === tip.hash) break;
      await sleep(50);
    }
    assert.equal(template.parent_hash, tip.hash, 'Block assembler did not catch up with the chain');
    assert('current_time' in template, 'Unexpected CKB block-template schema');
    template.current_time = hex(++clock);
    const hash = await rpc('generate_block_with_template', [template]);
    let header;
    for (let retry = 0; retry < 100; retry++) {
      header = await rpc('get_header', [hash]);
      if (header && (await rpc('get_tip_header')).hash === hash) break;
      await sleep(50);
    }
    assert(header, 'Generated block did not become available');
    assert.equal((await rpc('get_tip_header')).hash, hash, 'Generated block did not become the tip');
    assert.equal(header.timestamp, template.current_time, 'Mining must preserve the requested timestamp');
  }
}
function record(name, details = {}) { evidence.checks.push({ name, ...details }); console.log(`PASS ${name}`); }
function cell(tx, index, blockHash) {
  return { outPoint: { txHash: tx.hash(), index }, output: tx.outputs[index], data: tx.outputsData[index], blockHash };
}
async function build(actor, inputs, outputs, outputData, options = {}) {
  const allInputs = [...inputs, actor.fund];
  const total = allInputs.reduce((n, c) => n + c.output.capacity, 0n);
  const used = outputs.reduce((n, o) => n + BigInt(o.capacity), 0n);
  const tx = ccc.Transaction.from({
    inputs: allInputs.map((c, i) => ({ previousOutput: c.outPoint, since: i === 0 ? options.since || 0n : 0n })),
    outputs: [...outputs, { capacity: total - used - CKB, lock: actor.lock }],
    outputsData: [...outputData, '0x'],
    cellDeps: [...codeDeps, ...(options.deps || []).map(c => ({ outPoint: c.outPoint, depType: 'code' }))],
    headerDeps: options.headers || [],
  });
  return actor.signer.signTransaction(tx);
}
async function commit(actor, tx, submitted = false) {
  const hash = submitted ? tx.hash() : await rpc('send_transaction', [J.transactionFrom(tx), 'passthrough']);
  for (let i = 0; i < 30; i++) {
    const status = await rpc('get_transaction', [hash]);
    if (status.tx_status.status === 'committed') {
      actor.fund = cell(tx, tx.outputs.length - 1, status.tx_status.block_hash);
      return tx.outputs.map((_, index) => cell(tx, index, status.tx_status.block_hash));
    }
    if (status.tx_status.status === 'rejected') throw new Error(JSON.stringify(status.tx_status));
    await sleep(120);
    await mine();
  }
  throw new Error(`Transaction did not commit: ${hash}`);
}
async function rejects(name, tx, code) {
  try {
    await rpc('test_tx_pool_accept', [J.transactionFrom(tx)]);
    throw new Error(`Unexpected acceptance: ${name}`);
  } catch (error) {
    if (!error.rpcError) throw error;
    if (typeof code === 'number') assert.match(error.message, new RegExp(`error code ${code}`));
    else if (code instanceof RegExp) assert.match(error.message, code);
    record(name, { rejected: true, error: error.rpcError });
  }
}
function protocol(args) { return ccc.Script.from({ codeHash: protocolHash, hashType: 'data2', args }); }
function guarded(ty, capacity = CAP) {
  return { capacity, type: ty, lock: { codeHash: guardHash, hashType: 'data2', args: ty.hash() } };
}
async function boot() {
  fs.mkdirSync(path.join(ROOT,'artifacts'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'artifacts/devnet.json'),JSON.stringify(evidence,null,2)+'\n');
  const genesis = await rpc('get_block_by_number', ['0x0']);
  const info = await rpc('get_blockchain_info');
  assert.equal(info.chain, 'ckb_dev', 'Refusing a non-dev chain');
  assert.equal((await rpc('get_tip_header')).number, '0x0', 'Runner requires a fresh chain');
  evidence.genesisHash = genesis.header.hash;
  const baseClient = new ccc.ClientPublicTestnet({ url: URL, fallbacks: [] });
  const scripts = { ...baseClient.scripts };
  scripts[ccc.KnownScript.Secp256k1Blake160] = { ...scripts[ccc.KnownScript.Secp256k1Blake160], cellDeps: [{ cellDep: { outPoint: { txHash: genesis.transactions[1].hash, index: 0 }, depType: 'depGroup' } }] };
  client = new ccc.ClientPublicTestnet({ url: URL, fallbacks: [], scripts });
  async function actor(key) {
    const signer = new ccc.SignerCkbPrivateKey(client, key);
    const lock = (await signer.getAddressObjSecp256k1()).script;
    const tx = J.transactionTo(genesis.transactions[0]);
    const index = tx.outputs.findIndex(o => o.lock.eq(lock));
    assert(index >= 0, 'Public dev fixture funding is missing');
    return { signer, lock, fund: cell(tx, index, genesis.header.hash) };
  }
  admin = await actor('0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc');
  owner = await actor('0x63d86723e08f0f813a36ce6aa123bb2289d90680ae1e99d4de8cdb334553f24d');
  await mine(15);
  const binaries = ['streak-protocol', 'streak-guard'].map(name => fs.readFileSync(path.join(ROOT, 'target/riscv64imac-unknown-none-elf/release', name)));
  [protocolHash, guardHash] = binaries.map(b => ccc.hashCkb(b));
  evidence.binaries = binaries.map((b,i) => ({ name: ['streak-protocol','streak-guard'][i], bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex'), codeHash: [protocolHash,guardHash][i] }));
  const deployment = await build(admin, [], binaries.map(b => ({ capacity: BigInt(b.length + 100) * CKB, lock: admin.lock })), binaries.map(ccc.hexFrom));
  const deployed = await commit(admin, deployment);
  codeDeps = deployed.slice(0,2).map(c => ({ outPoint: c.outPoint, depType: 'code' }));
  record('Native Rust scripts deployed', { transaction: deployment.hash() });

  return { admin, owner, guarded, build, commit, rejects, record, rpc, mine, protocol, bytes, le, bufferHex, CKB, evidence, guardHash, setClock: value => { clock=value; }, getClock: () => clock,
    finish: async () => { evidence.finishedAt=new Date().toISOString(); evidence.tip=await rpc('get_tip_header'); fs.writeFileSync(path.join(ROOT,'artifacts/devnet.json'),JSON.stringify(evidence,null,2)+'\n'); console.log(`All ${evidence.checks.length} devnet checks passed.`); } };
}
module.exports={boot};
