import { useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';

const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
function selected(key: string): string | null {
  const value = new URLSearchParams(location.search).get(key);
  return value && /^[a-zA-Z0-9:_-]{1,120}$/.test(value) ? value : null;
}
export const useCampaignRoute = () => useSyncExternalStore(subscribe, () => selected('campaign'));
export const useFiveRoundRoute = () => useSyncExternalStore(subscribe, () => selected('round'));
export const campaignHref = (id: string | null = null) =>
  `/season/?view=competitions${id ? `&campaign=${encodeURIComponent(id)}` : ''}`;
function go(href: string) {
  history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
export const navigateCampaign = (id: string | null) => go(campaignHref(id));
export const openCampaignFive = (roundId: string) =>
  go(`/season/?view=five&round=${encodeURIComponent(roundId)}`);
export function followCampaign(event: MouseEvent<HTMLAnchorElement>, id: string | null = null) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateCampaign(id);
}
