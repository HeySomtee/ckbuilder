/* Keep existing shared links usable even if the new application bundle fails. */
(() => {
  // Select the application splash before body parsing, so landing routes never flash it.
  if (location.pathname === '/season' || location.pathname.startsWith('/season/'))
    document.documentElement.dataset.streakStartup = 'app';
  // Keep recovery independent of a stalled controller and CSS animation scheduling.
  // CSS still covers a missing entry script.
  const recoveryTimer = setTimeout(() => {
    if (document.documentElement.dataset.streakController === 'ready') return;
    const recovery = document.getElementById('streak-landing-recovery');
    if (!recovery) return;
    recovery.dataset.visible = 'true';
    const splash = document.getElementById('streak-startup');
    if (splash) splash.hidden = true;
  }, 10_000);
  document.addEventListener('streak:shell-ready', () => clearTimeout(recoveryTimer), {
    once: true,
  });
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
