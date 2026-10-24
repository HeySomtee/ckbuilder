import { useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
export type Section = 'overview' | 'five' | 'survivor' | 'matchday' | 'clubhouse';
const sections: readonly string[] = ['overview', 'five', 'survivor', 'matchday', 'clubhouse'];
const snapshot = (): Section | null => {
  const query = new URLSearchParams(location.search);
  if (query.has('direct') || query.has('market')) return null;
  const view = query.get('view');
  return view && sections.includes(view) ? (view as Section) : null;
};
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};
export const useSectionRoute = () => useSyncExternalStore(subscribe, snapshot);
export const sectionHref = (section: Section) => `/season/?view=${section}`;
export function followSection(event: MouseEvent<HTMLAnchorElement>, section: Section) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  history.pushState(null, '', sectionHref(section));
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
