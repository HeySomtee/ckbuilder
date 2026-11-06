import type { CampaignFixture } from '../../../shared/campaign-wire';
import type { Market, Match, ProviderMatchInsights } from '../../types';

function logo(value: string | undefined): string | null {
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function form(value: string | undefined): string | undefined {
  return value && /^[WDL]+$/.test(value) ? value.slice(-5) : undefined;
}

/** Read-only presentation from the same saved fixtures and analytics as Markets. */
export function presentCampaignFixtures(
  fixtures: readonly CampaignFixture[],
  markets: readonly Market[],
  matches: readonly Match[],
  peek?: (match: Match) => ProviderMatchInsights | undefined,
): CampaignFixture[] {
  const marketById = new Map(markets.map((market) => [market.id, market]));
  const matchById = new Map(matches.map((match) => [match.id, match]));
  return fixtures.map((fixture) => {
    const market = marketById.get(fixture.marketId);
    const match = matchById.get(fixture.fixtureId);
    if (!market || !match || market.matchId !== match.id) return fixture;
    const candidates = market.insightSnapshot
      ? [market.insightSnapshot]
      : [market.insightsLatest, peek?.(match)];
    const insights = candidates
      .filter(
        (value): value is ProviderMatchInsights =>
          !!value &&
          value.matchId === match.id &&
          value.fixtureId === (match.oracle?.fixtureId ?? match.id) &&
          (!match.oracle || value.provider === match.oracle.provider) &&
          Number.isFinite(Date.parse(value.fetchedAt)) &&
          Date.parse(value.fetchedAt) <= Date.parse(fixture.cutoffAt),
      )
      .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0];
    const homeForm =
      match.home.id && insights?.table?.home?.teamId === match.home.id
        ? form(insights.table.home.form)
        : undefined;
    const awayForm =
      match.away.id && insights?.table?.away?.teamId === match.away.id
        ? form(insights.table.away.form)
        : undefined;
    return {
      ...fixture,
      homeLogo: logo(match.home.logo),
      awayLogo: logo(match.away.logo),
      homeForm,
      awayForm,
      formFetchedAt: homeForm || awayForm ? insights!.fetchedAt : null,
    };
  });
}
