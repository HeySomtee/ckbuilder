// Server-injected and captured once per document. URL parameters cannot select
// dummy data. The API rejects stale documents after an environment-mode change.
export const gamesDataMode =
  document.querySelector('meta[name="streak-games-data"]')?.getAttribute('content') === 'test'
    ? 'test'
    : 'api';
export function gamesPath(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}data=${gamesDataMode}`;
}
