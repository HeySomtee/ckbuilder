import assert from "assert/strict";

import { applyResult } from "../matches";
import {
  fallbackTeamCode,
  isApiFootballMatch,
  mapApiFixture,
  mapApiLiveResult,
  nextTerminalObservation,
  parseCompetitionIds,
} from "./football";

function fixture(status: string, overrides: any = {}): any {
  return {
    fixture: {
      id: 12345,
      date: "2026-08-29T15:00:00+00:00",
      timestamp: 1788015600,
      venue: { name: "Test Ground" },
      status: { short: status, long: status },
    },
    league: {
      id: 39,
      name: "Premier League",
      country: "England",
      logo: "https://example.test/league.png",
      round: "Regular Season - 3",
    },
    teams: {
      home: { id: 1, name: "Manchester City", logo: "https://example.test/home.png" },
      away: { id: 2, name: "Arsenal", logo: "https://example.test/away.png" },
    },
    goals: { home: 2, away: 1 },
    score: { fulltime: { home: 2, away: 1 } },
    ...overrides,
  };
}

function run(): void {
  assert.deepEqual(parseCompetitionIds("39, 140,39,bad"), ["39", "140"]);
  assert.equal(fallbackTeamCode("Arsenal FC"), "ARS");
  assert.equal(fallbackTeamCode("Manchester City"), "MCI");

  const mapped = mapApiFixture(fixture("NS"));
  assert.equal(mapped.id, "api-football-12345");
  assert.equal(mapped.sport, "football");
  assert.equal(mapped.competition?.id, "39");
  assert.equal(mapped.competition?.name, "Premier League");
  assert.equal(mapped.home.id, "1");
  assert.equal(mapped.home.logo, "https://example.test/home.png");
  assert.equal(mapped.kickoff, "2026-08-29T15:00:00.000Z");
  assert.equal(mapped.oracle?.fixtureId, "12345");
  assert.equal(isApiFootballMatch(mapped), true);
  assert.equal(isApiFootballMatch({ ...mapped, id: "epl-2-2", oracle: undefined }), false);

  const live = mapApiLiveResult(fixture("2H"));
  assert.equal(live?.live, true);
  assert.deepEqual({ home: live?.home, away: live?.away }, { home: 2, away: 1 });

  assert.equal(mapApiLiveResult(fixture("FT"), false), undefined);
  const final = mapApiLiveResult(fixture("FT"), true);
  assert.equal(final?.finished, true);
  assert.equal(final?.result, "home");

  // A knockout match won after extra time still settles the three-way market
  // using the 90-minute full-time score.
  const afterExtraTime = mapApiLiveResult(
    fixture("AET", {
      goals: { home: 2, away: 1 },
      score: { fulltime: { home: 1, away: 1 }, extratime: { home: 2, away: 1 } },
    }),
    true,
  );
  assert.equal(afterExtraTime?.result, "draw");
  assert.deepEqual(
    { home: afterExtraTime?.home, away: afterExtraTime?.away },
    { home: 1, away: 1 },
  );

  assert.equal(mapApiLiveResult(fixture("CANC"), false), undefined);
  assert.equal(mapApiLiveResult(fixture("CANC"), true)?.voided, true);
  assert.equal(mapApiLiveResult(fixture("PST"))?.postponed, true);
  assert.equal(mapApiLiveResult(fixture("SUSP"))?.suspended, true);

  const observedOnce = nextTerminalObservation(undefined, "FT:2:1", 2, true, false);
  assert.equal(observedOnce.count, 1);
  const observedTwice = nextTerminalObservation(observedOnce, "FT:2:1", 2, true, false);
  assert.equal(observedTwice.count, 2);
  const corrected = nextTerminalObservation(observedTwice, "FT:2:2", 2, true, false);
  assert.equal(corrected.count, 1);
  const oldFinal = nextTerminalObservation(undefined, "FT:2:1", 2, false, true);
  assert.equal(oldFinal.count, 2);

  const oldFixture = mapApiFixture(fixture("NS"));
  const muchLater = new Date("2026-08-30T15:00:00.000Z");
  const authoritativePending = applyResult(oldFixture, undefined, muchLater, false);
  assert.equal(authoritativePending.status, "scheduled");
  assert.equal(authoritativePending.result, undefined);
  const simulatedFallback = applyResult(oldFixture, undefined, muchLater, true);
  assert.equal(simulatedFallback.status, "final");
  assert.ok(simulatedFallback.result);

  console.log("ok  API-Football fixture mapping and terminal safety");
}

run();
