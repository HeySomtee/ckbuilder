const assert = require('node:assert/strict');
const ccc = require('@ckb-ccc/core');
const { JsonRpcTransformers: J } = require('@ckb-ccc/core/advanced');
const { CKB, STORAGE, RESERVE, hex, raw, le, ticket, shard, parseShard, pool, payout } = require('./accounting.cjs');

function flow(h) {
  const { admin, owner, guarded, build, commit, rpc } = h;
  const plain = (capacity, lock) => ({ capacity, lock });
  const headers = cells => [...new Set(cells.map(c => c.blockHash))];
  async function ownerLock(hash, cell) {
    const known = h.actors.find(a => hash.equals(raw(a.lock.hash())));
    if (known) return known.lock;
    // A provisional deposit required an owner-authorized input. Recover that
    // lock preimage from its funding transaction instead of trusting an indexer.
    const creation = await rpc('get_transaction', [cell.outPoint.txHash]);
    for (const input of J.transactionTo(creation.transaction).inputs) {
      const previous = await rpc('get_transaction', [input.previousOutput.txHash]);
      const lock = J.transactionTo(previous.transaction).outputs[Number(input.previousOutput.index)].lock;
      if (hash.equals(raw(lock.hash()))) return lock;
    }
    throw new Error('Could not recover the refund owner lock from chain history');
  }
  async function create(cutoff) {
    const ty = h.protocol(hex(Buffer.concat([
      Buffer.from(ccc.OutPoint.from(admin.fund.outPoint).toBytes()), raw(admin.lock.hash()),
      le(cutoff), raw(h.guardHash), raw(admin.lock.hash()), raw(owner.lock.hash()),
    ])));
    const tx = await build(admin, [], Array.from({ length: 5 }, () => guarded(ty, RESERVE)),
      ['0x0000ff', ...Array.from({ length: 4 }, (_, i) => shard(i))]);
    const cells = await commit(admin, tx);
    h.record('market-created', { transaction: tx.hash(), cutoff });
    return { ty, market: cells[0], shards: cells.slice(1, 5), cutoff };
  }
  async function deposit(m, id, outcome, amount, actor = owner) {
    const old = m.shards[id], s = parseShard(old.data);
    const t = ticket(actor.lock.hash(), outcome, amount);
    let capacity = old.output.capacity + amount + STORAGE;
    const outputs = [], data = [];
    if (s.pending) {
      const header = await rpc('get_header', [old.blockHash]);
      if (Number(BigInt(header.timestamp)) < m.cutoff) s.accepted.push(s.pending);
      else {
        const refund = s.pending.readBigUInt64LE(33) + STORAGE;
        capacity -= refund;
        const lock = await ownerLock(s.pending.subarray(0, 32), old);
        outputs.push(plain(refund, lock)); data.push('0x');
      }
    }
    const tx = await build(actor, [old], [guarded(m.ty, capacity), ...outputs],
      [shard(id, s.accepted, t), ...data], { deps: [m.market], headers: headers([old]) });
    [m.shards[id]] = await commit(actor, tx);
    h.record('stake-committed', { transaction: tx.hash(), shard: id, outcome, principal: amount.toString(), owner: actor.lock.hash() });
    return tx;
  }
  async function report(m, outcome = 0) {
    const tx = await build(admin, [m.market], [guarded(m.ty, RESERVE)], [hex(Buffer.from([0, 1, outcome]))]);
    [m.market] = await commit(admin, tx); h.record('oracle-report', { transaction: tx.hash(), outcome });
  }
  async function close(m, voided = false) {
    const tickets = [], late = [], totals = [0n, 0n, 0n];
    let capacity = m.market.output.capacity;
    for (const c of m.shards) {
      capacity += c.output.capacity; const s = parseShard(c.data); tickets.push(...s.accepted);
      if (s.pending) {
        const header = await rpc('get_header', [c.blockHash]);
        if (Number(BigInt(header.timestamp)) < m.cutoff) tickets.push(s.pending); else late.push({ ticket: s.pending, cell: c });
      }
    }
    for (const t of tickets) totals[t[32]] += t.readBigUInt64LE(33);
    const outcome = voided ? 255 : raw(m.market.data)[2];
    const values = tickets.map(t => payout(t, outcome, totals));
    const outputs = [guarded(m.ty, 0n), ...values.map(value => guarded(m.ty, value))];
    const data = [pool(outcome, totals, 0n), ...tickets.map((t, i) => hex(Buffer.concat([Buffer.from([3, i]), t])))];
    capacity -= values.reduce((a, b) => a + b, 0n);
    for (const { ticket: t, cell } of late) {
      const value = t.readBigUInt64LE(33) + STORAGE;
      const lock = await ownerLock(t.subarray(0, 32), cell);
      outputs.push(plain(value, lock)); data.push('0x'); capacity -= value;
    }
    const losing = outcome === 255 || totals[outcome] === 0n ? 0n : totals.reduce((a, b) => a + b) - totals[outcome];
    if (losing > 0n) for (const [lock, fee] of [[admin.lock, losing / 50n], [owner.lock, losing / 100n]]) {
      outputs.push(plain(100n * CKB + fee, lock)); data.push('0x'); capacity -= 100n * CKB + fee;
    }
    if (voided) { outputs.push(plain(100n * CKB, owner.lock)); data.push('0x'); capacity -= 100n * CKB; }
    outputs[0].capacity = capacity;
    const tx = await build(owner, [m.market, ...m.shards], outputs, data, {
      headers: headers([m.market, ...m.shards]),
      since: voided ? 0x4000000000000000n | BigInt(Math.ceil((m.cutoff + 21600000) / 1000)) : 0n,
    });
    return { tx, tickets, totals, outcome, values };
  }
  async function claim(cell, actor) {
    const ownerHash = raw(cell.data).subarray(2, 34);
    const recipient = h.actors.find(a => ownerHash.equals(raw(a.lock.hash())));
    assert(recipient);
    return build(actor, [cell], [plain(cell.output.capacity, recipient.lock)], ['0x']);
  }
  return { create, deposit, report, close, claim };
}
module.exports = { flow };
