const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'), REPO = path.resolve(ROOT, '../../..');
const OUT = path.join(REPO, 'reports/assets/week-20');
async function main() {
  const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/testnet.json')));
  const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/devnet.json')));
  const shared = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/client-testnet.json')));
  assert(shared.finishedAt && shared.replayRejected);
  const vm = fs.readFileSync(path.join(ROOT, 'artifacts/vm-tests.txt'), 'utf8');
  assert(run.finishedAt && run.settlement && run.winningClaims.length === 2);
  assert(local.finishedAt); assert(vm.includes('8 passed; 0 failed'));
  for (const binary of run.binaries) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'target/riscv64imac-unknown-none-elf/release', binary.name))).digest('hex'), binary.sha256);
  }
  // Independently re-read every recorded transaction. A broadcast hash alone
  // is never sufficient evidence for the report.
  for (const entry of run.transactions) {
    const response = await fetch(run.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_transaction', params: [entry.hash] }), signal: AbortSignal.timeout(30000) });
    const body = await response.json(); assert.equal(body.result?.tx_status.status, 'committed', entry.hash);
    assert.equal(body.result.tx_status.block_hash, entry.blockHash);
  }
  for (const hash of [...shared.deposits, shared.settlement, shared.winningClaim, shared.losingClaim]) {
    const response = await fetch(run.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_transaction', params: [hash] }), signal: AbortSignal.timeout(30000) });
    assert.equal((await response.json()).result?.tx_status.status, 'committed', hash);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'web/run.json'), JSON.stringify(run, null, 2) + '\n');
  for (const name of ['testnet.json', 'client-testnet.json', 'devnet.json', 'vm-tests.txt', 'accounting-tests.txt']) {
    fs.writeFileSync(path.join(OUT, name), fs.readFileSync(path.join(ROOT, 'artifacts', name), 'utf8').trimEnd() + '\n');
  }
  const cycles = [...vm.matchAll(/: (\d+) cycles/g)].map(m => Number(m[1]));
  const summary = { recordedAt: run.finishedAt, vmScenarios: [...vm.matchAll(/PASS /g)].length, vmFunctions: 8,
    devnetChecks: local.checks.length, publicConfirmedTransactions: run.transactions.length,
    settlement: run.settlement, winningClaims: run.winningClaims, storageCKB: 321, maxBets: 32,
    cycles: { min: Math.min(...cycles), max: Math.max(...cycles) },
    timeoutScope: 'Full accepted-stake refund on local devnet; expired empty-market cancellation on public testnet.' };
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.cjs')], { env: { ...process.env, WEEK20_PORT: '4121' }, stdio: 'pipe' });
  const { chromium } = require(path.join(REPO, 'products/streak/node_modules/playwright'));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:4121', { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Connected directly'), null, { timeout: 90000 });
      assert.equal(await page.locator('#transactions a').count(), 6);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('#deposit').isDisabled(), true);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(OUT, `arena-${name}.png`), fullPage: true });
      const sandbox = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/deployment.json'))).markets.findIndex(m => m.label.startsWith('Reviewer sandbox') && m.cutoff > Date.now());
      if (sandbox >= 0) {
        await page.locator('#market').selectOption(String(sandbox));
        await page.waitForFunction(() => document.getElementById('marketState').textContent.startsWith('OPEN'), null, { timeout: 60000 });
        assert.equal(await page.locator('#deposit').isDisabled(), false);
        assert.equal(await page.locator('#positions span').count(), 4);
        await page.screenshot({ path: path.join(OUT, `arena-open-${name}.png`), fullPage: true });
      }
      await page.locator('#connect').click();
      await page.locator('ccc-selecting-scene').waitFor({ state: 'visible', timeout: 60000 });
      await page.evaluate(() => document.querySelector('ccc-connector').dispatchEvent(new Event('close')));
      assert.equal(await page.locator('ccc-connector').isVisible(), false);
      await page.close();
    }
    summary.browser = 'Desktop 1440 and mobile 390: live RPC read, six explorer links, expired-stake disabled, wallet picker opens and closes, no page errors or horizontal overflow';
    summary.sharedBuilderPublicRun = shared;
  } finally { await browser.close(); server.kill(); }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
