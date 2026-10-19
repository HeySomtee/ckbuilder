import assert from 'node:assert/strict';
import * as ccc from '@ckb-ccc/core';
import { activePoolRecord, PublicPoolCache, poolPrincipal } from './modules/direct/pools';
import type { OperatorCell, OperatorMarket } from './modules/direct/operator';
import type { DirectMarketRecord } from './modules/direct/registry';

const H = `0x${'01'.repeat(32)}`,
  CKB = 100_000_000n,
  cutoff = 1_800_000_000_000;
function cell(data: Buffer, timestamp = cutoff - 1): OperatorCell {
  return {
    cell: ccc.Cell.from({
      outPoint: { txHash: H, index: 0 },
      cellOutput: { capacity: 10_000n * CKB, lock: { codeHash: H, hashType: 'data2', args: '0x' } },
      outputData: `0x${data.toString('hex')}`,
    }),
    header: ccc.ClientBlockHeader.from({
      compactTarget: 0,
      dao: { c: 0, ar: 0, s: 0, u: 0 },
      epoch: [0, 0, 1],
      extraHash: H,
      hash: H,
      nonce: 0,
      number: 1,
      parentHash: H,
      proposalsHash: H,
      timestamp,
      transactionsRoot: H,
      version: 0,
    }),
  };
}
function shard(
  id: number,
  accepted: [number, bigint][],
  pending?: [number, bigint],
  timestamp = cutoff - 1,
) {
  const entries = [...accepted, ...(pending ? [pending] : [])];
  const data = Buffer.alloc(4 + 41 * entries.length);
  data.set([1, id, accepted.length, pending ? 1 : 0]);
  entries.forEach(([side, amount], i) => {
    data[4 + i * 41 + 32] = side;
    data.writeBigUInt64LE(amount, 4 + i * 41 + 33);
  });
  return cell(data, timestamp);
}
function market(): OperatorMarket {
  return {
    closed: false,
    market: cell(Buffer.from([0, 0, 255])),
    shards: [
      shard(0, [[0, 100n * CKB]], [1, 200n * CKB]),
      shard(1, [[2, 300n * CKB]]),
      shard(2, [], [0, 400n * CKB], cutoff),
      shard(3, []),
    ],
  };
}
function record(id = 1): DirectMarketRecord {
  return {
    id: `pool-${id}`,
    fixtureId: `api-football-${id}`,
    label: 'Synthetic pool',
    cutoffMs: cutoff,
    creationTxHash: H,
    type: { codeHash: H, hashType: 'data2', args: `0x${id.toString(16).padStart(4, '0')}` },
    terms: {
      provider: 'football',
      providerFixtureId: String(id),
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoff + 21_600_000,
    },
    termsHash: H,
  };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function main() {
  assert.equal(
    activePoolRecord(true, undefined, record()),
    undefined,
    'An old funded pool cannot price a fresh atomic entry.',
  );
  const fresh = record(2),
    historical = record();
  assert.equal(activePoolRecord(true, fresh, historical), fresh);
  assert.equal(activePoolRecord(false, undefined, historical), historical);
  assert.deepEqual(
    poolPrincipal(market(), cutoff),
    ['10000000000', '20000000000', '30000000000'],
    'Only principal, accepted entries and pre-cutoff pending entries count.',
  );
  const incomplete = market();
  delete incomplete.shards[2];
  assert.throws(() => poolPrincipal(incomplete, cutoff), /not fully initialized/);
  const settled = Buffer.alloc(34);
  settled[0] = 2;
  settled[1] = 1;
  [100n, 200n, 300n].forEach((n, i) => settled.writeBigUInt64LE(n * CKB, 2 + 8 * i));
  assert.deepEqual(
    poolPrincipal({ closed: true, shards: [], closedReserve: cell(settled) }, cutoff),
    ['10000000000', '20000000000', '30000000000'],
    'Settlement totals survive individual claim redemption.',
  );
  assert.throws(() => poolPrincipal({ closed: true, shards: [] }, cutoff), /unavailable/);
  let now = cutoff,
    reads = 0,
    fail = false;
  const cache = new PublicPoolCache(
    async () => {
      reads++;
      if (fail) throw Error('Offline');
      return market();
    },
    () => now,
  );
  assert.equal(cache.read('api-football-1').state, 'uninitialized');
  assert.equal(reads, 0);
  assert.equal(cache.read('api-football-1', record()).state, 'loading');
  cache.read('api-football-1', record());
  await tick();
  assert.equal(reads, 1, 'Coalesces repeated reads.');
  assert.equal(cache.read('api-football-1', record()).phase, 'open');
  assert.deepEqual(cache.read('api-football-1', record()).totals, [
    '10000000000',
    '20000000000',
    '30000000000',
  ]);
  fail = true;
  now += 20_001;
  cache.read('api-football-1', record());
  await tick();
  assert.equal(cache.read('api-football-1', record()).state, 'stale');
  assert.equal(
    cache.read('api-football-1', record()).history?.length,
    1,
    'Failures do not fabricate zero observations.',
  );
  fail = false;
  now += 10_001;
  cache.read('api-football-1', record());
  await tick();
  assert.equal(cache.read('api-football-1', record()).state, 'ready');
  assert.equal(cache.read('api-football-1', record()).history?.length, 2);
  const terminal = new PublicPoolCache(
    async () => ({ closed: true, shards: [], closedReserve: cell(settled) }),
    () => now,
  );
  terminal.read('api-football-1', record());
  await tick();
  assert.equal(terminal.read('api-football-1', record()).phase, 'settled');
  settled[1] = 255;
  now += 20_001;
  terminal.read('api-football-1', record());
  await tick();
  assert.equal(terminal.read('api-football-1', record()).phase, 'voided');
  let running = 0,
    peak = 0,
    completed = 0;
  const queued = new PublicPoolCache(async () => {
    running++;
    peak = Math.max(peak, running);
    await tick();
    running--;
    completed++;
    return market();
  });
  for (let i = 1; i <= 24; i++) queued.read(`api-football-${i}`, record(i));
  for (let i = 0; i < 15; i++) await tick();
  assert.equal(completed, 24, 'Every requested market progresses, not just the first four.');
  assert.equal(peak, 4);
  console.log(
    'PASS public pool principal, cutoff, settled totals, cache freshness, retained observations and fair bounded reads',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
