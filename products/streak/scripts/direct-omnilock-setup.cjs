/* Explicit public read-only dependency setup. Routine tests must never invoke this. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ccc = require('@ckb-ccc/core');
const { PIN, cache, artifact, readOmniLock } = require('./direct-omnilock.cjs');

async function main() {
  if (
    process.env.NODE_ENV === 'test' ||
    process.argv.length !== 3 ||
    process.argv[2] !== '--download'
  )
    throw Error(
      'Explicit setup only: node products/streak/scripts/direct-omnilock-setup.cjs --download. Forbidden in routine tests.',
    );
  const client = new ccc.ClientPublicTestnet({
    url: PIN.rpc,
    fallbacks: [],
    timeout: 15_000,
    maxConcurrent: 2,
  });
  const cell = await client.getCellLiveNoCache(PIN.outPoint, true, false);
  assert(cell, 'Pinned public OmniLock cell is unavailable');
  assert.equal(cell.cellOutput.type?.hash(), PIN.typeHash, 'Unexpected OmniLock type identity');
  const transaction = await client.getTransactionNoCache(PIN.outPoint.txHash);
  assert(
    transaction &&
      transaction.status === 'committed' &&
      transaction.blockHash &&
      transaction.blockNumber !== undefined,
  );
  assert.equal(transaction.transaction.hash(), PIN.outPoint.txHash);
  assert.equal(transaction.transaction.outputsData[0], cell.outputData);
  const header = await client.getHeaderByNumberNoCache(transaction.blockNumber);
  assert.equal(header?.hash, transaction.blockHash, 'OmniLock source transaction is not canonical');
  const binary = Buffer.from(ccc.bytesFrom(cell.outputData));
  assert.equal(binary.length, PIN.sizeBytes);
  assert.equal(
    ccc.hashCkb(binary),
    PIN.dataHash,
    'Public artifact differs from the reviewed OmniLock data hash',
  );
  fs.mkdirSync(cache, { recursive: true });
  const temporary = `${artifact}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, binary, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, artifact);
  readOmniLock();
  fs.writeFileSync(
    path.join(cache, 'omnilock-source.json'),
    `${JSON.stringify({ ...PIN, readAt: new Date().toISOString(), blockHash: header.hash, blockNumber: header.number.toString(), purpose: 'Public read-only artifact for offline local VM verification; no wallet or broadcast' }, null, 2)}\n`,
  );
  console.log(`Verified offline OmniLock artifact: ${binary.length} bytes, ${PIN.dataHash}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
