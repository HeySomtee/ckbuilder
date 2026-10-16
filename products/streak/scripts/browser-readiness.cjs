/* Test sequencing only. Observe real loopback reads without intercepting fetch. */
const assert = require('node:assert/strict');

function observeReads(page, base) {
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const pending = new Map();
  const trace = [];
  let phase = 'initial document';
  const record = (event, request, detail) => {
    trace.push({
      phase,
      event,
      path: request ? new URL(request.url()).pathname : undefined,
      detail,
    });
    if (trace.length > 250) trace.shift();
  };
  const relevant = (request) => {
    const url = new URL(request.url());
    return (
      url.origin === base &&
      url.pathname.startsWith('/api/') &&
      ['GET', 'HEAD'].includes(request.method())
    );
  };
  page.on('request', (request) => {
    if (!relevant(request)) return;
    let finish;
    const completed = new Promise((resolve) => {
      finish = resolve;
    });
    pending.set(request, { completed, finish });
    record('request', request);
  });
  const finished = (request, event) => {
    if (!pending.has(request)) return;
    record(event, request, request.failure()?.errorText);
    pending.get(request).finish();
    pending.delete(request);
  };
  page.on('requestfinished', (request) => finished(request, 'finished'));
  page.on('requestfailed', (request) => finished(request, 'failed'));
  page.on('pageerror', (error) => record('pageerror', undefined, error.message));
  async function settled() {
    let timer;
    try {
      await Promise.race([
        (async () => {
          while (pending.size)
            await Promise.all([...pending.values()].map((entry) => entry.completed));
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Local reads did not finish before ${phase}: ${[...pending.keys()].map((request) => new URL(request.url()).pathname).join(', ')}`,
                ),
              ),
            30_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    trace,
    settled,
    phase(value) {
      phase = value;
    },
    async goto(url) {
      await settled();
      phase = `navigate ${new URL(url).pathname}${new URL(url).hash}`;
      return page.goto(url);
    },
    async reload() {
      await settled();
      phase = `reload ${new URL(page.url()).pathname}`;
      return page.reload();
    },
  };
}

async function accountReadFinished(page, label = 'Sign in with wallet') {
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent.trim() === name && !button.disabled,
      ),
    label,
  );
}

module.exports = { observeReads, accountReadFinished };
