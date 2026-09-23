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
async function commit(actor, tx) {
  const hash = await rpc('send_transaction', [J.transactionFrom(tx), 'passthrough']);
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
function marketType(kickoff, seed = admin.fund.outPoint) {
  return protocol(bufferHex([Buffer.from([0]), bytes(ccc.OutPoint.from(seed).toBytes()), bytes(admin.lock.hash()), le(kickoff), le(kickoff + sixHours), le(BOND), bytes(guardHash)]));
}
function stakeType(market, cutoff) {
  return protocol(bufferHex([Buffer.from([1]), bytes(ccc.OutPoint.from(owner.fund.outPoint).toBytes()), bytes(market.output.type.hash()), bytes(owner.lock.hash()), le(cutoff), bytes(guardHash)]));
}
function stakeData(accepted = false) { return bufferHex([Buffer.from([accepted ? 1 : 0, 0]), le(100n * CKB)]); }
async function createMarket(kickoff) {
  const ty = marketType(kickoff);
  const tx = await build(admin, [], [guarded(ty)], ['0x00ff']);
  const [market] = await commit(admin, tx);
  return market;
}
async function resultTx(market, actor = admin) { return build(actor, [market], [guarded(market.output.type)], ['0x0100']); }
async function finishTx(market, cancel, deadline) {
  return build(owner, [market], [guarded(market.output.type, CAP-BOND), { capacity: BOND, lock: cancel ? owner.lock : admin.lock }], [cancel ? '0x03ff' : '0x0200', '0x'], { headers: [market.blockHash], since: cancel ? 0x4000000000000000n | BigInt(Math.ceil(deadline/1000)) : 0n });
}
async function main() {
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

  const cutoff = clock + 10000;
  const deadline = cutoff + sixHours;
  const market = await createMarket(cutoff);
  const ty = stakeType(market, cutoff);
  const deposit = await build(owner, [], [guarded(ty)], [stakeData()], { deps: [market] });
  const [pending] = await commit(owner, deposit);
  const depositHeader = await rpc('get_header', [pending.blockHash]);
  assert(Number(BigInt(depositHeader.timestamp)) < cutoff);
  clock = cutoff + 1000;
  await mine(40);
  const wrongHeader = await build(owner, [pending], [guarded(ty)], [stakeData(true)], { deps: [market], headers: [genesis.header.hash] });
  await rejects('An unrelated old header cannot prove timely admission', wrongHeader, 10);
  const admission = await build(owner, [pending], [guarded(ty)], [stakeData(true)], { deps: [market], headers: [pending.blockHash] });
  const [accepted] = await commit(owner, admission);
  record('A timely stake can be verified after kickoff', { deposit: deposit.hash(), admission: admission.hash(), creationTimestamp: depositHeader.timestamp, cutoff });
  const lateTy = stakeType(market, cutoff);
  const lateDeposit = await build(owner, [], [guarded(lateTy)], [stakeData()], { deps: [market] });
  const [late] = await commit(owner, lateDeposit);
  const lateAdmission = await build(owner, [late], [guarded(lateTy)], [stakeData(true)], { deps: [market], headers: [late.blockHash] });
  await rejects('A committed late stake cannot become accepted', lateAdmission, 7);
  const refund = await build(owner, [late], [{ capacity: CAP, lock: owner.lock }], ['0x'], { headers: [late.blockHash] });
  await commit(owner, refund);
  record('Late stake principal and storage refunded', { transaction: refund.hash(), refundedShannons: CAP.toString() });
  await rejects('The same refunded stake cannot be spent twice', refund, /Resolve failed Unknown/);

  const timeoutEarly = await finishTx(market, true, deadline);
  await rejects('Node consensus rejects timeout before since matures', timeoutEarly, /Immature.*since requirement/);
  const unauthorized = await resultTx(market, owner);
  await rejects('A real non-admin secp256k1 signature cannot report a result', unauthorized, 6);
  const staleResult = await resultTx(market);
  clock = deadline + 1000;
  await mine(40);
  const [lateResult] = await commit(admin, staleResult);
  record('A prebuilt result may commit late but remains provisional', { transaction: staleResult.hash() });
  await rejects('Late result cannot finalize even before cancellation', await finishTx(lateResult,false,deadline), 7);
  const cancel = await finishTx(lateResult,true,deadline);
  const [voidMarket] = await commit(owner,cancel);
  record('Anyone can cancel a late report and collect operator-funded reward', { transaction: cancel.hash(), rewardShannons: BOND.toString() });
  const voidRefund = await build(owner,[accepted],[{capacity:CAP,lock:owner.lock}],['0x'],{deps:[voidMarket]});
  await commit(owner,voidRefund);
  record('Accepted stake refunded after void without market fees', { transaction:voidRefund.hash(),refundedShannons:CAP.toString() });
  await rejects('Cancelled market cannot be finalized',await finishTx(voidMarket,false,deadline),8);

  // Second market: an on-time canonical result takes precedence over timeout.
  const kickoff2 = clock - sixHours + 10000;
  const deadline2 = kickoff2 + sixHours;
  const market2 = await createMarket(kickoff2);
  const submission = await resultTx(market2);
  const [timelyResult] = await commit(admin, submission);
  const h = await rpc('get_header',[timelyResult.blockHash]);
  assert(Number(BigInt(h.timestamp)) < deadline2);
  clock = deadline2 + 1000;
  await mine(40);
  await rejects('Cancellation cannot ignore a timely canonical result',await finishTx(timelyResult,true,deadline2),7);
  const finalize = await finishTx(timelyResult,false,deadline2);
  const [resolved] = await commit(owner,finalize);
  record('Timely result verified later and unused reward returned to operator',{submission:submission.hash(),finalization:finalize.hash(),resultCreationTimestamp:h.timestamp,deadline:deadline2});
  await rejects('Resolved market cannot pay the cancellation reward',await finishTx(resolved,true,deadline2),8);

  // Third market: cancel an open market first, then reject its competing result.
  const market3 = await createMarket(clock-sixHours-10000);
  const competing = await resultTx(market3);
  const cancelFirst = await finishTx(market3,true,clock-10000);
  await commit(owner,cancelFirst);
  await rejects('Cancellation committed first invalidates the competing result',competing,/Resolve failed Unknown/);
  evidence.finishedAt = new Date().toISOString();
  evidence.tip = await rpc('get_tip_header');
  fs.mkdirSync(path.join(ROOT,'artifacts'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'artifacts/devnet.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(`All ${evidence.checks.length} devnet checks passed.`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
