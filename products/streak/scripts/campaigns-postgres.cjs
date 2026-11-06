require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { PgCampaignStorage, campaignCheckDelay } = require('../dist/modules/campaigns/storage');
const { CampaignService } = require('../dist/modules/campaigns/service');
const {
  newCampaign,
  parseDraft,
  publishCampaign,
  joinCampaign,
  deleteCampaign,
  reconcileCampaign,
  finalizeCampaign,
  saveReceivingAddress,
} = require('../dist/modules/campaigns/domain');
const hex = (value) => `0x${value.toString(16).padStart(64, '0')}`;
const actor = (id) => ({
  id: `account-${id}`,
  name: `Player ${id}`,
  wallet: `synthetic-wallet-${id}`,
  ownerHash: hex(id),
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  assert.ok(process.env.PG_TEST_URL, 'An isolated PG_TEST_URL is required; this test never skips.');
  const url = new URL(process.env.PG_TEST_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/[a-zA-Z0-9_]+_test$/);
  assert.equal(url.search, '');
  const schema = `campaign_test_${randomUUID().replaceAll('-', '')}`,
    admin = new Pool({ connectionString: url.href });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 12 });
    const storage = new PgCampaignStorage(pool),
      created = Date.now();
    async function waitForDatabaseTime(deadline) {
      const timeout = performance.now() + 10_000;
      for (;;) {
        const remaining = deadline - (await storage.clock());
        if (remaining <= 0) return;
        assert.ok(
          performance.now() < timeout,
          'Synthetic database cutoff did not arrive within its bound.',
        );
        await sleep(Math.min(250, remaining + 25));
      }
    }
    const draft = (deadline) =>
      parseDraft({
        name: 'PG campaign',
        description: 'Synthetic integration',
        kind: 'predictions',
        registrationClosesAt: new Date(deadline).toISOString(),
        fixtureIds: ['fixture-1'],
        fiveRoundId: null,
        prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '25' }],
        rehearsal: false,
      });
    const options = (deadline) => ({
      fixtures: [
        {
          fixtureId: 'fixture-1',
          marketId: 'market-1',
          marketKey: 'canonical-1',
          home: 'Home',
          away: 'Away',
          league: 'Local',
          cutoffAt: new Date(deadline).toISOString(),
          kickoffAt: new Date(deadline + 1000).toISOString(),
          capacity: 32,
          occupied: 0,
          updatedAt: null,
        },
      ],
      gameweeks: [],
    });
    async function create(id, deadline = created + 60_000) {
      await storage.create(id, actor(99).id, (now) =>
        newCampaign(id, actor(99), draft(deadline), now),
      );
      return storage.change(id, (c, now) => publishCampaign(c, options(deadline), now), {
        actorId: actor(99).id,
        action: 'publish',
      });
    }
    const c = await create('concurrent');
    const legacyRehearsal = await create('legacy-rehearsal');
    await storage.change(
      legacyRehearsal.id,
      (current, now) => {
        current.draft.rehearsal = true;
        delete current.predictionEntryPolicy;
        current.termsHash = 'synthetic-legacy-reviewed-hash';
        joinCampaign(current, actor(1), current.termsHash, now);
      },
      { actorId: 'synthetic-fixture', action: 'restore-legacy-rehearsal' },
    );
    const priorPolicy = await storage.load(legacyRehearsal.id);
    const oldPrediction = {
      id: 'before-registration',
      ownerHash: hex(1),
      fixtureId: 'fixture-1',
      marketKey: 'canonical-1',
      outcome: 2,
      committedAt: new Date(Date.parse(priorPolicy.entries[0].joinedAt) - 1000).toISOString(),
      blockNumber: '5',
      transactionIndex: 0,
      outputIndex: 1,
      transactionHash: hex(50),
      blockHash: hex(60),
      principalShannons: '10000000000',
      status: 'accepted',
    };
    const policyEvidence = {
      revision: 'existing-market-history',
      verifiedAt: new Date(await storage.clock()).toISOString(),
      complete: true,
      final: false,
      predictions: [oldPrediction],
      results: [],
      five: [],
    };
    const upgradedPolicy = await storage.change(
      legacyRehearsal.id,
      (current, now) => reconcileCampaign(current, policyEvidence, now),
      { actorId: 'system', action: 'reconcile' },
    );
    assert.equal(upgradedPolicy.predictionEntryPolicy, 'first-admitted-v2');
    assert.notEqual(upgradedPolicy.termsHash, priorPolicy.termsHash);
    assert.equal(upgradedPolicy.entries[0].calls[0].outcome, 2);
    assert.equal(upgradedPolicy.entries[0].calls[0].status, 'pending');
    assert.equal(upgradedPolicy.entries[0].joinedAt, priorPolicy.entries[0].joinedAt);
    const ruleAudit = await pool.query(
      'SELECT data FROM streak_campaign_audit WHERE campaign_id=$1 AND revision=$2',
      [legacyRehearsal.id, upgradedPolicy.revision],
    );
    assert.equal(ruleAudit.rows[0].data.campaign.predictionEntryPolicy, 'first-admitted-v2');
    assert.equal(ruleAudit.rows[0].data.changedEntries[0].calls[0].transactionHash, hex(50));
    await assert.rejects(
      storage.change(
        legacyRehearsal.id,
        (current, now) => joinCampaign(current, actor(2), priorPolicy.termsHash, now),
        { actorId: actor(2).id, action: 'join' },
      ),
      /Review/,
    );
    assert.equal((await storage.load(legacyRehearsal.id)).revision, upgradedPolicy.revision);
    const repeatedPolicy = await storage.change(
      legacyRehearsal.id,
      (current, now) => reconcileCampaign(current, policyEvidence, now),
      { actorId: 'system', action: 'reconcile' },
    );
    assert.equal(
      repeatedPolicy.revision,
      upgradedPolicy.revision,
      'policy migration and replay stay idempotent',
    );
    const retry = await storage.create(c.id, actor(99).id, (now) =>
      newCampaign(c.id, actor(99), draft(created + 60_000), now),
    );
    assert.equal(
      retry.id,
      c.id,
      'An identical create retry survives PostgreSQL JSONB key ordering.',
    );
    assert.equal(retry.revision, c.revision);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        storage.change(
          c.id,
          (current, now) => joinCampaign(current, actor(i + 1), c.termsHash, now),
          { actorId: actor(i + 1).id, action: 'join' },
        ),
      ),
    );
    assert.equal(
      (await storage.load(c.id)).entries.length,
      12,
      'Concurrent registrations are not lost.',
    );
    const beforeRepeat = await storage.load(c.id);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        storage.change(c.id, (current, now) => joinCampaign(current, actor(1), c.termsHash, now), {
          actorId: actor(1).id,
          action: 'join',
        }),
      ),
    );
    assert.equal(
      (await storage.load(c.id)).revision,
      beforeRepeat.revision,
      'Retry joins do not change original timestamps/revision.',
    );
    const before = await storage.load(c.id);
    await assert.rejects(
      storage.change(
        c.id,
        (current) => {
          current.entries = [];
          throw Error('abort');
        },
        { actorId: 'test', action: 'abort' },
      ),
      /abort/,
    );
    assert.deepEqual(
      await storage.load(c.id),
      before,
      'Failed mutation rolls back without deleting entries.',
    );
    const published = await storage.load(c.id);
    await storage.change(
      c.id,
      (current, now) =>
        deleteCampaign(current, actor(99), published.revision, current.draft.name, now),
      { actorId: actor(99).id, action: 'delete' },
    );
    assert.equal(
      (await storage.load(c.id)).entries.length,
      12,
      'Soft deletion preserves every registration.',
    );
    await assert.rejects(
      storage.change(c.id, (current, now) => joinCampaign(current, actor(13), c.termsHash, now), {
        actorId: 'late',
        action: 'join',
      }),
      /closed/,
    );
    const cutoffAt = (await storage.clock()) + 2000;
    const race = await create('cutoff', cutoffAt),
      blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM streak_campaigns WHERE id=$1 FOR UPDATE', ['cutoff']);
    const queued = storage.change(
      'cutoff',
      (current, now) => joinCampaign(current, actor(1), race.termsHash, now),
      { actorId: 'late', action: 'join' },
    );
    const rejects = assert.rejects(queued, /closed/);
    await waitForDatabaseTime(cutoffAt + 100);
    await blocker.query('COMMIT');
    blocker.release();
    await rejects;
    const sources = {
      options: async () => options(created + 60_000),
      observe: async () => {
        throw Error('not used');
      },
      validateReceivingAddress: async (address) => address,
    };
    const service = new CampaignService(storage, [actor(99).wallet], sources);
    await assert.rejects(service.options(actor(1)), /Administrator/);
    assert.ok(
      !(await service.list(null)).campaigns.some((row) => row.id === 'concurrent'),
      'Deleted discovery is hidden publicly.',
    );
    assert.equal(
      (await service.get('concurrent', actor(1))).detail.registeredCount,
      12,
      'Existing entrants retain archived access.',
    );
    const end = (await storage.clock()) + 3000;
    for (const id of ['award-a', 'award-b']) {
      const item = await create(id, end);
      await storage.change(
        id,
        (current, now) => joinCampaign(current, actor(1), item.termsHash, now),
        { actorId: actor(1).id, action: 'join' },
      );
    }
    await waitForDatabaseTime(end + 100);
    for (const id of ['award-a', 'award-b']) {
      await storage.change(
        id,
        (current, now) => {
          const joined = current.entries[0].joinedAt;
          reconcileCampaign(
            current,
            {
              revision: 'canonical-1',
              verifiedAt: new Date(now).toISOString(),
              complete: true,
              final: true,
              predictions: [
                {
                  id: 'position',
                  ownerHash: hex(1),
                  fixtureId: 'fixture-1',
                  marketKey: 'canonical-1',
                  outcome: 0,
                  committedAt: joined,
                  blockNumber: '5',
                  transactionIndex: 0,
                  outputIndex: 1,
                  transactionHash: hex(50),
                  blockHash: hex(60),
                  principalShannons: '10000000000',
                  status: 'accepted',
                },
              ],
              results: [
                {
                  fixtureId: 'fixture-1',
                  marketKey: 'canonical-1',
                  outcome: 0,
                  final: true,
                  void: false,
                },
              ],
              five: [],
            },
            now,
          );
          assert.ok(
            now >= Date.parse(current.fixtures[0].cutoffAt),
            'Database time has reached the synthetic fixture cutoff.',
          );
          assert.equal(current.scoreStatus, 'final');
          assert.equal(current.evidenceFinal, true);
          finalizeCampaign(current, now);
          saveReceivingAddress(current, actor(1), 'ckb-synthetic-address');
        },
        { actorId: 'system', action: 'finalize' },
      );
    }
    const proof = {
      transactionHash: hex(500),
      outputIndex: 0,
      address: 'ckb-synthetic-address',
      amountShannons: '10000000000',
      blockHash: hex(600),
      blockNumber: '501',
      confirmedAt: new Date().toISOString(),
    };
    const first = await storage.load('award-a'),
      second = await storage.load('award-b');
    const replay = await storage.change(
      first.id,
      (current, now) =>
        reconcileCampaign(
          current,
          {
            revision: current.evidenceRevision,
            verifiedAt: current.verifiedAt,
            complete: true,
            final: true,
            predictions: current.entries.flatMap((entry) => entry.evidence),
            results: [
              {
                fixtureId: 'fixture-1',
                marketKey: 'canonical-1',
                outcome: 0,
                final: true,
                void: false,
              },
            ],
            five: [],
          },
          now,
        ),
      { actorId: 'system', action: 'replay' },
    );
    assert.equal(
      replay.scoreStatus,
      'final',
      'A JSONB-reloaded result replay never invents an award review.',
    );
    assert.equal(
      replay.revision,
      first.revision,
      'Structural no-op replays do not create audit revisions.',
    );
    const freshTime = new Date(await storage.clock()).toISOString();
    const auditCount = async () =>
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM streak_campaign_audit WHERE campaign_id=$1',
          [first.id],
        )
      ).rows[0].count;
    const auditsBeforeFreshness = await auditCount();
    const entryVersion = await pool.query(
      'SELECT account_id,xmin::text AS version FROM streak_campaign_entries WHERE campaign_id=$1 ORDER BY account_id',
      [first.id],
    );
    await storage.change(
      first.id,
      (current) => {
        current.verifiedAt = freshTime;
        current.fixtures[0].updatedAt = freshTime;
      },
      { actorId: 'system', action: 'reconcile' },
    );
    const fresh = await storage.load(first.id);
    assert.equal(fresh.verifiedAt, freshTime);
    assert.equal(fresh.fixtures[0].updatedAt, freshTime);
    assert.equal(
      fresh.revision,
      first.revision,
      'check timestamps are separate from semantic revisions',
    );
    assert.equal(
      await auditCount(),
      auditsBeforeFreshness,
      'freshness-only checks do not append full audit entries',
    );
    assert.deepEqual(
      (
        await pool.query(
          'SELECT account_id,xmin::text AS version FROM streak_campaign_entries WHERE campaign_id=$1 ORDER BY account_id',
          [first.id],
        )
      ).rows,
      entryVersion.rows,
      'freshness-only checks leave entrants untouched',
    );
    await storage.change(
      first.id,
      (current) => {
        current.verifiedAt = first.verifiedAt;
        current.fixtures[0].updatedAt = first.fixtures[0].updatedAt;
      },
      { actorId: 'system', action: 'reconcile' },
    );
    assert.equal(
      (await storage.load(first.id)).verifiedAt,
      freshTime,
      'late old check cannot regress verification freshness',
    );
    assert.equal(
      campaignCheckDelay(fresh, Date.now()),
      900_000,
      'unpaid finished awards remain in reconciliation',
    );
    await service.recordPayout(first.id, first.entries[0].publicId, proof, actor(99));
    assert.equal(
      campaignCheckDelay(await storage.load(first.id), Date.now()),
      86_400_000,
      'fully paid results keep a daily correction audit instead of frequent polling',
    );
    assert.equal(
      campaignCheckDelay(await storage.load('concurrent'), Date.now()),
      86_400_000,
      'deleted competitions without awards leave frequent processing',
    );
    await pool.query("UPDATE streak_campaigns SET due_at=clock_timestamp()+interval '1 day'");
    assert.equal(await storage.nextDueDelay(), 900_000);
    assert.deepEqual(await storage.dueJobs(), []);
    await storage.wakeSources('predictions');
    const jobs = await storage.dueJobs();
    assert.ok(
      jobs.some((job) => job.id === first.id),
      'source changes can audit a previously completed result',
    );
    assert.ok(
      !jobs.some((job) => job.id === 'concurrent'),
      'irrelevant source changes do not wake an archived unpublished result',
    );
    const job = jobs.find((item) => item.id === first.id);
    await storage.wakeSources('predictions');
    await storage.defer(job, 86_400_000);
    assert.ok(
      (await storage.dueJobs()).some((item) => item.id === first.id),
      'a notification during projection cannot be overwritten by its older due-time update',
    );
    const nextJob = (await storage.dueJobs()).find((item) => item.id === first.id);
    await storage.defer(nextJob, 86_400_000);
    assert.ok(
      !(await storage.dueJobs()).some((item) => item.id === first.id),
      'the consumed generation can return to its audit schedule',
    );
    await assert.rejects(
      service.recordPayout(second.id, second.entries[0].publicId, proof, actor(99)),
      /another award/,
    );
    assert.equal(
      (await storage.load(second.id)).awards[0].status,
      'ready',
      'Duplicate output conflict rolls back award status.',
    );
    const audits = await pool.query(
      'SELECT action FROM streak_campaign_audit WHERE campaign_id=$1 ORDER BY revision',
      ['concurrent'],
    );
    assert.ok(audits.rows.some((row) => row.action === 'delete'));
    assert.equal(audits.rows.filter((row) => row.action === 'join').length, 12);
    const drafts = Array.from({ length: 105 }, (_, i) =>
      newCampaign(`newer-draft-${i}`, actor(99), draft(Date.now() + 60_000), Date.now()),
    );
    await pool.query(
      `INSERT INTO streak_campaigns(id,creator,created_at,data)
      SELECT item->>'id',item->>'creator',(item->>'createdAt')::timestamptz,item FROM jsonb_array_elements($1::jsonb) item`,
      [JSON.stringify(drafts)],
    );
    const firstPage = await storage.reconciliationIds('', 2);
    const secondPage = await storage.reconciliationIds(firstPage[firstPage.length - 1], 2);
    assert.deepEqual(
      [...firstPage, ...secondPage],
      ['award-a', 'award-b', 'concurrent', 'cutoff'],
      'Newer drafts never starve old open, deleted or finished campaigns from obligation reconciliation.',
    );
    const thirdPage = await storage.reconciliationIds(secondPage[secondPage.length - 1], 2);
    assert.deepEqual(thirdPage, ['legacy-rehearsal']);
    assert.deepEqual(await storage.reconciliationIds(thirdPage[thirdPage.length - 1], 2), []);
    console.log(
      'Campaign PostgreSQL checks passed: concurrent/idempotent joins, cutoff lock, rollback, archive, authorization, output reuse, audited rehearsal policy upgrade and reconciliation paging.',
    );
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
