import type { FixtureObservation, LiveResult } from './types';

export function nextFixtureObservation(
  previous: FixtureObservation | undefined,
  metadata: Omit<FixtureObservation, 'observedAt' | 'result'>,
  result: LiveResult | undefined,
  now: number,
): FixtureObservation {
  const stableResult = result ? { ...result, confirmedAt: undefined } : null;
  const stablePrevious = previous?.result ? { ...previous.result, confirmedAt: undefined } : null;
  if (
    previous &&
    previous.kickoff === metadata.kickoff &&
    previous.homeTeamId === metadata.homeTeamId &&
    previous.awayTeamId === metadata.awayTeamId &&
    previous.unavailable === metadata.unavailable &&
    JSON.stringify(stablePrevious) === JSON.stringify(stableResult)
  )
    return previous;
  const observedAt = new Date(now).toISOString();
  return {
    ...metadata,
    observedAt,
    result: stableResult
      ? { ...stableResult, ...(result?.confirmedAt ? { confirmedAt: observedAt } : {}) }
      : null,
  };
}
export function appendFixtureObservation(history: FixtureObservation[], next: FixtureObservation) {
  if (history[history.length - 1] === next) return history;
  const combined = [...history, next];
  if (combined.length <= 65) return combined;
  const removed = combined[combined.length - 65];
  return [{ ...removed, historyGap: true, result: null }, ...combined.slice(-64)];
}
