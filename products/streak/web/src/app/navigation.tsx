import { Fragment, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Icon } from '../components/icon';
import { activityHref, followActivity, directHref, followDirect } from '../lib/direct-route';
import { navigateMarket } from '../lib/market-route';
import { sectionHref, followSection } from '../lib/section-route';
import { campaignHref, followCampaign } from '../lib/campaign-route';
import type { CampaignSummary } from '../../../shared/campaign-wire';

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
    label: 'Overview',
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
  const main = mobile
    ? entries.filter((e) => ['overview', 'markets', 'activity', 'wallet'].includes(e.id))
    : [
        'overview',
        'markets',
        'matchday',
        'five',
        'survivor',
        'competitions',
        'clubhouse',
        'activity',
        'wallet',
      ].flatMap((id) => entries.filter((e) => e.id === id));
  const additional = entries.filter((e) =>
    ['five', 'survivor', 'matchday', 'clubhouse', 'competitions'].includes(e.id),
  );
  const groups: Record<string, string> = {
    overview: 'YOUR TOUCHLINE',
    markets: 'PREDICTIONS',
    five: 'STREAK GAMES',
    clubhouse: 'COMMUNITY',
    activity: 'YOUR SPACE',
    competitions: 'COMPETITIONS',
  };
  return (
    <>
      <nav
        className={mobile ? 'mobile-dock' : undefined}
        aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
      >
        {main.map((entry) => (
          <Fragment key={entry.id}>
            {!mobile && groups[entry.id] && <span className="nav-group">{groups[entry.id]}</span>}
            <a
              key={entry.id}
              href={entry.href}
              onClick={entry.follow}
              aria-current={
                active === entry.id && (entry.id !== 'competitions' || !selectedCampaign)
                  ? 'page'
                  : undefined
              }
            >
              <Icon name={entry.icon} />
              {mobile && entry.id === 'activity' ? 'Activity' : entry.label}
              {!mobile && ['five', 'survivor'].includes(entry.id) && (
                <small className="nav-coming">Beta</small>
              )}
            </a>
            {!mobile &&
              entry.id === 'competitions' &&
              campaigns
                .filter((c) => c.state !== 'deleted')
                .map((campaign) => (
                  <a
                    key={campaign.id}
                    className="campaign-nav-link"
                    href={campaignHref(campaign.id)}
                    onClick={(event) => followCampaign(event, campaign.id)}
                    aria-current={
                      active === 'competitions' && selectedCampaign === campaign.id
                        ? 'page'
                        : undefined
                    }
                  >
                    <span>{campaign.name}</span>
                    <small>
                      {campaign.rehearsal
                        ? 'Rehearsal'
                        : campaign.state === 'finished'
                          ? 'Finished'
                          : campaign.state === 'draft'
                            ? 'Draft'
                            : campaign.state === 'live'
                              ? 'Live'
                              : campaign.state === 'finalizing'
                                ? 'Finalizing'
                                : 'Open'}
                    </small>
                  </a>
                ))}
          </Fragment>
        ))}
        {mobile && (
          <button
            className="mobile-more"
            aria-haspopup="dialog"
            aria-label="More pages"
            data-active={additional.some((e) => e.id === active)}
            onClick={() => menu.current?.showModal()}
          >
            <Icon name="more" />
            More
          </button>
        )}
      </nav>
      {mobile && (
        <dialog ref={menu} className="navigation-sheet" aria-label="More pages">
          <header>
            <h2>Around the game</h2>
            <button aria-label="Close navigation" onClick={() => menu.current?.close()}>
              ×
            </button>
          </header>
          <nav>
            {additional.map((entry) => (
              <a
                key={entry.id}
                href={entry.href}
                aria-current={active === entry.id ? 'page' : undefined}
                onClick={(event) => {
                  entry.follow(event);
                  menu.current?.close();
                }}
              >
                <Icon name={entry.icon} />
                {entry.label}
                {['five', 'survivor'].includes(entry.id) && (
                  <small className="nav-coming">Beta</small>
                )}
              </a>
            ))}
            {campaigns
              .filter((c) => c.state !== 'deleted')
              .map((campaign) => (
                <a
                  key={campaign.id}
                  className="campaign-nav-link"
                  href={campaignHref(campaign.id)}
                  aria-current={
                    active === 'competitions' && selectedCampaign === campaign.id
                      ? 'page'
                      : undefined
                  }
                  onClick={(event) => {
                    followCampaign(event, campaign.id);
                    menu.current?.close();
                  }}
                >
                  <span>{campaign.name}</span>
                  <small>
                    {campaign.rehearsal
                      ? 'Rehearsal'
                      : campaign.state === 'finished'
                        ? 'Finished'
                        : campaign.state === 'draft'
                          ? 'Draft'
                          : campaign.state === 'live'
                            ? 'Live'
                            : campaign.state === 'finalizing'
                              ? 'Finalizing'
                              : 'Open'}
                  </small>
                </a>
              ))}
          </nav>
        </dialog>
      )}
    </>
  );
}
