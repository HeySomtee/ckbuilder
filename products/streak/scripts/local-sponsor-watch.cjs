'use strict';
// Local development only. Reuses the existing signer launcher and durable state.
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function presence(port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = (state) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(state);
    };
    socket.once('connect', () => finish('present'));
    socket.once('error', (error) => finish(error.code === 'ECONNREFUSED' ? 'absent' : 'unknown'));
    socket.setTimeout(timeoutMs, () => finish('unknown'));
  });
}

async function startWatch({
  launcher,
  port = 4101,
  controlPort = 4105,
  intervalMs = 5000,
  restartDelayMs = 2000,
  maxRestartDelayMs = 30000,
  probe = presence,
}) {
  if (!path.isAbsolute(launcher) || !fs.statSync(launcher).isFile())
    throw Error('An existing absolute local sponsor launcher path is required.');
  if (
    ![port, controlPort].every((n) => Number.isInteger(n) && n > 0 && n <= 65535) ||
    port === controlPort
  )
    throw Error('Distinct loopback sponsor and watchdog ports are required.');
  let stopped = false,
    timer,
    child,
    nextStart = 0,
    crashes = 0,
    stableSince = 0;
  let state = 'checking';
  const snapshot = () => ({ service: 'local-sponsor-watch', state, childPid: child?.pid ?? null });
  // This listener is also the single-watchdog guard. A second instance cannot spawn.
  const server = http.createServer((req, res) => {
    res.writeHead(req.method === 'GET' && req.url === '/health' ? 200 : 404, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(req.method === 'GET' && req.url === '/health' ? snapshot() : {}));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(controlPort, '127.0.0.1', resolve);
  });
  async function tick() {
    try {
      const result = await probe(port, 1000);
      if (stopped) return;
      if (result === 'present') {
        state = 'listening';
        stableSince ||= Date.now();
        if (Date.now() - stableSince >= 60000) crashes = 0;
      } else if (result === 'unknown') {
        // A slow or uncertain service is never killed or duplicated.
        state = 'checking';
      } else if (child) {
        state = 'starting';
      } else if (Date.now() < nextStart) {
        state = 'waiting-to-restart';
      } else {
        stableSince = 0;
        state = 'starting';
        child = spawn(process.execPath, [launcher], {
          cwd: path.resolve(__dirname, '../../..'),
          env: process.env,
          detached: true,
          windowsHide: true,
          stdio: 'inherit',
        });
        const current = child;
        let exited = false;
        const ended = () => {
          if (exited) return;
          exited = true;
          if (child === current) child = undefined;
          nextStart =
            Date.now() + Math.min(maxRestartDelayMs, restartDelayMs * 2 ** Math.min(crashes++, 8));
          state = 'waiting-to-restart';
        };
        current.once('error', ended);
        current.once('exit', ended);
        current.unref();
      }
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
    }
  }
  const close = async () => {
    stopped = true;
    clearTimeout(timer);
    // Stopping this monitor must never terminate an in-flight signer operation.
    await new Promise((resolve) => server.close(resolve));
  };
  void tick();
  return { close, snapshot };
}

module.exports = { startWatch, presence };
if (require.main === module) {
  const launcher = path.resolve(process.argv[2] || '.quality-artifacts/local-sponsor.cjs');
  startWatch({ launcher })
    .then((watch) => {
      console.log(
        'Local sponsor watchdog active on 127.0.0.1:4105. Existing signer state is retained.',
      );
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void watch.close());
    })
    .catch(() => {
      console.error(
        'Local sponsor watchdog could not start. Check the launcher and loopback ports.',
      );
      process.exitCode = 1;
    });
}
