import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Icon } from '../components/icon';
import { activityHref, followActivity, directHref, followDirect } from '../lib/direct-route';
import { navigateMarket } from '../lib/market-route';
import { sectionHref, followSection } from '../lib/section-route';
import { campaignHref, followCampaign } from '../lib/campaign-route';
import type { CampaignSummary } from '../../../shared/campaign-wire';
import './navigation.css';

const entries = [
  {
    id: 'competitions',
    label: 'Competitions',
    icon: 'shield',
    href: campaignHref(),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followCampaign(e),
  },
  {
    id: 'overview',
    label: 'Home',
    icon: 'home',
    href: sectionHref('overview'),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followSection(e, 'overview'),
  },
  {
    id: 'five',
    label: 'Streak Five',
    icon: 'five',
    href: sectionHref('five'),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followSection(e, 'five'),
  },
  {
    id: 'survivor',
    label: 'Streak Survivor',
    icon: 'shield',
    href: sectionHref('survivor'),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followSection(e, 'survivor'),
  },
  {
    id: 'markets',
    label: 'Markets',
    icon: 'markets',
    href: '/season/',
    follow: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigateMarket(null);
    },
  },
  {
    id: 'matchday',
    label: 'Matchday',
    icon: 'matchday',
    href: sectionHref('matchday'),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followSection(e, 'matchday'),
  },
  {
    id: 'activity',
    label: 'My activity',
    icon: 'activity',
    href: activityHref,
    follow: followActivity,
  },
  {
    id: 'clubhouse',
    label: 'Clubhouse',
    icon: 'community',
    href: sectionHref('clubhouse'),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followSection(e, 'clubhouse'),
  },
  {
    id: 'wallet',
    label: 'My Account',
    icon: 'account',
    href: directHref(),
    follow: (e: MouseEvent<HTMLAnchorElement>) => followDirect(e),
  },
] as const;

type NavigationEntry = (typeof entries)[number];

function CompetitionIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3h10v7a5 5 0 0 1-10 0Zm0 2H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5m-4 2v6m-5 0h10" />
    </svg>
  );
}

function NavigationIcon({ entry }: { entry: NavigationEntry }) {
  return entry.id === 'competitions' ? <CompetitionIcon /> : <Icon name={entry.icon} />;
}

function CampaignIcon({ campaign }: { campaign: CampaignSummary }) {
  const url = campaign.artwork?.icon?.url;
  const [failedUrl, setFailedUrl] = useState<string>();
  useEffect(() => setFailedUrl(undefined), [url]);
  return (
    <span className="streak-nav-art" data-kind={campaign.kind}>
      {url && failedUrl !== url ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(url)} />
      ) : campaign.kind === 'five' ? (
        <Icon name="five" />
      ) : (
        <Icon name="markets" />
      )}
    </span>
  );
}

function campaignStatus(campaign: CampaignSummary) {
  const state = {
    draft: 'Draft',
    open: 'Open',
    live: 'Live',
    finalizing: 'Finalizing',
    finished: 'Finished',
    deleted: 'Deleted',
  }[campaign.state];
  return `${campaign.kind === 'five' ? 'Five' : 'Predictions'} · ${state}${campaign.rehearsal ? ' · Rehearsal' : ''}`;
}

const gameDescriptions: Record<string, string> = {
  matchday: 'Your match centre',
  five: 'Pick your five',
  survivor: 'Last one standing',
  clubhouse: 'Find your people',
};
const dockLabels: Record<string, string> = {
  overview: 'Home',
  competitions: 'Compete',
  activity: 'Activity',
};

