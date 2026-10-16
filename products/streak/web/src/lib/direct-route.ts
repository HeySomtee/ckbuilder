import { useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';

const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
const snapshot = () => {
  const query = new URLSearchParams(location.search);
  const view = query.get('view');
  return view === 'wallet' || view === 'activity' ? view : query.get('direct');
};
export const useDirectRoute = () => useSyncExternalStore(subscribe, snapshot);
export const directHref = (marketId?: string) =>
  marketId ? `/season/?direct=${encodeURIComponent(marketId)}` : '/season/?view=wallet';
export const activityHref = '/season/?view=activity';
export function navigateActivity() {
  history.pushState(null, '', activityHref);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
export function followActivity(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigateActivity();
}
export function navigateDirect(marketId?: string) {
  history.pushState(null, '', directHref(marketId));
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
export function followDirect(event: MouseEvent<HTMLAnchorElement>, marketId?: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  navigateDirect(marketId);
}
