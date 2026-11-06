/** Imported only by the guarded, disposable-schema PostgreSQL test harness. */
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import type { Match, StreakDB } from './types';

export async function fixtureSyncPostgresChecks(probe: Client): Promise<void> {
  const store = await import('./store');
  const pg = await import('./store_pg');
  const markets = await import('./markets');
  const { provider } = await import('./providers');
  const game = await import('./game');
  const now = Date.now();
  const past = new Date(now - 3_600_000).toISOString();
  const future = new Date(now + 86_400_000).toISOString();
  const fixture = (id: string, kickoff = past): Match => ({
    id,
    date: kickoff.slice(0, 10),
    kickoff,
    status: 'scheduled',
    stage: 'Synthetic efficiency check',
    home: { code: 'HOM', name: 'Home', flag: '' },
    away: { code: 'AWY', name: 'Away', flag: '' },
  });
  const fixtures = [
    fixture('eff-a-win'),
    fixture('eff-b-refund'),
    fixture('eff-c-cancel'),
    fixture('eff-d-postpone', future),
    ...Array.from({ length: 70 }, (_, index) =>
      fixture(`eff-future-${String(index).padStart(3, '0')}`, future),
    ),
    fixture('eff-z-winlater'),
  ];
  const original = {
    fetchResults: provider.fetchResults,
    loadFixtures: provider.loadFixtures,
    prefetchInsights: provider.prefetchInsights,
    allowSimulatedFallback: provider.allowSimulatedFallback,
    peekInsights: provider.peekInsights,
    pendingReceiptIds: store.pendingReceiptIds,
  };
  const balanceBefore = new Map<string, bigint>();
  const committedQuery = async () =>
    (
      await probe.query(
        'select id,escrow_shannons,creator_fees_shannons,streak,stats from users order by id',
      )
    ).rows;
  try {
    await store.update((db) => {
      db.matches.push(...structuredClone(fixtures));
      const archived = fixture('eff-z-archived');
      archived.status = 'final';
      archived.result = 'home';
      db.matches.push(archived);
      const old = new Date(now - 4 * 86_400_000).toISOString();
      db.matches.push(
        { ...fixture('epl-s-empty-eff', old), status: 'final', result: 'home' },
        { ...fixture('epl-s-funded-eff', old), status: 'final', result: 'home' },
      );
      markets.ensureMarketsForMatches(db);
      for (const market of db.markets) {
        if (['eff-z-archived', 'epl-s-empty-eff', 'epl-s-funded-eff'].includes(market.matchId)) {
          market.status = 'resolved';
          market.resolvedOutcome = 'home';
          market.resolvedAt = old;
        }
        if (market.matchId === 'eff-d-postpone') {
          market.status = 'closed';
          market.closesAt = past;
          db.matches.find((match) => match.id === market.matchId)!.kickoff = past;
        }
      }
      const addBet = (
        id: string,
        matchId: string,
        userId: string,
        outcome: 'home' | 'away',
        stake: string,
        settled = false,
      ) => {
        const market = db.markets.find((row) => row.matchId === matchId)!;
        db.bets.push({
          id,
          marketId: market.id,
          matchId,
          userId,
          outcome,
          amount: stake,
          placedAt: past,
          priceAtBet: 0.5,
          settled,
        });
        market.pools[outcome] = (BigInt(market.pools[outcome]) + BigInt(stake)).toString();
        market.totalBets += 1;
      };
      addBet('eff-win', 'eff-a-win', 'alice', 'home', '10000000000');
      db.bets.find((bet) => bet.id === 'eff-win')!.isStreakPick = true;
      addBet('eff-loss', 'eff-a-win', 'bob', 'away', '10000000000');
      addBet('eff-refund', 'eff-b-refund', 'bob', 'home', '3000000000');
      addBet('eff-cancel', 'eff-c-cancel', 'bob', 'home', '2000000000');
      addBet('eff-later-loss', 'eff-z-winlater', 'alice', 'home', '1000000000');
      addBet('eff-later-win', 'eff-z-winlater', 'bob', 'away', '1000000000');
      addBet('eff-funded-history', 'epl-s-funded-eff', 'alice', 'home', '1', true);
      addBet('eff-archived-history', 'eff-z-archived', 'alice', 'home', '1', true);
      db.markets.find((row) => row.matchId === 'eff-a-win')!.creatorId = 'bob';
      for (const user of db.users) balanceBefore.set(user.id, BigInt(user.escrowShannons));
    });
    await probe.query("update users set stats='{}'::jsonb,streak='{}'::jsonb where id='alice'");
    const untouched = (
      await probe.query("select id,xmin::text as version from matches where id='eff-z-archived'")
    ).rows;
    const beforeLedger = (
      await probe.query('select id,xmin::text as version from deposits order by id')
    ).rows;
    const feesBefore = BigInt(
      (await probe.query('select protocol_fees from streak_meta')).rows[0].protocol_fees,
    );
    const savedTreasury = (await probe.query('select treasury from streak_meta')).rows[0].treasury;
    provider.fetchResults = async () => ({
      'eff-a-win': { home: 2, away: 0, live: false, finished: true, result: 'home' },
      'eff-b-refund': { home: 0, away: 1, live: false, finished: true, result: 'away' },
      'eff-c-cancel': { home: 0, away: 0, live: false, finished: false, voided: true },
      'eff-z-winlater': { home: 0, away: 2, live: false, finished: true, result: 'away' },
    });
    provider.loadFixtures = () => structuredClone(fixtures);
    provider.prefetchInsights = undefined;
    provider.peekInsights = undefined;
    Object.assign(provider, { allowSimulatedFallback: false });
    // Chain publication is a separate boundary. It must never run in this SQL
    // regression, including for fixtures inherited from the surrounding suite.
    store.pendingReceiptIds = async () => [];

    const originalLoad = pg.pgLoadDB;
    let broadLoads = 0;
    pg.pgLoadDB = async () => {
      broadLoads += 1;
      return originalLoad();
    };
    try {
      const slate = await game.syncMatches();
      assert.ok(slate.some((match) => match.id === 'eff-a-win'));
      assert.equal(
        broadLoads,
        0,
        'The actual fixture tick and idle receipt path never load the whole store.',
      );
    } finally {
      pg.pgLoadDB = originalLoad;
    }

    const settled = (await probe.query("select * from markets where match_id='eff-a-win'")).rows[0];
    const protocolFee = (10_000_000_000n * BigInt(settled.fee_bps.protocol)) / 10_000n;
    const creatorFee = (10_000_000_000n * BigInt(settled.fee_bps.creator)) / 10_000n;
    const laterFees =
      (1_000_000_000n * BigInt(settled.fee_bps.protocol)) / 10_000n +
      (1_000_000_000n * BigInt(settled.fee_bps.creator)) / 10_000n;
    const winnerPayout = 20_000_000_000n - protocolFee - creatorFee;
    const users = await committedQuery();
    const legacyWinner = users.find((row) => row.id === 'alice');
    assert.equal(
      legacyWinner.stats.wonBets,
      1,
      'Partial historical stats receive the same backfill as full reads.',
    );
    assert.equal(legacyWinner.stats.lostBets, 1);
    assert.equal(legacyWinner.streak.current, 1);
    assert.equal(legacyWinner.streak.best, 1);
    assert.equal(legacyWinner.streak.status, 'active');
    assert.equal(
      BigInt(users.find((row) => row.id === 'alice').escrow_shannons),
      balanceBefore.get('alice')! + winnerPayout,
    );
    assert.equal(
      BigInt(users.find((row) => row.id === 'bob').escrow_shannons),
      balanceBefore.get('bob')! + creatorFee + 7_000_000_000n - laterFees,
    );
    assert.equal(
      BigInt((await probe.query('select protocol_fees from streak_meta')).rows[0].protocol_fees),
      feesBefore + protocolFee + laterFees,
    );
    assert.deepEqual(
      (await probe.query('select treasury from streak_meta')).rows[0].treasury,
      savedTreasury,
    );
    assert.equal(
      (await probe.query("select status from markets where match_id='eff-d-postpone'")).rows[0]
        .status,
      'open',
    );
    assert.equal(
      (await probe.query("select id from markets where match_id='epl-s-empty-eff'")).rowCount,
      0,
    );
    assert.equal(
      (await probe.query("select id from markets where match_id='epl-s-funded-eff'")).rowCount,
      1,
    );
    assert.deepEqual(
      (await probe.query("select id,xmin::text as version from matches where id='eff-z-archived'"))
        .rows,
      untouched,
    );
    assert.deepEqual(
      (await probe.query('select id,xmin::text as version from deposits order by id')).rows,
      beforeLedger,
    );

    const versions = async () =>
      (
        await probe.query(
          `select 'users' as source,id,xmin::text as version from users union all
       select 'markets',id,xmin::text from markets union all select 'matches',id,xmin::text from matches
       union all select 'meta',id,xmin::text from streak_meta order by source,id`,
        )
      ).rows;
    const stable = await versions();
    await game.syncMatches();
    assert.deepEqual(
      await versions(),
      stable,
      'Unchanged fixtures/results produce zero row updates and cannot pay twice.',
    );
    assert.deepEqual(await committedQuery(), users);

    const selection = {
      fixtureIds: fixtures.map((row) => row.id),
      resultIds: [],
      matchesSchema: 3,
      pruneBefore: new Date(now - 2 * 86_400_000).toISOString(),
    };
    let pages = 0;
    await assert.rejects(
      store.updateFixtureRecords(selection, (db, ids) => {
        assert.ok(ids && ids.size <= 64);
        assert.equal(
          db.deposits.length + db.withdraws.length + db.crews.length + (db.renewalTxs?.length ?? 0),
          0,
        );
        assert.ok(!db.bets.some((bet) => bet.id === 'eff-archived-history'));
        if (++pages === 2) throw new Error('Synthetic failure on second page');
        db.matches[0].home.name = 'Must roll back';
        db.protocolFeesShannons = (BigInt(db.protocolFeesShannons) + 1n).toString();
      }),
      /second page/,
    );
    assert.equal(pages, 2);
    assert.deepEqual(
      await versions(),
      stable,
      'A later page failure rolls back earlier rows and fees.',
    );

    // The targeted transaction cannot race an existing queued money mutation.
    await Promise.all([
      store.update((db) => {
        db.users.find((row) => row.id === 'alice')!.escrowShannons = '12345678901234567890';
      }),
      game.syncMatches(),
      store.update((db) => {
        const user = db.users.find((row) => row.id === 'alice')!;
        user.escrowShannons = (BigInt(user.escrowShannons) + 1n).toString();
      }),
    ]);
    assert.equal(
      await store.read((db) => db.users.find((row) => row.id === 'alice')!.escrowShannons),
      '12345678901234567891',
    );

    // A full read started before a targeted commit cannot republish its old
    // state or self-await indefinitely when the partial mutation clears cache.
    let unblock!: () => void;
    let loaded!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const started = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    let first = true;
    pg.pgLoadDB = async () => {
      const db = await originalLoad();
      if (first) {
        first = false;
        loaded();
        await gate;
      }
      return db;
    };
    try {
      const loading = store.loadDB();
      await started;
      await store.updateFixtureRecords(selection, (db) => {
        const match = db.matches.find((row) => row.id === 'eff-future-000');
        if (match) match.home.name = 'Committed after old read';
      });
      unblock();
      const refreshed = await Promise.race([
        loading,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Snapshot invalidation self-awaited')),
            2000,
          );
          timer.unref();
        }),
      ]);
      assert.equal(
        refreshed.matches.find((row) => row.id === 'eff-future-000')!.home.name,
        'Committed after old read',
      );
    } finally {
      unblock();
      pg.pgLoadDB = originalLoad;
    }

    const receiptSource = await store.readReceiptSource('m-eff-a-win');
    assert.ok(receiptSource);
    assert.equal(receiptSource.matches.length, 1);
    assert.equal(receiptSource.bets.length, 2);
    assert.equal(receiptSource.users.length, 0);
    assert.equal(receiptSource.deposits.length, 0);
    assert.ok((await pg.pgPendingReceiptIds()).includes('m-eff-a-win'));
    const { buildReceiptPayload } = await import('./settlement');
    const built = buildReceiptPayload(
      receiptSource,
      receiptSource.markets[0],
      receiptSource.treasury!,
    );
    const receipt = {
      txHash: '0x' + 'f'.repeat(64),
      index: 0,
      payloadHash: built.payloadHash,
      merkleRoot: built.payload.bets.merkleRoot,
      publishedAt: new Date().toISOString(),
    };
    await store.savePublishedReceipt('m-eff-a-win', receipt, built.payload);
    assert.equal(await store.readReceiptSource('m-eff-a-win'), null);
    assert.equal((await store.readReceipt('m-eff-a-win'))?.marketId, 'm-eff-a-win');
    assert.deepEqual(
      await store.read(
        (db: StreakDB) => db.markets.find((row) => row.id === 'm-eff-a-win')!.receipt,
      ),
      receipt,
    );
    await store.update((db) => {
      db.matches.push(
        ...Array.from({ length: 150 }, (_, index) =>
          fixture(`eff-receipt-${String(index).padStart(3, '0')}`),
        ),
      );
      markets.ensureMarketsForMatches(db);
      for (const market of db.markets) {
        if (market.matchId.startsWith('eff-receipt-')) {
          market.status = 'void';
          market.resolvedAt = past;
        }
      }
    });
    const outstanding = (
      await probe.query(
        "select id from markets where status in ('resolved','void') and receipt_ref is null order by id",
      )
    ).rows.map((row) => row.id as string);
    assert.ok(outstanding.length > 128);
    const seen = new Set<string>();
    for (let pass = 0; pass <= Math.ceil(outstanding.length / 64); pass++) {
      const page = await pg.pgPendingReceiptIds();
      assert.equal(page.length, 64, 'Receipt scans keep their per-pass bound.');
      assert.equal(new Set(page).size, page.length, 'A wrapped page never repeats a market.');
      for (const id of page) seen.add(id);
      // Leave every row pending, simulating permanent publication failures in
      // the first page. Later receipts must still receive a publication attempt.
    }
    assert.deepEqual(
      [...seen].sort(),
      [...outstanding].sort(),
      'Unpublished first-page receipts cannot starve later pending markets.',
    );
    assert.equal(
      (
        await probe.query(
          "select count(*)::int as pending from markets where status in ('resolved','void') and receipt_ref is null",
        )
      ).rows[0].pending,
      outstanding.length,
      'Cursor advancement never marks an unpublished receipt complete.',
    );
    await pg.closePool();
    assert.deepEqual(
      await pg.pgPendingReceiptIds(),
      outstanding.slice(0, 64),
      'A fresh connection lifecycle starts with the first pending page.',
    );
    assert.equal(await pg.pgHasPendingWithdrawals(), false);
    await probe.query(
      "insert into withdraws (id,user_id,amount_shannons,at,status) values ('eff-recovery','alice',1,now(),'pending')",
    );
    assert.equal(await pg.pgHasPendingWithdrawals(), true);
    await probe.query("update withdraws set status='failed' where id='eff-recovery'");
    assert.equal(await pg.pgHasPendingWithdrawals(), false);
    console.log(
      'Targeted PostgreSQL fixture sync passed: no broad loads, exact payouts/refunds/fees, no-change writes, paged rollback, queue/cache races, receipt scope and fair retry pages.',
    );
  } finally {
    Object.assign(provider, {
      fetchResults: original.fetchResults,
      loadFixtures: original.loadFixtures,
      prefetchInsights: original.prefetchInsights,
      allowSimulatedFallback: original.allowSimulatedFallback,
      peekInsights: original.peekInsights,
    });
    store.pendingReceiptIds = original.pendingReceiptIds;
  }
}