export function AppNavigation({
  active,
  mobile = false,
  campaigns = [],
  selectedCampaign,
}: {
  active: string;
  mobile?: boolean;
  campaigns?: CampaignSummary[];
  selectedCampaign?: string | null;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const listedCampaigns = campaigns.filter((campaign) => campaign.state !== 'deleted');
  const selectedEntries = (ids: string[]) =>
    ids.flatMap((id) => entries.filter((e) => e.id === id));
  const moreActive = ['matchday', 'five', 'survivor', 'clubhouse', 'wallet'].includes(active);
  const closeAfterNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    // Keep ordinary browser behavior for modified clicks and new tabs.
    if (event.defaultPrevented) menu.current?.close();
  };
  const navigationLink = (entry: NavigationEntry, style = 'default') => (
    <a
      key={entry.id}
      className={`streak-nav-link streak-nav-link--${style}`}
      href={entry.href}
      data-destination={entry.id}
      aria-label={['wallet', 'survivor'].includes(entry.id) ? entry.label : undefined}
      aria-current={active === entry.id ? 'page' : undefined}
      onClick={(event) => {
        entry.follow(event);
        closeAfterNavigation(event);
      }}
    >
      <NavigationIcon entry={entry} />
      <span>
        {style === 'dock'
          ? (dockLabels[entry.id] ?? entry.label)
          : entry.id === 'survivor'
            ? 'Survivor'
            : entry.label}
      </span>
      {style !== 'dock' && ['five', 'survivor'].includes(entry.id) && (
        <small className="streak-nav-beta">Beta</small>
      )}
      {style === 'game' && (
        <small className="streak-nav-description">{gameDescriptions[entry.id]}</small>
      )}
      {style === 'account' && <small className="streak-nav-description">Wallet and profile</small>}
    </a>
  );

  const competitionSection = (
    <section className="streak-nav-competitions" aria-label="Competitions">
      <div className="streak-nav-competition-heading">
        <CompetitionIcon />
        <span>Competitions</span>
        <span className="streak-nav-count" aria-label={`${listedCampaigns.length} competitions`}>
          {listedCampaigns.length}
        </span>
      </div>
      {listedCampaigns.map((campaign) => (
        <a
          key={campaign.id}
          className="campaign-nav-link streak-nav-campaign"
          href={campaignHref(campaign.id)}
          aria-current={
            active === 'competitions' && selectedCampaign === campaign.id ? 'page' : undefined
          }
          onClick={(event) => {
            followCampaign(event, campaign.id);
            closeAfterNavigation(event);
          }}
        >
          <CampaignIcon campaign={campaign} />
          <span className="streak-nav-campaign-copy">
            <strong>{campaign.name}</strong>
            <small>{campaignStatus(campaign)}</small>
          </span>
        </a>
      ))}
      <a
        className="streak-nav-browse"
        href={campaignHref()}
        aria-current={active === 'competitions' && !selectedCampaign ? 'page' : undefined}
        onClick={(event) => {
          followCampaign(event);
          closeAfterNavigation(event);
        }}
      >
        <span>Browse competitions</span>
        <Icon name="arrow" />
      </a>
    </section>
  );

  if (!mobile)
    return (
      <nav className="streak-navigation" aria-label="Main navigation">
        {selectedEntries(['overview']).map((entry) => navigationLink(entry, 'overview'))}
        <section className="streak-nav-play" aria-label="Play">
          <p className="streak-nav-heading">Play</p>
          {selectedEntries(['markets', 'matchday', 'five', 'survivor']).map((entry) =>
            navigationLink(entry),
          )}
        </section>
        {competitionSection}
        <section className="streak-nav-personal" aria-label="Your space">
          <p className="streak-nav-heading">Your space</p>
          {selectedEntries(['activity', 'clubhouse']).map((entry) => navigationLink(entry))}
          {selectedEntries(['wallet']).map((entry) => navigationLink(entry, 'account'))}
        </section>
      </nav>
    );

  return (
    <>
      <nav className="mobile-dock streak-mobile-dock" aria-label="Mobile navigation">
        {selectedEntries(['overview', 'markets', 'competitions', 'activity']).map((entry) =>
          navigationLink(entry, 'dock'),
        )}
        <button
          ref={trigger}
          className="mobile-more"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="streak-navigation-sheet"
          aria-label="More pages"
          data-active={moreActive}
          onClick={() => {
            menu.current?.showModal();
            setMenuOpen(true);
          }}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
      <dialog
        ref={menu}
        id="streak-navigation-sheet"
        className="navigation-sheet streak-navigation-sheet"
        aria-label="More pages"
        onClose={() => {
          setMenuOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
      >
        <div className="streak-sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <p className="streak-nav-heading">Your touchline</p>
            <h2>Explore Streak</h2>
          </div>
          <button type="button" aria-label="Close navigation" onClick={() => menu.current?.close()}>
            <Icon name="close" />
          </button>
        </header>
        <nav aria-label="More navigation">
          <section className="streak-nav-play" aria-label="Play">
            <p className="streak-nav-heading">Play</p>
            <div className="streak-nav-game-grid">
              {selectedEntries(['matchday', 'five', 'survivor', 'clubhouse']).map((entry) =>
                navigationLink(entry, 'game'),
              )}
            </div>
          </section>
          {competitionSection}
          {selectedEntries(['wallet']).map((entry) => navigationLink(entry, 'account'))}
        </nav>
      </dialog>
    </>
  );
}
