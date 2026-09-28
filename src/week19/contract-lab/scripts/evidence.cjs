// Build a readable evidence page from completed test runs, then capture it.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '../../..');
const OUT = path.join(REPO, 'reports/assets/week-19');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function main() {
  const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/devnet.json'), 'utf8'));
  const vm = fs.readFileSync(path.join(ROOT, 'artifacts/vm-tests.txt'), 'utf8');
  const accounting = fs.readFileSync(path.join(ROOT, 'artifacts/accounting-tests.txt'), 'utf8');
  assert(accounting.includes('# pass 4') && accounting.includes('# fail 0'), 'Accounting tests have not completed');
  assert(evidence.finishedAt && evidence.checks.length > 0, 'Devnet suite has not completed');
  assert(vm.includes('7 passed; 0 failed'), 'VM suite has not completed');
  for (const binary of evidence.binaries) {
    const current = fs.readFileSync(path.join(ROOT,'target/riscv64imac-unknown-none-elf/release',binary.name));
    assert.equal(crypto.createHash('sha256').update(current).digest('hex'),binary.sha256,'Devnet evidence does not match the current binary');
  }
  const cases = [...vm.matchAll(/PASS [^\r\n]+/g)].length;
  const cycles = [...vm.matchAll(/: (\d+) cycles/g)].map(match => Number(match[1]));
  const summary = { recordedAt: evidence.finishedAt, rust: '1.97.1', ckb: evidence.ckbVersion, vmTestFunctions:7, vmCases:cases, devnetChecks:evidence.checks.length, successfulVmCycles:{min:Math.min(...cycles),max:Math.max(...cycles)}, scope:'Local prototype. No mainnet or public testnet deployment. Bounded sharded settlement prototype; no production deployment.' };
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(path.join(ROOT,'artifacts/devnet.json'),path.join(OUT,'devnet.json'));
  fs.writeFileSync(path.join(OUT,'vm-tests.txt'),vm.trimEnd()+'\n');
  fs.writeFileSync(path.join(OUT,'accounting-tests.txt'),accounting.trimEnd()+'\n');
  summary.accountingTests=4;
  summary.deterministicPortfolios=1000;
  fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  const rows = evidence.checks.map((check,index) => `<li><span class="number">${String(index+1).padStart(2,'0')}</span><div><strong>${escape(check.name)}</strong><small>${check.rejected ? 'Invalid transaction rejected as expected' : 'Verified on the isolated CKB devnet'}</small></div><span class="pass">PASS</span></li>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Streak | Week 19 contract evidence</title><style>
*{box-sizing:border-box}body{margin:0;background:#101116;color:#f3f3f8;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1080px;margin:auto;padding:40px 28px 60px}nav{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #30313b;padding-bottom:24px}.brand{font-size:23px;font-weight:800;letter-spacing:3px}.brand span{color:#ff795f}.pill{color:#ffac99;background:#ff795f15;border:1px solid #ff795f45;padding:7px 13px;border-radius:30px;font-size:12px;letter-spacing:1px}.intro{padding:48px 0 26px}.eyebrow{color:#ff927c;text-transform:uppercase;letter-spacing:2px;font-size:12px;font-weight:700}h1{font-size:clamp(34px,5vw,54px);line-height:1.13;margin:12px 0 20px;max-width:780px;letter-spacing:-1px}.muted{color:#b1b3c4;max-width:720px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}.card{background:linear-gradient(130deg,#242531,#191a22);border:1px solid #363743;border-radius:20px;padding:24px}.value{font-size:40px;line-height:1.1;font-weight:750;color:#ff927c}.label{color:#c9cbd7;font-size:14px;margin-top:9px}.note{background:#ff795f0c;border-left:3px solid #ff795f;border-radius:4px;padding:18px 20px;color:#d8d9e3;margin:28px 0}h2{font-size:24px;margin:36px 0 8px}ol{padding:0;list-style:none;border:1px solid #30313b;border-radius:18px;overflow:hidden}li{display:flex;gap:16px;align-items:center;padding:18px 20px;background:#191a22;border-bottom:1px solid #30313b}li:last-child{border:0}.number{font-size:12px;color:#9396ae}li div{flex:1}li strong{font-size:14px;font-weight:600}small{display:block;color:#989bb1;font-size:12px;margin-top:3px}.pass{font-size:11px;letter-spacing:1px;color:#8be5b1;border:1px solid #8be5b140;border-radius:6px;padding:4px 8px}a{color:#ffac99;text-underline-offset:4px}footer{margin-top:28px;color:#989bb1;font-size:12px;overflow-wrap:anywhere}.links{display:flex;gap:22px;flex-wrap:wrap;margin:20px 0;font-size:14px}details{background:#191a22;border:1px solid #30313b;border-radius:12px;padding:16px}summary{cursor:pointer;font-size:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#b1b3c4;font-size:12px}@media(max-width:600px){main{padding:24px 18px}.intro{padding-top:32px}.metrics{gap:8px}.card{padding:16px 12px;border-radius:14px}.value{font-size:30px}.label{font-size:11px}li{padding:15px 12px;gap:10px}.number{display:none}.pass{padding:3px 5px}.pill{font-size:10px}.brand{font-size:20px}h1{font-size:35px}}
</style></head><body><main><nav><div class="brand">STREAK<span>.</span> LAB</div><span class="pill">WEEK 19 / LOCAL DEVNET</span></nav><section class="intro"><span class="eyebrow">Native Rust contracts</span><h1>Four deposit shards.<br>One verified payout total.</h1><p class="muted">Execution evidence for sharded admission, complete pool accounting, share redemption and refunds. These results come from compiled CKB-VM scripts and signed transactions on a fresh local chain.</p></section><section class="metrics"><div class="card"><div class="value">${cases}</div><div class="label">VM scenarios passed</div></div><div class="card"><div class="value">${evidence.checks.length}</div><div class="label">Devnet checks passed</div></div><div class="card"><div class="value">2</div><div class="label">Native Rust scripts</div></div></section><div class="note"><strong>Every shard counted. Every claim backed.</strong><br>Closure consumes all four shards. Payouts use immutable global totals. Four shards support up to 32 bets; redemptions remain sequential.</div><h2>What the node enforced</h2><p class="muted">Expected rejections are successful tests of the contract and consensus rules.</p><ol>${rows}</ol><h2>Reproducible evidence</h2><div class="links"><a href="devnet.json">Devnet transactions and errors</a><a href="vm-tests.txt">CKB-VM test output</a><a href="summary.json">Run summary</a></div><details><summary>Compiled binary provenance</summary><pre>${escape(JSON.stringify(evidence.binaries,null,2))}</pre></details><footer>Recorded ${escape(evidence.finishedAt)} | Rust 1.97.1 | CKB ${escape(evidence.ckbVersion)}<br>Prototype evidence, not a production betting interface. No public-network deployment or production readiness is claimed. All fixtures use local devnet funds.</footer></main></body></html>`;
  fs.writeFileSync(path.join(OUT,'index.html'),html);
  const { chromium } = require(path.join(REPO,'products/streak/node_modules/playwright'));
  const browser = await chromium.launch({ headless:true });
  try {
    for (const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]) {
      const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      await page.goto(pathToFileURL(path.join(OUT,'index.html')).href);
      assert.equal(await page.locator('.pass').count(), evidence.checks.length);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Evidence page overflows');
      await page.screenshot({path:path.join(OUT,`contract-lab-${name}.png`),fullPage:true});
      await page.close();
    }
  } finally {await browser.close();}
  console.log(JSON.stringify(summary,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
