import { useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
const snapshot = () => new URLSearchParams(location.search).get('market');
export const useMarketRoute = () => useSyncExternalStore(subscribe, snapshot);
export const marketHref = (id: string) => `/season/?market=${encodeURIComponent(id)}`;
export function navigateMarket(id: string | null) {
  const url = new URL(location.href);
  if (id === null) url.searchParams.delete('market');
  else url.searchParams.set('market', id);
  url.hash = '';
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
export function followMarket(event: MouseEvent<HTMLAnchorElement>, id: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigateMarket(id);
}
