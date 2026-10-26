import { Icon } from '../../components/icon';
import type { FiveRound } from './api';
import { money } from './api';

export type WorkspaceTab = 'team' | 'standings' | 'sponsors' | 'activity' | 'more';
const tabs: [WorkspaceTab, string][] = [
  ['team', 'My five'],
  ['standings', 'Standings'],
  ['sponsors', 'Sponsors'],
  ['activity', 'Activity'],
  ['more', 'More'],
];
export function WorkspaceTabs({
  value,
  onChange,
}: {
  value: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <nav className="five-workspace-tabs" role="tablist" aria-label="Streak Five sections">
      {tabs.map(([id, label], index) => (
        <button
          key={id}
          id={`five-tab-${id}`}
          type="button"
          role="tab"
          aria-selected={value === id}
          aria-controls={`five-panel-${id}`}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onChange(tabs[next][0]);
            document.getElementById(`five-tab-${tabs[next][0]}`)?.focus();
          }}
        >
          {label}
          {id === 'more' && <Icon name="chevron-down" />}
        </button>
      ))}
    </nav>
  );
}
export function BackToSquad({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="five-back-squad" onClick={onClick}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m10 6-6 6 6 6M4 12h16" />
      </svg>
      Back to squad
    </button>
  );
}
export function SponsorCredit({ round, onOpen }: { round: FiveRound; onOpen: () => void }) {
  const sponsor = round.sponsors[0];
  return (
    <button type="button" className="five-sponsor-credit" onClick={onOpen}>
      {sponsor?.logo.startsWith('https://') && (
        <img
          src={sponsor.logo}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <span>
        <small>
          {sponsor
            ? 'GAMEWEEK SPONSOR'
            : round.auction?.state === 'open'
              ? 'SPONSOR AUCTION · OPEN'
              : 'FREE TO PLAY'}
        </small>
        <strong>
          {sponsor?.name ??
            (round.auction?.state === 'open'
              ? 'Your brand could be here'
              : 'A weekend for everyone.')}
        </strong>
        {sponsor?.introduction && <span>{sponsor.introduction}</span>}
      </span>
      <span className="five-credit-link">
        {sponsor ? 'Meet the sponsor' : 'Explore sponsorship'} <Icon name="arrow" />
      </span>
    </button>
  );
}
export function SponsorShowcase({ round }: { round: FiveRound }) {
  if (!round.sponsors.length) return null;
  return (
    <div className="five-sponsor-showcases">
      {round.sponsors.map((sponsor) => (
        <article className="glass five-sponsor-showcase" key={sponsor.id}>
          <p className="eyebrow">
            {round.auction ? 'THIS GAMEWEEK’S WINNING SPONSOR' : 'BACKING THIS GAMEWEEK'}
          </p>
          <div className="five-sponsor-identity">
            {sponsor.logo.startsWith('https://') && (
              <img
                src={sponsor.logo}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            )}
            <div>
              <h2>{sponsor.name}</h2>
              {sponsor.introduction && <p>{sponsor.introduction}</p>}
            </div>
          </div>
          {sponsor.description ? (
            <p className="five-sponsor-description">{sponsor.description}</p>
          ) : (
            <p className="five-sponsor-description">
              Supporting the players and this gameweek’s reward pool.
            </p>
          )}
          {sponsor.link.startsWith('https://') && (
            <a
              className="btn"
              href={sponsor.link}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              Explore {sponsor.name}
              <Icon name="arrow" />
            </a>
          )}
          <div className="five-sponsor-contribution">
            <small>{round.auction ? 'WINNING CONTRIBUTION' : 'CONFIRMED CONTRIBUTION'}</small>
            <strong>
              {money(round.auction ? round.poolShannons : sponsor.amountShannons)} tCKB
            </strong>
          </div>
        </article>
      ))}
    </div>
  );
}
