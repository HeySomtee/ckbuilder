import assert from 'node:assert/strict';
import type { CampaignFixture } from '../shared/campaign-wire';
import { presentCampaignFixtures } from './modules/campaigns/fixture-presentation';
import type {
  Market,
  Match,
  MarketInsights,
  ProviderMatchInsights,
  TeamTableInsight,
} from './types';

// Synthetic saved objects only. No environment, network, database or provider requests.
const at = (minute: number) => new Date(Date.UTC(2030, 0, 5, 12, minute)).toISOString();
function fixture(): CampaignFixture {
  return {
    fixtureId: 'fixture-42',
    marketId: 'market-42',
    marketKey: 'pinned-market-generation',
    home: 'Home FC',
    away: 'Away FC',
    league: 'Synthetic League',
    kickoffAt: at(90),
    cutoffAt: at(60),
    capacity: 32,
    occupied: 7,
    updatedAt: at(1),
  };
}
function match(): Match {
  return {
    id: 'fixture-42',
    date: '2030-01-05',
    kickoff: at(90),
    stage: 'Synthetic gameweek',
    status: 'scheduled',
    oracle: { provider: 'synthetic', fixtureId: '42', source: 'isolated-test' },
    home: { id: 'team-home', name: 'Home FC', code: 'HOM', flag: '', logo: '/clubs/home.svg' },
    away: {
      id: 'team-away',
      name: 'Away FC',
      code: 'AWY',
      flag: '',
      logo: 'https://logos.example.test/away.svg',
    },
  };
}
function market(): Market {
  return {
    id: 'market-42',
    matchId: 'fixture-42',
    creatorId: 'synthetic-creator',
    status: 'open',
    pools: { home: '30000000000', draw: '10000000000', away: '20000000000' },
    totalBets: 7,
    uniqueBettors: 4,
    createdAt: at(-100),
    closesAt: at(60),
    feeBps: { protocol: 250, creator: 100 },
    history: [],
  };
}
function table(teamId: string, form: string): TeamTableInsight {
  return {
    teamId,
    name: teamId === 'team-home' ? 'Home FC' : 'Away FC',
    form,
    rank: 1,
    points: 12,
    played: 5,
    won: 4,
    drawn: 0,
    lost: 1,
    goalsFor: 10,
    goalsAgainst: 3,
    goalDifference: 7,
  };
}
function insight(minute: number, home = 'LWWDLD', away = 'WDDLW'): ProviderMatchInsights {
  return {
    v: 1,
    matchId: 'fixture-42',
    fixtureId: '42',
    provider: 'synthetic',
    source: 'isolated-test',
    fetchedAt: at(minute),
    coverage: { standings: true },
    table: { home: table('team-home', home), away: table('team-away', away) },
    warnings: [],
  };
}
function snapshot(minute: number): MarketInsights {
  return {
    ...insight(minute),
    capturedAt: at(61),
    frozen: true,
    crowd: {
      probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
      totalBets: 7,
      uniqueBettors: 4,
      totalPoolShannons: '60000000000',
    },
  };
}

let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks++;
  console.log(`ok - ${name}`);
}

check(
  'saved fixtures use safe logos and the newest eligible form with the last five results',
  () => {
    const m = market();
    m.insightsLatest = insight(10, 'LLLLL');
    const [shown] = presentCampaignFixtures([fixture()], [m], [match()], () => insight(20));
    assert.equal(shown.homeLogo, '/clubs/home.svg');
    assert.equal(shown.awayLogo, 'https://logos.example.test/away.svg');
    assert.equal(shown.homeForm, 'WWDLD');
    assert.equal(shown.awayForm, 'WDDLW');
    assert.equal(shown.formFetchedAt, at(20));
  },
);

check('post-cutoff and malformed timestamps never replace pre-match form', () => {
  const m = market();
  m.insightsLatest = insight(20);
  let shown = presentCampaignFixtures([fixture()], [m], [match()], () => insight(61, 'WWWWW'))[0];
  assert.equal(shown.homeForm, 'WWDLD');
  assert.equal(shown.formFetchedAt, at(20));
  m.insightsLatest = insight(61);
  shown = presentCampaignFixtures([fixture()], [m], [match()])[0];
  assert.equal(shown.homeForm, undefined);
  assert.equal(shown.formFetchedAt, null);
  m.insightsLatest = { ...insight(20), fetchedAt: 'not-a-timestamp' };
  shown = presentCampaignFixtures([fixture()], [m], [match()])[0];
  assert.equal(shown.formFetchedAt, null);
  m.insightsLatest = insight(60);
  assert.equal(presentCampaignFixtures([fixture()], [m], [match()])[0].formFetchedAt, at(60));
});

