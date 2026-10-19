import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { startHostedRecovery } from './modules/direct/hosted-drain';

async function main() {
  let releaseRequest!: () => void;
  let requestStarted!: () => void;
  const entered = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  const requestDone = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const server = createServer(async (_req, res) => {
    requestStarted();
    await requestDone;
    res.end('complete');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = new Promise<void>((resolve, reject) => {
    get(`http://127.0.0.1:${address.port}/`, (res) => {
      res.resume();
      res.once('end', resolve);
    }).once('error', reject);
  });
  await entered;
  let releaseRecovery!: () => void;
  let recovered = 0,
    failures = 0;
  const waiting = new Promise<void>((resolve) => {
    releaseRecovery = resolve;
  });
  const service = startHostedRecovery(
    server,
    async () => {
      recovered++;
      await waiting;
    },
    () => {
      failures++;
    },
    5,
  );
  await delay(35);
  assert.equal(recovered, 1, 'recovery does not overlap');
  let stopped = false;
  const stopping = service.stop().then(() => {
    stopped = true;
  });
  await delay(20);
  assert.equal(stopped, false, 'active request and recovery are drained');
  releaseRequest();
  await response;
  await delay(10);
  assert.equal(stopped, false, 'recovery is still awaited after the HTTP request');
  releaseRecovery();
  await stopping;
  await service.stop();
  await delay(15);
  assert.equal(recovered, 1);
  assert.equal(failures, 0);
  console.log(
    'Hosted sponsor drain: in-flight request, non-overlapping recovery and idempotent shutdown passed.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
