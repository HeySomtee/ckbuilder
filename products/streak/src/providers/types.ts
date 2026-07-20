/**
 * Streak — match-data provider interface.
 *
 * A provider is the single seam between the game engine and whatever supplies
 * fixtures + results. The engine never talks to a specific API; it only talks
 * to a `MatchDataProvider`. Swap the World Cup feed for a Premier League feed
 * (or the built-in simulator) by implementing this interface and selecting it
 * with the `MATCH_PROVIDER` env var — no engine code changes.
 *
 * See providers/index.ts for selection and providers/worldcup.ts /
 * providers/dummy.ts for the two implementations that ship today.
 */

import type { Match, Outcome } from "../types";

/**
 * A single fixture's live/final state, keyed by our internal match id in the
 * map returned by `fetchResults()`.
 */
export interface LiveResult {
  finished: boolean;
  live: boolean;
  home: number;
  away: number;
  result?: Outcome;
}

/** Snapshot of a provider for health checks and the status bar. */
export interface ProviderStatus {
  /** Provider id, e.g. "worldcup" | "dummy". */
  provider: string;
  /** Human label for the competition, e.g. "FIFA World Cup 2026". */
  league: string;
  /** True when the provider is actively serving live results. */
  enabled: boolean;
  /** True when results are synthetic (no external oracle). */
  simulated: boolean;
  /** Auth/data source, e.g. "token" | "credentials" | "none" | "simulated". */
  source: string;
  /** Base URL or short origin label. */
  base: string;
  email?: string;
  detail?: string;
  lastSyncIso?: string;
  lastError?: string;
  matchCount: number;
  liveMatches: number;
  finishedMatches: number;
}

/**
 * The pluggable data source contract.
 *
 * `loadFixtures()` is intentionally synchronous: the engine calls it from
 * inside the store's write lock, so it must not touch the store or await.
 * Do any async setup (auth, anchor persistence) in `init()`, which the server
 * awaits once at boot before the first sync.
 */
export interface MatchDataProvider {
  readonly id: string;
  /** Optional one-time async setup, awaited at boot before any sync. */
  init?(): Promise<void>;
  /** Full ordered fixture list. Must be pure/sync (called under write lock). */
  loadFixtures(): Match[];
  /** Current results keyed by match id. `{}` when nothing to report. */
  fetchResults(): Promise<Record<string, LiveResult>>;
  /** Provider health snapshot for the UI. */
  status(): Promise<ProviderStatus>;
}
