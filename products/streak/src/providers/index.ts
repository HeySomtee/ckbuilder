/**
 * Streak — match-data provider selection.
 *
 * Chooses the active provider from `MATCH_PROVIDER` (or API-key presence).
 * Add a new feed by implementing `MatchDataProvider` and registering it here;
 * nothing in the engine needs to change.
 */

import { worldCupProvider } from "./worldcup";
import { dummyProvider } from "./dummy";
import { footballProvider } from "./football";
import type { MatchDataProvider } from "./types";

export type { LiveResult, MatchDataProvider, ProviderStatus } from "./types";

const REGISTRY: Record<string, MatchDataProvider> = {
  worldcup: worldCupProvider,
  dummy: dummyProvider,
  football: footballProvider,
};

const selected = (
  process.env.MATCH_PROVIDER?.trim().toLowerCase() ||
  (process.env.API_SPORTS_KEY ? "football" : "worldcup")
);

/** The active provider for this process. */
export const provider: MatchDataProvider = REGISTRY[selected] ?? worldCupProvider;

/** All registered provider ids (for diagnostics). */
export function providerIds(): string[] {
  return Object.keys(REGISTRY);
}
