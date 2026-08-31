/**
 * Market vs Machine composition and kickoff freezing.
 *
 * Provider analytics are cached independently from crowd prices. This module
 * joins them only at the API boundary and freezes an immutable comparison on
 * the first sync at/after kickoff.
 */

import { canonicalize, sha256Hex } from "./settlement";
import type {
  Match,
  Market,
  MarketInsights,
  Outcome,
  OutcomeProbabilities,
  ProviderMatchInsights,
  StreakDB,
} from "./types";

function crowdProbabilities(market: Market): OutcomeProbabilities {
  const pools: Record<Outcome, bigint> = {
    home: BigInt(market.pools.home),
    draw: BigInt(market.pools.draw),
    away: BigInt(market.pools.away),
  };
  const total = pools.home + pools.draw + pools.away;
  if (total === 0n) return { home: 0, draw: 0, away: 0 };
  const denominator = Number(total);
  return {
    home: Number((Number(pools.home) / denominator).toFixed(6)),
    draw: Number((Number(pools.draw) / denominator).toFixed(6)),
    away: Number((Number(pools.away) / denominator).toFixed(6)),
  };
}

function totalPoolShannons(market: Market): string {
  return (
    BigInt(market.pools.home) +
    BigInt(market.pools.draw) +
    BigInt(market.pools.away)
  ).toString();
}

export function composeMarketInsights(
  market: Market,
  match: Match,
  external: ProviderMatchInsights | undefined,
  capturedAt = new Date().toISOString(),
  frozen = false,
): MarketInsights {
  const unavailableWarning = "External analytics were unavailable before this snapshot.";
  const provider: ProviderMatchInsights = external ?? {
    v: 1,
    matchId: match.id,
    fixtureId: match.oracle?.fixtureId ?? match.id,
    provider: match.oracle?.provider ?? "unavailable",
    source: match.oracle?.source ?? "unavailable",
    fetchedAt: capturedAt,
    coverage: {},
    warnings: [unavailableWarning],
  };

  const base: MarketInsights = {
    ...provider,
    capturedAt,
    frozen,
    crowd: {
      probabilities: crowdProbabilities(market),
      totalBets: market.totalBets,
      uniqueBettors: market.uniqueBettors,
      totalPoolShannons: totalPoolShannons(market),
    },
  };
  if (!frozen) return base;
  return { ...base, snapshotHash: sha256Hex(canonicalize(base)) };
}

/**
 * Persist warmed provider data and freeze due markets. Existing snapshots are
 * immutable; later odds/model changes can never rewrite receipt provenance.
 */
export function syncMarketInsightSnapshots(
  db: StreakDB,
  ownsMatch: (match: Match) => boolean,
  peek: (match: Match) => ProviderMatchInsights | undefined,
  now = new Date(),
): number {
  const matchById = new Map(db.matches.map((match) => [match.id, match]));
  let frozenCount = 0;

  for (const market of db.markets) {
    const match = matchById.get(market.matchId);
    if (!match || !ownsMatch(match)) continue;
    const warmed = peek(match);
    if (warmed && !market.insightSnapshot) market.insightsLatest = warmed;
    if (market.insightSnapshot || now.getTime() < Date.parse(market.closesAt)) continue;

    market.insightSnapshot = composeMarketInsights(
      market,
      match,
      market.insightsLatest ?? warmed,
      now.toISOString(),
      true,
    );
    frozenCount += 1;
  }
  return frozenCount;
}

export function verifyInsightSnapshot(snapshot: MarketInsights): boolean {
  if (!snapshot.snapshotHash || !snapshot.frozen) return false;
  const { snapshotHash, ...withoutHash } = snapshot;
  return sha256Hex(canonicalize(withoutHash)) === snapshotHash;
}
