/* Optional read-only integration check. Uses API quota, never the app database. */
require("../dist/env");
const { footballProvider, mapApiFixture, API_FOOTBALL_BASE } = require("../dist/providers/football");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  if (!process.env.API_SPORTS_KEY) throw Error("API_SPORTS_KEY is not configured");
  const url = new URL("/fixtures", API_FOOTBALL_BASE);
  const now = new Date();
  const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  url.searchParams.set("league", (process.env.FOOTBALL_LEAGUE_IDS || "39").split(",")[0]);
  url.searchParams.set("season", process.env.FOOTBALL_SEASON || String(season));
  url.searchParams.set("last", "1");
  const response = await fetch(url, { headers: { "x-apisports-key": process.env.API_SPORTS_KEY }, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || (body.errors && Object.keys(body.errors).length)) throw Error("Provider rejected the fixture lookup");
  const raw = body.response?.[0];
  if (!raw) throw Error("No recent fixture in the configured competition/season");
  const match = mapApiFixture(raw);
  const data = await footballProvider.fetchMatchday(match);
  const evidence = {
    checkedAt: new Date().toISOString(), fixtureId: match.oracle.fixtureId,
    match: `${match.home.name} vs ${match.away.name}`, kickoff: match.kickoff,
    providerStatus: raw.fixture.status.short, scoreboard: data.scoreboard,
    events: { state: data.events.state, count: data.events.data.length },
    lineups: { state: data.lineups.state, teams: data.lineups.data.map((team) => ({ teamId: team.teamId, formation: team.formation, starters: team.starters.length, substitutes: team.substitutes.length })) },
    statistics: data.statistics,
  };
  const output = path.resolve("data/qa/matchday-live-validation.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
  if (data.scoreboard.state !== "ready") process.exitCode = 1;
}
main().catch((error) => { console.error(error.message, error.cause?.code || ""); process.exitCode = 1; });
