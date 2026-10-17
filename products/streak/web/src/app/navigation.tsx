import { useRef } from 'react';
import type { MouseEvent } from 'react';
import { Icon } from '../components/icon';
import { activityHref, followActivity, directHref, followDirect } from '../lib/direct-route';
import { navigateMarket } from '../lib/market-route';
import { sectionHref, followSection } from '../lib/section-route';

const entries = [
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

export function AppNavigation({ active, mobile = false }: { active: string; mobile?: boolean }) {
  const menu = useRef<HTMLDialogElement>(null);
  const main = mobile
    ? entries.filter((e) => ['overview', 'markets', 'activity', 'wallet'].includes(e.id))
    : entries;
  const additional = entries.filter((e) => ['five', 'matchday', 'clubhouse'].includes(e.id));
  return (
    <>
      <nav
        className={mobile ? 'mobile-dock' : undefined}
        aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
      >
        {main.map((entry) => (
          <a
            key={entry.id}
            href={entry.href}
            onClick={entry.follow}
            aria-current={active === entry.id ? 'page' : undefined}
          >
            <Icon name={entry.icon} />
            {mobile && entry.id === 'activity' ? 'Activity' : entry.label}
            {!mobile && entry.id === 'five' && <small className="nav-coming">Soon</small>}
          </a>
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
                {entry.id === 'five' && <small className="nav-coming">Soon</small>}
              </a>
            ))}
          </nav>
        </dialog>
      )}
    </>
  );
}
