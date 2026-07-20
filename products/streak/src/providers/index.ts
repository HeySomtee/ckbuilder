/**
 * Streak — match-data provider selection.
 *
 * Chooses the active provider from `MATCH_PROVIDER` (default "worldcup").
 * Add a new feed by implementing `MatchDataProvider` and registering it here;
 * nothing in the engine needs to change.
 */

import { worldCupProvider } from "./worldcup";
import { dummyProvider } from "./dummy";
import type { MatchDataProvider } from "./types";

export type { LiveResult, MatchDataProvider, ProviderStatus } from "./types";

const REGISTRY: Record<string, MatchDataProvider> = {
  worldcup: worldCupProvider,
  dummy: dummyProvider,
};

const selected = (process.env.MATCH_PROVIDER?.trim().toLowerCase() || "worldcup");

/** The active provider for this process. */
export const provider: MatchDataProvider = REGISTRY[selected] ?? worldCupProvider;

/** All registered provider ids (for diagnostics). */
export function providerIds(): string[] {
  return Object.keys(REGISTRY);
}
