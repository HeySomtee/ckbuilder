import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { CampaignSummary } from '../../../shared/campaign-wire';
import { CellLoader } from '../components/cell-loader';
import { Icon } from '../components/icon';
import { ckb, Trophy } from '../features/campaigns/presentation';
import { campaignHref, followCampaign } from '../lib/campaign-route';
import { followMarket } from '../lib/market-route';
import { followSection, sectionHref } from '../lib/section-route';
import './home-products.css';

export interface HomeProductsProps {
  campaigns: readonly CampaignSummary[];
  competitionsLoading: boolean;
  competitionsError: boolean;
  onRetryCompetitions: () => void;
}

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  action: string;
  detail: string;
  theme: 'predictions' | 'five' | 'survivor' | 'competition';
  href: string;
  follow: (event: MouseEvent<HTMLAnchorElement>) => void;
  banner?: string;
};

const games: readonly Product[] = [
  {
    id: 'predictions',
    name: 'Predictions',
    category: 'YOUR MATCH. YOUR CALL.',
    description: 'Home win, a stubborn draw, or the upset everyone missed.',
    detail: 'Choose a result. Follow the match.',
    status: 'On-chain',
    action: 'Explore markets',
    theme: 'predictions',
    href: '/season/',
    follow: (event) => followMarket(event, null),
  },
  {
    id: 'five',
    name: 'Streak Five',
    category: 'FIVE PLAYERS. ONE CAPTAIN.',
    description: 'Build your five. Follow their points through the gameweek.',
    detail: 'Premier League fantasy',
    status: 'Beta',
    action: 'Pick your five',
    theme: 'five',
    href: sectionHref('five'),
    follow: (event) => followSection(event, 'five'),
  },
  {
    id: 'survivor',
    name: 'Streak Survivor',
    category: 'ONE CLUB. EACH ROUND.',
    description: 'Pick a winning club. Stay in the game. Make every choice count.',
    detail: 'A fresh decision every round',
    status: 'Beta',
    action: 'Explore Survivor',
    theme: 'survivor',
    href: sectionHref('survivor'),
    follow: (event) => followSection(event, 'survivor'),
  },
];

function campaignProduct(campaign: CampaignSummary): Product {
  return {
    id: `competition:${campaign.id}`,
    name: campaign.name,
    description: campaign.description,
    category: campaign.kind === 'five' ? 'FANTASY COMPETITION' : 'PREDICTION COMPETITION',
    status: campaign.rehearsal
      ? 'Rehearsal'
      : campaign.state === 'open'
        ? 'Open'
        : campaign.state === 'live'
          ? 'Live'
          : 'Results pending',
    action: campaign.joined ? 'Your competition' : 'View competition',
    detail:
      BigInt(campaign.prizeTotalShannons) > 0n
        ? `${ckb(campaign.prizeTotalShannons)} CKB ${campaign.rehearsal ? 'test awards' : 'prize pool'}`
        : `${campaign.registeredCount.toLocaleString()} registered`,
    theme: 'competition',
    href: campaignHref(campaign.id),
    follow: (event) => followCampaign(event, campaign.id),
    banner: campaign.artwork?.banner?.url,
  };
}

function ProductCard({ item }: { item: Product }) {
  const [failedBanner, setFailedBanner] = useState<string>();
  useEffect(() => setFailedBanner(undefined), [item.banner]);
  return (
    <a
      className={`home-product home-product--${item.theme}`}
      href={item.href}
      onClick={item.follow}
      aria-label={`${item.name}: ${item.action}`}
    >
      <span className="home-product-art" aria-hidden="true">
        {item.theme === 'competition' ? (
          item.banner && failedBanner !== item.banner ? (
            <img
              src={item.banner}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFailedBanner(item.banner)}
            />
          ) : (
            <img src="/brand/on-form-icon-512.png" alt="" loading="lazy" decoding="async" />
          )
        ) : (
          <Icon
            name={item.theme === 'five' ? 'five' : item.theme === 'survivor' ? 'shield' : 'markets'}
          />
        )}
      </span>
      <span className="home-product-top">
        <span>{item.category}</span>
        <span className="home-product-status">{item.status}</span>
      </span>
      <div className="home-product-copy">
        <h3>{item.name}</h3>
        <p>{item.description}</p>
      </div>
      <span className="home-product-detail">{item.detail}</span>
      <span className="home-product-action">
        {item.action}
        <Icon name="arrow" />
      </span>
    </a>
  );
}

