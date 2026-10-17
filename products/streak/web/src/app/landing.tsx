import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../components/icon';
import { getMarkets } from '../features/markets/api';
import type { Market } from '../features/markets/api';
import { weekend } from '../features/markets/weekend';
import '../design-system/landing.css';

function Club({ logo, name, code }: { logo: string | null; name: string; code: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="welcome-club">
      {logo && !failed ? (
        <img src={logo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="welcome-crest" aria-hidden="true">
          {code.slice(0, 4)}
        </span>
      )}
      <strong>{name}</strong>
    </span>
  );
}

function Fixture({ market, featured = false }: { market: Market; featured?: boolean }) {
  return (
    <article className={featured ? 'welcome-featured' : 'welcome-fixture'}>
      <div className="welcome-fixture-meta">
        <span>{market.competition}</span>
        <time dateTime={market.kickoff}>
          {new Date(market.kickoff).toLocaleString('en-GB', {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      </div>
      <div className="welcome-teams">
        <Club
          key={market.homeLogo}
          logo={market.homeLogo}
          name={market.home}
          code={market.homeCode}
        />
        <span className="welcome-vs" aria-hidden="true">
          vs
        </span>
        <Club
          key={market.awayLogo}
          logo={market.awayLogo}
          name={market.away}
          code={market.awayCode}
        />
      </div>
      {featured && (
        <div className="welcome-outcomes" aria-label="Three possible outcomes">
          <span className="outcome-glass" data-outcome="home">
            <b>1</b> Home
          </span>
          <span className="outcome-glass" data-outcome="draw">
            <b>X</b> Draw
          </span>
          <span className="outcome-glass" data-outcome="away">
            <b>2</b> Away
          </span>
        </div>
      )}
    </article>
  );
}

export function Landing() {
  const [day, setDay] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Recalculate the matchweek after midnight and when a sleeping tab returns.
    const refreshCalendar = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    const timer = window.setInterval(refreshCalendar, 60_000);
    document.addEventListener('visibilitychange', refreshCalendar);
    window.addEventListener('focus', refreshCalendar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshCalendar);
      window.removeEventListener('focus', refreshCalendar);
    };
  }, []);
  const dates = weekend(0, now);
  const from = day === null ? dates.start : dates.days[day];
  const to =
    day === null ? dates.end : new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const feed = useQuery({
    queryKey: ['markets', 'all', '', fromIso, toIso, 'landing'],
    queryFn: ({ signal }) => getMarkets('all', '', 0, fromIso, toIso, signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const fixtures = feed.data?.markets.slice(0, 3) ?? [];
  return (
    <div className="welcome">
      <a href="#welcome-main" className="skip">
        Skip to content
      </a>
      <header className="welcome-header">
        <a className="welcome-brand" href="/" aria-label="Streak home">
          <span>S</span>streak<span className="welcome-dot">.</span>
        </a>
        <nav aria-label="Explore Streak">
          <a href="#how-it-works">How it works</a>
          <a href="#five">
            Streak Five <span>Soon</span>
          </a>
        </nav>
        <a className="welcome-button welcome-button-small" href="/season/">
          Open Streak <Icon name="arrow" />
        </a>
      </header>

      <main id="welcome-main" tabIndex={-1}>
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <p className="welcome-kicker">
              <span /> FOOTBALL. WITH SOMETHING TO SAY.
            </p>
            <h1 id="welcome-title">
              You know
              <br />
              the game.
              <br />
              <em>Make it yours.</em>
            </h1>
            <p className="welcome-intro">
              The late winner. The unlikely draw. The call you saw coming. Give your football
              instinct a place to play.
            </p>
            <div className="welcome-actions">
              <a className="welcome-button welcome-button-primary" href="/season/">
                Explore the markets <Icon name="arrow" />
              </a>
              <a className="welcome-text-link" href="#how-it-works">
                How it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="welcome-caption">Browse first. Connect when you’re ready.</p>
            <div className="welcome-network">
              <span className="welcome-network-mark">
                <img src="/ckb-mark.png" width="17" height="17" alt="" />
              </span>
              <div>
                Built on Nervos CKB <small>Pudge testnet · No real-money stakes</small>
              </div>
            </div>
          </div>

          <div className="welcome-showcase">
            <div className="welcome-pitch" aria-hidden="true">
              <span />
              <i />
            </div>
            <section className="glass welcome-board" aria-labelledby="weekend-heading">
              <div className="welcome-board-heading">
                <div>
                  <p className="welcome-label">YOUR WEEKEND LINEUP</p>
                  <h2 id="weekend-heading">A whole weekend of possibilities.</h2>
                </div>
                <Icon name="activity" />
              </div>
              <div className="welcome-dates">
                <span>
                  {dates.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to{' '}
                  {dates.days[3].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <span>Friday through Monday · Big games first</span>
              </div>
              <div className="welcome-days" role="group" aria-label="Preview fixtures by day">
                <button aria-pressed={day === null} onClick={() => setDay(null)}>
                  All
                </button>
                {dates.days.map((date, index) => (
                  <button key={index} aria-pressed={day === index} onClick={() => setDay(index)}>
                    {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </button>
                ))}
              </div>
              <div className="welcome-feed" aria-busy={feed.isFetching}>
                {feed.isPending ? (
                  <p className="welcome-feed-message" role="status">
                    Finding your fixtures…
                  </p>
                ) : feed.isError && !feed.data ? (
                  <div className="welcome-feed-message" role="status">
                    <strong>The fixture feed is taking a break.</strong>
                    <p>You can still explore Streak. Try the schedule again in a moment.</p>
                    <button onClick={() => void feed.refetch()}>Retry fixtures</button>
                  </div>
                ) : fixtures.length ? (
                  fixtures.map((market, index) => (
                    <Fixture key={market.id} market={market} featured={index === 0} />
                  ))
                ) : (
                  <div className="welcome-feed-message" role="status">
                    <strong>
                      {feed.data?.covered
                        ? 'No fixtures on this day.'
                        : 'The schedule is not available yet.'}
                    </strong>
                    <p>
                      {feed.data?.covered
                        ? 'Try another day or explore the full matchweek.'
                        : 'Check back for the latest fixtures from our football feed.'}
                    </p>
                  </div>
                )}
              </div>
              {feed.data && (!feed.data.covered || feed.isError) && (
                <p className="welcome-coverage" role="status">
                  {feed.isError
                    ? 'The refresh failed. These fixtures may be out of date.'
                    : 'Part of the schedule is still unavailable.'}
                </p>
              )}
              <a className="welcome-board-link" href="/season/">
                See all fixtures <Icon name="arrow" />
              </a>
            </section>
            <div className="welcome-note glass">
              <span aria-hidden="true">↗</span>
              <div>
                Every match has a story.<small>This one starts with your call.</small>
              </div>
            </div>
          </div>
        </section>

        <div className="welcome-ribbon" aria-label="The Streak experience">
          <span>YOUR GAME. YOUR CALL.</span>
          <b>Read the match</b>
          <i aria-hidden="true">✳</i>
          <b>Choose your side</b>
          <i aria-hidden="true">✳</i>
          <b>Follow the story</b>
        </div>

        <section className="welcome-how" id="how-it-works" aria-labelledby="how-heading">
          <div className="welcome-section-heading">
            <div>
              <p className="welcome-label">FROM THE TOUCHLINE</p>
              <h2 id="how-heading">
                Less friction.
                <br />
                <span>More football.</span>
              </h2>
            </div>
            <p>
              Start with a match you care about.
              <br />
              Keep the details within reach.
            </p>
          </div>
          <div className="welcome-steps">
            <article className="glass welcome-step">
              <div className="welcome-step-top">
                <span>01</span>
                <Icon name="search" />
              </div>
              <h3>Find your fixture.</h3>
              <p>
                Explore the matchweek, from Friday’s opener to Monday’s final whistle. Real
                schedules. Familiar teams. Your choice.
              </p>
              <a href="/season/">
                Browse matches <Icon name="arrow" />
              </a>
            </article>
            <article className="glass welcome-step">
              <div className="welcome-step-top">
                <span>02</span>
                <Icon name="markets" />
              </div>
              <h3>Back your reading.</h3>
              <p>
                Home, draw or away. Open a market, read the pool and review your testnet stake
                before making a prediction.
              </p>
              <span className="welcome-step-foot">Pool shares, not fixed odds</span>
            </article>
            <article className="glass welcome-step">
              <div className="welcome-step-top">
                <span>03</span>
                <Icon name="activity" />
              </div>
              <h3>Stay for the story.</h3>
              <p>
                Follow the match, revisit your predictions and inspect the published result. Your
                activity keeps the whole run together.
              </p>
              <span className="welcome-step-foot">From first pick to final whistle</span>
            </article>
          </div>
        </section>

        <section className="glass welcome-five" id="five" aria-labelledby="five-heading">
          <div className="welcome-five-copy">
            <p className="welcome-label">
              THE NEXT CHAPTER <span>In development</span>
            </p>
            <h2 id="five-heading">
              Five players.
              <br />
              One big weekend.
            </h2>
            <p>
              Your eye for a player deserves its own game. Streak Five is our upcoming fantasy
              experience, built around a five-player lineup.
            </p>
            <a className="welcome-text-link" href="/season/">
              Explore predictions while we build <Icon name="arrow" />
            </a>
          </div>
          <div className="welcome-five-art" aria-hidden="true">
            <div className="welcome-five-number">
              5<span>FIVE</span>
            </div>
            <div className="welcome-shirts">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
            <span className="welcome-five-caption">YOUR LINEUP. YOUR INSTINCT.</span>
          </div>
        </section>

        <section className="welcome-faq" aria-labelledby="faq-heading">
          <div>
            <p className="welcome-label">BEFORE YOU JUMP IN</p>
            <h2 id="faq-heading">
              A few good
              <br />
              questions.
            </h2>
            <p>Know what you’re playing.</p>
          </div>
          <div className="welcome-questions">
            <details>
              <summary>
                Do I need a wallet to look around?<span aria-hidden="true">+</span>
              </summary>
              <p>
                No. Browse the schedule and markets first. You’ll need a supported wallet to sign in
                and use account features.
              </p>
            </details>
            <details>
              <summary>
                Am I playing with real money?<span aria-hidden="true">+</span>
              </summary>
              <p>
                This is an early-access experience on CKB Pudge testnet. Testnet CKB has no monetary
                value. No real-money stakes or cash prizes are offered here.
              </p>
            </details>
            <details>
              <summary>
                How do the prediction pools work?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Predictions join a shared pool across home, draw and away. Returns depend on the
                final pool and the market rules, so displayed pool percentages are not fixed odds or
                guaranteed returns. Review the terms in the market before confirming.
              </p>
            </details>
            <details>
              <summary>
                Where are my testnet funds held?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Current markets use Streak’s custodial treasury and account ledger. The operator
                manages funds and reports football results. Direct-market smart contracts are a
                separate implementation in progress. Your current balance and withdrawals remain in
                Wallet.
              </p>
              <a href="/index.html#wallet">
                Open Wallet <Icon name="arrow" />
              </a>
            </details>
            <details>
              <summary>
                Can I play Streak Five yet?<span aria-hidden="true">+</span>
              </summary>
              <p>
                Not yet. Five is in development. We’ll publish entry, scoring and reward rules
                before it opens. The preview above is a design introduction, not an active
                competition.
              </p>
            </details>
          </div>
        </section>

        <section className="welcome-finale">
          <p className="welcome-label">THE NEXT CALL IS YOURS</p>
          <h2>
            Meet you at
            <br />
            <em>the next kickoff.</em>
          </h2>
          <a className="welcome-button welcome-button-primary" href="/season/">
            Find your match <Icon name="arrow" />
          </a>
          <p>CKB testnet. Football instinct. A fresh start.</p>
        </section>
      </main>
      <footer className="welcome-footer">
        <a className="welcome-brand" href="/" aria-label="Streak home">
          streak<span className="welcome-dot">.</span>
        </a>
        <span>Football predictions on Nervos CKB.</span>
        <a href="/season/">
          Markets <Icon name="arrow" />
        </a>
        <a href="/index.html#wallet">
          Wallet <Icon name="wallet" />
        </a>
        <small>Early access · Pudge testnet</small>
      </footer>
    </div>
  );
}
