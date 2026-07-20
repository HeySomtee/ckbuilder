/**
 * Streak — World Cup provider.
 *
 * Thin adapter that wires the existing WC2026 dataset (wcdata.ts) and the
 * live worldcup26.ir oracle client (livescores.ts) into the generic
 * `MatchDataProvider` seam. This is the default provider.
 */

import { loadAllMatches } from "../wcdata";
import { fetchLiveResults, liveScoresStatus } from "../livescores";
import type { Match } from "../types";
import type { LiveResult, MatchDataProvider, ProviderStatus } from "./types";

export const worldCupProvider: MatchDataProvider = {
  id: "worldcup",

  loadFixtures(): Match[] {
    return loadAllMatches();
  },

  fetchResults(): Promise<Record<string, LiveResult>> {
    return fetchLiveResults();
  },

  async status(): Promise<ProviderStatus> {
    const s = await liveScoresStatus();
    return {
      provider: "worldcup",
      league: "FIFA World Cup 2026",
      enabled: s.enabled,
      simulated: !s.enabled,
      source: s.source,
      base: s.base,
      email: s.email,
      detail: s.enabled
        ? "live results from worldcup26.ir"
        : "no oracle token — deterministic simulated results",
      lastSyncIso: s.lastSyncIso,
      lastError: s.lastError,
      matchCount: s.matchCount,
      liveMatches: s.liveMatches,
      finishedMatches: s.finishedMatches,
    };
  },
};
