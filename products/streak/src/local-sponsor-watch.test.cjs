const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { startWatch, presence } = require('../scripts/local-sponsor-watch.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await delay(30);
  }
  throw Error('Local watchdog condition did not complete.');
}

test('local watchdog preserves existing service, excludes duplicate monitors and recovers a stopped child', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-watch-test-'));
  const port = await freePort(),
    controlPort = await freePort();
  const launcher = path.join(dir, 'synthetic.cjs');
  fs.writeFileSync(
    launcher,
    `const net=require('node:net');const server=net.createServer(s=>s.on('data',()=>{s.destroy();server.close(()=>process.exit(0));}));server.listen(${port},'127.0.0.1');`,
  );
  const existing = net.createServer((socket) => socket.end());
  await new Promise((resolve) => existing.listen(port, '127.0.0.1', resolve));
  let watch;
  try {
    watch = await startWatch({ launcher, port, controlPort, intervalMs: 30, restartDelayMs: 50 });
    await until(() => watch.snapshot().state === 'listening');
    assert.equal(watch.snapshot().childPid, null, 'Do not duplicate an existing signer.');
    await assert.rejects(() => startWatch({ launcher, port, controlPort }), /EADDRINUSE/);
    await new Promise((resolve) => existing.close(resolve));
    await until(() => watch.snapshot().state === 'listening' && watch.snapshot().childPid);
    const firstPid = watch.snapshot().childPid;
    const stop = net.connect({ host: '127.0.0.1', port }, () => stop.end('stop synthetic child'));
    await until(
      () =>
        watch.snapshot().state === 'listening' &&
        watch.snapshot().childPid !== firstPid &&
        watch.snapshot().childPid,
    );
    await watch.close();
    watch = undefined;
    assert.equal(await presence(port, 100), 'present', 'Closing monitor leaves signer running.');
  } finally {
    await watch?.close();
    if (existing.listening) await new Promise((resolve) => existing.close(resolve));
    if ((await presence(port, 100)) === 'present') {
      await new Promise((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port }, () =>
          socket.end('stop synthetic child'),
        );
        socket.on('close', resolve);
        socket.on('error', resolve);
      });
      await until(async () => (await presence(port, 100)) === 'absent');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('uncertain availability never starts a second signer', async () => {
  const watch = await startWatch({
    launcher: __filename,
    port: await freePort(),
    controlPort: await freePort(),
    intervalMs: 10,
    probe: async () => 'unknown',
  });
  try {
    await delay(60);
    assert.equal(watch.snapshot().state, 'checking');
    assert.equal(watch.snapshot().childPid, null);
  } finally {
    await watch.close();
  }
});