check('frozen form wins over newer cache and never triggers another cache read', () => {
  const m = market();
  m.insightSnapshot = snapshot(10);
  m.insightsLatest = insight(30, 'LLLLL');
  let peeks = 0;
  const [shown] = presentCampaignFixtures([fixture()], [m], [match()], () => {
    peeks++;
    return insight(40, 'WWWWW');
  });
  assert.equal(peeks, 0);
  assert.equal(shown.formFetchedAt, at(10));
  assert.equal(shown.homeForm, 'WWDLD');
  m.insightSnapshot = snapshot(61);
  assert.equal(
    presentCampaignFixtures([fixture()], [m], [match()])[0].homeForm,
    undefined,
    'An ineligible frozen snapshot cannot be replaced by mutable live form.',
  );
});

check('market, fixture and upstream insight identity must agree before enrichment', () => {
  const f = fixture();
  for (const [markets, matches] of [
    [[], [match()]],
    [[market()], []],
    [[{ ...market(), matchId: 'another-fixture' }], [match()]],
  ] as const) {
    assert.deepEqual(presentCampaignFixtures([f], markets, matches), [f]);
  }
  for (const wrong of [
    { ...insight(20), matchId: 'another-match' },
    { ...insight(20), fixtureId: 'another-upstream-fixture' },
    { ...insight(20), provider: 'another-provider' },
  ]) {
    const [shown] = presentCampaignFixtures(
      [f],
      [{ ...market(), insightsLatest: wrong }],
      [match()],
    );
    assert.equal(shown.homeForm, undefined);
    assert.equal(shown.awayForm, undefined);
    assert.equal(shown.formFetchedAt, null);
  }
});

check('form follows exact team IDs, never team names or the opposite side', () => {
  const wrongTeam = insight(20);
  wrongTeam.table = { home: table('team-away', 'WWWWW'), away: table('team-home', 'LLLLL') };
  let shown = presentCampaignFixtures(
    [fixture()],
    [{ ...market(), insightsLatest: wrongTeam }],
    [match()],
  )[0];
  assert.equal(shown.homeForm, undefined);
  assert.equal(shown.awayForm, undefined);
  const noIds = match();
  delete noIds.home.id;
  delete noIds.away.id;
  shown = presentCampaignFixtures(
    [fixture()],
    [{ ...market(), insightsLatest: insight(20) }],
    [noIds],
  )[0];
  assert.equal(shown.formFetchedAt, null);
});

check('unsupported result strings stay unavailable rather than inventing a form sequence', () => {
  const [shown] = presentCampaignFixtures(
    [fixture()],
    [{ ...market(), insightsLatest: insight(20, 'wwwww', 'WXDLW') }],
    [match()],
  );
  assert.equal(shown.homeForm, undefined);
  assert.equal(shown.awayForm, undefined);
  assert.equal(shown.formFetchedAt, null);
});

check('logos reject scripts, credentials, insecure URLs and disguised external authorities', () => {
  for (const unsafe of [
    'javascript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'http://logos.example.test/a.svg',
    '//logos.example.test/a.svg',
    'https://user:password@logos.example.test/a.svg',
    '/\\logos.example.test/a.svg',
    '/\\user:password@logos.example.test/a.svg',
    '/\n/logos.example.test/a.svg',
  ]) {
    const m = match();
    m.home.logo = unsafe;
    m.away.logo = unsafe;
    const [shown] = presentCampaignFixtures([fixture()], [market()], [m]);
    assert.equal(shown.homeLogo, null, `Unsafe home logo: ${JSON.stringify(unsafe)}`);
    assert.equal(shown.awayLogo, null, `Unsafe away logo: ${JSON.stringify(unsafe)}`);
  }
});

check('presentation leaves fixture rules, pools, fees and saved analytics untouched', () => {
  const fixtures = [fixture()];
  const markets = [{ ...market(), insightsLatest: insight(20) }];
  const matches = [match()];
  const saved = structuredClone({ fixtures, markets, matches });
  const [shown] = presentCampaignFixtures(fixtures, markets, matches);
  assert.deepEqual({ fixtures, markets, matches }, saved);
  const { homeLogo, awayLogo, homeForm, awayForm, formFetchedAt, ...rules } = shown;
  assert.deepEqual(rules, saved.fixtures[0]);
  assert.ok(homeLogo && awayLogo && homeForm && awayForm && formFetchedAt);
});

console.log(`${checks} campaign fixture presentation checks passed.`);
