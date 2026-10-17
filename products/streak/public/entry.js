/* Keep existing shared links usable even if the new application bundle fails. */
(() => {
  function openExistingRoute() {
    if (!['/', '/welcome', '/welcome/'].includes(location.pathname)) return;
    if (!/^#\/?(?:dashboard|markets|market|matchday|streak|portfolio|wallet|leaderboard|crews|fixtures|receipts|receipt)(?:\/|$)/.test(location.hash)) return;
    document.documentElement.dataset.streakLegacyRedirect = 'true';
    location.replace(`/index.html${location.search}${location.hash}`);
  }
  window.addEventListener('hashchange', openExistingRoute);
  openExistingRoute();
})();
