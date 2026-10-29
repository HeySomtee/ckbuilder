/* Keep existing shared links usable even if the new application bundle fails. */
(() => {
  // Select the application splash before body parsing, so landing routes never flash it.
  if (location.pathname === '/season' || location.pathname.startsWith('/season/'))
    document.documentElement.dataset.streakStartup = 'app';
  function openExistingRoute() {
    if (!['/', '/welcome', '/welcome/'].includes(location.pathname)) return;
    if (
      !/^#\/?(?:dashboard|markets|market|matchday|streak|portfolio|wallet|leaderboard|crews|fixtures|receipts|receipt)(?:\/|$)/.test(
        location.hash,
      )
    )
      return;
    document.documentElement.dataset.streakLegacyRedirect = 'true';
    location.replace(`/index.html${location.search}${location.hash}`);
  }
  window.addEventListener('hashchange', openExistingRoute);
  openExistingRoute();
})();
