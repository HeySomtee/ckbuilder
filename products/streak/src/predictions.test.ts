import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Match, Market, StreakDB } from './types';

async function main() {
  const temp = mkdtempSync(join(tmpdir(), 'streak-predictions-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = join(temp, 'db.json');
  // Exercise persisted reads so fixtures cannot depend on the store cache TTL.
  process.env.STORE_READ_TTL_MS = '0';
  process.env.MATCH_PROVIDER = 'worldcup';
  for (const key of [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_DB_URL',
    'API_SPORTS_KEY',
    'TELEGRAM_BOT_TOKEN',
  ])
    delete process.env[key];
  const realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.hostname !== '127.0.0.1') throw Error('External service forbidden');
    return realFetch(input, init);
  };
  try {
    const { DB_SCHEMA } = await import('./config');
    const { findPublicPredictionMarket, InvalidSlip, parseAmount, parseSlip, reviewPredictions } =
      await import('./modules/predictions/review');

    const now = Date.now();
    const kickoff = new Date(now + 3_600_000).toISOString();
    const match: Match = {
      id: 'prediction-fixture',
      date: kickoff.slice(0, 10),
      kickoff,
      stage: 'Test',
      status: 'scheduled',
      home: { name: 'Home', code: 'HOM', flag: '' },
      away: { name: 'Away', code: 'AWY', flag: '' },
      oracle: { provider: 'test', fixtureId: 'fixture-1', source: 'synthetic' },
    };
    const market: Market = {
      id: 'prediction-market',
      matchId: match.id,
      creatorId: 'private-creator',
      status: 'open',
      createdAt: new Date(now).toISOString(),
      closesAt: kickoff,
      pools: { home: '0', draw: '0', away: '0' },
      totalBets: 0,
      uniqueBettors: 0,
      history: [],
      feeBps: { protocol: 200, creator: 100 },
    };
    const base: StreakDB = {
      schema: DB_SCHEMA,
      users: [],
      matches: [match],
      markets: [market],
      bets: [],
      deposits: [],
      withdraws: [],
      protocolFeesShannons: '0',
      receipts: [],
      crews: [],
    };
    const draft = {
      v: 1,
      revision: 'draft-1',
      picks: [
        {
          lineId: 'line-1',
          marketId: market.id,
          matchId: match.id,
          outcome: 'home',
          amountCkb: '10.00000001',
        },
      ],
    };
    const active = (row: Match) => row.id !== 'retired';
    const review = (db = base, body: unknown = draft, time = now) =>
      reviewPredictions(db, parseSlip(body), active, time);
    assert.equal(parseAmount('0.00000001'), 1n);
    for (const invalid of [
      '',
      '1e2',
      '-1',
      'NaN',
      '10.000000001',
      ' 10',
      '10.',
      '01',
      '1'.repeat(33),
    ])
      assert.equal(parseAmount(invalid), null);
    assert.throws(() => parseSlip({ ...draft, picks: [] }), InvalidSlip);
    assert.throws(() => parseSlip({ ...draft, picks: Array(9).fill(draft.picks[0]) }), InvalidSlip);
    assert.throws(
      () => parseSlip({ ...draft, picks: [draft.picks[0], draft.picks[0]] }),
      InvalidSlip,
    );
    assert.throws(
      () => parseSlip({ ...draft, picks: [{ ...draft.picks[0], amountCkb: 10 }] }),
      InvalidSlip,
    );
    assert.throws(
      () => parseSlip({ ...draft, picks: [{ ...draft.picks[0], outcome: ['home'] }] }),
      InvalidSlip,
    );
    const initial = JSON.stringify(base);
    assert.equal(review().valid, true);
    assert.equal(review().totalPrincipalShannons, '1000000001');
    assert.equal(review().paymentAvailable, false);
    assert.equal(Date.parse(review().expiresAt), now + 30_000);
    assert.equal(JSON.stringify(base), initial, 'Review must not mutate ledger state.');
    for (const amountCkb of ['9.99999999', '100000.00000001', '0', 'bad']) {
      const result = review(base, { ...draft, picks: [{ ...draft.picks[0], amountCkb }] });
      assert.equal(result.valid, false);
      if (amountCkb === 'bad') assert.equal(result.totalPrincipalShannons, null);
    }
    for (const state of ['live', 'postponed', 'cancelled', 'suspended', 'final'] as const)
      assert.equal(review({ ...base, matches: [{ ...match, status: state }] }).valid, false);
    assert.equal(
      review(base, draft, Date.parse(kickoff)).valid,
      false,
      'Kickoff equality closes admission.',
    );
    const earlier = { ...base, markets: [{ ...market, closesAt: new Date(now).toISOString() }] };
    assert.equal(review(earlier).valid, false);
    assert.equal(review({ ...base, matches: [{ ...match, oracle: undefined }] }).valid, false);
    assert.equal(
      review(base, { ...draft, picks: [{ ...draft.picks[0], matchId: 'wrong-fixture' }] }).valid,
      false,
    );
    const aliasMatch = { ...match, id: 'alias' };
    const aliasMarket = { ...market, id: 'alias-market', matchId: aliasMatch.id };
    const aliasDraft = {
      ...draft,
      picks: [
        ...draft.picks,
        { ...draft.picks[0], lineId: 'line-2', matchId: aliasMatch.id, marketId: aliasMarket.id },
      ],
    };
    const aliases = review(
      { ...base, matches: [match, aliasMatch], markets: [market, aliasMarket] },
      aliasDraft,
    );
    assert.equal(aliases.valid, false);
    assert.equal(aliases.lines.length, 2);
    assert.ok(
      aliases.lines.every((line) => line.errors.some((error) => error.includes('only one'))),
    );
    assert.equal(aliases.totalPrincipalShannons, '2000000002');
    const eight = {
      ...draft,
      picks: Array.from({ length: 8 }, (_, index) => ({
        ...draft.picks[0],
        lineId: `line-${index}`,
        marketId: index === 0 ? market.id : `missing-${index}`,
      })),
    };
    assert.equal(review(base, eight).lines.length, 8);
    assert.equal(review(base, eight).valid, false);
    const first = findPublicPredictionMarket(base, market.id, active, now)!;
    const changed = findPublicPredictionMarket(
      { ...base, markets: [{ ...market, feeBps: { protocol: 300, creator: 100 } }] },
      market.id,
      active,
      now,
    )!;
    assert.notEqual(first.termsId, changed.termsId);
    assert.equal(
      findPublicPredictionMarket(base, market.id, () => false, now),
      null,
    );
    assert.equal(JSON.stringify(first).includes('private-creator'), false);
    assert.equal('myPositions' in first.market, false);

    async function httpChecks() {
      const { update, read } = await import('./store');
      const { provider } = await import('./providers');
      provider.ownsMatch = () => true;
      await update((db) => Object.assign(db, structuredClone(base)));
      const { server } = await import('./server');
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        const before = await read((db) => JSON.stringify(db));
        const anonymous = (await (
          await fetch(`${root}/api/markets/${market.id}/public`)
        ).json()) as typeof first;
        const withCookie = (await (
          await fetch(`${root}/api/markets/${market.id}/public`, {
            headers: { cookie: 'streak_sid=invalid' },
          })
        ).json()) as typeof first;
        assert.deepEqual(anonymous.market, withCookie.market);
        assert.deepEqual(anonymous.terms, withCookie.terms);
        const response = await fetch(`${root}/api/slips/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        assert.equal(response.status, 200);
        const reviewed = (await response.json()) as { valid: boolean };
        assert.equal(reviewed.valid, true, JSON.stringify(reviewed));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(
          (
            await fetch(`${root}/api/slips/review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{',
            })
          ).status,
          400,
        );
        assert.equal((await fetch(`${root}/api/markets/missing/public`)).status, 404);
        assert.equal((await fetch(`${root}/api/markets/%ZZ/public`)).status, 400);
        provider.ownsMatch = undefined;
        assert.equal((await fetch(`${root}/api/markets/${market.id}/public`)).status, 404);
        const inactive = await fetch(`${root}/api/slips/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        assert.equal(
          ((await inactive.json()) as { valid: boolean }).valid,
          false,
          'A provider without ownership verification fails closed.',
        );
        provider.ownsMatch = () => true;
        assert.equal(
          await read((db) => JSON.stringify(db)),
          before,
          'Public detail and review cannot create bets, deposits or balances.',
        );
      } finally {
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
      }
    }
    await httpChecks();
    console.log(
      'Predictions passed: exact amounts, whole-slip validation, identity, cutoff, immutable ledger, public-only DTO and HTTP review.',
    );
  } finally {
    global.fetch = realFetch;
    assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
    assert.ok(basename(temp).startsWith('streak-predictions-'));
    rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
