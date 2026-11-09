import assert from 'node:assert/strict';
import { readBatch } from './modules/direct/read-batch';

async function main() {
  let active = 0;
  let maximum = 0;
  const results = await readBatch([0, 1, 2, 3, 4, 5], async (value, index) => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 6 - value));
    active--;
    return `${index}:${value}`;
  });
  assert.deepEqual(results, ['0:0', '1:1', '2:2', '3:3', '4:4', '5:5']);
  assert.equal(maximum, 4);
  assert.equal(active, 0);

  const started: number[] = [];
  const finished: number[] = [];
  await assert.rejects(readBatch([0, 1, 2, 3, 4, 5], value => {
    started.push(value);
    if (value === 1) throw Error('failed read');
    return new Promise<number>(resolve => setTimeout(() => {
      finished.push(value);
      resolve(value);
    }, 10));
  }), /failed read/);
  assert.deepEqual(started, [0, 1, 2, 3], 'No later batch starts after a failure');
  assert.deepEqual(finished.sort(), [0, 2, 3], 'Even a synchronous failure drains every started read');
  console.log('PASS ordered four-read batches drain failures before a lease can be released');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
