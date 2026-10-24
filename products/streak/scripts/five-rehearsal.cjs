// Interactive, disposable-chain rehearsal. Never imported by the application.
require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const ccc = require('@ckb-ccc/core');
const { boot } = require('./direct-harness.cjs');
const { PgFiveStorage } = require('../dist/modules/five/storage');
const { FiveFunding } = require('../dist/modules/five/funding');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { FiveService } = require('../dist/modules/five/service');
const { newRound, parseTerms, saveEntry, standings } = require('../dist/modules/five/domain');
const { auctionView } = require('../dist/modules/five/auction');

async function main() {
  const url = new URL(process.env.PG_TEST_URL || '');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /_test$/);
  assert.equal(url.search, '');
  assert.equal(process.argv[2], 'http://127.0.0.1:8218');
  // WSL readiness does not guarantee Windows localhost forwarding is ready yet.
  let reachable = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(process.argv[2], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_tip_header', params: [] }),
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).result) {
        reachable = true;
        break;
      }
    } catch {
      /* Retry only the owned node's readiness, never a signed action. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(reachable, 'Owned devnet must be reachable from the actual rehearsal runner');
  const schema = `five_rehearsal_${randomUUID().replaceAll('-', '')}`;
  const db = new Pool({ connectionString: url.href });
  let pool, server;
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 4 });
    const h = await boot();
    const client = h.owner.signer.client;
    // Test-only time injection, never edits published terms or the system/database clock.
    class RehearsalStorage extends PgFiveStorage {
      offset = 0;
      async clock() {
        return (await super.clock()) + this.offset;
      }
      change(id, mutate, reservation) {
        return super.change(id, (r, now) => mutate(r, now + this.offset), reservation);
      }
    }
    const store = new RehearsalStorage(pool);
    const destination = await h.admin.signer.getRecommendedAddress();
    const aliceWallet = await h.owner.signer.getRecommendedAddress();
    const bobSigner = new ccc.SignerCkbPrivateKey(client, '0x' + '33'.repeat(32));
    const bobWallet = await bobSigner.getRecommendedAddress();
    const bobLock = (await ccc.Address.fromString(bobWallet, client)).script;
    const seed = await h.owner.signer.signTransaction(
      ccc.Transaction.from({
        inputs: [{ previousOutput: h.owner.fund.outPoint }],
        outputs: [
          { lock: bobLock, capacity: 2000n * h.CKB },
          { lock: h.owner.lock, capacity: h.owner.fund.output.capacity - 2000n * h.CKB - 10000n },
        ],
        outputsData: ['0x', '0x'],
      }),
    );
    const bob = { signer: bobSigner, lock: bobLock, fund: (await h.commit(h.owner, seed))[0] };
    const alice = { id: 'alice', name: 'Alice (demo)', wallet: aliceWallet };
    const bobActor = { id: 'bob', name: 'Bob (demo)', wallet: bobWallet };
    const admin = { id: 'host', name: 'Rehearsal host', wallet: destination };
    const funding = new FiveFunding(store, client, destination);
    let rewards = new FiveRewards(pool, client, destination);
    const service = new FiveService(store, [destination], undefined, funding, rewards);
    const players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
      id: `p${i}`,
      name: `Demo player ${i + 1}`,
      teamId: `t${i}`,
      team: `Demo club ${i + 1}`,
      position,
      cost: 80,
      fixtureId: `f${i}`,
    }));
    const base = await store.clock();
    const terms = parseTerms({
      name: 'Local rehearsal',
      players,
      lockAt: new Date(base + 3600000).toISOString(),
      finalizeAfter: new Date(base + 7200000).toISOString(),
      limit: 100,
      qualifyingBps: 500,
      sponsorship: true,
      sponsorshipMode: 'auction',
      minimumShannons: '10000000000',
      source: 'Synthetic local-chain rehearsal',
    });
    await store.create('rehearsal', admin.id, (now) => newRound('rehearsal', admin.id, terms, now));
    await store.change('rehearsal', (r, now) => {
      r.state = 'open';
      saveEntry(
        r,
        alice,
        players.map((p) => p.id),
        'p2',
        r.termsHash,
        now,
      );
      saveEntry(
        r,
        bobActor,
        players.map((p) => p.id),
        'p0',
        r.termsHash,
        now,
      );
    });
    const hashes = [];
    let phase = 0,
      busy = false,
      error = '',
      message = 'Two demo squads are saved. Start with Alice’s bid.';
    async function bid(who, actor, id) {
      await funding.intent(actor, 'rehearsal', {
        sponsorId: id,
        amountShannons: '10000000000',
        display: 'anonymous',
        custodyAccepted: true,
      });
      const sponsor = (await store.load('rehearsal')).sponsors.find((s) => s.id === id);
      const tx = await who.signer.signTransaction(
        ccc.Transaction.from({
          inputs: [{ previousOutput: who.fund.outPoint }],
          outputs: [
            { lock: h.admin.lock, capacity: 100n * h.CKB },
            { lock: who.lock, capacity: who.fund.output.capacity - 100n * h.CKB - 10000n },
          ],
          outputsData: [sponsor.tag, '0x'],
        }),
      );
      await funding.submit(actor, 'rehearsal', {
        sponsorId: id,
        signedBytes: ccc.hexFrom(tx.toBytes()),
      });
      await funding.reconcile('rehearsal');
      await h.commit(who, tx, true);
      await h.mine(24);
      await funding.reconcile('rehearsal');
      hashes.push({ label: `${actor.name}: 100 demo CKB bid`, hash: tx.hash() });
    }
    async function deliver(wallet, amount, label) {
      await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
      const rows = await pool.query(
        "SELECT * FROM streak_five_payouts WHERE wallet=$1 AND status='submitted'",
        [wallet],
      );
      assert.equal(rows.rows.length, 1);
      const tx = ccc.Transaction.fromBytes(rows.rows[0].signed_bytes);
      assert.equal(tx.outputs[0].capacity, amount * h.CKB);
      // Restart between durable signing and broadcast, exercising recovery.
      rewards = new FiveRewards(pool, client, destination);
      await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
      await h.commit(h.admin, tx, true);
      await h.mine(24);
      await rewards.tick(h.admin.signer, (id) => funding.verifyConfirmed(id));
      assert.equal((await rewards.account(wallet)).paidShannons, String(amount * h.CKB));
      hashes.push({ label, hash: tx.hash() });
    }
    const steps = [
      [
        'Place Alice’s 100 bid',
        async () => {
          await bid(h.owner, alice, 'alice-first');
          return 'Alice leads with 100 demo CKB.';
        },
      ],
      [
        'Place Bob’s 100 bid',
        async () => {
          await bid(bob, bobActor, 'bob-first');
          return 'Both bid 100. Alice leads because she funded first.';
        },
      ],
      [
        'Top up Alice by 100',
        async () => {
          await bid(h.owner, alice, 'alice-topup');
          return 'Alice’s two payments combine into a 200 bid.';
        },
      ],
      [
        'Close bidding and refund Bob',
        async () => {
          store.offset = 3601000;
          await assert.rejects(
            funding.intent(alice, 'rehearsal', {
              sponsorId: 'late',
              amountShannons: '10000000000',
              display: 'anonymous',
              custodyAccepted: true,
            }),
            /closed/,
          );
          await assert.rejects(
            store.change('rehearsal', (r, now) =>
              saveEntry(
                r,
                alice,
                players.map((p) => p.id),
                'p0',
                r.termsHash,
                now,
              ),
            ),
            /closed/,
          );
          await funding.settleAuction('rehearsal');
          const round = await store.load('rehearsal');
          assert.equal(round.auction.winnerWallet, aliceWallet);
          await rewards.credit(round);
          await deliver(bobWallet, 100n, 'Bob: automatic losing-bid refund');
          return 'Bids and picks are locked. Alice wins the sponsor slot; Bob’s full 100 refund is confirmed.';
        },
      ],
      [
        'Apply demo results and finalize',
        async () => {
          store.offset = 7201000;
          const stats = Object.fromEntries(
            players.map((p, i) => [
              p.id,
              {
                minutes: 90,
                goals: i === 2 ? 2 : 0,
                assists: 0,
                conceded: 1,
                saves: 0,
                penaltySaves: 0,
                yellow: 0,
                red: 0,
                ownGoals: 0,
                penaltyMisses: 0,
              },
            ]),
          );
          await service.action(admin, {
            action: 'scores',
            id: 'rehearsal',
            stats,
            source: 'Synthetic rehearsal results',
            complete: true,
          });
          await service.action(admin, {
            action: 'finalize',
            id: 'rehearsal',
            revision: (await store.load('rehearsal')).revision,
          });
          await rewards.credit(await store.load('rehearsal'));
          assert.equal((await rewards.account(aliceWallet)).availableShannons, '20000000000');
          return 'Demo results finalized through the game service. Alice’s captain choice earns the 200 prize.';
        },
      ],
      [
        'Collect Alice’s 200 prize',
        async () => {
          await rewards.request(aliceWallet);
          await deliver(aliceWallet, 200n, 'Alice: collected prize');
          return 'Prize confirmed. Bids, top-up, deadline enforcement, refund and collection all completed on the local chain.';
        },
      ],
    ];
    async function state() {
      const round = await store.load('rehearsal');
      return {
        phase,
        busy,
        error,
        message,
        next: steps[phase]?.[0] ?? null,
        hashes,
        auction: auctionView(round, alice.id, await store.clock()),
        standings: standings(round).map((r) => ({ name: r.name, points: r.points })),
        alice: await rewards.account(aliceWallet),
        bob: await rewards.account(bobWallet),
      };
    }
    await rewards.heartbeat();
    const port = 4190,
      origin = `http://127.0.0.1:${port}`;
    server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.headers.host !== `127.0.0.1:${port}`) return res.writeHead(403).end();
      try {
        if (req.method === 'GET' && req.url === '/') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(readFileSync(path.join(__dirname, 'five-rehearsal.html')));
        }
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && req.url === '/state')
          return res.end(JSON.stringify(await state()));
        if (
          req.method !== 'POST' ||
          req.url !== '/next' ||
          req.headers.origin !== origin ||
          req.headers['x-rehearsal'] !== '1'
        )
          return res.writeHead(403).end('{}');
        if (busy || phase >= steps.length || error) return res.writeHead(409).end('{}');
        busy = true;
        res.writeHead(202).end('{}');
        void rewards
          .heartbeat()
          .then(() => steps[phase][1]())
          .then((result) => {
            message = result;
            phase++;
          })
          .catch((e) => {
            console.error(e);
            error =
              'Rehearsal stopped. Check its terminal log before restarting; no live funds were used.';
          })
          .finally(() => {
            busy = false;
          });
      } catch (e) {
        console.error(e);
        if (!res.headersSent) res.writeHead(500);
        res.end('{}');
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    console.log(
      `Local Five rehearsal: ${origin}. Disposable wallets only. No MetaMask connection required.`,
    );
    if (process.argv.includes('--check')) {
      const { chromium } = require('playwright');
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto(origin);
        for (let i = 0; i < steps.length; i++) {
          if (i === 5) {
            await pool.query(
              "UPDATE streak_five_reward_runtime SET heartbeat=clock_timestamp()-interval '2 minutes'",
            );
            assert.equal(await rewards.active(), false, 'Simulate a leisurely manual rehearsal');
          }
          await page.getByRole('button', { name: steps[i][0], exact: true }).click();
          await page.waitForFunction((n) => Number(document.body.dataset.phase) > n, i, {
            timeout: 120000,
          });
        }
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        const out = path.resolve(__dirname, '../../../.quality-artifacts/five-rehearsal');
        mkdirSync(out, { recursive: true });
        await page.screenshot({ path: path.join(out, 'completed-mobile.png'), fullPage: true });
        console.log(
          'PASS interactive rehearsal: six browser actions, signed bids, refund, scoring and prize collection.',
        );
      } finally {
        await browser.close();
      }
    } else {
      await new Promise((resolve) => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
      while (busy) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
