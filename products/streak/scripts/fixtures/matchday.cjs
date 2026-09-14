/* Synthetic match coverage for repeatable browser checks and report screenshots. */
const { mapMatchdayEvents, mapMatchdayLineups, mapMatchdayStats, mapMatchdayScore } = require("../../dist/matchday");

function matchdayFixture(match, status = "2H") {
  const home = Number(match.home.id), away = Number(match.away.id);
  const timestamp = new Date().toISOString();
  const section = (data) => ({ state: "ready", data, updatedAt: timestamp, maxAgeSeconds: 3600 });
  const roster = (teamId, names, formation) => {
    const rows = [1, ...formation.split("-").map(Number)];
    let index = 0;
    return { team: { id: teamId }, formation, coach: { name: teamId === home ? "M. Arteta" : "L. Rosenior" },
      startXI: rows.flatMap((count, row) => Array.from({ length: count }, (_, col) => ({ player: {
        id: teamId * 100 + index, name: names[index++], number: index, pos: row === 0 ? "G" : row === 1 ? "D" : row === rows.length - 1 ? "F" : "M", grid: `${row + 1}:${col + 1}`,
      } }))),
      substitutes: ["J. Lewis", "A. Williams", "M. Taylor", "D. Roberts", "S. Clarke", "J. Evans"].map((name, i) => ({ player: { id: teamId * 100 + 20 + i, name, number: 20 + i, pos: i < 2 ? "D" : i < 4 ? "M" : "F" } })),
    };
  };
  const event = (minute, teamId, player, type, detail, assist) => ({ time: { elapsed: minute }, team: { id: teamId }, player: { name: player }, assist: { name: assist }, type, detail });
  const events = [
    event(18, home, "B. Saka", "Goal", "Goal", "M. Ødegaard"),
    event(36, away, "C. Palmer", "Goal", "Goal", "E. Fernández"),
    event(43, away, "M. Caicedo", "Card", "Yellow Card"),
    event(59, home, "K. Havertz", "Goal", "Goal", "B. Saka"),
    event(64, away, "P. Neto", "subst", "Substitution", "J. Lewis"),
    event(67, home, "D. Rice", "Card", "Yellow Card"),
  ];
  const stats = (id, values) => ({ team: { id }, statistics: ["Ball Possession", "Shots on Goal", "Total Shots", "Corner Kicks", "Fouls", "Yellow Cards"].map((type, i) => ({ type, value: values[i] })) });
  return {
    matchId: match.id, provider: "api-football", supported: true, fetchedAt: timestamp,
    scoreboard: section(mapMatchdayScore({ fixture: { id: 17, status: { short: status, long: status === "FT" ? "Full-time" : "Second half", elapsed: status === "FT" ? 90 : 67 }, venue: { name: "Emirates Stadium" } }, goals: { home: 2, away: 1 }, score: { fulltime: status === "FT" ? { home: 2, away: 1 } : { home: null, away: null } } })),
    events: section(mapMatchdayEvents(events, match)),
    lineups: section(mapMatchdayLineups([
      roster(home, ["D. Raya", "B. White", "W. Saliba", "Gabriel", "J. Timber", "M. Ødegaard", "M. Zubimendi", "D. Rice", "B. Saka", "K. Havertz", "G. Martinelli"], "4-3-3"),
      roster(away, ["R. Sánchez", "R. James", "W. Fofana", "L. Colwill", "M. Cucurella", "M. Caicedo", "E. Fernández", "P. Neto", "C. Palmer", "E. Estêvão", "J. Pedro"], "4-2-3-1"),
    ], match)),
    statistics: section(mapMatchdayStats([stats(home, ["58%", 6, 14, 7, 9, 1]), stats(away, ["42%", 3, 8, 3, 12, 2])], match)),
  };
}
module.exports = { matchdayFixture };
