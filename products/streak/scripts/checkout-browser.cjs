/* Built application routes and EIP-1193 signing with an isolated synthetic chain. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

async function main() {
  const { build } = await import('vite');
  const { Wallet } = await import('ethers');
  const { batchChain, batchOwnerKey } = await import('./batch-browser-fixture.mjs');
  const { BATCH_MANIFEST } = await import('../web/src/features/direct/protocol.ts');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-checkout-browser-'));
  const publicRoot = path.resolve(__dirname, '../public');
  const evidence = path.resolve(__dirname, '../../../.quality-artifacts/checkout-browser');
  fs.mkdirSync(evidence, { recursive: true });
  await build({ configFile: false, root: path.resolve(__dirname, '..'), logLevel: 'error', build: { outDir: temp, emptyOutDir: true, lib: { entry: path.join(__dirname, 'checkout-browser-wallet.mjs'), formats: ['es'], fileName: () => 'wallet.js' } } });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = url.pathname === '/qa-wallet.js' ? path.join(temp, 'wallet.js') : path.resolve(publicRoot, '.' + (url.pathname === '/season/' ? '/season/index.html' : url.pathname));
    if (!(file.startsWith(publicRoot + path.sep) || file === path.join(temp, 'wallet.js')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      browser = await engine.launch();
      for (const width of [1440, 390, 900]) {
        const chain = await batchChain(Date.now() + 7200000, BATCH_MANIFEST.codeDeps, new Wallet(batchOwnerKey).address);
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const errors = [], external = [], writes = [];
        let signatures = 0, offers = 0, failMode = false, stalePools = false, releasePools, releaseSubmission, reorg = false, rejectNext = false, rejections = 0, busyReview = true, delayedOffer, holdApproval=false, releaseApproval;
        const poolReady = new Promise(resolve => { releasePools = resolve; });
        await context.exposeBinding('checkoutRpc', async (_source, method, args) => {
          const value=await chain.rpc(method,args);
          return reorg && method==='header' ? {...value,hash:'0x'+'ab'.repeat(32)} : value;
        });
        await context.exposeBinding('checkoutSigning', async () => { if(rejectNext){rejectNext=false;rejections++;throw Error('Synthetic wallet declined the second payment.');} await page.getByRole('button',{name:'Approve in your wallet',exact:true}).waitFor(); signatures++; });
        const market = fixture => {
          const [home, away] = fixture.label.split(' vs '), kickoff = new Date(fixture.cutoffMs).toISOString();
          const spark = fixture.fixtureId === 'api-football-910002' ? [
            { t: fixture.cutoffMs - 3600000, p: { home: .25, draw: .5, away: .25 } },
            { t: fixture.cutoffMs - 1800000, p: { home: .4, draw: .35, away: .25 } },
            { t: fixture.cutoffMs - 900000, p: { home: .5, draw: .3, away: .2 } },
          ] : [];
          return { id: 'm-' + fixture.fixtureId, status: 'open', available: true, totalPoolCkb: spark.length ? '300' : '0', totalBets: spark.length, prices: spark.at(-1)?.p ?? { home: 0, draw: 0, away: 0 }, spark, match: { id: fixture.fixtureId, kickoff, status: 'scheduled', stage: 'Synthetic league', home: { name: home, code: 'HOM' }, away: { name: away, code: 'AWY' } } };
        };
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
          if (url.origin !== base) { external.push(url.href); return route.abort(); }
          if (req.method() !== 'GET') writes.push(url.pathname);
          if (url.pathname === '/api/direct/pools') {
            await poolReady;
            return json({ pools: url.searchParams.get('fixtures').split(',').map(fixtureId => {
            const row = chain.fixtures().find(f => f.fixtureId === fixtureId);
            if (fixtureId === 'api-football-910002') {
              const now = Date.now() - (stalePools ? 90_000 : 0);
              const history = [[25,50,25],[40,35,25],[50,30,20]].map((amounts,i) => ({t:now - (2-i)*1800000,totals:amounts.map(n=>String(BigInt(n)*1000000000n))}));
              return {fixtureId,state:'ready',observedAtMs:now,totals:history[2].totals,history};
            }
            return {fixtureId,state:row?.state === 'funded' ? 'ready' : 'uninitialized', ...(row?.state === 'funded' ? {observedAtMs:Date.now(), totals:['10000000000','0','0'],history:[]} : {})};
          }) });
          }
          if (url.pathname === '/api/me') return json({ user: { id: 'checkout-user', walletAddress: chain.address, username: 'Synthetic checkout', telegramConnected: false, telegramAvailable: false, telegramUsername: null } });
          if (url.pathname === '/api/markets') return json({ markets: chain.fixtures().map(market), total: 8, nextOffset: null, coverage: { complete: true, from: '2020-01-01', to: '2040-01-01' } });
          if (url.pathname === '/api/direct/entry-mode') return failMode ? json({ error: 'Synthetic availability outage' }, 503) : json({ mode: 'atomic' });
          if (url.pathname === '/api/direct/batch/config') { if(holdApproval){holdApproval=false;await new Promise(resolve=>{releaseApproval=resolve;});} return json(BATCH_MANIFEST); }
          if (url.pathname === '/api/direct/batch/demand') return json({ enabled: true, serverTime: Date.now(), fixtures: chain.fixtures().filter(row => !url.searchParams.has('matchId') || row.fixtureId === url.searchParams.get('matchId')) });
          if (url.pathname === '/api/direct/markets') return json({ markets: chain.fixtures().flatMap(row => row.descriptor ? [row.descriptor] : []) });
          if (url.pathname.endsWith('/insights')) {
            const id=url.pathname.split('/')[3], fixture=chain.fixtures().find(row=>'m-'+row.fixtureId===id);
            if(!fixture)return json({error:'No fixture'},404);
            const [home,away]=fixture.label.split(' vs ');
            const team=(name,rank)=>({name,rank,points:12,played:6,won:3,drawn:3,lost:0,goalsFor:11,goalsAgainst:5,form:'WDWDW'});
            return json({insights:{matchId:fixture.fixtureId,fetchedAt:new Date().toISOString(),frozen:false,warnings:[],machine:{probabilities:{home:.45,draw:.3,away:.25},advice:'Home or draw',predictedWinner:{comment:'Synthetic provider forecast'}},bookmakers:{probabilities:{home:.5,draw:.3,away:.2},bookmakerCount:6,averageMargin:.05},table:{home:team(home,6),away:team(away,10)},headToHead:Array.from({length:5},(_,i)=>({date:new Date(Date.now()-(i+1)*86400000).toISOString(),home,away,homeGoals:2,awayGoals:1}))}});
          }
          if (url.pathname.endsWith('/public')) {
            const id = url.pathname.split('/')[3], fixture = chain.fixtures().find(row => 'm-' + row.fixtureId === id);
            if (!fixture) return json({ error: 'Unknown fixture' }, 404);
            const row = market(fixture);
            return json({ market: row, accepting: true, evaluatedAt: new Date().toISOString(), paymentAvailable: false, termsId: 'a'.repeat(64), terms: { kind: 'custodial-ledger', minimumShannons: '1000000000', maximumShannons: '10000000000000', protocolFeeBps: 200, creatorFeeBps: 100, kickoff: row.match.kickoff, closesAt: row.match.kickoff } });
          }
          if (url.pathname === '/api/direct/batch/offer') {
            offers++;
            if(busyReview) { busyReview=false; return json({error:'Sponsor queue is busy. Your picks and any saved payment are safe. Try again shortly.'},429); }
            return json(await chain.prepare(req.postDataJSON()));
          }
          if (url.pathname === '/api/direct/batch/submit') {
            await new Promise(resolve=>{releaseSubmission=resolve;});
            if(chain.submissions.length===0) {
              chain.loseResponse=true;
              try { await chain.submit(req.postDataJSON()); } catch(error) { assert.match(error.message,/Synthetic lost submit response/); }
              delayedOffer=req.postDataJSON().offerId;
              return json({error:'Sponsor request could not complete. Your signed payment may still confirm. Check its saved status before retrying.'},409);
            }
            return json(await chain.submit(req.postDataJSON()));
          }
          if (url.pathname === '/api/direct/batch/status') return json(chain.status({ offerId: url.searchParams.get('offerId'), rawHash: url.searchParams.get('rawHash') }));
          if (url.pathname.startsWith('/api/')) { if (req.method() !== 'GET') throw Error('Unexpected write: ' + url.pathname); return json({ error: 'Unused endpoint' }, 404); }
          return route.continue();
        });
        await context.routeWebSocket('**/*', socket => socket.close());
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.on('pageerror', error => errors.push(error.message));
        async function connect(button) {
          const before = page.url();
          await button.click();
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(async () => (await import('/qa-wallet.js')).connect(document.querySelector('ccc-connector')));
          await page.locator('ccc-connector').waitFor({ state: 'detached' });
          assert.equal(page.url(), before, 'Reconnect stays on the current page.');
        }
        async function pay(count) {
          console.log(`Starting payment ${name} ${width} ${count}`);
          const review = page.getByRole('button', { name: count === 1 ? 'Review payment' : 'Review all predictions', exact: true });
          await page.waitForFunction(() => { const button = document.querySelector('.batch-checkout > button.review-button'); return button && !button.disabled; }).catch(async(error)=>{console.error(await page.locator('body').innerText());throw error;});
          await review.click();
          await page.getByRole('heading', { name: `One payment. ${count} ${count === 1 ? 'prediction' : 'predictions'}.`, exact: true }).waitFor();
          console.log('Reviewed',name,width,count);
          const costs=page.getByRole('button',{name:'Costs & refundable storage'});
          await costs.click();
          const invoice=page.getByRole('region',{name:'Payment breakdown'});
          await invoice.getByText(`${321*count} tCKB`,{exact:true}).waitFor();
          await invoice.getByText('Refundable',{exact:true}).waitFor();
          await page.screenshot({path:path.join(evidence,`invoice-${name}-${width}-${count}.png`)});
          await page.keyboard.press('Escape');
          await page.getByRole('dialog',{name:'Cost breakdown'}).waitFor({state:'hidden'});
          assert.equal(await costs.evaluate(el=>el===document.activeElement),true,'Cost sheet restores focus without closing the slip.');
          const dimensions=await page.locator('dialog.prediction-slip').evaluate(el=>({footer:el.querySelector('.slip-footer').getBoundingClientRect().height,list:el.querySelector('#slip-picks-panel').getBoundingClientRect().height}));
          assert.ok(dimensions.footer<220 && dimensions.list>300,JSON.stringify(dimensions));
          assert.equal(await page.locator('#slip-picks-panel .batch-transaction').count(),0);
          await page.screenshot({path:path.join(evidence,`compact-slip-${name}-${width}-${count}.png`)});
          const submitted = page.waitForResponse(response => response.url().endsWith('/api/direct/batch/submit') && response.request().method() === 'POST');
          // Keep the original promise for assertions, but avoid masking an earlier layout failure during cleanup.
          void submitted.catch(()=>{});
          holdApproval=true;
          await page.getByRole('button', { name: /^Pay [\d,.]+ tCKB$/ }).click();
          await page.getByRole('button',{name:'Preparing wallet approval',exact:true}).waitFor();
          assert.equal(await page.locator('.payment-working').count(),0,'Preparation stays inside the button.');
          while(!releaseApproval)await new Promise(resolve=>setTimeout(resolve,10));
          releaseApproval();releaseApproval=undefined;
          await page.locator('dialog.prediction-slip').waitFor({state:'hidden'});
          console.log('Signed',name,width,count);
          const tracker=page.getByRole('complementary',{name:'Payment progress'});
          await tracker.getByText('Completing your signed payment',{exact:true}).waitFor();
          await page.locator('.prediction-dock').click();
          await page.getByRole('tab',{name:'Activity',exact:true}).click();
          await page.locator('.slip-receipt').first().waitFor();
          assert.equal(await page.locator('.slip-footer').isVisible(),false,'Activity owns the receipt area.');
          await page.locator('.slip-receipt > summary').first().click();
          await page.getByRole('tab',{name:/Picks/}).click();
          await page.getByRole('button',{name:'Close prediction slip',exact:true}).click();
          const dockBounds=await page.locator('.prediction-dock').boundingBox(), progressBounds=await tracker.boundingBox();
          if(dockBounds && progressBounds) assert.ok(progressBounds.x+progressBounds.width<=dockBounds.x || dockBounds.x+dockBounds.width<=progressBounds.x || progressBounds.y+progressBounds.height<=dockBounds.y || dockBounds.y+dockBounds.height<=progressBounds.y,'Payment progress and the retained draft dock cannot overlap.');
          assert.equal(await tracker.getByText('Payment confirmed. You’re all set.',{exact:true}).count(),0,'Previous confirmation never labels the next pending payment.');
          if(count===1) {
            await page.getByRole('button',{name:/Back to markets/}).click();
            await page.getByRole('link',{name:'View market: Arsenal vs Chelsea',exact:true}).click();
            await tracker.getByText('Completing your signed payment',{exact:true}).waitFor();
            assert.equal(signatures,1,'Navigation cannot restart signing.');
          }
          await page.screenshot({path:path.join(evidence,`payment-running-${name}-${width}-${count}.png`)});
          const started=Date.now();
          while(!releaseSubmission && Date.now()-started<15000)await new Promise(resolve=>setTimeout(resolve,50));
          assert.ok(releaseSubmission,'Signed submission starts while slip is closed.');
          releaseSubmission(); releaseSubmission=undefined;
          await submitted;
          console.log('Submitted',name,width,count);
          if(count===1) {
            await tracker.getByText('Checking your payment',{exact:true}).waitFor();
            assert.equal(signatures,1,'A lost sponsor response cannot trigger another wallet signature.');
            assert.equal(chain.submissions.length,1,'Background checks do not submit a second payment.');
            await chain.finish(delayedOffer);
          }
          await page.waitForFunction(() => document.querySelector('.slip-title-count')?.textContent === '0');
          await tracker.getByText('Payment confirmed. You’re all set.',{exact:true}).waitFor();
          console.log('Confirmed',name,width,count);
          await tracker.locator('.payment-progress-toggle').click();
          await tracker.getByRole('article', { name: 'Combined prediction payment' }).getByText('Confirmed', { exact: true }).waitFor();
          await tracker.getByRole('button',{name:'Dismiss update',exact:true}).click();
          if(count===2 && name==='chromium' && width===1440) {
            reorg=true;
            await tracker.getByText('Checking your payment',{exact:true}).waitFor({timeout:25000});
            assert.equal(signatures,2,'A reorg reopens the tracker without another signature.');
            reorg=false;
            await page.waitForFunction(()=>document.querySelector('.payment-progress')?.getAttribute('data-stage')==='confirmed',null,{timeout:25000});
            assert.equal(await page.locator('.payment-progress').count(),1,'One checkout owns one tracker across changing payment identities.');
            await tracker.waitFor({state:'hidden'});
          }
        }
        await page.goto(base + '/season/');
        const populatedCard = page.getByRole('article').filter({has:page.getByRole('link',{name:'View market: Liverpool vs Everton',exact:true})});
        await populatedCard.waitFor();
        releasePools();
        await populatedCard.getByText('50%',{exact:true}).waitFor();
        assert.equal(await populatedCard.locator('[data-outcome="home"] strong').innerText(),'50%');
        await page.getByRole('link', { name: 'View market: Arsenal vs Chelsea', exact: true }).click();
        await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
        await page.getByText('Market setup is on us', { exact: true }).waitFor();
        assert.equal(await page.getByRole('link', { name: /Open wallet payment/ }).count(), 0);
        await page.getByRole('region', { name: 'Pool history chart' }).waitFor();
        await page.getByRole('heading',{name:'Last 5 meetings',exact:true}).waitFor();
        assert.equal(await page.locator('.meeting-row').count(),5);
        assert.equal(await page.locator('.form-result').count(),10);
        await page.screenshot({ path: path.join(evidence, `market-${name}-${width}.png`), fullPage: true });
        await page.locator('.detail-outcomes [data-outcome="home"]').click();
        await connect(page.getByRole('button', { name: 'Reconnect wallet to pay', exact: true }));
        assert.equal(signatures, 0, 'Reconnect never signs a payment.');
        await page.getByRole('button',{name:'Review payment',exact:true}).click();
        await page.getByText(/Sponsor queue is busy/).waitFor();
        assert.equal(signatures,0,'An unsigned busy review cannot ask for a signature or claim money moved.');
        await pay(1);
        assert.equal(chain.fixtures()[0].state, 'funded', 'The first payment creates the market.');
        assert.equal(chain.submissions.length, 1);
        assert.equal(signatures, 1);
        await page.getByRole('button', { name: /Back to markets/ }).click();
        await page.getByRole('button', { name: 'Add Draw for Arsenal vs Chelsea', exact: true }).click();
        await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
        await page.getByRole('button', { name: 'Add Away for Barcelona vs Real Madrid', exact: true }).click();
        await page.locator('.prediction-dock').click();
        assert.equal(await page.getByRole('button', { name: 'Reconnect wallet to pay', exact: true }).count(), 0, 'Same-page repeat payment retains the EVM signer.');
        if(name==='chromium' && width===1440) {
          await page.getByRole('button',{name:'Review all predictions',exact:true}).click();
          await page.getByRole('heading',{name:'One payment. 2 predictions.',exact:true}).waitFor();
          rejectNext=true;
          await page.getByRole('button',{name:/^Pay [\d,.]+ tCKB$/}).click();
          await page.getByText(/Synthetic wallet declined the second payment/).waitFor();
          await page.getByRole('button',{name:'Close prediction slip',exact:true}).click();
          const tracker=page.getByRole('complementary',{name:'Payment progress'});
          await tracker.getByText('Payment not sent',{exact:true}).waitFor();
          assert.equal(chain.submissions.length,1,'Rejected second payment cannot inherit first payment success.');
          await page.locator('.prediction-dock').click();
        }
        await pay(2);
        assert.equal(chain.submissions.length, 2);
        assert.equal(signatures, 2);
        assert.equal(chain.fixtures()[1].state, 'funded');
        await page.goto(base + '/season/?direct=m-api-football-910002');
        await page.getByRole('heading', { name: 'Liverpool vs Everton', exact: true }).waitFor();
        await page.locator('.chart-legend').getByText('50%',{exact:true}).waitFor();
        await page.getByRole('slider', { name: 'Explore recorded activity' }).focus();
        await page.keyboard.press('Home');
        assert.equal(await page.locator('.chart-legend strong').first().innerText(), '25%');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('.chart-legend strong').first().innerText(), '40%');
        assert.equal(await page.locator('.detail-outcomes [data-outcome="home"] strong').innerText(),'50%','Payment selection shows current pool share while chart inspects history.');
        await page.locator('.chart-legend button').first().click();
        assert.equal(await page.locator('.chart-series[data-outcome="draw"]').getAttribute('opacity'),'0.15');
        await page.getByRole('button',{name:'1H',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'1H',exact:true}).getAttribute('aria-pressed'),'true');
        await page.locator('.chart-plot').hover({position:{x:80,y:90}});
        await page.locator('.chart-tooltip').waitFor();
        await page.screenshot({ path: path.join(evidence, `chart-${name}-${width}.png`), fullPage: true });
        assert.equal(await page.getByRole('region', { name: 'Testnet wallet' }).count(), 0, 'Old entry links use current market detail.');
        await connect(page.getByRole('button', { name: 'Reconnect wallet', exact: true }));
        assert.equal(signatures, 2);
        failMode = true;
        await page.reload();
        await page.getByText('Unable to open payment', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Review testnet prediction', exact: true }).count(), 0, 'Routing failure cannot enable obsolete checkout.');
        failMode = false;
        await page.getByRole('button', { name: 'Try again', exact: true }).click();
        await page.getByRole('heading', { name: 'Liverpool vs Everton', exact: true }).waitFor();
        stalePools = true;
        await page.reload();
        await page.getByText('Update delayed',{exact:true}).waitFor();
        assert.equal(await page.locator('.detail-outcomes [data-outcome="home"] strong').innerText(),'-','Old observations cannot be shown as current pool odds.');
        assert.equal(offers, 3 + rejections);
        assert.ok(writes.every(url => ['/api/direct/batch/offer', '/api/direct/batch/submit'].includes(url)));
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        console.log(`PASS full app EVM checkout ${name} ${width}: card, detail, inline reconnect, first market creation, mixed repeat payment, historical entry URL and fail-closed routing`);
        await context.close();
      }
      await browser.close(); browser = null;
    }
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('streak-checkout-browser-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
