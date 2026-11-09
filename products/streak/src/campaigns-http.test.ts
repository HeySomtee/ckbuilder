import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { request } from 'node:http';
import * as ccc from '@ckb-ccc/core';
import type { CampaignPage, CampaignOptions } from '../shared/campaign-wire';
import type { Campaign } from './modules/campaigns/domain';
import type { CampaignStorage } from './modules/campaigns/storage';
import { CampaignService } from './modules/campaigns/service';
import { FiveService } from './modules/five/service';
import { MemoryFiveProfiles } from './test-support/five-profiles';
import { campaignEntryHttp } from './test-support/campaign-entry-http';

/** Actual HTTP/auth/origin handlers with an isolated synthetic campaign repository.
 * Database transactions and source-chain evidence have separate PostgreSQL/chain suites. */
class MemoryCampaigns implements CampaignStorage {
  rows = new Map<string, Campaign>();
  now = Date.now();
  async clock() {
    return this.now;
  }
  async list() {
    return structuredClone([...this.rows.values()]);
  }
  async load(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id: string, creator: string, build: (now: number) => Campaign) {
    assert.equal(this.rows.has(id), false);
    const value = build(this.now);
    assert.equal(value.creator, creator);
    this.rows.set(id, structuredClone(value));
    return value;
  }
  async change(id: string, mutate: (campaign: Campaign, now: number) => void) {
    const value = await this.load(id);
    assert.ok(value);
    mutate(value, this.now);
    value.revision++;
    this.rows.set(id, structuredClone(value));
    return value;
  }
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'streak-campaigns-http-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = join(directory, 'db.json');
  process.env.STREAK_CAMPAIGNS_ARTWORK_DIR = join(directory, 'artwork');
  process.env.STREAK_GAMES_DATA_MODE = 'api';
  process.env.MATCH_PROVIDER = 'worldcup';
  for (const name of [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_DB_URL',
    'API_SPORTS_KEY',
    'STREAK_PUBLIC_ORIGIN',
    'STREAK_CAMPAIGNS_DATABASE_URL',
    'STREAK_FIVE_DATABASE_URL',
    'STREAK_SURVIVOR_DATABASE_URL',
  ])
    delete process.env[name];
  const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const wallets = await Promise.all(
    [1, 2, 3].map(async (n) =>
      (
        await ccc.Address.fromScript(
          { codeHash: `0x${'11'.repeat(32)}`, hashType: 'type', args: `0x${String(n).repeat(40)}` },
          client,
        )
      ).toString(),
    ),
  );
  const store = new MemoryCampaigns();
  const closesAt = new Date(store.now + 3_600_000).toISOString();
  const options: CampaignOptions = {
    fixtures: [
      {
        fixtureId: 'api-football-123',
        marketId: 'market-123',
        marketKey: 'canonical-synthetic-market',
        home: 'Home',
        away: 'Away',
        league: 'Synthetic HTTP fixture',
        kickoffAt: closesAt,
        cutoffAt: closesAt,
        capacity: 32,
        occupied: 0,
        updatedAt: null,
      },
    ],
    gameweeks: [],
  };
  const service = new CampaignService(
    store,
    [wallets[0]],
    {
      options: async () => options,
      observe: async () => ({
        revision: 'synthetic',
        verifiedAt: new Date(store.now).toISOString(),
        complete: false,
        final: false,
        predictions: [],
        results: [],
        five: [],
      }),
    },
    undefined,
    undefined,
    async (fixtures) =>
      fixtures.map((fixture) => ({
        ...fixture,
        marketKey: 'untrusted-presentation-cannot-change-market',
        cutoffAt: new Date(0).toISOString(),
        capacity: 999,
        homeLogo: 'https://synthetic.invalid/home.png',
        homeForm: 'WDLWW',
        formFetchedAt: new Date(store.now).toISOString(),
      })),
  );
  // CommonJS exports are replaced only in this isolated test process; server routing is unchanged.
  const runtime: typeof import('./modules/campaigns/runtime') = require('./modules/campaigns/runtime');
  const originalService = runtime.campaignService;
  const originalReconcile = runtime.reconcileCampaigns;
  runtime.campaignService = () => service;
  runtime.reconcileCampaigns = async () => {};
  const fiveRuntime: typeof import('./modules/five/runtime') = require('./modules/five/runtime');
  const originalFive = fiveRuntime.fiveService;
  const prepared: number[] = [];
  const profiles = new MemoryFiveProfiles();
  const five = new FiveService(
    {
      clock: async () => store.now,
      list: async () => [],
      load: async () => null,
      create: async () => {
        throw Error('Unexpected Five storage write in HTTP authorization test');
      },
      change: async () => {
        throw Error('Unexpected Five storage write in HTTP authorization test');
      },
    },
    [],
    undefined,
    undefined,
    undefined,
    false,
    profiles,
  );
  five.prepareGameweek = async (event) => {
    prepared.push(event);
  };
  fiveRuntime.fiveService = () => five;
  const { server } = await import('./server');
  try {
    const { update } = await import('./store');
    const { createSession } = await import('./auth');
    await update((db) => {
      db.users = wallets.map((address, i) => ({
        id: `http-user-${i}`,
        walletIdentity: `synthetic-${i}`,
        walletType: 'ckb',
        username: ['Admin', 'Alice', 'Bob'][i],
        createdAt: new Date().toISOString(),
        wallet: { address },
        escrowShannons: '0',
        creatorFeesShannons: '0',
        streak: { current: 0, best: 0, status: 'active' },
        stats: {
          totalBets: 0,
          wonBets: 0,
          lostBets: 0,
          renews: 0,
          netPnlShannons: '0',
          turnoverShannons: '0',
        },
      }));
    });
    const cookies = await Promise.all(
      wallets.map(async (_, i) => `streak_sid=${await createSession(`http-user-${i}`)}`),
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const shell = await fetch(`${base}/season/`);
    const policy = shell.headers.get('content-security-policy') ?? '';
    assert.match(policy, /img-src[^;]*blob:/, 'local selected artwork previews are allowed');
    assert.doesNotMatch(policy, /script-src[^;]*blob:/, 'blob script execution remains denied');
    await shell.text();
    const profilePost = (body: unknown, cookie?: string, origin = base) =>
      fetch(`${base}/api/five`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    assert.equal((await fetch(`${base}/api/five?profile=1`)).status, 401);
    assert.equal(
      (await profilePost({ action: 'profile', displayName: 'Public Name' })).status,
      401,
    );
    assert.equal(
      (
        await profilePost(
          { action: 'profile', displayName: 'Public Name' },
          cookies[1],
          'https://attacker.invalid',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await profilePost(
          {
            action: 'profile',
            displayName: '<script>evil</script>',
            expectedAccountId: 'http-user-1',
          },
          cookies[1],
        )
      ).status,
      400,
    );
    const named = await profilePost(
      {
        action: 'profile',
        displayName: '  Cafe\u0301   United ',
        accountId: 'http-user-0',
        expectedAccountId: 'http-user-1',
      },
      cookies[1],
    );
    assert.equal(named.status, 200);
    const namedData = await named.json();
    assert.equal(namedData.profile.displayName, 'Café United');
    assert.equal(namedData.viewerId, 'http-user-1');
    assert.equal((await profiles.get('http-user-1'))?.displayName, 'Café United');
    assert.equal(
      await profiles.get('http-user-0'),
      null,
      'body identity cannot change another manager profile',
    );
    const ownProfile = await fetch(`${base}/api/five?profile=1&accountId=http-user-1`, {
      headers: { cookie: cookies[2] },
    });
    assert.deepEqual(
      await ownProfile.json(),
      { viewerId: 'http-user-2', profile: null },
      'profile read identifies the actual session owner for account-scoped caches',
    );
    const beforeSessionChange = await profiles.get('http-user-1');
    assert.equal(
      (
        await profilePost(
          {
            action: 'profile',
            displayName: 'Wrong Account Rename',
            expectedAccountId: 'http-user-1',
          },
          cookies[2],
        )
      ).status,
      409,
      'a stale tab cannot rename a newly signed-in account',
    );
    assert.equal(
      (await profilePost({ action: 'profile', displayName: 'Missing Owner' }, cookies[1])).status,
      409,
      'profile writes require the explicit expected session identity',
    );
    assert.equal(await profiles.get('http-user-2'), null);
    assert.deepEqual(
      await profiles.get('http-user-1'),
      beforeSessionChange,
      'rejected profile writes cannot mutate either account',
    );
    const staleScope = await fetch(`${base}/api/five?profile=1&data=test`, {
      headers: { cookie: cookies[1] },
    });
    assert.equal(staleScope.status, 409, 'profile reads respect pinned game data scope');
    const get = (query = '', cookie?: string) =>
      fetch(`${base}/api/campaigns${query}`, { headers: cookie ? { cookie } : {} });
    const post = (body: unknown, cookie?: string, origin = base) =>
      fetch(`${base}/api/campaigns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    const page = async (response: Response): Promise<CampaignPage> => {
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body as CampaignPage;
    };
    const first = await get();
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await page(first)).campaigns, []);
    assert.equal((await get('?action=options')).status, 403);
    assert.equal((await get('?action=options', cookies[1])).status, 403);
    assert.equal((await post({ action: 'create' })).status, 403);
    assert.equal(
      (await post({ action: 'create' }, cookies[0], 'https://attacker.invalid')).status,
      403,
    );
    assert.equal(
      (await post({ action: 'create', actor: { id: 'http-user-0' } }, cookies[1])).status,
      403,
    );
    const setup = await get('?action=options', cookies[0]);
    assert.equal(setup.status, 200);
    assert.deepEqual(await setup.json(), options);
    assert.equal((await post({ action: 'prepare-gameweek', event: 11 })).status, 403);
    assert.equal((await post({ action: 'prepare-gameweek', event: 11 }, cookies[1])).status, 403);
    assert.equal(
      (
        await post(
          { action: 'prepare-gameweek', event: 11 },
          cookies[0],
          'https://attacker.invalid',
        )
      ).status,
      403,
    );
    assert.equal((await post({ action: 'prepare-gameweek', event: 39 }, cookies[0])).status, 400);
    assert.deepEqual(prepared, [], 'unauthorized and malformed requests cannot prepare a gameweek');
    const preparation = await post({ action: 'prepare-gameweek', event: 11 }, cookies[0]);
    assert.equal(preparation.status, 200);
    assert.deepEqual(await preparation.json(), options);
    assert.deepEqual(
      prepared,
      [11],
      'admin preparation delegates to the real Five service boundary',
    );
    const draft = {
      name: 'HTTP rehearsal',
      description: 'Synthetic HTTP boundary coverage',
      kind: 'predictions',
      registrationClosesAt: closesAt,
      fixtureIds: ['api-football-123'],
      fiveRoundId: null,
      prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '10' }],
      rehearsal: true,
    };
    let created = await page(
      await post({ action: 'create', id: 'http-campaign', draft }, cookies[0]),
    );
    assert.equal(created.detail?.state, 'draft');
    assert.equal(
      JSON.stringify(created.detail?.artwork),
      JSON.stringify({ icon: null, banner: null }),
    );
    const raster = await sharp({
      create: { width: 256, height: 256, channels: 3, background: '#11281d' },
    })
      .png()
      .toBuffer();
    const upload = (
      revision: number,
      cookie?: string,
      origin = base,
      bytes = raster,
      extra: Record<string, string> = {},
    ) =>
      fetch(
        `${base}/api/campaigns?action=upload-artwork&id=http-campaign&slot=icon&revision=${revision}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'image/png',
            'x-streak-account-id': cookie === cookies[1] ? 'http-user-1' : 'http-user-0',
            origin,
            ...(cookie ? { cookie } : {}),
            ...extra,
          },
          body: new Uint8Array(bytes),
        },
      );
    assert.equal((await upload(created.detail!.revision)).status, 403);
    assert.equal((await upload(created.detail!.revision, cookies[1])).status, 403);
    assert.equal(
      (await upload(created.detail!.revision, cookies[0], 'https://attacker.invalid')).status,
      403,
    );
    assert.equal((await upload(created.detail!.revision, cookies[0], '')).status, 403);
    assert.equal(
      (
        await upload(created.detail!.revision, cookies[0], base, raster, {
          'sec-fetch-site': 'cross-site',
        })
      ).status,
      403,
    );
    assert.equal((await upload(99, cookies[0])).status, 409);
    assert.equal(
      (
        await fetch(
          `${base}/api/campaigns?action=upload-artwork&id=http-campaign&slot=icon&revision=${created.detail!.revision}&expectedAccountId=http-user-0`,
          {
            method: 'POST',
            headers: { 'content-type': 'image/png', origin: base, cookie: cookies[0] },
            body: new Uint8Array(raster),
          },
        )
      ).status,
      409,
      'account binding must come from the private header, never a URL parameter',
    );
    assert.equal(
      (
        await fetch(
          `${base}/api/campaigns?action=upload-artwork&id=http-campaign&slot=icon&revision=${created.detail!.revision}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'image/png',
              'x-streak-account-id': 'http-user-1',
              origin: base,
              cookie: cookies[0],
            },
            body: new Uint8Array(raster),
          },
        )
      ).status,
      409,
      'a stale account cannot upload with a newly signed-in cookie',
    );
    assert.equal(
      (await upload(created.detail!.revision, cookies[0], base, Buffer.from('<svg/>'))).status,
      415,
    );
    assert.equal(
      (
        await upload(created.detail!.revision, cookies[0], base, raster, {
          'content-encoding': 'gzip',
        })
      ).status,
      415,
    );
    const oversizedStatus = await new Promise<number>((done, reject) => {
      const req = request(
        `${base}/api/campaigns?action=upload-artwork&id=http-campaign&slot=icon&revision=${created.detail!.revision}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'image/png',
            'x-streak-account-id': 'http-user-0',
            origin: base,
            cookie: cookies[0],
            'content-length': String(3 * 1024 * 1024 + 1),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => done(res.statusCode!));
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(
      oversizedStatus,
      413,
      'oversized declared length is rejected before reading its body',
    );
    created = await page(await upload(created.detail!.revision, cookies[0]));
    const iconUrl = created.detail!.artwork!.icon!.url;
    const iconRead = await fetch(base + iconUrl);
    assert.equal(iconRead.status, 200);
    assert.equal(iconRead.headers.get('content-type'), 'image/webp');
    assert.match(iconRead.headers.get('cache-control') ?? '', /immutable/);
    await iconRead.arrayBuffer();
    assert.equal(
      (
        await fetch(`${base}/api/five?action=upload-artwork`, {
          method: 'POST',
          headers: { 'content-type': 'image/png', origin: base, cookie: cookies[0] },
          body: new Uint8Array(raster),
        })
      ).status,
      403,
      'binary upload exception cannot apply to another API',
    );
    assert.equal((await page(await get())).campaigns.length, 0);
    assert.equal((await get('?id=http-campaign')).status, 404, 'draft detail is private');
    created = await page(
      await post(
        { action: 'publish', id: 'http-campaign', revision: created.detail!.revision },
        cookies[0],
      ),
    );
    const termsHash = created.detail!.termsHash;
    const beforeArtwork = structuredClone(store.rows.get('http-campaign'))!;
    assert.equal(
      (
        await post(
          {
            action: 'remove-artwork',
            id: 'http-campaign',
            slot: 'icon',
            revision: created.detail!.revision,
            expectedAccountId: 'http-user-1',
          },
          cookies[0],
        )
      ).status,
      409,
    );
    created = await page(
      await post(
        {
          action: 'remove-artwork',
          id: 'http-campaign',
          slot: 'icon',
          revision: created.detail!.revision,
          expectedAccountId: 'http-user-0',
        },
        cookies[0],
      ),
    );
    assert.equal(created.detail!.artwork!.icon, null);
    assert.equal(
      created.detail!.termsHash,
      termsHash,
      'removing artwork after publication cannot alter terms',
    );
    assert.deepEqual(store.rows.get('http-campaign')!.draft, beforeArtwork.draft);
    assert.equal(
      (await fetch(base + iconUrl)).status,
      200,
      'replacement/removal preserves immutable URLs',
    );
    assert.equal((await page(await get())).campaigns[0].rehearsal, true);
    assert.equal(
      (await post({ action: 'join', id: 'http-campaign', termsHash: 'wrong' }, cookies[1])).status,
      409,
    );
    const joined = await page(
      await post(
        {
          action: 'join',
          id: 'http-campaign',
          termsHash,
          accountId: 'http-user-0',
          wallet: wallets[0],
          ownerHash: `0x${'00'.repeat(32)}`,
        },
        cookies[1],
      ),
    );
    assert.equal(joined.detail!.own!.rank, 1, 'registration creates a ranked zero-point entry');
    assert.equal(joined.detail!.own!.points, 0);
    assert.equal(
      store.rows.get('http-campaign')!.entries[0].accountId,
      'http-user-1',
      'the authenticated session, never submitted owner fields, owns the entry',
    );
    await page(await post({ action: 'join', id: 'http-campaign', termsHash }, cookies[2]));
    const publicResponse = await get('?id=http-campaign');
    const publicText = await publicResponse.text();
    assert.equal(publicResponse.status, 200);
    for (const privateValue of [
      ...wallets,
      'http-user-0',
      'http-user-1',
      'http-user-2',
      'ownerHash',
      'accountId',
      'adminEntries',
      'walletIdentity',
    ])
      assert.equal(
        publicText.includes(privateValue),
        false,
        `public detail excludes ${privateValue}`,
      );
    assert.equal(JSON.parse(publicText).detail.leaderboard.length, 2);
    const publicFixture = (JSON.parse(publicText) as CampaignPage).detail!.fixtures[0];
    assert.equal(publicFixture.homeLogo, 'https://synthetic.invalid/home.png');
    assert.equal(publicFixture.homeForm, 'WDLWW');
    assert.equal(publicFixture.marketKey, options.fixtures[0].marketKey);
    assert.equal(publicFixture.cutoffAt, options.fixtures[0].cutoffAt);
    assert.equal(
      publicFixture.capacity,
      32,
      'presentation cannot alter paid-market identity or limits',
    );
    assert.equal(
      (JSON.parse(publicText) as CampaignPage).detail!.predictionEntryPolicy,
      'explicit-entry-v3',
    );
    assert.deepEqual(
      (JSON.parse(publicText) as CampaignPage).detail!.leaderboard.map((row) => row.name).sort(),
      wallets
        .slice(1)
        .map((wallet) => `${wallet.slice(0, 8)}\u2026${wallet.slice(-6)}`)
        .sort(),
      'prediction standings show short verified wallets instead of login usernames',
    );
    assert.equal((await get('?id=http-campaign&offset=-1')).status, 400);
    assert.equal((await get('?action=export&id=http-campaign')).status, 403);
    assert.equal((await get('?action=export&id=http-campaign', cookies[1])).status, 403);
    const exported = await get('?action=export&id=http-campaign', cookies[0]);
    assert.match(exported.headers.get('content-disposition') ?? '', /evidence\.json/);
    const evidence = (await exported.json()) as {
      metrics: { registeredAccounts: number; includedInCommunityEvidence: boolean };
    };
    assert.equal(evidence.metrics.registeredAccounts, 2);
    assert.equal(evidence.metrics.includedInCommunityEvidence, false);
    const csv = await get('?action=export&id=http-campaign&format=csv', cookies[0]);
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
    assert.match(await csv.text(), /"rehearsal"/);
    assert.equal(
      (
        await post(
          {
            action: 'record-payout',
            id: 'http-campaign',
            publicId: joined.detail!.own!.publicId,
            transactionHash: `0x${'11'.repeat(32)}`,
            outputIndex: 0,
          },
          cookies[1],
        )
      ).status,
      403,
      'non-admin payout requests are denied before any chain access',
    );
    const current = await page(await get('?id=http-campaign', cookies[0]));
    assert.equal(
      (
        await post(
          {
            action: 'delete',
            id: 'http-campaign',
            revision: current.detail!.revision,
            confirmName: 'mistyped',
          },
          cookies[0],
        )
      ).status,
      400,
    );
    await page(
      await post(
        {
          action: 'delete',
          id: 'http-campaign',
          revision: current.detail!.revision,
          confirmName: draft.name,
        },
        cookies[0],
      ),
    );
    assert.equal(
      (await page(await get())).campaigns.length,
      0,
      'deleted competition leaves public discovery',
    );
    const retained = await page(await get('?id=http-campaign', cookies[1]));
    assert.equal(retained.detail?.state, 'deleted');
    assert.equal(retained.detail?.registeredCount, 2, 'entrants retain history after archival');
    assert.equal((await get('?action=export&id=http-campaign', cookies[0])).status, 200);
    console.log(
      'Campaign HTTP: actual auth/origin guards, administrator routes, ranked registration, public privacy, labelled exports and archival passed.',
    );
    await campaignEntryHttp(base, cookies[1], wallets[1]);
  } finally {
    runtime.campaignService = originalService;
    runtime.reconcileCampaigns = originalReconcile;
    fiveRuntime.fiveService = originalFive;
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((done, reject) => server.close((e) => (e ? reject(e) : done())));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('streak-campaigns-http-'));
    rmSync(directory, { recursive: true, force: true });
  }
}
void main();
