/**
 * Streak — real World Cup 2026 fixture data.
 *
 * Loads the vendored open-source dataset (teams, matches, stadiums) from
 * `src/data/*.json` and converts it into the app's `Match` / `Team` model.
 *
 * Data source: https://github.com/rezarahiminia/worldcup2026 (ISC licensed) —
 * 48 teams, 12 groups, 104 matches, 16 stadiums across USA / Mexico / Canada.
 *
 * The vendored files are MongoDB extended-JSON exports; we ignore the `_id`
 * wrappers and read the flat fields. Knockout fixtures whose teams aren't known
 * yet carry `home_team_id: "0"` plus a `*_team_label` placeholder, which we map
 * to a "TBD" team built from the label.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import type { Match, MatchStatus, Team } from "./types";

// ── Raw record shapes (subset of the dataset we use) ─────────────────────────

interface RawTeam {
  id: string;
  name_en: string;
  fifa_code: string;
  iso2?: string;
  groups?: string;
}

interface RawMatch {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string;
  matchday: string;
  local_date: string; // "MM/DD/YYYY HH:MM"
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string; // "notstarted" | "finished" | minutes
  type: string; // group | r32 | r16 | qf | sf | third | final
  home_team_label?: string;
  away_team_label?: string;
}

interface RawStadium {
  id: string;
  name_en: string;
  city_en: string;
  country_en: string;
}

const DATA_DIR = resolve(__dirname, "data");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf8")) as T;
}

// ── Lazy singletons ──────────────────────────────────────────────────────────

let cached: Match[] | null = null;

const STAGE_NAMES: Record<string, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-Final",
  sf: "Semi-Final",
  third: "Third Place",
  final: "Final",
};

/** Convert a 2-letter ISO country code to its emoji flag. */
function flagEmoji(iso2?: string): string {
  if (!iso2 || iso2.length !== 2 || !/^[a-zA-Z]{2}$/.test(iso2)) return "🏳️";
  const A = 0x1f1e6;
  const up = iso2.toUpperCase();
  return String.fromCodePoint(A + up.charCodeAt(0) - 65, A + up.charCodeAt(1) - 65);
}

/**
 * IANA timezone per host stadium (16 venues, indexed by `stadium.id`). The
 * upstream API's `local_date` is stadium-local wall-clock time — without this
 * mapping the app would treat e.g. 15:00 ET kickoffs as 15:00 UTC.
 */
const STADIUM_TZ: Record<string, string> = {
  "1": "America/Mexico_City",   // Estadio Azteca, Mexico City
  "2": "America/Mexico_City",   // Estadio Akron, Guadalajara
  "3": "America/Monterrey",     // Estadio BBVA, Monterrey
  "4": "America/Chicago",       // AT&T Stadium, Dallas
  "5": "America/Chicago",       // NRG Stadium, Houston
  "6": "America/Chicago",       // Arrowhead Stadium, Kansas City
  "7": "America/New_York",      // Mercedes-Benz Stadium, Atlanta
  "8": "America/New_York",      // Hard Rock Stadium, Miami
  "9": "America/New_York",      // Gillette Stadium, Boston
  "10": "America/New_York",     // Lincoln Financial Field, Philadelphia
  "11": "America/New_York",     // MetLife Stadium, NY/NJ
  "12": "America/Toronto",      // BMO Field, Toronto
  "13": "America/Vancouver",    // BC Place, Vancouver
  "14": "America/Los_Angeles",  // Lumen Field, Seattle
  "15": "America/Los_Angeles",  // Levi's Stadium, San Francisco
  "16": "America/Los_Angeles",  // SoFi Stadium, Los Angeles
};

/** UTC offset (ms) for the given UTC instant in the given IANA timezone. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  let h = get("hour");
  if (h === 24) h = 0;
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    h,
    get("minute"),
    get("second"),
  );
  return wallAsUtc - utcMs;
}

/**
 * "MM/DD/YYYY HH:MM" + stadium → `{ date, iso }`.
 *
 * `date` is the stadium-local calendar day (so matches stay on their natural
 * football "match day" even when kickoff crosses UTC midnight). `iso` is the
 * true UTC ISO-8601 kickoff. Falls back to UTC when the stadium tz is unknown.
 */
function parseLocalDate(
  local: string,
  stadiumId?: string,
): { date: string; iso: string } {
  const [datePart, timePart = "00:00"] = local.trim().split(/\s+/);
  const [mm, dd, yyyy] = datePart.split("/");
  const date = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const [hh, mi] = timePart.padStart(5, "0").split(":");

  const tz = stadiumId ? STADIUM_TZ[stadiumId] : undefined;
  const wallUtcMs = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi));
  const trueUtcMs = tz ? wallUtcMs - tzOffsetMs(wallUtcMs, tz) : wallUtcMs;
  return { date, iso: new Date(trueUtcMs).toISOString() };
}

function placeholderTeam(label?: string): Team {
  const name = label?.trim() || "To be decided";
  // Short code from the label initials, e.g. "Winner Group A" → "WGA".
  const code =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "TBD";
  return { code, name, flag: "🏳️" };
}

/** Build the full, ordered list of real WC2026 fixtures as `Match` objects. */
export function loadAllMatches(): Match[] {
  if (cached) return cached;

  const rawTeams = readJson<RawTeam[]>("wc2026-teams.json");
  const rawMatches = readJson<RawMatch[]>("wc2026-matches.json");
  let stadiums: Record<string, RawStadium> = {};
  try {
    for (const s of readJson<RawStadium[]>("wc2026-stadiums.json")) stadiums[s.id] = s;
  } catch {
    /* stadiums optional */
  }

  const teamById = new Map<string, Team>();
  for (const t of rawTeams) {
    teamById.set(t.id, {
      code: t.fifa_code,
      name: t.name_en,
      flag: flagEmoji(t.iso2),
    });
  }

  const teamFor = (id: string, label?: string): Team =>
    teamById.get(id) ?? placeholderTeam(label);

  cached = rawMatches
    .map((m): Match => {
      const { date, iso } = parseLocalDate(m.local_date, m.stadium_id);
      const stadium = stadiums[m.stadium_id];
      const venue = stadium ? `${stadium.name_en}, ${stadium.city_en}` : undefined;
      return {
        id: `wc-${m.id}`,
        date,
        stage: STAGE_NAMES[m.type] ?? m.type,
        group: m.type === "group" ? `Group ${m.group}` : undefined,
        home: teamFor(m.home_team_id, m.home_team_label),
        away: teamFor(m.away_team_id, m.away_team_label),
        kickoff: iso,
        status: "scheduled" as MatchStatus,
        venue,
        matchday: m.matchday,
      };
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  return cached;
}

/**
 * Choose which day's fixtures to surface as "today's board".
 *   1. real fixtures dated today (UTC), else
 *   2. the nearest upcoming fixture date, else
 *   3. the most recent past fixture date.
 * Keeps the game playable on rest days and before/after the tournament.
 */
export function currentSlateDate(matches: Match[], today: string): string {
  const dates = [...new Set(matches.map((m) => m.date))].sort();
  if (dates.includes(today)) return today;
  const upcoming = dates.find((d) => d >= today);
  if (upcoming) return upcoming;
  return dates[dates.length - 1] ?? today;
}
