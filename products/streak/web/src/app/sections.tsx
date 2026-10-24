import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icon';
import { TeamBadge } from '../components/team-badge';
import { getMarkets } from '../features/markets/api';
import { poolLabel } from '../features/markets/pools';
import { usePools } from '../features/markets/use-pools';
import type { Market } from '../features/markets/api';
import { useMatchweek } from '../features/markets/use-matchweek';
import type { Outcome, Pick } from '../features/predictions/draft';
import { followMarket, marketHref } from '../lib/market-route';
import { followSection, sectionHref } from '../lib/section-route';
import type { Section } from '../lib/section-route';
import { activityHref, followActivity, directHref, followDirect } from '../lib/direct-route';
import './sections.css';

function FiveArtwork() {
  return (
    <div className="five-art" aria-hidden="true">
      <span className="five-art-caption">Small squad. Big weekend.</span>
      {['coral', 'mint', 'blue'].map((color, i) => (
        <svg key={color} className={color} viewBox="0 0 160 190">
          <path d="m48 17-40 30 17 36 22-14-9 104q42 17 84 0l-9-104 22 14 17-36-40-30q-32 25-64 0z" />
          <path className="shirt-collar" d="M48 17q32 32 64 0" />
          <image
            className="shirt-ckb-mark"
            href="/ckb-mark.png"
            x="101"
            y="51"
            width="15"
            height="15"
          />
          <text className="shirt-ckb-label" x="108.5" y="74" textAnchor="middle">
            CKB
          </text>
          <text x="80" y="120" textAnchor="middle">
            {[1, 5, 3][i]}
          </text>
          <path className="shirt-seam" d="M58 143h44" />
        </svg>
      ))}
    </div>
  );
}
function FiveHero({ full = false }: { full?: boolean }) {
  return (
    <section className="glass five-hero">
      <div className="five-hero-copy">
        <p className="eyebrow">
          INTRODUCING STREAK FIVE <span>Beta</span>
        </p>
        <h2>
          Your weekend.
          <br />
          <em>Your starting five.</em>
        </h2>
        <p>Five players. One captain. A whole weekend of reasons to watch.</p>
        {full ? (
          <p className="five-availability">
            Squad entry is not open yet. Scoring, player availability and competition rules are
            being prepared.
          </p>
        ) : (
          <a
            className="five-action"
            href={sectionHref('five')}
            onClick={(e) => followSection(e, 'five')}
          >
            Explore Streak Five <Icon name="arrow" />
          </a>
        )}
        <small>Fantasy play is separate from your predictions and wallet.</small>
      </div>
      <FiveArtwork />
    </section>
  );
}
function Overview({
  onPick,
  picks,
}: {
  onPick: (market: Market, outcome: Outcome) => void;
  picks: readonly Pick[];
}) {
  const dates = useMatchweek(),
    from = dates.start.toISOString(),
    to = dates.end.toISOString();
  const fixtures = useQuery({
    queryKey: ['overview-fixtures', from, to],
    queryFn: ({ signal }) => getMarkets('all', '', 0, from, to, signal, 'featured'),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const pools = usePools(fixtures.data?.markets.map((m) => m.matchId) ?? []);
  return (
    <section className="overview-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">
            {new Date()
              .toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
              .toUpperCase()}
          </p>
          <h1>Good to have you here.</h1>
          <p>A new matchweek. A few good calls to make.</p>
        </div>
      </div>
      <FiveHero />
      <div className="overview-grid">
        <section>
          <header className="overview-section-heading">
            <div>
              <h2>A weekend worth watching</h2>
              <p>Pick a side. Make the match yours.</p>
            </div>
            <a href="/season/" onClick={(event) => followMarket(event, null)}>
              All markets <Icon name="arrow" />
            </a>
          </header>
          {fixtures.isPending && (
            <p className="notice" role="status">
              Loading this weekend's fixtures...
            </p>
          )}
          {fixtures.isError && (
            <div className="notice error" role="alert">
              <p>Fixtures are unavailable right now.</p>
              <button onClick={() => void fixtures.refetch()}>Retry fixtures</button>
            </div>
          )}
          {fixtures.data && fixtures.data.markets.length === 0 && (
            <p className="notice">
              {fixtures.data.covered
                ? 'No fixtures scheduled for this weekend.'
                : 'The weekend schedule is not fully available yet.'}
            </p>
          )}
          <div className="glass overview-fixtures">
            {fixtures.data?.markets.slice(0, 6).map((m) => (
              <article
                key={m.id}
                className="overview-fixture"
                data-selected={picks.some((p) => p.matchId === m.matchId)}
              >
                <div className="overview-fixture-top">
                  <span>{m.competition}</span>
                  <time dateTime={m.kickoff}>
                    {new Date(m.kickoff).toLocaleString('en-GB', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <div className="overview-match">
                  <div>
                    <TeamBadge logo={m.homeLogo} code={m.homeCode} side="home" />
                    <span>{m.home}</span>
                  </div>
                  <small>vs</small>
                  <div>
                    <TeamBadge logo={m.awayLogo} code={m.awayCode} side="away" />
                    <span>{m.away}</span>
                  </div>
                </div>
                {m.available && m.status === 'open' && m.fixtureStatus === 'scheduled' ? (
                  <div className="overview-outcomes">
                    {(['home', 'draw', 'away'] as const).map((outcome, i) => (
                      <button
                        key={outcome}
                        className="outcome-glass"
                        data-outcome={outcome}
                        aria-pressed={picks.some(
                          (p) => p.matchId === m.matchId && p.outcome === outcome,
                        )}
                        aria-label={`Add ${['Home', 'Draw', 'Away'][i]} for ${m.home} vs ${m.away}`}
                        onClick={() => onPick(m, outcome)}
                      >
                        <span>{['Home', 'Draw', 'Away'][i]}</span>
                        <strong>
                          {poolLabel(pools.get(m.matchId), outcome, ['1', 'X', '2'][i])}
                        </strong>
                        {picks.some((p) => p.matchId === m.matchId && p.outcome === outcome) && (
                          <i className="outcome-selected" aria-hidden="true">
                            ✓
                          </i>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="overview-fixture-state">{m.fixtureStatus}</p>
                )}
                {m.available && (
                  <a
                    className="overview-detail"
                    aria-label={`Match details for ${m.home} vs ${m.away}`}
                    href={marketHref(m.id)}
                    onClick={(e) => followMarket(e, m.id)}
                  >
                    <Icon name="arrow" />
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
        <aside className="overview-links">
          <a className="glass overview-blue-card" href={activityHref} onClick={followActivity}>
            <p className="eyebrow">YOUR MATCHDAY</p>
            <Icon name="activity" />
            <strong>
              Every call.
              <br />
              One place.
            </strong>
            <p>
              Your predictions, payments and claims. Follow the story from kickoff to the final
              whistle.
            </p>
            <div className="overview-card-tickets" aria-hidden="true">
              <b>1</b>
              <b>X</b>
              <b>2</b>
            </div>
            <span>
              Open activity <Icon name="arrow" />
            </span>
          </a>
          <a
            className="glass overview-account-card"
            href={directHref()}
            onClick={(e) => followDirect(e)}
          >
            <p className="eyebrow">STAY IN THE GAME</p>
            <Icon name="account" />
            <strong>Keep your matchday close.</strong>
            <p>Your wallet and Telegram connection, together in My Account.</p>
            <span>
              My Account <Icon name="arrow" />
            </span>
          </a>
        </aside>
      </div>
    </section>
  );
}
export function SectionPage({
  section,
  onPick,
  picks,
}: {
  section: Section;
  onPick: (market: Market, outcome: Outcome) => void;
  picks: readonly Pick[];
}) {
  if (section === 'overview') return <Overview onPick={onPick} picks={picks} />;
  if (section === 'five')
    return (
      <section className="feature-page">
        <div className="page-title">
          <div>
            <p className="eyebrow">YOUR FANTASY LINEUP</p>
            <h1>Streak Five</h1>
            <p>A smaller squad. More reasons to watch.</p>
          </div>
        </div>
        <FiveHero full />
        <div className="feature-steps">
          {[
            ['01', 'Pick five', 'Choose a compact squad from the available matchweek players.'],
            ['02', 'Choose your captain', 'Make one player the centre of your weekend.'],
            [
              '03',
              'Follow the weekend',
              'Track your squad against the published competition rules.',
            ],
          ].map(([n, title, body]) => (
            <article className="glass" key={n}>
              <span>{n}</span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p className="feature-status">
          Coming soon. Final rules and scoring will be published before entries open. No squad or
          reward is being recorded yet.
        </p>
        <a className="five-action" href="/season/" onClick={(event) => followMarket(event, null)}>
          Explore prediction markets <Icon name="arrow" />
        </a>
      </section>
    );
  const matchday = section === 'matchday';
  return (
    <section className="feature-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">{matchday ? 'FOLLOW THE FOOTBALL' : 'AROUND THE GAME'}</p>
          <h1>{matchday ? 'Matchday' : 'Clubhouse'}</h1>
          <p>
            {matchday
              ? 'Follow the action and keep your predictions close.'
              : 'A place for your crew and the wider Streak community.'}
          </p>
        </div>
      </div>
      <section className="glass retained-feature">
        <Icon name={matchday ? 'matchday' : 'community'} />
        <h2>{matchday ? 'Your matchday tools are still here.' : 'Bring your crew together.'}</h2>
        <p>
          {matchday
            ? 'Open the existing match centre for fixtures and match information. Your direct testnet predictions and claims stay in My activity.'
            : 'Crews and the leaderboard are available in the existing community screens while their new layout is being prepared.'}
        </p>
        <div className="feature-actions">
          {matchday ? (
            <>
              <a className="five-action" href="/index.html#/matchday">
                Open match centre <Icon name="arrow" />
              </a>
              <a href={activityHref} onClick={followActivity}>
                My activity <Icon name="arrow" />
              </a>
            </>
          ) : (
            <>
              <a className="five-action" href="/index.html#/crews">
                Open crews <Icon name="arrow" />
              </a>
              <a href="/index.html#/leaderboard">
                View leaderboard <Icon name="arrow" />
              </a>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
