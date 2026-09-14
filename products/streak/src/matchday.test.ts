import assert from "assert/strict";
import type { Match } from "./types";
import { MatchdayFeed, mapMatchdayEvents, mapMatchdayLineups, mapMatchdayScore, mapMatchdayStats, withMatchdayFreshness } from "./matchday";

async function main() {
  let now = Date.parse("2026-09-14T16:00:00Z");
  const match: Match = {
    id: "api-football-17", kickoff: "2026-09-14T15:00:00Z", date: "2026-09-14", stage: "Test", status: "live",
    home: { id: "1", code: "HOM", name: "Home", flag: "" }, away: { id: "2", code: "AWY", name: "Away", flag: "" },
    competition: { id: "39", name: "League" }, oracle: { provider: "api-football", fixtureId: "17", source: "test" },
  };
  const fixture = { fixture: { id: 17, status: { short: "AET", long: "After extra time", elapsed: 120, extra: null } }, goals: { home: 2, away: 1 }, score: { fulltime: { home: 1, away: 1 } } };
  const score = mapMatchdayScore(fixture)!;
  assert.equal(score.home, 2); assert.equal(score.regulation.home, 1, "Display score preserves the distinct regulation result");
  assert.equal(mapMatchdayScore({}), null);
  assert.equal(mapMatchdayScore({ ...fixture, goals: { home: null, away: "" } })!.home, null);
  const goal = { time: { elapsed: 45, extra: 2 }, team: { id: 1 }, player: { name: "Player" }, type: "Goal", detail: "Own Goal" };
  const events = mapMatchdayEvents([goal, goal, { ...goal, time: { elapsed: 46 } }, { ...goal, team: { id: 99 } }], match);
  assert.equal(events.length, 2); assert.equal(events[0].minute, 46);
  assert.equal(events[1].detail, "Own Goal"); assert.equal(events[1].extra, 2);
  assert.equal(mapMatchdayEvents([{ ...goal, type: "Var", detail: "Goal cancelled" }], match)[0].type, "var");
  const partial = mapMatchdayLineups([{ team: { id: 1 }, formation: "4-3-3", startXI: [{ player: { id: 1, name: "A", number: 0, grid: "1:1" } }, { player: { name: "B", grid: "999:1" } }], substitutes: null }], match)[0];
  assert.equal(partial.confirmed, false); assert.equal(partial.starters[0].number, 0);
  assert.deepEqual(partial.starters[0].grid, { row: 1, column: 1 }); assert.equal(partial.starters[1].grid, undefined);
  const rawStats = [{ team: { id: 2 }, statistics: [{ type: "Ball Possession", value: "42%" }, { type: "Corner Kicks", value: 0 }] }, { team: { id: 1 }, statistics: [{ type: "Ball Possession", value: "58%" }, { type: "Corner Kicks", value: null }] }];
  const stats = mapMatchdayStats(rawStats, match);
  assert.equal(stats[0].home, 58); assert.equal(stats[0].away, 42);
  assert.equal(stats[3].home, null); assert.equal(stats[3].away, 0, "Unknown and zero are different");
  assert.equal(mapMatchdayStats([{ team: { id: 1 }, statistics: [{ type: "Ball Possession", value: "130%" }] }], match)[0].home, null);

  const calls: string[] = [];
  let failEvents = false;
  let corrected = false;
  const feed = new MatchdayFeed(async (path) => {
    calls.push(path);
    if (path === "/fixtures") return [fixture];
    if (path === "/fixtures/events") { if (failEvents) throw Error("Provider outage"); return corrected ? [] : [goal]; }
    if (path === "/fixtures/statistics") return rawStats;
    return [];
  }, async () => ({ events: true, lineups: true, fixtureStatistics: true }), () => now);
  const before = JSON.stringify(match);
  const first = await Promise.all(Array.from({ length: 8 }, () => feed.load(match)));
  assert.equal(calls.length, 4, "Concurrent viewers share each endpoint request");
  assert.equal(first[0].events.state, "ready"); assert.equal(first[0].lineups.state, "empty");
  await feed.load(match); assert.equal(calls.length, 4);
  now += 21_000;
  failEvents = true;
  const stale = await feed.load(match);
  assert.equal(stale.events.state, "stale"); assert.equal(stale.events.data.length, 1);
  assert.equal(stale.events.updatedAt, first[0].events.updatedAt, "An outage does not advance freshness");
  assert.equal(calls.filter((p) => p === "/fixtures/statistics").length, 1);
  assert.equal(calls.filter((p) => p === "/fixtures/lineups").length, 1);
  await feed.load(match); assert.equal(calls.length, 6, "Failure backoff prevents request storms");
  now += 21_000; failEvents = false; corrected = true;
  const correctedResult = await feed.load(match);
  assert.equal(correctedResult.events.state, "empty"); assert.deepEqual(correctedResult.events.data, [], "Provider corrections replace prior events");
  assert.equal(withMatchdayFreshness(first[0], now + 60_000).scoreboard.state, "stale");
  assert.equal(JSON.stringify(match), before, "Live observations never mutate stored match or settlement state");

  const restrictedCalls: string[] = [];
  const restricted = new MatchdayFeed(async (path) => { restrictedCalls.push(path); return [fixture]; }, async () => ({ events: false, lineups: false, fixtureStatistics: false }), () => now);
  const unsupported = await restricted.load(match);
  assert.equal(unsupported.events.state, "not-covered"); assert.deepEqual(restrictedCalls, ["/fixtures"]);
  const future = await restricted.load({ ...match, status: "scheduled", kickoff: new Date(now + 2 * 60 * 60_000).toISOString() });
  assert.equal(future.lineups.state, "scheduled"); assert.equal(restrictedCalls.length, 1, "Distant fixtures spend no detail quota");
  const failures = new MatchdayFeed(async () => { throw Error("Network down"); }, async () => ({}), () => now);
  assert.equal((await failures.load(match)).events.state, "unavailable");
  const preCalls: string[] = [];
  const prematch = new MatchdayFeed(async (path) => { preCalls.push(path); return []; }, async () => ({}), () => now);
  const pre = await prematch.load({ ...match, status: "scheduled", kickoff: new Date(now + 60_000).toISOString() });
  assert.equal(pre.events.state, "scheduled"); assert.deepEqual(preCalls.sort(), ["/fixtures", "/fixtures/lineups"]);
  await prematch.load(match);
  assert.equal(preCalls.filter((p) => p === "/fixtures").length, 2, "Kickoff immediately invalidates pre-match caches");
  console.log("Matchday checks passed: mappings, corrections, nulls, coverage, concurrency, TTLs, stale fallback, kickoff and settlement isolation.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