export function HomeProducts({
  campaigns,
  competitionsLoading,
  competitionsError,
  onRetryCompetitions,
}: HomeProductsProps) {
  const competitions = useMemo(
    () =>
      campaigns
        .filter((c) => ['open', 'live', 'finalizing'].includes(c.state))
        .map(campaignProduct),
    [campaigns],
  );
  return (
    <div className="home-discovery">
      <ProductCarousel kind="features" title="Explore Streak" items={games} />
      <ProductCarousel
        kind="competitions"
        title="Competitions"
        items={competitions}
        loading={competitionsLoading}
        error={competitionsError}
        onRetry={onRetryCompetitions}
      />
    </div>
  );
}

function ProductCarousel({
  kind,
  title,
  items,
  loading = false,
  error = false,
  onRetry,
}: {
  kind: 'features' | 'competitions';
  title: string;
  items: readonly Product[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const track = useRef<HTMLUListElement>(null);
  const headingId = useId(),
    trackId = useId();
  const [position, setPosition] = useState({ index: 0, start: true, end: false });
  const itemIds = items.map((item) => item.id).join('|');

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    // A newly loaded competition must not be hidden by native scroll anchoring.
    element.scrollTo({ left: 0, behavior: 'instant' });
    let frame = 0;
    const update = () => {
      frame = 0;
      const left = element.getBoundingClientRect().left;
      const cards = Array.from(element.children);
      const index = cards.reduce(
        (best, card, i) =>
          Math.abs(card.getBoundingClientRect().left - left) <
          Math.abs(cards[best].getBoundingClientRect().left - left)
            ? i
            : best,
        0,
      );
      const next = {
        index,
        start: element.scrollLeft <= 2,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      };
      setPosition((previous) =>
        previous.index === next.index && previous.start === next.start && previous.end === next.end
          ? previous
          : next,
      );
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(queue);
    observer.observe(element);
    element.addEventListener('scroll', queue, { passive: true });
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', queue);
      cancelAnimationFrame(frame);
    };
  }, [itemIds]);

  function show(index: number) {
    const element = track.current;
    const child = element?.children[Math.max(0, Math.min(items.length - 1, index))];
    if (!element || !child) return;
    element.scrollTo({
      left:
        element.scrollLeft +
        child.getBoundingClientRect().left -
        element.getBoundingClientRect().left,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  function keyboard(event: KeyboardEvent<HTMLUListElement>) {
    if (
      event.target !== event.currentTarget ||
      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    )
      return;
    event.preventDefault();
    show(
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : position.index + (event.key === 'ArrowRight' ? 1 : -1),
    );
  }
  return (
    <section
      className="home-products"
      data-home-carousel={kind}
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={headingId}
    >
      <header className="home-products-heading">
        <h2 id={headingId}>{title}</h2>
        <div className="home-products-controls">
          {kind === 'competitions' && (
            <a
              className="home-products-browse"
              href={campaignHref()}
              onClick={(event) => followCampaign(event)}
            >
              View all <Icon name="arrow" />
            </a>
          )}
          {items.length > 0 && (
            <>
              <span className="home-products-position" aria-live="polite" aria-atomic="true">
                {position.index + 1} / {items.length}
              </span>
              <button
                type="button"
                aria-label={kind === 'features' ? 'Previous feature' : 'Previous competition'}
                aria-controls={trackId}
                disabled={position.start}
                onClick={() => show(position.index - 1)}
              >
                <Icon name="chevron-up" />
              </button>
              <button
                type="button"
                aria-label={kind === 'features' ? 'Next feature' : 'Next competition'}
                aria-controls={trackId}
                disabled={position.end}
                onClick={() => show(position.index + 1)}
              >
                <Icon name="chevron-down" />
              </button>
            </>
          )}
        </div>
      </header>
      {items.length > 0 ? (
        <ul
          ref={track}
          id={trackId}
          className="home-products-track"
          tabIndex={0}
          aria-label={kind === 'features' ? 'Streak features' : 'Active competitions'}
          onKeyDown={keyboard}
        >
          {items.map((item) => (
            <li key={item.id} data-product-id={item.id}>
              <ProductCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="home-products-empty">
          {loading ? (
            <span role="status" className="home-products-feedback">
              <CellLoader />
              Loading competitions
            </span>
          ) : error ? (
            <span role="status" className="home-products-feedback">
              Competitions unavailable
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </span>
          ) : (
            <>
              <Trophy />
              <p>Watch out for competitions coming soon.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
