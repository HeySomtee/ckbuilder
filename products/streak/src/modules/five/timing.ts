import type { Round } from './domain';

/** Only the isolated dummy-data controller can issue this immutable term marker. */
export const TEST_TIMING_POLICY = 'admin-controlled-v1' as const;
export function lockTime(round: Round): number {
  const published = Date.parse(round.terms.lockAt);
  return round.terms.testingPolicy === TEST_TIMING_POLICY && round.testClosedAt
    ? Math.min(published, Date.parse(round.testClosedAt))
    : published;
}
export function finalizationTime(round: Round): number {
  const published = Date.parse(round.terms.finalizeAfter);
  return round.terms.testingPolicy === TEST_TIMING_POLICY && round.testResultsAt
    ? Math.min(published, Date.parse(round.testResultsAt))
    : published;
}
