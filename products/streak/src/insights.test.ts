import assert from "assert/strict";

import {
  consensusFromApiOdds,
  mapApiCoverage,
  mapApiHeadToHead,
  mapApiPrediction,
  mapApiStandings,
} from "./providers/football";
import {
  composeMarketInsights,
  syncMarketInsightSnapshots,
  verifyInsightSnapshot,
} from "./insights";
import { buildReceiptPayload } from "./settlement";
import type { Match, Market, ProviderMatchInsights, StreakDB } from "./types";

const capturedAt = "2026-08-31T10:00:00.000Z";

function sampleMatch(): Match {
  return {
    id: "api-football-99",
    sport: "football",
    competition: { id: "39", name: "Premier League", country: "England" },
    oracle: {
      provider: "api-football",
      fixtureId: "99",
      source: "https://v3.football.api-sports.io",
      status: "NS",
    },
    date: "2026-08-31",
    stage: "Regular Season - 3",
    home: { id: "1", code: "HOM", name: "Home FC", flag: "⚽" },
    away: { id: "2", code: "AWY", name: "Away FC", flag: "⚽" },
    kickoff: "2026-08-31T12:00:00.000Z",
    status: "scheduled",
  };
}

function sampleMarket(): Market {
  return {
    id: "m-api-football-99",
    matchId: "api-football-99",
    creatorId: "system",
    status: "open",
    pools: { home: "100", draw: "50", away: "50" },
    totalBets: 4,
    uniqueBettors: 3,
    createdAt: "2026-08-30T10:00:00.000Z",
    closesAt: "2026-08-31T12:00:00.000Z",
    feeBps: { protocol: 200, creator: 100 },
    history: [],
  };
}

function run(): void {
  const prediction = mapApiPrediction({
    predictions: {
      winner: { id: 1, name: "Home FC", comment: "Win or draw" },
      advice: "Double chance: Home FC or draw",
      percent: { home: "45%", draw: "45%", away: "10%" },
      goals: { home: "-3.5", away: "-2.5" },
    },
    comparison: { form: { home: "60%", away: "40%" } },
  }, capturedAt);
  assert.deepEqual(prediction?.probabilities, { home: 0.45, draw: 0.45, away: 0.1 });
  assert.equal(prediction?.predictedWinner?.id, "1");
  assert.deepEqual(prediction?.comparisons?.form, { home: 0.6, away: 0.4 });

  const odds = consensusFromApiOdds([{
    update: "2026-08-31T09:00:00Z",
    bookmakers: [
      {
        name: "Book A",
        bets: [{ id: 1, name: "Match Winner", values: [
          { value: "Home", odd: "2.00" },
          { value: "Draw", odd: "4.00" },
          { value: "Away", odd: "4.00" },
        ] }],
      },
      {
        name: "Book B",
        bets: [{ id: 1, name: "Match Winner", values: [
          { value: "Home", odd: "1.80" },
          { value: "Draw", odd: "3.60" },
          { value: "Away", odd: "5.00" },
        ] }],
      },
    ],
  }], capturedAt);
  assert.equal(odds?.bookmakerCount, 2);
  assert.equal(odds?.bookmakerNames.length, 2);
  assert.ok(Math.abs(
    (odds!.probabilities.home + odds!.probabilities.draw + odds!.probabilities.away) - 1,
  ) < 0.00001);
  assert.ok(odds!.probabilities.home > odds!.probabilities.draw);
  assert.ok(odds!.averageMargin > 0);

  const coverage = mapApiCoverage([{ seasons: [{ year: 2026, coverage: {
    predictions: true,
    odds: true,
    standings: true,
    injuries: false,
    fixtures: { events: true, lineups: true, statistics_fixtures: true },
  } }] }], 2026);
  assert.equal(coverage.predictions, true);
  assert.equal(coverage.injuries, false);
  assert.equal(coverage.playerStatistics, undefined);

  const table = mapApiStandings([{ league: { standings: [[
    { rank: 1, team: { id: 1, name: "Home FC" }, points: 6, form: "WW", goalsDiff: 4,
      all: { played: 2, win: 2, draw: 0, lose: 0, goals: { for: 6, against: 2 } } },
    { rank: 8, team: { id: 2, name: "Away FC" }, points: 3, form: "LW", goalsDiff: 0,
      all: { played: 2, win: 1, draw: 0, lose: 1, goals: { for: 3, against: 3 } } },
  ]] } }], "1", "2");
  assert.equal(table?.home?.rank, 1);
  assert.equal(table?.away?.form, "LW");

  const h2h = mapApiHeadToHead([{ fixture: { id: 7, date: "2026-01-02T15:00:00Z", status: { short: "FT" } },
    teams: { home: { name: "Home FC" }, away: { name: "Away FC" } },
    goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } }]);
  assert.deepEqual(h2h[0], {
    fixtureId: "7",
    date: "2026-01-02T15:00:00.000Z",
    home: "Home FC",
    away: "Away FC",
    homeGoals: 2,
    awayGoals: 1,
    status: "FT",
  });

  const match = sampleMatch();
  const market = sampleMarket();
  const external: ProviderMatchInsights = {
    v: 1,
    matchId: match.id,
    fixtureId: "99",
    provider: "api-football",
    source: "https://v3.football.api-sports.io",
    fetchedAt: capturedAt,
    coverage,
    ...(prediction ? { machine: prediction } : {}),
    ...(odds ? { bookmakers: odds } : {}),
    ...(table ? { table } : {}),
    headToHead: h2h,
    warnings: [],
  };
  const preview = composeMarketInsights(market, match, external, capturedAt, false);
  assert.deepEqual(preview.crowd.probabilities, { home: 0.5, draw: 0.25, away: 0.25 });
  assert.equal(preview.snapshotHash, undefined);

  const snapshot = composeMarketInsights(market, match, external, capturedAt, true);
  assert.equal(snapshot.snapshotHash?.length, 66);
  assert.equal(verifyInsightSnapshot(snapshot), true);
  snapshot.crowd.probabilities.home = 0.4;
  assert.equal(verifyInsightSnapshot(snapshot), false);

  const db = {
    matches: [match],
    markets: [sampleMarket()],
    bets: [],
    users: [], deposits: [], withdraws: [], receipts: [], crews: [],
    schema: 1, protocolFeesShannons: "0",
  } as unknown as StreakDB;
  const frozen = syncMarketInsightSnapshots(
    db,
    () => true,
    () => external,
    new Date("2026-08-31T12:00:01.000Z"),
  );
  assert.equal(frozen, 1);
  assert.equal(db.markets[0].insightSnapshot?.frozen, true);
  assert.equal(verifyInsightSnapshot(db.markets[0].insightSnapshot!), true);

  const settled = db.markets[0];
  settled.status = "resolved";
  settled.resolvedOutcome = "home";
  settled.resolvedAt = "2026-08-31T14:00:00.000Z";
  settled.payout = {
    winnerPoolShannons: "100",
    loserPoolShannons: "100",
    totalPaidShannons: "197",
    protocolFeeShannons: "2",
    creatorFeeShannons: "1",
    winnerCount: 1,
  };
  match.status = "final";
  match.result = "home";
  match.score = { home: 2, away: 1 };
  const receipt = buildReceiptPayload(db, settled, {
    address: "ckt1-test-treasury",
    privateKey: "test-only",
  });
  assert.equal(receipt.payload.v, 3);
  assert.equal(receipt.payload.insights?.snapshotHash, settled.insightSnapshot?.snapshotHash);

  console.log("ok  Market vs Machine mappings, consensus, freezing and receipt provenance");
}

run();
