import { createHash } from 'node:crypto';
import type { DirectMarketRecord } from './registry';
import { object, PROVIDER_ORIGIN } from './registry';
import type { Match } from '../../types';

export interface FootballEvidence {
  source: typeof PROVIDER_ORIGIN;
  providerFixtureId: string;
  kickoffMs: number;
  observedAtMs: number;
  status: 'FT' | 'AET' | 'PEN';
  regulationHome: number;
  regulationAway: number;
  outcome: 0 | 1 | 2;
  digest: string;
}
export interface ConfirmedFootballEvidence extends FootballEvidence {
  previousObservation: FootballEvidence;
}

export function validateScheduledFixture(
  payload: unknown,
  providerFixtureId: string,
  now: number,
): Match {
  const envelope = object(payload, 'football response');
  if (
    !envelope.errors ||
    typeof envelope.errors !== 'object' ||
    Object.keys(envelope.errors).length ||
    !Array.isArray(envelope.response) ||
    envelope.response.length !== 1
  )
    throw Error('Expected one successful API-Football fixture response');
  const row = object(envelope.response[0], 'football fixture');
  const fixture = object(row.fixture, 'fixture identity');
  if (
    String(fixture.id) !== providerFixtureId ||
    object(fixture.status, 'fixture status').short !== 'NS'
  )
    throw Error('Only the requested scheduled fixture can be funded');
  const kickoffMs = typeof fixture.date === 'string' ? Date.parse(fixture.date) : NaN;
  if (
    !Number.isSafeInteger(kickoffMs) ||
    typeof fixture.timestamp !== 'number' ||
    fixture.timestamp * 1000 !== kickoffMs ||
    kickoffMs <= now + 120_000
  )
    throw Error('The provider must supply an unambiguous future kickoff');
  const teams = object(row.teams, 'football teams');
  const team = (value: unknown): Match['home'] => {
    const input = object(value, 'football team');
    if (
      typeof input.id !== 'number' ||
      !Number.isSafeInteger(input.id) ||
      input.id < 1 ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 80 ||
      /[\u0000-\u001f]/.test(input.name)
    )
      throw Error('Football team identity is incomplete');
    return { id: String(input.id), name: input.name, code: String(input.id), flag: '' };
  };
  const kickoff = new Date(kickoffMs).toISOString();
  return {
    id: `api-football-${providerFixtureId}`,
    sport: 'football',
    date: kickoff.slice(0, 10),
    kickoff,
    status: 'scheduled',
    stage: 'Direct testnet',
    home: team(teams.home),
    away: team(teams.away),
    oracle: {
      provider: 'api-football',
      fixtureId: providerFixtureId,
      source: PROVIDER_ORIGIN,
      status: 'NS',
    },
  };
}

/** Raw provider payload is required: the legacy LiveResult fallback is not settlement evidence. */
export function validateFootballEvidence(
  record: DirectMarketRecord,
  payload: unknown,
  observedAtMs: number,
): FootballEvidence {
  if (
    !Number.isSafeInteger(observedAtMs) ||
    observedAtMs < record.cutoffMs ||
    observedAtMs >= record.terms.deadlineMs
  )
    throw Error('Football report is outside the immutable six-hour window');
  const envelope = object(payload, 'football response');
  const errors = envelope.errors;
  if (!errors || typeof errors !== 'object' || Object.keys(errors).length)
    throw Error('Football provider reported an error or missing response status');
  if (!Array.isArray(envelope.response) || envelope.response.length !== 1)
    throw Error('Expected exactly one pinned football fixture');
  const row = object(envelope.response[0], 'football fixture');
  const fixture = object(row.fixture, 'football fixture identity');
  if (String(fixture.id) !== record.terms.providerFixtureId)
    throw Error('Football provider returned another fixture');
  const kickoffMs = typeof fixture.date === 'string' ? Date.parse(fixture.date) : NaN;
  if (
    kickoffMs !== record.cutoffMs ||
    typeof fixture.timestamp !== 'number' ||
    fixture.timestamp * 1000 !== record.cutoffMs
  )
    throw Error('Football kickoff changed after market funding');
  const status = object(fixture.status, 'football status').short;
  if (status !== 'FT' && status !== 'AET' && status !== 'PEN')
    throw Error('Football fixture has no supported final result');
  const score = object(object(row.score, 'football scores').fulltime, 'regulation-time score');
  if (
    typeof score.home !== 'number' ||
    typeof score.away !== 'number' ||
    !Number.isSafeInteger(score.home) ||
    !Number.isSafeInteger(score.away) ||
    score.home < 0 ||
    score.away < 0 ||
    score.home > 99 ||
    score.away > 99
  )
    throw Error('Explicit nonnegative regulation-time scores are required');
  const outcome = score.home > score.away ? 0 : score.home === score.away ? 1 : 2;
  const canonical = [
    PROVIDER_ORIGIN,
    record.terms.providerFixtureId,
    kickoffMs,
    status,
    score.home,
    score.away,
  ];
  return {
    source: PROVIDER_ORIGIN,
    providerFixtureId: record.terms.providerFixtureId,
    kickoffMs,
    observedAtMs,
    status,
    regulationHome: score.home,
    regulationAway: score.away,
    outcome,
    digest: `0x${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`,
  };
}

export function parseFootballObservation(
  record: DirectMarketRecord,
  value: unknown,
): FootballEvidence {
  const row = object(value, 'stored football evidence');
  const rebuilt = validateFootballEvidence(
    record,
    {
      errors: [],
      response: [
        {
          fixture: {
            id: row.providerFixtureId,
            date: new Date(record.cutoffMs).toISOString(),
            timestamp: record.cutoffMs / 1000,
            status: { short: row.status },
          },
          score: { fulltime: { home: row.regulationHome, away: row.regulationAway } },
        },
      ],
    },
    Number(row.observedAtMs),
  );
  if (
    row.source !== rebuilt.source ||
    row.kickoffMs !== rebuilt.kickoffMs ||
    row.outcome !== rebuilt.outcome ||
    row.digest !== rebuilt.digest
  )
    throw Error('Stored football evidence is inconsistent');
  return rebuilt;
}

export function confirmFootballEvidence(
  previous: FootballEvidence | undefined,
  current: FootballEvidence,
  now: number,
): ConfirmedFootballEvidence {
  if (
    !previous ||
    previous.digest !== current.digest ||
    previous.observedAtMs > current.observedAtMs - 30_000 ||
    current.observedAtMs > now ||
    now - current.observedAtMs > 60_000
  )
    throw Error(
      'Result requires two matching provider reads at least 30 seconds apart, with a fresh final read',
    );
  if (
    previous.source !== PROVIDER_ORIGIN ||
    current.source !== PROVIDER_ORIGIN ||
    previous.providerFixtureId !== current.providerFixtureId ||
    previous.kickoffMs !== current.kickoffMs ||
    previous.status !== current.status ||
    previous.regulationHome !== current.regulationHome ||
    previous.regulationAway !== current.regulationAway ||
    previous.outcome !== current.outcome
  )
    throw Error('Football observations do not match');
  return { ...current, previousObservation: previous };
}
