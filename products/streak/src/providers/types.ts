/**
 * Streak — match-data provider interface.
 *
 * A provider is the single seam between the game engine and whatever supplies
 * fixtures + results. The engine never talks to a specific API; it only talks
 * to a `MatchDataProvider`. Swap the World Cup feed for a Premier League feed
 * (or the built-in simulator) by implementing this interface and selecting it
 * with the `MATCH_PROVIDER` env var — no engine code changes.
 *
 * See providers/index.ts for selection and providers/worldcup.ts,
 * providers/dummy.ts and providers/football.ts for the implementations that
 * ship today.
 */

import type { Competition, Match, Outcome, ProviderMatchInsights } from "../types";

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
  /** Cancelled/abandoned/awarded fixtures void their market after confirmation. */
  voided?: boolean;
  /** Temporarily interrupted fixture; never settles a market. */
  suspended?: boolean;
  /** Fixture has been postponed or its kickoff is still to be determined. */
  postponed?: boolean;
  providerStatus?: string;
  source?: string;
  confirmedAt?: string;
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
  competitions?: Competition[];
  quota?: {
    requestsLimit?: number;
    requestsRemaining?: number;
    requestsUsedThisProcess: number;
  };
  polling?: {
    mode: string;
    nextPollIso?: string;
    scheduleRefreshIso?: string;
  };
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
  /** Real-money style feeds must never invent a result when their API is down. */
  readonly allowSimulatedFallback?: boolean;
  /** True when a persisted match belongs to this provider's active catalogue. */
  ownsMatch?(match: Match): boolean;
  /** Cached/on-demand pre-match analytics for providers that support them. */
  fetchInsights?(match: Match): Promise<ProviderMatchInsights | null>;
  /** Quota-aware near-kickoff warming; implementations choose their own batch. */
  prefetchInsights?(matches: Match[]): Promise<void>;
  /** Synchronous cache read used while the DB write lock is held. */
  peekInsights?(match: Match): ProviderMatchInsights | undefined;
  /** Optional one-time async setup, awaited at boot before any sync. */
  init?(): Promise<void>;
  /** Full ordered fixture list. Must be pure/sync (called under write lock). */
  loadFixtures(): Match[];
  /** Current results keyed by match id. `{}` when nothing to report. */
  fetchResults(): Promise<Record<string, LiveResult>>;
  /** Provider health snapshot for the UI. */
  status(): Promise<ProviderStatus>;
}
